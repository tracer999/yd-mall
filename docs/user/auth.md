# 인증 (로그인/회원가입)

## 1. 개요

- **Base URL:** `/auth`
- **라우트:** `routes/auth.js` (인라인 핸들러 + Passport)
- **뷰:** `views/auth/login.ejs`, `signup_finish.ejs`, `signup_success.ejs`, `terms_update.ejs` (모두 `layout: 'layouts/main_layout'`)

로그인·회원가입 진입, Google/Kakao OAuth, 추가 정보 입력, 약관 재동의, 로그아웃을 처리합니다.

---

## 2. 로그인 (GET /auth/login)

- 이미 로그인되어 있으면 `checkAndRedirect` 호출(추가 정보/약관 확인 후 returnTo 또는 `/`로 이동).
- `?redirect=/path`가 있으면 `req.session.returnTo`에 저장 후 로그인 완료 시 해당 경로로 이동.
- 뷰: `auth/login`, title: '로그인'.

---

## 3. 회원가입 진입 (GET /auth/signup)

- 이미 로그인되어 있으면 `checkAndRedirect`.
- 뷰: `auth/login` (로그인과 동일 페이지), title: '회원가입'. 소셜 가입 시 동일 진입점 사용.

---

## 4. Google OAuth

- **GET /auth/google:** `passport.authenticate('google', { scope: ['profile', 'email'] })`.
- **GET /auth/google/callback:** 인증 성공 시 `checkAndRedirect`, 실패 시 `/auth/login`으로 리다이렉트.

---

## 5. Kakao OAuth

- **GET /auth/kakao:** `passport.authenticate('kakao', { prompt: 'select_account' })`.
- **GET /auth/kakao/callback:** 성공 시 `checkAndRedirect`, 실패 시 `/auth/login`.

---

## 6. checkAndRedirect (내부)

- 비로그인 시 `/auth/login`으로 이동.
- `req.user.phone`이 없으면 `/auth/signup-finish`로 이동(추가 정보 입력).
- `policy_versions`에서 현재 시행중인 TERMS/PRIVACY 버전 ID 조회. 사용자의 agreed_terms_id/agreed_privacy_id가 없거나 버전이 바뀌었으면 `/auth/terms-update`로 이동.
- `is_active === 0`이면 `/auth/terms-update`로 이동.
- `req.session.returnTo`가 있으면 해당 경로로, 없으면 `/`로 리다이렉트.

---

## 7. 추가 정보 입력 (GET/POST /auth/signup-finish)

- **GET:** 로그인 필수. 이미 phone 있으면 `/`로. `policy_versions`(is_active=1) 또는 `site_settings`에서 이용약관/개인정보 내용 조회 후 뷰에 termsContent, privacyContent 전달. 뷰: `auth/signup_finish`.
- **POST:** body: birthdate(YYYYMMDD → YYYY-MM-DD 변환), phone, address, detailed_address, zipcode. 휴대폰 중복(다른 사용자와) 시 같은 뷰에 errorMessage로 '이미 존재하는 휴대폰 번호입니다.' 전달. 성공 시 policy_versions에서 현재 시행 버전 ID 조회 후 users에 agreed_terms_id, agreed_privacy_id, is_active=1 및 연락처 정보 업데이트, user_policy_agreements에 동의 이력 저장. NEW_SIGNUP 쿠폰 자동 지급 후 `/auth/signup-success`로 리다이렉트.

---

## 8. 가입 완료 (GET /auth/signup-success)

- 로그인 필수. 뷰: `auth/signup_success`, title: '가입 완료'.

---

## 9. 약관 재동의 (GET/POST /auth/terms-update)

- **GET:** 로그인 필수. policy_versions에서 현재 시행 약관/개인정보 내용 조회 후 뷰에 termsContent, privacyContent 전달. 뷰: `auth/terms_update`.
- **POST:** body.terms 필수. policy_versions에서 현재 버전 ID 조회 후 users의 agreed_terms_id, agreed_privacy_id, is_active=1 업데이트, user_policy_agreements 저장. 완료 후 `/`로 리다이렉트.

---

## 10. 로그아웃 (GET /auth/logout)

- `req.logout()` 콜백 후 `/`로 리다이렉트.

---

*Last Updated: 2026-02-08*
