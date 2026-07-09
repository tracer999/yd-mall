# 사용자 화면 디자인 가이드 (User UI Design Guide)

이 문서는 사용자 화면(프론트 사용자용)의 페이지를 작업할 때 사람이 직접 작업하거나, Copilot / Gemini 등 AI 도구가 작업을 보조할 수 있도록 **공통 레이아웃, 컬러 시스템, 컴포넌트 구조, 페이지 패턴**을 정리한 가이드입니다.

## 1. 기술 스택 및 전반 구조

- **템플릿 엔진**: EJS
- **레이아웃 시스템**: `express-ejs-layouts` 를 사용하며 기본 레이아웃은 `views/layouts/main_layout.ejs` 입니다.
- **스타일링**:
  - Tailwind CSS 빌드 결과를 사용 (`public/css/style.css`).
  - 공통 컬러는 `main_layout.ejs` 의 `<style>` 블록에서 CSS 변수를 통해 정의합니다.
- **라우팅 구조 (사용자 측)**:
  - `/` : 메인 홈 – `views/user/index.ejs`
  - `/products`, `/products/category/:id` : 상품 목록 – `views/user/products/list.ejs`
  - `/products/view/:id` 및 `/products/:slug` : 상품 상세 – `views/user/products/detail.ejs`
  - `/notices` : 공지 리스트 – `views/user/notices/list.ejs`
  - `/notices/:id` : 공지 상세 – `views/user/notices/detail.ejs`
  - `/inquiries` : 1:1 문의 – `views/user/inquiries/...`
  - `/terms`, `/privacy` 등 : 정책/약관 페이지 – `views/user/terms.ejs`, `views/user/privacy.ejs`
  - `/design-guide/user` : **디자인 예시 페이지** – `views/user/design_guide.ejs` (이 문서의 예시용)

## 2. 레이아웃 및 공통 요소

### 2.1 메인 레이아웃 (`views/layouts/main_layout.ejs`)

- 모든 사용자 페이지는 기본적으로 `main_layout.ejs` 를 레이아웃으로 사용합니다.
- `<body>` 구조:
  - 상단 고정 헤더 (`<header>`)
  - 메인 컨텐츠 래퍼 (`<main class="flex-grow brand-page-surface">`)
  - 풋터 (`<footer>`)
- 공통 헤더 구성:
  - 상단 얇은 바(Top Bar)
    - 배경: 브랜드 연한색 `var(--gh-secondary)`
    - 좌측: 회사 헤더 슬로건 텍스트 (사이트설정 `header_slogan`)
    - 우측: 로그인/회원가입 또는 유저 환영 메시지 + 프로필 이미지 + 마이페이지/로그아웃 링크
  - 메인 내비게이션 바
    - 로고/브랜드명 (사이트설정 `logo_url`, `company_name`)
    - 메뉴:
      - 홈 (`/`)
      - 테마 카테고리: `/admin/categories` 에서 type 이 THEME 인 카테고리가 메뉴에 노출되며, `/products/category/:id` 로 링크
      - 공지사항 (`/notices`)
    - 우측 아이콘: 검색(`/search`), 장바구니(`/cart`), 모바일 메뉴 버튼 등

### 2.2 공통 Footer

- 회사 정보는 `/admin/site-settings` 에서 입력한 정보를 기반으로 하여 footer 영역에 표시됩니다.
  - 회사명, 주소, 대표자, 사업자등록번호, 고객센터 연락처 등
- SNS 링크 (인스타그램, 페이스북, 유튜브)는 `siteSettings` 의 설정에 따라 아이콘과 링크가 활성화됩니다.

### 2.3 전역 CSS 변수 (브랜드 컬러 시스템)

`main_layout.ejs` 의 `<style>` 내에서 아래와 같은 CSS 변수가 정의되어 있습니다.

```css
:root {
  --gh-primary: <%= brandMain %>;          /* 키컬러 (브랜드 메인 색상) */
  --gh-primary-dark: <%= brandDark %>;    /* 메인보다 진한 색상 */
  --gh-secondary: <%= brandLight %>;      /* 메인보다 연한 색상 */
  --gh-primary-contrast: <%= brandContrast %>; /* 버튼/배지 텍스트 대비색 */
  --gh-accent: color-mix(in srgb, var(--gh-primary) 60%, var(--gh-primary-dark));
  --gh-text: #2C3E50;
  --gh-muted: #7F8C8D;
  --gh-border: #E2E8F0;
  --gh-primary-soft: color-mix(in srgb, var(--gh-primary) 15%, white);
  --gh-primary-soft-strong: color-mix(in srgb, var(--gh-primary) 28%, white);
  --gh-primary-ring: color-mix(in srgb, var(--gh-primary) 40%, transparent);
  --gh-primary-shadow: color-mix(in srgb, var(--gh-primary) 22%, transparent);
}
```

이 값들은 `siteSettings.brand_main_color`, `siteSettings.brand_dark_color`, `siteSettings.brand_light_color` 를 기반으로 계산됩니다.

### 2.4 브랜드 유틸리티 클래스

공통적으로 사용할 수 있는 커스텀 클래스입니다.

- `.brand-text` : 텍스트 색상을 메인 컬러로 설정
- `.brand-text-strong` : 텍스트 색상을 진한 컬러로 설정
- `.brand-chip` : 연한 배경 + 진한 텍스트의 Pill / 태그 스타일
- `.brand-border` : 브랜드 톤의 보더 컬러
- `.brand-badge` : 메인 컬러 배경 + 대비 텍스트 (뱃지)
- `.brand-cta` : 메인~진한 컬러 그라데이션 버튼 (강조 CTA)
- `.brand-pill--ghost` : 테두리형 Pill 버튼 (hover 시 연한 배경)
- `.brand-focus` : 포커스 시 아웃라인/쉐도우가 브랜드 컬러로 표시되는 인풋/셀렉트
- `.brand-tab` : 탭 UI용 기본 스타일 / `.brand-tab.is-active` : 활성 탭
- `.brand-page-surface` : 사용자 컨텐츠의 기본 배경색 (페이지 바탕)

사용자 화면에서 브랜드 컬러를 활용할 때는 **Tailwind 유틸리티와 위 클래스를 함께 사용**하는 것을 권장합니다.

예: 

```html
<button class="px-4 py-2 rounded-lg text-sm font-semibold brand-cta">지금 구매하기</button>
<div class="inline-flex items-center px-3 py-1 rounded-full text-xs brand-chip">#유기농</div>
```

## 3. 사이트 설정과 노출 방식

### 3.1 /admin/site-settings

- 쇼핑몰 전반에 사용되는 **회사/브랜드 정보** 및 **브랜드 컬러**를 설정하는 화면입니다.
- 주요 설정 항목 예:
  - 회사명 (`company_name`) – 헤더 및 푸터, SEO 기본 타이틀 등에 사용
  - 회사 슬로건 (`slogan`) – Footer 소개 문구에 사용
  - 헤더 슬로건 (`header_slogan`) – 상단 Top Bar 좌측에 노출
  - 로고 이미지 (`logo_url`) – 헤더 로고 영역에 표시
  - 키컬러 (`brand_main_color`), 진한색 (`brand_dark_color`), 연한색 (`brand_light_color`)
  - 연락처 / 주소 / 사업자 정보 / 통신판매업 신고번호 등 – Footer에 함께 노출

### 3.2 /admin/categories (THEME 카테고리)

- 카테고리의 `type` 이 `THEME` 인 경우 **상단 메인 메뉴의 테마 카테고리**로 사용됩니다.
- 각 THEME 카테고리는 `/products/category/:id` 로 링크되며, 테마별 쇼핑 영역을 구성합니다.

## 4. 페이지별 컨텐츠 배경 및 구조

### 4.1 기본 컨텐츠 배경

- 기본적으로 메인 레이아웃의 `<main>` 은 `class="flex-grow brand-page-surface"` 를 사용합니다.
- `brand-page-surface` 는 현재 **고정된 중립 배경색 (#F7F8FB 계열)** 으로 설정되어, 브랜드 연한색과는 분리되어 있습니다.
- 개별 페이지에서 특별한 이유가 없는 한, **페이지 최상단 래퍼(div)** 에 `brand-page-surface` 또는 흰 배경을 사용하여 자연스럽게 이어지도록 합니다.

예: 

```html
<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <!-- 페이지 컨텐츠 -->
</div>
```

### 4.2 공지사항 리스트 (`/notices` → `views/user/notices/list.ejs`)

- 상단은 `py-12 brand-page-surface min-h-screen` 으로, **기본 컨텐츠 배경색**을 사용합니다.
- 내부 박스는 흰색 카드 + 그림자 구조로 구성합니다.
- 데스크톱: 테이블 형태, 모바일: 카드 형태
- 강조 공지(`importance` 플래그)는 붉은 톤 배경/배지로 시각적 강조를 합니다.

### 4.3 공지사항 상세 (`/notices/:id` → `views/user/notices/detail.ejs`)

- 동일하게 `py-12 brand-page-surface min-h-screen` 으로 시작합니다.
- 가운데 최대 폭 `max-w-4xl` 카드 안에 제목/날짜/조회수/내용/목록 버튼이 들어갑니다.

### 4.4 메인 홈 (`/` → `views/user/index.ejs`)

홈 화면은 크게 다음과 같은 섹션들로 구성됩니다.

1. **히어로 배너 (Swiper 슬라이더)**
   - `heroBanners` (타입=MAIN 등) 를 상단 슬라이더로 노출.
   - 배너 없을 때는 `var(--gh-secondary)` 를 배경으로 한 기본 안내 섹션을 사용.

2. **핵심 가치(Values) 섹션**
   - 3개의 카드가 그리드 형태로 배치.
   - 카드 배경: `bg-[var(--gh-secondary)]` + `brand-border` 로 부드러운 톤
   - 각 카드 상단에 아이콘 라운드 배지 (`bg-white` + `text-[var(--gh-primary)]`)

3. **카테고리별 상품 모듈**
   - `categoriesWithProducts` 배열을 순회하며 카테고리 헤더 + 4개 상품 카드 노출.
   - 각 카드: 흰 배경, 이미지, 상품명, 공급사, 가격 및 할인 라벨(`brand-badge`, 상태 배너 등) 포함.
   - "더 보기" 링크는 `/products/category/:id` 로 연결.

4. **이달의 신상품 섹션**
   - 배경: `bg-[var(--gh-secondary)]`
   - NEW 배지, 상태 뱃지, 가격 등을 포함한 상품 카드 그리드.
   - "전체보기" 링크는 `/products?sort=new` 로 이동.

### 4.5 상품 목록 (`/products`, `/products/category/:id` → `views/user/products/list.ejs`)

구조 요약:

- 상단 브레드크럼: Home > 현재 카테고리명
- 모바일: 상단 `select` 로 카테고리 선택 가능.
- 좌측 사이드바 (데스크톱): 카테고리 리스트 카드
  - 전체보기 및 각 카테고리는 링크 `/products` 또는 `/products/category/:id`
  - 선택된 카테고리는 `brand-chip` + `font-semibold` 로 강조.
- 우측 메인 영역:
  - 선택된 카테고리에 연결된 CATEGORY 배너가 있으면 상단에 노출.
  - 정렬 드롭다운 (신상품순/인기순/가격순).
  - 상품 그리드:
    - 각 카드가 흰 배경, 이미지, 공급사, 상품명, 가격/할인 정보를 노출.
    - 상태값(`ON`, `OFF`, `SOLD_OUT`, `COMING_SOON`) 에 따라 상태 배너/이미지 Overlay 사용.

디자인 작업 시, `/products/category/:id` 와 `/` 의 상품 카드들을 **컴포넌트화**해서 재사용하는 것을 추천합니다.

## 5. 타이포그래피 & 레이아웃 규칙

### 5.1 폰트

- 기본 폰트: `IBM Plex Sans KR`
- 포인트/서브 타이틀용 Serif: `Merriweather` (`.gh-serif` 클래스 사용)
- 헤더/메뉴/버튼의 글자 크기 및 굵기는 Tailwind 유틸리티를 기준으로 합니다.

예시:

- 헤더 메인 메뉴: `text-base font-medium text-gray-700`
- 카드 타이틀: `text-lg font-bold text-gray-900`
- 서브 텍스트: `text-sm text-gray-500`

### 5.2 공통 레이아웃 폭

- 메인 컨텐츠 폭: `max-w-7xl mx-auto` 를 기준으로 합니다.
- 양 옆 패딩: `px-4 sm:px-6 lg:px-8`
- 세로 여백: 페이지 상단/하단 기준 `py-8`, 섹션 간 `mb-6`, `mb-8`, `py-12` 등 사용.

### 5.3 컴포넌트 패턴

- **카드**: `bg-white rounded-lg shadow-sm border border-gray-200`
- **강조 카드**: `bg-[var(--gh-secondary)]` + `brand-border`
- **버튼**:
  - 기본 CTA: `.brand-cta px-5 py-3 rounded-lg text-sm font-semibold`
  - 서브 버튼: `border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`

## 6. AI / 개발자를 위한 작업 가이드

### 6.1 새 사용자 페이지를 만들 때 체크리스트

1. **레이아웃 사용**
   - 별도 설정이 없다면 `main_layout.ejs` 가 기본 레이아웃입니다.
   - 페이지 파일은 `views/user/...` 아래에 생성합니다.

2. **페이지 래퍼 구조**
   - 최상단 래퍼는 보통 아래 패턴을 따릅니다.

   ```html
   <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
     <!-- 여기 안에서 섹션/그리드/카드 등을 구성 -->
   </div>
   ```

3. **브랜드 컬러 사용**
   - 버튼/링크/배지에 Tailwind 유틸리티 대신 가능하면 `.brand-*` 클래스를 우선 고려합니다.
   - 배경 전체를 키컬러로 채우기보다는, 카드/뱃지/버튼 등 포인트에 사용합니다.

4. **사이트설정 연계**
   - `res.locals.siteSettings` 를 통해 회사명 / 슬로건 / 색상 등을 불러올 수 있습니다.
   - SEO 메타 태그는 필요 시 `seo` 객체를 구성해 `res.render` 에 함께 넘겨 사용합니다.

5. **접근성 및 반응형**
   - 버튼/링크에는 `hover:` 뿐 아니라 `focus:` 상태도 고려 (`brand-focus` 등).
   - `sm / md / lg` 브레이크포인트를 적절히 사용해 모바일·데스크톱 모두 사용성 좋게 구성합니다.

### 6.2 AI 도구 사용 시 프롬프트 팁

- 페이지 목적, 타겟 사용자, 필요한 섹션(히어로, 리스트, 필터 등), 사용할 기존 컴포넌트 스타일을 충분히 기술합니다.
- 아래 키워드를 함께 제공하면 일관성 유지에 도움이 됩니다.
  - "Tailwind 기반, main_layout.ejs 레이아웃 사용"
  - "브랜드 컬러는 CSS 변수 (--gh-primary, --gh-secondary 등)로 이미 정의되어 있음"
  - "카드 스타일은 기존 products/list.ejs 와 일관되게"

## 7. 디자인 예시 페이지 (/design-guide/user)

- 이 문서의 내용을 실제 UI로 확인하기 위한 예제 페이지입니다.
- URL: `/design-guide/user`
- 템플릿: `views/user/design_guide.ejs`

예시 페이지의 목적:

- 헤더/푸터/기본 배경과 조화롭게 어울리는 **표준 섹션 레이아웃** 샘플 제공
- 브랜드 컬러와 공통 컴포넌트(버튼, 카드, 배지 등)의 조합 예시 제공
- 새 페이지 작업 시 복사/응용 가능한 초반 템플릿 역할

> 구현 상세는 `views/user/design_guide.ejs` 를 참고하세요.
