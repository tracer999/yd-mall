# 예제: 바이브코딩으로 구글 로그인 구현하기

이 문서는 **구글 로그인 기능 하나를 처음부터 끝까지**

- 어떤 순서로 생각하고
- AI에게 무엇을 어떻게 요청하면 되는지

를 "튜토리얼" 형태로 정리한 예제입니다.

> 참고: 이 프로젝트에는 이미 구글 로그인이 구현되어 있습니다.
> 이 문서는 "처음부터 만든다"고 가정하고 설명하지만,
> 실제 코드는 config/passport.js, routes/auth.js, views/auth/login.ejs 에 있으니 비교하며 보면 좋습니다.

---

## 1. 목표 정리 – 최종 모습 상상하기

먼저, 우리가 원하는 결과를 한 문장으로 적어 봅니다.

> "로그인 페이지에 '구글로 로그인' 버튼이 있고,
>  클릭하면 구글 로그인 창이 뜨고,
>  로그인 후에는 이 쇼핑몰에 자동으로 로그인된 상태가 된다."

이 말 그대로를 AI에게 먼저 알려 줍니다.

> "Node.js + Express + MySQL8 + EJS 로 만든 쇼핑몰 프로젝트야.
>  여기에 '구글로 로그인' 버튼을 추가하고 싶어.
>  버튼을 누르면 구글 계정으로 로그인하고, 이 쇼핑몰에 로그인된 상태가 되게 해줘.
>  단계별로 같이 진행하자. 1단계로 전체 흐름을 설명해줘."

AI가 전체 그림(OAuth, 콜백 URL, 세션 등)을 설명해 줄 것입니다. 이해가 100% 안 되어도 괜찮습니다. **지금은 “대략 이런 구조구나” 정도만 잡으면 됩니다.**

---

## 2. 사전 준비 – 필요한 것 체크리스트

구글 로그인을 위해 필요한 것은 크게 3가지입니다.

1. Google Cloud 에서 발급받는 **클라이언트 ID / 시크릿**
2. `.env` 에 저장할 환경 변수
3. `passport` 와 `passport-google-oauth20` 설정

AI에게 이렇게 물어보면, 공식 문서 링크와 함께 상세 단계를 안내해 줍니다.

> "구글 OAuth 로그인을 Express에서 쓰고 싶어.
>  Google Cloud Console 에서 뭘 만들어야 하고, 콜백 URL을 어떻게 설정해야 하는지 자세히 알려줘.
>  이 프로젝트는 개발용은 localhost:3000, 운영은 나중에 도메인이 생길 예정이야."

대략 다음 흐름을 안내받게 됩니다.

- Google Cloud Console 접속 → 프로젝트 생성
- OAuth 동의 화면 구성
- OAuth 클라이언트 ID 생성 (웹 애플리케이션)
- 승인된 리디렉션 URI 에 콜백 URL 등록
  - 개발: `http://localhost:3000/auth/google/callback`
  - 운영: `https://내도메인/auth/google/callback`
- 발급된 **Client ID**, **Client Secret** 복사

---

## 3. .env 설정 – 비밀 정보 숨기기

발급받은 값은 코드에 직접 적지 않고 `.env` 에 넣습니다.

> "이 프로젝트에서 .env 를 사용하고 있어.
>  구글 OAuth 정보(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, 개발/운영 콜백 URL)를 .env 에 어떻게 정의하고, 코드에서는 어떻게 읽어 쓰면 좋을지 예시를 보여줘."

예를 들어 이런 식으로 정리할 수 있습니다.

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL_DEV`
- `GOOGLE_CALLBACK_URL_PROD`

그리고 config/passport.js 에서 `process.env.GOOGLE_CLIENT_ID` 처럼 읽어 사용합니다.

> 주의: `.env` 파일은 깃에 올리지 않습니다. (비밀 유지)

---

## 4. users 테이블에 google_id 컬럼 추가

구글에서 보내 주는 사용자 고유 ID 를 저장할 자리가 필요합니다.

1. mysql 문서에서 PK/FK, 컬럼 타입 개념을 다시 한 번 훑어 보고,
2. AI에게 다음과 같이 요청합니다.

> "MySQL 8 을 사용 중이고, users 테이블이 이미 있어.
>  여기에 구글 로그인용 google_id 컬럼을 추가하고 싶어.
>  구글에서 주는 고유 ID 를 저장하고, 한 사용자는 하나의 google_id 만 갖도록 UNIQUE 제약도 걸고 싶어.
>  ALTER TABLE 문 예시를 만들어줘."

이 SQL 을 실제 DB 에 실행합니다.

---

## 5. Passport 설정 파일(config/passport.js) 만들기/수정하기

이제 본격적으로 Node.js 코드 작업으로 들어갑니다.

### 5-1. 파일 구조 먼저 보여주기

AI가 이 프로젝트 스타일을 이해하도록, 먼저 파일 구조를 설명해 줍니다.

> "이 프로젝트는 config/passport.js 파일 하나에서 모든 Passport 전략을 설정해.
>  이미 로컬 로그인이나 다른 소셜 로그인이 있을 수 있어.
>  여기에서 'google' 전략을 추가하고 싶어.
>  DB 연결은 config/db.js 의 mysql2/promise pool 을 쓰고 있어."

그리고 실제 config/passport.js 내용을 일부 복사해 보여주면 더 정확하게 맞춰 줍니다.

### 5-2. 구글 전략 추가 프롬프트 예시

> "config/passport.js 파일에 Google OAuth 2.0 전략을 추가해줘.
>  `passport-google-oauth20` 패키지를 사용하고,
>  clientID, clientSecret, callbackURL 은 `.env` 의 GOOGLE_* 값을 쓰고 싶어.
>  콜백에서는 다음 순서로 처리해줘.
>  1) users 테이블에서 google_id 로 사용자 조회
>  2) 없으면 email 로 기존 사용자 찾고, 있으면 그 사용자에 google_id 를 업데이트
>  3) 둘 다 없으면 새 사용자 INSERT (기본 권한으로)
>  4) 최종적으로 done(null, user) 호출
>  DB 연결은 config/db.js 의 pool 을 써줘."

이렇게 요청하면, AI가 GoogleStrategy 설정과 함께 전체 코드를 제안해 줍니다.

---

## 6. 인증 라우터(routes/auth.js) 구성하기

이제 **URL과 Passport 전략을 연결**합니다.

### 6-1. 현재 파일 구조 설명

> "routes/auth.js 파일에서 로그인 관련 라우트를 관리하고 있어.
>  이미 /auth/login, /auth/logout 같은 라우트가 있을 수 있어.
>  여기에 구글 로그인 시작(/auth/google)과 콜백(/auth/google/callback) 라우트를 추가하고 싶어."

### 6-2. 프롬프트 예시

> "routes/auth.js 에 다음 라우트를 추가해줘.
>  - GET /google: passport.authenticate('google', { scope: ['profile', 'email'] })
>  - GET /google/callback: passport.authenticate('google', { failureRedirect: '/auth/login' }) 를 거친 뒤, 성공하면 메인 페이지('/') 로 리다이렉트
>  Express Router 를 사용하고 있고, app.js 에서 app.use('/auth', authRoutes) 로 연결되어 있어."

이제 URL 흐름은 다음과 같습니다.

1. 사용자가 /auth/google 접속
2. Passport 가 구글 로그인 페이지로 리다이렉트
3. 로그인 후 구글이 /auth/google/callback 으로 돌려보냄
4. Passport 가 사용자 정보로 로그인 처리 후 세션 생성

---

## 7. app.js 에 Passport 초기화 추가

Passport 를 쓰려면 **세션 설정 다음에 초기화 미들웨어**를 넣어야 합니다.

> "app.js 에서 express-session 으로 세션을 설정한 뒤,
>  passport.initialize(), passport.session() 을 등록하고,
>  require('./config/passport')(passport) 로 아까 만든 설정을 불러와줘.
>  이 프로젝트의 app.js 구조를 고려해서 정확한 위치를 잡아줘."

AI가 app.js 일부를 수정한 코드를 줄 때,

- 세션 미들웨어(app.use(session(...))) 다음에
- passport.initialize() 와 passport.session() 이 오는지

를 꼭 확인합니다.

---

## 8. 로그인 페이지 뷰에 버튼 추가하기

마지막으로 실제 버튼을 추가합니다.

> "views/auth/login.ejs 파일에 '구글로 로그인' 버튼을 추가해줘.
>  버튼을 누르면 /auth/google 로 이동하게 하고,
>  Tailwind CSS 를 사용해서 다른 버튼과 어울리는 스타일로 만들어줘.
>  이 프로젝트의 user 레이아웃을 참고해줘."

버튼이 잘 보인다면, 이제 전체 흐름을 테스트합니다.

1. npm run dev 로 서버 실행
2. /auth/login 접속
3. "구글로 로그인" 버튼 클릭
4. 구글 로그인 → 동의 → 콜백 → 메인 페이지 리다이렉트 확인

에러가 나면, 터미널 로그 또는 브라우저 에러 페이지를 복사해 다음처럼 물어봅니다.

> "방금 /auth/google/callback 에 접속했더니 에러가 났어.
>  에러 메시지는 다음과 같아. (여기에 에러 전문 붙이기)
>  config/passport.js 와 routes/auth.js 를 방금 수정했어.
>  이 에러의 원인과 수정 방법을 알려줘."

---

## 9. 정리 – 구글 로그인 워크플로우 한눈에 보기

1. **목표 정리**: 어떤 화면/흐름이 필요한지 한 줄로 적기
2. **Google Cloud 설정**: 클라이언트 ID/시크릿, 콜백 URL 발급
3. **.env 환경 변수**: 비밀 정보 저장 및 코드에서 읽기
4. **users 테이블 컬럼**: google_id 추가 (ALTER TABLE)
5. **Passport 설정**: config/passport.js 에 Google 전략 추가
6. **인증 라우터**: routes/auth.js 에 /auth/google, /auth/google/callback 구현
7. **app.js 초기화**: 세션 다음에 passport.initialize(), passport.session()
8. **뷰 버튼**: views/auth/login.ejs 에 "구글로 로그인" 버튼 추가
9. **테스트 & 에러 핸들링**: 실제로 눌러 보고 에러를 AI와 함께 해결

이 흐름을 한두 번 따라가 보면, 이후에는 **카카오 로그인, 네이버 로그인 등 다른 소셜 로그인**도 거의 같은 패턴으로 바이브코딩으로 구현할 수 있습니다.

---

## 10. OAuth 2.0 인증 흐름 시각화

### 10-1. 전체 흐름 다이어그램

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│  브라우저  │     │  Express 서버 │     │  Google OAuth │     │  MySQL   │
│  (사용자)  │     │  (우리 서버)  │     │    서버       │     │   DB     │
└─────┬────┘     └──────┬───────┘     └──────┬───────┘     └────┬─────┘
      │                 │                     │                  │
      │ ① "구글로 로그인" │                     │                  │
      │    버튼 클릭      │                     │                  │
      │ GET /auth/google │                     │                  │
      │────────────────>│                     │                  │
      │                 │                     │                  │
      │                 │ ② 구글 로그인 페이지로 │                  │
      │                 │    리다이렉트 (302)   │                  │
      │<─ ─ ─ ─ ─ ─ ─ ─│                     │                  │
      │                 │                     │                  │
      │ ③ 구글 로그인 페이지 표시               │                  │
      │──────────────────────────────────────>│                  │
      │                 │                     │                  │
      │ ④ 사용자가 구글 계정으로 로그인 + 동의   │                  │
      │<──────────────────────────────────────│                  │
      │                 │                     │                  │
      │ ⑤ 인증 코드와 함께│                     │                  │
      │    콜백 URL로 리다이렉트                 │                  │
      │ GET /auth/google/callback?code=xxx    │                  │
      │────────────────>│                     │                  │
      │                 │                     │                  │
      │                 │ ⑥ 인증 코드로          │                  │
      │                 │    액세스 토큰 요청     │                  │
      │                 │────────────────────>│                  │
      │                 │                     │                  │
      │                 │ ⑦ 액세스 토큰 +       │                  │
      │                 │    사용자 프로필 반환   │                  │
      │                 │<────────────────────│                  │
      │                 │                     │                  │
      │                 │ ⑧ 사용자 정보로 DB 조회/생성              │
      │                 │─────────────────────────────────────>│
      │                 │                     │                  │
      │                 │ ⑨ 사용자 정보 반환                      │
      │                 │<─────────────────────────────────────│
      │                 │                     │                  │
      │                 │ ⑩ 세션에 사용자 저장   │                  │
      │                 │    (serialize)       │                  │
      │                 │                     │                  │
      │ ⑪ 메인 페이지로  │                     │                  │
      │    리다이렉트     │                     │                  │
      │<────────────────│                     │                  │
      │                 │                     │                  │
      │ ⑫ 이후 모든 요청에서                     │                  │
      │    세션 쿠키로 로그인 상태 유지            │                  │
      │────────────────>│                     │                  │
      │                 │ ⑬ 세션에서 사용자 복원  │                  │
      │                 │    (deserialize)     │                  │
      │                 │    req.user 사용 가능  │                  │
      │                 │                     │                  │
```

### 10-2. 각 단계 상세 설명

| 단계 | 위치 | 설명 |
|------|------|------|
| ①② | routes/auth.js | `passport.authenticate('google')`이 구글 로그인 페이지로 리다이렉트 |
| ③④ | 구글 서버 | 사용자가 구글 계정으로 로그인하고 정보 제공에 동의 |
| ⑤ | 브라우저 | 구글이 우리 서버의 콜백 URL로 인증 코드와 함께 리다이렉트 |
| ⑥⑦ | Passport 내부 | Passport가 자동으로 인증 코드를 액세스 토큰으로 교환 |
| ⑧⑨ | config/passport.js | GoogleStrategy 콜백에서 DB 조회/생성 |
| ⑩ | Passport 내부 | `serializeUser`로 세션에 사용자 ID 저장 |
| ⑪ | routes/auth.js | 성공 시 메인 페이지로 리다이렉트 |
| ⑫⑬ | 미들웨어 | 이후 요청마다 `deserializeUser`로 사용자 정보 복원 |

---

## 11. 실제 코드 예시 – 각 파일의 완성된 모습

### 11-1. .env 파일

```env
# 구글 OAuth 설정
GOOGLE_CLIENT_ID=123456789-abcdefgh.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdefghijklmnop

# 콜백 URL (개발/운영)
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# 세션
SESSION_SECRET=my-super-secret-key-change-this
```

### 11-2. config/passport.js – 구글 전략 설정

```js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./db');

module.exports = function (passport) {

  // ─── 직렬화: 로그인 성공 시 세션에 저장할 정보 ───
  // 세션에는 최소한의 정보(user.id)만 저장하여 메모리를 절약
  passport.serializeUser((user, done) => {
    done(null, user.id);  // 세션에 user.id만 저장
  });

  // ─── 역직렬화: 매 요청마다 세션에서 사용자 복원 ───
  // 저장된 user.id로 DB에서 전체 사용자 정보를 조회
  passport.deserializeUser(async (id, done) => {
    try {
      const [users] = await pool.query(
        'SELECT id, email, name, role, google_id FROM users WHERE id = ?',
        [id]
      );

      if (users.length === 0) {
        return done(null, false);  // 사용자 없음
      }

      done(null, users[0]);  // req.user에 이 객체가 들어감
    } catch (err) {
      done(err, null);
    }
  });

  // ─── 구글 로그인 전략 등록 ───
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // profile 객체에서 필요한 정보 추출
        const googleId = profile.id;
        const email = profile.emails[0].value;
        const name = profile.displayName;

        // 1단계: google_id로 기존 사용자 찾기
        const [existingByGoogle] = await pool.query(
          'SELECT * FROM users WHERE google_id = ?',
          [googleId]
        );

        if (existingByGoogle.length > 0) {
          // 이미 구글로 가입한 사용자 → 바로 로그인
          return done(null, existingByGoogle[0]);
        }

        // 2단계: email로 기존 사용자 찾기 (로컬 가입 후 구글 연결)
        const [existingByEmail] = await pool.query(
          'SELECT * FROM users WHERE email = ?',
          [email]
        );

        if (existingByEmail.length > 0) {
          // 같은 이메일로 가입한 사용자 존재 → google_id 연결
          await pool.query(
            'UPDATE users SET google_id = ? WHERE id = ?',
            [googleId, existingByEmail[0].id]
          );
          existingByEmail[0].google_id = googleId;
          return done(null, existingByEmail[0]);
        }

        // 3단계: 완전 새 사용자 → INSERT
        const [result] = await pool.query(
          `INSERT INTO users (email, name, google_id, role, created_at)
           VALUES (?, ?, ?, 'user', NOW())`,
          [email, name, googleId]
        );

        const newUser = {
          id: result.insertId,
          email,
          name,
          google_id: googleId,
          role: 'user'
        };

        return done(null, newUser);

      } catch (err) {
        return done(err, null);
      }
    }
  ));
};
```

### 11-3. routes/auth.js – 인증 라우터

```js
const express = require('express');
const router = express.Router();
const passport = require('passport');

// ─── 로그인 페이지 ───
router.get('/login', (req, res) => {
  // 이미 로그인 상태면 메인으로
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }
  res.render('auth/login', {
    layout: 'main_layout',
    title: '로그인'
  });
});

// ─── 구글 로그인 시작 ───
// 이 URL에 접속하면 구글 로그인 페이지로 자동 이동
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email']  // 프로필과 이메일 정보 요청
  })
);

// ─── 구글 로그인 콜백 ───
// 구글에서 인증 후 이 URL로 돌아옴
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/auth/login',    // 실패 시 로그인 페이지로
    failureMessage: true               // 실패 메시지 세션에 저장
  }),
  (req, res) => {
    // 성공 시 메인 페이지로
    res.redirect('/');
  }
);

// ─── 로그아웃 ───
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('로그아웃 에러:', err);
    }
    req.session.destroy();
    res.redirect('/');
  });
});

module.exports = router;
```

### 11-4. views/auth/login.ejs – 로그인 페이지

```ejs
<div class="max-w-md mx-auto mt-20 bg-white rounded-lg shadow-lg p-8">
  <h1 class="text-2xl font-bold text-center mb-8">로그인</h1>

  <!-- 로컬 로그인 폼 -->
  <form action="/auth/login" method="POST" class="space-y-4 mb-6">
    <div>
      <label class="block text-gray-700 font-semibold mb-1">이메일</label>
      <input
        type="email"
        name="email"
        class="w-full px-4 py-2 border rounded focus:outline-none focus:border-blue-500"
        placeholder="이메일 주소"
        required
      >
    </div>
    <div>
      <label class="block text-gray-700 font-semibold mb-1">비밀번호</label>
      <input
        type="password"
        name="password"
        class="w-full px-4 py-2 border rounded focus:outline-none focus:border-blue-500"
        placeholder="비밀번호"
        required
      >
    </div>
    <button
      type="submit"
      class="w-full py-2 bg-blue-500 text-white rounded hover:bg-blue-600 font-semibold"
    >
      로그인
    </button>
  </form>

  <!-- 구분선 -->
  <div class="flex items-center my-6">
    <hr class="flex-1 border-gray-300">
    <span class="px-4 text-gray-500 text-sm">또는</span>
    <hr class="flex-1 border-gray-300">
  </div>

  <!-- 소셜 로그인 버튼들 -->
  <div class="space-y-3">
    <!-- 구글 로그인 버튼 -->
    <a
      href="/auth/google"
      class="w-full flex items-center justify-center gap-3 py-2 px-4 border border-gray-300 rounded hover:bg-gray-50 transition"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      <span class="text-gray-700 font-medium">구글로 로그인</span>
    </a>

    <!-- 카카오 로그인 버튼 (같은 패턴) -->
    <a
      href="/auth/kakao"
      class="w-full flex items-center justify-center gap-3 py-2 px-4 bg-yellow-300 rounded hover:bg-yellow-400 transition"
    >
      <span class="text-lg">💬</span>
      <span class="text-gray-800 font-medium">카카오로 로그인</span>
    </a>
  </div>

  <!-- 회원가입 링크 -->
  <p class="text-center text-gray-600 text-sm mt-6">
    계정이 없으신가요?
    <a href="/auth/register" class="text-blue-500 hover:underline">회원가입</a>
  </p>
</div>
```

---

## 12. 카카오 로그인도 같은 패턴으로 – 소셜 로그인 확장

### 12-1. 구글 vs 카카오 비교표

| 항목 | 구글 | 카카오 |
|------|------|--------|
| npm 패키지 | `passport-google-oauth20` | `passport-kakao` |
| 개발자 콘솔 | Google Cloud Console | Kakao Developers |
| 환경 변수 | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `KAKAO_CLIENT_ID` (REST API 키) |
| 콜백 URL | `/auth/google/callback` | `/auth/kakao/callback` |
| scope | `['profile', 'email']` | 자동 (동의 항목에서 설정) |
| 전략 이름 | `'google'` | `'kakao'` |
| DB 컬럼 | `google_id` | `kakao_id` |

### 12-2. 카카오 전략 추가 (config/passport.js)

```js
const KakaoStrategy = require('passport-kakao').Strategy;

// 구글 전략 아래에 추가
passport.use(new KakaoStrategy({
    clientID: process.env.KAKAO_CLIENT_ID,
    callbackURL: process.env.KAKAO_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const kakaoId = String(profile.id);
      const email = profile._json.kakao_account?.email || null;
      const name = profile.displayName || profile._json.properties?.nickname;

      // 1단계: kakao_id로 찾기
      const [existing] = await pool.query(
        'SELECT * FROM users WHERE kakao_id = ?',
        [kakaoId]
      );

      if (existing.length > 0) {
        return done(null, existing[0]);
      }

      // 2단계: email로 찾기 (email이 있는 경우)
      if (email) {
        const [byEmail] = await pool.query(
          'SELECT * FROM users WHERE email = ?',
          [email]
        );

        if (byEmail.length > 0) {
          await pool.query(
            'UPDATE users SET kakao_id = ? WHERE id = ?',
            [kakaoId, byEmail[0].id]
          );
          return done(null, byEmail[0]);
        }
      }

      // 3단계: 새 사용자 생성
      const [result] = await pool.query(
        `INSERT INTO users (email, name, kakao_id, role, created_at)
         VALUES (?, ?, ?, 'user', NOW())`,
        [email, name, kakaoId]
      );

      return done(null, {
        id: result.insertId,
        email, name,
        kakao_id: kakaoId,
        role: 'user'
      });

    } catch (err) {
      return done(err, null);
    }
  }
));
```

### 12-3. 라우터 추가 (routes/auth.js)

```js
// ─── 카카오 로그인 ───
router.get('/kakao', passport.authenticate('kakao'));

router.get('/kakao/callback',
  passport.authenticate('kakao', {
    failureRedirect: '/auth/login'
  }),
  (req, res) => {
    res.redirect('/');
  }
);
```

패턴이 구글과 **거의 동일**합니다. 이것이 Passport의 강력한 장점입니다.

### 12-4. DB 컬럼 추가

```sql
ALTER TABLE users ADD COLUMN kakao_id VARCHAR(100) UNIQUE DEFAULT NULL;
```

---

## 13. 구글 로그인 흔한 에러 TOP 7

### 에러 1: redirect_uri_mismatch

```
Error 400: redirect_uri_mismatch
The redirect URI in the request does not match the ones authorized for the OAuth client
```

**원인:** Google Cloud Console에 등록한 콜백 URL과 `.env`의 `GOOGLE_CALLBACK_URL`이 다릅니다.

**해결:**
```
Google Console에 등록된 URL: http://localhost:3000/auth/google/callback
.env의 URL:                  http://localhost:3000/auth/google/callback
                              ↑ 정확히 같아야 합니다 (슬래시, 포트 포함)
```

### 에러 2: Failed to serialize user into session

```
Error: Failed to serialize user into session
```

**원인:** `passport.serializeUser()`가 정의되지 않았거나, `done(null, user)` 호출 시 user가 `null`입니다.

**해결:**
```js
// serializeUser가 반드시 정의되어 있는지 확인
passport.serializeUser((user, done) => {
  done(null, user.id);  // user.id가 반드시 존재해야 함
});
```

### 에러 3: Cannot read properties of undefined (reading '0') – profile.emails

```
TypeError: Cannot read properties of undefined (reading '0')
  at Strategy._verify (config/passport.js:42:38)
```

**원인:** 구글 계정에 이메일이 없거나 scope에 `email`이 빠졌습니다.

**해결:**
```js
// scope에 'email' 포함 확인
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email']  // 'email' 반드시 포함!
  })
);

// 안전한 이메일 추출
const email = profile.emails && profile.emails[0]
  ? profile.emails[0].value
  : null;
```

### 에러 4: 로그인 후 세션이 유지되지 않음

**증상:** 구글 로그인 성공 후 메인 페이지에서 다시 비로그인 상태가 됩니다.

**원인:** `passport.session()` 미들웨어 누락 또는 세션 설정 순서 오류

**해결:**
```js
// app.js에서 순서가 중요!
// 1. 세션 설정 먼저
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

// 2. 그 다음 Passport 초기화
app.use(passport.initialize());
app.use(passport.session());  // ← 이 줄이 반드시 있어야 함!

// 3. 그 다음 라우터
app.use('/auth', authRoutes);
```

### 에러 5: 500 에러 – ER_BAD_FIELD_ERROR

```
Error: ER_BAD_FIELD_ERROR: Unknown column 'google_id' in 'field list'
```

**원인:** users 테이블에 `google_id` 컬럼이 아직 없습니다.

**해결:**
```sql
ALTER TABLE users ADD COLUMN google_id VARCHAR(100) UNIQUE DEFAULT NULL;
```

### 에러 6: InternalOAuthError: Failed to obtain access token

```
InternalOAuthError: Failed to obtain access token
```

**원인:** `GOOGLE_CLIENT_SECRET`이 잘못되었거나 만료되었습니다.

**해결:**
1. Google Cloud Console에서 클라이언트 시크릿 재확인
2. `.env` 파일의 값에 공백이나 줄바꿈이 없는지 확인
3. 필요시 새 시크릿 생성

### 에러 7: req.user가 undefined

**증상:** 로그인은 성공하지만 `req.user`가 항상 `undefined`입니다.

**원인:** `deserializeUser`에서 사용자를 찾지 못하거나 에러가 발생

**해결:**
```js
passport.deserializeUser(async (id, done) => {
  try {
    const [users] = await pool.query(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );

    // 디버깅: 여기에 로그 추가
    console.log('deserialize id:', id, 'found:', users.length);

    if (users.length === 0) {
      return done(null, false);
    }

    done(null, users[0]);
  } catch (err) {
    console.error('deserializeUser 에러:', err);
    done(err, null);
  }
});
```

---

## 14. 보안 고려사항

### 14-1. 비밀 정보 관리

```
✅ 올바른 방법                    ❌ 절대 하지 말 것
─────────────────────────────    ─────────────────────────────
.env 파일에 저장                  코드에 직접 작성
.gitignore에 .env 추가           .env를 깃에 커밋
환경 변수로 읽기                  코드 공유 시 시크릿 포함
```

**.gitignore 확인:**
```
# .gitignore에 반드시 포함
.env
```

### 14-2. 프로덕션 환경 필수 설정

```js
// 프로덕션에서는 반드시 HTTPS 사용
// 세션 쿠키 보안 설정
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',  // HTTPS만 허용
    httpOnly: true,   // JavaScript에서 쿠키 접근 차단
    maxAge: 24 * 60 * 60 * 1000  // 24시간
  }
}));
```

### 14-3. 콜백 URL 관리

```env
# 개발 환경
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# 운영 환경 (반드시 HTTPS)
GOOGLE_CALLBACK_URL=https://내도메인.com/auth/google/callback
```

### 14-4. 사용자 데이터 최소 수집

```js
// 필요한 최소한의 정보만 요청
passport.authenticate('google', {
  scope: ['profile', 'email']  // 필요한 것만!
  // scope: ['profile', 'email', 'https://www.googleapis.com/auth/contacts']
  // ← 불필요한 권한 요청 금지
})
```

---

## 15. 세션과 Passport 직렬화 이해하기

### 15-1. 직렬화(Serialize)와 역직렬화(Deserialize) 시각화

```
로그인 성공 시 (직렬화 - serializeUser):
─────────────────────────────────────────
사용자 객체         세션 저장소
{                   ┌─────────────────┐
  id: 42,           │ session_id: abc │
  email: 'a@b.com', │ user_id: 42     │ ← id만 저장!
  name: '홍길동',    └─────────────────┘
  role: 'user'
}
  ↓
serializeUser(user, done) {
  done(null, user.id);  // 42만 세션에 저장
}


이후 매 요청마다 (역직렬화 - deserializeUser):
─────────────────────────────────────────
세션 저장소           DB 조회              req.user
┌─────────────┐     SELECT * FROM       {
│ user_id: 42 │ →   users WHERE       →   id: 42,
└─────────────┘     id = 42               email: 'a@b.com',
                                          name: '홍길동',
                                          role: 'user'
                                        }
  ↓
deserializeUser(id, done) {
  // id = 42
  const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  done(null, users[0]);  // → req.user에 들어감
}
```

### 15-2. req.user와 req.isAuthenticated()

```js
// 미들웨어에서 로그인 상태 확인
app.use((req, res, next) => {
  // req.isAuthenticated() → true/false
  // req.user → 로그인된 사용자 객체 또는 undefined

  // EJS에서 사용할 수 있도록 전달
  res.locals.user = req.user || null;
  res.locals.isAuthenticated = req.isAuthenticated();
  next();
});
```

```ejs
<!-- views/layouts/main_layout.ejs 에서 -->
<% if (isAuthenticated) { %>
  <span>환영합니다, <%= user.name %>님!</span>
  <a href="/auth/logout">로그아웃</a>
<% } else { %>
  <a href="/auth/login">로그인</a>
<% } %>
```

### 15-3. 왜 Serialize/Deserialize를 나누는가

```
전체 사용자 정보를 세션에 저장하면?
─────────────────────────────
문제: 세션 크기가 커짐 (메모리 낭비)
문제: 사용자 정보 변경 시 세션이 구 데이터를 가지고 있음
문제: 여러 세션에 같은 데이터가 중복 저장됨

ID만 세션에 저장하면?
─────────────────────────────
장점: 세션 크기가 작음 (숫자 하나)
장점: 매 요청마다 DB에서 최신 정보를 가져옴
장점: 사용자 정보 변경이 즉시 반영됨
단점: 매 요청마다 DB 쿼리 1회 (하지만 PK 조회라 매우 빠름)
```

---

## 16. 테스트 체크리스트

### 16-1. 최초 구글 로그인 (신규 사용자)

| 단계 | 확인 항목 | 예상 결과 |
|------|----------|----------|
| 1 | /auth/login 접속 | 로그인 페이지 표시, 구글 버튼 보임 |
| 2 | "구글로 로그인" 클릭 | 구글 로그인 페이지로 이동 |
| 3 | 구글 계정 로그인 | 동의 화면 표시 |
| 4 | 동의 클릭 | 메인 페이지로 리다이렉트 |
| 5 | 헤더에 이름 표시 | "환영합니다, OOO님!" |
| 6 | DB 확인 | users 테이블에 새 레코드, google_id 채워짐 |

### 16-2. 재로그인 (기존 사용자)

| 단계 | 확인 항목 | 예상 결과 |
|------|----------|----------|
| 1 | 로그아웃 후 재로그인 | 같은 사용자로 로그인됨 |
| 2 | DB 확인 | 새 레코드 생성 안 됨 (기존 레코드 사용) |

### 16-3. 이메일 충돌 테스트

| 단계 | 확인 항목 | 예상 결과 |
|------|----------|----------|
| 1 | 같은 이메일로 먼저 로컬 회원가입 | 정상 가입 |
| 2 | 같은 이메일의 구글로 로그인 | 기존 계정에 google_id 연결 |
| 3 | DB 확인 | 하나의 레코드에 google_id 추가됨 |

### 16-4. 세션 테스트

| 항목 | 예상 결과 |
|------|----------|
| 브라우저 종료 후 재접속 | 세션 설정에 따라 로그인 유지 또는 만료 |
| 다른 브라우저에서 동시 접속 | 각각 독립 세션 |
| /auth/logout 클릭 | 즉시 로그아웃, 세션 삭제 |

### 16-5. 에러 처리 테스트

| 항목 | 예상 결과 |
|------|----------|
| 구글 동의 화면에서 "취소" | /auth/login으로 리다이렉트 |
| 잘못된 콜백 URL 접근 | 에러 페이지 또는 로그인 페이지 |
| DB 연결 끊김 시 로그인 시도 | 에러 핸들러로 이동, 500 페이지 |

---

## 17. FAQ – 자주 묻는 질문들

### Q1: 로컬 로그인과 구글 로그인을 둘 다 쓸 수 있나요?

**A:** 네, 가능합니다. Passport는 여러 전략을 동시에 사용할 수 있습니다. 같은 이메일로 로컬 가입한 사용자가 나중에 구글 로그인하면, `google_id`를 기존 계정에 연결하면 됩니다 (11-2 코드의 2단계 참고).

### Q2: 구글 프로필 사진을 가져오려면?

**A:** `profile.photos` 배열에서 가져올 수 있습니다.

```js
const profileImage = profile.photos && profile.photos[0]
  ? profile.photos[0].value
  : '/images/default-avatar.png';

// DB에 저장
await pool.query(
  'UPDATE users SET profile_image = ? WHERE id = ?',
  [profileImage, userId]
);
```

### Q3: 테스트 환경에서 실제 구글 계정 없이 테스트할 수 있나요?

**A:** 완전한 자동 테스트는 어렵지만, 두 가지 방법이 있습니다.

1. **개인 구글 계정 사용** (개발 중 가장 쉬움)
2. **Passport mock 테스트:** 콜백 함수만 별도로 테스트

```js
// 콜백 함수만 따로 테스트
const verifyCallback = require('./config/passport').googleCallback;
// 가짜 profile 객체로 테스트 가능
```

### Q4: 구글 로그인 시 추가 정보(전화번호 등)를 받으려면?

**A:** 구글 로그인 후 **추가 정보 입력 페이지**로 안내하는 것이 일반적입니다.

```js
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth/login' }),
  (req, res) => {
    // 전화번호가 없으면 추가 정보 입력 페이지로
    if (!req.user.phone) {
      return res.redirect('/auth/complete-profile');
    }
    res.redirect('/');
  }
);
```

### Q5: 운영 서버에 배포할 때 바꿔야 할 것은?

**A:** 다음 3가지를 변경합니다:

1. `.env`의 `GOOGLE_CALLBACK_URL`을 실제 도메인으로
2. Google Cloud Console의 승인된 리디렉션 URI에 운영 URL 추가
3. 세션 쿠키에 `secure: true` 설정 (HTTPS 필수)

### Q6: 구글 로그인 버튼 디자인 가이드라인이 있나요?

**A:** Google에서 공식 디자인 가이드라인을 제공합니다. 핵심 규칙:
- 구글 로고(G) 사용
- "Sign in with Google" 또는 "구글로 로그인" 텍스트
- 충분한 크기와 대비

이 프로젝트의 예시 코드(11-4)가 이 가이드라인을 따르고 있습니다.

### Q7: 여러 소셜 로그인을 같은 이메일로 연결하려면?

**A:** 이메일을 기준으로 통합합니다.

```js
// 어떤 소셜 로그인이든 같은 패턴:
// 1. 소셜 ID로 찾기
// 2. 없으면 이메일로 찾기 → 있으면 연결
// 3. 둘 다 없으면 새로 생성

// users 테이블 구조:
// id | email | name | google_id | kakao_id | naver_id | ...
```

### Q8: 로그인 성공/실패 시 메시지를 보여주려면?

**A:** `connect-flash` 패키지를 사용합니다.

```bash
npm install connect-flash
```

```js
// app.js
const flash = require('connect-flash');
app.use(flash());

// 미들웨어로 플래시 메시지를 뷰에 전달
app.use((req, res, next) => {
  res.locals.successMsg = req.flash('success');
  res.locals.errorMsg = req.flash('error');
  next();
});

// routes/auth.js
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/auth/login',
    failureFlash: '구글 로그인에 실패했습니다.'
  }),
  (req, res) => {
    req.flash('success', '로그인 성공!');
    res.redirect('/');
  }
);
```

---

## 18. 전체 흐름 요약 및 다음 단계

### 구글 로그인 구현 전체 요약

1. **목표 정리**: 어떤 화면/흐름이 필요한지 한 줄로 적기
2. **Google Cloud 설정**: 클라이언트 ID/시크릿, 콜백 URL 발급
3. **.env 환경 변수**: 비밀 정보 저장 및 코드에서 읽기
4. **users 테이블 컬럼**: google_id 추가 (ALTER TABLE)
5. **Passport 설정**: config/passport.js 에 Google 전략 추가
6. **인증 라우터**: routes/auth.js 에 /auth/google, /auth/google/callback 구현
7. **app.js 초기화**: 세션 다음에 passport.initialize(), passport.session()
8. **뷰 버튼**: views/auth/login.ejs 에 "구글로 로그인" 버튼 추가
9. **테스트 & 에러 핸들링**: 실제로 눌러 보고 에러를 AI와 함께 해결

### 다음 단계

이 문서를 마쳤다면 다음 문서를 참고하세요:

| 다음 학습 | 문서 | 설명 |
|-----------|------|------|
| 같은 패턴으로 다른 기능 만들기 | [example_notice.md](example_notice) | 공지사항 CRUD 구현 예제 |
| 전체 개발 워크플로우 이해 | [workflow.md](workflow) | 기획→DB→코드→테스트 흐름 |
| MVC 패턴 심화 | [mvc.md](mvc) | 라우터→컨트롤러→뷰 관계 이해 |
| DB 작업 심화 | [mysql.md](mysql) | SQL 쿼리 작성, JOIN, 보안 |
| 바이브코딩 프롬프트 기술 | [vibe_coding.md](vibe_coding) | AI에게 효과적으로 요청하는 방법 |
