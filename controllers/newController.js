const landingSections = require('../services/catalog/landingSections');
const newArrival = require('../services/catalog/newArrival');

/*
 * 신상품 (고객)
 *
 * 화면 구조 (2026-07-22 개편)
 *   [쇼케이스]          상단 배너·상품 캐러셀 — middleware/menuShowcase 가 주입한다
 *   [카테고리별 신상품] 카테고리마다 한 줄, 줄당 최대 10개(최신 등록순)
 *   [브랜드별 신상품]   브랜드마다 한 줄, 줄당 최대 10개(최신 등록순)
 *
 * 예전에는 상품목록 컨트롤러(productController.getList)를 `filter=new` 프리셋으로 재사용했다.
 * 그래서 좌측 필터(가격대·속성 facet)와 정렬 탭이 그대로 딸려 왔는데, 신상품은 "무엇이
 * 새로 들어왔는지" 훑는 화면이지 조건을 좁혀 찾는 화면이 아니다. 필터가 필요하면
 * 각 줄의 [더보기] 가 그 카테고리/브랜드의 목록 화면으로 데려간다.
 *
 * 무엇이 신상품인지는 services/catalog/newArrival 한 곳에서만 판정한다.
 */

async function getIndex(req, res, next) {
    try {
        const mallId = req.mallId || 1;
        const hasUser = !!req.user;

        const [categoryRows, brandRows] = await Promise.all([
            landingSections.getCategoryRows(mallId, { hasUser, mode: 'new' }),
            landingSections.getBrandRows(mallId, { hasUser, mode: 'new' }),
        ]);

        res.render('user/new/index', {
            title: '신상품',
            categoryRows,
            brandRows,
            newDays: newArrival.newProductDays(),
            seo: Object.assign({}, res.locals.seo, {
                title: '신상품',
                description: '최근 등록된 신상품을 카테고리·브랜드별로 모았습니다.',
            }),
        });
    } catch (e) {
        next(e);
    }
}

module.exports = { getIndex };
