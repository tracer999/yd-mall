# 관리자 로그인/로그아웃 (Auth)

## 1. 개요

- **로그인 URL:** `GET /admin/login`, `POST /admin/login`
- **로그아웃 URL:** `GET /admin/logout`
- **관련 테이블:** `admins`, `admin_verification_codes`
- **컨트롤러:** `controllers/admin/authController.js`
- **뷰:** `views/admin/login.ejs` (레이아웃 없음: `layout: false`)
- **이메일 발송:** `services/emailService.js` 의 `sendEmail()` (SMTP 설정은 `system_settings` 의 `smtp_*`)

인증되지 않은 사용자가 `/admin` 또는 하위 경로에 접근하면 `adminAuth` 미들웨어에 의해 `/admin/login`으로 리다이렉트됩니다.

로그인은 **계정별 이중인증(2FA) 사용 여부(`admins.use_2fa`)에 따라 1단계 또는 2단계**로 진행됩니다.

- `use_2fa = 0` → 아이디/비밀번호 검증만으로 로그인 완료
- `use_2fa = 1` → 비밀번호 검증 후 이메일로 **6자리 인증코드**를 발송하고, 코드 입력 단계(`step: 'code'`)로 진입

---

## 2. 로그인 폼 (GET /admin/login)

- **동작:** 로그인 페이지 렌더링. `req.session.pending2faAdminId` 가 있으면 코드 입력 단계로 바로 렌더링
- **뷰:** `admin/login`, `layout: false`
- **전달 변수:**
  - `step`: `'credentials'`(아이디/비밀번호) 또는 `'code'`(인증코드 입력)
  - `error`: 로그인 실패 시 메시지 (선택)
  - `codeSent`: 인증코드 발송 여부 (GET 에서는 항상 `false`)
- **`?reset=1`:** 코드 입력 단계에서 "아이디/비밀번호 다시 입력" 링크로 진입. `pending2faAdminId` 세션 키를 삭제하고 `step: 'credentials'` 로 되돌립니다.

---

## 3. 로그인 처리 (POST /admin/login)

한 엔드포인트가 **1단계·2단계를 겸합니다.** `verificationCode` 파라미터가 있고 `req.session.pending2faAdminId` 가 살아 있으면 2단계(`handleVerifyCode`), 아니면 1단계(`handleCredentials`)로 분기합니다.

### 3.1 요청 파라미터

| name | 타입 | 필수 | 설명 |
|------|------|------|------|
| username | string | 1단계 O | 관리자 로그인 ID (`admins.username`) |
| password | string | 1단계 O | 평문 비밀번호 |
| verificationCode | string | 2단계 O | 이메일로 받은 6자리 인증코드 |

### 3.2 1단계 — 아이디/비밀번호 검증 (handleCredentials)

1. `admins` 테이블에서 `username = ?` 조건으로 1건 조회
2. **존재하지 않으면:** `error: '존재하지 않는 계정입니다.'` 로 `step: 'credentials'` 재렌더링
3. **존재하면:** `bcrypt.compare(password, admin.password)` 로 비밀번호 검증
   - **불일치:** 콘솔에 `[ADMIN LOGIN] 비밀번호 불일치` 경고 후 `error: '비밀번호가 일치하지 않습니다.'` 재렌더링
   - **일치:** `admins.use_2fa` 로 분기
4. **2FA 미사용(`use_2fa = 0`):**
   - `req.session.pending2faAdminId` 삭제
   - `req.session.admin = { id, username, role, email }` 저장
   - `req.session.save()` 콜백에서 `res.redirect('/admin')`
5. **2FA 사용(`use_2fa = 1`):**
   - `admins.email` 이 비어 있으면 → `error: '이 계정은 이중인증이 설정되어 있으나 등록된 이메일이 없습니다...'` 재렌더링 (로그인 거절)
   - 6자리 랜덤 코드 생성 → `admin_verification_codes` 에 `INSERT (admin_id, code, expires_at)` (유효기간 **5분**)
   - `sendEmail()` 로 인증코드 메일 발송. 실패하면 `error: '이메일 발송에 실패했습니다. SMTP 설정을 확인하세요.'` 재렌더링
   - `req.session.pending2faAdminId = admin.id` 저장 후 `step: 'code'`, `codeSent: true`, `maskedEmail`(예: `tra***@gmail.com`) 로 렌더링
6. **예외:** DB/기타 에러 시 `res.status(500).send('Server Error')`

### 3.3 2단계 — 인증코드 검증 (handleVerifyCode)

1. `verificationCode` 에서 숫자만 남기고 앞 6자리를 취함. 6자리가 아니면 `error: '6자리 인증코드를 입력해 주세요.'` 로 코드 폼 재렌더링
2. 조회 조건:
   ```sql
   SELECT vc.id, vc.admin_id, a.username, a.role, a.email
     FROM admin_verification_codes vc
     JOIN admins a ON a.id = vc.admin_id
    WHERE vc.admin_id = ? AND vc.code = ?
      AND vc.expires_at > NOW() AND vc.used_at IS NULL
    LIMIT 1
   ```
3. **일치 없음/만료:** `error: '인증코드가 일치하지 않거나 만료되었습니다. 처음부터 다시 시도하세요.'`
4. **일치:**
   - `UPDATE admin_verification_codes SET used_at = NOW()` (**코드 1회용 처리**)
   - `req.session.pending2faAdminId` 삭제
   - `req.session.admin = { id, username, role, email }` 저장 후 `res.redirect('/admin')`
5. **예외:** 500 `Server Error`

> 재시도 횟수 제한·코드 발송 rate limit 은 **없습니다.** 코드는 만료(5분)와 1회용(`used_at`)으로만 통제됩니다.

### 3.4 보안

- 비밀번호는 DB에 bcrypt 해시(rounds=10)로 저장
- 비교 시 `bcrypt.compare()` 사용 (평문 전달 금지)
- 인증코드는 5분 유효·1회용, 이메일 주소는 화면에 마스킹(`maskEmail`)하여 노출
- 세션 쿠키는 `httpOnly`, `sameSite: 'lax'`, 운영에서는 `secure: 'auto'` (`app.js`)

---

## 4. 로그아웃 (GET /admin/logout)

- **동작:** `req.session.destroy()` 호출 후 `/admin/login`으로 리다이렉트
- **참고:** POST가 아닌 GET으로 노출되어 있으므로, 외부에서 링크로 접근해도 로그아웃됨 (보안 요구사항에 따라 POST 전용으로 변경 검토 가능)

---

## 5. 에러 메시지 정리

| 상황 | 단계 | 사용자 메시지 |
|------|------|----------------|
| 계정 없음 | 1단계 | 존재하지 않는 계정입니다. |
| 비밀번호 불일치 | 1단계 | 비밀번호가 일치하지 않습니다. |
| 2FA 계정인데 이메일 미등록 | 1단계 | 이 계정은 이중인증이 설정되어 있으나 등록된 이메일이 없습니다. 관리자에게 이메일 등록을 요청하세요. |
| 인증코드 메일 발송 실패 | 1단계 | 이메일 발송에 실패했습니다. SMTP 설정을 확인하세요. |
| 인증코드 형식 오류 | 2단계 | 6자리 인증코드를 입력해 주세요. |
| 인증코드 불일치/만료/사용됨 | 2단계 | 인증코드가 일치하지 않거나 만료되었습니다. 처음부터 다시 시도하세요. |
| 세션 저장 실패 | 공통 | (화면 없음, 500 `Session Save Error`) |
| 서버 에러 | 공통 | (화면 없음, 500 `Server Error`) |

---

## 6. 관련 DB 스키마

### admins (인증 관련 컬럼)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| username | VARCHAR(50) UNIQUE | 로그인 ID |
| password | VARCHAR(255) | bcrypt 해시 |
| email | VARCHAR(255) NULL | 이중인증용 이메일 |
| use_2fa | TINYINT(1) NOT NULL DEFAULT 1 | 이중인증 사용 여부 |
| role | VARCHAR(20) DEFAULT 'admin' | 역할 |

전체 컬럼은 [운영자 관리](./operators.md) 문서를 참고하세요.

### admin_verification_codes

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK AUTO_INCREMENT | |
| admin_id | INT NOT NULL | `admins.id` FK (ON DELETE CASCADE) |
| code | VARCHAR(6) NOT NULL | 6자리 인증코드 |
| expires_at | TIMESTAMP NOT NULL | 만료 시각 (발급 + 5분) |
| used_at | TIMESTAMP NULL | 사용 시각. NULL 이면 미사용 |
| created_at | TIMESTAMP NOT NULL | 발급 시각 |

인덱스: `idx_admin_verification_admin_expires (admin_id, expires_at)`

> 사용/만료된 코드 행은 자동 삭제되지 않고 누적됩니다(정리 배치 없음).

---

*Last Updated: 2026-07-11*
