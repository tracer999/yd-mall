# 마이페이지

## 1. 개요

- **라우트:** `routes/mypage.js` (mount: `/mypage`), `routes/likes.js` (mount: `/likes`)
- **컨트롤러:** `controllers/mypageController.js`, `controllers/likeController.js`
- **뷰:** `views/user/mypage/` (layout.ejs, _menu.ejs, dashboard.ejs, orders.ejs, order_detail.ejs, claims.ejs, coupons.ejs, points.ejs, likes.ejs, brand_likes.ejs, recent-views.ejs, activities.ejs, profile-edit.ejs, withdraw.ejs)

`routes/mypage.js` 는 라우터 최상단에서 `router.use(ensureAuthenticated)` 를 걸어 **모든 하위 경로가 로그인 필수**입니다. 비로그인 접근 시 `req.session.returnTo` 에 원래 URL 을 담고 `/auth/login` 으로 리다이렉트합니다(`middleware/auth.js`).

`/likes` 는 마이페이지가 아니라 별도 마운트지만, 찜 데이터(`likes`·`brand_likes`)를 쓰는 짝이라 함께 다룹니다.

---

## 2. 라우트

| URL | 메서드 | 액션 | 설명 |
|-----|--------|------|------|
| /mypage | GET | getDashboard | 대시보드 (요약) |
| /mypage/orders | GET | getOrders | 주문/배송 조회 (페이지네이션) |
| /mypage/orders/:id | GET | getOrderDetail | 주문 상세 |
| /mypage/orders/:id/cancel | POST | cancelOrder | 주문 취소·반품 신청 |
| /mypage/claims | GET | getClaims | 취소·반품 내역 |
| /mypage/claims/:id/withdraw | POST | withdrawClaim | 취소·반품 신청 철회 |
| /mypage/coupons | GET | getCoupons | 내 쿠폰함 |
| /mypage/points | GET | getPoints | 포인트 내역 |
| /mypage/likes | GET | getLikes | 관심 상품 |
| /mypage/brand-likes | GET | getBrandLikes | 찜한 브랜드 |
| /mypage/recent-views | GET | getRecentViews | 최근 본 상품 |
| /mypage/activities | GET | getActivities | 나의 활동 (리뷰 + 1:1 문의) |
| /mypage/profile | GET | getProfile | 회원정보 수정 폼 |
| /mypage/profile/update | POST | updateProfile | 회원정보 저장 |
| /mypage/withdraw | GET | getWithdraw | 회원탈퇴 폼 |
| /mypage/withdraw | POST | postWithdraw | 회원탈퇴 처리 |
| /likes/toggle | POST | likeController.toggleLike | 상품 찜 토글 (AJAX) |
| /likes/brand/toggle | POST | likeController.toggleBrandLike | 브랜드 찜 토글 (AJAX) |

> 좌측 메뉴(`_menu.ejs`)에 노출되는 항목은 장바구니 / 주문내역 / 취소·반품 내역 / 쿠폰함 / 포인트 / 1:1 문의(= `/mypage/activities`) / 회원정보 수정 뿐입니다. 찜·최근 본 상품·회원탈퇴는 라우트로만 접근합니다.

---

## 3. 대시보드 (GET /mypage)

- 최근 주문 5건 (`orders`: id, created_at, total_amount, status)
- 주문 상태별 카운트 — `PENDING · PAID · PREPARING · SHIPPED · DELIVERED · CANCELLED · REFUNDED` 7종을 0으로 초기화 후 `GROUP BY status` 결과로 채웁니다.
- 보유 쿠폰 수 — `user_coupons` 중 `used_at IS NULL` 이고 `COALESCE(uc.expires_at, c.valid_to)` 가 NULL 이거나 미래인 것.
- 포인트 잔액 — `users.points_balance`
- 찜 상품 수 — `likes` COUNT
- 최근 본 상품 수 — `recent_views` 중 `viewed_at >= NOW() - INTERVAL 15 DAY`
- 최근 활동 3건 — `reviews` + `inquiries` 를 UNION ALL 후 `created_at DESC LIMIT 3`
- **전달 변수:** title, user, recentOrders, stats, recentActivities, couponCount, pointsBalance, likesCount, recentViewedCount

> 쿠폰·포인트·찜·최근본상품 쿼리는 `.catch(() => ...)` 로 기본값(0)을 반환합니다. 테이블이 없어도 대시보드가 500 나지 않게 하려는 의도입니다.

---

## 4. 주문 (GET /mypage/orders, /mypage/orders/:id)

**목록** — `?page=` (10건/페이지). 각 주문에 서브쿼리로 `first_product_name`(`order_items` 최소 id) 과 `item_count` 를 붙이고, 2건 이상이면 `"{상품명} 외 N건"` 을 `product_name_display` 로 만듭니다. 전달 변수: orders, currentPage, totalPages, totalOrders.

**상세** — `orders` 는 `id AND user_id` 로 조회(남의 주문 차단). 없으면 `/mypage/orders` 리다이렉트. 함께 조회:
- `order_items` + `products`(thumbnail_image, slug) LEFT JOIN
- `shipments` (첫 행만 `shipment` 로 전달)
- `order_claims` (해당 주문의 클레임 전체)
- 쿼리스트링 `?claim=` → `claimMsg`(cancel_done / cancel_requested / return_requested), `?claim_error=` → `claimError`

---

## 5. 취소·반품 (POST /mypage/orders/:id/cancel, /mypage/claims)

- **신청(POST /mypage/orders/:id/cancel):** 주문 상태가 `SHIPPED`·`DELIVERED` 면 `claimType = 'RETURN'`, 그 외에는 `'CANCEL'`. `services/order/claimService.requestClaim()` 에 위임합니다(출고 전이면 즉시 승인·환불, 이후에는 관리자 승인 대기). body: `reason`, `reasonType`(기본 `CHANGE_OF_MIND`).
  - 실패 시 `/mypage/orders/:id?claim_error=...`, 성공 시 `?claim=cancel_done|cancel_requested|return_requested`.
  - 관리자(`process.env.ADMIN_EMAIL`)와 구매자(`orders.buyer_email` 또는 `req.user.email`)에게 알림 메일을 보냅니다. 메일 실패는 흐름을 막지 않습니다.
- **내역(GET /mypage/claims):** `order_claims` + `orders`(order_number, total_amount) + `order_refunds`(refund_amount, status, return_shipping_fee_deducted) LEFT JOIN, 본인 주문만.
- **철회(POST /mypage/claims/:id/withdraw):** `claimService.withdrawClaim({ claimId, userId })`. 실패하면 `/mypage/claims?error=...`.

---

## 6. 쿠폰함 (GET /mypage/coupons)

보유 쿠폰을 **4상태**로 분류합니다. 만료일 기준은 항상 `COALESCE(uc.expires_at, c.valid_to)` — `valid_days` 로 발급된 쿠폰은 개인별 만료일(`user_coupons.expires_at`)이 우선합니다.

| state | 판정 |
|-------|------|
| used | `uc.used_at` 이 있음 |
| expired | 만료일이 과거 |
| reserved | 미사용 + `reserved_order_id` 있음 + `reserved_at >= NOW() - INTERVAL 30 MINUTE` (주문 진행 중) |
| available | 나머지 |

- 정렬: available → reserved → used → expired.
- `benefit` 문구는 `services/coupon/discountCalculator.benefitLabel()` 이 만듭니다(정액·정률·무료배송 통합).
- `expiringSoon`: 사용 가능 + 만료 3일 이내.
- 쿠폰을 **받는 곳**은 여기가 아니라 쿠폰존 `/coupon` 입니다. [promotions.md](./promotions.md)

---

## 7. 포인트 (GET /mypage/points)

- 잔액: `users.points_balance`
- 내역: `point_transactions WHERE user_id = ? ORDER BY created_at DESC` (전체, 페이지네이션 없음)
- `transaction_type` enum: `PURCHASE_ACCUMULATE`, `PURCHASE_USE`, `ADMIN_GRANT`, `ADMIN_DEDUCT`, `ORDER_CANCEL_RESTORE`, `ORDER_CANCEL_REVOKE`

---

## 8. 찜 · 최근 본 상품

- **관심 상품(GET /mypage/likes):** `likes` + `products`, `status IN ('ON','SOLD_OUT','COMING_SOON')` 만. `l.created_at DESC`.
- **찜한 브랜드(GET /mypage/brand-likes):** `brand_likes` + `categories`(`type='BRAND'`). 브랜드별 판매 상품 수(`products.brand_category_id`, `status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')`)를 `product_count` 로 함께 셉니다.
- **최근 본 상품(GET /mypage/recent-views):** `recent_views` 중 **15일 이내** + 노출 가능 상태 상품만, `viewed_at DESC`. 기록은 상품 상세(`controllers/productController.js`)가 INSERT 합니다.
- **토글 API:**
  - `POST /likes/toggle` — body `{ productId }`. 있으면 DELETE, 없으면 INSERT. 응답 `{ success, liked, message }`.
  - `POST /likes/brand/toggle` — body `{ brandId }`. `categories.type='BRAND'` 인지 먼저 검증(임의 category_id 주입 차단), 아니면 404 JSON.
  - 둘 다 `ensureAuthenticated` 적용 — **비로그인 시 JSON 401 이 아니라 `/auth/login` 302** 입니다.

> 상품 상세 페이지의 좋아요는 `POST /products/like/:id`(`productController`)를 씁니다. 같은 `likes` 테이블을 쓰는 **두 번째 토글 엔드포인트**입니다. [products.md](./products.md)

---

## 9. 나의 활동 (GET /mypage/activities)

- `reviews` + `products`(name, thumbnail_image, slug) — 작성 리뷰 전체
- `inquiries` — 내 1:1 문의 전체
- 좌측 메뉴에서는 '1:1 문의' 라는 이름으로 링크됩니다.

---

## 10. 회원정보 수정 (GET/POST /mypage/profile)

- 폼(GET)은 `users` 전체 행과 함께 `identityVerified` 를 내려줍니다: `req.session.identity_verified` 가 true 이고 `identity_verified_at` 으로부터 **15분 이내**.
- 쿼리스트링 플래그: `?reauth=fail|required`, `?verified=1`, `?updated=1`.
- **POST /mypage/profile/update** 는 body 의 `type` 으로 갈립니다.
  - `type=general` — `name`, `email`(빈 문자열이면 기존 값 유지: `COALESCE(NULLIF(?, ''), email)`)
  - `type=sensitive` — `phone`, `zipcode`, `address`, `detailed_address`. **재인증 15분 창이 살아 있어야** 하며(아니면 `?reauth=required`), 저장 후 `identity_verified` 세션을 즉시 삭제합니다(1회용).
- 성공 시 `/mypage/profile?updated=1`.

> 재인증 세션(`identity_verified`)을 **세우는** 화면은 마이페이지 밖(`routes/auth.js`)에 있습니다. 여기서는 소비만 합니다.

---

## 11. 회원탈퇴 (GET/POST /mypage/withdraw)

- 재인증(15분 창) 없이 POST 하면 `/mypage/withdraw?reauth=required`.
- **소프트 삭제**입니다. `users` 를 UPDATE: `is_active=0`, `withdraw_reason`, `withdrawn_at=NOW()`, `name='탈퇴회원'`, `email='withdrawn_{id}@deleted.com'`, `phone/address/detailed_address/zipcode/picture/birthdate/google_id/kakao_id = NULL`, `marketing_agreed=0`. 행을 지우지 않습니다.
- 이후 `req.logout()` → `session.destroy()` → `/?withdrawn=1`.
- `getWithdraw` 만 `layout: 'layouts/main_layout'` 을 명시적으로 지정합니다(다른 마이페이지 액션은 지정하지 않음).

---

## 12. DB

코드에서 참조하는 테이블·컬럼만 적습니다.

| 테이블 | 이 문서에서 쓰는 컬럼 |
|--------|----------------------|
| `users` | points_balance, name, email, phone, zipcode, address, detailed_address, picture, birthdate, google_id, kakao_id, marketing_agreed, is_active, withdraw_reason, withdrawn_at |
| `orders` | id, user_id, order_number, total_amount, status, buyer_email, created_at |
| `order_items` | order_id, product_id, product_name, quantity, product_price |
| `shipments` | order_id (전체 행 SELECT *) |
| `order_claims` | id, order_id, claim_type(CANCEL/RETURN/EXCHANGE), status(REQUESTED/APPROVED/REJECTED/COMPLETED/WITHDRAWN), reason_type, reason_detail, requested_by, created_at |
| `order_refunds` | claim_id, refund_amount, status, return_shipping_fee_deducted |
| `user_coupons` | user_id, coupon_id, expires_at, used_at, order_id, reserved_order_id, reserved_at, issued_by, created_at |
| `coupons` | name, benefit_type, discount_amount, discount_rate, max_discount_amount, min_order_amount, valid_to |
| `point_transactions` | user_id, amount, transaction_type, order_id, description, created_at |
| `likes` | user_id, product_id, created_at |
| `brand_likes` | user_id, category_id, created_at |
| `recent_views` | user_id, product_id, viewed_at |
| `reviews` | user_id, product_id, content, created_at |
| `inquiries` | user_id, title, content, created_at |

---

## 13. 주의사항

- `/mypage/*` 는 전부 로그인 필수인데, **고객센터 LNB 의 '비회원 주문조회' 링크가 `/mypage/orders` 를 가리킵니다**(`views/user/cs/index.ejs`). 비회원은 로그인 화면으로 튕깁니다 — 실제 비회원 주문조회 기능은 없습니다.
- 주문 취소는 컨트롤러가 직접 `orders` 를 UPDATE 하지 않고 전부 `claimService` 를 통합니다. 과거 `orders.cancel_reason` 을 UPDATE 하던 코드는 그 컬럼이 없어 항상 500 이었습니다(컨트롤러 주석).
- 쿠폰함의 '주문 진행 중(RESERVED)' 판정은 **30분** 점유 기준입니다. 체크아웃의 조회 기준과 반드시 같아야 합니다.
- 대시보드/쿠폰함의 `.catch()` 폴백은 오류를 삼킵니다. 쿼리를 고칠 때 실패가 조용히 0/빈 배열로 보일 수 있습니다.

---

*Last Updated: 2026-07-11*
