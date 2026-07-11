# 프로모션 (기획전 · 이벤트 · 공동구매 · 쿠폰존)

## 1. 개요

고객 화면의 프로모션은 **서로 다른 4개 모듈**입니다. 이름이 비슷하다고 섞지 마세요.

| 모듈 | 성격 | 라우트 | 컨트롤러 | 서비스 | 주 테이블 |
|------|------|--------|----------|--------|-----------|
| 기획전 | 상품 전시 랜딩(큐레이션). 구매는 개별 상품 상세에서 | `routes/exhibition.js` (`/exhibition`) | `exhibitionController.js` | `services/exhibition/exhibitionService.js` | `exhibition`, `exhibition_section`, `exhibition_product` |
| 이벤트 | 응모·혜택 **참여**. 선착순 슬롯 | `routes/event.js` (`/event`) | `eventController.js` | `services/event/eventService.js` | `event`, `event_participant` |
| 공동구매 | 기간·목표수량 **조건부 판매**. 전용가로 바로구매 | `routes/group-buy.js` (`/group-buy`) | `groupBuyController.js` | `services/groupBuy/groupBuyService.js` | `group_buy`, `group_buy_product` |
| 쿠폰존 | 쿠폰을 **받는 곳**(다운로드·코드 등록) | `routes/coupon.js` (`/coupon`) | `couponController.js` | `services/coupon/*` | `coupons`, `coupon_download`, `user_coupons` |

URL 은 전부 **단수형**이며 `feature_menu.{EXHIBITION,EVENT,GROUP_BUY}.default_path` 와 1:1 로 고정입니다. 복수형으로 바꾸면 GNB 메뉴가 404 됩니다(각 라우트 파일 상단 주석).

공통 규칙:
- 몰 스코프: 모든 조회에 `mall_id = req.mallId || 1`.
- 준비중 폴백: 보여줄 항목이 0건이면 빈 목록 대신 `views/user/coming_soon.ejs`(`routes/feature.js` 의 `COMING_SOON` 정의)를 렌더합니다. dev·prod 가 같은 DB 라서 생긴 배포 안전장치입니다.
- 운영자 입력 HTML(description·notice·섹션 HTML)은 렌더 직전 `services/display/htmlSanitizer.sanitize()` 를 통과시킵니다.
- `phase`(예정/진행중/종료)는 **DB 에 저장하지 않고** `start_at`·`end_at` 에서 파생합니다.

---

## 2. 라우트

| URL | 메서드 | 액션 | 인증 | 설명 |
|-----|--------|------|------|------|
| /exhibition | GET | exhibitionController.getList | - | 기획전 목록 (`?sort=`, `?page=`) |
| /exhibition/view/:id | GET | redirectToSlug | - | id → slug 301 |
| /exhibition/:slug | GET | getDetail | - | 기획전 상세 (`?tab=`) |
| /event | GET | eventController.getList | - | 이벤트 목록 (`?phase=`) |
| /event/view/:id | GET | redirectToSlug | - | id → slug 301 |
| /event/:slug | GET | getDetail | - | 이벤트 상세 |
| /event/:slug/apply | POST | postApply | 로그인 | 이벤트 참여(응모) |
| /group-buy | GET | groupBuyController.getList | - | 공동구매 목록 (`?phase=`, `?sort=`, `?page=`) |
| /group-buy/view/:id | GET | redirectToSlug | - | id → slug 301 |
| /group-buy/:slug | GET | getDetail | - | 공동구매 상세 |
| /group-buy/:slug/buy | POST | postBuy | - | 바로구매 → `/checkout` 리다이렉트 |
| /coupon | GET | couponController.getList | - | 쿠폰존 목록 (`?category=`, `?brand=`) |
| /coupon/:id | GET | getDetail | - | 쿠폰 소개 상세 (숫자 id 만) |
| /coupon/:id/claim | POST | postClaim | 로그인 | 쿠폰 받기 |
| /coupon/apply-code | POST | postApplyCode | 로그인 | 쿠폰 코드 등록 |

> `/view/:id` 는 반드시 `/:slug` 보다 **먼저** 선언되어 있습니다. 뒤에 두면 `'view'` 가 slug 로 잡힙니다.
> `/coupon` 은 Express 5(path-to-regexp v8)가 `:id(\d+)` 를 지원하지 않아 `requireNumericId` 미들웨어로 숫자 검증하고, `/:id/claim` 을 `/:id` 보다 먼저 둡니다.

---

## 3. 기획전 (/exhibition)

**목록** — `exhibitionService.getPublicList(mallId, { sort, page, limit: 12 })`
- 조건: `status='PUBLISHED' AND list_visible=1 AND NOT (ended_access_policy='BLOCK' AND end_at < NOW())`
- 정렬(`?sort=`): `latest`(기본) / `ending_soon` / `popular`
- 각 행에 노출 상품 수(`product_count`)를 서브쿼리로 붙입니다.
- **`result.total === 0 && page === 1` 이면 준비중 랜딩**(`COMING_SOON.exhibition`). "발행 행이 있는가" 를 따로 묻지 않고 목록 결과로 판정합니다 — 그래야 `list_visible=0`·종료차단으로 목록이 비는 경우도 폴백에 걸립니다.
- 전달 변수: exhibitions, pagination, sorts, sort, currentUser, seo

**상세(`/:slug`)** — `getPublicBySlug` (없으면 `next()` → 404)
- `phase === 'ENDED' && ended_access_policy === 'BLOCK'` 이면 상세도 열지 않습니다(404).
- 섹션(`exhibition_section`, `is_active=1`) + 상품(`exhibition_product` JOIN `products`, `visible=1 AND p.visibility='PUBLIC' AND p.status<>'OFF'`)을 조회합니다. `display_config_json.hide_sold_out` 이면 품절 상품도 제외.
- **탭:** `is_tab=1` 인 섹션 중 상품이 있거나 `section_type='HTML'` 인 것만. `?tab={section_code}` 로 서버가 고릅니다(JS 없이 동작). 미지정/미매칭이면 전체 탭 — 섹션 미배정 상품이 맨 앞, 이어서 섹션 순서대로 `groups` 배열.
- `view_count` +1 은 await 하지 않습니다(화면을 막지 않음).
- `search_visible=0` 이면 `robots: 'noindex,nofollow'`.
- 전달 변수: exhibition, descriptionHtml, noticeHtml, tabs, activeCode, groups, productCount, currentUser, seo

---

## 4. 이벤트 (/event)

**목록** — `eventService.list(mallId, { phase })`
- `hasAny(mallId)`(= `status='PUBLISHED' AND list_visible=1` 1건 이상)가 false 면 준비중 랜딩(`COMING_SOON.event`).
- 필터(`?phase=`): `all`(기본) / `upcoming` / `ongoing` / `ended` — SQL 은 `start_at`·`end_at` 비교로 만듭니다.
- 정렬: 진행중 → 예정 → 종료, 그 안에서 `start_at DESC, id DESC`.
- 각 행에 파생 필드: `phase`, `phaseLabel`(예정/진행중/종료), `isOngoing`, `isFull`(`issued_count >= issue_limit`), `remaining`, `participable`.

**상세(`/:slug`)** — `findBySlug`(없으면 404). `view_count` +1. `content`·`notice` 는 sanitize 하여 `contentHtml`·`noticeHtml` 로 전달. 로그인 상태면 `event_participant` 로 `participated` 판정. `?r=` 쿼리가 `flash` 로 전달됩니다(ok/full/closed/duplicate/login).

**참여(POST /:slug/apply)** — `eventService.participate()`
- 비로그인이면 `?r=login` 으로 되돌립니다(라우터 미들웨어가 아니라 컨트롤러가 검사).
- `ev.participable` 이 false 면 `?r=closed`.
- **참여 가능 유형은 `APPLY` 뿐입니다**(`PARTICIPABLE_TYPES`). `ATTENDANCE`(UNIQUE 제약상 일별 출석 불가), `COUPON_PACK`(쿠폰 지급 로직 없음), `PURCHASE`(주문 검증 없음)는 참여 슬롯을 소모하지 못하게 막혀 있습니다.
- 선착순 경쟁 조건은 DB 로 막습니다: 기간·수량·유형을 조건에 넣은 `UPDATE event SET issued_count = issued_count + 1 ...` 의 `affectedRows` 로 슬롯을 먼저 확보하고, 그 다음 `event_participant` INSERT. 중복은 UNIQUE(event_id, user_id) 가 막고 `ER_DUP_ENTRY` 를 `'duplicate'` 로 변환합니다.
- 결과: `'ok' | 'full' | 'closed' | 'duplicate'` → `/event/:slug?r={결과}`.

---

## 5. 공동구매 (/group-buy)

**목록** — `groupBuyService.getPublicList(mallId, { phase, sort, page, limit: 12 })`
- `hasAnyPublic(mallId)` 가 false 면 준비중 랜딩(`COMING_SOON['group-buy']`).
- 필터(`?phase=`): `all` / `ACTIVE` / `CLOSING` / `SCHEDULED` / `ENDED`
- 정렬(`?sort=`): `ending_soon`(기본) / `popular` / `participants` / `discount` / `latest`
- 대표 상품은 **LEFT JOIN** 으로 붙입니다 — 상품을 연결하기 전에 발행할 수 있으므로, 대표 상품이 없어도 목록에서 사라지지 않습니다.

**파생 필드(`decorate`)**
- `phase`: `now < start_at` → SCHEDULED, `now > end_at` → ENDED, 종료 `closing_hours`(기본 24) 시간 이내 → CLOSING, 나머지 ACTIVE.
- `purchasable`: ACTIVE·CLOSING, 또는 ENDED + `ended_purchase_policy='ALLOW'`.
- `progressRate`: `target_enabled` 이고 `target_quantity > 0` 일 때 `current_quantity / target_quantity` (100% 상한), 아니면 null. `targetReached`, `endsAtMs`(클라이언트 타이머 기준 시각)도 함께.

**상세(`/:slug`)** — 상품 목록(`group_buy_product` JOIN `products`, `visible=1 AND visibility='PUBLIC' AND status<>'OFF'`, `role='MAIN'` 우선 정렬)과 관련 공동구매 4건(같은 몰의 진행중 다른 건)을 조회. `mainProduct = products[0]`. `?error=` 코드는 아래 표의 문구로 변환해 전달합니다.

**바로구매(POST /:slug/buy)** — `resolveLine(mallId, groupBuyId, product_id, quantity)` 로 서버가 검증·단가 확정 후 `/checkout?product_id=&quantity=&group_buy_id=` 로 리다이렉트합니다. **여기서 결제하지 않습니다.** 최종 금액은 `checkoutController` 가 `resolveLine()` 을 다시 불러 계산합니다(주문서 URL 을 직접 두드릴 수 있으므로 양쪽 다 검증).

| reason | 메시지 (`LINE_ERRORS`) |
|--------|------------------------|
| notfound | 판매 중인 상품을 찾을 수 없습니다. |
| closed | 지금은 구매할 수 없는 공동구매입니다. |
| disabled | 해당 상품은 현재 구매할 수 없습니다. |
| soldout | 품절된 상품입니다. |
| min | 최소 구매 수량보다 적습니다. |
| max | 최대 구매 수량을 초과했습니다. |
| stock | 재고가 부족합니다. |

- 1차 범위는 **바로구매만**입니다(장바구니 미지원 — `carts` 에 가격·옵션 컬럼이 없음).
- 결제 확정 시 `recordParticipation(conn, orderId)` 이 `order_items.source_type='GROUP_BUY'` 행을 읽어 `current_quantity`·`participant_count` 를 올립니다(체크아웃 트랜잭션 안에서).

---

## 6. 쿠폰존 (/coupon)

**받는 곳(`/coupon`)과 보유함(`/mypage/coupons`)은 다릅니다.** 보유 쿠폰은 [mypage.md](./mypage.md) §6.

**목록(GET /coupon)** — 노출 대상은 "자동발급이 아닌" 쿠폰:
- `status='ACTIVE' AND (mall_id IS NULL OR mall_id = ?)`
- `issue_method='DOWNLOAD'` 이고 수령기간(`download_start_at`~`download_end_at`) 안이거나, `issue_method='CODE'`(상시 소개)
- 0건이면 준비중 랜딩(`COMING_SOON.coupon`).
- 적용 대상(`scope_json`)으로 그룹핑: `ALL`(전 상품) → `CATEGORY` → `BRAND` → `SHIPPING`(배송비). `?category=`·`?brand=` 로 필터하면 그룹 필터링이 걸립니다(둘 다 오면 category 우선).
- 버튼 상태는 **서버가 판정**합니다(`buttonState`): `code_required`(CODE 형) / `login`(비로그인) / `claimed` / `sold_out`(`issued_count >= issue_limit`) / `ended`(`download_end_at` 경과) / `available`.
- 혜택 문구는 `discountCalculator.benefitLabel()`.

**상세(GET /coupon/:id)** — 노출 대상 조건(`status='ACTIVE'`, 몰 스코프, `issue_method IN ('DOWNLOAD','CODE')`)을 만족하지 않으면 `/coupon` 리다이렉트.

**받기(POST /coupon/:id/claim)** — 로그인 필수. 한 트랜잭션에서 `SELECT ... FOR UPDATE` 로 쿠폰 행을 잠그고 `couponIssueService.claimDownloadCoupon()` 이 선착순 슬롯(`issued_count`)과 `coupon_download` PK 중복을 함께 처리합니다. 결과는 `?msg=` / `?err=` 로 되돌아옵니다(body 의 `redirect === 'detail'` 이면 상세로).

| reason | 메시지 |
|--------|--------|
| already_claimed / sold_out / ended / not_started / inactive / expired / not_downloadable | `CLAIM_MESSAGE` 매핑 (이미 받은 쿠폰 / 선착순 마감 / 수령 기간 종료 / 아직 수령 기간 아님 / 지금은 받을 수 없음 / 만료 / 다운로드 대상 아님) |

**코드 등록(POST /coupon/apply-code)** — 로그인 필수. `couponIssueService.redeemCouponCode(userId, coupon_code)`. 실패 사유는 `CODE_MESSAGE`(empty / not_found / already_held / issue_limit / inactive / expired). **체크아웃이 아니라 쿠폰존에 둔 이유:** 결제 도중 코드를 넣기보다 쿠폰함에 미리 담는 흐름이 자연스럽고 체크아웃 트랜잭션도 단순해집니다(컨트롤러 주석).

---

## 7. DB

코드에서 참조하는 컬럼만 적습니다.

**`exhibition`** — id, mall_id, title, slug, summary, description, exhibition_type, list_thumbnail_url, pc_hero_image_url, mobile_hero_image_url, og_image_url, status(DRAFT/PUBLISHED/…), start_at, end_at, list_visible, search_visible, share_enabled, detail_template_type, display_config_json, ended_access_policy(ALLOW/BLOCK), ended_purchase_policy(ALLOW/BLOCK), view_count
**`exhibition_section`** — exhibition_id, section_name, section_code, section_type(PRODUCT_GRID/HTML), sort_order, is_tab, is_active, display_config_json
**`exhibition_product`** — exhibition_id, section_id, product_id, sort_order, is_fixed, display_badge, display_comment, visible, purchase_enabled

**`event`** — id, mall_id, title, slug, summary, content, notice, event_type(APPLY 만 참여 가능), thumbnail_url, pc_hero_url, mobile_hero_url, status, start_at, end_at, winner_announce_at, login_required, issue_limit, issued_count, list_visible, view_count
**`event_participant`** — event_id, user_id, status(APPLIED), memo, created_at. UNIQUE(event_id, user_id).

**`group_buy`** — id, mall_id, title, slug, summary, description, notice, list_thumbnail_url, pc_hero_image_url, mobile_hero_image_url, status, start_at, end_at, closing_hours, list_visible, search_visible, target_enabled, target_quantity, participant_count_visible, quantity_count_visible, progress_visible, current_quantity, participant_count, ended_purchase_policy, delivery_note, view_count
**`group_buy_product`** — group_buy_id, product_id, role(MAIN/…), sort_order, normal_price, group_buy_price, discount_rate, min_order_quantity, max_order_quantity, per_user_limit_quantity, purchase_enabled, visible

**`coupons`** — id, mall_id, name, thumbnail_url, summary, detail_content, notice, code, coupon_type, issue_method(AUTO_SIGNUP/ADMIN/CODE/DOWNLOAD), benefit_type(FIXED/PERCENT/SHIPPING_FREE/SHIPPING_FIXED), discount_amount, discount_rate, max_discount_amount, min_order_amount, valid_from, valid_to, valid_days, max_total_uses, download_start_at, download_end_at, issue_limit, issued_count, scope_json, status(DRAFT/ACTIVE/PAUSED/ENDED)
**`coupon_download`** — user_id, coupon_id, created_at. PK(user_id, coupon_id) — 중복 수령을 DB 가 막습니다.
**`user_coupons`** — 발급 결과. [mypage.md](./mypage.md) §12 참고.

---

## 8. 주의사항

- **셋은 다른 개념입니다.** 기획전 = 상품 전시 랜딩(구매는 상품 상세로), 이벤트 = 응모·혜택 참여(선착순 슬롯), 공동구매 = 기간·목표수량 조건부 판매(전용가 바로구매).
- `/exhibition`·`/event`·`/group-buy` 의 `default_path` 는 운영자가 바꿀 수 없습니다. 복수형 URL 을 새로 만들면 GNB 가 404 됩니다.
- 준비중 랜딩 폴백을 지우지 마세요. 개발 DB = 운영 DB 이므로 발행 0건 상태에서 빈 목록이 그대로 운영에 노출됩니다.
- 이벤트의 `event_type` 을 `APPLY` 외의 값으로 켜도 참여 버튼은 동작하지 않습니다(`PARTICIPABLE_TYPES` 화이트리스트).
- 공동구매 상세 화면의 가격은 **표시용**입니다. 결제 단가는 `resolveLine()` 이 서버에서 다시 계산합니다.
- 쿠폰 `benefit_type` 중 `PERCENT` 는 `discount_rate`·`max_discount_amount` 를, `FIXED` 는 `discount_amount` 를 씁니다. 문구는 반드시 `benefitLabel()` 로 만드세요(뷰에서 분기 재조립 금지).

---

*Last Updated: 2026-07-11*
