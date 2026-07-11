# 운영 및 기타 관리 (Operation & Others) — 개요

상품·주문·배송 외에 쇼핑몰 운영에 필요한 기능들의 **개요**입니다. 각 항목별 상세는 링크된 문서를 참고하세요.

> 전체 문서 목록과 라우트 마운트 표는 [index.md](./index.md) 에 있습니다. 이 문서는 운영 담당자가 자주 쓰는 부가 기능만 추린 요약입니다.

---

## 1. 카테고리 관리

- **URL:** `/admin/categories`
- **기능:** type 3종(NORMAL / THEME / BRAND) 탭 × 최대 3뎁스 트리 CRUD, 뎁스별 아코디언 UI, 노출 설정(PC/모바일), 브랜드 로고 업로드
- **주의:** 뎁스 초과·순환 참조·자식 있는 부모 삭제는 `services/tree/depthGuard.js` 가 막습니다.
- **상세 문서:** [categories.md](./categories.md)

---

## 2. 배너 관리

- **URL:** `/admin/banners`, `/admin/banners/hero-slides`
- **기능:** 배너 5종(MAIN / CATEGORY / POPUP / BRAND / MENU) 등록·수정·삭제, 게시 기간, 노출 순서, 메인 슬라이더(`hero_slide`) 별도 CRUD
- **상세 문서:** [banners.md](./banners.md)

---

## 3. 페이지 빌더 (SDUI)

- **URL:** `/admin/page-builder`, `/admin/product-groups`
- **기능:** 홈·기획 페이지를 섹션 단위로 조립(섹션 타입 13종), 발행 스냅샷·롤백, 섹션의 데이터 소스가 되는 상품 그룹 관리
- **상세 문서:** [page_builder.md](./page_builder.md)

---

## 4. 프로모션 3종

| 모듈 | URL | 성격 |
|------|-----|------|
| 기획전 | `/admin/exhibitions` | 시즌·브랜드·테마별 **상품 전시 랜딩** |
| 이벤트&혜택 | `/admin/events` | 응모(APPLY) 등 **참여·혜택** 중심 |
| 공동구매 | `/admin/group-buys` | 기간·목표수량·공동구매가가 있는 **조건부 판매 캠페인** |

- **상세 문서:** [exhibitions.md](./exhibitions.md) · [events.md](./events.md) · [group_buys.md](./group_buys.md)

---

## 5. 쿠폰 · 포인트

- **URL:** `/admin/coupons`, `/admin/points`
- **쿠폰:** 발행(정액·정률·무료배송), 적용 범위(`scope_json`), 다운로드 쿠폰존, 수동 지급, 사용 내역
- **포인트:** 수동 지급·차감, 구매 시 적립·사용, 주문 취소 시 환급·회수
- **상세 문서:** [coupons.md](./coupons.md) · [points.md](./points.md)

---

## 6. 회원 관리

- **URL:** `/admin/users`
- **기능:** 회원 목록(검색·상태 필터)·상세(발급 쿠폰·포인트 내역·주문 내역), 활성/비활성 토글, 회원 삭제
- **상세 문서:** [users.md](./users.md)

---

## 7. 운영자 관리

- **URL:** `/admin/operators`
- **접근:** `admin_menus.visible_roles = 'super_admin'` + 라우터 내부 `requireSuperAdmin` 2중 가드 → **실효 권한은 super_admin 단독**
- **기능:** 관리자 계정 등록·수정·삭제, 역할 4종, bcrypt, 2FA 사용 여부
- **상세 문서:** [operators.md](./operators.md)

---

## 8. 사이트 · 테마 설정

- **URL:** `/admin/settings`, `/admin/site-settings`, `/admin/sys-settings`, `/admin/theme-settings`
- **회사 정보:** 몰별 `site_settings` 1행 (로고·파비콘·연락처·SNS·브랜드 색상·GA4)
- **시스템 설정:** `system_settings` 테이블 → 앱 기동 시 `process.env` 를 **덮어씀**(빈 값은 스킵). TinyMCE·OpenAI·OAuth·SMTP·Toss·Shopify 키
- **테마:** `theme.config_json` 토큰이 CSS 변수로 `<head>` 에 직접 삽입되므로 서버 검증 필수
- **상세 문서:** [settings.md](./settings.md)

---

## 9. 멀티몰

- **URL:** `/admin/malls`
- **기능:** 몰 정의 CRUD. 관리자 편집 몰(`req.adminMallId`)과 스토어프론트 몰(`req.mallId`)은 별개
- **상세 문서:** [malls.md](./malls.md)

---

## 10. 약관 및 정책 관리

- **URL:** `/admin/policies`
- **기능:** 이용약관(TERMS)·개인정보처리방침(PRIVACY) 버전 관리, 상세·수정·활성화, `site_settings` 동기화(삭제 라우트 없음)
- **상세 문서:** [policies.md](./policies.md)

---

## 11. 고객지원

- **URL:** `/admin/inquiries`, `/admin/faqs`, `/admin/notices`
- **기능:** 1:1 문의 답변, 고객센터 FAQ CRUD(저장 시 HTML 새니타이즈), 공지사항 게시판(상단 고정 최대 3건)
- **상세 문서:** [inquiries.md](./inquiries.md) · [notices.md](./notices.md)

---

## 12. 메뉴 관리

| 대상 | URL | 데이터 |
|------|-----|--------|
| 관리자 사이드바 | `/admin/menus` | `admin_menus` (그룹 트리 + `visible_roles` RBAC) |
| 스토어프론트 GNB | `/admin/feature-menus` | `feature_menu` × `mall_feature_menu` |
| 헤더 유틸·우측 레일 | `/admin/system-menus` | `feature_menu` (position 분리) |
| 헤더 레이아웃 | `/admin/header-settings` | `navigation_config` |
| 조립 결과 확인 | `/admin/menu-preview` | (읽기 전용) |

- **상세 문서:** [menus.md](./menus.md) · [storefront_menus.md](./storefront_menus.md)

---

## 13. 통계

- **URL:** `/admin` (대시보드), `/admin/traffic-sources`, `/admin/popular-products`, `/admin/search-logs`, `/admin/visitors`
- **상세 문서:** [dashboard.md](./dashboard.md) · [search_logs.md](./search_logs.md) · [visitors.md](./visitors.md)

---

*Last Updated: 2026-07-11*
