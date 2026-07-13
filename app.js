const path = require('path');
const fs = require('fs');
require('./config/env');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const { loadSystemSettingsAndApplyEnv } = require('./config/systemSettings');

const { createClient } = require('redis');
const { RedisStore } = require('connect-redis');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const BODY_LIMIT = process.env.BODY_LIMIT || '1mb';
const NODE_ENV = process.env.NODE_ENV || 'development';
// Trust reverse proxy headers (Nginx/ALB) for req.secure and real client IP.
app.set('trust proxy', 1);

// REDIS_HOST가 없거나 비어 있으면 Redis 사용 안 함 (의도적 Node.js 메모리 세션)
const useRedis = process.env.REDIS_HOST && String(process.env.REDIS_HOST).trim() !== '';

// 접속 로그 전용 파일 (logs/access.log에 직접 기록)
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
const accessLogPath = path.join(logsDir, 'access.log');
const accessLogStream = fs.createWriteStream(accessLogPath, { flags: 'a' });

function normalizeIp(rawIp) {
    if (!rawIp) return '-';
    if (rawIp.startsWith('::ffff:')) {
        return rawIp.substring(7);
    }
    if (rawIp === '::1') {
        return '127.0.0.1';
    }
    return rawIp;
}

process.on('uncaughtException', (err) => {
    console.error('uncaughtException:', err.message, err);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('unhandledRejection:', reason);
});

// Redis Client Setup (REDIS_HOST가 있을 때만 생성)
let redisClient = null;
if (useRedis) {
    redisClient = createClient({
        password: process.env.REDIS_PASSWORD,
        socket: {
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT || 6379,
            connectTimeout: 2000
        }
    });
    redisClient.on('error', (err) => {
        console.warn('Redis client error:', err.message);
    });
}

// Shopify Webhook raw body 저장 (HMAC 서명 검증에 필요)
// /shopify/webhooks 경로만 raw body를 req.rawBody에 저장
app.use((req, res, next) => {
    if (req.path === '/shopify/webhooks') {
        let chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            req.rawBody = Buffer.concat(chunks);
            next();
        });
    } else {
        next();
    }
});

// Middleware
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// 모노레포 상위 docs/ 폴더를 /docs 경로로 정적 서빙
// (예: https://dev-mall.ydata.co.kr/docs/develop/mall/shopify-setup-guide.html)
app.use('/docs', express.static(path.join(__dirname, '..', 'docs')));

// 테스트 서버 — 검색엔진 크롤링 전면 차단
app.use((req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
});

// EJS & Layouts
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main_layout'); // Default layout for user

async function startServer() {
    await loadSystemSettingsAndApplyEnv();

    /*
     * 카탈로그(feature_menu)에 있는데 몰별 행(mall_feature_menu)이 없는 메뉴를 채운다.
     * 행이 없으면 스토어프론트 INNER JOIN 에서 빠져 그 몰에 영영 안 나온다 —
     * 관리자 화면에는 보이는데 몰에는 없는 어긋남의 원인이었다.
     */
    try {
        const created = await require('./services/menu/featureMenuSync').ensureAllMalls();
        if (created > 0) console.log(`[menu] 몰별 메뉴 ${created}건 백필`);
    } catch (err) {
        // 메뉴 백필 실패가 기동을 막을 이유는 없다(기존 메뉴는 그대로 뜬다).
        console.error('[menu] 백필 실패:', err.message);
    }
    let sessionStore;
    const pm2Instance = process.env.NODE_APP_INSTANCE;

    if (!useRedis) {
        // REDIS_HOST 없/비어있음 → 의도적 Node.js 메모리 세션
        console.log('REDIS_HOST 미설정, Node.js 메모리 세션 사용');
        if (pm2Instance !== undefined) {
            console.warn('PM2 cluster detected without Redis session storage. Keep instances at 1 or configure Redis.');
        }
        sessionStore = undefined;
    } else {
        try {
            const connectPromise = redisClient.connect();
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Redis connection timeout')), 2000);
            });
            await Promise.race([connectPromise, timeoutPromise]);
            sessionStore = new RedisStore({ client: redisClient });
        } catch (err) {
            console.warn('redis 사용불가, nodejs에서 세션 관리 (' + err.message + ')');
            if (redisClient.isOpen) {
                redisClient.disconnect().catch(() => { });
            }
            sessionStore = undefined;
        }
    }

    // Session & Passport
    app.use(session({
        store: sessionStore, // if undefined, uses MemoryStore
        secret: process.env.SESSION_SECRET || 'secret',
        resave: false,
        saveUninitialized: false,
        cookie: {
            // 'auto': HTTPS(리버스 프록시, trust proxy)로 접속하면 Secure 쿠키,
            // http://localhost:3006 등 평문 접속에선 non-secure 쿠키로 발급 → 로컬에서도 로그인 동작.
            secure: NODE_ENV === 'production' ? 'auto' : false,
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 1 day
        }
    }));
    app.use(passport.initialize());
    app.use(passport.session());

    // Access logging → logs/pm2-access.log
    app.use((req, res, next) => {
        const start = Date.now();

        const xffHeader = req.headers['x-forwarded-for'] || '';
        const xff = Array.isArray(xffHeader) ? xffHeader.join(',') : xffHeader;
        const baseIp = xff
            ? xff.split(',')[0].trim()
            : (req.ip || req.socket.remoteAddress || '-');
        const realIp = normalizeIp(baseIp);

        let loginStatus = 'guest';
        let loginType = 'guest';
        let userId = '-';
        let email = '-';

        if (req.session && req.session.admin) {
            loginStatus = 'logged-in';
            loginType = 'admin';
            userId = req.session.admin.id || '-';
            email = req.session.admin.email || '-';
        } else if (req.isAuthenticated && req.isAuthenticated() && req.user) {
            loginStatus = 'logged-in';
            loginType = 'user';
            userId = req.user.id || '-';
            email = req.user.email || '-';
        }

        const ua = req.get('User-Agent') || '-';

        res.on('finish', () => {
            const duration = Date.now() - start;
            const line =
                `ACCESS method=${req.method} path=${req.originalUrl} status=${res.statusCode} duration=${duration}ms ` +
                `login=${loginStatus} type=${loginType} userId=${userId} email=${email} ip=${realIp} xff=${xff || '-'} ua="${ua}"\n`;
            accessLogStream.write(line);
        });

        next();
    });

    // Global Variables Middleware (for User/Admin info in views)
    const newArrival = require('./services/catalog/newArrival');
    app.use((req, res, next) => {
        res.locals.user = req.user || null;
        res.locals.path = req.path;
        // Admin check helper
        res.locals.isAdmin = req.isAuthenticated() && req.user.role === 'super';
        // 신상품 판정 헬퍼 — 카드/상세가 NEW 뱃지를 그릴지 판단한다. SQL 술어와 같은 규칙
        // (services/catalog/newArrival). 뷰마다 product_badge 를 직접 파싱하지 않게 한다.
        res.locals.isNewProduct = newArrival.isNewProduct;
        res.locals.isNewBrand = newArrival.isNewBrand;
        next();
    });

    // Mall Context (P5) — ?mall= / 세션 → req.mallId. 스토어프론트 미들웨어보다 먼저 와야 한다.
    app.use(require('./middleware/mallContext'));

    // Site Settings Middleware (Global)
    app.use(require('./middleware/siteSettings'));

    // Theme Middleware (P4) — 활성 테마의 스타일 토큰을 res.locals.theme 에 주입
    app.use(require('./middleware/themeData'));

    // Shopify 사용 여부 (A3) — res.locals.shopifyEnabled 로 Shopify UI 노출 제어
    app.use(require('./middleware/shopifyFlag'));

    // Visitor Logger Middleware (Global)
    app.use(require('./middleware/visitorLogger'));

    // Page View Logger Middleware (Global)
    app.use(require('./middleware/pageViewLogger'));

    // Global Menu Data Middleware (Theme Categories)
    app.use(require('./middleware/menuData'));

    // Cart Data Middleware (for header cart count)
    app.use(require('./middleware/cartData'));

    // 메뉴 쇼케이스 — GNB 메뉴 페이지 상단 캐러셀(상품 큐레이션 / 배너 슬라이드)
    app.use(require('./middleware/menuShowcase'));

    // SEO Defaults Middleware (canonical, robots, OG 기본값)
    app.use(require('./middleware/seoDefaults'));

    // Shopify Markets 컨텍스트 미들웨어 (세션 국가/언어 → res.locals.shopifyMarket)
    app.use(require('./middleware/shopifyContext'));

    // Passport Config
    require('./config/passport')(passport);

    // Routes
    const indexRoutes = require('./routes/index');
    const adminRoutes = require('./routes/admin');
    const authRoutes = require('./routes/auth');
    const mypageRoutes = require('./routes/mypage');
    const likesRoutes = require('./routes/likes');
    const boardRoutes = require('./routes/boards');
    const cartRoutes = require('./routes/cart');
    const checkoutRoutes = require('./routes/checkout');
    const manualRoutes = require('./routes/manual');
    const sitemapRoutes = require('./routes/sitemap');
    const shopifyRoutes = require('./routes/shopify');
    const featureRoutes = require('./routes/feature');
    const exhibitionRoutes = require('./routes/exhibition');
    const outletRoutes = require('./routes/outlet');
    const specialtyRoutes = require('./routes/specialty');
    const recommendRoutes = require('./routes/recommend');
    const eventRoutes = require('./routes/event');
    const groupBuyRoutes = require('./routes/group-buy');
const liveRoutes = require('./routes/live');
    const couponRoutes = require('./routes/coupon');
    const sectionRoutes = require('./routes/sections');
    const csRoutes = require('./routes/cs');
    const adminMenuMiddleware = require('./middleware/adminMenu');

    app.use('/shopify', shopifyRoutes);
    app.use('/', sitemapRoutes);
    // 기능 메뉴 표준 URL(/best, /new, /deal/today) — indexRoutes 의 '/' 핸들러보다 먼저 마운트
    app.use('/', featureRoutes);
    // 기획전 표준 URL(/exhibition) — feature_menu.EXHIBITION.default_path 와 1:1
    app.use('/exhibition', exhibitionRoutes);
    // 아울렛 표준 URL(/outlet) — 이월·리퍼브·전시·임박 상품의 상시 재고 소진 채널.
    // 상품이 0건이면 컨트롤러가 준비중 랜딩으로 폴백한다(빈 목록 노출 방지).
    app.use('/outlet', outletRoutes);
    // 전문관 표준 URL(/specialty) — 상시 운영 매장. exhibition 테이블 재사용(exhibition_type='SPECIALTY')
    app.use('/specialty', specialtyRoutes);
    // 추천 표준 URL(/recommend) — 개인화 + MD 큐레이션 랜딩
    app.use('/recommend', recommendRoutes);
    // 이벤트&혜택 표준 URL(/event) — feature_menu.EVENT.default_path 와 1:1
    app.use('/event', eventRoutes);
    // 공동구매 표준 URL(/group-buy) — feature_menu.GROUP_BUY.default_path 와 1:1
    app.use('/group-buy', groupBuyRoutes);
    // 쇼핑라이브 표준 URL(/live) — feature_menu.LIVE.default_path 와 1:1.
    // 외부 영상(YouTube/Vimeo) 임베드 + 라이브가 판매. 0건이면 준비중 랜딩으로 폴백한다.
    app.use('/live', liveRoutes);
    // 쿠폰존(/coupon) — 받는 곳. 보유 쿠폰함은 /mypage/coupons 다.
    app.use('/coupon', couponRoutes);
    // 스토어프론트 섹션 AJAX (CT-3 ranking_tabs 등)
    app.use('/sections', sectionRoutes);
    // 고객센터 (M8)
    app.use('/cs', csRoutes);
    app.use('/', indexRoutes);
    app.use('/auth', authRoutes);
    app.use('/likes', likesRoutes);
    app.use('/boards', boardRoutes);
    app.use('/mypage', mypageRoutes);
    // /admin 이하에서는 DB 기반 관리자 메뉴를 로드
    app.use('/admin', adminMenuMiddleware, adminRoutes);
    app.use('/cart', cartRoutes);
    app.use('/checkout', checkoutRoutes);
    app.use('/manual', manualRoutes);

    // 404 catch-all (매칭되는 라우트 없음)
    app.use((req, res, next) => {
        res.status(404).render('user/404', {
            title: '페이지를 찾을 수 없습니다',
            seo: { ...res.locals.seo, title: '페이지를 찾을 수 없습니다', robots: 'noindex,follow' }
        });
    });

    // Error logging
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        if (err && err.type === 'entity.too.large') {
            return res.status(413).send('Request Entity Too Large');
        }

        // 클라이언트 오류(잘못된 JSON 등)를 500으로 보고하면 원인 추적이 어렵고
        // 모니터링에 서버 장애로 잡힌다. body-parser 는 err.status 를 4xx 로 준다.
        const status = Number(err && (err.status || err.statusCode));
        if (status >= 400 && status < 500) {
            console.warn(`${req.method} ${req.originalUrl} - ${status} ${err.message}`);
            if (!res.headersSent) return res.status(status).send(err.expose ? err.message : 'Bad Request');
            return;
        }

        console.error(`${req.method} ${req.originalUrl} - ${err.message}`, err);
        if (!res.headersSent) {
            res.status(500).send('Internal Server Error');
        }
    });

    app.listen(PORT, HOST, () => {
        console.log(`Server running on http://${HOST}:${PORT}`);
    });
}

startServer();
