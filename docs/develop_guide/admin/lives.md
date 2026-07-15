# 쇼핑라이브 관리 (Live Shows)

## 1. 개요

쇼핑라이브는 **라이브 플랫폼이 아니라 "영상이 붙은 상품 판매 랜딩"** 입니다. 스트리밍은 YouTube/Vimeo 에 외주하고, 이 저장소는 상품·가격·쿠폰·공지·구매 동선만 만듭니다(`services/live/liveService.js:8-10`).

| | 쇼핑라이브 (`live_show`) | 공동구매 (`group_buy`) |
|---|---|---|
| 상태 | **관리자 수동** (5종) | 기간에서 phase 파생 |
| 결제 단가 | `live_show_product.live_price` (**NULL 이면 상품 원가**) | `group_buy_price` (**NOT NULL**) |
| 참여 기록 | 없음 — `order_items.source_type='LIVE_SHOW'` 가 유일한 성과 소스 | `group_buy_participation` |
| 구매 동선 | 바로구매만 | 바로구매만 |
| 하위 구조 | `live_show_product` + `live_show_coupon` + `live_show_notice` | `group_buy_product` |

> **상태를 시간으로 파생하지 않는 이유(§3):** 외부 URL 임베드 방식에서는 **실제 방송 시작을 알 수 없습니다.** 그래서 `status` 는 운영자가 직접 바꿉니다. 시간은 "곧 시작"/"종료 시각 지남" 같은 **표시 보정**에만 씁니다. 코드가 `status` 를 바꾸는 지점은 어디에도 없습니다.

- **Base URL:** `/admin/lives` (`routes/admin.js:63`, `requireMenuAccess('/admin/lives')`)
- **관련 테이블:** `live_show`, `live_show_product`, `live_show_coupon`, `live_show_notice`, (참조) `products`, `coupons`, `coupon_download`, `order_items`
- **컨트롤러:** `controllers/admin/liveController.js`
- **서비스:** `services/live/liveService.js` (관리자·고객·주문 공용)
- **뷰:** `views/admin/lives/list.ejs`, `views/admin/lives/edit.ejs` (등록·수정 공용)
- **고객 화면:** `/live`, `/live/:slug` (`routes/live.js`, `controllers/liveController.js`)
- **이미지 업로드:** Multer 3종 `ls_list_thumbnail` / `ls_pc_hero_image` / `ls_mobile_hero_image` (`routes/admin/lives.js:26-30`). **`ls_` 접두어가 붙는 이유:** multer 의 destination 이 fieldname 으로만 저장 경로를 고르므로, 접두어가 없으면 기획전·공동구매의 같은 이름 필드와 폴더가 섞입니다.
- **권한:** `admin_menus` id=58, parent_id=31(페이지/전시 관리), `visible_roles = super_admin,admin,content_admin`

---

## 2. 라우트 (`routes/admin/lives.js`)

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/lives` | getList | 목록 (검색 `q`, 상태 `status`) |
| GET | `/admin/lives/add` | getAdd | 등록 폼 |
| POST | `/admin/lives/add` | postAdd | 등록 (multipart) |
| GET | `/admin/lives/product-search` | getProductSearch | 상품 검색 모달 (JSON) |
| GET | `/admin/lives/:id/edit` | getEdit | 수정 폼 (기본 + 상품 + 쿠폰 + 공지) |
| POST | `/admin/lives/:id/edit` | postEdit | 기본정보 수정 (multipart) |
| POST | `/admin/lives/:id/status` | postStatus | **상태만** 변경 |
| POST | `/admin/lives/:id/delete` | postDelete | 삭제 (주문 있으면 차단) |
| POST | `/admin/lives/:id/products` | postSaveProducts | 상품 매핑 일괄 저장 |
| POST | `/admin/lives/:id/products/add` | postAddProduct | 상품 담기 |
| POST | `/admin/lives/:id/products/:mappingId/delete` | postRemoveProduct | 상품 빼기 |
| POST | `/admin/lives/:id/coupons` | postSaveCoupons | 쿠폰 대표·순서·활성 저장 |
| POST | `/admin/lives/:id/coupons/add` | postAddCoupon | 쿠폰 연결 |
| POST | `/admin/lives/:id/coupons/:mappingId/delete` | postRemoveCoupon | 쿠폰 해제 |
| POST | `/admin/lives/:id/notices` | postSaveNotices | 공지 일괄 저장 |
| POST | `/admin/lives/:id/notices/add` | postAddNotice | 공지 등록 |
| POST | `/admin/lives/:id/notices/:noticeId/delete` | postRemoveNotice | 공지 삭제 |

Express 5 대응은 다른 모듈과 같습니다 — 정적 세그먼트(`/add`, `/product-search`)를 `/:id` 보다 먼저 선언하고 `requireNumericId` 로 숫자 검증. 응답은 저장소 표준(폼 POST → redirect), JSON 은 상품 검색 하나뿐입니다.

---

## 3. 상태 (수동 전환)

| status | 라벨 | 고객 노출 | 구매 |
|--------|------|----------|------|
| DRAFT | 임시저장 | ✗ | ✗ |
| SCHEDULED | 방송 예정 | ○ | ✗ |
| ON_AIR | 방송 중 | ○ | ○ (`purchase_enabled=1` 일 때) |
| ENDED | 방송 종료 | ○ (다시보기) | `ended_purchase_policy='ALLOW'` 일 때만 |
| CANCELLED | 방송 취소 | ✗ | ✗ |

- **공개 대상:** `status IN ('SCHEDULED','ON_AIR','ENDED') AND list_visible = 1` (`PUBLIC_WHERE`, `liveService.js:278`)
- **`POST /admin/lives/:id/status`** 가 상태 전환 전용입니다. 목록에서 방송 시작/종료를 한 번에 누를 수 있어야 하고, 폼 전체를 다시 저장하게 하면 방송 중에 다른 값이 함께 바뀌는 사고가 납니다.
- `ON_AIR` 로 바꾸려면 **`video_id` 가 있어야 합니다**(빈 iframe 을 고객에게 보이지 않음).
- `decorate()` 의 파생 필드는 **표시 보정일 뿐 status 를 바꾸지 않습니다** (`liveService.js:183-214`):
  - `startingSoon` — SCHEDULED 인데 `start_at` 이 지났다 → "곧 시작합니다"
  - `overdue` — ON_AIR 인데 `end_at` 이 지났다 → 관리자 목록에 경고
  - `purchasable` — `purchase_enabled && (ON_AIR || (ENDED && ended_purchase_policy='ALLOW'))`
  - `playerUrl` — ON_AIR 면 방송 영상, ENDED + `replay_enabled` 면 다시보기 영상
- 상태·목록노출·삭제 시 `navigationService.invalidateContentGate(mallId)` 를 호출합니다 (§7).

---

## 4. 영상 (XSS 차단 지점)

**iframe HTML 을 저장하지 않습니다.** `provider` + `video_id` 만 저장하고 embed URL 은 서버가 조립합니다.

- **입력 파싱** `liveService.parseVideoId(provider, raw)` — 관리자가 URL 을 넣든 순수 id 를 넣든 id 만 뽑습니다.
  1. `[<>]` 가 있으면 즉시 거부 → "iframe/HTML 은 넣을 수 없습니다."
  2. provider 화이트리스트: `YOUTUBE` | `VIMEO`
  3. 호스트 화이트리스트 — YouTube: `youtube.com`, `m.youtube.com`, `youtu.be`, `youtube-nocookie.com` 등 / Vimeo: `vimeo.com`, `player.vimeo.com`
  4. id 정규식 — YouTube `^[A-Za-z0-9_-]{11}$`, Vimeo `^\d{6,12}$`
  5. 경로 패턴: `?v=`, `/live/{id}`, `/embed/{id}`, `/shorts/{id}`, `youtu.be/{id}`, `vimeo.com/{id}`
- **출력 조립** `liveService.embedUrl(provider, videoId)` — 여기서 만든 URL만 iframe `src` 에 들어갑니다. `enablejsapi` 는 쓰지 않습니다.
- **`controllers/admin/liveController.js` 의 `buildFields()` 가 이 검증을 통과시키는 유일한 지점입니다.** 실패하면 `_videoError` 에 사유를 담아 저장을 막습니다.
- **수정 시 영상 입력을 비우면 기존 영상을 유지합니다**(`postEdit:373-377`). 방송 중에 실수로 폼을 저장해 영상이 날아가는 사고를 막기 위함입니다. 정말 지우려면 `video_clear` / `replay_clear` 체크박스를 씁니다.
- 다시보기 영상(`replay_video_id`)이 없으면 방송 `video_id` 를 재사용합니다.

---

## 5. 상품·가격·구매

### 5.1 상품 매핑

- **담기**(`postAddProduct`): 다른 몰 상품 거부. **첫 상품이 `role='MAIN'`**, 이후는 `RELATED`. 초기값 `normal_price = original_price || price`, `live_price = price`, `discount_rate` 는 서버 계산.
- **일괄 저장**(`postSaveProducts`): `role`·`sort_order`·`badge_text`·`normal_price`·`live_price`·`min/max_order_quantity`·`purchase_enabled`·`visible` 갱신.
  - **MAIN 은 1개로 강제**됩니다 — 두 번째부터는 서버가 RELATED 로 내립니다(DB 제약으로는 못 검).
  - `live_price` 가 비면 **NULL 로 저장**하고 상품 원가로 팝니다. 공동구매(`group_buy_price` NOT NULL)와 다른 점입니다.
  - `max < min` 이면 `max` 를 NULL 로 (아무 수량도 못 사는 상황 방지).
  - `discount_rate` 는 폼 값을 무시하고 `svc.calcDiscountRate()` 로 서버가 계산합니다.

### 5.2 구매 (바로구매만)

1. `POST /live/:slug/buy` → `svc.resolveLine()` → `/checkout?product_id=&quantity=&live_show_id=`
2. `checkoutController` 가 **주문서 GET(:318)·주소 검증(:450)·주문 생성(:551)** 세 지점 모두에서 `resolveLine()` 을 다시 호출합니다. 프론트가 보낸 가격은 절대 신뢰하지 않습니다.
3. `order_items.source_type='LIVE_SHOW'`, `source_id = live_show.id`

**`resolveLine()` 검증 순서** (`liveService.js:468-515`): 라이브 존재(`ON_AIR`|`ENDED`) → `purchasable` → 매핑 존재(`visible=1`, `p.visibility='PUBLIC'`) → `purchase_enabled` → `p.status='ON'` → 재고 > 0 → `min_order_quantity` → `max_order_quantity` → 재고 수량 → 단가(`live_price || products.price`, 0 이하면 실패).

실패 사유(`reason`) → 고객 메시지(`controllers/liveController.js:49-57`): `notfound` / `closed` / `disabled` / `soldout` / `min` / `max` / `stock`

> **쇼핑특가는 라이브 라인에 붙지 않습니다.** `dealService.applyToScopeItems()` 가 `source_type` 이 이미 있는 라인을 건너뛰기 때문입니다. 라이브가가 특가를 이깁니다.

> **장바구니 미지원.** 이 몰의 `carts` 테이블에는 가격·출처 컬럼이 없어 라이브가를 실을 수 없습니다(2차).

---

## 6. 쿠폰 · 공지

### 6.1 쿠폰 — **연결만** 합니다

- 라이브는 쿠폰을 **만들지 않습니다.** 기존 `coupons` 를 `live_show_coupon` 으로 연결할 뿐입니다.
- 연결 가능 대상: `(mall_id = ? OR mall_id IS NULL)` + `is_active=1` + `status IN ('ACTIVE','DRAFT','PAUSED')` — 이미 연결된 것 제외, 최대 200건.
- 첫 연결 쿠폰이 자동으로 `is_primary=1`. 일괄 저장에서 `primary_mapping_id` 로 하나만 대표가 됩니다.
- **다운로드는 기존 쿠폰 엔진 재사용** — `POST /coupon/:id/claim`. `couponController` 가 `live:{slug}` 컨텍스트를 받아 상세로 되돌립니다(`?msg=` / `?err=`).
- 고객 화면의 `claimable` 판정(`getCoupons`): `issue_method='DOWNLOAD'` && 다운로드 기간 내 && `issued_count < issue_limit`. DOWNLOAD 가 아닌 쿠폰(자동가입·관리자지급)은 받기 버튼이 뜨지 않습니다.

### 6.2 공지 (`live_show_notice`)

- `notice_level`: NORMAL / IMPORTANT
- `display_location`: **NOTICE_TAB**(공지 탭) / **UNDER_VIDEO**(영상 아래 고정) / **BUY_PANEL**(구매 패널 하단)
- `visible_start_at` / `visible_end_at` 로 노출 기간 제어(NULL = 무제한)
- 정렬: IMPORTANT 먼저 → `sort_order` → `id`
- `content` 는 저장 시 `sanitize()` 통과. 제목·내용이 비면 등록 거부(일괄 저장에서는 그 행만 skip).

---

## 7. 고객 화면 · GNB 게이트

- 라우트: `routes/live.js` — `GET /live`(목록), `GET /live/:slug`(상세), `POST /live/:slug/buy`
- URL 은 `/live` **고정**입니다 (`feature_menu.LIVE.default_path`, 운영자가 못 바꿈)
- **0건 폴백:** 공개 라이브가 0건이면 `COMING_SOON.live` 준비중 랜딩 (`liveController.js:64`)
- **콘텐츠 게이트:** `services/menu/navigationService.js` 의 `CONTENT_GATES.LIVE = hasAnyPublic(mallId)` — **공개 라이브가 0건이면 GNB 에서 자동으로 숨깁니다.** 게이트와 0건 폴백이 같은 판정을 써야 "GNB 에는 있는데 눌러보면 준비중"이 안 생깁니다. 30초 TTL 캐시(`GATE_TTL_MS`), 관리자가 등록·수정·상태변경·삭제할 때마다 `invalidateContentGate()` 호출. 게이트 판정 중 예외가 나면 **숨기는 쪽으로 fail-safe** 합니다.
- 목록 정렬: `FIELD(status,'ON_AIR','SCHEDULED','ENDED')` → 예정은 시작 빠른 순, 나머지는 최신순. 방송 중이 항상 맨 위입니다.
- 목록 필터: `all` / `ON_AIR` / `SCHEDULED` / `ENDED`
- 상세: `ENDED` + `ended_access_policy='DISALLOW'` 면 `/live` 로 리다이렉트(404 보다 친절). `search_visible=0` 이면 `noindex,follow`.
- **다시보기 전용 경로는 없습니다.** 상세가 ENDED 면 알아서 다시보기를 렌더합니다.
- 옵션/SKU 테이블이 없으므로 고객은 **수량만** 고릅니다.

---

## 8. DB

### 8.1 `live_show` (28컬럼)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | bigint PK | **`order_items.source_id` 가 이 값을 가리킨다** |
| mall_id | bigint | |
| title / slug / summary | varchar | `uk_live_show_mall_slug (mall_id, slug)`. slug 는 한글 허용 |
| description / notice | text | HTML — 저장 시 + 렌더 시 이중 sanitize |
| list_thumbnail_url / pc_hero_image_url / mobile_hero_image_url | varchar(500) | 관리자 업로드 |
| og_image_url | varchar(500) | SEO 에서 읽지만 **관리자 폼에 업로드 필드가 없다**(항상 NULL) |
| provider / video_id | varchar | YOUTUBE \| VIMEO + 영상 ID (**iframe HTML 저장 금지**) |
| replay_provider / replay_video_id | varchar NULL | 없으면 방송 `video_id` 재사용 |
| status | varchar(30) | DRAFT / SCHEDULED / ON_AIR / ENDED / CANCELLED (**수동**) |
| start_at | datetime NOT NULL | |
| end_at | datetime NULL | |
| purchase_enabled | tinyint(1) | |
| ended_purchase_policy | varchar(30) | **DISALLOW**(기본) / ALLOW |
| ended_access_policy | varchar(30) | **ALLOW**(기본, 다시보기) / DISALLOW |
| replay_enabled | tinyint(1) | |
| list_visible / search_visible / share_enabled | tinyint(1) | |
| view_count | int | 상세 조회 시 +1 (await 하지 않음 — 실패해도 화면은 뜬다) |

### 8.2 `live_show_product`

`id`, `live_show_id`(FK CASCADE), `product_id`(FK CASCADE, **int**), `role`(**MAIN**/RELATED), `sort_order`, `badge_text`, `normal_price`(표시용 정상가, NULL 이면 `products.price`), `live_price`(**NULL 이면 상품 원가로 판매**), `discount_rate`(서버 계산), `min_order_quantity`(기본 1), `max_order_quantity`, `per_user_limit_quantity`(**§9 CRITICAL**), `purchase_enabled`, `visible`
유니크: `uk_ls_product (live_show_id, product_id)`

### 8.3 `live_show_coupon`

`id`, `live_show_id`(FK CASCADE), `coupon_id`(FK CASCADE, **int**), `is_primary`, `sort_order`, `is_active`
유니크: `uk_ls_coupon (live_show_id, coupon_id)`

### 8.4 `live_show_notice`

`id`, `live_show_id`(FK CASCADE), `title`, `content`, `notice_level`(NORMAL/IMPORTANT), `display_location`(NOTICE_TAB/UNDER_VIDEO/BUY_PANEL), `visible_start_at`, `visible_end_at`, `sort_order`, `is_active`

---

## 9. 주의사항

- **🔴 CRITICAL — `per_user_limit_quantity` 가 저장할 때마다 NULL 로 덮어써집니다.**
  `views/admin/lives/edit.ejs` 에 이 컬럼의 **입력 필드가 없는데**, `controllers/admin/liveController.js:561,573` 은 `per_user_limit_quantity = toPositiveInt(p.per_user_limit_quantity)` 를 UPDATE 에 포함합니다. 폼이 그 키를 보내지 않으므로 `toPositiveInt(undefined)` → `null` → **상품 저장 버튼을 누를 때마다 기존 값이 지워집니다.**
  게다가 **1인 구매 제한은 애초에 작동하지 않습니다** — `liveService.resolveLine()`(:503-508)은 `min`/`max`/재고만 검사하고 회원의 누적 구매량을 조회하지 않습니다. (공동구매도 같은 상태입니다.)
  고치려면 ① edit.ejs 에 입력 필드를 추가하고 ② `resolveLine()` 에 회원 누적 구매 검증을 넣거나, ③ 최소한 UPDATE 문에서 이 컬럼을 빼서 데이터가 지워지지 않게 해야 합니다.
- **상태는 코드가 바꾸지 않습니다.** `start_at`/`end_at` 이 지나도 ON_AIR → ENDED 로 넘어가지 않습니다. 운영자가 방송을 끝내고 상태를 안 바꾸면 **ENDED 가 아닌 채로 계속 판매됩니다.** 관리자 목록의 `overdue` 경고가 유일한 안전장치입니다.
- **주문이 1건이라도 있으면 삭제 불가.** `order_items` 에는 FK 가 없어 DB 가 막아주지 않으므로 `postDelete` 가 COUNT 로 차단합니다. 대신 '방송 취소'(CANCELLED) 또는 목록 숨김을 쓰라고 안내합니다.
- **몰 스코프.** `live_show_product` / `live_show_coupon` / `live_show_notice` 에는 `mall_id` 가 없습니다. 반드시 `findOwned(mallId, id)` 로 부모를 먼저 확인하세요.
- **`og_image_url` 은 죽은 컬럼입니다.** 고객 상세 SEO 가 읽지만(`liveController.js:150`) 관리자 `IMAGE_FIELDS` 에는 3종만 있어 값이 들어갈 경로가 없습니다. OG 이미지는 `pc_hero_image_url` → `list_thumbnail_url` 폴백으로 채워집니다.
- **성과 집계 소스는 `order_items` 뿐입니다.** 별도 참여 테이블(공동구매의 `group_buy_participation` 같은)이 없습니다. 관리자 목록의 `order_count`·`revenue` 는 `source_type='LIVE_SHOW'` 주문 라인에서 `status NOT IN ('PENDING','CANCELLED','REFUNDED')` 로 집계합니다.
- **미구현:** 홈 SDUI `live_carousel` 섹션, 장바구니 담기, 실시간 Q&A/채팅, 이벤트 로그·성과 대시보드.

---

*Last Updated: 2026-07-15*
