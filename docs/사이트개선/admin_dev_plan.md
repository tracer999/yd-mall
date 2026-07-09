# 관리자(Admin) 개발 문서 — 쇼핑몰 빌더 운영 콘솔

> 이 문서는 **관리자 화면**만 다룬다. 스토어프론트(사용자 화면)는 [`frontend_dev_plan.md`](./frontend_dev_plan.md) 참조.
>
> **출처**: `관리자 개선.md` · `shopping_mall_builder_menu_design_summary.md` · `flexible_shopping_mall_builder_dev_plan.md`
> → 본 문서로 통합·대체되어 **삭제됨**. 원문이 필요하면 git 이력에서 조회한다:
> `git show 4528e44:"docs/사이트개선/관리자 개선.md"`
>
> 최종 갱신: 2026-07-09

---

## 0. 설계 원칙 (확정)

관리자는 **"완전 자유형 빌더 관리자"가 아니라 "운영자가 필요한 설정만 안전하게 조정하는 관리자"** 로 간다.

```text
카테고리 관리   = 상품 탐색 구조 관리 (동적)
일반 메뉴 관리   = 사전 정의 기능 메뉴 ON/OFF (URL·위치 고정)
커스텀 메뉴 관리 = 제한된 자유 메뉴 (슬롯 제한)
시스템 메뉴 설정 = 로그인/장바구니/마이페이지 등 고정 기능 (노출 여부만)
페이지/전시 관리 = 메뉴 클릭 후 보여줄 화면 구성
```

### 두 가지 핵심 분리
1. **메뉴 관리 ↔ 페이지/전시 관리 분리**
   - 메뉴 = "상단 GNB에 무엇을 보여줄 것인가"
   - 페이지/전시 = "그 메뉴에 들어갔을 때 어떤 화면을 보여줄 것인가"
   - 섞으면 관리자 구조가 급격히 복잡해진다.

2. **위치(position) 고정 원칙** *(사용자 확정, 2026-07-09)*
   - 커스텀 메뉴를 **제외한** 모든 메뉴는 위치가 **코드에 고정**된다.
   - 운영자는 **ON/OFF · 표시명 · 순서**만 조정한다.
   - 예: 일반 메뉴 → `gnb` / 장바구니·찜·최근본 → `right_rail` / 로그인·검색 → `header_util`

### `module_ready` 게이트 (구현됨)
`feature_menu.module_ready = 0` 이면 운영자가 메뉴를 **켜도 스토어프론트에 노출되지 않는다.**
렌더 조건은 항상 `is_enabled AND module_ready`. → **죽은 링크가 구조적으로 발생 불가.**

---

## 1. ⚠️ 명칭 충돌 (반드시 정리)

현재 `/admin/menus` 는 **관리자 사이드바 메뉴(`admin_menus` 테이블)** 를 관리하는 화면이다.
본 설계의 "메뉴 관리"(스토어프론트 GNB)와 **이름이 겹친다.**

| 대상 | 현재 경로 | 신규 명칭/위치 |
|---|---|---|
| 관리자 사이드바 메뉴 | `/admin/menus` ("메뉴관리") | **운영/시스템 관리 > 관리자 메뉴 관리** |
| 스토어프론트 GNB/카테고리 | (없음) | **메뉴/카테고리 관리** (신설) |

---

## 2. 관리자 메뉴 구조 (8 그룹)

현재 `admin_menus` 는 **19건이 전부 최상위(그룹 없음)** 이다. `parent_id` 컬럼은 존재하나 미사용.
아래 8개 그룹으로 재편한다.

```text
관리자
├─ 1. 대시보드
├─ 2. 쇼핑몰 설정
│   ├─ 기본 정보 / 로고·브랜드 / 테마 / Header / Footer / 검색 / 정책
├─ 3. 메뉴/카테고리 관리          ★ 신설 (M6)
│   ├─ 카테고리 관리 / 일반 메뉴 / 커스텀 메뉴 / 시스템 메뉴 / 모바일 메뉴 / 메뉴 미리보기
├─ 4. 페이지/전시 관리
│   ├─ 메인 페이지(페이지 빌더) / 카테고리 페이지 / 기획전 / 상품 그룹 / 배너 / 발행·예약
├─ 5. 상품 관리
│   ├─ 상품 목록·등록 / 옵션·SKU / 재고 / 브랜드 / 진열 상태 / 일괄 업로드
├─ 6. 프로모션 관리
│   ├─ 쿠폰 / 할인 / 오늘특가 / 베스트 / 이벤트 / 공동구매 / 포인트 / 멤버십
├─ 7. 주문/회원 관리
│   ├─ 주문 / 취소·반품·교환 / 배송 / 회원 / 회원 등급 / 리뷰·문의
└─ 8. 운영/시스템 관리
    ├─ 관리자 계정 / 권한 그룹 / 관리자 메뉴 관리 / 공지사항 / 고객센터
    ├─ 외부 연동 설정 / 업로드 관리 / 로그·통계 / 알림 / 백업·복구
```

### 2.1 `admin_menus` 그룹화 마이그레이션 (선행 작업 A1)

`admin_menus` 스키마: `id, name, path, icon_class, display_order, parent_id, is_active, visible_roles`
→ 스키마 변경 **불필요**. 그룹 행 8건을 `path = NULL` 로 추가하고 기존 19건의 `parent_id` 를 지정한다.

| 기존 메뉴 | id | 이동할 그룹 |
|---|---|---|
| 대시보드 | 1 | (그룹 없음, 최상위 유지) |
| 사이트 설정 | 15 | 2. 쇼핑몰 설정 |
| 시스템 설정 | 16 | 8. 운영/시스템 (외부 연동 설정) |
| 약관/정책 관리 | 10 | 2. 쇼핑몰 설정 (정책 설정) |
| 카테고리 | 2 | 3. 메뉴/카테고리 관리 |
| 페이지 빌더 | 21 | 4. 페이지/전시 관리 (메인 페이지 관리) |
| 전시관리(레거시) | 19 | 4. 페이지/전시 관리 → **폐기 예정** |
| 배너 관리 | 4 | 4. 페이지/전시 관리 |
| 상품 관리 | 3 | 5. 상품 관리 |
| 쿠폰 관리 | 13 | 6. 프로모션 관리 |
| 포인트 관리 | 14 | 6. 프로모션 관리 |
| 판매 관리 | 5 | 7. 주문/회원 관리 |
| 배송 관리 | 6 | 7. 주문/회원 관리 |
| Shopify 주문 | 20 | 7. 주문/회원 관리 |
| 회원 관리 | 7 | 7. 주문/회원 관리 |
| 문의 관리 | 8 | 7. 주문/회원 관리 (리뷰·문의) |
| 운영자 관리 | 11 | 8. 운영/시스템 |
| 메뉴관리(admin_menus) | 12 | 8. 운영/시스템 → **"관리자 메뉴 관리"로 개명** |
| 공지사항 관리 | 17 | 8. 운영/시스템 |
| 접속 통계(visitors) | – | 8. 운영/시스템 (로그·통계) |

> 구현 시 `scripts/migrate_admin_menu_groups.js` (멱등)로 작성한다.
> `middleware/adminMenu.js` 와 사이드바 뷰가 2뎁스 렌더를 지원하는지 먼저 확인할 것.

---

## 3. 구현 현황 매트릭스

범례: ✅ 구현 · 🟡 부분 구현 · ⬜ 미구현

### 3.1 대시보드
| 기능 | 상태 | 근거 |
|---|---|---|
| 대시보드 | ✅ | `/admin`, `dashboardController.js` |

### 3.2 쇼핑몰 설정
| 기능 | 상태 | 근거 / 비고 |
|---|---|---|
| 기본 정보(상호·연락처·주소·사업자) | ✅ | `/admin/site-settings`, `site_settings` |
| 로고/브랜드 컬러/파비콘/OG | ✅ | `site_settings.logo_url`, `brand_*_color`, `favicon_url`, `kakao_share_image_url` |
| 정책 설정(약관/개인정보) | ✅ | `/admin/policies` |
| **테마 설정** | ⬜ | `theme` 테이블 없음. CSS 변수는 `main_layout.ejs` 인라인 주입 |
| **Header 설정** | ⬜ | `navigation_config` 테이블은 **생성됨**, 관리 UI 없음 |
| **Footer 설정** | 🟡 | SNS·회사정보만 `site_settings` 에 있음. Footer 커스텀 메뉴 없음 |
| **검색 설정** | ⬜ | 검색창 ON/OFF·위치 설정 없음 (`navigation_config.use_search_bar` 필드만 존재) |

### 3.3 메뉴/카테고리 관리 ★ 최우선
| 기능 | 상태 | 근거 / 비고 |
|---|---|---|
| 카테고리 관리 | 🟡 | `/admin/categories` 존재하나 **평면**. `parent_id` 미사용, 트리 UI 없음. **M1에서 `depth·is_active·pc_visible·mobile_visible·slug·mall_id` 컬럼은 추가 완료** |
| 일반 메뉴 관리 (ON/OFF) | ⬜ | `feature_menu`/`mall_feature_menu` **테이블·시드 완료(M1·M2)**, 관리 UI 없음 → **M6** |
| 커스텀 메뉴 관리 | ⬜ | `custom_menu` 테이블 완료, UI 없음 → **M6** |
| 시스템 메뉴 설정 | ⬜ | `feature_menu.is_system/is_required` 로 모델링 완료, UI 없음 → **M6** |
| 모바일 메뉴 설정 | ⬜ | `pc_visible`/`mobile_visible` 컬럼만 존재 |
| 메뉴 미리보기 | ⬜ | — |
| SEO 제목/설명(카테고리) | ⬜ | `categories.seo_config` 미도입 |
| 카테고리 대표 이미지(메가메뉴) | ⬜ | `logo_image_path` 는 BRAND 용도로만 사용 중 |

### 3.4 페이지/전시 관리
| 기능 | 상태 | 근거 / 비고 |
|---|---|---|
| 메인 페이지 관리(섹션 CRUD·순서·복제) | ✅ | `/admin/page-builder`, `pageBuilderService.js` |
| 미리보기(PC/모바일) | ✅ | `getHomePreview`, iframe |
| 발행 / 롤백 | ✅ | `page_revision` 스냅샷 |
| **예약 발행** | ⬜ | 스케줄러 없음 |
| 드래그앤드롭 정렬 | 🟡 | 위/아래 버튼만. 완전 DnD 미구현 |
| 배너 관리 | ✅ | `/admin/banners` |
| 상품 그룹 관리 | 🟡 | `product_group(_item)` 테이블 O. **전용 관리 화면 없음** (page-builder 에서 선택만) |
| 카테고리 페이지 관리 | ⬜ | — |
| 기획전 페이지 관리 | ⬜ | `EXHIBITION` 모듈 자체가 없음 |
| 섹션 템플릿 관리 | ⬜ | `sectionRegistry.js` 코드 고정 (의도된 설계) |
| **전시관리(레거시)** | 🟡 | `/admin/display` + `main_display_*`. **`page_section` 으로 대체됨 → 폐기 대상** |

### 3.5 상품 관리
| 기능 | 상태 | 근거 / 비고 |
|---|---|---|
| 상품 목록/등록/수정 | ✅ | `/admin/products` |
| 상품 진열 상태 | ✅ | `products.status`(ON/SOLD_OUT/COMING_SOON/RESTOCK/OFF), `visibility` |
| 브랜드 관리 | 🟡 | `categories.type='BRAND'` 로 관리. 전용 화면 아님 |
| 재고 관리 | 🟡 | `products.stock` 단일 필드. 재고 이력·알림 없음 |
| 옵션/SKU 관리 | ⬜ | 단일 variant 전제 (Shopify 동기화도 Default Title 1개) |
| 상품 일괄 업로드 | ⬜ | Shopify 동기화 스크립트만 존재 |
| Shopify 동기화 | ✅ | `syncService.js` + `system_settings.shopify_sync_enabled` 토글 |

### 3.6 프로모션 관리
| 기능 | 상태 | 근거 / 비고 |
|---|---|---|
| 쿠폰 관리 | 🟡 | `/admin/coupons` 라우트·뷰 존재, **admin_menus 비활성** |
| 포인트 관리 | 🟡 | `/admin/points` 존재, **비활성** |
| 할인 관리 | ⬜ | `products.discount_rate` 필드만 |
| 오늘특가 관리 | ⬜ | `product_badge='DEADLINE_SALE'` 수동 지정 |
| 베스트 관리 | ⬜ | `product_badge='BEST'` 수동 지정 |
| 이벤트 관리 | ⬜ | `/event` 는 공지 게시판 302 별칭 |
| 공동구매 관리 | ⬜ | `GROUP_BUY` 모듈 없음 (`module_ready=0`) |
| 멤버십 혜택 관리 | ⬜ | `MEMBERSHIP` 모듈 없음 |

### 3.7 주문/회원 관리
| 기능 | 상태 | 근거 / 비고 |
|---|---|---|
| 회원 관리 | ✅ | `/admin/users` |
| Shopify 주문 | ✅ | `/admin/shopify-orders` |
| 판매(주문) 관리 | 🟡 | `/admin/sales` 존재, **비활성** |
| 배송 관리 | 🟡 | `/admin/shipping` 존재, **비활성** |
| 문의 관리 | 🟡 | `/admin/inquiries` 존재, **비활성** |
| 취소/반품/교환 | ⬜ | — |
| 회원 등급 관리 | ⬜ | — |
| 리뷰 관리 | ⬜ | 리뷰 테이블은 있으나 관리 화면 없음 |
| 장바구니/관심상품 통계 | ⬜ | — |

### 3.8 운영/시스템 관리
| 기능 | 상태 | 근거 / 비고 |
|---|---|---|
| 관리자 계정 관리 | ✅ | `/admin/operators` |
| 관리자 메뉴 관리 | ✅ | `/admin/menus` (개명 필요) |
| 공지사항 관리 | ✅ | `/admin/notices` |
| 외부 연동 설정 | ✅ | `/admin/sys-settings` (`system_settings`: Shopify/OpenAI/OAuth/SMTP/Toss/TinyMCE) |
| 업로드 관리 | ✅ | `/admin/uploads` (문서 원안에 누락된 항목) |
| 접속 통계 | ✅ | `/admin/visitors` |
| 권한 그룹 관리 | 🟡 | `admin_menus.visible_roles` + `adminRoleGuard.js`. 별도 권한 그룹 화면 없음 |
| **고객센터 관리** | ⬜ | **FAQ 모듈 신설 필요** (`faq`, `faq_category`). → 프론트 M8 과 짝 |
| 알림 설정 | ⬜ | — |
| 로그 관리 | 🟡 | `logs/access.log` 파일. 관리 화면 없음 |
| 데이터 백업/복구 | ⬜ | — |

---

## 4. 메뉴/카테고리 관리 상세 설계 (M6)

가장 우선순위가 높은 신규 관리 화면. DB는 **이미 준비되어 있다**(M1/M2 완료).

### 4.1 카테고리 관리
경로: `관리자 > 메뉴/카테고리 관리 > 카테고리 관리`

| 항목 | 컬럼 | 상태 |
|---|---|---|
| 카테고리명 | `categories.name` | ✅ |
| 상위 카테고리 | `categories.parent_id` | 컬럼 O, UI ⬜ |
| depth (**최대 3**) | `categories.depth` | 컬럼 O(M1), 강제 로직 ⬜ |
| URL slug | `categories.slug` | 컬럼 O(M1), 라우팅 ⬜ |
| 노출 순서 | `categories.display_order` | ✅ |
| 사용 여부 | `categories.is_active` | 컬럼 O(M1) |
| PC/Mobile 노출 | `pc_visible` / `mobile_visible` | 컬럼 O(M1) |
| 대표 이미지 | ⬜ | 메가메뉴용 |
| SEO 제목/설명 | ⬜ | `seo_config` 미도입 |

**필수 구현**: `services/tree/depthGuard.js`
- `assertDepthAllowed({ parentId, maxDepth: 3 })` → `부모.depth + 1 > 3` 이면 저장 거부
- `recalcSubtreeDepth(nodeId)` → 부모 이동 시 자신+후손 depth 일괄 갱신
- `navigation_config.category_max_depth` (기본 3) 를 상한값 소스로 사용

> **주의**: `type`(NORMAL/THEME/BRAND)은 뎁스가 아니다. 병렬 분류축이며 뎁스 제한은 각 type 트리 내부에서 독립 적용.

### 4.2 일반 메뉴 관리 (ON/OFF)
경로: `관리자 > 메뉴/카테고리 관리 > 일반 메뉴 관리`

**운영자가 URL을 직접 입력하지 못하게 한다.** (잘못된 URL 방지 · 모듈 연결 보장 · SEO 구조 유지 · QA 범위 축소)
허용: **사용 여부 · 메뉴명 · 노출 순서 · PC/Mobile 노출 · 로그인 필요 · 노출 기간 · 배지**

현재 카탈로그(`feature_menu`, `position='gnb'`) — **23건 중 GNB 13건**:

| 코드 | 기본명 | 표준 URL | `module_ready` | 몰1 기본 |
|---|---|---|---|---|
| `CATEGORY` | 카테고리 | (드롭다운) | 1 | ON (고정) |
| `TODAY_DEAL` | 오늘특가 | `/deal/today` | 1 | ON |
| `BEST` | 베스트 | `/best` | 1 | ON |
| `NEW_PRODUCT` | 신상품 | `/new` | 1 | ON |
| `EVENT` | 이벤트&혜택 | `/event` | 1 | ON |
| `BRAND` | 브랜드 | `/brands` | 1 | OFF |
| `EXHIBITION` | 기획전 | `/exhibition` | **0** | OFF |
| `RANKING` | 랭킹 | `/ranking` | **0** | OFF |
| `OUTLET` | 아울렛 | `/outlet` | **0** | OFF |
| `COUPON` | 쿠폰 | `/coupon` | **0** | OFF |
| `MEMBERSHIP` | 멤버십 | `/membership` | **0** | OFF |
| `GROUP_BUY` | 공동구매 | `/group-buy` | **0** | OFF |
| `LIVE` | 쇼핑라이브 | `/live` | **0** | OFF |

> UI에서 `module_ready = 0` 항목은 **"모듈 미구현"** 배지와 함께 **비활성(토글 잠금)** 으로 표시한다.

**미구현 항목**: `badge_type`(NEW/HOT/SALE 배지) 컬럼이 `mall_feature_menu` 에 없다 → 추가 필요.

### 4.3 커스텀 메뉴 관리
경로: `관리자 > 메뉴/카테고리 관리 > 커스텀 메뉴 관리`

| 위치 | 허용 개수 | 제어 |
|---|---|---|
| Header GNB | **최대 3** | `navigation_config.max_custom_items` (기본 3) |
| 메가메뉴 프로모션 | 최대 5 | ⬜ |
| Footer | 최대 20 | ⬜ |
| 모바일 퀵 메뉴 | 최대 5 | ⬜ |

`custom_menu` 현재 컬럼: `display_name, link_type(internal/external), link_url, location, sort_order, is_enabled, pc_visible, mobile_visible, login_required, new_window, visible_start_at, visible_end_at`

**미구현/추가 필요**:
- `link_type` 확장: `EXHIBITION` / `PRODUCT_GROUP` / `BRAND` / `CATEGORY` (현재 internal/external 2종)
- `link_target`(내부 리소스 id) 컬럼
- `badge_type`(NEW/HOT/SALE)
- `tracking_code`(캠페인 분석)

**서버 측 강제 규칙**: 슬롯 초과 저장 거부 / 메뉴명 10자 제한 / 외부 링크 기본 새 창 / 기간 종료 시 자동 숨김.

### 4.4 시스템 메뉴 설정
경로: `관리자 > 메뉴/카테고리 관리 > 시스템 메뉴 설정`

`feature_menu.is_system = 1` 인 행. **삭제 불가**, 노출 여부/표시명/순서만.
`is_required = 1` 은 **끌 수도 없다**(로그인·마이쇼핑·장바구니·검색·TOP).

| 코드 | position | URL | `is_required` |
|---|---|---|---|
| `HEADER_SEARCH` | header_util | `/search` | 1 |
| `HEADER_LOGIN` | header_util | `/auth/login` | 1 |
| `HEADER_MYPAGE` | header_util | `/mypage` | 1 |
| `HEADER_CART` | header_util | `/cart` | 1 |
| `HEADER_CS` | header_util | `/boards/notice` → **`/cs` 로 승격 예정(M8)** | 0 |
| `RAIL_CART` | right_rail | `/cart` | 1 |
| `RAIL_WISHLIST` | right_rail | `/mypage/likes` | 0 |
| `RAIL_BRAND_WISHLIST` | right_rail | `/mypage/brand-likes` | 0 |
| `RAIL_RECENT` | right_rail | (client) | 0 |
| `RAIL_TOP` | right_rail | (client) | 1 |

### 4.5 모바일 메뉴 설정
모바일 하단 탭은 **고정 추천**: `홈 / 카테고리 / 검색 / 장바구니 / 마이`
그 외는 `mobile_visible` 플래그로 제어. 모바일 전용 커스텀 메뉴 최대 5개.

---

## 5. 권한 그룹 설계

현재: `admin_menus.visible_roles` + `middleware/adminRoleGuard.js` (메뉴 단위 노출 제어)
목표: 권한 **그룹** 단위 관리 화면.

| 권한 그룹 | 접근 가능 그룹 |
|---|---|
| 최고관리자 | 전체 |
| 몰 관리자 | 2·3·4·5·7 |
| 상품 관리자 | 5, 3(조회) |
| 전시 관리자 | 3, 4 |
| 프로모션 관리자 | 6 |
| 주문 관리자 | 7 |
| CS 관리자 | 7(회원·문의), 8(고객센터) |
| 읽기 전용 | 전체 조회만 |

---

## 6. DB 참조

### 6.1 관리자 메뉴 (시스템 고정값)
```text
admin_menus
├─ id, parent_id            ← parent_id 는 존재하나 현재 미사용 (그룹화 시 활용)
├─ name, path, icon_class
├─ display_order
├─ is_active
└─ visible_roles            ← 권한 제어
```
> 원안의 `menu_code`, `required_permission`, `is_system` 은 **현재 스키마에 없다.** 그룹화(A1)에는 불필요하나, 권한 그룹 고도화 시 도입 검토.

### 6.2 스토어프론트 메뉴 (M1 구현 완료)
```text
categories          (동적)   + mall_id, slug, depth(≤3), is_active, pc_visible, mobile_visible
feature_menu        (고정)   feature_code, default_name, default_path, position,
                             required_module, module_ready, is_system, is_required
mall_feature_menu   (몰별)   display_name, sort_order, is_enabled, pc/mobile_visible,
                             login_required, visible_start_at, visible_end_at
custom_menu         (몰별)   display_name, link_type, link_url, location, ...
navigation_config   (몰별)   header_layout_type, category_display_type,
                             max_gnb_items, max_custom_items, category_max_depth,
                             use_mega_menu, use_search_bar
brand_likes         (사용자) user_id, category_id  ← 우측 레일 '찜한 브랜드'
```
적용 스크립트: `scripts/migrate_menu_architecture.js` (멱등). `tables.sql` 반영 완료.

---

## 7. 우선 구현 순서

### A. 선행 정리
- [ ] **A1** `admin_menus` 8그룹 재편 + 2뎁스 사이드바 렌더 (`scripts/migrate_admin_menu_groups.js`)
- [ ] **A2** `/admin/menus` → "관리자 메뉴 관리"로 개명, 운영/시스템 그룹으로 이동
- [ ] **A3** 비활성 메뉴 정리: 쿠폰·포인트·판매·배송·문의 — 완성 후 활성화할지, 숨길지 결정

### B. 1차 구현 (핵심)
- [ ] **B1** 카테고리 관리 트리 UI + `depthGuard`(max 3) + `is_active`/`pc·mobile_visible`
- [ ] **B2** 일반 메뉴 관리 (ON/OFF·표시명·순서, `module_ready=0` 잠금 표시)
- [ ] **B3** 커스텀 메뉴 관리 (GNB 슬롯 3 제한, 서버 측 강제)
- [ ] **B4** 시스템 메뉴 설정 (`is_required` 잠금)
- [ ] **B5** Header 설정 (`navigation_config` UI)
- [ ] **B6** 상품 그룹 관리 전용 화면
- [ ] **B7** 메뉴 미리보기

> B1~B4 는 프론트 **M4(navigationService) · M5(렌더 전환)** 와 짝을 이룬다.
> **M5 렌더 전환이 끝나야** 관리자 변경이 실제 GNB에 반영된다.

### C. 2차 구현
- [ ] 모바일 메뉴 설정 / 카테고리 페이지 관리 / 기획전 관리
- [ ] 쿠폰·할인 관리 활성화 / 오늘특가·베스트 관리
- [ ] **고객센터 관리 + FAQ 모듈** (프론트 M8과 동시)
- [ ] 테마 설정 (P4)

### D. 3차 구현
- [ ] 예약 발행 스케줄러 / 버전 관리 고도화
- [ ] 권한 그룹 관리 화면
- [ ] 로그 관리 / 백업·복구 / A/B 테스트 / 고급 통계

---

## 8. 정리 대상 (기술 부채)

| 항목 | 조치 |
|---|---|
| `main_display_sections` / `main_display_products` + `/admin/display` | `page_section` 이 대체. 전환 검증 후 **제거** |
| `storefront_menu` | `feature_menu` 계열이 대체. 프론트 M5 검증 후 **M7에서 제거** |
| `tables.sql` 노후화 | 실제 DB에만 있는 테이블 다수(`recent_views`, `product_seo`, `shopify_*` 등). 스키마 확인은 **실 DB를 소스 오브 트루스**로 |
| `/admin/menus` 명칭 | "관리자 메뉴 관리"로 개명 (A2) |

---

## 9. 공통 개발 규약

- **DB 컬럼** snake_case / **URL** kebab-case / **JS** camelCase
- 컨트롤러 액션명: `getList`, `getDetail`, `postForm`, `postUpdate`, `postDelete`
- SQL은 **파라미터화 쿼리**만 (문자열 결합 금지)
- 스키마 변경 **3중 반영**: 개발 DB → 상용 DB → `tables.sql`
- 파일 800줄 초과 금지, 함수 50줄 이내
- 신규 테이블은 `mall_id BIGINT NOT NULL DEFAULT 1` 포함 (멀티몰 대비)
- 마이그레이션 스크립트는 **멱등(idempotent)** 하게 작성
