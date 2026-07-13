# 아울렛(Outlet) 설계 — 선택형 모듈 · 몰 안의 몰

> 최초 작성 2026-07-11 · 전면 개정 2026-07-13 · **구현 완료 2026-07-13.**
> **상태: ✅ 구현 완료 · 선택형 모듈 · 콘텐츠 게이트로 자동 노출/숨김.**
>
> 2026-07-13 검토에서 **"아울렛을 GNB 기본 메뉴로 두는가"** 가 제기됐고, 그 결과
> 초판의 §5("`module_ready = 1` 로 GNB 노출 유지")를 뒤집어 **선택형 모듈**로 재정의했다.
> 그리고 같은 날 모듈을 구현했다 — 구현 결과는 [§7](#7-구현-결과-2026-07-13) 참고.
>
> **GNB 를 수동으로 끄지 않는다.** 콘텐츠 게이트(§4-5)가 상품 수를 보고 자동으로 켜고 끈다.
> 이게 "빈 메뉴" 문제의 영구 해법이다.

---

## 0. 두 줄 요약

```text
✅ 아울렛 기능은 유지한다 — 단, 선택형 모듈이다.
❌ 아울렛을 모든 몰의 GNB 에 기본 노출하지 않는다. 몰이 아울렛 상품을 확보한 뒤 켠다.
```

**아울렛은 필터로 뽑는 상품 목록이 아니라, 몰 안에 있는 또 하나의 몰이다.**

```text
❌ 아울렛 = discount_rate 가 높은 상품 목록          (폐기 — §3-1, 구현했다 되돌림)
❌ 아울렛 = 상품그룹(product_group) 하나            (폐기 — 표현력 부족)
✅ 아울렛 = 할인 사유가 명확한 전용 상품 + 자체 카테고리 + 전용 관리자 메뉴
```

---

## 1. 2026-07-13 판정 — 왜 GNB 에서 내리는가

### 1-1. 지금 상태가 가장 나쁘다

```text
feature_menu.OUTLET      module_ready = 1
mall_feature_menu        mall 1·2 모두 is_enabled = 1
navigationService        렌더 조건 = is_enabled AND module_ready  → 통과
routes/feature.js        GET /outlet → comingSoon('outlet')
```

→ **GNB 에 '아울렛'이 보이는데, 누르면 "준비중" 랜딩만 뜬다.** 빈 메뉴다.
GNB 12개 중 하나를 죽은 링크가 차지하고 있다.

**실측 확인 (2026-07-13, `https://dev-mall.ydata.co.kr/` HTML)** — `/outlet` 링크가 PC·모바일 GNB 양쪽에 렌더된다.
`/group-buy`·`/live` 도 **완전히 같은 상태**다(`module_ready=1` + `is_enabled=1` + `comingSoon` 랜딩).
아울렛만 내리면 준비중 메뉴가 GNB 에 둘 남는다 → **"준비중 메뉴를 GNB 에 두는가"는 아울렛만의 문제가 아니다.
정책을 통일할지 사용자 결정 필요**(§6).

### 1-2. 몰별 공급원 실사 (2026-07-13, 운영 DB)

| | mall 1 · 건강식품관 | mall 2 · 종합관 |
|---|---|---|
| ON 상품 | 206 | 9,676 |
| 할인 상품(`discount_rate > 0`) | **0** | 4,499 |
| 30%↑ / 50%↑ | 0 / 0 | 240 / 52 |
| 시즌 표기(`25SS`·`25FW` 등) | 없음 | 191 |
| 주력 카테고리 | 영양제·유산균·콜라겐 | 지갑·블라우스·니트·신발·골프 |
| 브랜드(30%↑ 상품 기준) | 0 | 52 |
| **할인 사유(outlet_type) 데이터** | **없음** | **없음** |
| **판정** | **부적합** | **조건부 후보** |

> ⚠️ **위 할인율 수치를 '아울렛 상품 수'로 읽지 말 것.** §3-1 에서 폐기한 프록시다.
> 이 숫자가 말하는 건 "아울렛을 채울 **공급원이 존재하는가**" 뿐이다.
> 실제 아울렛 상품 수는 **두 몰 모두 0** 이다 — 할인 사유를 담을 스키마가 아예 없기 때문이다.

**mall 1 (건강식품관)** — 할인 상품이 단 한 건도 없다. 시즌 이월·구형 모델 개념이 성립하지 않는
카테고리다(영양제·유산균). 유일하게 성립하는 아울렛 사유는 **유통기한 임박(`EXPIRY_SOON`)** 인데,
그건 상시 채널이 아니라 **쇼핑특가의 마감임박 딜**로 처리하는 게 맞다.
→ 아울렛을 켤 이유가 없다. 영구적으로 없을 수도 있다.

**mall 2 (종합관)** — 패션·잡화가 주력이고 `25SS`·`25FW` 시즌 표기 상품이 191건, 브랜드가 52개다.
이월상품이 **구조적으로 계속 발생하는** 몰이다. 아울렛의 전형적 조건에 맞는다.
→ 단 지금은 못 켠다. 할인 사유를 구분할 데이터가 없어서, 켜면 결국 §3-1 의 실패를 반복한다.

### 1-3. 유지 조건 체크리스트 대입

| 조건 | mall 1 | mall 2 |
|---|---|---|
| 상시 아울렛 상품 100+ 확보 | ✗ | △ (공급원은 있으나 지정 수단 없음) |
| 이월상품이 자주 발생하는 카테고리 | ✗ | ✓ |
| 상품별 할인 사유를 데이터로 관리 | ✗ | ✗ |
| 정상가·아울렛가 신뢰성 있게 표시 | ✗ (할인 0) | ✓ (`original_price`/`price`) |
| 브랜드별 아울렛 구성 | ✗ | ✓ (52 브랜드) |
| 품절 상품 지속 보충 | ✗ | △ |
| 리퍼브·전시상품 상태 고지 | ✗ | ✗ |
| 판매자 아울렛 신청·승인 | ✗ (입점 판매자 개념 없음) | ✗ |
| **충족** | **0 / 8** | **3 / 8** (기준 3개 이상 = 경계선) |

→ **어느 몰도 지금 켤 상태가 아니다.** mall 2 는 스키마만 갖추면 조건을 넘길 수 있다.

### 1-4. 결정

| # | 결정 | 실행 |
|---|---|---|
| 1 | 아울렛 **기능은 유지**한다. 폐기하지 않는다 | 라우트·문서 유지 |
| 2 | **GNB 기본 비노출**로 전환한다 | `feature_menu.OUTLET.module_ready = 0` (§6) |
| 3 | **몰 단위 선택형 모듈**로 설계한다 | 관리자가 켤 때만 GNB 에 뜬다 |
| 4 | mall 1 의 임박 상품은 **쇼핑특가로 흡수** | `/deals` 마감임박 딜 |
| 5 | **아울렛 사유 스키마 없이는 켜지 않는다** | §4 착수 전 GNB 노출 금지 |
| 6 | 착수 시점은 미정 — 별도 모듈 프로젝트 | 기획전(exhibition) 이후 |

**게이팅 원칙**

```text
아울렛 GNB 노출 조건 = feature_menu.module_ready = 1        (모듈이 개발됐는가)
                     AND mall_feature_menu.is_enabled = 1  (이 몰이 켰는가)
                     AND 아울렛 상품 ≥ 임계치               (채울 게 있는가 — 신규)
```

세 번째 조건이 새로 필요하다. 지금 구조는 `is_enabled AND module_ready` 뿐이라
**관리자가 켜기만 하고 상품을 안 넣으면 다시 빈 메뉴가 된다.** §4-5 참고.

---

## 2. 메뉴 경계 — 쇼핑특가 · 기획전 · 아울렛

세 메뉴가 전부 "싼 상품"을 보여주기 때문에, **구분 기준을 데이터에 못 박지 않으면 사용자는 같은 상품을 세 번 본다.**

| 메뉴 | 구분 기준 | 할인의 근거 | 수명 | 현재 구현 |
|---|---|---|---|---|
| **쇼핑특가** `/deals` | **시간** — 지금 한시적으로 싸다 | 프로모션(몰이 붙인 할인) | 기간 종료 시 정상가 복귀 | `product_group`(manual) + 타임딜 |
| **기획전** `/exhibition` | **주제** — 편집자가 묶었다 | 편집 의도(가격은 부차적) | 기획전 종료까지 | `exhibition` + `exhibition_product` |
| **아울렛** `/outlet` | **상품 상태** — 상품 자체에 사유가 있다 | 이월·리퍼브·전시·임박·단종 | **상시** (재고 소진까지) | ❌ 없음 |

```text
쇼핑특가 : "오늘까지만 30% — 내일이면 원래 가격"
기획전   : "여름 휴가 준비 — 싸든 비싸든 주제로 묶음"
아울렛   : "25FW 이월 재고 — 최신은 아니지만 계속 싸다"
```

**핵심 구분자는 할인율이 아니라 "할인이 끝나면 정상가로 돌아가는가" 다.**
쇼핑특가는 돌아가고, 아울렛은 돌아가지 않는다(재고가 없어질 뿐).
이 기준이 스키마로 표현되지 않으면 아울렛을 만들 이유가 없다.

---

## 3. 폐기된 접근 (되풀이 금지)

### 3-1. `discount_rate` 필터 방식 — 폐기 (구현했다 되돌림)

`gnb_menu_design.md` §2-2 는 아울렛을 "상시 재고 소진, 할인율 큰 순"으로 정의하고
`discount_rate >= minDiscount` 필터 + 할인율 구간칩(30/50/70%↑)으로 설계했다.
**2026-07-11 구현했다가 되돌렸다.**

- 아울렛 상품 ≠ 할인율 높은 상품. 아울렛은 **어떤 상품이 아울렛에 들어가는가**의 문제다.
- mall 1 에서 항상 0건(할인 상품 없음), mall 2 에서는 4,499건이 무차별로 딸려 왔다.
- 사유 없는 할인율 필터는 결국 **쇼핑특가의 복사본**이 된다(§2).

제거한 것: `routes/feature.js` 의 `/outlet` 필터 라우트, `productController` 의 `isOutlet`·`minDiscount`·`maxDiscount`,
`views/partials/list_scaffold/hero_outlet.ejs`.

> 2026-07-13 재확인: 이 문서의 몰별 할인율 통계(§1-2)는 **공급원 유무 판단용**이다.
> 이걸 근거로 할인율 필터 아울렛을 다시 만들면 같은 실패를 반복한다.

### 3-2. 상품그룹(`product_group`) 방식 — 부적합

오늘특가·베스트는 `product_group`(manual) + 관리자 상품그룹 관리로 해결했다.
**아울렛에는 이 패턴을 늘려 쓰지 않는다.**

| 아울렛이 요구하는 것 | `product_group` 이 주지 못하는 것 |
|---|---|
| 자체 카테고리 분류 | 그룹은 평면 상품 목록일 뿐, 계층이 없다 |
| 아울렛 전용 배너·전시 | 그룹에 전시 요소가 없다 |
| 전용 관리자 메뉴 | 상품그룹 관리 화면 하나에 얹으면 아울렛의 운영 맥락이 사라진다 |
| **상품별 할인 사유·상태 고지** | 그룹에 상품별 부가 속성이 없다 |

사용자 표현: **"단순 상품 그룹으로만 관리하면 약함."**

---

## 4. 착수 시 설계 (모듈 개발 시점에 적용)

### 4-0. 기존 확정 결정 (2026-07-11, 유효)

| # | 항목 | 결정 | 함의 |
|---|---|---|---|
| 1 | **상품 귀속** | 아울렛 전용 상품이 따로 있다 | 아울렛 상품 지정이 필요 |
| 2 | **가격** | **같은 상품이 아울렛에서 다른 가격을 갖지 않는다.** 할인율·혜택은 다를 수 있다 | **이중 가격 없음 → 장바구니·결제 경로를 건드리지 않는다** |
| 3 | **구조** | 자체 카테고리/네비게이션이 필요하다 | 진짜 '몰내 몰' |
| 4 | **관리자** | 아울렛 관리 메뉴를 따로 둔다 | 상품그룹 관리로 대신하지 않는다 |

> 결정 2가 핵심이다. 가격이 이중화되면 **가격 표시 → 장바구니 → 주문 생성 → 결제 검증**이 전부 영향을 받는다.
> 이 저장소는 결제 트랜잭션 변경(`order_items` ALTER 등)을 프로젝트 차원에서 미루고 있다.
> → **아울렛은 진열(merchandising) 모듈이다. 결제 경로 리스크가 없다.**
> → 공동구매(`group_buy_product.group_buy_price`) 패턴은 쓰지 않는다.

### 4-1. 데이터 모델 — 할인 사유가 핵심

`is_outlet` 플래그 하나로는 부족하다. **아울렛의 존재 이유가 사유이기 때문이다.**

> ⚠️ **아래 DDL 은 예시다. 확정이 아니다.** §4-6 의 "할인율·혜택은 다를 수 있다" 해석이
> 확인돼야 컬럼 구성이 확정된다. 착수 시점에 다시 짠다.

```sql
-- 아울렛 상품 매핑 (기획전 exhibition_product 패턴 클론)
CREATE TABLE outlet_product (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  mall_id             BIGINT NOT NULL,
  product_id          INT NOT NULL,
  outlet_category_id  BIGINT,                    -- 아울렛 자체 분류 (§4-2)

  outlet_type ENUM(
    'SEASON_OFF',      -- 시즌 이월      (mall2 25SS/25FW)
    'DISCONTINUED',    -- 단종·구형 모델
    'OVERSTOCK',       -- 재고 과다
    'DISPLAY',         -- 전시상품
    'REFURBISHED',     -- 리퍼브
    'PACKAGE_DAMAGE',  -- 포장 훼손
    'EXPIRY_SOON'      -- 유통기한 임박  (mall1 — 단 §1-4 결정 4로 쇼핑특가 흡수)
  ) NOT NULL,
  outlet_reason       VARCHAR(255),              -- 고객 노출 문구
  condition_grade     ENUM('A','B','C'),         -- 상태 등급 (리퍼브·전시·훼손만)
  defect_description  TEXT,                      -- 하자 고지 (분쟁 방지 — 필수)

  expiry_at           DATE,                      -- EXPIRY_SOON 용
  started_at          DATETIME,
  ended_at            DATETIME,
  approved_at         DATETIME,
  sort_order          INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_mall_product (mall_id, product_id),
  KEY idx_mall_type (mall_id, outlet_type)
);
```

**가격 컬럼을 두지 않는다.** 결정 2에 따라 `products.original_price` / `products.price` /
`products.discount_rate` 를 **그대로 재사용**한다. `outlet_price` 를 만드는 순간 결제 경로가 열린다.

**`defect_description` 은 리퍼브·전시·포장훼손에서 필수다.** 하자 고지 없이 일반 이월상품처럼
노출하면 교환·반품 분쟁이 발생한다. 관리자 폼에서 `condition_grade IN ('B','C')` 이면 필수 입력으로 강제한다.

### 4-2. 아울렛 카테고리

```text
안 1) categories.type 에 'OUTLET' 추가       — 기존 트리·depthGuard 재사용 (권장)
안 2) outlet_category 별도 테이블            — 완전 독립 분류
```

`categories.type` 은 현재 `NORMAL`(10) / `THEME`(2) / `BRAND`(25) 3종이다.
**안 1 권장** — `services/tree/depthGuard.js` 의 뎁스·순환 가드를 그대로 쓸 수 있다.
단 일반 카테고리 드롭다운에 섞이지 않도록 **모든 조회에 `type` 스코프를 걸어야 한다**(BRAND 가 이미 하는 방식).

### 4-3. 관리자 — 몰 단위 설정

전용 메뉴 `/admin/outlet` 을 둔다(결정 4). 상품그룹 관리에 얹지 않는다.

| 설정 | 내용 | 기본값 |
|---|---|---|
| 아울렛 사용 | 몰 단위 on/off | **off** |
| 메뉴명 | 아울렛 / 창고대방출 / 리퍼브관 | 아울렛 |
| 허용 사유 유형 | `outlet_type` 중 이 몰이 쓸 것 | 전체 |
| 최소 할인율 | 등록 시 검증 (허위 할인 방지) | 20% |
| GNB 노출 최소 상품 수 | 미달 시 자동 비노출 (§4-5) | 30 |
| 정상 카테고리 병행 노출 | 아울렛 상품을 일반 목록에도 띄울지 | 병행 |

화면: 아울렛 상품 관리(검색 모달로 담기 — `productGroupController.getProductSearch` 재사용) /
아울렛 카테고리 관리 / 아울렛 설정.

### 4-4. 고객 화면 필수 표시

이월상품과 리퍼브를 **같은 UI 로 보여주면 안 된다.**

| 항목 | 노출 |
|---|---|
| 아울렛 사유 배지 | 목록·상세 (`SEASON_OFF` → "시즌오프", `REFURBISHED` → "리퍼브") |
| 정상가 · 판매가 · 할인율 | 목록·상세 |
| 상태 등급 · 하자 고지 | **상세 필수** — `condition_grade IN ('B','C')` 이면 구매 버튼 위 |
| 교환·반품 조건 차이 | 상세 (일반 상품과 다르면) |
| 잔여 수량 | 목록·상세 (`products.stock`) |

탐색 축은 **가격 중심**: 할인율 높은 순 / 가격대 필터 / 마지막 수량 / 브랜드별.

### 4-5. 빈 메뉴 재발 방지 ★

이번 검토의 직접 원인이다. **관리자가 메뉴만 켜고 상품을 안 넣으면 다시 빈 메뉴가 된다.**

```text
navigationService 렌더 조건에 3번째 게이트를 추가한다:

  is_enabled = 1
  AND module_ready = 1
  AND (SELECT COUNT(*) FROM outlet_product WHERE mall_id = ? AND 판매중) >= 임계치(기본 30)
```

카운트는 매 요청 조회하지 말고 캐시하거나 `mall_feature_menu` 에 집계 컬럼을 둔다.
임계치 미달이면 **GNB 에서 조용히 사라진다**(`/outlet` 직접 접근은 `comingSoon` 폴백 유지).
이 게이트는 아울렛만이 아니라 **공동구매·쇼핑라이브 등 다른 콘텐츠 의존 메뉴에도 같이 적용할 수 있다.**

### 4-6. 착수 시 확인 항목 — **모두 확정됨 (2026-07-13)**

| 항목 | 확정 |
|---|---|
| **"할인율·혜택은 다를 수 있다"의 의미** | **해석 A — 기존 상품 가격을 그대로 재사용한다.** 아울렛 상품은 "`products.discount_rate` 가 이미 높게 설정된 상품"이다. `outlet_price` 컬럼을 만들지 않는다. 결제 경로를 건드리지 않는다 |
| 한 상품이 일반 목록과 아울렛에 동시에 | **가능.** `outlet_setting.show_in_normal_list` 로 몰이 정한다(기본 병행) |
| 아울렛 진입 후 전용 GNB | **안 만든다.** 공용 헤더를 쓰고 `/outlet` 안에서 사유·카테고리·가격대 필터로 탐색한다 |
| `/outlet` 하위 URL | **단일 페이지 + 쿼리 필터** (`?type=`·`?category=`·`?price=`·`?sort=`). 상품 상세는 `/products/{slug}` 공용 |
| 관리자 메뉴 위치 | `admin_menus` `parent_id=32`(상품 관리). 아울렛 관리(id 54) · 아울렛 카테고리(id 55) |
| 상품 검색 모달 | `exhibitionController` 최소 구현을 클론하되 **최소 할인율 미달·중복 상품을 결과에 표시하고 선택을 막는다** |

---

## 5. 참고할 기존 패턴

아울렛은 **기획전(exhibition) 패턴에 자체 카테고리 + 할인 사유를 더한 것**이다. 새로 발명하지 말고 클론한다.

| 필요 | 이미 있는 것 | 위치 |
|---|---|---|
| 상품 전시 매핑 | `exhibition_product` (원래 가격 재사용, 순수 진열) | [`exhibition_design_and_development.md`](./exhibition_design_and_development.md) |
| 내부 섹션/탭 | `exhibition_section` | 〃 |
| 관리자 CRUD 관례 | 폼 POST + EJS + redirect | `controllers/admin/exhibitionController.js` |
| 상품 검색 모달 | `getProductSearch` JSON | `controllers/admin/productGroupController.js` |
| 카테고리 계층 | `categories` + `depthGuard`(max 3뎁스) | `services/tree/depthGuard.js` |
| 0건 폴백 랜딩 | `COMING_SOON.outlet` | `routes/feature.js` |
| 몰 스코프 | `req.mallId` / `mall_id` 첫 인덱스 컬럼 | `middleware/mallContext.js` |
| 메뉴 게이트 | `is_enabled AND module_ready` | `services/menu/navigationService.js:89` |

---

## 6. 현재 상태 · 즉시 조치

```text
/outlet                     → comingSoon('outlet') 준비중 랜딩 (routes/feature.js:267)
feature_menu.OUTLET         → module_ready = 1
mall_feature_menu           → mall 1·2 모두 is_enabled = 1, sort_order = 9
                              ⚠️ 결과: GNB 에 노출 중인데 누르면 준비중 → 빈 메뉴
아울렛 관련 테이블           → 없음
아울렛 관리자 메뉴           → 없음
```

**즉시 조치 (§1-4 결정 2) — 사용자 승인 후 실행. 한 줄이면 된다.**

```sql
-- 모듈이 아직 없다는 사실을 그대로 반영한다. 라우트·문서·feature_menu 카탈로그는 유지.
UPDATE feature_menu SET module_ready = 0 WHERE feature_code = 'OUTLET';
```

`navigationService` 의 렌더 조건이 `is_enabled AND module_ready` 이므로 **이 한 줄로 두 몰 GNB 에서 동시에 사라진다.**
`mall_feature_menu.is_enabled` 는 건드리지 않는다 — 그건 **모듈 개발 후 몰별 활성화**에 쓸 스위치다(§4-3).
관리자가 실수로 `is_enabled = 1` 해도 `module_ready = 0` 이면 뜨지 않는다(이중 안전장치).
모듈을 실제로 개발한 시점에 다시 1 로 올린다.

**함께 결정할 것 — 형제 메뉴**

`GROUP_BUY`·`LIVE` 도 아울렛과 **똑같이** `module_ready=1` + `is_enabled=1` + `comingSoon` 랜딩이다.
아울렛만 내리면 준비중 메뉴가 GNB 에 둘 남는다.

```text
안 A) 아울렛만 내린다              — 이번 검토 범위. 단 GNB 정책이 안에서 어긋난 채 남는다.
안 B) 준비중 메뉴 정책을 통일한다   — GROUP_BUY·LIVE 도 module_ready = 0.
                                    "모듈이 없으면 GNB 에 없다" 를 규칙으로 못 박는다. (권장)
```
→ **사용자 결정 대기.**

**착수 순서** (기획전과 동일)

```text
1. outlet_product / OUTLET 카테고리 스키마          (§4-1, §4-2)
2. 관리자 CRUD + 몰 단위 설정                       (§4-3)
3. mall 2 에 실제 이월상품 등록 (임계치 30건 이상)
4. 고객 라우트 교체 + 빈 메뉴 게이트                (§4-4, §4-5)
5. feature_menu.module_ready = 1, mall 2 만 is_enabled = 1
```

> `dev = prod` DB 다. 고객 라우트를 먼저 열면 운영에 빈 화면이 뜬다.
> **0건이면 준비중 랜딩 폴백을 유지**한다.
