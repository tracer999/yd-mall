# 운영자 관리 (Operators)

## 1. 개요

- **Base URL:** `/admin/operators`  
- **관련 테이블:** `admins`  
- **컨트롤러:** `controllers/admin/operatorController.js`  
- **뷰:** `views/admin/operators/list.ejs`, `views/admin/operators/form.ejs`  
- **접근 권한:** `routes/admin/operators.js`에서 `requireSuperAdmin` 적용 — **super_admin** 또는 **admin** 역할만 접근 가능, 그 외 403  
- **역할 설명:** 폼에서는 super_admin, content_admin, customer_admin만 선택 가능. `admin` 역할은 기존 DB에 존재할 수 있으며, requireSuperAdmin에서 접근을 허용함 (폼에서 신규 생성 시에는 선택 불가).

관리자(운영자) 계정을 등록·수정·삭제합니다. 비밀번호는 bcrypt로 해시 저장됩니다.

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

---

## 4. 등록/수정 폼 (GET /admin/operators/form)

- **쿼리:** `?id=숫자` 있으면 해당 id의 admins 1건 조회 → 수정 모드, 없으면 등록 모드  
- **수정 시:** username은 readonly (문서상 수정 불가)  
- **뷰 전달:** `operator` (수정 시 1건 또는 null), `isEdit`, `title`

### 4.1 폼 필드 (form.ejs)

| name | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | hidden | 수정 시 | 운영자 ID |
| username | text | O | 로그인 ID (수정 시 readonly) |
| password | password | 등록 시 O | 비밀번호 (수정 시 '변경하려면 입력') |
| role | select | O | super_admin / content_admin / customer_admin |

- **역할 설명 (뷰 문구):**  
  - 최고 관리자(super_admin): 모든 권한  
  - 컨텐츠 관리자(content_admin): 상품, 카테고리, 배너 등  
  - 고객 관리자(customer_admin): 회원, 문의 관리

---

## 5. 운영자 등록 (POST /admin/operators/add)

- **파라미터:** username, password, role (모두 필수)  
- **검증:** 하나라도 없으면 400, 'All fields are required'  
- **비밀번호:** `bcrypt.hash(password, 10)` 후 저장  
- **INSERT:** admins (username, password, role)  
- **중복:** username 유니크 위반 시 400, 'Username already exists'  
- **성공 시:** `res.redirect('/admin/operators')`

---

## 6. 운영자 수정 (POST /admin/operators/edit)

- **파라미터:** id, username, role, password (선택)  
- **비밀번호:** 비어 있지 않으면 새로 해시하여 UPDATE에 포함, 비어 있으면 password 컬럼 미갱신  
- **UPDATE:** username, role (및 선택적 password) WHERE id  
- **중복:** username 유니크 위반 시 400  
- **성공 시:** `/admin/operators`로 리다이렉트  

---

## 7. 운영자 삭제 (POST /admin/operators/delete)

- **파라미터:** id (body)  
- **자기 자신 보호:** `req.session.admin.id == id` 이면 삭제하지 않고 `/admin/operators`로 리다이렉트 (콘솔 로그만)  
- **동작:** `DELETE FROM admins WHERE id = ?` 후 `/admin/operators`로 리다이렉트  

---

## 8. DB 스키마 (admins)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK AUTO_INCREMENT | 관리자 ID |
| username | VARCHAR(50) UNIQUE | 로그인 ID |
| password | VARCHAR(255) | bcrypt 해시 |
| role | VARCHAR(20) DEFAULT 'admin' | 역할 |
| created_at | TIMESTAMP | 생성일시 |

---

*Last Updated: 2026-02-07*
