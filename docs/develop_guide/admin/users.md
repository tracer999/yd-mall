# 회원 관리 (Users)

## 1. 개요

- **Base URL:** `/admin/users`  
- **관련 테이블:** `users`, `policy_versions` (조인), `user_coupons`·`coupons`, `point_transactions`, `orders` (상세 화면)  
- **컨트롤러:** `controllers/admin/userController.js`  
- **뷰:** `views/admin/users/list.ejs`, `detail.ejs`

회원 목록·검색·상세 조회, 활성/비활성 토글, 회원 삭제를 제공합니다. 상세 화면에서는 발급 쿠폰·포인트 내역·주문 내역을 함께 보여줍니다. 회원 데이터는 **몰별로 스코프하지 않습니다**(`adminMallContext` 주석: "banners·orders/users 등 몰 무관 데이터는 스코프하지 않는다").

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
- **쿼리:** `users` LEFT JOIN `policy_versions` ×2 (agreed_terms_id → terms_version, agreed_privacy_id → privacy_version), `ORDER BY u.created_at DESC`  
- **표시:** 이름, 이메일, 가입일, 로그인 정보, 약관 동의 버전, 상태(활성/탈퇴)  
- **뷰 전달:** `users`, `searchQuery`, `searchStatus`, `title: '회원 관리'`

> ⚠️ **스키마 드리프트 — `status=withdrawn` 은 현재 500 입니다.**  
> `userController.js:66` 이 `u.withdrawn_at` 을 참조하고 `views/admin/users/list.ejs:59` · `detail.ejs:10,50,58` 도 이 컬럼을 읽지만, **운영 DB `users` 테이블에 `withdrawn_at` 컬럼이 없습니다** (`SELECT withdrawn_at FROM users` → `ERROR 1054 (42S22) Unknown column 'withdrawn_at'`). `tables.sql:418` 에는 정의돼 있으나 DB 에 적용되지 않았습니다. 컬럼을 추가해야 탈퇴 필터·탈퇴 표시가 동작합니다.

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
  1. `users` LEFT JOIN `policy_versions` ×2 (동의한 약관/개인정보 버전) — 없으면 404  
  2. **발급 쿠폰:** `user_coupons` JOIN `coupons` LEFT JOIN `orders` → `coupon_name, coupon_code, discount_amount, issued_at, used_at, issued_by, order_number` (최근 100건)  
  3. **포인트 내역:** `point_transactions` → `amount, transaction_type, order_id, description, created_at` (최근 100건)  
  4. **주문 내역:** `orders` → `order_number, status, total_amount, created_at, paid_at` (최근 100건)  
- **집계:** `totalOrderAmount` = 주문 내역 중 `status === 'PAID'` 인 건의 `total_amount` 합 (애플리케이션에서 계산, 최근 100건 범위 안)  
- **뷰 전달:** `user`, `issuedCoupons`, `pointTransactions`, `userOrders`, `totalOrderAmount`, `title: '회원 상세 정보'`

---

## 6. 활성/비활성 토글 (POST /admin/users/toggle-active/:id)

- **동작:** `UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?`  
- **성공 시:** `/admin/users` 리다이렉트  

> 이 토글은 `withdrawn_at` 을 건드리지 않습니다. 회원 본인의 탈퇴(`controllers/mypageController.js:601`)와는 별개의 상태입니다 — 관리자 비활성화는 "정지", 탈퇴는 "탈퇴".

---

## 7. 회원 삭제 (POST /admin/users/delete/:id)

- **동작:** `DELETE FROM users WHERE id = ?`  
- **성공 시:** `/admin/users` 리다이렉트  

> 하드 딜리트입니다. 트랜잭션도, 연관 데이터(주문·포인트·쿠폰) 정리도 하지 않으므로 FK 제약에 걸리면 500 입니다. 실무에서는 6장의 비활성화를 쓰세요.

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
