# 운영자 관리 (Operators)

## 1. 개요

- **Base URL:** `/admin/operators`
- **관련 테이블:** `admins`
- **컨트롤러:** `controllers/admin/operatorController.js`
- **뷰:** `views/admin/operators/list.ejs`, `views/admin/operators/form.ejs`
- **접근 권한:** **2중 가드**
  1. `routes/admin.js` 마운트 시 `requireMenuAccess('/admin/operators')` — `admin_menus` 의 `/admin/operators` 행은 현재 `visible_roles = 'super_admin'` 이므로 **super_admin 만 통과**
  2. `routes/admin/operators.js` 내부의 `requireSuperAdmin` — `super_admin` 또는 `admin` 허용, 그 외 403 `Access Denied`

  두 가드가 AND 로 걸리므로 **실효 접근 권한은 `super_admin` 단독**입니다. 내부 `requireSuperAdmin` 이 `admin` 을 허용하도록 작성돼 있지만, 현재 메뉴 설정에서는 `admin` 이 1번 가드에서 이미 403 을 받아 도달하지 못합니다. `admin` 에게 열어 주려면 `/admin/menus` 에서 해당 메뉴의 `visible_roles` 에 `admin` 을 추가해야 합니다.
- **선택 가능한 역할:** 폼에서 `super_admin` / `admin` / `content_admin` / `customer_admin` 4종 모두 선택 가능

관리자(운영자) 계정을 등록·수정·삭제합니다. 비밀번호는 bcrypt로 해시 저장되며, 계정별로 **이메일 이중인증(2FA)** 사용 여부를 지정합니다.

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/operators` | getList | 운영자 목록 |
| GET | `/admin/operators/form` | getForm | 등록/수정 폼 (?id= 있으면 수정) |
| POST | `/admin/operators/add` | postAdd | 운영자 등록 |
| POST | `/admin/operators/edit` | postEdit | 운영자 수정 |
| POST | `/admin/operators/delete` | deleteOperator | 운영자 삭제 |

---

## 3. 목록 (GET /admin/operators)

- **쿼리:** `SELECT id, username, role, created_at FROM admins ORDER BY created_at DESC`
- **뷰 전달:** `operators`, `title: '운영자 관리'`
- **표시 컬럼:** ID / 사용자명 / 역할(배지) / 등록일 / 관리(수정·삭제)
- **참고:** 목록에는 `email`·`use_2fa` 를 조회하지 않으므로 **이중인증 사용 여부는 목록에서 확인할 수 없습니다.** 수정 폼에서 확인합니다.

---

## 4. 등록/수정 폼 (GET /admin/operators/form)

- **쿼리:** `?id=숫자` 있으면 `SELECT id, username, email, use_2fa, role FROM admins WHERE id = ?` → 수정 모드, 없으면 등록 모드
- **수정 시:** username 은 `readonly` (뷰 문구: "사용자명은 수정할 수 없습니다.")
- **뷰 전달:** `operator` (수정 시 1건, 등록 시 null), `isEdit`, `title`

### 4.1 폼 필드 (form.ejs)

| name | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | hidden | 수정 시 | 운영자 ID |
| username | text | O | 로그인 ID (수정 시 readonly) |
| email | email | X | 이중인증용 이메일. 2FA 사용 시 사실상 필수(없으면 로그인 거절) |
| use_2fa | checkbox | X | 이중인증 사용. **등록 시 기본 체크됨** |
| password | password | 등록 시 O | 비밀번호 (수정 시 '변경하려면 입력하세요') |
| password_confirm | password | 등록 시 O | 비밀번호 확인. 수정 시 password 를 입력했을 때만 검사 |
| role | select | O | super_admin / admin / content_admin / customer_admin |

- 비밀번호 일치 검사는 **클라이언트(폼 스크립트) + 서버 양쪽**에서 수행합니다.
- **역할 설명 (뷰 문구):**
  - 최고 관리자(super_admin): 모든 권한 보유 (메뉴 관리 포함)
  - 관리자(admin): 최고 관리자에 준하는 권한, 메뉴 관리 접근 가능
  - 컨텐츠 관리자(content_admin): 메뉴별 접근 가능 (상품, 카테고리, 배너 등)
  - 고객 관리자(customer_admin): 메뉴별 접근 가능 (회원, 문의 등)

> 실제 역할별 접근 범위는 코드가 아니라 **DB `admin_menus.visible_roles`(CSV)** 가 결정합니다. [시스템 개요](./overview.md) 4.3 참고.

---

## 5. 운영자 등록 (POST /admin/operators/add)

- **파라미터:** username, email, password, password_confirm, role, use_2fa
- **검증:**
  - username / password / role 중 하나라도 없으면 400 `모든 필수 항목을 입력하세요.`
  - `password !== password_confirm` 이면 400 `비밀번호가 일치하지 않습니다.`
- **비밀번호:** `bcrypt.hash(password, 10)` 후 저장
- **use_2fa:** `'on' | '1' | true` 중 하나면 1, 아니면 0
- **email:** 공백이면 NULL 저장
- **INSERT:** `INSERT INTO admins (username, email, use_2fa, password, role) VALUES (?, ?, ?, ?, ?)`
- **중복:** username 유니크 위반(`ER_DUP_ENTRY`) 시 400 `Username already exists`
- **성공 시:** `res.redirect('/admin/operators')`

---

## 6. 운영자 수정 (POST /admin/operators/edit)

- **파라미터:** id, username, email, role, use_2fa, password(선택), password_confirm(선택)
- **검증:** password 가 비어 있지 않을 때만 `password === password_confirm` 검사 (불일치 시 400)
- **비밀번호:** 비어 있지 않으면 새로 해시하여 UPDATE 에 포함, 비어 있으면 password 컬럼 미갱신
- **UPDATE:** `UPDATE admins SET username = ?, email = ?, use_2fa = ?, role = ?[, password = ?] WHERE id = ?`
- **중복:** username 유니크 위반 시 400 `Username already exists`
- **성공 시:** `/admin/operators` 로 리다이렉트

> 폼에서 username 이 `readonly` 라도 서버는 body 의 username 을 그대로 UPDATE 합니다(서버 측 불변 검증 없음).

---

## 7. 운영자 삭제 (POST /admin/operators/delete)

- **파라미터:** id (body)
- **자기 자신 보호:** `req.session.admin.id == id` 이면 삭제하지 않고 `/admin/operators` 로 리다이렉트 (콘솔 로그만, 사용자에게 메시지 없음)
- **동작:** `DELETE FROM admins WHERE id = ?` 후 `/admin/operators` 로 리다이렉트
- **연쇄 삭제:** `admin_verification_codes.admin_id` 가 `ON DELETE CASCADE` 이므로 해당 운영자의 인증코드 행도 함께 삭제됩니다.
- **주의:** 마지막 `super_admin` 삭제를 막는 가드는 없습니다.

---

## 8. DB 스키마 (admins)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK AUTO_INCREMENT | 관리자 ID |
| username | VARCHAR(50) UNIQUE NOT NULL | 로그인 ID |
| email | VARCHAR(255) NULL | 운영자 이메일 (이중인증용) |
| use_2fa | TINYINT(1) NOT NULL DEFAULT 1 | 이중인증 사용 여부 |
| password | VARCHAR(255) NOT NULL | bcrypt 해시 |
| role | VARCHAR(20) DEFAULT 'admin' | 역할 |
| created_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | 생성일시 |

로그인·이중인증 흐름은 [관리자 로그인/로그아웃](./auth.md) 을 참고하세요.

---

*Last Updated: 2026-07-11*
