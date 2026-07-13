const svc = require('../services/outlet/outletService');
const { sanitize } = require('../services/display/htmlSanitizer');
const { COMING_SOON } = require('../routes/feature');

/*
 * 아울렛 (고객) — SSR
 *
 * 설계: docs/사이트개선/outlet_design_and_development.md
 *
 * ── 준비중 랜딩 폴백 (중요) ──────────────────────────
 * feature_menu.OUTLET.module_ready 는 이미 1 이고, 로컬과 서버가 같은 DB 를 본다.
 * 아울렛 상품이 0건인 상태로 이 컨트롤러가 붙으면 빈 목록이 그대로 노출된다.
 * 그래서 0건이면 기존 준비중 랜딩으로 되돌린다(기획전과 같은 방식).
 *
 * navigationService 의 콘텐츠 게이트가 GNB 에서 메뉴를 빼주지만,
 * 직접 URL 로 들어오는 경로는 여기서 막아야 한다.
 *
 * ── 탐색 축 ─────────────────────────────────────────
 * 아울렛 사용자는 '무엇'보다 '얼마나 싼가'로 움직인다(설계서 §4-4).
 * 그래서 기본 정렬이 최신순이 아니라 **할인율 높은 순**이고,
 * 필터가 카테고리 + 할인 사유 + 가격대 세 축이다.
 */

const PRICE_BANDS = [
    { code: '10000', label: '1만원 이하', max: 10000 },
    { code: '30000', label: '3만원 이하', max: 30000 },
    { code: '50000', label: '5만원 이하', max: 50000 },
    { code: '100000', label: '10만원 이하', max: 100000 },
];

const SORT_LABELS = [
    { code: 'discount', label: '할인율 높은 순' },
    { code: 'price_asc', label: '낮은 가격순' },
    { code: 'price_desc', label: '높은 가격순' },
    { code: 'stock_low', label: '마지막 수량' },
    { code: 'latest', label: '최근 등록순' },
];

function renderComingSoon(res) {
    const feature = COMING_SOON.outlet;
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

/** GET /outlet */
exports.getList = async (req, res) => {
    const mallId = req.mallId || 1;

    const categoryId = Number(req.query.category) || null;
    const type = svc.TYPE_CODES.includes(req.query.type) ? req.query.type : null;
    const sort = svc.LIST_SORTS[req.query.sort] ? req.query.sort : svc.DEFAULT_SORT;
    const page = Math.max(Number(req.query.page) || 1, 1);

    const band = PRICE_BANDS.find((b) => b.code === String(req.query.price || ''));
    const maxPrice = band ? band.max : null;

    const [setting, categories, typeCounts, result] = await Promise.all([
        svc.getSetting(mallId),
        svc.getCategories(mallId),
        svc.getTypeCounts(mallId),
        svc.getProducts(mallId, { categoryId, type, sort, page, limit: 24, maxPrice }),
    ]);

    // 필터 없이 0건이면 아직 아울렛이 열리지 않은 것이다 → 준비중 랜딩.
    // 필터 때문에 0건인 경우는 빈 결과를 그대로 보여준다("조건에 맞는 상품 없음").
    const hasFilter = Boolean(categoryId || type || maxPrice);
    if (result.total === 0 && !hasFilter && page === 1) {
        const liveCount = await svc.countLiveProducts(mallId);
        if (liveCount === 0) return renderComingSoon(res);
    }

    // 사유 필터칩은 이 몰이 실제로 쓰는 사유 중 상품이 있는 것만 보여준다.
    const types = svc.OUTLET_TYPES
        .filter((t) => setting.allowedTypes.includes(t.code) && typeCounts[t.code])
        .map((t) => ({ ...t, count: typeCounts[t.code] }));

    res.render('user/outlet/list', {
        title: '아울렛',
        products: result.products,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        categories: categories.filter((c) => c.product_count > 0),
        types,
        priceBands: PRICE_BANDS,
        sorts: SORT_LABELS,
        noticeHtml: setting.notice_html ? sanitize(setting.notice_html) : null,
        active: {
            categoryId,
            type,
            sort,
            price: band ? band.code : null,
        },
        seo: Object.assign({}, res.locals.seo, {
            title: '아울렛 — 이월·리퍼브·재고정리 상품',
            description: '시즌 이월, 리퍼브, 전시상품 등 할인 사유가 명확한 상품을 상시 할인가로 만나보세요.',
        }),
    });
};
