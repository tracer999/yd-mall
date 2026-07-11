# 인증 (로그인/회원가입)

## 1. 개요

- **Base URL:** `/auth`
- **라우트:** `routes/auth.js` (인라인 핸들러 + Passport)
- **전략 설정:** `config/passport.js`
- **뷰:** `views/auth/login.ejs`, `signup_finish.ejs`, `signup_success.ejs`, `terms_update.ejs` (모두 `layout: 'layouts/main_layout'`)

고객 인증은 **Passport.js OAuth 전용**입니다. 이메일/비밀번호 로그인 라우트도, 자체 회원가입 폼도 없습니다. 로그인 진입 → 소셜 인증 → 추가 정보 입력 → 약관 동의 → 서비스 이용의 단일 경로만 존재합니다. (관리자 백오피스는 별개의 자체 세션 + bcrypt 로그인입니다.)

### 1.1 전략 등록 조건 (config/passport.js)

전략은 **env 가 갖춰졌을 때만 등록**됩니다. 없으면 `passport.use()` 를 건너뛰고 경고만 출력하므로, 해당 `/auth/{provider}` 요청은 "Unknown authentication strategy" 로 실패합니다.

| 전략 | 필요한 값 | 미설정 시 |
|------|-----------|-----------|
| Google | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GOOGLE_CALLBACK_URL_DEV\|PROD` | `console.warn('Google OAuth 비활성화: …')` 후 미등록 |
| Kakao | `KAKAO_CLIENT_ID` + `KAKAO_CALLBACK_URL_DEV\|PROD` (`KAKAO_CLIENT_SECRET` 은 선택) | `console.warn('Kakao OAuth 비활성화: …')` 후 미등록 |

- 콜백 URL 은 `NODE_ENV === 'production'` 이면 `*_PROD`, 아니면 `*_DEV` 를 씁니다.
- 이 값들은 `.env` 가 아니라 **DB `system_settings`** 에서 `process.env` 로 주입됩니다(`config/systemSettings.js`). 그래서 각 OAuth 라우트는 `refreshSystemSettings` 미들웨어로 매 요청 시 설정을 다시 로드하고, `getOAuthCallbackUrl()` 로 콜백 URL 을 런타임에 덮어씁니다.
- `serializeUser` 는 `user.id`, `deserializeUser` 는 `users` 재조회. 사용자가 삭제됐으면 `done(null, false)` 로 세션에서 제거합니다.

### 1.2 계정 생성·병합 규칙

- 신규 소셜 사용자는 **`is_active = 0`** 으로 INSERT 됩니다. 약관 동의(추가 정보 입력 또는 재동의)를 마쳐야 `is_active = 1` 이 됩니다.
- 같은 이메일의 기존 사용자가 있으면 `google_id` / `kakao_id` 를 붙여 **계정을 병합**합니다.
- 재로그인 시 `last_login` 과 `picture` 만 갱신합니다(사용자가 수정한 `name` 은 보존).
- 카카오가 이메일을 주지 않으면 `kakao_{id}@no-email.com` placeholder 로 저장하고, 추가 정보 입력 단계에서 실제 이메일로 교체합니다.

---

## 2. 로그인 (GET /auth/login)

- 이미 로그인되어 있으면 `checkAndRedirect` 호출(추가 정보/약관 확인 후 returnTo 또는 `/`로 이동).
- `?redirect=/path`가 있으면 `req.session.returnTo`에 저장(오픈 리다이렉트 방지: `/` 로 시작하고 `//` 로 시작하지 않는 경로만).
- `?redirect` 가 없고 세션에도 없으면 **Referer 헤더에서 이전 경로를 자동 저장**합니다(`/auth` 로 시작하는 경로는 제외).
- 뷰: `auth/login`, title: '로그인'.

> **현재 로그인 뷰는 카카오 버튼 하나만 노출합니다**(`views/auth/login.ejs`). Google 라우트·전략은 살아 있으므로 `/auth/google` 로 직접 진입하면 동작하지만, 화면에 진입점이 없습니다.

---

## 3. 회원가입 진입 (GET /auth/signup)

- 이미 로그인되어 있으면 `checkAndRedirect`.
- 뷰: `auth/login` (로그인과 동일 페이지), title: '회원가입'. 소셜 가입 시 동일 진입점 사용.

---

## 4. Google OAuth

- **GET /auth/google:** `refreshSystemSettings` → `passport.authenticate('google', { scope: ['profile', 'email'], callbackURL })`.
- **GET /auth/google/callback:** 인증 성공 시 `checkAndRedirect`, 실패 시 `/auth/login`으로 리다이렉트.

---

## 5. Kakao OAuth

- **GET /auth/kakao:** `passport.authenticate('kakao', { prompt: 'select_account', callbackURL })`. `prompt` 를 넘기기 위해 `KakaoStrategy.prototype.authorizationParams` 를 오버라이드합니다(`config/passport.js`).
- **GET /auth/kakao/callback:** 성공 시 `checkAndRedirect`, 실패 시 `/auth/login` (`keepSessionInfo: true` — 재인증 플로우가 세션 값을 잃지 않도록).

### 5.1 본인확인 재인증 (GET /auth/kakao/reauth)

- 로그인 상태에서만 진입(비로그인 → `/auth/login`).
- `req.session.pending_reauth = { user_id, return_to }` 를 저장(`return_to` 기본값 `/mypage/profile`)한 뒤 카카오 인증을 다시 태웁니다.
- 콜백에서 돌아온 사용자가 **같은 user_id 가 아니면** `/mypage/profile?reauth=fail`.
- 일치하면 `req.session.identity_verified = true` + `identity_verified_at` 를 심고 `return_to?verified=1` 로 이동합니다.

---

## 6. checkAndRedirect (내부)

- 비로그인 시 `/auth/login`으로 이동.
- `req.user.phone`이 없으면 `/auth/signup-finish`로 이동(추가 정보 입력).
- `policy_versions`에서 현재 시행중인 TERMS/PRIVACY 버전 ID 조회. 아래 중 하나라도 참이면 `/auth/terms-update` 로 이동.
  - `agreed_terms_id` 또는 `agreed_privacy_id` 가 없음(최초 동의 필요)
  - 동의한 버전이 현재 시행 버전과 다름(재동의 필요)
  - `is_active === 0`
- `req.session.returnTo`가 있으면 해당 경로로(검증 후 세션에서 제거), 없으면 `/`로 리다이렉트.

---

## 7. 추가 정보 입력 (GET/POST /auth/signup-finish)

- **GET:** 로그인 필수. 이미 phone 있으면 `/`로. `policy_versions`(is_active=1) → 없으면 `site_settings` 순으로 이용약관/개인정보 내용 조회 후 뷰에 `termsContent`, `privacyContent` 전달. 뷰: `auth/signup_finish`.
- **POST:** body: `name`, `birthdate`(YYYYMMDD → YYYY-MM-DD 변환), `phone`, `address`, `detailed_address`, `zipcode`, `email`.
  - 휴대폰 중복(다른 사용자와) 시 같은 뷰에 `errorMessage`로 '이미 존재하는 휴대폰 번호입니다.' 전달.
  - 성공 시 `policy_versions` 현재 시행 버전 ID 조회 → `users` 에 연락처 정보 + `agreed_terms_id`, `agreed_privacy_id`, `is_active = 1` 업데이트. `name` 은 `COALESCE` 로 보존, **이메일은 기존 값이 `@no-email.com` placeholder 일 때만 교체**합니다.
  - `user_policy_agreements` 에 동의 이력 저장(약관/개인정보 각 1행, `ON DUPLICATE KEY UPDATE agreed_at`).
  - **가입 축하 쿠폰 자동 지급** — 트리거는 `coupons.issue_method = 'AUTO_SIGNUP' AND status = 'ACTIVE'` + 유효기간 조건입니다(`coupon_type = 'NEW_SIGNUP'` 이 아닙니다 — `coupon_type` 은 목적 라벨로 강등). 발급은 `services/coupon/couponIssueService.issueCoupon` 이 트랜잭션으로 처리하며 선착순·유효기간을 관장합니다. 쿠폰 발급이 실패해도 가입은 진행됩니다(에러 로깅만).
  - 완료 후 `/auth/signup-success` 로 리다이렉트.

### 7.1 휴대폰 중복 확인 API (POST /auth/phone/check)

- body: `{ phone }`. 로그인 상태면 자기 자신은 제외하고 조회.
- 응답: `{ success: true, message: '사용 가능한 번호입니다.' }` 또는 `{ success: false, message: '이미 가입된 휴대폰 번호입니다.' }`.

---

## 8. 가입 완료 (GET /auth/signup-success)

- 로그인 필수. 뷰: `auth/signup_success`, title: '가입 완료'.

---

## 9. 약관 재동의 (GET/POST /auth/terms-update)

- **GET:** 로그인 필수. `policy_versions`(is_active=1) 에서 현재 시행 약관/개인정보 내용 조회 후 뷰에 `termsContent`, `privacyContent` 전달. 뷰: `auth/terms_update`.
- **POST:** `body.terms` 필수(없으면 400). `policy_versions` 현재 버전 ID 조회 후 `users` 의 `agreed_terms_id`, `agreed_privacy_id`, `is_active = 1` 업데이트, `user_policy_agreements` 저장. 완료 후 `/`로 리다이렉트.

---

## 10. 로그아웃 (GET /auth/logout)

- `req.logout()` 콜백 후 `/`로 리다이렉트.

---

*Last Updated: 2026-07-11*
