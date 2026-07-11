# 관리자 화면 디자인 가이드 (Admin UI Design Guide)

관리자 콘솔을 작업할 때 참고하는 **공통 레이아웃, 컴포넌트, 타이포그래피, 상호작용 패턴** 가이드입니다. 사람이 직접 수정할 때나 AI 도구로 작업할 때 모두 기준으로 삼습니다.

## 1. 기술 스택 및 구조

- **템플릿 엔진**: EJS + `express-ejs-layouts`. 관리자 공통 레이아웃은 `views/layouts/admin_layout.ejs`
- **스타일링**:
  - Tailwind CSS 4.x 빌드 결과 (`public/css/style.css`)
  - 관리자 전용 커스텀 CSS(사이드바 링크, 키컬러 변수, 스크롤바 등)는 `admin_layout.ejs` 의 `<style>` 태그에 인라인으로 포함
- **폰트**: **Pretendard** (CDN, `admin_layout.ejs` 에서 로드)
- **아이콘**: Bootstrap Icons (CDN, `bi bi-*`)
- **주요 관리자 뷰**: `views/admin/**` (대시보드 `dashboard.ejs`, 이하 기능별 디렉터리)

### 1.1 라우팅

진입점은 `routes/admin.js` 이고, 기능별 서브라우트는 `routes/admin/*.js` 로 분리돼 있습니다.

```
/admin/login · /admin/logout       인증 (adminAuth 미들웨어 이전)
/admin                             대시보드
/admin/design-guide                디자인 가이드 프리뷰 페이지
/admin/products, /users, /orders … 각 기능별 관리 화면 (routes/admin/*.js)
/admin/settings, /site-settings, /sys-settings   설정
```

**접근 제어 체인** — `/admin` 마운트 시 다음 순서로 통과합니다.

1. `adminMenu` — DB 기반 사이드바 메뉴 트리(`adminMenuTree`)를 `res.locals` 에 주입
2. `adminAuth` — 세션 체크 (`/login`, `/logout` 제외)
3. `adminMallContext` — 편집 대상 몰(`adminMalls`, `adminMallId`) 주입
4. 라우트별 `requireMenuAccess('/admin/xxx')` — `admin_menus.visible_roles` CSV 기반 RBAC

새 관리자 화면을 추가할 때는 **`admin_menus` 테이블에 메뉴 행이 있어야 사이드바에 노출되고 접근 권한도 부여됩니다.**

## 2. 공통 레이아웃 (`admin_layout.ejs`)

### 2.1 브랜드 키컬러 변수

사이드바 색상은 하드코딩이 아니라 `site_settings` 의 브랜드 컬러에서 파생됩니다. (사용자 화면 `main_layout.ejs` 와 동일한 기준)

```css
:root {
  --admin-key-main:        /* siteSettings.brand_main_color  */
  --admin-key-strong:      /* siteSettings.brand_dark_color  */
  --admin-key-soft:        /* siteSettings.brand_light_color */
  --admin-key-soft-strong: color-mix(in srgb, var(--admin-key-main) 40%, var(--admin-key-soft) 60%);
}
```

관리자 전용 유틸리티 클래스:

| 클래스 | 용도 |
|--------|------|
| `.admin-sidebar-bg` | 사이드바 배경 (`--admin-key-soft`) |
| `.admin-sidebar-border` | 로고 영역 경계선 톤 |
| `.admin-sidebar-bottom` | 하단 프로필 바 (`--admin-key-soft-strong`) |
| `.admin-key-btn` | 키컬러 버튼 (사이드바 접기 버튼 등) |
| `.sidebar-link` / `.sidebar-link.active` | 메뉴 링크. active 는 main→strong 그라데이션 + 그림자 |

> 관리자 화면의 **강조색은 키컬러**, 그 외 액션 버튼/뱃지는 Tailwind 의 Blue/Green/Red/Amber 팔레트를 그대로 씁니다.

### 2.2 전체 구조 (3단)

**1) 좌측 사이드바 (`<aside id="sidebarMenu">`, `w-56`)**

- 배경 `.admin-sidebar-bg` (브랜드 연한색)
- 상단 로고 영역(높이 64px): `siteSettings.logo_url` 이 있으면 흰 카드 안에 이미지, 없으면 `company_name` 또는 `Admin Pro` 텍스트
- 네비게이션: **`adminMenuTree` 기반 2뎁스 트리**
  - `isGroup: true` 행은 링크가 아닌 **그룹 헤더**(`path` 가 null)
  - 잎(leaf) 메뉴만 `<a>` 링크
  - `adminMenuTree` 가 없으면 평면 `adminMenus` 로 폴백
- 하단 프로필 바 `.admin-sidebar-bottom`: 관리자 이름·역할 + 로그아웃

**2) 상단 헤더 (`<header>`, `h-16`)**

- `bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0`
- 좌측: 모바일 사이드바 토글 + 페이지 타이틀(`title`, 기본 `Overview`) / 서브타이틀(`subtitle`)
- 우측: **몰 선택기**(`adminMalls.length > 1` 일 때만 노출, amber 톤 select) → 알림 벨 → "사이트 바로가기"

**3) 메인 컨텐츠 (`<main>`)**

```
main.flex-1.overflow-y-auto.p-4 sm:p-6 lg:p-8
  └ div.max-w-7xl.mx-auto.pb-10
      └ div.admin-main-content.bg-white.rounded-2xl.shadow-sm.border.border-gray-100.p-6 sm:p-8
          └ <%- body %>
```

각 페이지 마크업은 **이미 흰색 카드 안에** 들어갑니다. 페이지 최상단에 또 흰 카드를 겹치지 마세요.

### 2.3 사이드바 상호작용

- **데스크톱 접기**: `#sidebarCollapseBtn` 클릭 → `w-56` ↔ `w-20` 토글. 로고/메뉴 라벨/하단 프로필은 축소 시 숨김
- **모바일 슬라이드**: `#sidebarToggle` 로 열고 `#sidebarOverlay` 클릭으로 닫음 (`-translate-x-full` 토글)
- **활성 규칙**: `/admin` 은 정확히 일치할 때만, 나머지는 `path.startsWith(menu.path)` → `active text-white` 클래스 부여

## 3. 공통 컴포넌트 및 패턴

### 3.1 렌더 호출 패턴

```js
res.render('admin/some_view', {
  layout: 'layouts/admin_layout',
  title: '페이지 타이틀',
  subtitle: '이 화면에서 하는 일에 대한 짧은 설명',
  // ...데이터
});
```

`subtitle` 을 채워두면 관리자가 화면의 역할을 빠르게 파악할 수 있습니다.

### 3.2 목록/테이블 화면

대표 예: `views/admin/products/list.ejs`, `views/admin/users/list.ejs`

- 상단 컨트롤 바: 좌측 설명(`text-sm text-gray-500`) + 우측 검색 폼/등록 버튼
- 테이블: `<thead>` 는 `bg-gray-50`, 헤더 셀은 `text-xs font-medium text-gray-500 uppercase tracking-wider`. `<tbody>` 는 `divide-y divide-gray-200 hover:bg-gray-50`
- 상태 뱃지: `bg-green-100 text-green-800` 류의 소프트 톤
- 기본 액션 버튼: `h-[38px] px-4 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500`

### 3.3 폼/설정 화면

대표 예: `views/admin/settings/form.ejs`

- 섹션 블록: `bg-white overflow-hidden shadow-sm rounded-lg` (또는 `border border-gray-100 rounded-xl`)
- 입력 필드 공통 클래스:

```html
class="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
```

- 라벨: `block text-sm font-medium text-gray-700 mb-1`
- 보조 설명: `text-xs text-gray-500 mb-2`

## 4. 주요 화면별 요약

### 4.1 대시보드 (`/admin` → `views/admin/dashboard.ejs`)

- 상단 요약 카드(회원/상품/문의/방문 등): `bg-색상 text-white rounded-lg shadow-sm p-6`
- 주문 현황: 상태별 건수 카드 그리드 (`bg-white border rounded-lg p-4`)
- 최근 가입 회원 / 검색 통계 / 유입 경로: `grid grid-cols-1 lg:grid-cols-2 gap-6` 카드 레이아웃
- 드릴다운 화면(`search_logs.ejs`, `traffic_sources_detail.ejs`, `popular_products_detail.ejs`)이 별도로 있습니다.

### 4.2 설정 (`/admin/settings` → `views/admin/settings/form.ejs`)

- 탭 구조(기본 정보관리 / 시스템 설정). 활성 탭 `border-blue-500 text-blue-600`
- 회사 정보 탭: 회사 기본정보 · 슬로건/소개/SNS · **브랜드 키컬러**(기본/진한/연한 + 팔레트 프리셋 + 자동 생성) · 로고 업로드
- 시스템 탭: 에디터/AI, 소셜 로그인, 포인트, 결제, SMTP 등
- 여기서 저장한 값은 DB `system_settings` 에 들어가 **`.env` 값을 덮어씁니다.**

### 4.3 SDUI 계열 화면 (페이지 빌더 · 섹션 · 테마)

- `/admin/page-builder` — `page` / `page_section` 을 편집. 섹션 타입별 설정 폼 스키마는 `services/display/sectionRegistry.js` 가 관장
- `/admin/theme-settings` — 테마 토큰(`--yd-*`: 폰트, radius, 섹션 간격, 컨테이너 폭, 카드 스타일)을 편집
- `/admin/header-settings`, `/admin/feature-menus`, `/admin/system-menus`, `/admin/menu-preview` — 스토어프론트 내비게이션 구성

이 화면들은 **사용자 화면의 렌더 결과를 바꾸는 설정 UI** 입니다. 새 섹션 타입을 추가할 때는 리졸버(`services/display/resolvers/`) · 뷰 · 설정 폼 스키마를 함께 등록해야 합니다.

## 5. 새 관리자 페이지를 만들 때

1. **레이아웃**: 반드시 `layout: 'layouts/admin_layout'`
2. **타이틀/서브타이틀** 지정 (§3.1)
3. **메뉴 등록**: `admin_menus` 테이블에 행을 추가하고 `visible_roles` 를 설정해야 사이드바 노출 + `requireMenuAccess` 통과
4. **라우트**: `routes/admin/xxx.js` 로 분리하고 `routes/admin.js` 에서 `requireMenuAccess` 와 함께 마운트
5. **기본 골격**

```html
<div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0">
  <p class="text-sm text-gray-500">이 화면의 간단 설명</p>
  <!-- 검색 폼 / 액션 버튼 -->
</div>

<!-- admin-main-content 가 이미 흰 카드이므로, 내부는 섹션 단위로 나눈다 -->
<div class="overflow-hidden rounded-lg border border-gray-100">
  <!-- 테이블 / 폼 / 카드 컨텐츠 -->
</div>
```

6. **색상 일관성**: 키컬러는 사이드바/강조에, 액션 버튼은 기존 Blue/Green/Red/Amber 톤 재사용

### 5.1 AI 도구 프롬프트 팁

- "Tailwind 기반 관리자 레이아웃(`admin_layout.ejs`) 사용, 폰트는 Pretendard"
- "본문은 이미 `admin-main-content` 흰 카드 안이므로 카드를 중첩하지 말 것"
- "기존 `views/admin/products/list.ejs` 와 테이블·버튼 스타일을 맞출 것"
- "인풋은 관리자 공통 클래스(`w-full rounded-md border border-gray-200 px-3 py-2 text-sm ...`) 사용"
- "브랜드 키컬러는 `--admin-key-main/-strong/-soft` CSS 변수로 이미 정의돼 있음"

## 6. 디자인 프리뷰 페이지

- URL: **`/admin/design-guide`** (실제 동작하는 라우트, `routes/admin.js`)
- 템플릿: `views/admin/design_guide.ejs`

관리자 레이아웃 안에서 공통 컴포넌트가 실제로 어떻게 보이는지 확인하고, 새 화면을 만들 때 복사해 쓸 샘플 구조를 제공합니다.
