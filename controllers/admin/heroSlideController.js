const pool = require('../../config/db');
const { sellableStockSql } = require('../../services/catalog/sellableStock');
const upload = require('../../middleware/upload');
const displayService = require('../../services/display/displayService');
const bestRankingService = require('../../services/best/bestRankingService');
// 자동 베스트 상한 등 규칙을 리졸버와 공유한다 — 값이 갈리면 이 화면의 안내가 거짓말이 된다.
const themeHeroResolver = require('../../services/display/resolvers/theme_hero');

/*
 * 메인 슬라이더 관리 — 홈 히어로 영역 하나를 두 가지 방식 중 하나로 채운다.
 *
 * 프론트(mainController.buildHomeContext + partials/sections/hero.ejs)는
 * site_settings.hero_variant 값에 따라 **둘 중 하나만** 렌더한다.
 *
 *   product_showcase → hero_slide 테이블. 상품과 연결된 쇼케이스 슬라이드.
 *                      slot=MAIN(중앙 슬라이더) · slot=FEATURE(우측 카드).
 *                      label/headline/image_url/link_url 이 비면 상품 정보로 폴백(hero_showcase.ejs).
 *   full_banner      → banners 테이블의 banner_type='MAIN' 이미지 배너 슬라이드(hero_banner.ejs).
 *                      mobile_image_url 을 쓰는 유일한 경로.
 *
 * 예전에는 이 둘이 별도 탭('메인 슬라이더' / '메인 배너(레거시)')이었고 hero_variant 를 바꿀 UI 가
 * 아예 없어서, full_banner 쪽 배너를 등록해도 프론트에 나올 방법이 없었다. 이제 한 화면에서
 * 방식을 고르고(=hero_variant 저장) 그 방식의 콘텐츠를 편집한다.
 *
 * /admin/banners/hero-slides 하위로 마운트되어 배너 관리와 동일한 RBAC 를 상속한다.
 */

const SLOTS = ['MAIN', 'FEATURE'];
/*
 * 슬롯별 상품 수 상한 — 리졸버가 실제로 렌더하는 개수와 같아야 한다.
 * 넘겨 저장하면 "등록은 됐는데 화면에 없다"가 된다.
 *   MAIN    theme_hero.MAX_MAIN_SLIDES 만큼 슬라이드
 *   FEATURE 리졸버가 LIMIT 1 로 한 장만 쓴다(우측 고정 카드)
 */
const MAX_MAIN_SLIDES = themeHeroResolver.MAX_MAIN_SLIDES;
const SLOT_CAP = { MAIN: MAX_MAIN_SLIDES, FEATURE: 1 };
const VARIANTS = ['product_showcase', 'full_banner'];
// 프론트 폴백과 같은 값이어야 한다 — mainController 는 `hero_variant || 'full_banner'`.
// 어긋나면 이 화면의 '적용 중' 뱃지가 실제 노출과 다른 방식을 가리킨다.
const DEFAULT_VARIANT = 'full_banner';

/*
 * 이 몰에 적용 중인 히어로 방식.
 * middleware/siteSettings 와 같은 폴백을 쓴다 — 몰 행이 없으면 기본몰(1) 행의 브랜딩이 적용되므로,
 * 여기서도 기본몰 행을 읽어야 프론트가 실제로 렌더하는 방식과 일치한다.
 */
async function getActiveVariant(mallId) {
    const [rows] = await pool.query(
        `SELECT hero_variant FROM site_settings
         WHERE mall_id IN (?, 1) ORDER BY (mall_id = ?) DESC LIMIT 1`,
        [mallId, mallId]
    );
    const v = rows[0] && rows[0].hero_variant;
    return VARIANTS.includes(v) ? v : DEFAULT_VARIANT;
}

// 마퀴 흐름 속도 허용 범위 — 리졸버(theme_hero.js)와 반드시 같은 값이어야 어긋나지 않는다.
const MARQUEE_SPEED_MIN = 5;
const MARQUEE_SPEED_MAX = 120;
const MARQUEE_SPEED_DEFAULT = 28;
const MARQUEE_TEXT_DEFAULT = '전 상품 무료배송\n신규 회원 15% 쿠폰\n당일 출고';

/* 에디토리얼 히어로 하단 흐름문구(마퀴) 값. getActiveVariant 와 같은 몰 폴백 규칙. */
async function getMarquee(mallId) {
    const [rows] = await pool.query(
        `SELECT marquee_enabled, marquee_text, marquee_speed FROM site_settings
         WHERE mall_id IN (?, 1) ORDER BY (mall_id = ?) DESC LIMIT 1`,
        [mallId, mallId]
    );
    const r = rows[0] || {};
    const spd = Number(r.marquee_speed);
    return {
        enabled: Number(r.marquee_enabled) !== 0,
        // 빈 값이면 편집칸에 코드 기본값을 보여줘, 무엇이 노출되는지 관리자가 바로 알 수 있게 한다.
        text: (r.marquee_text != null && String(r.marquee_text).trim()) ? String(r.marquee_text) : MARQUEE_TEXT_DEFAULT,
        speed: (Number.isFinite(spd) && spd >= MARQUEE_SPEED_MIN && spd <= MARQUEE_SPEED_MAX) ? spd : MARQUEE_SPEED_DEFAULT,
    };
}

/*
 * 수동 선택이 없을 때 자동으로 채워질 베스트 상품 수(상한 AUTO_MAIN_COUNT).
 * 리졸버와 같은 소스(best_ranking)를 세어야 화면 안내가 실제 노출과 어긋나지 않는다.
 */
async function countAutoBest(mallId) {
    try {
        const [[group]] = await pool.query(
            `SELECT id FROM best_group
              WHERE mall_id = ? AND is_active = 1 AND group_type = 'ALL'
              ORDER BY sort_order, id LIMIT 1`,
            [mallId]
        );
        if (!group) return 0;
        const { products } = await bestRankingService.getRanking({
            mallId, groupId: group.id, period: 'DAILY',
            limit: themeHeroResolver.AUTO_MAIN_COUNT,
        });
        return (products || []).length;
    } catch (err) {
        console.error('[heroSlide] countAutoBest:', err.message);
        return 0;
    }
}

exports.getList = async (req, res) => {
    try {
        const mallId = req.adminMallId || 1;
        /*
         * 배치(테마)와 콘텐츠(이 화면)는 서로 독립이다.
         *   배치  page_section.config_json.layout — 페이지 빌더 > 테마 관리 소관. 여기선 읽기만.
         *   콘텐츠 site_settings.hero_variant     — 이 화면이 정한다.
         * 예전엔 theme_hero 면 무조건 product_showcase 로 뭉개서, 다른 방식을 편집할 수 없었다.
         */
        const heroSection = await displayService.getHomeHeroSection(mallId);
        const themeLayout = heroSection ? heroSection.layout : null;
        const activeVariant = await getActiveVariant(mallId);
        // 적용 중이 아닌 방식도 미리 채워둘 수 있게 ?mode= 로 열람 방식을 따로 둔다.
        const mode = VARIANTS.includes(req.query.mode) ? req.query.mode : activeVariant;

        const [slides] = await pool.query(`
            SELECT hs.*, p.name AS product_name, p.main_image, p.price, p.status AS product_status
            FROM hero_slide hs
            LEFT JOIN products p ON p.id = hs.product_id
            WHERE hs.mall_id = ?
            ORDER BY hs.slot ASC, hs.sort_order ASC, hs.id ASC
        `, [mallId]);

        // full_banner 방식의 소스 — 메뉴별 배너(group_key='menu:%')는 다른 화면 소관이라 제외한다.
        const [mainBanners] = await pool.query(`
            SELECT * FROM banners
            WHERE banner_type = 'MAIN' AND mall_id = ?
              AND (group_key IS NULL OR group_key NOT LIKE 'menu:%')
            ORDER BY display_order ASC, id ASC
        `, [mallId]);

        // 풀블리드 히어로 하단 흐름문구(마퀴) — theme_hero 리졸버와 같은 소스·폴백을 읽는다.
        const marquee = await getMarquee(mallId);

        const mainSlides = slides.filter(s => s.slot === 'MAIN');
        const featureSlides = slides.filter(s => s.slot === 'FEATURE');
        /*
         * 안내 문구는 **실제 노출 기준**으로 판정해야 한다.
         * 목록은 꺼둔 슬라이드까지 보여주지만(운영자가 다시 켤 수 있어야 하므로), 스토어프론트는
         * is_active=1 만 렌더한다. 전체 개수로 판정하면 "5건 있는데 홈이 비어 있다"를 놓친다.
         */
        const activeMainCount = mainSlides.filter(s => Number(s.is_active) === 1).length;
        /*
         * 수동 선택이 없을 때 자동으로 채워질 베스트 상품 수.
         * 0 이면 히어로가 아예 안 뜨므로 화면에서 "상품을 선택해 주세요"로 안내해야 한다
         * (스토어프론트는 빈 영역을 남기지 않고 섹션을 통째로 스킵한다).
         */
        const autoBestCount = activeMainCount === 0 ? await countAutoBest(mallId) : 0;

        res.render('admin/banners/hero-slides/list', {
            layout: 'layouts/admin_layout',
            title: '메인 슬라이더 관리',
            themeLayout,
            activeVariant,
            mode,
            slides,
            mainSlides,
            activeMainCount,
            featureSlides,
            mainBanners,
            marquee,
            autoBestCount,
            autoMaxCount: themeHeroResolver.AUTO_MAIN_COUNT,
            slotCap: SLOT_CAP,
            // 슬롯별로 앞으로 몇 건 더 담을 수 있는지(꺼둔 슬라이드도 자리를 차지한다).
            slotRoom: {
                MAIN: Math.max(0, SLOT_CAP.MAIN - mainSlides.length),
                FEATURE: Math.max(0, SLOT_CAP.FEATURE - featureSlides.length),
            },
            saved: req.query.saved === '1',
            // 상한을 넘겨 빠진 건수 — 조용히 버리면 "왜 일부만 담겼지"가 된다.
            skippedFull: Number(req.query.full) || 0,
            skippedSlot: SLOTS.includes(req.query.fullSlot) ? req.query.fullSlot : 'MAIN',
            marqueeSaved: req.query.marquee === '1'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

/*
 * GET /admin/banners/hero-slides/product-search — 쇼케이스에 넣을 상품 후보.
 *
 * productGroupController.getProductSearch 와 같은 규약(응답 { products, limited }).
 * 이 몰 상품만, 이미 슬라이드로 등록된 상품은 후보에서 뺀다(중복 등록 방지).
 */
exports.getProductSearch = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const q = String(req.query.q || '').trim();
        const where = ['p.mall_id = ?'];
        const params = [mallId];

        if (q) { where.push('(p.name LIKE ? OR p.product_code LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
        // 이미 이 몰의 히어로 슬라이드에 물린 상품은 제외
        where.push(`p.id NOT IN (
            SELECT product_id FROM hero_slide WHERE mall_id = ? AND product_id IS NOT NULL
        )`);
        params.push(mallId);

        const [products] = await pool.query(`
            SELECT p.id, p.name, p.product_code, p.main_image, p.price, ${sellableStockSql('p')} AS stock, p.status
              FROM products p
             WHERE ${where.join(' AND ')}
             ORDER BY p.created_at DESC
             LIMIT 50
        `, params);

        res.json({ products, limited: products.length >= 50 });
    } catch (err) {
        console.error('[heroSlide] getProductSearch:', err.message);
        res.status(500).json({ products: [] });
    }
};

/*
 * POST /admin/banners/hero-slides/products — 고른 상품들을 한 번에 슬라이드로 추가.
 *
 * 상품 ID 를 외워 한 건씩 등록하던 방식을 대체한다. 라벨·헤드라인·이미지는 비워 두고
 * 상품 정보로 자동 표시되게 한다(필요하면 개별 수정에서 덮어쓴다).
 */
exports.postAddProducts = async (req, res) => {
    const mallId = req.adminMallId || 1;
    // 담을 영역. 모르는 값은 중앙 슬라이더로 본다(예전 요청 호환).
    const slot = SLOTS.includes(req.body.slot) ? req.body.slot : 'MAIN';
    const ids = [].concat(req.body.product_ids || [])
        .map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return res.redirect('/admin/banners/hero-slides?mode=product_showcase');

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        // 남의 몰 상품을 슬라이드로 걸 수 없게 소속을 확인한다.
        const [owned] = await conn.query(
            'SELECT id FROM products WHERE mall_id = ? AND id IN (?)', [mallId, ids]);
        let ownedIds = owned.map((r) => r.id);

        /*
         * 슬롯 상한을 넘겨 담지 못하게 한다.
         * 넘겨 저장해도 리졸버가 앞에서 잘라 렌더하므로, 등록은 됐는데 안 보이는 상태가 된다.
         * 여기서 막고 몇 건이 빠졌는지 화면에 알린다.
         */
        const [[{ cur }]] = await conn.query(
            'SELECT COUNT(*) AS cur FROM hero_slide WHERE mall_id = ? AND slot = ?', [mallId, slot]);
        const room = Math.max(0, (SLOT_CAP[slot] || 1) - Number(cur));
        const skipped = Math.max(0, ownedIds.length - room);
        ownedIds = ownedIds.slice(0, room);

        const [[{ maxOrder }]] = await conn.query(
            'SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM hero_slide WHERE mall_id = ? AND slot = ?',
            [mallId, slot]
        );
        let order = Number(maxOrder) || 0;
        for (const pid of ownedIds) {
            order += 1;
            await conn.query(`
                INSERT INTO hero_slide (mall_id, slot, product_id, sort_order, is_active)
                VALUES (?, ?, ?, ?, 1)
            `, [mallId, slot, pid, order]);
        }
        await conn.commit();
        // 어느 영역이 넘쳤는지 함께 알린다 — 영역이 둘이라 건수만으론 어디인지 모른다.
        const q = skipped > 0 ? `&full=${skipped}&fullSlot=${slot}` : '&saved=1';
        res.redirect(`/admin/banners/hero-slides?mode=product_showcase${q}`);
    } catch (err) {
        await conn.rollback();
        console.error('[heroSlide] postAddProducts:', err.message);
        res.status(500).send(`Hero slide add failed${err.code ? `: ${err.code}` : ''}`);
    } finally {
        conn.release();
    }
};

/** 히어로 방식 전환 — site_settings.hero_variant 를 바꾼다. 프론트는 매 요청 DB 를 읽으므로 즉시 반영된다. */
exports.postVariant = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const variant = req.body.hero_variant;
    // 모르는 값을 기본값으로 뭉개면 잘못된 요청 하나가 조용히 홈 히어로를 바꿔버린다. 거부한다.
    if (!VARIANTS.includes(variant)) {
        return res.status(400).send('알 수 없는 히어로 방식입니다.');
    }
    try {
        const [result] = await pool.query(
            'UPDATE site_settings SET hero_variant = ? WHERE mall_id = ?', [variant, mallId]
        );
        if (result.affectedRows === 0) {
            // 이 몰의 브랜딩 행이 없다 — 여기서 hero_variant 만 든 행을 만들면 siteSettings 미들웨어의
            // '기본몰 폴백'이 끊겨 회사명·로고·색상이 전부 빈 값이 된다. 행 생성은 사이트 설정 소관이다.
            return res.status(409).send(
                '이 몰의 사이트 설정이 아직 없습니다. 사이트 설정(/admin/settings)에서 먼저 저장한 뒤 다시 시도해 주세요.'
            );
        }
        res.redirect(`/admin/banners/hero-slides?mode=${variant}`);
    } catch (err) {
        console.error(err);
        res.status(500).send(`Hero variant update failed${err.code ? `: ${err.code}` : ''}`);
    }
};

/*
 * POST /admin/banners/hero-slides/marquee — 에디토리얼 히어로 하단 흐름문구(마퀴) 저장.
 * site_settings 에 바로 쓴다(발행 스냅샷을 안 거치므로 프론트 즉시 반영).
 * postVariant 와 같은 제약: 이 몰의 site_settings 행이 없으면 만들지 않고 409 로 거부한다
 * (행을 새로 만들면 siteSettings 미들웨어의 '기본몰 폴백'이 끊겨 브랜딩이 빈 값이 된다).
 */
exports.postMarquee = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const enabled = String(req.body.marquee_enabled) === '1' ? 1 : 0;
    // 빈 문자열이면 NULL 로 저장 → 리졸버가 코드 기본값으로 폴백한다.
    const rawText = (req.body.marquee_text != null && String(req.body.marquee_text).trim())
        ? String(req.body.marquee_text) : null;
    const spdIn = Number(req.body.marquee_speed);
    const speed = (Number.isFinite(spdIn) && spdIn >= MARQUEE_SPEED_MIN && spdIn <= MARQUEE_SPEED_MAX)
        ? Math.round(spdIn) : MARQUEE_SPEED_DEFAULT;

    try {
        const [result] = await pool.query(
            'UPDATE site_settings SET marquee_enabled = ?, marquee_text = ?, marquee_speed = ? WHERE mall_id = ?',
            [enabled, rawText, speed, mallId]
        );
        if (result.affectedRows === 0) {
            return res.status(409).send(
                '이 몰의 사이트 설정이 아직 없습니다. 사이트 설정(/admin/settings)에서 먼저 저장한 뒤 다시 시도해 주세요.'
            );
        }
        res.redirect('/admin/banners/hero-slides?marquee=1');
    } catch (err) {
        console.error(err);
        res.status(500).send(`Marquee update failed${err.code ? `: ${err.code}` : ''}`);
    }
};

/*
 * POST /admin/banners/hero-slides/banners — 이미지 배너 슬라이드의 순서·노출 일괄 저장.
 *
 * 목록에서 바로 정하게 한다. 배너마다 수정 폼에 들어갔다 나오면 순서를 맞추기가 어렵다
 * (홈에는 display_order 순으로 앞에서 6개만 나간다 — 무엇이 잘리는지 목록에서 보여야 한다).
 *
 * body: id=3&id=5 …, order[b<id>]=1, active[b<id>]=1(체크된 것만)
 *
 * ⚠️ 키를 `order[25]` 처럼 **숫자**로 두면 안 된다 — qs(express urlencoded extended)가 이를 배열
 *    인덱스로 보고 `["3","4"]` 로 압축해, id 로 값을 찾지 못한다(전 배너가 0/비노출로 저장됐다).
 *    그래서 `b` 접두어를 붙여 객체 키로 강제한다.
 *
 * mall_id 조건을 반드시 건다 — 없으면 남의 몰 배너 id 를 넣어 순서·노출을 바꿀 수 있다.
 */
exports.postBannerOrder = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const ids = [].concat(req.body.id || []).map(Number).filter(n => Number.isInteger(n) && n > 0);
    const orders = req.body.order || {};
    const actives = req.body.active || {};

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        for (const id of ids) {
            await conn.query(
                `UPDATE banners SET display_order = ?, is_active = ?
                  WHERE id = ? AND mall_id = ? AND banner_type = 'MAIN'
                    AND (group_key IS NULL OR group_key NOT LIKE 'menu:%')`,
                [Number(orders['b' + id]) || 0, String(actives['b' + id]) === '1' ? 1 : 0, id, mallId],
            );
        }
        await conn.commit();
        res.redirect('/admin/banners/hero-slides?mode=full_banner&saved=1');
    } catch (err) {
        await conn.rollback();
        console.error('[heroSlide] postBannerOrder:', err.message);
        res.status(500).send('Server Error');
    } finally {
        conn.release();
    }
};

exports.getAdd = async (req, res) => {
    try {
        const slot = SLOTS.includes(req.query.slot) ? req.query.slot : 'MAIN';
        res.render('admin/banners/hero-slides/form', {
            layout: 'layouts/admin_layout',
            title: '슬라이드 등록',
            slide: null,
            currentSlot: slot,
            maxUploadFileMb: upload.MAX_UPLOAD_FILE_MB,
            maxVideoUploadMb: upload.MAX_VIDEO_UPLOAD_MB
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

/*
 * 슬라이드 종류(폼의 slide_kind) → product_id.
 *
 * 상품배너 = 상품 연결, 일반배너 = 상품 없이 이미지·문구만(product_id NULL).
 * 종류를 명시적으로 'plain' 으로 보냈으면 상품 칸에 값이 남아 있어도 무조건 NULL 로 만든다 —
 * 브라우저에서 칸을 감추기만 하면 JS 가 막힌 환경에서 예전 상품이 그대로 붙어 저장된다.
 * slide_kind 가 없는 예전 폼·외부 요청은 값 유무로 판단(기존 동작 유지).
 */
function resolveProductId(slideKind, rawProductId) {
    if (slideKind === 'plain') return null;
    return rawProductId ? Number(rawProductId) || null : null;
}

/*
 * ── 미디어(이미지·동영상) 입력 처리 ───────────────────────────────────────────
 *
 * 한 칸을 채우는 방법이 세 가지고, 우선순위가 있다.
 *   1) 이번에 올린 파일        (req.files[field])        — 가장 강함
 *   2) URL 가져오기로 저장된 경로 (req.body[field_url])   — url-upload.js 가 hidden 에 채움
 *   3) 기존 값                 (req.body[existing_field]) — 수정 화면에서 안 건드린 경우
 * 셋 다 없으면 null(= 비우기).
 *
 * 파일·URL 모두 public/uploads/hero 에 떨어지므로 경로 형태가 같다.
 */
const HERO_WEB_DIR = upload.HERO_SLIDE_WEB_DIR || '/uploads/hero';

/** 업로드된 경로만 허용 — 외부 URL 이나 상대경로 탈출을 hidden 조작으로 밀어넣지 못하게. */
function safeUploadPath(value) {
    const s = String(value || '').trim();
    if (!s) return null;
    if (!s.startsWith('/uploads/') && !s.startsWith('/images/')) return null;
    if (s.includes('..')) return null;
    return s.slice(0, 500);
}

/**
 * 미디어 한 칸의 최종 값을 정한다.
 * @param {object} req
 * @param {string} field  파일 input name (예: 'slide_video_mp4')
 */
function resolveMediaField(req, field) {
    const uploaded = req.files?.[field]?.[0];
    if (uploaded) return `${HERO_WEB_DIR}/${uploaded.filename}`;

    const fromUrl = safeUploadPath(req.body[`${field}_url`]);
    if (fromUrl) return fromUrl;

    // '비우기' 체크 — 새 파일·URL 을 주지 않았을 때만 적용한다(새로 올린 게 이긴다).
    if (req.body[`clear_${field}`]) return null;

    return safeUploadPath(req.body[`existing_${field}`]);
}

/** hero_slide 의 media_type enum. 폼은 IMAGE/VIDEO 만 쓴다(임베드는 아직 화면이 없다). */
const MEDIA_TYPES = ['IMAGE', 'VIDEO'];

/**
 * 폼 입력 → hero_slide 미디어 컬럼 묶음.
 *
 * media_type=IMAGE 면 동영상 컬럼을 **전부 null 로 비운다**. 안 그러면 영상으로 저장했다가
 * 이미지로 되돌린 슬라이드에 video_*_url 이 남아, 렌더러(hero_media.ejs)가 media_type 만
 * 보고 이미지로 그리는데 DB 에는 쓰이지 않는 영상 경로가 계속 남는다.
 */
function resolveMedia(req) {
    const mediaType = MEDIA_TYPES.includes(req.body.media_type) ? req.body.media_type : 'IMAGE';
    const imageUrl = resolveMediaField(req, 'slide_image');

    if (mediaType !== 'VIDEO') {
        return {
            media_type: 'IMAGE',
            image_url: imageUrl,
            poster_url: null,
            video_webm_url: null,
            video_mp4_url: null,
            mobile_video_webm_url: null,
            mobile_video_mp4_url: null,
        };
    }

    return {
        media_type: 'VIDEO',
        image_url: imageUrl,
        poster_url: resolveMediaField(req, 'slide_poster'),
        video_webm_url: resolveMediaField(req, 'slide_video_webm'),
        video_mp4_url: resolveMediaField(req, 'slide_video_mp4'),
        mobile_video_webm_url: resolveMediaField(req, 'slide_mobile_video_webm'),
        mobile_video_mp4_url: resolveMediaField(req, 'slide_mobile_video_mp4'),
    };
}

exports.postAdd = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const { slot, product_id, label, headline, link_url, sort_order, is_active } = req.body;
    const media = resolveMedia(req);

    const safeSlot = SLOTS.includes(slot) ? slot : 'MAIN';
    const productId = resolveProductId(req.body.slide_kind, product_id);

    try {
        await pool.query(`
            INSERT INTO hero_slide
              (mall_id, slot, product_id, label, headline, media_type, image_url, poster_url,
               video_webm_url, video_mp4_url, mobile_video_webm_url, mobile_video_mp4_url,
               link_url, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            mallId,
            safeSlot,
            productId,
            label || null,
            headline || null,
            media.media_type,
            media.image_url,
            media.poster_url,
            media.video_webm_url,
            media.video_mp4_url,
            media.mobile_video_webm_url,
            media.mobile_video_mp4_url,
            link_url || null,
            Number(sort_order) || 0,
            is_active ? 1 : 0
        ]);
        res.redirect('/admin/banners/hero-slides?mode=product_showcase');
    } catch (err) {
        console.error(err);
        res.status(500).send(`Hero slide save failed${err.code ? `: ${err.code}` : ''}`);
    }
};

exports.getEdit = async (req, res) => {
    try {
        const mallId = req.adminMallId || 1;
        const { id } = req.params;
        const [rows] = await pool.query(`
            SELECT hs.*, p.name AS product_name, p.main_image
            FROM hero_slide hs
            LEFT JOIN products p ON p.id = hs.product_id
            WHERE hs.id = ? AND hs.mall_id = ?
        `, [id, mallId]);

        if (rows.length === 0) return res.redirect('/admin/banners/hero-slides?mode=product_showcase');

        res.render('admin/banners/hero-slides/form', {
            layout: 'layouts/admin_layout',
            title: '슬라이드 수정',
            slide: rows[0],
            currentSlot: rows[0].slot,
            maxUploadFileMb: upload.MAX_UPLOAD_FILE_MB,
            maxVideoUploadMb: upload.MAX_VIDEO_UPLOAD_MB
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postEdit = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const { id } = req.params;
    const { slot, product_id, label, headline, link_url, sort_order, is_active } = req.body;
    const media = resolveMedia(req);

    const safeSlot = SLOTS.includes(slot) ? slot : 'MAIN';
    const productId = resolveProductId(req.body.slide_kind, product_id);

    try {
        await pool.query(`
            UPDATE hero_slide SET
              slot=?, product_id=?, label=?, headline=?, media_type=?, image_url=?, poster_url=?,
              video_webm_url=?, video_mp4_url=?, mobile_video_webm_url=?, mobile_video_mp4_url=?,
              link_url=?, sort_order=?, is_active=?
            WHERE id=? AND mall_id=?
        `, [
            safeSlot,
            productId,
            label || null,
            headline || null,
            media.media_type,
            media.image_url,
            media.poster_url,
            media.video_webm_url,
            media.video_mp4_url,
            media.mobile_video_webm_url,
            media.mobile_video_mp4_url,
            link_url || null,
            Number(sort_order) || 0,
            is_active ? 1 : 0,
            id,
            mallId
        ]);
        res.redirect('/admin/banners/hero-slides?mode=product_showcase');
    } catch (err) {
        console.error(err);
        res.status(500).send(`Hero slide update failed${err.code ? `: ${err.code}` : ''}`);
    }
};

exports.postDelete = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const { id } = req.body;
    try {
        await pool.query('DELETE FROM hero_slide WHERE id = ? AND mall_id = ?', [id, mallId]);
        res.redirect('/admin/banners/hero-slides?mode=product_showcase');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
