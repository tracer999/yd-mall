# 이벤트&혜택 관리 (Events)

## 1. 개요

이벤트&혜택은 **응모·쿠폰팩·출석 등 참여·혜택 중심** 모듈입니다. 상품을 전시하지 않고(상품 매핑 테이블이 없다) 가격도 건드리지 않습니다. 고객이 하는 행동은 "참여(응모)" 하나이고, 그 결과가 `event_participant` 에 남습니다. 같은 계열 두 모듈과의 차이는 스키마가 그대로 보여줍니다.

| | 이벤트&혜택 (`event`) | 기획전 (`exhibition`) | 공동구매 (`group_buy`) |
|---|---|---|---|
| 목적 | 참여·혜택 (응모) | 시즌·브랜드·테마별 상품 전시 랜딩 | 조건부 판매 캠페인 |
| 상품 매핑 | **없음** | `exhibition_product` | `group_buy_product` |
| 가격 | 없음 | 없음 (상품가 그대로) | `group_buy_price` (결제가 재계산) |
| 고객 액션 | `POST /event/:slug/apply` (참여) | 없음 (열람만) | `POST /group-buy/:slug/buy` (구매) |
| 기록 테이블 | `event_participant` (1인 1회 UNIQUE) | 없음 | `group_buy_participation` |
| 선착순 | `issue_limit` / `issued_count` | 없음 | `target_quantity` (목표 수량, 판매용) |
| 이미지 | URL **문자열 입력**(업로드 없음) | Multer 업로드 4종 | Multer 업로드 3종 |

- 코드 근거: `controllers/admin/eventController.js:1-34`, `services/event/eventService.js:36-53`
- **Base URL:** `/admin/events` (`routes/admin.js:48`, `requireMenuAccess('/admin/events')`)
- **관련 테이블:** `event`, `event_participant`, `event_coupon`(테이블만 존재, 미연동)
- **컨트롤러:** `controllers/admin/eventController.js`
- **서비스:** `services/event/eventService.js` (고객 읽기 + 참여 처리)
- **뷰:** `views/admin/events/list.ejs`, `views/admin/events/form.ejs` (등록·수정 공용)
- **에디터:** TinyMCE (`process.env.TINYMCE_KEY`, `eventController.js:112`)
- **권한:** `admin_menus.visible_roles = super_admin,admin,content_admin` (DB, id=45)

### 1.1 참여 방식(event_type)이 APPLY 로 제한된 이유

스키마의 `event_type` 은 5종을 담을 수 있지만, **관리자 폼에 노출되는 것은 `NOTICE`·`APPLY` 둘뿐**입니다(`EVENT_TYPES`, `eventController.js:24`). 나머지 3종은 실제로 동작하지 않기 때문에 선택지에서 뺐습니다(13-23행 주석).

| 값 | 라벨 | 폼 노출 | 못 여는 이유 |
|----|------|---------|--------------|
| NOTICE | 공지형 | O | 참여 없음(안내만) |
| APPLY | 응모 | O | 유일하게 동작하는 참여 방식 |
| COUPON_PACK | 쿠폰팩(준비중) | X | `event_coupon` 테이블은 있으나 `participate()` 가 쿠폰을 지급하지 않음. `couponController` 의 `issued_by='ADMIN'` 지급 경로 연결 필요 |
| ATTENDANCE | 출석체크(준비중) | X | `UNIQUE(event_id, user_id)` 때문에 1인 1회만 참여됨. 일별 출석은 별도 테이블(`event_attendance(event_id,user_id,attend_date)`) 필요 |
| PURCHASE | 구매인증(준비중) | X | 주문 검증(`order_items` 대조)이 없어 아무나 참여됨 |

폼에서 뺐어도 라벨은 `EVENT_TYPE_LABELS` 에 남아 있어(27-34행) **기존 행이 목록에 뜰 때 "(준비중)" 으로 표시**됩니다. 고객 측에서도 `PARTICIPABLE_TYPES = ['APPLY']` 가 참여 버튼과 실제 슬롯 확보 UPDATE 양쪽을 막습니다(`eventService.js:43`, `128-135`).

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/events` | getList | 목록 (상태 필터 `status`, 검색 `keyword`) |
| GET | `/admin/events/add` | getAdd | 등록 폼 |
| POST | `/admin/events/add` | postAdd | 등록 처리 |
| GET | `/admin/events/edit/:id` | getEdit | 수정 폼 (+ 참여자 수) |
| POST | `/admin/events/edit/:id` | postEdit | 수정 처리 |
| POST | `/admin/events/delete` | postDelete | 삭제 (`body.id`) |

- `routes/admin/events.js` 전체가 6줄입니다. multer 없음(이미지는 URL 문자열 입력).
- 폼 POST → `res.redirect` (저장소 관리자 표준). 검증 실패는 `res.status(400).send(...)` 로 평문 응답합니다(`postAdd:171-172`, `postEdit:195-196`).

---

## 3. 목록 (GET /admin/events)

- 쿼리: `SELECT * FROM event WHERE mall_id = ?` + `status` + `title/slug LIKE`, `ORDER BY start_at DESC, id DESC` (`eventController.js:72-84`)
- 각 행에 `phase`(예정/진행중/종료)와 `typeLabel` 을 붙여 렌더 (85-88행)
- 필터 UI: `status` select + `keyword` 입력 (`views/admin/events/list.ejs`)

---

## 4. 등록·수정 폼

등록·수정 모두 `views/admin/events/form.ejs` 를 씁니다. 수정 화면은 `event_participant` COUNT 를 `participants` 로 함께 넘겨 참여자 수를 보여줍니다(`eventController.js:122-124`).

### 4.1 폼 필드 (`readForm`, 144-165행 / `views/admin/events/form.ejs`)

| name | 저장 컬럼 | 비고 |
|------|-----------|------|
| title | `title` | 필수, 200자 절단 |
| slug | `slug` | 비우면 title 에서 생성 (`normalizeSlug`, 59-64행). 한글 허용 |
| summary | `summary` | 목록 카드 한 줄 요약 |
| content | `content` | 상세 본문 HTML (TinyMCE) |
| notice | `notice` | 유의사항 HTML |
| event_type | `event_type` | NOTICE / APPLY 만 노출 |
| thumbnail_url / pc_hero_url / mobile_hero_url | 동명 컬럼 | **URL 문자열 직접 입력** (파일 업로드 아님) |
| status | `status` | DRAFT / PUBLISHED / HIDDEN |
| start_at | `start_at` | 필수 (`datetime-local`) |
| end_at | `end_at` | 비우면 상시 |
| winner_announce_at | `winner_announce_at` | 당첨자 발표 일시 |
| login_required | `login_required` | 체크박스 → 0/1 |
| issue_limit | `issue_limit` | 선착순 인원. 비우면 무제한 |
| list_visible | `list_visible` | 체크박스 → 0/1 |

- 화이트리스트 방식: `readForm` 이 지정한 필드만 받습니다. `issued_count`·`view_count` 는 폼에서 못 건드립니다.
- slug 중복은 `ER_DUP_ENTRY` 로 400 응답(`postAdd:185`, `postEdit:211`). 기획전·공동구매처럼 `ensureUniqueSlug` 로 접미사를 붙이지 **않습니다**.

---

## 5. DB 테이블

### 5.1 `event`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | bigint PK | |
| mall_id | bigint | 몰 ID (기본 1) |
| title / slug / summary | varchar | `uk_event_mall_slug (mall_id, slug)` 유니크 |
| content / notice | text | HTML (렌더 시 새니타이즈) |
| event_type | varchar(30) | **NOTICE**(기본) / APPLY / COUPON_PACK / ATTENDANCE / PURCHASE |
| thumbnail_url / pc_hero_url / mobile_hero_url | varchar(500) | |
| status | varchar(30) | **DRAFT**(기본) / PUBLISHED / HIDDEN |
| start_at | datetime NOT NULL | 노출·참여 시작 |
| end_at | datetime NULL | NULL = 상시 |
| winner_announce_at | datetime NULL | 당첨자 발표 |
| login_required | tinyint(1) | 기본 1 |
| issue_limit | int NULL | 선착순 인원 (NULL = 무제한) |
| issued_count | int | 현재 참여 수. **선착순 판정에 쓰는 카운터** |
| list_visible | tinyint(1) | 기본 1 |
| view_count | int | 상세 조회수 |

### 5.2 `event_participant`

`id`, `event_id`(FK CASCADE), `user_id`(FK CASCADE, **int** — users.id 가 int), `status`(**APPLIED**/WON/LOST), `memo`(255, 구매인증 주문번호 등), `created_at`
유니크: `uk_event_participant (event_id, user_id)` → **1인 1회 참여**

> `status` 의 WON/LOST 는 스키마에만 있습니다. 당첨 처리 UI·로직은 코드에 없습니다(확인 범위 내에서 `WON`/`LOST` 를 쓰는 코드 없음).

### 5.3 `event_coupon`

`id`, `event_id`(FK CASCADE), `coupon_id`(FK CASCADE, **int** — coupons.id 가 int), `sort_order`
유니크: `uk_event_coupon (event_id, coupon_id)`

> **테이블만 존재하고 런타임 코드가 읽지도 쓰지도 않습니다.** 저장소 전체(`.js`/`.ejs`/`.sql`)에서 `event_coupon` 이 나오는 곳은 생성 DDL(`scripts/migrate_event.sql:64-77`)과 주석 2줄(`controllers/admin/eventController.js:20`, `:220`)뿐입니다. 쿠폰팩(COUPON_PACK)을 열려면 이 테이블을 읽는 관리자 UI + `participate()` 의 쿠폰 지급 로직(`couponController` 의 `issued_by='ADMIN'` 경로)을 새로 연결해야 합니다.

### 5.4 상태 모델

`status` 는 운영상태(DRAFT/PUBLISHED/HIDDEN)만 담고, **예정/진행중/종료는 컬럼이 아니라 `start_at`·`end_at` 에서 파생**합니다(`eventController.js:37-43`, `eventService.js:18-24`).

| phase | 조건 |
|-------|------|
| upcoming(예정) | start_at 존재 && now < start_at |
| ended(종료) | end_at 존재 && now > end_at |
| ongoing(진행중) | 그 외 |

---

## 6. 고객 화면 연계

- 라우트: [`routes/event.js`](../../../routes/event.js) — `GET /event`(목록), `GET /event/view/:id`(→ slug 301), `GET /event/:slug`(상세), `POST /event/:slug/apply`(참여)
- 컨트롤러: [`controllers/eventController.js`](../../../controllers/eventController.js)
- URL 은 **단수 `/event`** 고정 (`feature_menu.EVENT.default_path`, `routes/event.js:5-12`)
- 고객 노출 조건: 목록 `status='PUBLISHED' AND list_visible=1`, 상세 `status='PUBLISHED'` (`eventService.js:13`, `58`, `68`)
- **0건 폴백:** 발행+목록노출 이벤트가 0건이면 `user/coming_soon` 준비중 랜딩 (`controllers/eventController.js:46`)
- 목록 정렬: 진행중 → 예정 → 종료 순, 그 안에서 `start_at DESC` (`eventService.js:70-74`)
- 참여 결과는 `?r=` 쿼리로 상세에 되돌아옵니다: `ok` / `full` / `closed` / `duplicate` / `login` (`controllers/eventController.js:101`, `119-126`)

### 6.1 참여 처리 (`eventService.participate`, 120-164행)

경쟁 조건을 **DB 가** 막습니다. 애플리케이션에서 COUNT 후 INSERT 하면 동시 요청에 선착순이 초과 발급됩니다.

1. 조건부 `UPDATE event SET issued_count = issued_count + 1 WHERE ... status='PUBLISHED' AND event_type IN ('APPLY') AND start_at <= NOW() AND (end_at IS NULL OR end_at >= NOW()) AND (issue_limit IS NULL OR issued_count < issue_limit)` → `affectedRows` 로 슬롯 확보
2. 실패 시 rollback 후 `full`(수량 초과) / `closed`(기간·유형) 구분해 반환
3. `INSERT INTO event_participant (..., status='APPLIED')` → `ER_DUP_ENTRY` 면 `duplicate`
4. commit

즉 **선착순 초과·중복 참여는 SQL 한 문장과 UNIQUE 제약이 막습니다.**

---

## 7. 주의사항

- **참여 방식은 APPLY 만 실제로 동작합니다.** 폼에 새 유형을 추가하려면 `EVENT_TYPES`(`eventController.js:24`)와 `PARTICIPABLE_TYPES`(`eventService.js:43`) **양쪽**을 고쳐야 하며, 그 전에 위 §1.1 의 결함(출석 UNIQUE, 쿠폰 지급, 주문 검증)을 먼저 해결해야 합니다.
- **`issued_count` 는 비정규화 카운터입니다.** `participate()` 만 갱신합니다. 관리자 폼은 이 값을 받지 않습니다. `event_participant` 를 직접 지우면 `issued_count` 와 어긋납니다.
- **이미지는 업로드가 아니라 URL 입력입니다.** 다른 관리자 화면(`/admin/uploads`, 상품 이미지 업로드)에서 얻은 경로를 붙여 넣어야 합니다. 기획전·공동구매와 다릅니다.
- **slug 중복 시 400.** 기획전·공동구매는 자동으로 접미사를 붙이지만(`ensureUniqueSlug`), 이벤트는 그냥 400 을 반환합니다.
- **`login_required` 는 저장만 되고 참여 판정에 쓰이지 않습니다.** `postApply` 는 값과 무관하게 `req.user` 가 없으면 `?r=login` 으로 되돌립니다(`controllers/eventController.js:119`).
- **삭제는 CASCADE.** `event_participant` / `event_coupon` 이 함께 지워집니다(`eventController.js:220`). 참여 기록이 있어도 막지 않습니다(공동구매는 막습니다).
- 관리자 목록·수정 화면에는 **참여자 목록 UI 가 없습니다** — 수정 화면의 참여자 수(COUNT)만 보여줍니다.

---

*Last Updated: 2026-07-11*
