# 관리자 로그인/로그아웃 (Auth)

## 1. 개요

- **로그인 URL:** `GET /admin/login`, `POST /admin/login`  
- **로그아웃 URL:** `GET /admin/logout`  
- **관련 테이블:** `admins`  
- **컨트롤러:** `controllers/admin/authController.js`  
- **뷰:** `views/admin/login.ejs` (레이아웃 없음: `layout: false`)

인증되지 않은 사용자가 `/admin` 또는 하위 경로에 접근하면 `adminAuth` 미들웨어에 의해 `/admin/login`으로 리다이렉트됩니다.

---

## 2. 로그인 폼 (GET /admin/login)

- **동작:** 로그인 페이지 렌더링  
- **뷰:** `admin/login`, `layout: false`  
- **전달 변수:**  
  - `error`: 로그인 실패 시 메시지 (선택)

---

## 3. 로그인 처리 (POST /admin/login)

### 3.1 요청 파라미터

| name | 타입 | 필수 | 설명 |
|------|------|------|------|
| username | string | O | 관리자 로그인 ID (admins.username) |
| password | string | O | 평문 비밀번호 |

### 3.2 처리 흐름

1. `admins` 테이블에서 `username = ?` 조건으로 1건 조회  
2. **존재하지 않으면:** `error: '존재하지 않는 계정입니다.'` 로 로그인 뷰 다시 렌더링  
3. **존재하면:** `bcrypt.compare(password, admin.password)` 로 비밀번호 검증  
   - **일치:**  
     - `req.session.admin = { id, username, role }` 저장  
     - `req.session.save()` 콜백에서 `res.redirect('/admin')`  
   - **불일치:** `error: '비밀번호가 일치하지 않습니다.'` 로 로그인 뷰 다시 렌더링  
4. **예외:** DB/기타 에러 시 `res.status(500).send('Server Error')`

### 3.3 보안

- 비밀번호는 DB에 bcrypt 해시로 저장  
- 비교 시 `bcrypt.compare()` 사용 (평문 전달 금지)

---

## 4. 로그아웃 (GET /admin/logout)

- **동작:** `req.session.destroy()` 호출 후 `/admin/login`으로 리다이렉트  
- **참고:** POST가 아닌 GET으로 노출되어 있으므로, 외부에서 링크로 접근해도 로그아웃됨 (보안 요구사항에 따라 POST 전용으로 변경 검토 가능)

---

## 5. 에러 메시지 정리

| 상황 | 사용자 메시지 |
|------|----------------|
| 계정 없음 | 존재하지 않는 계정입니다. |
| 비밀번호 불일치 | 비밀번호가 일치하지 않습니다. |
| 서버 에러 | (화면 없음, 500 응답) |

---

*Last Updated: 2026-02-05*
