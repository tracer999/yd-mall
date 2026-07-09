# 관리자 화면 디자인 가이드 (Admin UI Design Guide)

이 문서는 쇼핑몰 관리자 화면(관리자 콘솔)을 작업할 때, 사람이 직접 UI를 수정하거나 Copilot / Gemini 등의 AI 도구로 작업할 때 참고할 수 있는 **공통 레이아웃, 컴포넌트, 타이포그래피, 상호작용 패턴**을 정리한 가이드입니다.

## 1. 기술 스택 및 구조

- **템플릿 엔진**: EJS
- **레이아웃 시스템**: `express-ejs-layouts` 를 사용하며, 관리자는 `views/layouts/admin_layout.ejs` 를 공통 레이아웃으로 사용합니다.
- **스타일링**:
  - Tailwind CSS 빌드 결과 (`public/css/style.css`)
  - 일부 관리자 전용 커스텀 CSS (사이드바 링크, 스크롤바, fade-in 애니메이션 등)는 `admin_layout.ejs` 의 `<style>` 태그에 포함
- **주요 관리자 뷰 위치**: `views/admin/**`
  - 대시보드: `views/admin/dashboard.ejs`
  - 설정: `views/admin/settings/form.ejs`
  - 상품: `views/admin/products/*.ejs`
  - 회원: `views/admin/users/*.ejs`
  - 기타(쿠폰, 포인트, 배송, 방문자, 배너, 카테고리 등)는 각각의 디렉터리에 존재

- **라우팅**: `routes/admin.js`
  - `/admin/login` / `/admin/logout` : 관리자 인증
  - `/admin` : 대시보드 (요약 지표, 주문현황, 검색 통계 등)
  - `/admin/settings` : 회사 정보, 브랜드 컬러, 시스템 설정 등
  - `/admin/site-settings`, `/admin/sys-settings` : 세부 설정 화면
  - `/admin/products`, `/admin/users`, `/admin/banners`, `/admin/menus` 등: 각 기능별 관리 화면

## 2. 공통 레이아웃 (admin_layout.ejs)

### 2.1 전체 구조

`views/layouts/admin_layout.ejs` 는 다음과 같은 3단 구조를 가집니다.

1. **좌측 사이드바(Aside)**
   - 배경: `bg-sky-100` (연한 블루 톤)
   - 상단 로고 영역
     - `siteSettings.logo_url` 이 있는 경우, 로고 이미지를 카드 형태로 표시
     - 없으면 `siteSettings.company_name` 또는 "Admin Pro" 텍스트 로고를 표시
   - 네비게이션 메뉴
     - DB 기반 `adminMenus` 배열을 순회하여 메뉴를 출력
     - 현재 경로(`res.locals.path`) 기준으로 활성 메뉴에 `active text-white` 클래스를 적용
   - 하단 사용자 프로필 영역
     - 로그인한 관리자 이름, 역할(최고관리자/회원관리자/컨텐츠관리자 등)을 표시
     - 로그아웃 버튼 제공

2. **상단 고정 헤더(Header)**
   - 높이 `h-16`, 흰 배경 + blur (`bg-white/80 backdrop-blur-md`)
   - 좌측: 모바일 사이드바 토글 버튼 + 페이지 타이틀/서브타이틀
   - 우측: 알림 아이콘(벨) + "사이트 바로가기" 버튼
   - 타이틀/서브타이틀
     - `title` 변수가 있으면 사용, 없으면 기본값 `Overview`
     - `subtitle` 변수가 있으면 사용, 없으면 기본 문구 `관리자 패널에 오신 것을 환영합니다.`

3. **메인 컨텐츠 영역(Main)**
   - 스크롤 가능한 영역: `main.flex-1.overflow-y-auto.p-4 sm:p-6 lg:p-8`
   - 내부 컨테이너: `max-w-7xl mx-auto pb-10`
   - 컨텐츠 카드: `admin-main-content bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 min-h-[calc(100vh-180px)]`
   - 실제 각 페이지의 마크업은 `<%- body %>` 로 삽입됩니다.

### 2.2 사이드바 상호작용

- **데스크톱에서 너비 축소/확장**
  - `#sidebarCollapseBtn` 클릭 시, `w-56` ↔ `w-20` 클래스를 토글하여 좁은 아이콘형 사이드바로 접을 수 있습니다.
  - 로고/텍스트/메뉴 라벨/하단 프로필 영역은 축소 시 숨기고, 확장 시 다시 표시합니다.

- **모바일에서 슬라이드 인/아웃**
  - `#sidebarToggle` 버튼 클릭 시 좌측에서 슬라이드 인
  - `#sidebarOverlay` 를 클릭하면 다시 슬라이드 아웃
  - `-translate-x-full` 클래스 토글과 오버레이의 `opacity`/`hidden` 토글을 통해 애니메이션 처리

- **메뉴 활성화 규칙**
  - `adminMenus` 배열의 각 `menu.path` 와 현재 `path` 를 비교해 active 상태를 계산합니다.
  - `/admin` 는 정확히 `/admin` 인 경우만 활성, 나머지는 `path.startsWith(menu.path)` 로 하위 경로도 활성 처리

## 3. 공통 컴포넌트 및 패턴

### 3.1 상단 헤더 영역

- 페이지별 컨트롤러에서 `res.render` 호출 시 다음 패턴을 권장합니다.

```js
res.render('admin/some_view', {
  layout: 'layouts/admin_layout',
  title: '페이지 타이틀',
  subtitle: '이 페이지에서 사용하는 기능에 대한 짧은 설명',
  // ...기타 데이터
});
```

- `subtitle` 를 채워두면, 관리자들이 각 화면의 역할을 빠르게 이해할 수 있습니다.

### 3.2 목록/테이블 화면 공통 구조

대표 예: `views/admin/products/list.ejs`, `views/admin/users/list.ejs`

- 상단 컨트롤 바
  - 좌측: 해당 화면 설명 텍스트 (`text-sm text-gray-500`)
  - 우측: 검색 폼/등록 버튼 등 액션
- 본문 카드
  - `div.bg-white.overflow-hidden.shadow-sm.rounded-lg` 안에 `<table>` 을 배치
  - `<thead>`: `bg-gray-50`, 컬럼 헤더는 `text-xs font-medium text-gray-500 uppercase tracking-wider`
  - `<tbody>`: `divide-y divide-gray-200`, 행 hover 시 `hover:bg-gray-50`
- 버튼 스타일 예시
  - 기본 액션 버튼: `h-[38px] px-4 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500`
  - 보조 버튼(상태 변경 등): 색상만 green/yellow/red/amber 등으로 변경

### 3.3 폼/설정 화면 공통 구조

대표 예: `views/admin/settings/form.ejs`

- 페이지 상단에는 현재 탭 설명 텍스트 (회사 정보 vs 시스템 설정)를 표시
- 탭 내 섹션들은 `bg-white overflow-hidden shadow-sm rounded-lg` 블록으로 나누어 구성합니다.
- **입력 필드 공통 클래스** (이미 적용됨)
  - 대부분의 `<input>`, `<textarea>` 는 다음 클래스를 사용합니다.

```html
class="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
```

- 라벨/보조 설명 텍스트
  - 라벨: `block text-sm font-medium text-gray-700 mb-1`
  - 설명: `text-xs text-gray-500 mb-2`

이 규칙을 지키면, 관리자 전체 폼 UI 가 일관된 느낌을 유지합니다.

## 4. 주요 화면별 디자인 요약

### 4.1 대시보드 (`/admin` → `views/admin/dashboard.ejs`)

- 상단 요약 카드 4개
  - 각 카드: `bg-색상 text-white rounded-lg shadow-sm p-6`
  - 색상 예시: Blue(회원 수), Green(총 상품), Yellow(새 문의), Cyan(오늘 방문)
- 주문 현황
  - 그리드 형태의 상태 카드 (`bg-white border rounded-lg p-4`)
  - 상태별 건수를 크게 표시하는 텍스트
- 최근 가입 회원 / 검색 통계
  - 2열 카드 레이아웃 (`grid grid-cols-1 lg:grid-cols-2 gap-6`)
  - 내부는 리스트/태그/버튼 등을 이용한 정보 카드 패턴

### 4.2 설정 (`/admin/settings` → `views/admin/settings/form.ejs`)

- 탭 구조 (기본 정보관리 / 시스템 설정)
  - 상단 탭 네비게이션: `border-b` + 탭 링크 2개
  - 활성 탭은 `border-blue-500 text-blue-600`, 비활성 탭은 그레이 톤
- 회사 정보 탭
  - 회사 기본 정보 섹션 (회사명, 사업자 번호, 주소, 연락처)
  - 헤더/푸터 슬로건, 회사 소개, SNS 링크 섹션
  - 브랜드 키 컬러 섹션 (기본/진한/연한색 + 팔레트 프리셋 + 자동 생성 버튼)
  - 로고 설정 섹션 (현재 로고 프리뷰 + 파일 업로드)
- 시스템 탭
  - 에디터/AI 설정, 소셜 로그인, 포인트, 결제, SMTP 설정 등의 섹션
  - 각 섹션은 같은 카드 패턴(`bg-white rounded-lg shadow-sm border`)을 그대로 사용

### 4.3 리스트 화면 (상품, 회원 등)

- `views/admin/products/list.ejs`, `views/admin/users/list.ejs` 등에서 공통 패턴을 사용합니다.
- AI/개발자가 새로운 리스트 화면을 만들 때는 위 파일들에서 다음 요소를 복사해 사용하는 것을 권장:
  - 상단 설명/검색/등록 버튼 블록
  - 표 헤더 스타일
  - 행 hover, 상태 뱃지 스타일 (`bg-green-100 text-green-800` 등)

## 5. AI / 개발자를 위한 작업 가이드

### 5.1 새로운 관리자 페이지를 만들 때

1. **레이아웃 지정**
   - 관리자 뷰는 반드시 `layout: 'layouts/admin_layout'` 를 사용합니다.

2. **타이틀/서브타이틀 설정**

```js
res.render('admin/xxx', {
  layout: 'layouts/admin_layout',
  title: 'XXX 관리',
  subtitle: 'XXX 데이터를 조회/수정하는 화면입니다.',
  // ...
});
```

3. **페이지 레이아웃 기본 골격**

```html
<div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0">
  <p class="text-sm text-gray-500">이 화면의 간단 설명</p>
  <!-- 검색 폼 / 액션 버튼 등 -->
</div>

<div class="bg-white overflow-hidden shadow-sm rounded-lg">
  <!-- 테이블 / 폼 / 카드 컨텐츠 -->
</div>
```

4. **색상/컴포넌트 일관성 유지**
   - 버튼: 기존 화면에서 사용하는 Blue/Green/Red/Amber 톤을 재사용
   - 배경: 메인 영역은 `bg-gray-50/50`, 카드 내부는 흰색 배경 + 옅은 그림자

### 5.2 AI 프롬프트 팁 (Copilot/Gemini 등)

- 다음과 같은 정보를 함께 제공하면 AI 가 관리자 UI 를 일관되게 생성하는 데 도움이 됩니다.
  - "Tailwind 기반 관리자 레이아웃 (admin_layout.ejs) 사용"
  - "상단 타이틀/서브타이틀과 중앙 흰색 카드(admin-main-content)가 기본 구조"
  - "기존 products/users 리스트 화면과 스타일을 맞춰 달라"
  - "인풋은 관리자 공통 인풋 클래스(w-full rounded-md border-gray-200 px-3 py-2 text-sm ...) 를 사용"

## 6. 관리자 디자인 예시 페이지

- 예시 페이지 EJS: `views/admin/design_guide.ejs`
- URL(예시 제안): `/admin/design-guide`
- 목적
  - 관리자 레이아웃 안에서 공통 레이아웃/컴포넌트가 실제로 어떻게 보이는지 한눈에 확인
  - 새로운 관리자 페이지를 만들 때 복사해 쓸 수 있는 샘플 구조 제공

> 실제 예시 UI 구현은 `views/admin/design_guide.ejs` 를 참고하세요.
