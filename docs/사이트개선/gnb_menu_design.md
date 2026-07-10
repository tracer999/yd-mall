# GNB 메뉴별 화면 설계

> 작성 2026-07-10. 대상: 스토어프론트 GNB 기능 메뉴 **10종**.
> **기획전(`/exhibition`)·공동구매(`/group-buy`)는 이 문서에서 제외한다** — 각각
> [`exhibition_design_and_development.md`](./exhibition_design_and_development.md),
> [`group_buy_design_and_development.md`](./group_buy_design_and_development.md) 가 담당하며 별도 작업으로 진행한다.
> 쇼핑라이브는 [`live sales.md`](./live%20sales.md) 가 설계를 소유하므로, 여기서는 **GNB 편입 조건만** 다룬다.

---

## 0. 요약 — 지금 무엇이 잘못돼 있나

`feature_menu` 의 GNB 12개는 **전부 `module_ready=1`** 이라 두 몰 모두에서 클릭 가능하다. 그런데 실제로는:

| 분류 | 메뉴 | 실태 |
|---|---|---|
| 실기능 | 오늘특가 · 베스트 · 신상품 · 브랜드 | 동작하나 **정체성이 겹치거나 버그가 있다**(아래) |
| **오연결** | 이벤트&혜택 | `/event` → 302 → `/boards/notice` **공지사항**. 이벤트가 아니다 |
| 준비중 랜딩 | 랭킹 · 아울렛 · 쿠폰 · 멤버십 · 쇼핑라이브 | `user/coming_soon` 렌더 |
| 별도 문서 | 기획전 · 공동구매 | 이 문서 범위 밖 |

### 0-1. 가장 시급한 발견 — 이벤트와 고객센터가 같은 곳을 가리킨다

```text
feature_menu.EVENT.default_path      = /event        →  routes/feature.js:35  →  302 → /boards/notice
feature_menu.HEADER_CS.default_path  = /boards/notice                          →  공지사항 목록
```

**둘 다 공지사항으로 간다.** 정작 전용 고객센터 허브 `/cs`(FAQ + 공지 + 1:1문의 LNB)는 **200 으로 살아 있는데 아무 메뉴도 가리키지 않는다**. `scripts/migrate_faq.js` 가 `HEADER_CS.default_path` 를 `/cs` 로 승격하도록 작성돼 있으나 **운영 DB 에 적용되지 않았다**(실측: 여전히 `/boards/notice`).

바로잡을 것은 두 가지다.

```text
1) HEADER_CS.default_path : /boards/notice → /cs          (공지사항은 고객센터의 하위 항목)
2) EVENT                  : 공지 별칭 제거 → 실제 이벤트 모듈
```

### 0-2. 상품목록 재탕 문제 (이 문서의 핵심)

오늘특가·베스트·신상품·아울렛·랭킹은 **전부 `productController.getList` 에 필터/정렬만 바꿔 넣은 같은 화면**이다. 이대로 각각을 만들면 구분 없는 목록 5개가 된다.

특히 **베스트와 신상품은 이름과 내용이 어긋난다.**

```text
/best  → preset({ sort: 'best' })  → 전체 상품을 조회수순 정렬  → mall 2 에서 9,677건
/new   → preset({ sort: 'new' })   → 전체 상품을 최신순 정렬    → mall 2 에서 9,677건
```

"베스트 9,677개"·"신상품 9,677개"는 베스트도 신상품도 아니다. **정렬된 전체 카탈로그**다.
아래 1장에서 각 메뉴의 정체성을 다시 정의한다.

---

## 1. 메뉴 정체성 재정의 (특색)

### 1-1. 겹침 해소 원칙

| 축 | 질문 | 답이 되는 메뉴 |
|---|---|---|
| **가격** | 지금 싸게 사는 법 | 오늘특가(시간 한정) · 아울렛(상시 재고 소진) |
| **인기** | 남들이 많이 본/산 것 | 베스트(누적) · 랭킹(순위·경쟁) |
| **신선도** | 새로 들어온 것 | 신상품 |
| **주체** | 누가 파는가 | 브랜드 |
| **혜택** | 무엇을 받는가 | 이벤트&혜택 · 쿠폰 · 멤버십 |
| **형식** | 어떻게 파는가 | 쇼핑라이브 |

### 1-2. 개별 정의

**오늘특가 `/deal/today` — "오늘 지나면 끝나는 할인"**
시간 축이 정체성이다. `product_badge` 에 `DEADLINE_SALE` 이 있고 `badge_expire_date` 가 오늘 이후인 상품만. 남은 시간 카운트다운이 화면의 주인공. 상시 할인은 여기 오면 안 된다.

**아울렛 `/outlet` — "상시 재고 소진, 할인율 큰 순"**
기간이 없다. `discount_rate` 가 기준. 정체성은 "이월·재고"이지 "한정"이 아니다.
데이터 현실: mall=2 는 4,499건, **mall=1 은 0건**. 몰별로 완전히 다르므로 빈 상태 화면이 필수다.

**베스트 `/best` — "누적 인기 상위 N"**
전체 카탈로그를 조회수로 정렬하는 것이 아니라 **상위 100개로 끊는다**. 순위 숫자는 붙이지 않는다(그건 랭킹의 몫).

**신상품 `/new` — "최근 N일 내 입고"**
전체를 최신순 정렬하는 것이 아니라 `created_at >= NOW() - INTERVAL 30 DAY` 로 **자른다**. 신상품이 0건이면 "최근 입고 없음"을 보여주는 게 정직하다.

**랭킹 `/ranking` — "경쟁·순위·기간"**
베스트와의 차이는 **순위 번호 · 카테고리 탭 · 기간 탭(주간/월간)**. 순위 변동(▲▼)이 있으면 랭킹, 없으면 그냥 베스트다.
데이터 현실: `order_items` 가 **전체 21건**뿐이라 판매량 랭킹은 의미가 없다. **조회수 기반으로만 시작**한다.

**브랜드 `/brands` — "파는 주체별 진열"**
현재 유일하게 정체성이 뚜렷하다. 다만 **몰 스코프 버그**가 있다(3장).

**이벤트&혜택 `/event` — "참여하고 받는 것"**
기획전(상품 전시·판매)과 명확히 갈린다. 이벤트는 **응모·쿠폰팩·출석·경품·회원가입 혜택**처럼 참여와 지급이 중심이다. 상품 그리드가 주인공이면 그건 기획전이다.

**쿠폰 `/coupon` — "받아가는 곳"**
마이페이지 쿠폰함은 "이미 받은 것을 보는 곳"이다. GNB 쿠폰은 **수령(다운로드)** 이 목적이어야 중복이 아니다.

**멤버십 `/membership` — "등급과 혜택 안내"**
마이페이지 포인트는 "내 잔액"이다. GNB 멤버십은 **제도 소개**다.

**쇼핑라이브 `/live`** — [`live sales.md`](./live%20sales.md) 참조. 여기서는 GNB 편입 조건만 다룬다(2-10).

---

## 2. 메뉴별 화면 구성 및 개발 계획

각 메뉴는 **화면 구성**(와이어프레임 · 데이터 소스 · 상태)과 **개발 계획**(신규/수정 파일 · 라우트 · 스키마 · 단계 · 검증)을 함께 적는다.

확정된 결정(§7)을 전제로 한다: 신상품 = `product_badge='NEW'`, 베스트 = 조회수 상위 100,
이벤트 = 참여형 포함, 쿠폰 = 다운로드 수령, 멤버십 = 제도 소개 페이지.

---

### 2-0. 공용 목록 스캐폴드 — 먼저 만들어야 하는 것

오늘특가·아울렛·베스트·신상품·랭킹 **다섯 메뉴는 같은 골격**이다. 각각 따로 만들면 같은 화면이 다섯 벌 생긴다. 골격을 한 번 만들고 **차별화 슬롯**만 갈아끼운다.

```text
┌──────────────────────────────────────────────┐
│ [히어로]  제목 · 부제 · 슬롯 A (메뉴별 고유)   │  ← 메뉴마다 다른 유일한 곳
├──────────────────────────────────────────────┤
│ [필터 바]  카테고리 칩 | 슬롯 B (메뉴별 필터) │
├──────────────────────────────────────────────┤
│ [정렬 바]  인기 · 낮은가격 · 높은가격 · 최신   │  ← 공통
├──────────────────────────────────────────────┤
│ [상품 그리드]  product_card.ejs × N          │  ← 공통 (슬롯 C: 카드 위 오버레이)
├──────────────────────────────────────────────┤
│ [페이지네이션]                                │  ← 공통
└──────────────────────────────────────────────┘
        ↓ 결과 0건일 때
┌──────────────────────────────────────────────┐
│ [빈 상태]  아이콘 · 문구 · 대체 CTA           │  ← 몰별로 반드시 정의 (§4-3)
└──────────────────────────────────────────────┘
```

**슬롯별 차이 — 이 표가 "같은 화면 5개"를 막는 유일한 장치다.**

| 메뉴 | 슬롯 A (히어로) | 슬롯 B (필터) | 슬롯 C (카드 오버레이) | WHERE / ORDER |
|---|---|---|---|---|
| 오늘특가 | **카운트다운 타이머** | 없음 | 남은 시간 배지 | `DEADLINE_SALE` + 만료일 유효 |
| 아울렛 | 최대 할인율 배너 | **할인율 구간(30/50/70%↑)** | 할인율 배지 | `discount_rate >= ?` |
| 베스트 | 없음 | 카테고리만 | 없음 | `ORDER BY view_count DESC LIMIT 100` |
| 신상품 | 없음 | 카테고리만 | NEW 배지 | `FIND_IN_SET('NEW', product_badge)` |
| 랭킹 | 1·2·3위 포디움 | **기간 탭 + 카테고리 탭** | **순위 번호 + 변동(▲▼)** | `ORDER BY view_count DESC` |

**현재 이런 공용 파티셜이 없다.** 정렬바·페이지네이션은 `views/user/products/list.ejs` 에 **인라인**으로 박혀 있다. 스캐폴드를 뽑아내는 것이 목록형 메뉴 개발의 0단계다.

**신규 파일**
```text
views/partials/list_scaffold/
├─ index.ejs          골격 (슬롯 A/B/C 를 include 로 주입)
├─ sort_bar.ejs       products/list.ejs 에서 추출
├─ pagination.ejs     products/list.ejs 에서 추출
├─ category_chips.ejs 카테고리 필터 칩
└─ empty_state.ejs    빈 상태 (icon, message, ctaLabel, ctaHref)
```

**계약**
```js
// 스캐폴드가 받는 locals
{ products, pagination, sortTabs, categories, selectedCategoryId,
  hero: null | { partial: '경로', data: {...} },     // 슬롯 A
  filters: null | { partial: '경로', data: {...} },  // 슬롯 B
  cardOpts: {...},                                    // product_card 의 opts
  empty: { icon, message, ctaLabel, ctaHref } }       // 0건일 때
```

**주의** `views/user/products/list.ejs` 는 이미 동작 중인 화면이다. 스캐폴드 추출은 **리팩터링**이며, 추출 후 기존 `/products` 가 동일하게 렌더되는지 먼저 확인한 뒤 새 메뉴에 쓴다.

---

### 2-1. 오늘특가 `/deal/today` — 가벼움 (거의 완성)

#### 화면 구성

```text
┌──────────────────────────────────────────────┐
│ ⏰ 오늘특가                                    │
│    03 : 14 : 27   (가장 임박한 상품 기준)      │  ← 슬롯 A: 카운트다운
├──────────────────────────────────────────────┤
│ [카테고리 칩]                                  │
├──────────────────────────────────────────────┤
│ [정렬] 마감임박순(기본) · 낮은가격 · 할인율     │
├──────────────────────────────────────────────┤
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐                  │
│ │카드│ │카드│ │카드│ │카드│   ← 카드 우상단   │
│ │D-2 │ │D-1 │ │오늘│ │D-5 │      잔여일 배지  │
│ └────┘ └────┘ └────┘ └────┘                  │
└──────────────────────────────────────────────┘
```

| 요소 | 데이터 소스 |
|---|---|
| 카운트다운 | `MIN(badge_expire_date)` — 서버가 내려주고 클라이언트가 초 단위 렌더 |
| 상품 | `products` where `FIND_IN_SET('DEADLINE_SALE', product_badge)` AND 만료일 유효 |
| 잔여일 배지 | `DATEDIFF(badge_expire_date, CURDATE())` |

**상태** 진행중만 존재한다(만료 = 목록에서 사라짐).
**빈 상태** "오늘 진행 중인 특가가 없습니다" + CTA `/best`.

#### 개발 계획

| 구분 | 내용 |
|---|---|
| 현재 | ✅ 동작. `routes/feature.js` `preset({badge:'DEADLINE_SALE'})` → `productController.getList` |
| 완료 | 만료일 필터 추가 (커밋 `98985fc`) — mall=1 4건 → 3건 확인 |
| 수정 | `productController.getList` 에 `MIN(badge_expire_date)` 조회 추가 → `locals.dealEndsAt` |
| 신규 | `views/partials/list_scaffold/hero_countdown.ejs` |
| 정렬 | `SORT_ORDERS` 에 `deadline`(`badge_expire_date ASC`) 추가, 기본값으로 |
| 검증 | mall=1 3건 / mall=2 240건, 만료 상품(106) 미노출, 카운트다운이 최소 만료일과 일치 |

**남은 결함** 만료돼도 `product_badge` 에서 `DEADLINE_SALE` 이 제거되지 않아, **다른 화면(카테고리 목록·상품 상세)의 카드에는 여전히 "마감임박" 배지가 붙는다.** 배지 자체를 정리하려면 만료 뱃지 정리 배치가 필요하다(별도 작업).

---

### 2-2. 아울렛 `/outlet` — 중간

#### 화면 구성

```text
┌──────────────────────────────────────────────┐
│ 🏷 아울렛                                     │
│    최대 82% 할인    (MAX(discount_rate))      │  ← 슬롯 A
├──────────────────────────────────────────────┤
│ [할인율]  전체 | 30%↑ | 50%↑ | 70%↑          │  ← 슬롯 B (핵심 차별점)
│ [카테고리 칩]                                  │
├──────────────────────────────────────────────┤
│ [정렬] 할인율순(기본) · 낮은가격 · 인기         │
├──────────────────────────────────────────────┤
│ [상품 그리드]  카드 좌상단 "-52%" 배지          │  ← 슬롯 C
└──────────────────────────────────────────────┘
```

| 요소 | 데이터 소스 |
|---|---|
| 최대 할인율 | `SELECT MAX(discount_rate) FROM products WHERE mall_id=? AND discount_rate>0` |
| 상품 | `discount_rate >= :minDiscount` (기본 1) |
| 구간 필터 | `?minDiscount=30|50|70` |

**상태 · 빈 상태 (중요)**

```text
mall 1 : discount_rate > 0  →     0건   ← 항상 빈다
mall 2 : discount_rate > 0  → 4,499건
```

mall=1 에서는 **목록이 아니라 준비중 랜딩(`comingSoon('outlet')`)으로 폴백**한다. 빈 그리드를 보여주는 것보다 낫다. `routes/feature.js` 주석의 "discount_rate>0 이 0개"라는 전제는 mall=2 에서 깨졌다.

#### 개발 계획

| 구분 | 내용 |
|---|---|
| 수정 | `routes/feature.js` — `comingSoon('outlet')` → `outletController.getList` (0건이면 comingSoon 렌더) |
| 수정 | `controllers/productController.js` — `minDiscount` 쿼리 필터 추가 (`AND discount_rate >= ?`), `SORT_ORDERS` 에 `discount` 확인 |
| 신규 | `views/user/outlet/list.ejs` (스캐폴드 + 슬롯 A/B) |
| 신규 | `views/partials/list_scaffold/filter_discount.ejs` |
| 선행 | 2-0 스캐폴드 |
| 검증 | mall=2 4,499건 / 30%↑·50%↑·70%↑ 각각 건수 감소 확인 / mall=1 은 준비중 랜딩 |

**결정 필요** 아울렛에서 `DEADLINE_SALE` 상품(mall=2 240건)을 **제외할지**. 제외하지 않으면 오늘특가와 상품이 겹친다. 권장: 제외하지 않되 카드에 "오늘특가" 배지를 달아 구분.

---

### 2-3. 베스트 `/best` — 가벼움

#### 화면 구성

```text
┌──────────────────────────────────────────────┐
│ 베스트                                        │
│ 고객이 가장 많이 본 상품 100                    │  ← 슬롯 A 없음
├──────────────────────────────────────────────┤
│ [카테고리 칩]                                  │
├──────────────────────────────────────────────┤
│ [정렬] 인기순(고정) · 낮은가격 · 높은가격       │
├──────────────────────────────────────────────┤
│ [상품 그리드]  순위 번호 없음                   │  ← 랭킹과의 차이
├──────────────────────────────────────────────┤
│ [페이지네이션]  상위 100개 내에서만             │
└──────────────────────────────────────────────┘
```

**정체성** 순위 번호가 없다. 있으면 랭킹이다.
**빈 상태** 조회수 0인 몰은 사실상 없다 → 일반 빈 상태로 충분.

#### 개발 계획

| 구분 | 내용 |
|---|---|
| 현재 | `preset({sort:'best'})` → **전체 카탈로그**를 조회수순 정렬 (mall=2 9,677건) |
| 수정 | 상위 100 상한. 서브쿼리로 자른 뒤 페이징한다 |
| 쿼리 | `SELECT * FROM (SELECT ... ORDER BY view_count DESC LIMIT 100) t LIMIT ? OFFSET ?` |
| 주의 | `view_count` 는 **상세 페이지 렌더 시에만 +1**(`productController.js:296`). 목록 노출은 카운트하지 않아 지표로 신뢰할 만하다 |
| 검증 | 총 건수가 100 이하로 표기되는지, mall=2 에서 9,677 → 100 |

---

### 2-4. 신상품 `/new` — 가벼움

#### 화면 구성

```text
┌──────────────────────────────────────────────┐
│ 신상품                                        │
│ 새로 들어온 상품                               │
├──────────────────────────────────────────────┤
│ [카테고리 칩]                                  │
├──────────────────────────────────────────────┤
│ [정렬] 최신순(기본) · 인기 · 낮은가격           │
├──────────────────────────────────────────────┤
│ [상품 그리드]  카드에 NEW 배지                  │  ← 슬롯 C
└──────────────────────────────────────────────┘
```

**판정 기준 (확정)** `FIND_IN_SET('NEW', product_badge)`.

`created_at` 기간 필터를 쓰지 않는 이유: mall=2 상품 9,677건은 시드 스크립트가 **한꺼번에 INSERT** 해서 `created_at` 이 전부 같다. 30일 필터를 걸면 오늘은 9,677건 전부, 30일 뒤엔 0건이 된다. 뱃지는 운영자가 통제할 수 있어 안전하다.

**빈 상태** "새로 들어온 상품이 없습니다" + CTA `/best`. (mall=1 10건 / mall=2 200건)

#### 개발 계획

| 구분 | 내용 |
|---|---|
| 현재 | `preset({sort:'new'})` → 전체를 최신순 정렬 |
| 수정 | `routes/feature.js` — `preset({ badge: 'NEW', sort: 'new' })` 로 변경. **한 줄이면 끝난다** |
| 주의 | `productController` 의 `badge==='NEW'` 분기는 이미 존재(`FIND_IN_SET`). 새 코드 불필요 |
| 검증 | mall=1 10건 / mall=2 200건 |

---

### 2-5. 랭킹 `/ranking` — 중간

#### 화면 구성

```text
┌──────────────────────────────────────────────┐
│ 랭킹                                          │
│ [기간] 실시간(기본) | 주간 | 월간              │  ← 슬롯 B (2차)
│ [카테고리] 전체 | 여성패션 | 뷰티 | …          │
├──────────────────────────────────────────────┤
│           ┌────┐                              │
│    ┌────┐ │ 1  │ ┌────┐                       │  ← 슬롯 A: 1·2·3위 포디움
│    │ 2  │ │    │ │ 3  │                       │
│    └────┘ └────┘ └────┘                       │
├──────────────────────────────────────────────┤
│ 4위  [카드]  ▲2                               │  ← 슬롯 C: 순위 + 변동
│ 5위  [카드]  ▼1                               │
│ 6위  [카드]  －                                │
└──────────────────────────────────────────────┘
```

| 요소 | 데이터 소스 | 시점 |
|---|---|---|
| 순위 | `ORDER BY view_count DESC` | 1차 |
| 카테고리 탭 | `getCategoryContext` 서브트리 | 1차 |
| 기간 탭 | 일별 집계 테이블 `product_view_daily` | **2차** |
| 순위 변동 | 직전 스냅샷 비교 | **2차** |
| 판매량 탭 | `order_items` | **보류** |

**데이터 현실** `order_items` 가 **전체 21건**이다. 판매량 랭킹은 순위가 성립하지 않는다. 조회수 기반으로만 출시한다.

**빈 상태** 조회수 0 → 일반 빈 상태.

#### 개발 계획

| 구분 | 내용 |
|---|---|
| 재사용 | **`ranking_tabs` 섹션과 `GET /sections/ranking` AJAX 가 이미 카테고리 탭 + 정렬 전환을 구현했다.** 이걸 전체 페이지로 승격 |
| 수정 | `routes/feature.js` — `comingSoon('ranking')` → `rankingController.getList` |
| 신규 | `controllers/rankingController.js`, `views/user/ranking/list.ejs`, `views/partials/list_scaffold/hero_podium.ejs` |
| 2차 신규 | `product_view_daily` 집계 테이블 + 일 1회 배치, 순위 스냅샷 |
| 선행 | 2-0 스캐폴드 |
| 검증 | 카테고리 탭 전환 시 순위가 바뀌는지, 1~3위가 포디움에 오는지 |

---

### 2-6. 브랜드 `/brands` — 가벼움 (동작 중)

#### 화면 구성

```text
┌──────────────────────────────────────────────┐
│ 브랜드                                        │
│ [초성]  ㄱ ㄴ ㄷ … A B C … #                  │
├──────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │
│ │ 로고 │ │ 로고 │ │ 로고 │ │ 로고 │  ♡ 찜    │
│ │ 이름 │ │ 이름 │ │ 이름 │ │ 이름 │          │
│ │ 12개 │ │ 8개  │ │ 45개 │ │ 3개  │          │
│ └──────┘ └──────┘ └──────┘ └──────┘          │
└──────────────────────────────────────────────┘
   클릭 → /brands/{id} → 301 → /products/brand/{id}
```

**상태** mall=1 브랜드 25개 / mall=2 **1,354개**.
mall=2 는 브랜드가 많아 **초성 필터와 페이지네이션이 필수**다(25개 기준으로 만든 화면이 1,354개를 감당하지 못한다).

#### 개발 계획

| 구분 | 내용 |
|---|---|
| 완료 | `brandController.getList` 에 `mall_id` 필터 (커밋 `a7e7861`, 다른 작업) |
| 신규 | 초성 인덱스 필터 — 한글 초성 추출은 SQL 로 어렵다. `categories` 에 `initial` 컬럼을 두고 저장 시 계산하거나, 앱에서 전량 로드 후 그룹핑 |
| 신규 | 브랜드별 상품 수 표기 — `brand_carousel` 리졸버의 `COUNT(p.id)` 패턴 재사용 |
| 신규 | 페이지네이션 (1,354개) |
| 검증 | mall=1 25개 / mall=2 1,354개, 몰 간 누수 없음 |

---

### 2-7. 이벤트&혜택 `/event` — **무거움 (신규 모듈, 참여형)**

#### 화면 구성 — 목록

```text
┌──────────────────────────────────────────────┐
│ 이벤트 & 혜택                                  │
├──────────────────────────────────────────────┤
│ [상태]  전체 | 진행중 | 예정 | 종료            │
├──────────────────────────────────────────────┤
│ ┌────────────────┐ ┌────────────────┐        │
│ │   썸네일        │ │   썸네일        │        │
│ │ [응모] 진행중   │ │ [쿠폰팩] D-3   │        │  ← 참여방식 배지 + 상태
│ │ 여름맞이 경품전  │ │ 신규회원 쿠폰팩 │        │
│ │ 07.01 ~ 07.31  │ │ 상시            │        │
│ └────────────────┘ └────────────────┘        │
├──────────────────────────────────────────────┤
│ [상시 혜택]                                    │
│  · 신규가입 쿠폰      · 리뷰 적립               │
│  · 등급 혜택 → /membership                     │
└──────────────────────────────────────────────┘
```

#### 화면 구성 — 상세

```text
┌──────────────────────────────────────────────┐
│ [대표 이미지]  PC / Mobile 분기                │
├──────────────────────────────────────────────┤
│ 여름맞이 경품전            [공유]              │
│ 2026.07.01 ~ 07.31   [진행중]                 │
├──────────────────────────────────────────────┤
│ [본문]  운영자 HTML (새니타이즈 필수)           │
├──────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────┐ │
│ │  [ 응모하기 ]   ← 참여 버튼               │ │  ← 참여형 핵심
│ │  이미 응모하셨습니다 / 로그인이 필요합니다 │ │
│ │  선착순 1,000명 중 342명 참여              │ │
│ └──────────────────────────────────────────┘ │
├──────────────────────────────────────────────┤
│ [유의사항]                                     │
│ [당첨자 발표]  (winner_announce_at 이후)       │
└──────────────────────────────────────────────┘
```

**상태 (기간에서 파생 — 저장하지 않는다)**

| 상태 | 조건 | 참여 버튼 |
|---|---|---|
| 예정 | `NOW() < start_at` | 비활성 "곧 시작합니다" |
| 진행중 | `start_at <= NOW() <= end_at` | 활성 |
| 종료 | `NOW() > end_at` | 비활성 "종료된 이벤트입니다" |
| 마감 | `issued_count >= issue_limit` | 비활성 "선착순 마감" |

**비로그인** 목록·상세는 열람 가능, 참여 버튼 클릭 시 로그인 유도.

#### 스키마 스케치 (전체 DDL 은 구현 단계에서 확정)

```text
event              id(bigint), mall_id, title, slug, summary,
                   event_type(APPLY/COUPON_PACK/ATTENDANCE/PURCHASE/NOTICE),
                   thumbnail_url, pc_hero_url, mobile_hero_url, content(HTML),
                   status(DRAFT/PUBLISHED/HIDDEN),          -- 예정·진행중·종료는 파생
                   start_at, end_at, winner_announce_at,
                   issue_limit(NULL=무제한), issued_count,
                   login_required, view_count, created_at, updated_at
                   UNIQUE (mall_id, slug)

event_participant  id(bigint), event_id(bigint), user_id(int), status, created_at
                   UNIQUE (event_id, user_id)               -- 중복 참여를 DB 로 막는다

event_coupon       id(bigint), event_id(bigint), coupon_id(int), sort_order
```

> **타입 주의.** `users.id`·`coupons.id` 는 **`int`** 다. 참조 컬럼을 `bigint` 로 두면 **FK 생성이 실패**한다
> (기획전 문서에서 같은 실수를 잡았다). `event.id` 계열만 `bigint`.

#### 참여형이 끌고 오는 것 (반드시 함께 설계)

```sql
-- 선착순 수량: 애플리케이션에서 COUNT 후 INSERT 하면 초과 발급된다.
UPDATE event SET issued_count = issued_count + 1
 WHERE id = ? AND (issue_limit IS NULL OR issued_count < issue_limit);
-- affectedRows = 0  →  마감. 이후 event_participant INSERT.
-- 같은 트랜잭션 안에서 처리하고, UNIQUE(event_id,user_id) 위반은 '이미 참여'로 잡는다.
```

- 출석체크는 **서버 시각** 기준(클라이언트 날짜 신뢰 금지).
- 쿠폰팩 지급은 `couponController` 의 `issued_by='ADMIN'` 경로 재사용.
- 참여 액션은 `ensureAuthenticated`.

#### 개발 계획

| 단계 | 내용 |
|---|---|
| 1 | `event` / `event_participant` / `event_coupon` 마이그레이션 |
| 2 | `admin_menus` 에 '이벤트 관리'(`/admin/events`) 추가 + `requireMenuAccess` |
| 3 | 관리자 CRUD — `controllers/admin/eventController.js`, `routes/admin/events.js`, `views/admin/events/` (폼 POST + EJS + redirect) |
| 4 | 이벤트 1건 등록·발행 |
| 5 | 고객 목록/상세 — `controllers/eventController.js`, `routes/event.js`, `views/user/event/{list,detail}.ejs` |
| 6 | `routes/feature.js:35` 의 `res.redirect(302,'/boards/notice')` **제거** → 실제 렌더 (0건이면 comingSoon 폴백) |
| 7 | 참여 액션 — `POST /event/:slug/apply` (트랜잭션 + UNIQUE + 선착순) |

**수정 파일** `routes/feature.js`(별칭 제거), `routes/admin.js`(마운트)
**재사용** `custom_html` 새니타이저(본문), `promotion_banner`(배너), `middleware/upload.js`(이미지)
**선행** B4 (고객센터 경로 분리) — ✅ 완료
**검증** 예정/진행중/종료 각 상태 렌더, 중복 참여 차단, 선착순 초과 발급 없음(동시 요청 테스트)

**몰 스코프 주의** `banners`·`notices`·`coupons` 에는 `mall_id` 가 **없다**. `event` 에는 처음부터 넣는다.

---

### 2-8. 쿠폰 `/coupon` — **무거움 (다운로드 수령)**

#### 화면 구성

```text
┌──────────────────────────────────────────────┐
│ 쿠폰                          [내 쿠폰함 →]   │
├──────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────┐ │
│ │ 5,000원 할인          [ 받기 ]           │ │
│ │ 3만원 이상 구매 시                        │ │
│ │ ~2026.08.31 · 선착순 1,000명 (342 남음)  │ │
│ └──────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────┐ │
│ │ 1,000원 할인          [ 받음 ]  (비활성) │ │
│ │ ~2026.07.31                              │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

**버튼 상태** 받기 / 받음(수령완료) / 마감(수량 소진) / 종료(기간 만료) / 로그인 필요.

**역할 분리 (중복 방지)**
```text
GNB 쿠폰       = 받는 곳   (/coupon)
마이페이지 쿠폰함 = 보는 곳   (/mypage/coupons)
```

#### 스키마 변경

```text
coupons        + download_enabled tinyint(1)
               + download_start_at datetime, download_end_at datetime
               + issue_limit int NULL, issued_count int NOT NULL DEFAULT 0
               (mall_id 없음 — 몰 분리가 필요하면 별도 결정, §7-8)

user_coupons   issued_by enum 에 'DOWNLOAD' 추가  (현재 AUTO/ADMIN/CODE)
               + UNIQUE (user_id, coupon_id)       ← 현재 이 제약이 없다
```

> `UNIQUE (user_id, coupon_id)` 는 **바로 걸 수 있다** — 기존 `user_coupons` 19건에 중복 쌍이 0건임을
> 확인했다(2026-07-10). 다만 같은 쿠폰을 두 번 지급해야 하는 운영 요구가 생기면 이 제약과 충돌한다.

#### 수령 처리 (경쟁 조건)

```sql
-- 이벤트 선착순과 같은 패턴
UPDATE coupons SET issued_count = issued_count + 1
 WHERE id = ? AND download_enabled = 1
   AND (issue_limit IS NULL OR issued_count < issue_limit)
   AND NOW() BETWEEN download_start_at AND download_end_at;
-- affectedRows = 0 → 마감/종료. 아니면 user_coupons INSERT (UNIQUE 위반 = 이미 수령).
```

#### 개발 계획

| 단계 | 내용 |
|---|---|
| 0 | **선행: B2** — 마이페이지 쿠폰함이 없는 컬럼을 조회해 항상 비어 있었다 (✅ `98985fc` 수정) |
| 1 | `coupons` ALTER + `user_coupons.issued_by` enum 확장 + UNIQUE 제약 (중복 사전 확인) |
| 2 | 관리자 쿠폰 폼에 '다운로드 허용·기간·수량' 필드 추가 (`controllers/admin/couponController.js`) |
| 3 | 고객 목록 — `controllers/couponController.js`, `views/user/coupon/list.ejs` |
| 4 | `POST /coupon/:id/claim` (트랜잭션 + UNIQUE + 선착순) |
| 5 | `routes/feature.js` 의 `comingSoon('coupon')` 교체 (다운로드 가능 쿠폰 0건이면 폴백) |

**데이터 현실** 쿠폰 마스터가 **3건**뿐이다. 화면을 만들어도 채울 게 없으므로, 관리자에서 다운로드 쿠폰을 먼저 등록해야 의미가 있다.
**검증** 동시 요청 시 `issued_count` 가 `issue_limit` 을 넘지 않는지, 재수령 시 "받음" 표시, 받은 쿠폰이 `/mypage/coupons` 에 보이는지(B2 수정 덕에 이제 보인다).

---

### 2-9. 멤버십 `/membership` — 가벼움 (정적 소개)

#### 화면 구성

```text
┌──────────────────────────────────────────────┐
│ 멤버십                                        │
├──────────────────────────────────────────────┤
│  WELCOME    SILVER    GOLD     VIP           │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐      │
│  │ 0원  │  │ 10만 │  │ 50만 │  │ 200만│      │
│  │적립1%│  │적립2%│  │적립3%│  │적립5%│      │
│  │      │  │      │  │무료배송│ │전용쿠폰│    │
│  └──────┘  └──────┘  └──────┘  └──────┘      │
├──────────────────────────────────────────────┤
│ [내 등급]  로그인 시에만 — 1차에서는 미표시     │
├──────────────────────────────────────────────┤
│ [혜택 안내]  적립 · 배송 · 생일쿠폰            │
│ [내 적립금 →] /mypage/points                  │
└──────────────────────────────────────────────┘
```

**확정: 안 A(제도 소개 페이지).** 등급 산정을 하지 않는다.

**이유 — 데이터가 없다.**
```text
orders       21건
order_items  21건
users        30명
users 테이블에 등급 컬럼 없음 (points_balance 뿐)
```
구매액 기반 등급을 계산할 대상이 없다. 주문이 쌓인 뒤 안 B(`user_grade` 테이블 + 집계 배치)로 승격한다.

**역할 분리** GNB 멤버십 = 제도 설명 / 마이페이지 포인트 = 내 잔액.

#### 개발 계획

| 구분 | 내용 |
|---|---|
| 신규 | `views/user/membership/index.ejs` (정적 + 등급표) |
| 신규 | 등급 정의는 `system_settings` 또는 상수로. 테이블 불필요 |
| 수정 | `routes/feature.js` — `comingSoon('membership')` → 렌더 |
| 2차 | `user_grade` 테이블, `users.grade_id`, 구매액 집계 배치, "내 등급" 영역 |
| 검증 | 비로그인/로그인 모두 200, 마이페이지 포인트로의 링크 |

---

### 2-10. 쇼핑라이브 `/live` — GNB 편입만

**모듈 설계는 [`live sales.md`](./live%20sales.md) 가 소유한다.** (신규 테이블 6종, YouTube/Vimeo iframe embed MVP, 자체 스트리밍·채팅 제외) 여기서는 GNB 에 붙이는 조건만 정한다.

#### 화면 구성 — 목록 (스케치)

```text
┌──────────────────────────────────────────────┐
│ 쇼핑라이브                                     │
├──────────────────────────────────────────────┤
│ [ON AIR]  ● 생방송 중                         │
│ ┌────────────────┐                           │
│ │  썸네일 · LIVE  │  제품 소개 방송            │
│ └────────────────┘                           │
├──────────────────────────────────────────────┤
│ [편성표]  예정 방송 — 시작 시각 · 알림신청      │
│ [다시보기]  종료 방송 — replay                 │
└──────────────────────────────────────────────┘
```

상세는 `[영상 embed] + [연동 상품 카드] + [쿠폰] + [공지/Q&A]` 구조(‘영상이 붙은 상품 판매 랜딩’).

**상태** `SCHEDULED` / `ON_AIR` / `ENDED` / `HIDDEN` / `CANCELLED`.

#### 개발 계획 (GNB 관점)

| 구분 | 내용 |
|---|---|
| 선행 | `live_show` 등 테이블 + 관리자 CRUD (`live sales.md`) |
| 순서 | 관리자 배포 → **방송 1건 발행** → `routes/feature.js` 의 `comingSoon('live')` 교체 |
| 안전 | 발행된 방송이 0건이면 준비중 랜딩으로 폴백 |
| 주의 | `feature_menu.LIVE.module_ready` 는 **이미 1** 이라 GNB 에 노출 중이다 |
| 보류 | `order_item.source_type='LIVE_SHOW'` 매출 귀속은 `order_items` ALTER 가 필요 → 결제 트랜잭션을 건드리므로 라이브 1차와 분리 |
| 보안 | 관리자 iframe 원문 저장 금지(videoId 만), 주문 시점 가격·재고·쿠폰 서버 재검증 |

---

## 3. 선행 버그 — 메뉴 개발의 의존성

아래는 "나중에 고칠 것"이 아니라 **해당 메뉴가 출시될 수 없는 조건**이다.

| # | 버그 | 위치 | 막는 메뉴 | 증상 | 상태 |
|---|---|---|---|---|---|
| B1 | 브랜드 목록에 `mall_id` 필터 없음 | `controllers/brandController.js:8` | **브랜드** | mall=2 에 mall=1 브랜드 25개 노출 | ✅ 수정됨 (`a7e7861`) |
| B2 | 마이페이지 쿠폰함이 없는 컬럼 조회 | `controllers/mypageController.js:52,263-271` | **쿠폰** | `.catch` 폴백으로 항상 빈 쿠폰함 | 미수정 |
| B3 | `badge_expire_date` 미적용 | `controllers/productController.js` DEADLINE_SALE 분기 | **오늘특가** | 만료 3주 지난 상품(id 106)이 특가에 노출 | 미수정 |
| B4 | `HEADER_CS` 가 `/cs` 가 아닌 `/boards/notice` | `feature_menu` 데이터 | **이벤트&혜택** | 고객센터·이벤트가 같은 화면을 가리킴 | 미수정 |

B2·B3 는 코드 수정, B4 는 데이터 수정이다.

> **B4 는 두 곳을 고쳐야 완결된다** (둘 다 DB. 코드 수정 없음).
> ```sql
> UPDATE feature_menu SET default_path='/cs' WHERE feature_code='HEADER_CS';   -- 헤더 고객센터
> UPDATE page_section SET config_json = JSON_SET(config_json,'$.items[3].url','/cs')
>   WHERE section_type='quick_menu';                                            -- 모바일 퀵메뉴
> ```
> `views/partials/storefront/header.ejs:226` 의 `/boards/notice` 는 라벨이 **"게시판"**이므로
> 그대로 둔다. `views/user/cs/index.ejs` 의 공지 링크들도 정상이다.

> **B1 후속.** 별도 작업으로 mall=2 에 브랜드 카테고리 **1,354건**이 생성되고 상품 **6,739건**이
> 연결됐다(`a7e7861`). 따라서 아래 "브랜드 mall=2 = 0건" 기술은 더 이상 유효하지 않다.
> 브랜드 메뉴는 이제 두 몰 모두에서 실기능이다.

---

## 4. 공통 제약

### 4-1. 멀티몰 스코프

`mall_id` 를 **가진** 테이블: `products`, `categories`, `page`, `product_group`, `custom_menu`, `navigation_config`, `mall_feature_menu`, `hero_slide` 등.
`mall_id` 가 **없는** 테이블: **`banners`, `notices`, `coupons`, `users`, `orders`**.

mall=2(종합관)가 이미 라이브이므로, 이벤트·쿠폰 메뉴를 `banners`/`coupons` 위에 세우면 **두 몰이 같은 데이터를 공유**한다. 신규 `event` 테이블에는 처음부터 `mall_id` 를 넣고, 기존 테이블 확장이 필요하면 별도 마이그레이션으로 분리한다.

### 4-2. 배포 순서 (module_ready 함정)

GNB 12개가 **이미 전부 `module_ready=1`** 이고 **개발 DB = 운영 DB** 다. 준비중 랜딩을 실제 목록으로 바꾸는 순간 운영에 즉시 반영된다.

```text
1. 데이터/스키마 준비        (이벤트 1건, 라이브 1건, 아울렛 상품 존재 확인)
2. 관리자 화면 배포          (운영자가 콘텐츠를 넣을 수 있어야 한다)
3. 고객 라우트 교체          (목록 0건이면 comingSoon 폴백)
```

`module_ready` 를 내리는 선택지도 있다. 다만 이미 노출 중인 메뉴를 내리면 GNB 가 변하므로, **0건 폴백**이 더 안전하다.

### 4-3. 빈 상태(empty state)는 선택이 아니다

몰마다 데이터가 극단적으로 다르다.

| 메뉴 | mall 1 | mall 2 |
|---|---:|---:|
| 오늘특가(DEADLINE_SALE) | 4 | 240 |
| 아울렛(discount>0) | **0** | 4,499 |
| 브랜드(BRAND 카테고리) | 25 | 1,354 |
| 신상품(NEW 뱃지) | 10 | 200 |
| 베스트(BEST 뱃지) | 31 | 151 |

모든 목록형 메뉴는 0건일 때의 화면을 반드시 정의한다. 특히 **아울렛은 mall=1 에서 항상 0건**이다.

---

## 5. 재사용 자산

| 필요 | 있는 것 | 위치 |
|---|---|---|
| 상품 카드 | `product_card.ejs` (`product` 필수, `opts` 선택) | `views/partials/` |
| 목록 레이아웃 | `user/products/list.ejs` (정렬바·페이지네이션 **인라인**) | 공용 파티셜 없음 → 랭킹·아울렛 구현 시 공용화 검토 |
| 카테고리 탭 + 정렬 전환 | `ranking_tabs` 섹션, `GET /sections/ranking` | 랭킹의 기반 |
| 배너 | `banners.group_key` + `promotion_banner` 섹션 | 이벤트 배너 (단 `mall_id` 없음) |
| 쿠폰 지급 | `couponController` `issued_by='ADMIN'` | 이벤트 쿠폰팩 |
| HTML 새니타이즈 | `custom_html` 섹션 새니타이저 | 이벤트 상세 본문 |
| 준비중 랜딩 | `user/coming_soon` + `COMING_SOON` 맵 | 0건 폴백 |
| 서브트리 카테고리 | `navigationService.getCategoryContext` | 목록 필터 |

---

## 6. 권장 개발 순서

**0차 — 버그 수정 (메뉴 개발의 전제) ✅ 완료**
```text
B1  brandController 에 mall_id                       ✅ a7e7861 (별도 작업)
B2  mypageController 쿠폰 컬럼명 교정                  ✅ 98985fc
B3  badge_expire_date 필터 추가                       ✅ 98985fc
B4  HEADER_CS + quick_menu → /cs                      ✅ 12f25f6 (DB)
```

**0.5차 — 공용 목록 스캐폴드 추출 (§2-0)**
```text
views/user/products/list.ejs 에서 정렬바·페이지네이션·빈상태를 파티셜로 추출
→ 추출 후 기존 /products 가 동일하게 렌더되는지 먼저 확인
목록형 5개 메뉴(오늘특가·아울렛·베스트·신상품·랭킹)가 전부 이것 위에 선다.
이 단계를 건너뛰면 같은 화면을 다섯 번 만들게 된다.
```

**1차 — 데이터가 이미 있는 것부터 (신규 테이블 없음)**
```text
신상품     preset({badge:'NEW'})            한 줄     mall1 10 / mall2 200
베스트     상위 100 상한                     쿼리      mall2 9,677 → 100
아울렛     minDiscount 필터 + 0건 폴백       중간      mall2 4,499 / mall1 은 랜딩
오늘특가   카운트다운 + 마감임박 정렬         중간      만료필터는 완료됨
랭킹       조회수 실시간 + 카테고리 탭        중간      ranking_tabs 승격
브랜드     초성 필터 + 페이지네이션           중간      mall2 1,354개를 감당해야 함
```

**2차 — 신규 모듈**
```text
이벤트&혜택   event/event_participant/event_coupon + 관리자 CRUD + 참여형(확정)
              → /event 의 공지사항 302 별칭 제거
멤버십        제도 소개 페이지(안 A) — 정적
쿠폰          coupons ALTER + 다운로드 수령(issued_by='DOWNLOAD') + UNIQUE(user_id,coupon_id)
              → 선행: 관리자에서 다운로드 쿠폰 등록(현재 마스터 3건뿐)
```

**3차 — 데이터가 쌓인 뒤 / 별도 문서**
```text
랭킹          기간별 집계 테이블(product_view_daily) + 순위 변동 + 판매량 탭
멤버십        실제 등급 시스템(안 B) — user_grade + 구매액 배치
쇼핑라이브     live sales.md 에 따름 (GNB 편입 조건은 §2-10)
오늘특가       만료 뱃지 정리 배치 (다른 화면 카드의 '마감임박' 배지 제거)
order_items    source_type/source_id ALTER — 이벤트·라이브 매출 귀속
```

---

## 7. 확정된 결정 사항 (2026-07-10)

| # | 항목 | 결정 | 비고 |
|---|---|---|---|
| 1 | 개발 순서 | **0차 버그 4건 우선** | B1~B4 수정이 모든 메뉴의 전제 |
| 2 | 신상품 판정 | **`product_badge='NEW'`** | 기간 필터는 시드 `created_at` 동일 문제로 배제 |
| 3 | 베스트 판정 | **조회수 상위 100** | 전체 카탈로그 정렬 금지 |
| 4 | 이벤트 1차 범위 | **참여형까지 포함** | `event_participant` + 중복참여 방지 + 선착순 수량 경쟁조건 처리 필요 |
| 5 | 쿠폰 메뉴 | **실기능(다운로드 수령)** | `issued_by='DOWNLOAD'` 신설. 선행: B2 |
| 6 | 멤버십 | **제도 소개 페이지(안 A)** | 주문 21건으로 등급 산정 불가. 데이터 축적 후 안 B 승격 |
| 7 | 아울렛/오늘특가 경계 | 미정 | 아울렛에서 `DEADLINE_SALE` 제외 여부는 구현 시 결정 |
| 8 | `banners`/`coupons` `mall_id` | 미정 | 쿠폰 실기능이 몰 분리를 요구하면 그때 ALTER |

### 7-1. 결정 4(참여형 이벤트)가 끌고 오는 것

소개형과 달리 참여형은 아래를 **반드시** 함께 설계해야 한다. 구현 착수 시 별도 절로 확장한다.

```text
중복 참여 방지     UNIQUE (event_id, user_id)  — DB 제약으로 막는다. 앱 체크만으로는 경쟁조건에 진다
선착순 수량        UPDATE ... SET issued = issued + 1 WHERE issued < limit  (affectedRows 로 판정)
                   또는 SELECT ... FOR UPDATE. 애플리케이션 카운트 후 INSERT 는 초과 발급된다
로그인 요구        참여 액션은 ensureAuthenticated. 비로그인은 목록·상세까지만
부정 방지          출석체크는 서버 시각 기준(클라이언트 날짜 신뢰 금지)
쿠폰팩 지급        couponController 의 issued_by='ADMIN' 경로 재사용, event_id 를 남긴다
```

### 7-2. 결정 5(쿠폰 실기능)가 끌고 오는 것

```text
스키마      coupons 에 download_enabled / download_start_at / download_end_at / issue_limit / issued_count
            user_coupons.issued_by 에 'DOWNLOAD' 추가 (현재 enum: AUTO/ADMIN/CODE)
제약        UNIQUE (user_id, coupon_id)  — 중복 수령 방지. 현재 이 제약이 없다
선행        B2 (마이페이지 쿠폰함이 깨져 있어, 받아도 보이지 않는다)
```

---

## 8. 진행 체크리스트

**작업 원칙 (2026-07-10 확정)**
1. **정확한 구현이 가능한 화면부터** 먼저 만든다.
2. 성격이 비슷한 목록형 메뉴(오늘특가·아울렛·베스트·신상품·랭킹)는 **공용 스캐폴드(§2-0)를 뽑은 뒤** 한꺼번에 처리한다.
3. 아래 체크박스를 갱신하며 진행한다.
4. **첫 대상: 이벤트&혜택.**

### 8-0. 선행 버그

- [x] **B1** `brandController` 에 `mall_id` 필터 — `a7e7861`
- [x] **B2** 마이페이지 쿠폰함 컬럼명 교정 — `98985fc`
- [x] **B3** `badge_expire_date` 필터 (오늘특가) — `98985fc`
- [x] **B4** 고객센터 경로 `/cs` (feature_menu + quick_menu) — `12f25f6`

### 8-1. 이벤트&혜택 `/event` ✅ 완료 — 응모(APPLY)형까지

정확히 구현 가능한 화면(관리자 CRUD → 고객 목록/상세)을 먼저 하고, 동시성이 걸린 참여 로직을 마지막에 둔다.

- [x] **E1** 스키마 — `event` / `event_participant` / `event_coupon` 마이그레이션
- [x] **E2** 관리자 메뉴 행 추가 (`/admin/events`, `parent_id=31`, `display_order=6`, `is_active=0`)
- [x] **E3** 관리자 목록 화면 (검색·상태 필터)
- [x] **E4** 관리자 등록/수정 폼 (기본정보 · 이미지 · 기간 · 참여설정)
- [x] **E5** 관리자 삭제
- [x] **E6** 관리자 메뉴 활성화 (`is_active=1`) — 라우트가 응답한 뒤에
- [x] **E7** 이벤트 1건 실제 등록·발행
- [x] **E8** 고객 목록 `/event` (상태 필터: 전체·진행중·예정·종료)
- [x] **E9** 고객 상세 `/event/:slug` (대표이미지 · 기간 · 본문 · 유의사항)
- [x] **E10** `routes/feature.js` 의 `/boards/notice` 302 별칭 제거 → 실제 렌더 + **0건이면 comingSoon 폴백**
- [x] **E11** 참여 액션 `POST /event/:slug/apply` — 트랜잭션 · `UNIQUE(event_id,user_id)` · 선착순 `affectedRows` 판정
- [x] **E12** 동시 요청 검증 (선착순 초과 발급 없음 · 중복 참여 차단)

> **범위 주의.** 참여형은 **APPLY(응모)만 동작**한다. 관리자 폼에도 `NOTICE`/`APPLY` 만 노출한다.
> 나머지 3종은 스키마 값으로만 존재하며, 열려면 아래가 선행돼야 한다.
>
> | 유형 | 막는 것 | 필요한 작업 |
> |---|---|---|
> | `ATTENDANCE` 출석체크 | `UNIQUE(event_id,user_id)` 가 1인 1회만 허용 | `event_attendance(event_id,user_id,attend_date)` 별도 테이블 |
> | `COUPON_PACK` 쿠폰팩 | `participate()` 가 쿠폰을 지급하지 않음 | `event_coupon` → `couponController` 의 `issued_by='ADMIN'` 지급 경로 연결 |
> | `PURCHASE` 구매인증 | 주문 검증이 없음 | `order_items` 대조 로직 |
>
> `eventService.PARTICIPABLE_TYPES` 가 화이트리스트다. 여기 없는 유형은 참여 슬롯
> (`issued_count`)을 축내지 못한다(검증: ATTENDANCE 참여 시도 → `closed`, 카운터 0 유지).

- [ ] **E13** 쿠폰팩(COUPON_PACK) — 참여 시 `event_coupon` 의 쿠폰 지급
- [ ] **E14** 출석체크(ATTENDANCE) — `event_attendance` 테이블 + 서버 시각 기준 일별 참여
- [ ] **E15** 구매인증(PURCHASE) — `order_items` 대조

### 8-2. 공용 목록 스캐폴드 (§2-0)

목록형 5개 메뉴의 선행 작업.

- [ ] **S1** `views/user/products/list.ejs` 에서 정렬바·페이지네이션·빈상태 파티셜 추출
- [ ] **S2** 추출 후 기존 `/products` 가 동일하게 렌더되는지 확인 (리팩터링 회귀 검증)
- [ ] **S3** 슬롯 계약(hero / filters / cardOpts / empty) 확정

### 8-3. 목록형 메뉴 (스캐폴드 이후)

- [ ] **L1** 신상품 `/new` — `preset({badge:'NEW'})` (한 줄)
- [ ] **L2** 베스트 `/best` — 조회수 상위 100 상한
- [ ] **L3** 아울렛 `/outlet` — `minDiscount` 필터 + mall=1 은 랜딩 폴백
- [ ] **L4** 오늘특가 `/deal/today` — 카운트다운 + 마감임박 정렬
- [ ] **L5** 랭킹 `/ranking` — 조회수 실시간 + 카테고리 탭 (`ranking_tabs` 승격)

### 8-4. 나머지 메뉴

- [ ] **M1** 브랜드 `/brands` — 초성 필터 + 페이지네이션 (mall=2 1,354개)
- [ ] **M2** 멤버십 `/membership` — 제도 소개 정적 페이지 (안 A)
- [ ] **M3** 쿠폰 `/coupon` — `coupons` ALTER + 다운로드 수령 + `UNIQUE(user_id,coupon_id)`
- [ ] **M4** 쇼핑라이브 `/live` — `live sales.md` 선행, GNB 편입만 (§2-10)

### 8-5. 후순위 (데이터 축적 후)

- [ ] 랭킹 기간별 집계(`product_view_daily`) + 순위 변동
- [ ] 멤버십 실제 등급 시스템(안 B) — `user_grade` + 구매액 배치
- [ ] 오늘특가 만료 뱃지 정리 배치 (다른 화면 카드의 '마감임박' 배지 제거)
- [ ] `order_items` 에 `source_type`/`source_id` ALTER — 이벤트·라이브 매출 귀속
