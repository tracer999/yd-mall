const svc = require('../services/live/liveService');
const { sanitize } = require('../services/display/htmlSanitizer');
const { COMING_SOON } = require('../routes/feature');

/*
 * 쇼핑라이브 (고객) — SSR
 *
 * 설계: docs/사이트개선/live sales.md §6
 *
 * ── 준비중 랜딩 폴백 (중요) ──────────────────────────
 * `feature_menu.LIVE.module_ready` 는 **이미 1** 이라 GNB 에 '쇼핑라이브' 메뉴가 떠 있고,
 * 개발 DB 와 배포 서버 DB 가 같다. 발행된 라이브가 0건인 상태로 이 컨트롤러가 붙으면
 * 빈 목록이 그대로 노출된다. 그래서 0건이면 기존 준비중 랜딩으로 되돌린다.
 * (공동구매·이벤트·기획전이 전부 같은 방식이다)
 *
 * ── 구매 동선 ────────────────────────────────────────
 * 1차는 **바로구매만**이다(§2 결정 2). 이 몰의 `carts` 는 5컬럼이라
 * 라이브가·출처를 실을 수 없다. 장바구니는 2차다.
 * `/checkout?product_id=&quantity=&live_show_id=` 로 넘기면 checkoutController 가
 * 라이브가로 금액을 **다시 계산**한다. 이 화면의 가격은 표시용이다.
 *
 * ── 옵션 ─────────────────────────────────────────────
 * 이 몰에는 상품 옵션/SKU 테이블이 없다. 고객은 **수량만** 고른다.
 */

/** 준비중 랜딩. feature.js 의 comingSoon 과 같은 화면을 렌더한다. */
function renderComingSoon(res) {
    const feature = COMING_SOON.live;
    return res.render('user/coming_soon', {
        title: feature.name,
        feature,
        seo: Object.assign({}, res.locals.seo, {
            title: `${feature.name} (준비 중)`,
            description: String(feature.description).replace(/<[^>]*>/g, ' '),
            robots: 'noindex,follow',
        }),
    });
}

function siteMeta(res) {
    const siteSettings = res.locals.siteSettings || {};
    return {
        companyName: siteSettings.company_name || '와이디몰',
        domain: ((global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr').replace(/\/$/, ''),
    };
}

/** 상세로 되돌아갈 때 붙이는 오류 메시지 (§5 검증 실패) */
const LINE_ERRORS = {
    notfound: '판매 중인 상품을 찾을 수 없습니다.',
    closed: '지금은 구매할 수 없는 방송입니다.',
    disabled: '해당 상품은 현재 구매할 수 없습니다.',
    soldout: '품절된 상품입니다.',
    min: '최소 구매 수량보다 적습니다.',
    max: '최대 구매 수량을 초과했습니다.',
    stock: '재고가 부족합니다.',
};
exports.LINE_ERRORS = LINE_ERRORS;

/** GET /live — 목록 */
exports.getList = async (req, res, next) => {
    const mallId = req.mallId || 1;
    try {
        if (!(await svc.hasAnyPublic(mallId))) return renderComingSoon(res);

        const filter = svc.pick(svc.LIST_FILTERS, req.query.filter, 'all');
        const page = Math.max(Number(req.query.page) || 1, 1);

        const [list, onAir] = await Promise.all([
            svc.getPublicList(mallId, { filter, page }),
            // 필터가 걸려 있으면 히어로를 따로 띄우지 않는다(같은 카드가 두 번 보인다).
            filter === 'all' ? svc.getOnAir(mallId, 1) : Promise.resolve([]),
        ]);

        const meta = siteMeta(res);
        res.render('user/live/list', {
            title: '쇼핑라이브',
            lives: list.items,
            hero: onAir[0] || null,
            pagination: list,
            filters: svc.LIST_FILTERS,
            filter,
            seo: Object.assign({}, res.locals.seo, {
                title: `쇼핑라이브 | ${meta.companyName}`,
                description: '라이브 방송으로 상품을 보고 바로 구매하세요. 방송 한정 특가와 전용 쿠폰을 제공합니다.',
                canonical: `${meta.domain}/live`,
            }),
        });
    } catch (err) {
        next(err);
    }
};

/** GET /live/:slug — 상세 */
exports.getDetail = async (req, res, next) => {
    const mallId = req.mallId || 1;
    try {
        const live = await svc.getPublicBySlug(mallId, req.params.slug);
        // DRAFT·CANCELLED 는 getPublicBySlug 가 아예 돌려주지 않는다.
        if (!live) return next();

        // 종료 후 접근을 막아둔 방송은 목록으로 돌린다(404 보다 친절하다).
        if (live.status === 'ENDED' && live.ended_access_policy === 'DISALLOW') {
            return res.redirect('/live');
        }

        const userId = (req.user && req.user.id) || null;
        const [products, coupons, notices, related] = await Promise.all([
            svc.getProducts(live.id),
            svc.getCoupons(live.id, userId),
            svc.getNotices(live.id),
            svc.getRelated(mallId, live.id, 4),
        ]);

        svc.incrementViewCount(mallId, live.id); // 실패해도 화면은 떠야 한다 — await 하지 않는다

        const main = products.find(p => p.role === 'MAIN') || products[0] || null;
        const relatedProducts = products.filter(p => !main || p.id !== main.id);

        // 영상 아래 고정 박스 — 중요 공지만. 나머지는 공지 탭에서 본다.
        const pinnedNotices = notices.filter(n => n.display_location === 'UNDER_VIDEO');
        const panelNotices = notices.filter(n => n.display_location === 'BUY_PANEL');

        const meta = siteMeta(res);
        const errorKey = String(req.query.error || '');

        res.render('user/live/detail', {
            title: live.title,
            live,
            main,
            products,
            relatedProducts,
            coupons,
            notices,
            pinnedNotices,
            panelNotices,
            related,
            // 저장 시 새니타이즈했지만 렌더에서 한 번 더 통과시킨다(기존 관례).
            descriptionHtml: live.description ? sanitize(live.description) : '',
            noticeHtml: live.notice ? sanitize(live.notice) : '',
            lineError: LINE_ERRORS[errorKey] || null,
            isLoggedIn: Boolean(userId),
            seo: Object.assign({}, res.locals.seo, {
                title: `${live.title} | 쇼핑라이브`,
                description: live.summary || `${live.title} — 라이브 방송 중 특가로 만나보세요.`,
                canonical: `${meta.domain}/live/${encodeURIComponent(live.slug)}`,
                ogImage: live.og_image_url || live.pc_hero_image_url || live.list_thumbnail_url || undefined,
                // 검색 노출을 끈 방송은 색인하지 않는다.
                robots: live.search_visible ? undefined : 'noindex,follow',
            }),
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /live/:slug/buy — 바로구매 (§5)
 *
 * 여기서 결제하지 않는다. 구매 가능 여부만 확인하고 주문서로 넘긴다.
 * 최종 금액은 checkoutController 가 `svc.resolveLine()` 으로 다시 계산한다 —
 * 중복처럼 보이지만, 사용자가 주문서 URL 을 직접 두드릴 수 있으므로 양쪽 다 있어야 한다.
 */
exports.postBuy = async (req, res, next) => {
    const mallId = req.mallId || 1;
    const slug = String(req.params.slug);
    const back = `/live/${encodeURIComponent(slug)}`;
    try {
        const live = await svc.getPublicBySlug(mallId, slug);
        if (!live) return next();

        const line = await svc.resolveLine(mallId, live.id, req.body.product_id, req.body.quantity);
        if (!line.ok) return res.redirect(`${back}?error=${line.reason}`);

        const qs = new URLSearchParams({
            product_id: String(line.product.product_id),
            quantity: String(line.quantity),
            live_show_id: String(live.id),
        });
        res.redirect(`/checkout?${qs.toString()}`);
    } catch (err) {
        console.error('[live] postBuy:', err.message);
        next(err);
    }
};
