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

## 2. 메뉴별 설계

각 항목은 동일 서식을 따른다: 담길 내용 / 현재 상태 / 필요한 것 / 재사용 자산 / 선행조건.

---

### 2-1. 오늘특가 `/deal/today`

**담길 내용**
상단에 종료까지 남은 시간(가장 임박한 `badge_expire_date` 기준). 상품 카드마다 할인율·정가 취소선·남은 재고. 정렬은 마감임박순 기본.

**현재 상태** — 동작한다. mall=1 4건, mall=2 240건.
`routes/feature.js:31` `preset({ badge: 'DEADLINE_SALE' })` → `productController.getList`.

**결함**: `products.badge_expire_date` 를 **고객 화면 어디서도 검사하지 않는다**. 관리자(`controllers/admin/productController.js`)가 저장만 한다. 실제로 mall=1 상품 106번(광동 멀티비타민)은 만료일이 `2026-06-20` 으로 3주 지났는데 지금도 "기간임박할인"에 노출 중이다.

**필요한 것**
```sql
-- productController.getList 의 DEADLINE_SALE 분기에 추가
AND (badge_expire_date IS NULL OR badge_expire_date >= CURDATE())
```
카운트다운은 서버가 가장 이른 만료일을 내려주고 클라이언트가 렌더.

**재사용** `product_card.ejs`, `user/products/list.ejs`.
**선행조건** 없음(버그 수정이 곧 구현).

---

### 2-2. 베스트 `/best`

**담길 내용** 누적 조회수 상위 100개. 카테고리 필터. 순위 번호 없음.

**현재 상태** 전체 상품을 조회수순 정렬만 한다(mall=2 → 9,677건). 이름과 불일치.

**필요한 것** `LIMIT 100` 성격의 상한. 페이지네이션을 유지하려면 "상위 100개 내에서 페이징".
`products.view_count` 는 상세 페이지 렌더 시에만 +1 된다(`productController.js:296`) — 목록 노출은 카운트하지 않으므로 지표로 쓸 만하다.

**재사용** 기존 `sort=best` 경로 그대로.
**선행조건** 없음.

**결정 필요** 상한을 100 으로 할지, "조회수 N 이상"으로 할지. 데이터가 적은 몰에서는 상한이 더 안전하다.

---

### 2-3. 신상품 `/new`

**담길 내용** 최근 30일 이내 등록 상품. 입고일 표기.

**현재 상태** 전체를 `created_at` 역순 정렬(mall=2 → 9,677건).

**필요한 것**
```sql
AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
```
**주의**: mall=2 상품 9,677건은 **시드 스크립트가 방금 한꺼번에 INSERT** 해서 `created_at` 이 전부 같다. 30일 필터를 걸면 오늘은 9,677건 전부, 30일 뒤에는 0건이 된다. 기간 필터를 넣기 전에 이 데이터 특성을 감안해야 한다(시드 시 `created_at` 을 분산시키거나, 신상품 판정을 `product_badge='NEW'` 로 바꾸는 선택지).

**결정 필요** 신상품 판정 기준 — `created_at` 기간 vs `product_badge='NEW'`(현재 mall=2 에 200건, mall=1 에 10건 부여됨). 후자가 운영자 통제가 쉽고 데이터 특성에 안전하다. **`product_badge='NEW'` 권장.**

---

### 2-4. 이벤트&혜택 `/event` ★ 신규 모듈

**담길 내용**
```text
[진행중 이벤트 카드 그리드]   썸네일 · 제목 · 기간 · 참여방식 배지(응모/쿠폰팩/출석/구매인증)
[종료 이벤트]                흐리게, 당첨자 발표 링크
[상시 혜택 영역]             신규가입 쿠폰 · 리뷰 적립 · 등급 혜택 요약(멤버십으로 연결)
[이벤트 상세]                대표 이미지 · 기간 · 참여 버튼 · 유의사항 · 당첨자 발표
```

**현재 상태 — 잘못 연결돼 있다.** `routes/feature.js:35`
```js
router.get('/event', (req, res) => res.redirect(302, '/boards/notice'));
```
공지사항으로 302 한다. 그런데 **공지사항은 고객센터의 하위 항목**이지 이벤트가 아니다. 게다가 `HEADER_CS` 도 같은 `/boards/notice` 를 가리켜 두 메뉴가 한 화면을 공유한다.

**필요한 것 — 이벤트 테이블이 아예 없다.** (`SHOW TABLES LIKE '%event%'` → 0건)

최소 스키마 스케치(전체 DDL 은 구현 단계에서 확정):
```text
event            id, mall_id, title, slug, summary, event_type, thumbnail_url,
                 pc_hero_url, mobile_hero_url, content(HTML),
                 status(DRAFT/PUBLISHED/HIDDEN), start_at, end_at,
                 participation_type(NONE/APPLY/CODE/ATTENDANCE/PURCHASE),
                 winner_announce_at, view_count, created_at, updated_at
                 UNIQUE (mall_id, slug)
event_participant  id, event_id, user_id(int, users.id 가 int), status, created_at
event_coupon       id, event_id, coupon_id(int, coupons.id 가 int)   -- 쿠폰팩 이벤트
```
> **타입 주의.** `users.id`·`coupons.id` 는 `int` 다. 참조 컬럼을 `bigint` 로 두면 **FK 생성이 실패**한다
> (기획전 문서에서 동일한 실수를 잡았다). `event.id` 계열은 신세대 관례대로 `bigint`.

**재사용** 배너(`banners.group_key` + `promotion_banner` 섹션)로 이벤트 배너 노출 가능. 쿠폰 지급은 `couponController` 의 `issued_by='ADMIN'` 경로 재사용.

**선행조건 / 결정 필요**
- `banners`·`notices`·`coupons` 에 **`mall_id` 컬럼이 없다.** mall=2 가 이미 라이브이므로, 이벤트를 이들 위에 세우면 **단일 몰 전용**이 된다. `event` 테이블에는 처음부터 `mall_id` 를 넣는다.
- 참여형(응모/출석/룰렛)까지 1차에 넣을지, **공지형 이벤트 소개 페이지**부터 시작할지. → **소개 페이지 우선 권장**(참여 로직은 부정 방지·중복 참여 처리가 따라붙는다).

---

### 2-5. 브랜드 `/brands`

**담길 내용** 브랜드 로고 그리드, 초성 필터, 찜한 브랜드, 브랜드별 상품 진입.

**현재 상태** 동작하나 **몰 경계를 넘는다.**

```js
// controllers/brandController.js:8 — mall_id 조건이 없다
SELECT c.id, c.name, c.display_order, c.logo_image_path
FROM categories c
WHERE c.type = 'BRAND'
```
종합관(mall=2)에서 `/brands` 를 열면 건강식품관 브랜드 25개(백세식품·휴럼·일양약품…)가 그대로 나온다. 클릭하면 `/brands/11` → `/products/brand/11` → mall=2 에 해당 브랜드 상품이 0건이라 **빈 목록**.

> 홈의 브랜드 캐러셀(`services/display/resolvers/brand_carousel.js:26`)에는 **이미 `mall_id` 필터가 있다**.
> 새는 곳은 `/brands` 목록 페이지 하나다.

**필요한 것** `WHERE c.type='BRAND' AND c.mall_id = ?` (스토어프론트 `req.mallId`).
mall=2 에는 BRAND 카테고리가 0개이므로, 수정 후에는 빈 상태 화면이 필요하다. 종합관 브랜드를 만들 생각이면 별도 작업이다(상품 9,677건의 `provider` 에 브랜드명 1,394종이 이미 들어 있다).

**선행조건** 이 버그 수정 전에는 브랜드 메뉴를 mall=2 에서 "정상"이라 부를 수 없다.

---

### 2-6. 랭킹 `/ranking`

**담길 내용**
```text
[기간 탭]      실시간 | 주간 | 월간
[카테고리 탭]  전체 | 대분류…
[순위 리스트]  1·2·3위 강조, 순위 번호, 변동(▲▼-), 상품 카드
```

**현재 상태** 준비중 랜딩. 다만 **재료는 상당히 있다** — `ranking_tabs` 섹션(홈)과 `GET /sections/ranking` AJAX 가 이미 카테고리 탭 + 정렬 전환을 구현했다.

**필요한 것**
- 기간별 집계. `page_views`(354,883행)로 기간 조회수를 낼 수 있으나 `page_url` 파싱이 필요하다. 정공법은 일별 집계 테이블(`product_view_daily`)이다.
- 순위 변동은 **직전 스냅샷 저장**이 있어야 계산된다.

**데이터 현실 — 판매량 랭킹은 불가능하다.** `order_items` 가 **전체 21건**이다. `productController` 의 `sort=sales` 는 구현돼 있지만 21건으로는 순위가 무의미하다. **조회수 기반으로만 출시**하고, 주문이 쌓이면 판매량 탭을 추가한다.

**선행조건** 없음(조회수 기반 실시간 랭킹은 지금도 가능). 기간 탭은 집계 테이블이 선행.

---

### 2-7. 아울렛 `/outlet`

**담길 내용** 할인율 큰 순 상품 그리드, 할인율 구간 필터(30%↑/50%↑/70%↑), 품절 임박 표시.

**현재 상태** 준비중 랜딩. `routes/feature.js` 주석은 "`discount_rate > 0` 인 상품이 **0개**라 목록을 만들어도 항상 빈다"고 적혀 있다.

**이 전제는 이제 깨졌다.**
```text
mall 1 : discount_rate > 0  →     0건   (주석 그대로)
mall 2 : discount_rate > 0  → 4,499건   (CJ 데이터 시드로 생김)
```
아울렛은 **이제 mall=2 에서 실기능이 가능하다.** 다만 mall=1 에서는 여전히 0건이므로 **몰별 빈 상태 화면이 필수**다. 빈 목록을 그냥 보여주느니 준비중 랜딩으로 폴백하는 편이 낫다(기획전 문서에 적은 것과 같은 원칙).

**필요한 것** `getList` 에 `discount_rate` 필터가 없다(정렬만 있다). `minDiscount` 쿼리 파라미터 추가.
```sql
AND discount_rate >= ?
```

**결정 필요** 오늘특가와의 경계. 오늘특가는 `DEADLINE_SALE` 뱃지 + 만료일(시간 한정), 아울렛은 `discount_rate`(상시). mall=2 에서 240건이 양쪽에 모두 걸린다 — **아울렛에서 `DEADLINE_SALE` 을 제외**할지 결정해야 한다.

---

### 2-8. 쿠폰 `/coupon`

**담길 내용** 받을 수 있는 쿠폰 카드 목록, [받기] 버튼, 이미 받은 쿠폰은 비활성, 사용조건·유효기간, 내 쿠폰함 링크.

**현재 상태** 준비중 랜딩. 이유: **고객이 받아가는 '다운로드 쿠폰' 개념이 없다.**
`user_coupons.issued_by` 는 `AUTO`(가입 시 자동) / `ADMIN`(관리자 지급) / `CODE`(주문서 코드 입력) 3종뿐이다. 고객이 스스로 받는 경로가 없다.

**필요한 것**
- `coupons` 에 다운로드 가능 여부·기간·수량 컬럼. `issued_by` 에 `DOWNLOAD` 추가.
- 중복 수령 방지(유니크 제약 `(user_id, coupon_id)`), 선착순 수량 차감 시 경쟁 조건 처리.

**선행조건 — 마이페이지 쿠폰함이 지금 깨져 있다.**
```js
// controllers/mypageController.js:263-271 — 존재하지 않는 컬럼을 조회한다
c.type, c.min_purchase, c.expires_at
// 실제 스키마:  coupon_type,  min_order_amount,  valid_to
```
`.catch(() => [[]])` 폴백이 걸려 있어 예외 없이 **항상 빈 목록**으로 렌더된다. 쿠폰을 받게 만들어도 받은 쿠폰이 보이지 않는다. **이 버그 수정이 쿠폰 메뉴의 선행조건이다.**

**결정 필요** GNB 쿠폰을 (a) 수령 화면으로 신설할지, (b) 마이페이지 쿠폰함으로 보내고 GNB 에서 뺄지.
현재 쿠폰 마스터는 **3건**뿐이라 (a)의 실익이 크지 않다. **(b) 후 데이터가 쌓이면 (a)** 를 권장.
또한 `coupons` 에 `mall_id` 가 없어 몰 구분 없이 공유된다.

---

### 2-9. 멤버십 `/membership`

**담길 내용** 등급표(등급명·조건·혜택), 내 등급과 다음 등급까지 남은 조건, 등급별 할인·적립률·무료배송.

**현재 상태** 준비중 랜딩. 이유: **`users` 에 등급 컬럼이 없다**(`points_balance` 뿐).

**데이터 현실** 등급을 구매액으로 산정하려면 주문 이력이 필요한데 **`orders` 21건 · `order_items` 21건**이다. 등급 산정 자체가 성립하지 않는다.

**결정 필요 — 두 갈래**

| 안 | 내용 | 필요 작업 | 평가 |
|---|---|---|---|
| A. 제도 소개 페이지 | 등급 체계를 **정적으로 소개**. 내 등급 표시 없음 | 뷰 1개 + 설정 테이블 | 데이터 없이 즉시 가능 |
| B. 실제 등급 시스템 | `user_grade` 테이블 + `users.grade_id` + 구매액 집계 배치 | 스키마·배치·주문 연동 | 주문 21건으로는 무의미 |

**A 를 먼저 권장한다.** 주문이 쌓인 뒤 B 로 승격한다. 마이페이지 포인트(`/mypage/points`)와 역할이 겹치지 않도록, GNB 멤버십은 **제도 설명**, 마이페이지는 **내 잔액**으로 고정한다.

---

### 2-10. 쇼핑라이브 `/live`

설계는 [`live sales.md`](./live%20sales.md) 가 소유한다(신규 테이블 6종, YouTube/Vimeo iframe embed 기반 MVP, 자체 스트리밍 제외). 여기서는 **GNB 편입 조건**만 정한다.

- `/live` 는 현재 `comingSoon('live')` 다. 실제 목록으로 교체할 때 **방송이 0건이면 준비중 랜딩으로 폴백**한다.
- `feature_menu.LIVE.module_ready` 는 **이미 1** 이다(GNB 노출 중). 라우트 교체 전에 최소 1건의 `live_show` 가 발행돼 있어야 한다.
- `order_item.source_type='LIVE_SHOW'` 귀속은 `order_items` **ALTER 가 필요**하다(현재 해당 컬럼 없음). 결제 트랜잭션을 건드리므로 라이브 1차와 분리한다.

---

## 3. 선행 버그 — 메뉴 개발의 의존성

아래는 "나중에 고칠 것"이 아니라 **해당 메뉴가 출시될 수 없는 조건**이다.

| # | 버그 | 위치 | 막는 메뉴 | 증상 | 상태 |
|---|---|---|---|---|---|
| B1 | 브랜드 목록에 `mall_id` 필터 없음 | `controllers/brandController.js:8` | **브랜드** | mall=2 에 mall=1 브랜드 25개 노출 | ✅ 수정됨 (`a7e7861`) |
| B2 | 마이페이지 쿠폰함이 없는 컬럼 조회 | `controllers/mypageController.js:52,263-271` | **쿠폰** | `.catch` 폴백으로 항상 빈 쿠폰함 | 미수정 |
| B3 | `badge_expire_date` 미적용 | `controllers/productController.js` DEADLINE_SALE 분기 | **오늘특가** | 만료 3주 지난 상품(id 106)이 특가에 노출 | 미수정 |
| B4 | `HEADER_CS` 가 `/cs` 가 아닌 `/boards/notice` | `feature_menu` 데이터 | **이벤트&혜택** | 고객센터·이벤트가 같은 화면을 가리킴 | 미수정 |

B2·B3 는 코드 수정, B4 는 데이터(`feature_menu.default_path`) 수정이다.

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

**0차 — 버그 수정 (메뉴 개발의 전제)**
```text
B4  feature_menu.HEADER_CS.default_path → /cs        (데이터 1줄)
B3  badge_expire_date 필터 추가                       (오늘특가 정상화)
B1  brandController + brand_carousel 에 mall_id       (브랜드 정상화)
B2  mypageController 쿠폰 컬럼명 교정                  (쿠폰함 복구)
```

**1차 — 데이터가 이미 있는 것부터**
```text
아울렛     discount_rate 필터 + 0건 폴백        (mall 2 에 4,499건)
베스트     상위 100 상한                        (이름과 내용 일치)
신상품     product_badge='NEW' 기준으로 전환     (기간 필터는 시드 특성상 위험)
랭킹       조회수 기반 실시간 + 카테고리 탭      (ranking_tabs 재사용, 판매량 탭 보류)
```

**2차 — 신규 모듈**
```text
이벤트&혜택   event 테이블 + 소개형 페이지(참여 로직 제외) + 관리자 CRUD
멤버십        제도 소개 페이지(안 A)
```

**3차 — 데이터가 쌓인 뒤**
```text
쿠폰          다운로드 수령 플로우 (issued_by='DOWNLOAD')
멤버십        실제 등급 시스템(안 B) — 주문 데이터 확보 후
랭킹          기간별 집계 테이블 + 순위 변동
쇼핑라이브     live sales.md 에 따름
이벤트        참여형(응모·출석·룰렛)
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
