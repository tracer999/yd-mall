/*
 * 섹션 타입 레지스트리 (SDUI 클라이언트 해석 계층 + 관리자 빌더 설정 스키마)
 *  section_type ↔ 렌더러 partial(view) ↔ 관리자 설정폼(fields) 1:1 매핑.
 *  새 컴포넌트를 추가하려면 여기에 등록하고 views/partials/sections/ 에 partial을 만든다.
 *  - view        : views/ 기준 상대경로 렌더러
 *  - label       : 관리자 "섹션 추가" 팔레트 표기
 *  - description : 팔레트 카드의 한 줄 설명. **무엇을 보여주는 섹션인지 + 데이터가 어디서 오는지**를
 *                  운영자 언어로 적는다. 팔레트는 이 설명 + 실데이터 라이브 렌더를 함께 보여준다.
 *  - dataSource  : 'product_group' | 'category' | 'banner_group' | null (data_source_id 연결 대상)
 *  - fields     : config_json 편집 필드 스키마(관리자 설정폼 동적 생성). 섹션 공통 필드
 *                 (title/노출기간/PC·모바일/활성)은 에디터가 일괄 처리하므로 여기엔 config 전용 키만.
 *
 *  필드 type: text | number | select | textarea | json | repeater
 *   - repeater 는 객체 배열을 행 단위 UI로 편집한다. itemFields(행 안의 입력 스키마) 필수,
 *     addLabel(추가 버튼 문구)·hint(필드 아래 도움말 HTML) 선택. 저장 형태는 json 과 같은 배열이라
 *     기존 데이터를 그대로 읽고 쓴다. itemFields 의 type 'icon' 은 입력 옆에 아이콘 미리보기를 붙인다.
 *     picker: 'linkTargets' 를 주면 type 'linkTarget' 필드가 **이 몰에서 실제로 열리는 페이지**
 *     셀렉트가 되고(services/menu/linkTargets.js), 고르는 즉시 url·icon·label 을 채운다.
 *     manualOnly 필드는 '직접 입력(URL)' 을 골랐을 때만 보인다.
 *   - json 은 스키마를 못 정하는 자유 구조에만 쓴다. 형태가 정해져 있으면 repeater 를 쓸 것.
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
    description: '페이지 최상단 대형 배너. 배너 관리의 MAIN 배너를 슬라이드로 돌린다.',
    dataSource: null,
    fields: []
  },
  /*
   * 테마 히어로 — 몰 스코프 hero_slide 를 읽는 히어로(테마 프리셋이 배치). layout 으로 표현을 가른다.
   * hero(전역 banners) 와 달리 몰마다 독립적이다. 슬라이드는 '히어로 슬라이드' 관리에서 등록한다.
   */
  theme_hero: {
    view: 'partials/sections/theme_hero',
    label: '테마 히어로',
    description: '홈 최상단 히어로의 **배치**를 정한다. 안에 무엇이 들어가는지(상품 쇼케이스/이미지 배너)는 배너 관리 > 메인 슬라이더에서 고른다.',
    dataSource: null,
    fields: [
      // 배치만 고른다. 콘텐츠 종류는 site_settings.hero_variant 소관 — 두 축을 섞으면
      // 테마를 바꿀 때마다 등록해 둔 배너·상품이 사라진다(그래서 분리했다).
      { key: 'layout', label: '배치', type: 'select', options: ['split_feature', 'full_width', 'full_bleed'], default: 'full_width' }
      // 풀블리드 하단 흐름문구(마퀴)도 '배너 관리 > 메인 슬라이더' 화면에서 편집한다
      // (site_settings.marquee_*). 즉시 반영이 필요해 페이지빌더 발행 흐름에서 분리했다.
    ]
  },
  product_grid: {
    view: 'partials/sections/product_grid_section',
    label: '상품 그리드',
    description: '선택한 상품 그룹을 바둑판(그리드)으로 나열한다. 스크롤 없이 한눈에 보여줄 때.',
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
    description: '판매·좋아요 합산 순위 상품을 그리드로. GNB 베스트와 같은 순위를 쓴다(탭 없음).',
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
    description: '카테고리마다 대표 상품을 묶어 보여준다. 카테고리 관리의 노출 카테고리를 따라간다.',
    dataSource: null,
    fields: []
  },
  kakao_cta: {
    view: 'partials/sections/kakao_cta',
    label: '카카오 상담 CTA',
    description: '카카오톡 채널 상담 유도 배너. 사이트 설정의 카카오 채널을 연결한다.',
    dataSource: null,
    fields: []
  },

  // ── CT 트랙 컴포넌트 ─────────────────────────────────────────────
  product_carousel: {
    view: 'partials/sections/product_carousel',
    label: '상품 캐러셀',
    description: '선택한 상품 그룹을 좌우로 넘기는 가로 슬라이드. 많은 상품을 좁은 높이에 담을 때.',
    dataSource: 'product_group',
    fields: [
      Object.assign({}, FIELD.maxCount, { default: 12 }),
      FIELD.columnsPerView,
      FIELD.moreLink
    ]
  },
  /*
   * 쇼핑특가 캐러셀 — dataSource 는 null 이다. 상품그룹이 아니라 **활성 특가**(deal)를 본다.
   * 기간·시간창·요일·선착순이 맞는 상품만 나오고, 특가가 없으면 섹션 자체가 스킵된다.
   */
  deal_carousel: {
    view: 'partials/sections/deal_carousel',
    label: '쇼핑특가 캐러셀',
    description: '현재 진행 중인 특가만 가로 슬라이드로. 특가 기간이 끝나면 섹션이 저절로 사라진다.',
    dataSource: null,
    fields: [
      { key: 'dealCategoryCode', label: '특가 카테고리 코드 (비우면 전체)', type: 'text', default: '' },
      Object.assign({}, FIELD.maxCount, { default: 12 }),
      FIELD.columnsPerView,
      Object.assign({}, FIELD.moreLink, { default: '/deals' })
    ]
  },
  brand_carousel: {
    view: 'partials/sections/brand_carousel',
    label: '베스트 브랜드',
    description: '브랜드별로 로고+이름 헤더와 그 브랜드의 상품 리스트를 함께 보여준다. 카테고리 관리의 BRAND 카테고리를 자동으로 끌어온다.',
    dataSource: null, // categories(type=BRAND) 고정 소스
    fields: [
      Object.assign({}, FIELD.maxCount, { label: '표시 브랜드 수', default: 8 }),
      { key: 'productCount', label: '브랜드당 상품 수', type: 'number', min: 2, max: 20, default: 6 },
      FIELD.moreLink
    ]
  },
  /*
   * 랭킹 탭 — best_ranking 과 **같은 스냅샷**을 읽는다(랭킹은 한 곳에서만 정의된다).
   * 탭은 관리자가 /admin/best-groups 에서 만든 랭킹 그룹이다.
   * 옛 `sort` 필드는 폐기했다 — sales 가 views 와 같은 SQL 로 매핑된 죽은 옵션이었다.
   * 순위 기준은 best_score_config(판매 5 · 좋아요 3 · 조회 0)에 단일 정의된다.
   */
  ranking_tabs: {
    view: 'partials/sections/ranking_tabs',
    label: '랭킹 탭',
    description: '랭킹을 탭으로 나눠 보여준다(예: 전체·영양제·유산균). 탭은 랭킹 그룹 관리에서 만든다.',
    dataSource: null, // best_group 고정 소스
    fields: [
      { key: 'maxTabs', label: '탭 개수', type: 'number', min: 2, max: 12, default: 6 },
      { key: 'rankLimit', label: '탭당 상품 수', type: 'number', min: 3, max: 20, default: 8 },
      { key: 'period', label: '기간', type: 'select', options: ['REALTIME', 'DAILY', 'WEEKLY', 'MONTHLY'], default: 'DAILY' }
    ]
  },
  promotion_banner: {
    view: 'partials/sections/promotion_banner',
    label: '프로모션 배너',
    description: '이벤트·기획전 배너를 여러 장 나란히. 배너 관리에서 같은 그룹 키로 묶어 등록한다.',
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
    description: '큰 딜 상품 하나 + 작은 썸네일 + 프로모 블록을 타일처럼 조합한 복합 레이아웃.',
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
    description: '아이콘 바로가기 버튼 줄. 항목을 직접 입력해 원하는 곳으로 링크한다.',
    dataSource: null, // config_json 만 사용 (리졸버 없음)
    fields: [
      {
        key: 'items',
        label: '바로가기 항목',
        type: 'repeater',
        default: [],
        addLabel: '항목 추가',
        // 이동할 페이지를 목록에서 고르면 URL·아이콘이 자동으로 채워진다(운영자는 이름만 고친다).
        picker: 'linkTargets',
        hint: '이동할 페이지를 고르면 링크와 아이콘이 자동으로 채워집니다. 화면에 보일 이름만 바꾸면 됩니다.',
        itemFields: [
          { key: 'url', label: '이동할 페이지', type: 'linkTarget' },
          { key: 'label', label: '표시 이름', type: 'text', placeholder: '오늘특가' },
          { key: 'badge', label: '뱃지(선택)', type: 'text', placeholder: 'N' },
          // 페이지를 고르면 자동으로 채워진다. '직접 입력' 을 골랐을 때만 손으로 넣는다.
          { key: 'icon', label: '아이콘', type: 'icon', placeholder: 'lightning-charge', manualOnly: true }
        ]
      },
      Object.assign({}, FIELD.columns, { label: '열 수(PC)', max: 6, default: 4 })
    ]
  },
  recent_product: {
    view: 'partials/sections/recent_product',
    label: '최근 본 상품',
    description: '방문자가 최근 본 상품. 사람마다 다르게 보이고, 본 상품이 없으면 노출되지 않는다.',
    dataSource: null, // 로그인=recent_views / 비로그인=localStorage
    fields: [
      Object.assign({}, FIELD.maxCount, { label: '표시 상품 수', max: 20, default: 8 })
    ]
  },
  /*
   * 유일하게 남겨 둔 "코드를 직접 쓰는" 섹션이다.
   * 다른 화면의 HTML 입력은 전부 에디터로 바꿨지만(§33), 이건 위 섹션들로 표현할 수 없을 때의
   * 탈출구라 존치한다. 대신 **개발자용**임을 이름에 박아 일반 사용자 동선에서 분리한다.
   */
  custom_html: {
    view: 'partials/sections/custom_html',
    label: '커스텀 HTML (개발자용)',
    description: 'HTML 을 직접 작성해 넣습니다. 위 섹션으로 표현할 수 없을 때만 쓰는 마지막 수단이며, HTML 을 아는 사람이 다뤄야 합니다.',
    dataSource: null,
    fields: [
      { key: 'html', label: 'HTML 코드 (저장·렌더 시 위험 태그 제거)', type: 'textarea', default: '' }
    ]
  },

  // ── 신상품 랜딩(/new) 컴포넌트 ────────────────────────────────
  // 상품을 product_group 이 아니라 신상품 술어(services/catalog/newArrival)로 직접 조회한다.
  // 카테고리·브랜드별로 묶는 구조라 단일 그룹으로 표현할 수 없기 때문이다.
  new_by_category: {
    view: 'partials/sections/new_by_category',
    label: '카테고리별 신상품',
    description: '신상품을 카테고리 탭으로 나눠 보여준다. 신상품 랜딩(/new)용 섹션.',
    dataSource: null,
    fields: [
      Object.assign({}, FIELD.maxCount, { label: '탭별 상품 수', max: 24, default: 8 }),
      { key: 'maxCategory', label: '탭(카테고리) 수', type: 'number', min: 1, max: 12, default: 6 }
    ]
  },
  new_by_brand: {
    view: 'partials/sections/new_by_brand',
    label: '브랜드별 신상품',
    description: '브랜드마다 신상품을 몇 개씩 묶어 보여준다. 신상품 랜딩(/new)용 섹션.',
    dataSource: null,
    fields: [
      Object.assign({}, FIELD.maxCount, { label: '브랜드별 상품 수', max: 20, default: 6 }),
      { key: 'maxBrand', label: '브랜드 수', type: 'number', min: 1, max: 12, default: 5 }
    ]
  },
  new_brand_list: {
    view: 'partials/sections/new_brand_list',
    label: '신규 입점 브랜드',
    description: '최근 입점한 브랜드를 대표 상품과 함께 나열한다. 신상품 랜딩(/new)용 섹션.',
    dataSource: null,
    fields: [
      Object.assign({}, FIELD.maxCount, { label: '브랜드 수', max: 24, default: 8 }),
      { key: 'productCount', label: '브랜드별 대표 상품 수', type: 'number', min: 0, max: 6, default: 3 }
    ]
  }
};
