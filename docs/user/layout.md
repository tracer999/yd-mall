# 사용자 레이아웃 (main_layout)

## 1. 개요

- **파일:** `views/layouts/main_layout.ejs`
- **적용 범위:** 사용자 영역 전체. `app.js`에서 `app.set('layout', 'layouts/main_layout')`로 기본 레이아웃으로 지정되어 있으며, 인증 페이지(`views/auth/*`)도 동일 레이아웃을 명시적으로 사용합니다.
- **역할:** 헤더(탑바·로고·GNB·장바구니)·본문 영역·푸터를 공통으로 감싸고, 브랜드 색상·SEO 메타를 동적으로 적용합니다.

---

## 2. 공통 변수 (레이아웃·뷰에서 사용)

| 변수 | 출처 | 설명 |
|------|------|------|
| `siteSettings` | middleware/siteSettings | 사이트 설정 1건 (로고, 회사명, 브랜드 색상, 연락처, SNS 등) |
| `user` | app.js 전역 (res.locals.user) | 로그인 시 Passport 사용자 객체, 비로그인 시 null |
| `menuCategories` | middleware/menuData | 헤더 GNB용 테마 카테고리 목록 (type='THEME') |
| `cartCount` | middleware/cartData | 헤더에 표시할 장바구니 수량 합계 (비로그인 시 0) |
| `isAdmin` | app.js 전역 | req.user.role === 'super' 일 때 true (관리자모드 링크 노출) |
| `seo` | 각 컨트롤러에서 선택 전달 | title, description, url, image, type, siteName, jsonLd 등 (페이지별 SEO/OG) |

브랜드 색상은 레이아웃 상단에서 `siteSettings.brand_main_color`, `brand_dark_color`, `brand_light_color`를 읽어 hex 보정·대비색 계산 후 CSS 변수로 사용합니다.

---

## 3. head

- **charset / viewport:** UTF-8, width=device-width, initial-scale=1.0
- **theme-color:** `siteSettings.brand_main_color` (기본 #76A764)
- **title:** `seo.title`이 있으면 사용, 없으면 `siteSettings.company_name | Premium Health Food`
- **SEO (seo 객체 있을 때):** description, robots, canonical, Open Graph(og:type, title, description, image, url, site_name), 선택 시 jsonLd 스크립트
- **스타일:** `/css/style.css`, Bootstrap Icons, Google Fonts (IBM Plex Sans KR, Merriweather)
- **인라인 스타일:** `:root`에 브랜드용 CSS 변수 정의 (--gh-primary, --gh-primary-dark, --gh-secondary, --gh-primary-contrast 등), body·버튼·링크·탭·칩 등 공통 클래스 (.gh-btn-primary, .brand-text, .brand-cta, .brand-tab 등)

---

## 4. 헤더

### 4.1 탑바 (Top Bar)

- 배경: `--gh-secondary` (연한 브랜드색)
- 좌측: `siteSettings.header_slogan` (없으면 기본 문구)
- 우측: 로그인 시 "환영합니다, {user.name}님", 마이페이지·로그아웃 링크 / 비로그인 시 로그인·회원가입 링크
- `isAdmin`이 true이면 "관리자모드" 링크 (`/admin`) 추가

### 4.2 메인 네비 (로고·GNB·아이콘)

- **로고:** `/` 링크. `siteSettings.logo_url`이 있으면 이미지, 없으면 원형 "G" + `siteSettings.company_name`
- **데스크톱 메뉴:** 홈, 전체상품, 테마 카테고리(`menuCategories`), 공지사항, 검색 아이콘(`/search`), 장바구니 아이콘(`/cart`, `cartCount` 배지)
- **모바일:** 햄버거 버튼으로 `#mobile-menu` 토글, 동일 링크들 + 1:1 문의 링크

---

## 5. 본문

- `<main class="flex-grow brand-page-surface">` 안에 `express-ejs-layouts`가 주입하는 `<%- body %>`가 들어갑니다. 각 라우트의 뷰 내용이 여기에 렌더됩니다.

---

## 6. 푸터

- **브랜딩:** 회사명, `siteSettings.slogan`, SNS 링크(instagram, facebook, youtube 설정 시)
- **고객 센터:** 공지사항, 1:1 문의하기, 자주 묻는 질문(`/faq`) 링크
- **회사 정보:** 대표전화, 이메일, 주소 (`siteSettings.contact_phone`, `contact_email`, `address`), 회사 소개(`/about`), 이용약관(`/terms`), 개인정보처리방침(`/privacy`)
- 하단: 저작권 문구 (연도 + company_name)

---

## 7. 스크립트

- 모바일 메뉴 토글: `#mobile-menu-btn` 클릭 시 `#mobile-menu`의 `hidden` 클래스 토글

---

*Last Updated: 2026-02-08*
