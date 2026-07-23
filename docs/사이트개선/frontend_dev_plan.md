# 스토어프론트(Frontend) 개발 문서 — 섹션 기반 쇼핑몰 빌더

> **이 문서는 잔여 과제만 남긴 축약본입니다.** (정리: 2026-07-15)
> 완료된 기능의 설계·동작·운영 방법은 계획서가 아니라 아래 문서가 정본입니다.
> - 개발자: `docs/develop_guide/admin/`, `docs/develop_guide/user/`
> - 운영자: `docs/manual/admin/`, `docs/manual/user/`
>
> 관리자 화면 잔여 과제는 [`admin_dev_plan.md`](./admin_dev_plan.md) 참조.
> 이 문서의 이전 판(설계 산문·DDL·CT 트랙 체크리스트)은 git 이력에서 조회할 수 있습니다.

---

## 완료되어 이관된 항목

| 항목 | 이관된 문서 |
|---|---|
| P0 ProductCard 표준화 · 섹션 partial 분해 | `develop_guide/user/home.md` |
| P1 SDUI 렌더 엔진 (`page`/`page_section`/`product_group`, 발행 스냅샷 + 라이브 폴백) | `develop_guide/user/home.md`, `develop_guide/admin/page_builder.md` |
| P2 레이아웃 (헤더 · GNB · 우측 레일 · 모바일 하단바 · 3뎁스 카테고리 패널) | `develop_guide/user/layout.md` |
| M1~M8 메뉴 아키텍처 (`feature_menu` · `mall_feature_menu` · `custom_menu` · `navigation_config`, `navigationService`, `storefront_menu` DROP, 고객센터 `/cs`) | `develop_guide/admin/storefront_menus.md`, `develop_guide/user/layout.md` |
| P3 섹션 컴포넌트 → **18종** | `develop_guide/user/home.md` |
| P4 테마 시스템 (CSS 변수 + 인젝션 방어 + 관리자 테마 화면) | `develop_guide/admin/settings.md` |
| P5 멀티몰 (부분) — `mall` 테이블 · `mallContext` · `adminMallContext` · 몰별 설정 분기 | `develop_guide/user/overview.md`, `develop_guide/admin/malls.md` |
| 레거시 `main_display_*` 제거 | 완료 — 재확인 불필요 |
| 신규 고객 화면: 쇼핑특가 `/deals` · 베스트 `/best` · 신상품 `/new` · 아울렛 `/outlet` · 추천 `/recommend` · 전문관 `/specialty` · 쇼핑라이브 `/live` · 브랜드관 `/brands` | `develop_guide/user/promotions.md`, `products.md`, `best.md` |

---

## 잔여 과제

### P5-B — 거래 데이터 몰 분리

`products` · `users` · `orders` · `carts` 에 `mall_id` 가 없다. 전시·설정 계열은 몰 스코프가 끝났고, 거래·공용 계열이 남았다. 이 경계가 곧 P5-B 의 작업 범위다.

**착수 시 원칙** (원문 결정 근거 보존):
- 분리는 **"전 쿼리에 필터 추가"가 아니라 리포지토리 계층에서 강제**한다. 사람이 `WHERE mall_id` 를 기억하는 방식은 반드시 새어 나간다 — 한 곳이라도 빠지면 A몰 화면에 B몰 데이터가 노출된다.
- 신규 테이블은 예외 없이 `mall_id BIGINT NOT NULL DEFAULT 1` 을 포함하고, **`mall_id` 를 인덱스의 첫 컬럼**으로 둔다(`KEY (mall_id, ...)`). 나중에 필터를 걸 때 인덱스를 다시 만들지 않아도 된다.
- 관리자 대시보드·매출 통계의 몰 스코프도 이 과제가 해제 조건이다.

### 몰 스코프 하드코딩

- `csController` 의 `mall_id = 1` 하드코딩 — `req.mallId` 로 치환 필요.

### 레이아웃 / 메뉴

- **찜 개수 뱃지 미들웨어** — 장바구니 뱃지(`cartCount`)만 있고 찜 개수 뱃지가 없다.
- **우측 레일 `<1600px` 미노출** — 본문 `max-w-1400px` 와의 충돌 때문이다. 더 좁은 화면에서도 띄우려면 **본문 컨테이너 폭 정책**을 먼저 정해야 한다. 현재 그 미만에서는 플로팅 TOP 버튼으로 대체.
- **모바일 하단바 항목 하드코딩** — `feature_menu.mobile_quick` 이 0행이라 뷰가 항목을 하드코딩한다. 추가로 **하단바의 카테고리 링크가 `/products?categoryId=` 로 GNB(`/products/category/:id`)와 불일치**한다.

### 섹션

- **`brand_carousel` 리졸버가 아직 `brand_stat` 미전환** — 브랜드 통계 소스로 전환 필요.
- **홈 `live_carousel` 섹션 미구현** — 쇼핑라이브 모듈은 완료됐으나 홈 섹션 타입이 없다.

---

## 알려진 결함

| 결함 | 내용 |
|---|---|
| 🔴 **상품 상세에 국내 구매 진입점이 없다** | `views/user/products/detail.ejs` 의 Action Buttons 영역(377~401줄)에 **Shopify "해외 구매하기" 버튼만** 있고 장바구니 담기·바로구매 버튼이 없다. Shopify 는 현재 비활성이므로 이 블록은 아무것도 렌더하지 않는다. 수량 선택기(343줄)도 `hidden`. JS 는 `add-to-cart-form` 을 참조하나(790줄) 그 폼이 마크업에 없어 `if (addToCartForm)` 방어로 조용히 넘어간다. **저장소 전체에서 `/cart/add` 로 POST 하는 뷰가 하나도 없다** — `routes/cart.js`·`cartController` 는 살아 있으나 PDP 에서 도달 불가. `git log -S "장바구니 담기"` 결과가 비어 있어 이 파일에 버튼이 있었던 적이 없다(Shopify 소싱몰 시절의 잔재로 추정). 국내 구매를 살리려면 PDP 에 구매 폼을 추가해야 한다. |
| EJS 단독 컴파일 실패 3종 | `views/partials/modal_overlay.ejs` · `views/partials/user_search_modal.ejs` · `views/user/checkout/fail.ejs`. 런타임은 정상이나 CI lint 를 막는다. |
| THEME 카테고리 잔재 | THEME 카테고리 id=5·6 이 DB 에서 여전히 `is_active=1`. 코드가 `/best`·`/new` 로 리다이렉트하므로 노출 경로는 막혀 있으나 데이터가 남아 있다. |
| 브랜드 찜 몰 미검증 | `likeController` 의 브랜드 찜이 `mall_id` 를 검증하지 않아 **타 몰 브랜드도 찜할 수 있다.** |

> ⚠️ **EJS 함정** (수정 시 재발 방지): EJS 주석·스크립틀릿 안에 리터럴 `%>` 를 쓰면 태그가 조기 종료돼 전 페이지 500 이 난다. 또 속성 문자열을 `<%= %>`(이스케이프 출력)로 내보내면 `target="_blank"` 가 `target=&#34;_blank&#34;` 로 깨진다.

---

## 관련 설계·계획 문서 (스토어프론트 도메인)

고객 화면(레이아웃·GNB·랜딩·전시·필터) 계열 문서다. 각 문서가 자기 도메인의 잔여 과제 정본이고, 이 문서는 그 위의 색인이다.
관리자·데이터·외부연동 계열 문서는 [`admin_dev_plan.md`](./admin_dev_plan.md) 하단 색인 참조.

| 문서 | 상태 · 내용 |
|---|---|
| [`gnb_menu_design.md`](./gnb_menu_design.md) | GNB 메뉴별 화면 설계. 잔여 4건(이벤트 유형 확장 · 이벤트/기획전 매출 귀속 · 급상승 랭킹 화면) + **폐기된 계획 목록(되살리지 말 것)** |
| [`catalog_landings.md`](./catalog_landings.md) | 베스트/랭킹 · 신상품 · 아울렛 · 브랜드 4개 랜딩 통합본. 브랜드 잔여 6건 + 랭킹 세그먼트/CUSTOM 그룹 미산출 |
| [`exhibition_curation.md`](./exhibition_curation.md) | 기획전 · 전문관 · 추천. 상세 템플릿 3종이 전부 `TAB_SHOP` 폴백 + **전문관 7건이 데모 시드인 채 고객 노출 중**(처리 방향 결정 필요) |
| [`카테고리_브랜드_상품필터_설계.md`](./카테고리_브랜드_상품필터_설계.md) | 카테고리·브랜드 목록의 facet 필터. **Phase 0~9 완료(2026-07-22)** — 가격대·브랜드·할인·태그·재고·혜택·판매구분 필터 + 선택 칩 + 파셋 카운트가 `/products`·`/brands/:id` 에서 동작한다. ⚠️ `product_attribute` **0행**이라 색상·사이즈 등 속성 필터는 자동으로 숨겨진 상태. (데이터 모델·관리자 측면은 admin 색인에도 수록) |

> 위 4개 문서의 잔여 과제 중 **브랜드 찜 몰 미검증 · 모바일 하단바 하드코딩 · `brand_carousel` 미전환 · `live_carousel` 미구현**은 이 문서 상단 [잔여 과제](#잔여-과제)·[알려진 결함](#알려진-결함)과 같은 항목이다. 중복이 아니라 같은 뿌리를 양쪽에서 가리키는 것이다.
