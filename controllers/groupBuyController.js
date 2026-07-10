const svc = require('../services/groupBuy/groupBuyService');
const { sanitize } = require('../services/display/htmlSanitizer');
const { COMING_SOON } = require('../routes/feature');

/*
 * 공동구매 (고객) — SSR
 *
 * 설계: docs/사이트개선/group_buy_design_and_development.md §2
 *
 * ── 준비중 랜딩 폴백 (중요) ──────────────────────────
 * `feature_menu.GROUP_BUY.module_ready` 는 이미 1 이라 GNB 에 "공동구매" 메뉴가 떠 있고,
 * 개발 DB 와 운영 DB 가 같다. 발행된 공동구매가 0건인 상태로 이 컨트롤러가 붙으면
 * 운영에 빈 목록이 노출된다. 그래서 0건이면 기존 준비중 랜딩으로 되돌린다.
 *
 * ── 구매 동선 ────────────────────────────────────────
 * 1차는 바로구매만이다(§13). `/checkout?product_id=&quantity=&group_buy_id=` 로 넘기면
 * checkoutController 가 공동구매가로 금액을 **다시 계산**한다. 이 화면의 가격은 표시용이다.
 * (장바구니는 carts 에 가격·옵션 컬럼이 없어 2차)
 */

/** 준비중 랜딩. feature.js 의 comingSoon 과 같은 화면을 렌더한다. */
function renderComingSoon(res) {
    const feature = COMING_SOON['group-buy'];
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

/** 상세로 되돌아갈 때 붙이는 오류 메시지 (§9-2 검증 실패) */
const LINE_ERRORS = {
    notfound: '판매 중인 상품을 찾을 수 없습니다.',
    closed: '지금은 구매할 수 없는 공동구매입니다.',
    disabled: '해당 상품은 현재 구매할 수 없습니다.',
    soldout: '품절된 상품입니다.',
    min: '최소 구매 수량보다 적습니다.',
    max: '최대 구매 수량을 초과했습니다.',
    stock: '재고가 부족합니다.',
};
exports.LINE_ERRORS = LINE_ERRORS;

/** GET /group-buy — 목록 (§2-1) */
exports.getList = async (req, res, next) => {
    const mallId = req.mallId || 1;
    try {
        if (!(await svc.hasAnyPublic(mallId))) return renderComingSoon(res);

        const phase = svc.values(svc.LIST_PHASES).includes(req.query.phase) ? req.query.phase : 'all';
        const sort = svc.values(svc.LIST_SORTS).includes(req.query.sort) ? req.query.sort : 'ending_soon';
        const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

        const result = await svc.getPublicList(mallId, { phase, sort, page, limit: 12 });

        const { companyName, domain } = siteMeta(res);
        res.render('user/group-buy/list', {
            title: '공동구매',
            groupBuys: result.items,
            pagination: result,
            phases: svc.LIST_PHASES,
            sorts: svc.LIST_SORTS,
            phase,
            sort,
            currentUser: req.user || null,
            seo: Object.assign({}, res.locals.seo, {
                title: `공동구매 | ${companyName}`,
                description: `${companyName} 공동구매 — 기간 한정 특가로 함께 구매하세요.`,
                url: `${domain}/group-buy`,
            }),
        });
    } catch (err) {
        console.error('[group-buy] getList:', err.message);
        next(err);
    }
};

/** GET /group-buy/view/:id → 301 → /group-buy/:slug (커스텀 메뉴가 숫자 id 를 들고 있을 때) */
exports.redirectToSlug = async (req, res, next) => {
    const mallId = req.mallId || 1;
    try {
        const slug = await svc.getPublicSlugById(mallId, req.params.id);
        if (!slug) return next(); // 404 핸들러로
        res.redirect(301, `/group-buy/${encodeURIComponent(slug)}`);
    } catch (err) {
        console.error('[group-buy] redirectToSlug:', err.message);
        next(err);
    }
};

/** GET /group-buy/:slug — 상세 (§2-3) */
exports.getDetail = async (req, res, next) => {
    const mallId = req.mallId || 1;
    try {
        const groupBuy = await svc.getPublicBySlug(mallId, req.params.slug);
        if (!groupBuy) return next(); // 발행되지 않았거나 없는 공동구매 → 404

        const [products, related] = await Promise.all([
            svc.getProducts(groupBuy.id),
            svc.getRelated(mallId, groupBuy.id, 4),
        ]);

        // 1차는 대표 상품 1개로 구매한다. getProducts 가 role='MAIN' 을 맨 앞에 둔다.
        const mainProduct = products[0] || null;

        svc.incrementViewCount(mallId, groupBuy.id); // 화면을 막지 않는다

        const { companyName, domain } = siteMeta(res);
        const ogImage = groupBuy.pc_hero_image_url || groupBuy.list_thumbnail_url
            || (mainProduct && mainProduct.main_image);

        const errorCode = String(req.query.error || '');
        res.render('user/group-buy/detail', {
            title: groupBuy.title,
            groupBuy,
            products,
            mainProduct,
            related,
            // 운영자 입력 HTML — 저장 시에 이어 렌더 시에도 통과시킨다(이중 방어)
            descriptionHtml: sanitize(groupBuy.description || ''),
            noticeHtml: sanitize(groupBuy.notice || ''),
            error: LINE_ERRORS[errorCode] || null,
            currentUser: req.user || null,
            seo: Object.assign({}, res.locals.seo, {
                title: `${groupBuy.title} | ${companyName}`,
                description: groupBuy.summary || `${companyName} ${groupBuy.title}`,
                url: `${domain}/group-buy/${encodeURIComponent(groupBuy.slug)}`,
                image: ogImage ? (ogImage.startsWith('http') ? ogImage : domain + ogImage) : res.locals.seo.image,
                type: 'website',
                // search_visible=0 이면 검색엔진에 색인시키지 않는다.
                robots: groupBuy.search_visible ? res.locals.seo.robots : 'noindex,nofollow',
            }),
        });
    } catch (err) {
        console.error('[group-buy] getDetail:', err.message);
        next(err);
    }
};

/**
 * POST /group-buy/:slug/buy — 바로구매 (§7-1 checkout)
 *
 * 여기서 결제하지 않는다. 서버가 구매 가능 여부만 먼저 확인하고 주문서로 넘긴다.
 * 최종 금액은 checkoutController 가 `svc.resolveLine()` 으로 다시 계산한다 —
 * 이 검증을 통과시켜 놓고 주문서에서 또 계산하는 게 중복처럼 보이지만,
 * 사용자가 주문서 URL 을 직접 두드릴 수 있으므로 양쪽 다 있어야 한다.
 */
exports.postBuy = async (req, res, next) => {
    const mallId = req.mallId || 1;
    const slug = String(req.params.slug);
    const back = `/group-buy/${encodeURIComponent(slug)}`;
    try {
        const groupBuy = await svc.getPublicBySlug(mallId, slug);
        if (!groupBuy) return next();

        const line = await svc.resolveLine(mallId, groupBuy.id, req.body.product_id, req.body.quantity);
        if (!line.ok) return res.redirect(`${back}?error=${line.reason}`);

        const qs = new URLSearchParams({
            product_id: String(line.product.product_id),
            quantity: String(line.quantity),
            group_buy_id: String(groupBuy.id),
        });
        res.redirect(`/checkout?${qs.toString()}`);
    } catch (err) {
        console.error('[group-buy] postBuy:', err.message);
        next(err);
    }
};
