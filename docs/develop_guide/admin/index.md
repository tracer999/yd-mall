# Admin 시스템 인수인계 문서 목록

관리자 시스템(`/admin`)의 기능 및 기술 명세 문서입니다. 인수인계 시 각 메뉴별 상세 문서를 참고하세요.

> 상세 라우트(메서드·경로·파라미터)는 각 문서에 있습니다. 이 색인은 **마운트 단위 진입점**만 정리합니다.

---

## 접근 제어 요약

`/admin` 이하는 `app.js` 에서 `adminMenu` 미들웨어와 함께 마운트되고, `routes/admin.js` 안에서 다음 순서로 통과합니다.

```
adminMenu (사이드바 메뉴 트리) → adminAuth (세션) → adminMallContext (req.adminMallId) → requireMenuAccess(path) (RBAC)
```

- `requireMenuAccess` 는 `admin_menus.visible_roles`(CSV)를 읽습니다. `super_admin` 은 무조건 통과합니다.
- 메뉴 정의가 없거나 `is_active = 0` 인 경로는 **`admin` 역할만** 통과하고 나머지는 403 입니다.
- 로그인/로그아웃(`/admin/login`, `/admin/logout`)은 `adminAuth` 앞에 있어 인증 없이 접근합니다.

### 사이드바 구조 (2뎁스 · 그룹 8개)

사이드바는 **그룹 행(`path IS NULL`) + 잎 메뉴** 2뎁스입니다. 현재 그룹은 9개입니다.

| 그룹 | 잎 메뉴 |
|------|---------|
| 쇼핑몰 설정 | 사이트 설정 · 약관/정책 관리 · Header 설정 · 테마 설정 |
| 메뉴/카테고리 관리 | 카테고리 · 일반 메뉴 관리 · 브랜드 관리 · 시스템 메뉴 설정 · 커스텀 메뉴 관리 · 메뉴 미리보기 |
| 페이지/전시 관리 | 페이지 빌더 · 배너 관리 · 기획전 관리 · 공동구매 관리 · 쇼핑라이브 관리 |
| 상품 관리 | 상품 관리 · 상품 그룹 관리 · 베스트/랭킹 관리 · 쇼핑특가 관리 · 특가 카테고리 · 상품 추천관리 · 아울렛 관리 · 아울렛 카테고리 |
| 프로모션 관리 | 쿠폰 관리 · 포인트 관리 · 이벤트 관리 |
| 멤버십 관리 | 멤버십 대시보드 · 등급 관리 · 등급 평가 정책 · 회원 등급 현황 · 등급 변경·평가 이력 |
| 고객지원 관리 | 문의 관리 · 고객센터 관리(FAQ) · 공지사항 관리 |
| 주문/회원 관리 | 판매 관리 · 배송 관리 · 배송비 정책 · 클레임 관리 · Shopify 주문(`is_active = 0`) · 회원 관리 |
| 운영/시스템 관리 | 운영자 관리 · 관리자 메뉴 관리 · 시스템 설정 |

- 그룹에 속하지 않는 **최상위 잎**은 `몰 관리`(`/admin/malls`)와 `대시보드`(`/admin`)입니다. 다만 **대시보드 행은 `is_active = 0`** 이라 사이드바에 렌더되지 않습니다(라우트 자체는 `requireMenuAccess` 가 없어 로그인만 하면 접근됩니다).
- 권한(`visible_roles`)은 **잎 메뉴에만** 적용됩니다. 그룹 행의 `visible_roles` 는 비어 있고, **보이는 자식이 하나도 없는 그룹은 통째로 숨겨집니다.**

자세한 내용은 [overview.md](./overview.md) · [menus.md](./menus.md) 참고.

---

## 인증 · 대시보드 (requireMenuAccess 미적용)

| URL | 설명 | 문서 |
|-----|------|------|
| `/admin/login`, `/admin/logout` | 로그인(선택적 이메일 2FA)·로그아웃 | [auth.md](./auth.md) |
| `/admin` | 대시보드 (`admin_menus` 행은 `is_active = 0` → 사이드바 미노출) | [dashboard.md](./dashboard.md) |
| `/admin/search-logs` | 검색 로그 | [search_logs.md](./search_logs.md) |
| `/admin/traffic-sources`, `/admin/traffic-sources/drill` | 유입 매체 분석 | [dashboard.md](./dashboard.md) |
| `/admin/popular-products` | 인기 상품 분석 | [dashboard.md](./dashboard.md) |
| `/admin/design-guide` | 관리자 UI 컴포넌트 프리뷰 | (개발용) |

> 위 6개는 `requireMenuAccess` 가 걸려 있지 않아 **로그인한 모든 역할**이 접근할 수 있습니다.

## 서브 라우트 마운트 (`routes/admin.js`)

| 구분 | 마운트 | 설명 | 문서 |
|------|--------|------|------|
| **상품** | `/admin/products` | 상품 CRUD·필터·AI·SEO·추천상품 | [products.md](./products.md) |
| | `/admin/categories` | 카테고리 3뎁스 트리(NORMAL/THEME/BRAND) | [categories.md](./categories.md) |
| | `/admin/brands` | 브랜드 허브 운영(brand_profile·집계 재계산) | [brands.md](./brands.md) |
| | `/admin/product-groups` | 섹션 데이터 소스가 되는 상품 그룹 | [page_builder.md](./page_builder.md) |
| | `/admin/best-groups` | 베스트/랭킹 그룹·MD 픽(핀)·집계 | [best_groups.md](./best_groups.md) |
| | `/admin/recommend-groups` | 상품 추천관리 (`/recommend` 랜딩의 섹션) | [recommend.md](./recommend.md) |
| | `/admin/deals`, `/admin/deal-categories` | 쇼핑특가 — 기간·시간창·요일·선착순. **결제 금액에 직접 반영** | [deals.md](./deals.md) |
| | `/admin/outlet`, `/admin/outlet/categories` | 아울렛(상시 재고 소진 채널) | [outlet.md](./outlet.md) |
| **주문** | `/admin/sales` | 주문 목록·상세·상태 변경·취소 | [sales.md](./sales.md) |
| | `/admin/claims` | 취소·반품·환불 클레임 | [claims.md](./claims.md) |
| | `/admin/shipping` | 송장 입력·배송 완료 | [shipping.md](./shipping.md) |
| | `/admin/shipping-policy` | 몰별 배송비 정책·지역 할증 | [shipping.md](./shipping.md) |
| | `/admin/shopify-orders` | Shopify 주문 (연동 비활성 상태) | — |
| **전시** | `/admin/page-builder` | SDUI 페이지 빌더(섹션 조립·발행·롤백) | [page_builder.md](./page_builder.md) |
| | `/admin/banners` | 배너 5종 + 메인 슬라이더(hero_slide) | [banners.md](./banners.md) |
| | `/admin/exhibitions` | 기획전(상품 전시 랜딩) | [exhibitions.md](./exhibitions.md) |
| | `/admin/events` | 이벤트&혜택(참여형) | [events.md](./events.md) |
| | `/admin/group-buys` | 공동구매(기간·목표수량 조건부 판매) | [group_buys.md](./group_buys.md) |
| | `/admin/lives` | 쇼핑라이브(YouTube/Vimeo 임베드 + 라이브가) | [lives.md](./lives.md) |
| **혜택** | `/admin/coupons` | 쿠폰 발행·수동 지급·사용 내역 | [coupons.md](./coupons.md) |
| | `/admin/points` | 포인트 지급·차감 | [points.md](./points.md) |
| **멤버십** | `/admin/membership` | 등급·혜택·평가정책·회원현황·이력, 결제 연동·평가 배치 | [membership.md](./membership.md) |
| **회원** | `/admin/users` | 회원 목록·상세·활성 토글·삭제 | [users.md](./users.md) |
| | `/admin/operators` | 운영자 계정 (실효 권한: super_admin) | [operators.md](./operators.md) |
| **고객지원** | `/admin/inquiries` | 1:1 문의 답변 | [inquiries.md](./inquiries.md) |
| | `/admin/faqs` | 고객센터 FAQ | [inquiries.md](./inquiries.md) |
| | `/admin/notices` | 공지사항 | [notices.md](./notices.md) |
| **메뉴** | `/admin/menus` | 관리자 사이드바 메뉴(admin_menus) | [menus.md](./menus.md) |
| | `/admin/feature-menus` | 스토어프론트 GNB 기능 메뉴 ON/OFF·순서 | [storefront_menus.md](./storefront_menus.md) |
| | `/admin/system-menus` | 헤더 유틸·우측 레일 고정 메뉴 | [storefront_menus.md](./storefront_menus.md) |
| | `/admin/custom-menus` | 몰별 커스텀 메뉴(개별 기획전·카테고리를 GNB 슬롯에) | [storefront_menus.md](./storefront_menus.md) |
| | `/admin/header-settings` | 헤더 스킨·nav_mode·GNB 슬롯(navigation_config) | [storefront_menus.md](./storefront_menus.md) |
| | `/admin/menu-preview` | 스토어프론트 메뉴 조립 결과 미리보기·GNB 순서 편집 | [storefront_menus.md](./storefront_menus.md) |
| **설정** | `/admin/settings`, `/admin/site-settings`, `/admin/sys-settings` | 회사 정보·시스템 설정(system_settings) | [settings.md](./settings.md) |
| | `/admin/theme-settings` | 테마 토큰(CSS 변수) | [settings.md](./settings.md) |
| | `/admin/malls` | 몰 정의 CRUD + 프리셋 프로비저닝 (실효 권한: super_admin) | [malls.md](./malls.md) |
| | `/admin/policies` | 이용약관·개인정보 버전 관리 | [policies.md](./policies.md) |
| **통계** | `/admin/visitors` | 방문자 통계 | [visitors.md](./visitors.md) |
| **내부** | `/admin/uploads` | TinyMCE 등 에디터 이미지 업로드 | — |

> ⚠️ `routes/admin/orders.js` 는 `routes/admin.js` 어디에도 **마운트되지 않은 사문화 코드**입니다. `/admin/orders` 는 404 이며, 주문 관리는 `/admin/sales` 가 담당합니다.

---

## 목차 (상세 문서)

### 기반
1. [시스템 개요 및 아키텍처](./overview.md) — 미들웨어 체인, RBAC, 라우트 맵, 설정 로딩
2. [관리자 로그인/로그아웃](./auth.md) — 자격 증명 + 선택적 이메일 2FA
3. [운영자 관리](./operators.md) — 계정 CRUD, 역할 4종, bcrypt
4. [멀티몰](./malls.md) — 몰 정의, 프리셋 프로비저닝, 스토어프론트 몰 ↔ 관리자 편집 몰 분리

### 상품 · 카테고리
5. [상품 관리](./products.md) — CRUD, 필터, 이미지·동영상, AI 추천, SEO, 추천 상품
6. [카테고리 관리](./categories.md) — type 3종 × 3뎁스 트리, depthGuard
7. [브랜드 관리](./brands.md) — 브랜드 허브(brand_profile), 집계 재계산
8. [베스트 · 랭킹](./best_groups.md) — 베스트 그룹, 랭킹 집계 스냅샷, MD 픽(핀)
9. [상품 추천관리](./recommend.md) — 추천 그룹 = `/recommend` 랜딩의 섹션
10. [쇼핑특가](./deals.md) — 특가 카테고리, 기간·시간창·요일·선착순, 결제 금액 반영
11. [아울렛](./outlet.md) — 아울렛 상품·카테고리, 노출 임계치(콘텐츠 게이트)

### 주문 · 배송
12. [주문 및 매출 관리](./sales.md) — 목록·상세, 4축 상태 전이, 관리자 취소
13. [클레임 관리](./claims.md) — 취소·반품·환불, 승인 트랜잭션, Toss 환불
14. [배송 관리](./shipping.md) — 송장 입력, 배송 완료, 배송비 정책

### 전시 · 프로모션
15. [페이지 빌더 · SDUI](./page_builder.md) — 섹션 13종, 리졸버 12종, 발행·롤백, 상품 그룹
16. [배너 관리](./banners.md) — 배너 5종, 메인 슬라이더(hero_slide)
17. [기획전](./exhibitions.md) — 시즌·브랜드·테마 상품 전시 랜딩
18. [이벤트&혜택](./events.md) — 응모(APPLY) 참여형
19. [공동구매](./group_buys.md) — 기간·목표수량·공동구매가
20. [쇼핑라이브](./lives.md) — 외부 영상 임베드 + 라이브가

### 혜택
21. [쿠폰 관리](./coupons.md) — 3축 구조, 발급 경로 5종, 할인 계산
22. [포인트 관리](./points.md) — 지급·차감, 적립·사용 흐름
22-1. [멤버십 등급 관리](./membership.md) — 등급·혜택·평가엔진(히스테리시스)·실적원장, 결제 연동·평가 배치

### 회원 · 고객지원
23. [회원 관리](./users.md) — 목록·상세(쿠폰·포인트·주문), 활성 토글
24. [문의 관리](./inquiries.md) — 1:1 문의 답변, 고객센터 FAQ
25. [공지사항 관리](./notices.md) — 게시판 CRUD, 상단 고정

### 메뉴 · 설정
26. [관리자 메뉴](./menus.md) — admin_menus 그룹 트리, visible_roles RBAC
27. [스토어프론트 메뉴](./storefront_menus.md) — feature_menu × mall_feature_menu, custom_menu, navigation_config, 콘텐츠 게이트
28. [사이트 설정](./settings.md) — .env ↔ system_settings 2층 구조, 테마 토큰
29. [약관 및 정책 관리](./policies.md) — 버전 관리, site_settings 동기화

### 통계
30. [대시보드](./dashboard.md) — 운영 현황, 트래픽, 유입 매체, 인기 상품
31. [검색 로그](./search_logs.md) — 검색어 로그, 기간 필터
32. [방문자 통계](./visitors.md) — 기간별 집계, Chart.js

---

*Last Updated: 2026-07-15*
