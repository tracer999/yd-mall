# User 시스템 인수인계 문서 목록

사용자 영역(루트 `/`, 레이아웃 `main_layout`)의 기능 및 기술 명세 문서입니다. 인수인계 시 각 화면별 상세 문서를 참고하세요.

> 상세 라우트(메서드·경로·파라미터)는 각 문서에 있습니다. 이 색인은 **마운트 단위 진입점**만 정리합니다.

---

## 마운트 요약 (`app.js`)

| 구분 | 마운트 | 설명 | 문서 |
|------|--------|------|------|
| **홈·검색** | `/`, `/search` | 메인 홈(SDUI 페이지 빌더로 조립), 통합 검색 | [home.md](./home.md) · [search.md](./search.md) |
| **상품** | `/products` | 목록, 카테고리별, 브랜드별, 상세(slug SEO) | [products.md](./products.md) |
| | `/brands`, `/brands/search.json`, `/brands/:id` | 브랜드 허브(검색·색인) + **브랜드 상세관**(`?tab=home\|best\|new\|all\|benefit`) | [products.md](./products.md) |
| **기능 메뉴** | `/best`, `/best/all`, `/best/tab` | 베스트·랭킹 — BEST 10(기간 탭, AJAX) + 카테고리별 BEST + 브랜드별 BEST | [best.md](./best.md) |
| | `/new` | 신상품 — 카테고리별·브랜드별 섹션(전용 컨트롤러). SDUI 랜딩(`page.slug='new'`)이 있으면 그쪽 우선 | [products.md](./products.md) |
| | `/membership` | 멤버십 제도 소개(정적, 등급 산정 없음) | [../admin/storefront_menus.md](../admin/storefront_menus.md) |
| | `/ranking` → **301 `/best`**, `/deal/today` → **301 `/deals`** | 구 URL 영구 이전(북마크·외부 링크 보존) | [best.md](./best.md) · [promotions.md](./promotions.md) |
| **프로모션** | `/exhibition` | 기획전(상품 전시 랜딩) | [promotions.md](./promotions.md) |
| | `/specialty`, `/specialty/:slug` | 전문관(`exhibition_type='SPECIALTY'` 재사용, 상세는 기획전 컨트롤러 공유) | [promotions.md](./promotions.md) |
| | `/event` | 이벤트&혜택(APPLY 참여) | [promotions.md](./promotions.md) |
| | `/group-buy` | 공동구매(바로구매) | [promotions.md](./promotions.md) |
| | `/coupon` | 쿠폰존(다운로드·코드 등록) | [promotions.md](./promotions.md) |
| | `/deals`, `/deals/:code` | 쇼핑특가 — **결제 금액에 실제 반영되는 유일한 프로모션** | [promotions.md](./promotions.md) |
| | `/live`, `/live/:slug`, `POST /live/:slug/buy` | 쇼핑라이브(YouTube·Vimeo 임베드, 바로구매 전용) | [promotions.md](./promotions.md) |
| | `/outlet` | 아울렛(사유·카테고리·가격대 필터) | [promotions.md](./promotions.md) |
| | `/recommend` | 추천(4섹션, `noindex,follow`) | [promotions.md](./promotions.md) |
| **구매** | `/cart` | 장바구니 | [cart.md](./cart.md) |
| | `/checkout` | 주문·결제(Toss Payments REST 직접 호출) | [checkout.md](./checkout.md) |
| **회원** | `/auth` | OAuth 로그인(Google·Kakao), 추가정보 입력, 약관 재동의 | [auth.md](./auth.md) |
| | `/mypage` | 주문·클레임·쿠폰함·포인트·찜·프로필·탈퇴 | [mypage.md](./mypage.md) |
| | `/likes` | 상품·브랜드 찜 토글 | [mypage.md](./mypage.md) |
| **고객지원** | `/cs` | 고객센터(FAQ 검색·조회수) | [cs.md](./cs.md) |
| | `/inquiries` | 1:1 문의 | [inquiries.md](./inquiries.md) |
| | `/notices` | 공지사항 | [notices.md](./notices.md) |
| | `/boards` | 게시판(`/boards/notice`, `/boards/guide`) | [cs.md](./cs.md) |
| **정적** | `/terms`, `/privacy`, `/about`, `/guide` | 약관·개인정보·회사소개·이용안내 | [terms_pages.md](./terms_pages.md) |
| **내부 API** | `POST /api/kakao-click`, `/api/kakao-inquiry`, `/api/pv-duration` | 카카오 클릭·문의 추적, 체류시간 비콘 | [cs.md](./cs.md) |
| | `/sections` | 섹션 더보기 AJAX | [../admin/page_builder.md](../admin/page_builder.md) |
| **기타** | `/manual` | 온라인 매뉴얼 (`docs/manual/` 렌더) | — |
| | `/design-guide/user` | 사용자 UI 컴포넌트 프리뷰 | (개발용) |

> `featureRoutes` 는 `indexRoutes` 보다 **먼저** 마운트됩니다(`app.js`). 기능 메뉴 경로가 다른 라우트에 먹히지 않게 하기 위함입니다.
> ⚠️ 뒤집어 말하면 **`routes/feature.js` 안에 `/outlet`·`/live`·`/recommend`·`/specialty`·`/coupon`·`/group-buy` 핸들러를 두면 안 됩니다.** `featureRoutes` 가 `'/'` 에 먼저 붙기 때문에 뒤의 `app.use('/outlet', …)` 같은 전용 라우터가 영영 닿지 못합니다(각 라우트 파일 상단 주석).
> **COMING_SOON 랜딩은 "메뉴가 미구현이라서" 뜨는 게 아닙니다.** `feature_menu` 25행은 **전부 `module_ready = 1`** 입니다. 준비중 랜딩은 ① 모듈 자체가 없는 멤버십과 ② **콘텐츠가 0건인 경우**(기획전·공동구매·전문관·추천·쇼핑특가·아울렛·쿠폰·쇼핑라이브·이벤트)에만 쓰이는 폴백입니다. → [layout.md](./layout.md) §10
> 존재하지 않는 경로는 `views/user/404.ejs` 로 렌더됩니다.

---

## 목차 (상세 문서)

### 기반
1. [시스템 개요 및 아키텍처](./overview.md)  
   미들웨어 체인, 라우트 맵, SDUI 전시 엔진, 컨트롤러·뷰 매핑

2. [사용자 레이아웃 (main_layout)](./layout.md)  
   헤더(몰 선택·GNB·3단 카테고리 패널), 우측 유틸 레일, 모바일 하단 시스템 바, 푸터, 테마 토큰

3. [인증](./auth.md)  
   Passport OAuth 전용(Google·Kakao), 추가정보 입력, 약관 재동의, 가입 쿠폰 자동 발급

### 탐색 · 구매
4. [홈](./home.md)  
   SDUI 섹션 조립(page/page_section), 히어로·팝업 배너, 미리보기

5. [상품](./products.md)  
   목록(필터·정렬·페이징·몰 스코프), 신상품 판정, 상세(아울렛 고지·특가), 브랜드 상세관, 최근 본 상품

6. [베스트/랭킹](./best.md)  
   그룹×기간 탭, 랭킹 스냅샷·MD 픽, 배치·크론

7. [검색](./search.md)  
   통합 검색, 검색 로그 기록

8. [장바구니](./cart.md)  
   담기·수정·삭제, 배송비 게이지, 특가 적용, 헤더 뱃지

9. [주문/결제](./checkout.md)  
   배송비·쿠폰·포인트 계산, 서버 금액 재검증, 결제 승인·재고 검증·취소, 4축 주문 상태

### 프로모션
10. [프로모션](./promotions.md)  
    기획전 · 전문관 · 이벤트 · 공동구매 · 쿠폰존 · 쇼핑특가 · 쇼핑라이브 · 아울렛 · 추천 (9모듈의 경계와 각 화면)

### 마이페이지 · 고객지원
11. [마이페이지](./mypage.md)  
    주문·취소/반품 신청, 쿠폰함, 포인트, 찜, 활동, 프로필, 탈퇴

12. [고객센터](./cs.md)  
    FAQ 검색, 게시판, 카카오 문의 추적

13. [1:1 문의](./inquiries.md)  
    문의 목록·작성·상세

14. [공지사항](./notices.md)  
    공지 목록·상세

15. [약관/정책/소개](./terms_pages.md)  
    이용약관, 개인정보 처리방침, 회사 소개, 이용안내

---

*Last Updated: 2026-07-15*
