/*
 * section_type → 리졸버 맵 (CT-0)
 *
 * 새 컴포넌트를 추가할 때 displayService.js 는 건드리지 않는다.
 *   1) views/partials/sections/<type>.ejs 생성
 *   2) sectionRegistry.js 에 등록
 *   3) 데이터가 필요하면 이 폴더에 <type>.js 리졸버 추가 후 아래 맵에 등록
 *
 * 리졸버가 없는 section_type 은 config_json 만으로 렌더된다(정적 섹션).
 */
module.exports = {
    hero: require('./hero'),
    product_grid: require('./product_grid'),
    best_ranking: require('./best_ranking'),
    category_showcase: require('./category_showcase'),
    kakao_cta: require('./kakao_cta'),

    // CT 트랙 컴포넌트
    product_carousel: require('./product_carousel'),
    deal_carousel: require('./deal_carousel'),
    brand_carousel: require('./brand_carousel'),
    ranking_tabs: require('./ranking_tabs'),
    promotion_banner: require('./promotion_banner'),
    benefit_bento: require('./benefit_bento'),
    recent_product: require('./recent_product'),
    custom_html: require('./custom_html'),

    // 신상품 랜딩(/new) 전용 — 판정은 services/catalog/newArrival 단독
    new_by_category: require('./new_by_category'),
    new_by_brand: require('./new_by_brand'),
    new_brand_list: require('./new_brand_list'),
    // quick_menu 는 config_json 만으로 렌더되는 정적 섹션이라 리졸버가 없다.
};
