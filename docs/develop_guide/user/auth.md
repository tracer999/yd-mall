# 인증 (로그인/회원가입)

## 1. 개요

- **Base URL:** `/auth`
- **라우트:** `routes/auth.js`
- **전략 설정:** `config/passport.js` (Local + Google/Kakao/Naver)
- **서비스:** `services/auth/` — `authProviders.js`(프로바이더 활성 판정), `profileService.js`(상세정보 정규화·검증·저장), `policyService.js`(약관 버전·동의 이력)
- **뷰:** `views/auth/` — `login.ejs`, `signup_form.ejs`, `signup_finish.ejs`, `signup_success.ejs`, `terms_update.ejs` + partial `_social_buttons.ejs`, `_profile_fields.ejs`, `_terms_agreement.ejs` (모두 `layout: 'layouts/main_layout'`)

가입 경로는 **두 가지**이고, 어느 쪽이든 **주문·배송용 상세정보 + 약관 동의**를 반드시 거칩니다.

| 경로 | 흐름 |
|------|------|
| 간편 가입 (Google/Kakao/Naver) | `/auth/{provider}` → 콜백에서 `users` INSERT(`is_active=0`) → `/auth/signup-finish`(상세정보) → `/auth/signup-success` |
| 자체 가입 (이메일+비밀번호) | `/auth/signup` 한 화면에서 계정 + 상세정보 + 약관 동의 → INSERT(`is_active=1`) → 자동 로그인 → `/auth/signup-success` |

> **핵심 구조:** 두 경로가 **같은 필드 세트**를 쓴다. 화면은 partial `views/auth/_profile_fields.ejs` 하나, 서버는 `services/auth/profileService.js` 하나를 공유한다. 필드를 추가할 때는 partial 의 `name` 속성과 profileService 의 `PROFILE_COLUMNS` 를 **함께** 고쳐야 한다.

### 1.1 전략 등록 조건 (config/passport.js)

- **Local** 전략은 항상 등록됩니다(이메일 + 비밀번호).
- **소셜** 전략은 `services/auth/authProviders.isProviderEnabled(provider)` 가 true 일 때만 등록됩니다 — 조건은 **`{PROVIDER}_CLIENT_ID` + 현재 환경의 콜백 URL**(`NODE_ENV==='production'` → `*_CALLBACK_URL_PROD`, 아니면 `*_CALLBACK_URL_DEV`)입니다.
- 같은 판정 함수를 로그인/가입 화면도 씁니다(`getEnabledProviders()` → `_social_buttons.ejs`). 그래서 **키가 없으면 버튼도 안 뜨고 전략도 없다** — "버튼은 있는데 Unknown strategy 로 죽는" 어긋남이 생기지 않습니다.
- 이 값들은 `.env` 가 아니라 **DB `system_settings`** 에서 주입됩니다(`config/systemSettings.js`). 관리자 &gt; 시스템 설정 &gt; *Google / Kakao / Naver 로그인 설정*.
- 소셜 라우트는 진입 직전 `refreshAuthConfig` 미들웨어로 **설정을 다시 읽고 전략을 재등록**합니다. 관리자가 방금 키를 넣었어도 **앱 재기동 없이** 활성화됩니다(`passport.use` 는 동명 전략을 덮어씀).

### 1.2 계정 생성·병합 규칙 (`findOrCreateSocialUser`)

Google/Kakao/Naver 가 **동일한 함수**를 씁니다.

1. `{provider}_id` 로 조회 → 있으면 `last_login`·`picture` 만 갱신(사용자가 고친 `name` 은 보존).
2. 없으면 `email` 로 조회 → 있으면 그 계정에 `{provider}_id` 를 붙여 **계정 병합**.
3. 둘 다 없으면 신규 INSERT — **`is_active = 0`**, `signup_provider = 'GOOGLE'|'KAKAO'|'NAVER'`. 상세정보를 채워야 활성화됩니다.
4. 프로바이더가 이메일을 주지 않으면 `{provider}_{id}@no-email.com` placeholder 로 저장하고, 추가 정보 화면에서 실제 이메일로 교체합니다(`isPlaceholderEmail`).

---

## 2. 로그인

### GET /auth/login
- 이미 로그인 상태면 `checkAndRedirect`.
- `?redirect=/path` 를 `req.session.returnTo` 에 저장(오픈 리다이렉트 방지: `/` 로 시작 + `//` 아님). 없으면 Referer 로 대체(`/auth` 경로 제외).
- 뷰 `auth/login` — 이메일·비밀번호 폼 + 활성 소셜 버튼 + `/auth/signup` 링크.

### POST /auth/login
- `passport.authenticate('local')` (custom callback). 실패 시 **401 + 같은 화면 재렌더**(이메일 값 유지).
- 소셜 전용 계정(`password_hash IS NULL`)에 비밀번호 로그인을 시도해도 **동일 메시지**('이메일 또는 비밀번호가 올바르지 않습니다')로 처리합니다 — 어떤 이메일이 가입돼 있는지 노출하지 않기 위해.
- 성공 시 `checkAndRedirect`.

---

## 3. 소셜 로그인 (Google / Kakao / Naver)

라우트는 `PROVIDERS` 배열을 돌며 일괄 등록됩니다.

- **GET /auth/{provider}** — `refreshAuthConfig` → `passport.authenticate(provider, { ...옵션, callbackURL })`
  - google: `scope: ['profile','email']` / kakao: `prompt: 'select_account'` / naver: `authType: 'reprompt'`
- **GET /auth/{provider}/callback** — 실패 시 `/auth/login?error=oauth`, 성공 시 `checkAndRedirect`.

### 3.1 카카오 본인확인 재인증 (GET /auth/kakao/reauth)
- 로그인 상태에서만 진입. `req.session.pending_reauth = { user_id, return_to }` 저장 후 카카오 인증 재실행.
- 콜백에서 돌아온 사용자가 같은 `user_id` 가 아니면 `/mypage/profile?reauth=fail`.
- 일치하면 `session.identity_verified = true` + `identity_verified_at` 후 `return_to?verified=1`.

---

## 4. 자체 가입 (GET/POST /auth/signup)

- **GET:** 뷰 `auth/signup_form` — 상단에 간편 가입 버튼, 아래에 이메일 가입폼(비밀번호 → 상세정보 partial → 약관 partial).
- **POST:** 검증 순서 = `validateProfile` + `validatePassword` + 약관 체크 → `checkDuplicates`(이메일·휴대폰).
  - 하나라도 걸리면 **400 + 필드별 에러 메시지**로 재렌더(입력값 보존).
  - 통과 시 트랜잭션으로 `createLocalUser`(bcrypt 10 rounds, `signup_provider='LOCAL'`, `is_active=1`) + `recordAgreements`.
  - 커밋 후 `issueSignupCoupons` → `req.login()` 자동 로그인 → `/auth/signup-success`.
- 비밀번호 정책: **8자 이상 + 영문·숫자 포함**(`profileService.validatePassword`).

---

## 5. 간편 가입 후 상세정보 (GET/POST /auth/signup-finish)

- **GET:** 로그인 필수. 이미 `phone` 이 있으면 `/`. 뷰 `auth/signup_finish` — 자체 가입폼과 **같은 partial** 사용.
  - `needsEmail` = 이메일이 placeholder 인지 여부. 실제 이메일을 이미 가진 소셜 계정은 이메일 입력란 자체가 숨겨집니다.
  - 이름은 소셜 프로필값으로, 수령인명은 그 이름으로 프리필됩니다.
- **POST:** `validateProfile` + 약관 체크 + `checkDuplicates`(자기 자신 제외) → 실패 시 400 재렌더.
  - 통과 시 트랜잭션으로 `completeProfile`(상세정보 + `agreed_*` + **`is_active=1`**; placeholder 였을 때만 `email` 교체) + `recordAgreements`.
  - 커밋 후 `issueSignupCoupons` → `/auth/signup-success`.

### 5.1 상세정보 필드 (`profileService.PROFILE_COLUMNS`)

| 그룹 | 필드 | 필수 |
|------|------|------|
| 기본정보 | `name`, `email`, `birthdate`(YYYYMMDD → YYYY-MM-DD), `gender`(M/F/UNKNOWN) | 성별만 선택 |
| 연락처 | `phone`(숫자만, 중복 불가), `phone_sub` | `phone_sub` 선택 |
| 기본배송지 | `receiver_name`, `zipcode`, `address`, `detailed_address`, `delivery_request` | 요청사항만 선택 |
| 동의 | `terms`(필수), `marketing_agreed`(선택) | — |

### 5.2 중복 확인 API (가입폼·추가정보 공용)

- **POST /auth/phone/check** `{ phone }` → `{ success, message }` (로그인 상태면 자기 자신 제외)
- **POST /auth/email/check** `{ email }` → `{ success, message }`
- 편의 기능일 뿐이고 **최종 판정은 서버 + `users` UNIQUE 제약**(`email`, `phone`, `{provider}_id`)이 합니다.

---

## 6. checkAndRedirect (내부)

1. 비로그인 → `/auth/login`
2. `req.user.phone` 없음 → `/auth/signup-finish` (상세정보 미완)
3. `policyService.needsAgreement()`(미동의 또는 구버전 동의) 또는 `is_active === 0` → `/auth/terms-update`
4. 그 외 → `session.returnTo`(검증 후 제거) 또는 `/`

---

## 7. 가입 완료 (GET /auth/signup-success)

- 로그인 필수. 뷰 `auth/signup_success`.

### 7.1 가입 축하 쿠폰 (`profileService.issueSignupCoupons`)

- 트리거는 **`coupons.issue_method = 'AUTO_SIGNUP' AND status = 'ACTIVE'`** + 유효기간입니다 (`coupon_type = 'NEW_SIGNUP'` 이 **아닙니다** — `coupon_type` 은 목적 라벨로 강등됨).
- 발급은 `services/coupon/couponIssueService.issueCoupon` 이 트랜잭션으로 처리(선착순·유효기간 관장).
- **가입 트랜잭션 밖에서** 호출하고 예외를 삼킵니다 — 쿠폰 실패가 가입을 되돌리면 안 되기 때문.

---

## 8. 약관 재동의 (GET/POST /auth/terms-update)

- **GET:** 현재 시행 약관/개인정보 본문 렌더.
- **POST:** `body.terms` 필수(없으면 400) → `agreed_terms_id`·`agreed_privacy_id`·`is_active=1` 갱신 + 동의 이력 저장 → `/`.

---

## 9. 로그아웃 (GET /auth/logout)

- `req.logout()` 후 `/` 로 리다이렉트.

---

## 10. 관련 스키마 (users)

가입 개편으로 추가된 컬럼 (`scripts/migrate_signup_v2.sql`):

| 컬럼 | 용도 |
|------|------|
| `naver_id` | 네이버 OAuth ID (UNIQUE) |
| `password_hash` | 자체 가입 bcrypt 해시. 소셜 전용 계정은 NULL |
| `signup_provider` | 최초 가입 경로 `LOCAL/GOOGLE/KAKAO/NAVER` |
| `receiver_name`, `phone_sub`, `delivery_request` | 주문·배송용 상세정보 |
| `phone` **UNIQUE** | 동시 요청 레이스로 같은 번호가 두 계정에 들어가는 것을 DB 레벨에서 차단 |

---

*Last Updated: 2026-07-15*
