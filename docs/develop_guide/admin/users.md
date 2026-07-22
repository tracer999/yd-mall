# 회원 관리 (Users)

## 1. 개요

- **Base URL:** `/admin/users`  
- **관련 테이블:** `users`, `business_profile` (제외 조인), `policy_versions` (조인), `user_coupons`·`coupons`, `point_transactions`, `orders` (상세 화면)  
- **컨트롤러:** `controllers/admin/userController.js`  
- **뷰:** `views/admin/users/list.ejs`, `detail.ejs`

회원 목록·검색·상세 조회, 활성/비활성 토글, 회원 삭제를 제공합니다. 상세 화면에서는 발급 쿠폰·포인트 내역·주문 내역을 함께 보여줍니다. 회원 데이터는 **몰별로 스코프하지 않습니다**(`adminMallContext` 주석: "banners·orders/users 등 몰 무관 데이터는 스코프하지 않는다").

### 1-1. 일반회원 전용 화면 (기업회원 제외)

`users` 테이블은 일반회원과 기업회원이 공유하지만 **관리 화면은 분리**되어 있습니다.

| 대상 | 화면 | 컨트롤러 |
|---|---|---|
| 일반회원 | `/admin/users` | `userController.js` |
| 기업회원 | `/admin/b2b/members` | `b2bMemberController.js` |

판정 기준은 **`business_profile` 행의 존재 하나**입니다(`business_profile.user_id` 가 UNIQUE 라 1:1). 컨트롤러 상단의 상수 두 개로 표현됩니다.

```js
const JOIN_BUSINESS = 'LEFT JOIN business_profile bp ON bp.user_id = u.id';
const ONLY_GENERAL  = 'bp.id IS NULL';
```

> ⚠️ **로그인 쪽(`routes/auth.js` `resolveLoginMode`)과 반드시 같은 기준을 써야 합니다.** 한쪽만 바꾸면 "회원 관리 목록에는 없는데 일반 로그인은 되는" 회원이 생깁니다.

이 분리가 없던 시절에는 두 화면이 서로의 상태를 몰라, 회원 관리에서 계정을 끄면 `b2bContext` 는 자격을 끊는데 기업회원 승인 화면은 여전히 `APPROVED` 로 보이는 불일치가 있었습니다. 그래서 기업회원에 대해서는 **조회·토글·삭제를 모두 막습니다**(아래 6·7장).

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/users` | getList | 회원 목록 (검색어 + 상태 필터) |
| GET | `/admin/users/search` | searchApi | 회원 검색 JSON API |
| GET | `/admin/users/:id` | getDetail | 회원 상세 |
| POST | `/admin/users/toggle-active/:id` | toggleActive | 활성/비활성 토글 |
| POST | `/admin/users/delete/:id` | deleteUser | 회원 삭제 |

> `/search` 는 `/:id` 보다 **먼저** 선언되어야 합니다 (`routes/admin/users.js:6-7`). 순서가 바뀌면 `search` 가 id 로 해석됩니다.

---

## 3. 목록 조회 (GET /admin/users)

- **쿼리 파라미터:**  
  - `q` — 검색어. `u.name` / `u.email` / `u.phone` LIKE  
  - `status` — `active` (`is_active = 1`) 또는 `withdrawn` (`is_active = 0 AND withdrawn_at IS NOT NULL`). 그 외 값은 필터 없음  
- **쿼리:** `users` LEFT JOIN `business_profile`(제외용) LEFT JOIN `policy_versions` ×2 (agreed_terms_id → terms_version, agreed_privacy_id → privacy_version), **`WHERE bp.id IS NULL`**, `ORDER BY u.created_at DESC`  
- **표시:** 이름, 이메일, 가입일, 로그인 정보, 약관 동의 버전, 상태(활성/탈퇴)  
- **뷰 전달:** `users`(각 행에 `deletable` · `deleteBlockReason` 부가), `searchQuery`, `searchStatus`, `businessCount`, `message`, `error`

`businessCount` 는 `SELECT COUNT(*) FROM business_profile` 로, 목록 상단에 "기업회원 N명은 B2B 관리에서" 안내를 띄우는 데 씁니다. 목록에서 빠진 회원이 어디 있는지 알려 주지 않으면 "회원이 사라졌다"는 문의가 옵니다.

> ✅ **스키마 드리프트 해소됨(2026-07-22).** 종전에는 `userController.js` 가 참조하는 `u.withdrawn_at` 이 실제 DB 에 없어 `status=withdrawn` 필터가 500 이었고 회원 탈퇴(`mypageController`)도 실패했습니다. `scripts/migrations/20260722_users_withdrawal_columns.sql` 로 `withdraw_reason` · `withdrawn_at` 과 인덱스를 추가해 `tables.sql` 정의와 맞췄습니다.

---

## 4. 회원 검색 API (GET /admin/users/search)

- **쿼리 파라미터:** `q` — 이메일 / 이름 / 전화번호 / 생년월일 통합 검색  
  - 생년월일은 `YYYY-MM-DD` 와 `YYYYMMDD` 두 포맷 모두 매칭 (`DATE_FORMAT` 비교, 하이픈 제거본도 시도)  
  - `q` 가 비면 `{ users: [] }` 즉시 반환  
- **반환:** JSON `{ users: [...] }`, 최대 50건, `created_at DESC`  
  - 필드: `id, email, name, phone, birthdate, google_id, kakao_id, picture, points_balance, order_count, total_payment`  
  - `order_count` / `total_payment` 는 `orders` 를 `status = 'PAID'` 로 집계한 서브쿼리 LEFT JOIN (없으면 0)  
- **에러:** 500 + `{ users: [], error }`  
- **용도:** 쿠폰 수동 발급·포인트 지급 등 다른 관리자 화면에서 회원을 찾을 때 호출

---

## 5. 회원 상세 (GET /admin/users/:id)

- **쿼리 4건:**  
  1. `users` LEFT JOIN `business_profile` LEFT JOIN `policy_versions` ×2 (동의한 약관/개인정보 버전) — 없으면 404. **`business_profile` 이 있으면 `/admin/b2b/members/:bpId` 로 302** (URL 직접 접근 차단)  
  2. **발급 쿠폰:** `user_coupons` JOIN `coupons` LEFT JOIN `orders` → `coupon_name, coupon_code, discount_amount, issued_at, used_at, issued_by, order_number` (최근 100건)  
  3. **포인트 내역:** `point_transactions` → `amount, transaction_type, order_id, description, created_at` (최근 100건)  
  4. **주문 내역:** `orders` → `order_number, status, total_amount, created_at, paid_at` (최근 100건)  
- **집계:** `totalOrderAmount` = 주문 내역 중 `status === 'PAID'` 인 건의 `total_amount` 합 (애플리케이션에서 계산, 최근 100건 범위 안)  
- **뷰 전달:** `user`, `issuedCoupons`, `pointTransactions`, `userOrders`, `totalOrderAmount`, `title: '회원 상세 정보'`

---

## 6. 활성/비활성 토글 (POST /admin/users/toggle-active/:id)

- **동작:** 기업회원이 아닐 때만 `UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?`  
- **성공 시:** `/admin/users` 리다이렉트 / **기업회원이면:** `?error=기업회원입니다…` 로 거부  

> 이 토글은 `withdrawn_at` 을 건드리지 않습니다. 회원 본인의 탈퇴(`controllers/mypageController.js:601`)와는 별개의 상태입니다 — 관리자 비활성화는 "정지", 탈퇴는 "탈퇴".

> ⚠️ **기업회원을 막는 이유.** `users.is_active = 0` 은 `b2bContext.buildContext()` 에서 `state='SUSPENDED'` 로 B2B 자격을 끊습니다. 그런데 `business_profile.status` 는 `APPROVED` 그대로라 기업회원 승인 화면은 "승인" 으로 보입니다. 거래 중지는 **`b2bMemberController.postStatus`(정지)** 로 일원화합니다.

---

## 7. 회원 삭제 (POST /admin/users/delete/:id)

- **동작:** `judgeDeletable()` 통과 시에만 `DELETE FROM users WHERE id = ?`  
- **성공 시:** `/admin/users?message=...` / **거부 시:** `/admin/users?error=<사유>` 리다이렉트  

하드 딜리트라 되돌릴 수 없고, `users` 를 지우면 아래 FK 가 함께 움직입니다.

| 대상 | DELETE RULE | 결과 |
|---|---|---|
| `carts`, `point_transactions`, `user_coupons`, `likes`, `reviews`, `inquiries`, `recent_views`, `customer_membership` 등 | CASCADE | 함께 삭제 |
| `orders`, `search_logs` | SET NULL | 행은 남고 `user_id` 가 NULL (주문이 `비회원` 으로 표시) |
| `business_profile` | **CASCADE** | 사업자 신원·계약 조건이 함께 삭제 |

그래서 삭제 대상을 **탈퇴했거나 활동이 없는 계정으로 제한**합니다.

```js
function judgeDeletable(row) // controllers/admin/userController.js
```

| 순서 | 조건 | 결과 |
|---|---|---|
| 1 | `business_profile` 존재 | 거부 — "기업회원입니다. B2B 관리 > 기업회원 승인에서 처리해 주세요." |
| 2 | `withdrawn_at IS NOT NULL` | **허용** (탈퇴 회원) |
| 3 | `is_active = 1` | 거부 — "이용 중인 회원입니다. 비활성 처리 후…" |
| 4 | 주문 1건 이상 | 거부 — "주문 이력이 N건 있습니다." |
| 5 | `points_balance > 0` | 거부 — "보유 포인트가 NP 남아 있습니다." |
| 6 | 그 외 | **허용** (비활성 + 무활동) |

> 목록 뷰도 같은 판정 결과(`user.deletable` / `user.deleteBlockReason`)로 버튼을 비활성화하지만, **서버에서 다시 판정합니다.** 목록을 띄워 둔 사이 상태가 바뀔 수 있고 POST 는 직접 호출할 수도 있습니다.

> `withdrawn_at` / `withdraw_reason` 은 `scripts/migrations/20260722_users_withdrawal_columns.sql` 로 추가했습니다. `tables.sql` 에는 있었으나 실제 DB 에 없어 회원 탈퇴와 탈퇴 필터가 `Unknown column` 으로 깨져 있던 드리프트를 해소한 것입니다.

---

## 8. DB 스키마 (users)

| 컬럼 | 설명 |
|------|------|
| id | 사용자 ID (PK) |
| google_id, kakao_id | OAuth 식별자 (각각 UNIQUE) |
| email | 이메일 (UNIQUE, NOT NULL) |
| name | 이름 |
| phone | 전화번호 |
| birthdate | 생년월일 (검색 API 대상) |
| picture | 프로필 이미지 URL |
| address, detailed_address, zipcode | 기본 배송지 |
| points_balance | 보유 포인트 (기본 0) |
| is_active | 활성 여부 (기본 1) |
| marketing_agreed | 마케팅 수신 동의 |
| agreed_terms_id, agreed_privacy_id | 동의한 약관/개인정보 버전 FK → `policy_versions` ([`policies.md`](./policies.md)) |
| created_at, last_login | 가입일, 마지막 로그인 |

> 코드·뷰·`tables.sql` 이 기대하는 **`withdrawn_at` 은 운영 DB 에 없습니다** (3장 경고 참고).

---

*Last Updated: 2026-07-11*
