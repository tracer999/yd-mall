/*
 * 섹션 타입 레지스트리 (SDUI 클라이언트 해석 계층 + 관리자 빌더 설정 스키마)
 *  section_type ↔ 렌더러 partial(view) ↔ 관리자 설정폼(fields) 1:1 매핑.
 *  새 컴포넌트를 추가하려면 여기에 등록하고 views/partials/sections/ 에 partial을 만든다.
 *  - view       : views/ 기준 상대경로 렌더러
 *  - label      : 관리자 "섹션 추가" 팔레트 표기
 *  - dataSource : 'product_group' | 'category' | 'banner_group' | null (data_source_id 연결 대상)
 *  - fields     : config_json 편집 필드 스키마(관리자 설정폼 동적 생성). 섹션 공통 필드
 *                 (title/노출기간/PC·모바일/활성)은 에디터가 일괄 처리하므로 여기엔 config 전용 키만.
 */

const FIELD = {
  maxCount: { key: 'maxCount', label: '표시 상품 수', type: 'number', min: 1, max: 60, default: 8 },
  columns: { key: 'columns', label: '열 수(PC)', type: 'number', min: 1, max: 6, default: 4 },
  columnsPerView: { key: 'columnsPerView', label: '뷰당 표시 수(PC)', type: 'number', min: 2, max: 6, default: 4 },
  moreLink: { key: 'moreLink', label: '더보기 링크(URL)', type: 'text', default: '' }
};

module.exports = {
  hero: {
    view: 'partials/sections/hero',
    label: '히어로',
    dataSource: null,
    fields: []
  },
  value_proposition: {
    view: 'partials/sections/value_proposition',
    label: '특장점',
    dataSource: null,
    fields: []
  },
  product_grid: {
    view: 'partials/sections/product_grid_section',
    label: '상품 그리드',
    dataSource: 'product_group',
    fields: [FIELD.maxCount, FIELD.columns, FIELD.moreLink]
  },
  /*
   * 베스트/랭킹 — 판매·좋아요 합산 순위를 홈에 띄운다(GNB /best 와 같은 스냅샷).
   * dataSource 는 null 이다. 상품그룹이 아니라 **best_group** 을 보므로 페이지 빌더의
   * 상품그룹 셀렉터를 쓸 수 없다. 대신 groupId 를 config 로 받고, 0 이면 '전체' 그룹을 자동 선택한다.
   */
  best_ranking: {
    view: 'partials/sections/product_grid_section',
    label: '베스트/랭킹',
    dataSource: null,
    fields: [
      { key: 'groupId', label: '랭킹 탭 ID (0 = 전체)', type: 'number', min: 0, max: 999999, default: 0 },
      { key: 'period', label: '기간', type: 'select', options: ['REALTIME', 'DAILY', 'WEEKLY', 'MONTHLY'], default: 'DAILY' },
      FIELD.maxCount,
      FIELD.columns,
      FIELD.moreLink
    ]
  },
  category_showcase: {
    view: 'partials/sections/category_showcase',
    label: '카테고리별 상품',
    dataSource: null,
    fields: []
  },
  kakao_cta: {
    view: 'partials/sections/kakao_cta',
    label: '카카오 상담 CTA',
    dataSource: null,
    fields: []
  },

  // ── CT 트랙 컴포넌트 ─────────────────────────────────────────────
  product_carousel: {
    view: 'partials/sections/product_carousel',
    label: '상품 캐러셀',
    dataSource: 'product_group',
    fields: [
      Object.assign({}, FIELD.maxCount, { default: 12 }),
      FIELD.columnsPerView,
      FIELD.moreLink
    ]
  },
  brand_carousel: {
    view: 'partials/sections/brand_carousel',
    label: '브랜드 캐러셀',
    dataSource: null, // categories(type=BRAND) 고정 소스
    fields: [
      Object.assign({}, FIELD.maxCount, { label: '표시 브랜드 수', default: 20 }),
      Object.assign({}, FIELD.columns, { label: '뷰당 표시 수(PC)', max: 8, default: 6 }),
      { key: 'shape', label: '모양', type: 'select', options: ['rect', 'circle'], default: 'rect' },
      FIELD.moreLink
    ]
  },
  ranking_tabs: {
    view: 'partials/sections/ranking_tabs',
    label: '랭킹 탭',
    dataSource: null, // 카테고리 탭 고정 소스
    fields: [
      { key: 'maxTabs', label: '탭 개수', type: 'number', min: 2, max: 12, default: 6 },
      { key: 'rankLimit', label: '탭당 상품 수', type: 'number', min: 3, max: 20, default: 8 },
      { key: 'sort', label: '랭킹 기준', type: 'select', options: ['views', 'sales', 'newest', 'discount'], default: 'views' }
    ]
  },
  promotion_banner: {
    view: 'partials/sections/promotion_banner',
    label: '프로모션 배너',
    dataSource: 'banner_group',
    fields: [
      { key: 'groupKey', label: '배너 그룹 키', type: 'text', default: '' },
      Object.assign({}, FIELD.maxCount, { label: '표시 배너 수', max: 12, default: 4 }),
      { key: 'layout', label: '레이아웃', type: 'select', options: ['rect', 'vertical'], default: 'rect' },
      Object.assign({}, FIELD.columns, { label: '열 수(PC)', max: 4, default: 2 })
    ]
  },
  benefit_bento: {
    view: 'partials/sections/benefit_bento',
    label: '혜택 벤토',
    dataSource: 'product_group',
    fields: [
      { key: 'dealProductId', label: '대형 딜 상품 ID', type: 'number', min: 1, default: null },
      Object.assign({}, FIELD.maxCount, { label: '썸네일 수', max: 12, default: 8 }),
      { key: 'promoBlocks', label: '프로모 블록 [{copy,color,url}]', type: 'json', default: [] }
    ]
  },
  quick_menu: {
    view: 'partials/sections/quick_menu',
    label: '퀵 메뉴',
    dataSource: null, // config_json 만 사용 (리졸버 없음)
    fields: [
      { key: 'items', label: '항목 [{icon,label,url,badge}]', type: 'json', default: [] },
      Object.assign({}, FIELD.columns, { label: '열 수(PC)', max: 6, default: 4 })
    ]
  },
  recent_product: {
    view: 'partials/sections/recent_product',
    label: '최근 본 상품',
    dataSource: null, // 로그인=recent_views / 비로그인=localStorage
    fields: [
      Object.assign({}, FIELD.maxCount, { label: '표시 상품 수', max: 20, default: 8 })
    ]
  },
  custom_html: {
    view: 'partials/sections/custom_html',
    label: '커스텀 HTML',
    dataSource: null,
    fields: [
      { key: 'html', label: '커스텀 HTML (저장·렌더 시 새니타이즈)', type: 'textarea', default: '' }
    ]
  },

  // ── 신상품 랜딩(/new) 컴포넌트 ────────────────────────────────
  // 상품을 product_group 이 아니라 신상품 술어(services/catalog/newArrival)로 직접 조회한다.
  // 카테고리·브랜드별로 묶는 구조라 단일 그룹으로 표현할 수 없기 때문이다.
  new_by_category: {
    view: 'partials/sections/new_by_category',
    label: '카테고리별 신상품',
    dataSource: null,
    fields: [
      Object.assign({}, FIELD.maxCount, { label: '탭별 상품 수', max: 24, default: 8 }),
      { key: 'maxCategory', label: '탭(카테고리) 수', type: 'number', min: 1, max: 12, default: 6 }
    ]
  },
  new_by_brand: {
    view: 'partials/sections/new_by_brand',
    label: '브랜드별 신상품',
    dataSource: null,
    fields: [
      Object.assign({}, FIELD.maxCount, { label: '브랜드별 상품 수', max: 20, default: 6 }),
      { key: 'maxBrand', label: '브랜드 수', type: 'number', min: 1, max: 12, default: 5 }
    ]
  },
  new_brand_list: {
    view: 'partials/sections/new_brand_list',
    label: '신규 입점 브랜드',
    dataSource: null,
    fields: [
      Object.assign({}, FIELD.maxCount, { label: '브랜드 수', max: 24, default: 8 }),
      { key: 'productCount', label: '브랜드별 대표 상품 수', type: 'number', min: 0, max: 6, default: 3 }
    ]
  }
};
