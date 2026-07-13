# 쇼핑라이브(Live Shopping) — 설계 및 개발 계획서

> **2026-07-13 전면 개정.** 최초 원고는 플랫폼 중립 일반론(REST JSON API · React 컴포넌트 트리 · SKU 옵션 전제)이었다.
> dev-mall 의 실제 코드베이스와 대조해 **틀린 전제를 걷어내고**, 형제 문서(`group_buy` · `exhibition` · `recommend_specialty`)의
> 하우스 스타일로 다시 썼다. 원고에서 살린 것은 **MVP 범위 선긋기 · 방송 상태 머신 · 성과 이벤트 목록** 세 가지다.
> 개정 근거는 §2-1(폐기한 전제)에 전부 남긴다.

---

## 0. 한 줄 요약

**쇼핑라이브는 "라이브 플랫폼"이 아니라 "영상이 붙은 상품 판매 랜딩 페이지"다.**
스트리밍은 YouTube/Vimeo 임베드로 외주하고, 우리는 **상품 · 가격 · 쿠폰 · 공지 · 구매 동선**만 만든다.

그리고 **GNB 메뉴는 이미 있다.** 새로 뚫는 게 아니라 **껍데기를 실모듈로 갈아끼우는 작업**이다.

---

## 1. 현재 상태 — 착수점 (2026-07-13 실측)

원고는 "쇼핑라이브 메뉴를 새로 추가한다"를 전제했다. **틀렸다. 이미 3계층 모두 통과해 GNB 에 떠 있다.**

| 계층 | 현재 값 | 뜻 |
|---|---|---|
| `feature_menu` id=13 | `LIVE` · `/live` · `position=gnb` · **`module_ready=1`** | 카탈로그에 등재됨 |
| `mall_feature_menu` | 몰1(sort 9) · 몰2(sort 13) 모두 **`is_enabled=1`** | 두 몰 다 켜져 있음 |
| 실제 렌더 | **두 몰 GNB 에 '쇼핑라이브' 노출 중** | 고객이 지금 클릭할 수 있다 |
| `/live` 응답 | `routes/feature.js:247` → `comingSoon('live')` | **준비중 랜딩 껍데기** |

`COMING_SOON.live` 정의는 `routes/feature.js:145-152` 에 있다(아이콘 `bi-broadcast`, `robots: noindex,follow`).

### 1-1. GNB 슬롯 — 건드리지 않는다

`navigation_config.max_gnb_items = 12`(두 몰 공통)이고, **카테고리를 제외한 활성 GNB 기능 메뉴가 정확히 12개**다.
`navigationService.js:329` 가 `CATEGORY` 를 분리해 세므로 카테고리는 이 예산에 안 들어간다.

**LIVE 는 이미 그 12개 안에 포함돼 있다.** 따라서:

- 새 `feature_menu` 행이 필요 없다.
- `mall_feature_menu` 를 건드릴 필요가 없다.
- **슬롯을 늘리거나 다른 메뉴를 내릴 필요가 없다.**
- `module_ready` 를 1로 올릴 필요도 없다 — 이미 1이다.

> ⚠️ 뒤집어 말하면 **DB 를 손대지 않아도 배포 즉시 고객에게 노출된다.** 개발 DB = 배포 서버 DB 다.
> `/live` 를 실모듈로 교체하는 순간 그게 바로 고객이 보는 화면이다. §9 배포 순서를 지킬 것.

### 1-2. 라우팅 함정 (반드시)

`routes/feature.js` 는 `app.use('/', featureRoutes)` 로 **가장 먼저** 마운트된다.
`feature.js` 안의 `router.get('/live', comingSoon('live'))` 를 **지우지 않으면**, 뒤에 오는
`app.use('/live', require('./routes/live'))` 는 **영영 닿지 못한다.**

같은 함정이 `routes/feature.js:142-147` 에 이미 두 번 기록돼 있다. 추천·전문관이 밟았던 자리다.

**할 일: `feature.js` 의 `/live` 핸들러 제거 → `COMING_SOON.live` **정의는 남긴다**(0건 폴백에서 재사용).**

---

## 2. 확정 결정

| # | 결정 | 근거 |
|---|---|---|
| 1 | **영상은 외부 임베드만.** 자체 스트리밍·자체 채팅 없음 | MVP 본질. 스트리밍 서버는 이 프로젝트 범위 밖 |
| 2 | **1차는 바로구매만.** 장바구니 담기는 2차 | `carts` 가 5컬럼뿐 — 가격·옵션·출처를 실을 수 없다 (§2-1) |
| 3 | **옵션 선택 UI 없음. 수량 선택만** | 이 몰에 상품 옵션/SKU 테이블이 **존재하지 않는다** |
| 4 | **쿠폰은 연결만.** 쿠폰 엔진을 새로 만들지 않는다 | `coupons`·`coupon_download`·`user_coupons` 가 이미 성숙하다 |
| 5 | **성과 추적은 `order_items.source_type='LIVE_SHOW'`** | 컬럼이 이미 있다. 새 로그 테이블은 3차 |
| 6 | **Q&A 는 2차로 미룬다** | 이 몰에 상품 Q&A 가 없다. 라이브가 그걸 처음 만들 이유는 없다 (§2-1) |
| 7 | **가격 확정은 서버에서만.** 화면 가격은 표시용 | `checkoutController.postForm` 재계산 원칙 (기존 관례) |
| 8 | **0건이면 준비중 랜딩으로 폴백** | 공동구매·이벤트·기획전이 전부 그렇게 한다 |

### 2-1. 폐기한 전제 (되풀이 금지)

원고가 깔았던 전제 중 **이 코드베이스에서 성립하지 않는 것들**이다. 다시 꺼내지 말 것.

| 원고 전제 | 실제 | 판정 |
|---|---|---|
| `skuId` 로 옵션 선택 (§7-2 Bottom Sheet) | **옵션/SKU 테이블이 없다.** `products` 는 단일 `price` + 단일 `stock`. `variant`/`sku` 는 Shopify 연동 전용 컬럼 | **폐기.** 수량 선택만. `views/user/group-buy/detail.ejs:12` 가 같은 이유로 옵션을 뺐다 |
| `POST /api/cart/items` 에 `sourceType`/`sourceId` 를 실어 장바구니 담기 | `carts` = `id, user_id, product_id, quantity, created_at`. **가격·옵션·출처 컬럼 전부 없음.** 비로그인 장바구니도 없음(`user_id NOT NULL`) | **1차 폐기.** 라이브가로 담을 방법이 없다. 장바구니는 2차(§10) |
| REST JSON API (`GET /api/live-shows` 등 13절 전체) | 이 앱은 **SSR EJS**다. 고객 라우트는 렌더, 변경은 **폼 POST + redirect**. 관리자도 EJS 폼 | **전면 교체.** §7 로 다시 씀 |
| React 컴포넌트 트리 (`LiveShoppingPage` → …) | EJS + partial | **전면 교체.** §6 으로 다시 씀 |
| 쿠폰 다운로드를 새로 만든다 | **이미 있다.** `POST /coupon/:id/claim` → `couponIssueService.claimDownloadCoupon()` (선착순 슬롯 + `coupon_download` PK 로 1인1회 보장, 한 트랜잭션) | **재사용.** 라이브는 쿠폰을 **연결만** 한다 |
| 상품 문의(Q&A)를 기존 문의로 붙인다 | `inquiries` 는 **범용 1:1 문의**다. `product_id` 컬럼이 **없고** `title NOT NULL`. 관리자 대시보드의 "상품별 문의 수"는 `kakao_inquiry_logs`(카톡 링크 **클릭 로그**)에서 온다 — 내용도 답변도 없다 | **2차로 이동.** 재사용할 기반이 없다 |
| `live_show_event_log` 로 자체 이벤트 로깅 | `page_views`·`visitor_logs` 가 이미 돈다. 전환은 `order_items.source_*` 로 잡힌다 | **3차.** 1차엔 과잉 |
| DDL 의 `product_id BIGINT` / `coupon_id BIGINT` / `user_id BIGINT` | `products.id`·`coupons.id`·`users.id` 는 전부 **`int`** | **교정.** FK 타입 불일치로 생성 자체가 깨진다 |
| `mall_id` 없는 설계 | 이 몰은 **멀티몰**이다(`mall` 2행: 건강식품관·종합관). 27개 테이블이 `mall_id` 를 쓴다 | **추가.** `live_show.mall_id` 필수 |

---

## 3. 방송 상태 머신

원고의 상태 설계는 **그대로 살린다.** 다만 `exhibition`·`group_buy` 의 `status` 관례(varchar(30), `DRAFT` 기본)에 맞춘다.

```
DRAFT      = 작성 중 (관리자에게만 보임)
SCHEDULED  = 방송 예정
ON_AIR     = 방송 중
ENDED      = 방송 종료
CANCELLED  = 방송 취소
```

`HIDDEN` 은 **상태가 아니라 노출 플래그**다(`list_visible`). `exhibition` 이 그렇게 나눈다. 원고처럼 status 에 섞지 않는다.

| 상태 | 목록 | 상세 | 구매 |
|---|---|---|---|
| `DRAFT` | 제외 | 404 | — |
| `SCHEDULED` | 노출(썸네일 + 시작 시각 + D-day) | 예고 화면 · 판매 예정 상품 · 쿠폰 미리 받기 | **불가** |
| `ON_AIR` | 노출(LIVE 배지) | 영상 임베드 · 구매 버튼 활성 | **가능** |
| `ENDED` | `ended_access_policy` 에 따름 | 다시보기 영상(있으면) | `ended_purchase_policy` 에 따름 |
| `CANCELLED` | 제외 | 취소 안내 | 불가 |

### 3-1. 상태는 수동이 기준이다

**자동 감지하지 않는다.** 외부 URL 임베드 방식에서는 실제 방송 시작을 정확히 알 수 없다.

```
관리자 status = 기준값
표시 보정 = status='SCHEDULED' AND NOW() >= start_at 이면 화면에 "곧 시작" 안내
```

`ON_AIR` ↔ `ENDED` 전환은 **관리자가 버튼으로** 한다. 시간이 지났다고 코드가 멋대로 바꾸지 않는다.
(`end_at` 이 지난 `ON_AIR` 는 목록에서 "방송 종료됨" 배지로 운영자에게 경고만 띄운다.)

---

## 4. 데이터 모델

**FK 타입 주의**: `products.id`·`coupons.id`·`users.id` = `int`. `live_show.id` 등 신규 PK = `bigint`(`group_buy` 관례).
`created_at`/`updated_at` 은 `datetime DEFAULT CURRENT_TIMESTAMP` / `ON UPDATE`(역시 `group_buy` 관례).

### 4-1. `live_show`

```sql
CREATE TABLE live_show (
  id                    BIGINT       NOT NULL AUTO_INCREMENT,
  mall_id               BIGINT       NOT NULL DEFAULT 1,

  title                 VARCHAR(200) NOT NULL,
  slug                  VARCHAR(200) NOT NULL,          -- /live/{slug}
  summary               VARCHAR(500) NULL,
  description           TEXT         NULL,              -- 방송 소개 (새니타이즈 필수)
  notice                TEXT         NULL,              -- 대표 공지 (영상 아래 고정 박스)

  list_thumbnail_url    VARCHAR(500) NULL,
  pc_hero_image_url     VARCHAR(500) NULL,              -- SCHEDULED/ENDED 폴백 이미지
  mobile_hero_image_url VARCHAR(500) NULL,
  og_image_url          VARCHAR(500) NULL,

  -- 영상: URL 통짜 저장 금지. provider + video_id 만 저장하고 embed URL 은 서버가 조립한다 (§8)
  provider              VARCHAR(30)  NOT NULL DEFAULT 'YOUTUBE',   -- YOUTUBE | VIMEO
  video_id              VARCHAR(100) NULL,              -- 방송용 video id
  replay_provider       VARCHAR(30)  NULL,
  replay_video_id       VARCHAR(100) NULL,              -- 다시보기 video id (없으면 방송 id 재사용)

  status                VARCHAR(30)  NOT NULL DEFAULT 'DRAFT',
  start_at              DATETIME     NOT NULL,
  end_at                DATETIME     NULL,

  purchase_enabled      TINYINT(1)   NOT NULL DEFAULT 1,
  ended_purchase_policy VARCHAR(30)  NOT NULL DEFAULT 'DISALLOW',  -- ALLOW | DISALLOW
  ended_access_policy   VARCHAR(30)  NOT NULL DEFAULT 'ALLOW',     -- ALLOW | DISALLOW
  replay_enabled        TINYINT(1)   NOT NULL DEFAULT 1,

  list_visible          TINYINT(1)   NOT NULL DEFAULT 1,
  search_visible        TINYINT(1)   NOT NULL DEFAULT 1,
  share_enabled         TINYINT(1)   NOT NULL DEFAULT 1,

  view_count            INT          NOT NULL DEFAULT 0,

  created_at            DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_live_show_slug (mall_id, slug),
  KEY idx_live_show_list (mall_id, status, start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> **FK 관례**: `group_buy`·`exhibition` 은 **`mall_id` 에 FK 를 걸지 않는다**(KEY 만). 자식 매핑 테이블만 FK+CASCADE 를 건다.
> (`SHOW CREATE TABLE group_buy` / `event_coupon` 확인 — 2026-07-13). 위 DDL 은 그 관례를 따른다.

> `ended_purchase_policy` 기본값이 **`DISALLOW`** 인 이유: 라이브 특가는 "방송 중"이 조건이다.
> 방송 끝나고도 특가로 사는 게 기본이면 특가의 의미가 없다. (기획전은 반대로 `ALLOW` 가 기본)

### 4-2. `live_show_product`

`group_buy_product` 를 그대로 따른다. **라이브가는 `live_price` 한 컬럼**이면 된다.

```sql
CREATE TABLE live_show_product (
  id                  BIGINT      NOT NULL AUTO_INCREMENT,
  live_show_id        BIGINT      NOT NULL,
  product_id          INT         NOT NULL,          -- products.id = int

  role                VARCHAR(30) NOT NULL DEFAULT 'MAIN',   -- MAIN | RELATED
  sort_order          INT         NOT NULL DEFAULT 0,

  badge_text          VARCHAR(100) NULL,             -- "방송 한정 특가" 등
  normal_price        INT         NULL,              -- 표시용 정상가 (미입력 시 products.price)
  live_price          INT         NULL,              -- 라이브가. NULL 이면 상품 원가로 판매
  discount_rate       INT         NULL,

  min_order_quantity      INT     NOT NULL DEFAULT 1,
  max_order_quantity      INT     NULL,
  per_user_limit_quantity INT     NULL,

  purchase_enabled    TINYINT(1)  NOT NULL DEFAULT 1,
  visible             TINYINT(1)  NOT NULL DEFAULT 1,

  created_at          DATETIME    NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_live_show_product (live_show_id, product_id),
  KEY idx_lsp_show (live_show_id, role, sort_order),
  CONSTRAINT fk_lsp_show    FOREIGN KEY (live_show_id) REFERENCES live_show (id) ON DELETE CASCADE,
  CONSTRAINT fk_lsp_product FOREIGN KEY (product_id)   REFERENCES products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**역할은 `MAIN` / `RELATED` 둘뿐이다.** 원고의 `PINNED`/`UPSELL`/`HIDDEN` 은 넣지 않는다
(`HIDDEN` 은 `visible=0` 이고, `PINNED` 는 실시간 전환 기능 — MVP 제외 항목이다).

`MAIN` 은 **0개 또는 1개**. 애플리케이션이 보장한다(DB 제약으로는 못 건다).

### 4-3. `live_show_coupon`

```sql
CREATE TABLE live_show_coupon (
  id            BIGINT     NOT NULL AUTO_INCREMENT,
  live_show_id  BIGINT     NOT NULL,
  coupon_id     INT        NOT NULL,          -- coupons.id = int
  is_primary    TINYINT(1) NOT NULL DEFAULT 0,
  sort_order    INT        NOT NULL DEFAULT 0,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME   NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME   NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_live_show_coupon (live_show_id, coupon_id),
  CONSTRAINT fk_lsc_show   FOREIGN KEY (live_show_id) REFERENCES live_show (id) ON DELETE CASCADE,
  CONSTRAINT fk_lsc_coupon FOREIGN KEY (coupon_id)    REFERENCES coupons (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**연결만 한다.** 다운로드·발급 한도·스코프 판정은 전부 기존 쿠폰 엔진이 한다:

- 다운로드: `POST /coupon/:id/claim` (`routes/coupon.js:16`) — 로그인 필수, 선착순 슬롯 + `coupon_download` PK 로 1인1회
- 적용 판정: `services/coupon/discountCalculator.js` (`scope_json` → `itemInScope()`)
- 확정: `checkoutController.postForm` 의 `validateCoupon()`

라이브 전용 쿠폰을 만들고 싶으면 **관리자에서 쿠폰을 만들고**(`issue_method='DOWNLOAD'`, `scope_json` 으로 대상 상품 한정)
**라이브쇼에 연결**한다. 라이브가 쿠폰을 발급하는 게 아니다.

> **자동 다운로드는 넣지 않는다.** 사용자가 직접 받아야 "받았다"는 사실이 명확하다(원고 §11-3 판단 유지).

### 4-4. `live_show_notice`

```sql
CREATE TABLE live_show_notice (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  live_show_id     BIGINT       NOT NULL,
  title            VARCHAR(200) NOT NULL,
  content          TEXT         NOT NULL,
  notice_level     VARCHAR(30)  NOT NULL DEFAULT 'NORMAL',      -- NORMAL | IMPORTANT
  display_location VARCHAR(30)  NOT NULL DEFAULT 'NOTICE_TAB',  -- NOTICE_TAB | UNDER_VIDEO | BUY_PANEL
  visible_start_at DATETIME     NULL,
  visible_end_at   DATETIME     NULL,
  sort_order       INT          NOT NULL DEFAULT 0,
  is_active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at       DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lsn_show (live_show_id, is_active, sort_order),
  CONSTRAINT fk_lsn_show FOREIGN KEY (live_show_id) REFERENCES live_show (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

채팅이 없으므로 **공지가 유일한 방송 중 커뮤니케이션 수단**이다. 1차에 반드시 넣는다(원고 §9 판단 유지).

### 4-5. 1차에서 만들지 않는 테이블

| 원고 테이블 | 처리 |
|---|---|
| `live_show_question` | **2차.** 상품 Q&A 자체가 이 몰에 없다. 라이브만 따로 만들면 문의 동선이 두 개가 된다 |
| `live_show_event_log` | **3차.** `page_views` + `order_items.source_*` 로 1차 지표는 나온다 |

---

## 5. 구매 동선 — 바로구매만

**공동구매 선례를 그대로 따른다.** `controllers/groupBuyController.js:16-19` 주석이 근거다.

```
라이브 상세에서 [바로구매]
  → GET /checkout?product_id={id}&quantity={n}&live_show_id={liveId}
  → checkoutController.getForm   : 라이브가로 표시 (표시용)
  → checkoutController.postForm  : 라이브가를 서버가 다시 계산 (확정)
  → 기존 결제 플로우 (토스) 그대로
```

`postForm` 은 현재 3분기다: `cart=1` / `group_buy_id` / `product_id`.
여기에 **`live_show_id` 분기를 추가**한다. 분기 안에서 재검증할 것:

| 검증 | 실패 시 |
|---|---|
| 라이브쇼가 존재하고 `status IN ('ON_AIR')` (또는 `ENDED` + `ended_purchase_policy='ALLOW'`) | `closed` |
| `live_show.purchase_enabled = 1` | `closed` |
| 해당 상품이 이 라이브쇼에 연결됨 + `purchase_enabled=1` + `visible=1` | `disabled` |
| 상품 `status='ON'`, `stock >= quantity` | `soldout` / `stock` |
| `min_order_quantity` ≤ quantity ≤ `max_order_quantity` | `min` / `max` |
| `per_user_limit_quantity` (회원 누적) | `max` |
| **가격 = `live_price` (없으면 `products.price`)** — 폼이 보낸 금액은 **쓰지 않는다** | — |

오류는 상세로 되돌려 메시지를 띄운다(`groupBuyController.LINE_ERRORS` 와 같은 방식).

### 5-1. 성과 추적

주문 라인에 출처를 남긴다. **컬럼은 이미 있다.**

```
order_items.source_type = 'LIVE_SHOW'
order_items.source_id   = live_show.id
```

> ⚠️ **함정.** `services/deal/dealService.js:172` 는 **`source_type` 이 비어 있는 라인만** 특가 대상으로 잡는다.
> 라이브 라인에 `source_type='LIVE_SHOW'` 를 넣으면 그 라인엔 쇼핑특가가 **안 붙는다** — 이건 **의도된 동작**이다
> (라이브가와 특가가 이중으로 먹으면 안 된다). 다만 이 상호작용을 모르고 나중에 "왜 특가가 안 붙지?" 하지 말 것.

`GROUP_BUY` · `DEAL` 에 이어 세 번째 출처 값이다. `varchar(30)` 이라 스키마 변경 없이 추가된다.

### 5-2. 가격 우선순위 — 실측 (2026-07-13)

같은 상품(#24, 정가 27,700 / 특가 19,300)으로 두 경로를 실제로 통과시킨 결과다.

| 경로 | `source_type` | 결제 단가 | 왜 |
|---|---|---|---|
| 일반 바로구매 | `NULL` | **19,300원** | 특가가 붙는다 (기존 동작 그대로 — 회귀 없음) |
| 라이브 바로구매 | `'LIVE_SHOW'` | **19,900원** | 라이브가가 기준. 특가는 건너뛴다 |

즉 **라이브 라인의 가격은 `live_price` 하나로 끝난다.** 특가는 얹히지 않고, 쿠폰만 그 위에 `scope_json` 으로 적용된다.

> ⚠️ **운영 주의.** 위 실측이 그대로 보여주듯, **라이브가를 특가보다 비싸게 잡으면 고객이 손해를 본다**
> (라이브에서 사면 19,900 인데 그냥 사면 19,300). 라이브가는 **그 상품의 현재 실판매가(특가 포함)보다 싸야** 한다.
> 코드는 이걸 막지 않는다 — 운영자가 지켜야 한다. 관리자 상품 표의 '정상가' 자리에 특가가 아닌 원가가 뜨므로 특히 주의.

---

## 6. 화면

**모바일 우선.** 라이브는 모바일 소비가 압도적이다.

### 6-1. 목록 `/live`

```
[히어로] 진행 중인 방송 (ON_AIR) — 있으면 크게, 영상 썸네일 + LIVE 배지
[섹션]   방송 예정 (SCHEDULED) — 시작 시각 · D-day
[섹션]   지난 방송 (ENDED, replay_enabled=1) — 다시보기
```

**발행된 라이브가 0건이면 `COMING_SOON.live` 랜딩으로 폴백**한다(§1-2). 빈 목록을 고객에게 보이지 않는다.

### 6-2. 상세 `/live/{slug}` — 모바일

```
[헤더]        ← 뒤로  ·  방송 제목  ·  공유
[영상]        iframe (16:9 고정)  ·  LIVE 배지 / 상태 배지
              SCHEDULED → 히어로 이미지 + 시작 시각 + 카운트다운
              ENDED     → 다시보기 iframe (없으면 히어로 이미지)
[중요 공지]   display_location='UNDER_VIDEO' 인 IMPORTANT 공지 (있을 때만)
[대표 상품]   MAIN 카드 — 이미지 · 브랜드 · 상품명 · 정상가(취소선) · 라이브가 · 할인율 · 뱃지 · 재고
[탭]          상품 | 혜택 | 공지
  상품 탭     대표 상품 + 함께 판매 상품(RELATED) 그리드
  혜택 탭     연결 쿠폰 카드([받기] → POST /coupon/:id/claim) · 무료배송 조건 · 적립 안내
  공지 탭     live_show_notice 목록
[하단 고정바] 수량 ▾  ·  [바로구매]     ← 장바구니 버튼 없음 (§2 결정 2)
```

**옵션 선택 Bottom Sheet 는 만들지 않는다.** 옵션이 없으니 고를 게 없다. **수량만** 고른다.

### 6-3. 상세 — PC

```
좌측: 영상 · 방송 소개 · 공지        |   우측(sticky): 대표 상품 · 가격 · 쿠폰 · 수량 · [바로구매]
하단: 함께 판매 상품 그리드
```

영상과 구매 패널이 **동시에** 보여야 한다. 상품 상세로 이동하지 않아도 구매 판단이 서야 한다.

### 6-4. 홈 노출 (선택 · 2차)

SDUI 섹션으로 붙인다. 섹션 타입은 현재 **18종**이고 `sectionRegistry.js` 가 단일 소스다.

1. `views/partials/sections/live_carousel.ejs`
2. `services/display/sectionRegistry.js` 에 `live_carousel` 등록 → **관리자 폼이 자동 생성된다**
3. `services/display/resolvers/live_carousel.js` + `resolvers/index.js` 맵 등록

`displayService.js` 는 **건드리지 않는다**(레지스트리/리졸버 맵 조회로 디스패치).

---

## 7. 라우트 (SSR — REST API 아님)

### 7-1. 고객

| 메서드 | 경로 | 처리 |
|---|---|---|
| GET | `/live` | 목록 (0건 → 준비중 랜딩) |
| GET | `/live/:slug` | 상세 (DRAFT/CANCELLED → 404, ENDED → `ended_access_policy`) |
| POST | `/coupon/:id/claim` | **기존 라우트 재사용.** 라이브가 새로 만들지 않는다 |
| GET | `/checkout?product_id=&quantity=&live_show_id=` | **기존 체크아웃.** `postForm` 에 분기만 추가 |

`/live/{id}/replay` 별도 페이지는 **만들지 않는다.** 상세가 `ENDED` 면 알아서 다시보기를 렌더한다(원고 §17 도 "통합 가능" 이라 적었다).

> **Express 5 함정**: path-to-regexp v8 은 `:id(\d+)` 를 지원하지 않는다. 숫자 검증은 로컬 `requireNumericId` 미들웨어로.
> `/new` 같은 리터럴 경로는 `/:slug` 보다 **먼저** 선언한다.

### 7-2. 관리자 `/admin/lives`

전부 EJS 폼 POST + redirect (JSON API 아님).

| 메서드 | 경로 | 처리 |
|---|---|---|
| GET | `/admin/lives` | 목록 (상태 필터) |
| GET | `/admin/lives/new` | 등록 폼 ← `/:id` 보다 먼저 |
| POST | `/admin/lives` | 등록 |
| GET | `/admin/lives/:id/edit` | 수정 폼 (상품·쿠폰·공지 탭 포함) |
| POST | `/admin/lives/:id` | 수정 |
| POST | `/admin/lives/:id/status` | 상태 전환 (ON_AIR / ENDED / CANCELLED) |
| POST | `/admin/lives/:id/delete` | 삭제 |
| POST | `/admin/lives/:id/products` | 상품 연결 (검색 → 담기) |
| POST | `/admin/lives/:id/products/:mappingId` | 역할·라이브가·순서·수량제한 수정 |
| POST | `/admin/lives/:id/products/:mappingId/delete` | 연결 해제 |
| POST | `/admin/lives/:id/coupons` | 쿠폰 연결 |
| POST | `/admin/lives/:id/coupons/:mappingId/delete` | 연결 해제 |
| POST | `/admin/lives/:id/notices` | 공지 등록 |
| POST | `/admin/lives/:id/notices/:noticeId` | 공지 수정 |
| POST | `/admin/lives/:id/notices/:noticeId/delete` | 공지 삭제 |

**몰 컨텍스트**: 관리자는 `req.adminMallId` 를 쓴다(`MALL_ID = 1` 하드코딩 금지 — `middleware/adminMallContext.js:13`).

---

## 8. 외부 영상 URL 처리 — 보안

**관리자가 넣은 iframe HTML 을 그대로 저장하지 않는다.** XSS 통로가 된다.

### 8-1. 입력 · 저장

```
관리자 입력 : YouTube/Vimeo URL 또는 video id (아무거나)
서버 파싱   : URL → video id 추출
저장        : provider ('YOUTUBE'|'VIMEO') + video_id 만
렌더        : 서버가 embed URL 을 조립
```

허용 호스트만 파싱한다: `youtube.com` · `youtu.be` · `www.youtube.com` · `m.youtube.com` · `vimeo.com` · `player.vimeo.com`.
그 외 도메인, `<script>`, `<iframe>` 문자열이 섞여 들어오면 **거부**한다.

video id 형식도 검증한다: YouTube `^[A-Za-z0-9_-]{11}$`, Vimeo `^\d+$`.

### 8-2. 렌더

```html
<!-- YouTube -->
<iframe src="https://www.youtube.com/embed/{videoId}?autoplay=0&controls=1&playsinline=1&rel=0&modestbranding=1"
        title="쇼핑라이브" loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen></iframe>

<!-- Vimeo -->
<iframe src="https://player.vimeo.com/video/{videoId}?playsinline=1"
        title="쇼핑라이브" loading="lazy"
        allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
```

`playsinline=1` 로 모바일 전체화면 강제 전환을 줄인다. **`enablejsapi` 는 1차에서 쓰지 않는다** — JS 로 제어할 게 없다.

`description`·`notice` 는 `services/display/htmlSanitizer.js` 의 `sanitize()` 를 반드시 통과시킨다(기존 관례).

### 8-3. YouTube 임베드의 한계 — 받아들인다

- YouTube 로고·플레이어 UI 가 남는다 (`modestbranding` 도 완전히 없애진 못한다)
- 완전한 커스텀 플레이어는 불가
- 영상 클릭 시 YouTube 로 이동할 수 있다

**이질감을 없애려 싸우지 않는다.** 대신 **우리 헤더 · 상품 카드 · 가격 · 쿠폰 UI 로 화면을 강하게 감싼다.**
영상은 화면의 일부일 뿐, 페이지의 주인공은 상품이다.

---

## 9. 배포 순서 (반드시)

**개발 DB = 배포 서버 DB.** `/live` 는 **이미 GNB 에 링크가 걸려 있다.** 순서를 틀리면 고객이 깨진 화면을 본다.

```
1. 마이그레이션 실행 (scripts/migrate_live_show.sql)
   → 테이블 4개 CREATE. 아직 아무도 안 읽으므로 무해.
   → admin_menus INSERT 는 **하지 않는다** (3번에서)

2. 코드 커밋 → push → GitHub Actions → 배포
   ⚠️ 이 시점에 /live 가 준비중 랜딩 → 실모듈로 바뀐다.
      발행된 라이브가 0건이므로 컨트롤러가 COMING_SOON.live 로 폴백한다 → 화면은 그대로다. 안전하다.
      (0건 폴백을 빼먹으면 이 순간 고객에게 빈 목록이 뜬다)

3. 배포 확인 후 admin_menus INSERT
   → 먼저 넣으면 라우트 없는 사이드바에 404 메뉴가 뜬다

4. 관리자에서 라이브쇼 생성 → DRAFT 로 작업 → 준비되면 SCHEDULED/ON_AIR
   → 이때부터 /live 에 실제 목록이 뜬다
```

### 9-1. `admin_menus` INSERT (배포 확인 후 수동 실행)

```sql
-- parent_id 31 = '페이지/전시 관리' 그룹 — 기획전(3)·공동구매(4)가 사는 곳이다.
-- (프로모션 그룹 33 은 쿠폰·포인트·이벤트. 라이브는 전시/판매 채널이므로 31)
INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
VALUES ('쇼핑라이브 관리', '/admin/lives', 'bi bi-broadcast', 5, 31, 1, 'super_admin,admin,content_admin');
```

> `requireMenuAccess('/admin/lives')` 의 인자와 `admin_menus.path` 값이 **문자 단위로 일치**해야 한다
> (`middleware/adminRoleGuard.js:26-29`). 안 맞으면 `content_admin` 이 403 을 맞는다.

### 9-2. 씨드 데이터를 코드로 넣지 않는다

개발 DB = 배포 서버 DB 다. 스크립트가 만든 라이브쇼가 **그대로 고객에게 노출된다.**
라이브쇼 생성은 관리자 화면에서 운영자가 한다.

---

## 10. 개발 순서

| 스프린트 | 범위 | 산출 | 상태 |
|---|---|---|---|
| **S1** | 데이터 + 관리자 | 테이블 4개 · `/admin/lives` CRUD · 영상 URL 파싱/검증 · 상품 연결 · 쿠폰 연결 · 공지 | ✅ 완료 |
| **S2** | 고객 화면 | `/live` 목록(0건 폴백) · `/live/:slug` 상세 · 영상 임베드 · 상태별 렌더 · 대표/함께 상품 · 하단 고정바 | ✅ 완료 |
| **S3** | 구매 연동 | `checkoutController` 에 `live_show_id` 분기 · 라이브가 서버 재계산 · `order_items.source_type='LIVE_SHOW'` | ✅ 완료 |
| **S4** | 혜택 · 공지 | 쿠폰 탭(기존 claim 재사용) · 공지 탭 · 중요 공지 고정 박스 | ✅ 완료 |
| **S5** (2차) | 확장 | 장바구니 담기(→ `carts` 확장 필요) · 라이브 Q&A · 홈 `live_carousel` 섹션 | 미착수 |
| **S6** (3차) | 분석 | 이벤트 로그 테이블 · 라이브별 성과 대시보드 | 미착수 |

**S1~S4 가 1차 MVP.** S3 없이 S2 만 나가면 "보기만 하고 못 사는 페이지"가 되므로 **S2·S3 는 함께 배포**한다.

### 10-1. 1차 검증 결과 (2026-07-13, 로컬 3006 · 실 DB)

실제로 라이브를 만들고 주문까지 통과시킨 뒤 **테스트 데이터는 전부 삭제**했다(`live_show` 0건 → `/live` 는 다시 준비중 랜딩).

| 검증 | 결과 |
|---|---|
| `/live` 0건 → 준비중 랜딩 폴백 | ✅ 빈 목록 노출 안 됨 |
| 관리자 영상 입력에 `<iframe>` HTML | ✅ 거부 |
| 허용 외 도메인(`evil.com`) | ✅ 거부 |
| 정상 YouTube URL | ✅ `video_id` 만 추출 저장 (`dQw4w9WgXcQ`) |
| 라이브가 19,900 (정상가 27,700) | ✅ 할인율 28% 자동 계산 |
| 상세 화면 | ✅ 임베드·뱃지·가격·재고·바로구매 전부 렌더 |
| 최대수량(3) 초과 주문 | ✅ `?error=max` 로 차단 |
| 라이브에 없는 상품으로 POST 위조 | ✅ `?error=notfound` 로 차단 |
| 주문서 금액 | ✅ 19,900 × 2 = **39,800** (정가 55,400 아님) |
| 주문 라인 출처 | ✅ `source_type='LIVE_SHOW'`, `source_id=1` |
| 주문 있는 라이브 삭제 | ✅ 차단 ("주문 1건이 있어 삭제할 수 없습니다") |
| 기존 기능 회귀 | ✅ `/` `/best` `/deals` `/group-buy` `/coupon` `/exhibition` `/recommend` 전부 200 |

---

## 11. 변경 파일

### 신규

| 파일 | 역할 |
|---|---|
| `scripts/migrate_live_show.sql` | 테이블 4개 DDL + `admin_menus` INSERT(주석 처리 — 배포 후 수동) |
| `services/live/liveService.js` | 목록·상세 조립, 상태 판정, 가격 계산, 영상 URL 파싱/검증 |
| `controllers/liveController.js` | `/live` · `/live/:slug` (0건 → 준비중 폴백) |
| `routes/live.js` | |
| `views/user/live/list.ejs` · `detail.ejs` | |
| `controllers/admin/liveController.js` | 라이브쇼 CRUD + 상품·쿠폰·공지 관리 |
| `routes/admin/lives.js` | |
| `views/admin/lives/list.ejs` · `edit.ejs` | |

### 수정

| 파일 | 변경 |
|---|---|
| `routes/feature.js` | **`router.get('/live', comingSoon('live'))` 제거.** `COMING_SOON.live` **정의는 유지**(0건 폴백에서 재사용) |
| `app.js` | `app.use('/live', require('./routes/live'))` 마운트 |
| `routes/admin.js` | `router.use('/lives', requireMenuAccess('/admin/lives'), require('./admin/lives'))` |
| `controllers/checkoutController.js` | `getForm`·`postForm` 에 `live_show_id` 분기 추가 (라이브가 재계산 + source 기록) |

### 건드리지 않는 것

- `feature_menu` · `mall_feature_menu` · `navigation_config` — **이미 다 돼 있다** (§1)
- `services/coupon/*` — 쿠폰 엔진 재사용
- `services/display/displayService.js` — SDUI 섹션은 레지스트리 등록만 (2차)

---

## 12. 보안 · 운영 체크

| 항목 | 처리 |
|---|---|
| 관리자 영상 URL | 허용 호스트 + video id 정규식 검증. iframe HTML 저장 금지 (§8-1) |
| `description`/`notice` | `htmlSanitizer.sanitize()` 통과 |
| **주문 시점 가격 재검증** | `postForm` 에서 `live_price` 를 DB 에서 다시 읽는다. **폼이 보낸 금액은 쓰지 않는다** |
| 재고 | 결제 확정 시 `completeOrderWithStockAndPaid` 가 `FOR UPDATE` 잠금 + 차감 (기존) |
| 쿠폰 중복 다운로드 | `coupon_download` PK 가 막는다 (기존) |
| 방송 종료 후 구매 | `ended_purchase_policy` 체크 (기본 `DISALLOW`) |
| 품절 구매 | `products.status`/`stock` 체크 |
| slug 충돌 | `uk_live_show_slug (mall_id, slug)` |

> **원칙: 프론트 가격 = 표시용, 백엔드 가격 = 결제 기준.** 이 몰의 체크아웃은 이미 이 원칙으로 서 있다. 깨지 말 것.

---

## 13. MVP 최종 범위

**고객**
라이브 목록 · 라이브 상세 · 외부 영상 시청 · 방송 상태 표시 · 대표 상품 · 함께 판매 상품 ·
라이브가 표시 · 쿠폰 다운로드 · 공지 확인 · **수량 선택 + 바로구매** · 다시보기

**관리자**
라이브쇼 등록/수정/삭제 · YouTube/Vimeo 등록 · 방송 시간 · 상태 전환 · 대표/함께 상품 연결 ·
라이브가 · 수량 제한 · 쿠폰 연결 · 공지 관리

**빼는 것 (원고 §1 유지 + 이 몰의 제약)**
자체 스트리밍 · 실시간 채팅 · 실시간 시청자 수 · 실시간 투표 · 쇼호스트 콘솔 · 방송 중 상품 자동 전환 ·
PIP · 자체 VOD 인코딩 · **옵션 선택(옵션이 없다)** · **장바구니 담기(2차)** · **Q&A(2차)**
