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
  }
};
