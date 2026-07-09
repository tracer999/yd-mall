# 예제: 간단 Express 로그인 & REST API 맛보기

이 문서는 **DB 없이** 순수 Express + EJS + 간단 CSS만으로

1. 먼저 **두 화면짜리 초간단 로그인**을 만들고
2. 그 다음 같은 로그인을 **REST API 방식으로 바꿔 보는** 실습

을 통해, Express 기본 구조와 API 개념을 한 번에 맛보는 예제입니다.

> 이 예제는 실제 쇼핑몰 프로젝트와는 **분리된, 최소 연습용 프로젝트**라고 가정합니다.
> 폴더 구조, 라우터/컨트롤러/뷰 개념은 본 프로젝트와 거의 같기 때문에,
> 여기서 감을 잡고 나면 쇼핑몰 코드도 훨씬 이해하기 쉬워집니다.

---

# Part 1. 두 화면짜리 초간단 로그인 만들기

---

## 1. 목표 정리 – 두 화면이면 충분하다

우리가 만들고 싶은 것은 아주 단순합니다.

1. **로그인 화면** (GET `/login`)
   - 아이디, 비밀번호를 입력하는 폼이 있음
2. **로그인 결과 화면** (POST `/login`)
   - 아이디/비밀번호가 맞으면 "OOO님, 로그인 성공" 화면
   - 틀리면 다시 로그인 폼 + 에러 메시지

여기서 중요한 포인트는:

- DB 연결이 **전혀 없음** → 서버 코드 안에 상수로 아이디/비밀번호를 저장
- **Express + Router + Controller + EJS 뷰** 구조를 그대로 사용
- CSS는 한 파일만 두고, 아주 간단한 스타일만 적용

이 작은 예제가 이해되면, 실제 쇼핑몰에서

```text
브라우저 → Express(app.js) → 라우터(routes/) → 컨트롤러(controllers/) → 뷰(views/)
```

라는 흐름이 어떻게 동작하는지 훨씬 선명해집니다.

---

## 2. 연습용 최소 폴더 구조

별도 연습용 폴더를 하나 만든다고 가정하면, 구조는 다음과 같습니다.

```text
simple-express-login/
  app.js               # Express 서버 진입점
  package.json         # 의존성 정보 (express, ejs 등)
  public/
    css/
      style.css        # 아주 간단한 CSS
  routes/
    auth.js            # 로그인 관련 라우터
  controllers/
    authController.js  # 로그인 로직
  views/
    layouts/
      main.ejs         # 공통 레이아웃 (header, body, footer)
    auth/
      login.ejs        # 로그인 폼 화면
      welcome.ejs      # 로그인 성공 화면
```

> 실제 쇼핑몰 프로젝트에서도 `routes/`, `controllers/`, `views/`, `public/` 구조를 사용합니다.
> 이 예제는 그 구조를 **극도로 단순화한 버전**이라고 보면 됩니다.

---

## 3. Step 1 – app.js: Express 앱 기본 설정

먼저 서버의 진입점인 `app.js` 를 만듭니다.

```js
// app.js
const path = require('path');
const express = require('express');

const app = express();
const PORT = 3000;

// 1) 뷰 엔진(EJS) 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 2) 정적 파일(css 등) 제공
app.use(express.static(path.join(__dirname, 'public')));

// 3) POST 폼 데이터 파싱
app.use(express.urlencoded({ extended: true }));

// 4) 라우터 연결
const authRouter = require('./routes/auth');
app.use('/', authRouter); // /login, /welcome 등을 여기서 처리

// 5) 서버 시작
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
```

**한 줄 요약**

- `app.js` 는 이 작은 프로젝트의 **app.js (진입점)** 역할
- EJS, 정적 파일, 바디 파서, 라우터 연결이라는 Express 기본 패턴을 한 번에 보여 줍니다.

---

## 4. Step 2 – 컨트롤러와 라우터로 로그인 로직 나누기

### 4-1. 컨트롤러: authController.js

이 예제에서는 **하드코딩된 계정 1개**만 인정한다고 가정합니다.

```js
// controllers/authController.js
const VALID_USER = {
  id: 'testuser',
  password: '1234',
  name: '테스트 사용자'
};

// GET /login - 로그인 폼 보여주기
exports.showLoginForm = (req, res) => {
  res.render('auth/login', {
    title: '로그인',
    errorMessage: null
  });
};

// POST /login - 로그인 처리
exports.handleLogin = (req, res) => {
  const { userId, password } = req.body;

  if (userId === VALID_USER.id && password === VALID_USER.password) {
    // 로그인 성공 → 환영 화면 렌더링
    return res.render('auth/welcome', {
      title: '로그인 성공',
      name: VALID_USER.name
    });
  }

  // 로그인 실패 → 에러 메시지와 함께 로그인 폼으로 되돌리기
  res.status(401).render('auth/login', {
    title: '로그인',
    errorMessage: '아이디 또는 비밀번호가 올바르지 않습니다.'
  });
};
```

**포인트**

- 실제 프로젝트라면 `VALID_USER` 대신 **DB 조회**를 하겠지만,
  여기서는 구조만 연습하기 위해 상수를 사용합니다.
- Express 컨트롤러 함수는 항상 `req`, `res` (그리고 필요하면 `next`)를 인자로 받습니다.
- `res.render('뷰경로', 데이터)` 로 EJS에 데이터를 넘깁니다.

### 4-2. 라우터: routes/auth.js

라우터는 **URL → 컨트롤러 함수**를 연결하는 역할을 합니다.

```js
// routes/auth.js
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');

// 로그인 폼
router.get('/login', authController.showLoginForm);

// 로그인 처리
router.post('/login', authController.handleLogin);

// 단순 환영 페이지 (직접 들어가 보고 싶을 때)
router.get('/welcome', (req, res) => {
  res.render('auth/welcome', { title: '환영합니다', name: '게스트' });
});

module.exports = router;
```

**한 줄 요약**

- `/login` 이라는 URL이 들어오면, Express는 `routes/auth.js` → `controllers/authController.js` 순서로
  코드를 찾아가서 실행합니다.

---

## 5. Step 3 – 레이아웃과 두 개의 EJS 화면 만들기

### 5-1. 공통 레이아웃: views/layouts/main.ejs

```ejs
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= title || '간단 로그인 예제' %></title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header class="site-header">
    <h1 class="site-title">간단 Express 로그인 연습</h1>
  </header>

  <main class="site-main">
    <%- body %>
  </main>

  <footer class="site-footer">
    <small>&copy; 연습 프로젝트</small>
  </footer>
</body>
</html>
```

> 실제 쇼핑몰 프로젝트에서도 `layouts/` 폴더 아래에
> `main_layout.ejs`, `admin_layout.ejs` 같은 레이아웃이 있고,
> 각 페이지는 그 안의 `body` 영역만 채우는 방식입니다.

### 5-2. 로그인 폼: views/auth/login.ejs

```ejs
<% layout('layouts/main') %>

<section class="card">
  <h2 class="card-title">로그인</h2>

  <% if (errorMessage) { %>
    <p class="error"><%= errorMessage %></p>
  <% } %>

  <form action="/login" method="post" class="form">
    <div class="form-group">
      <label for="userId">아이디</label>
      <input type="text" id="userId" name="userId" required>
    </div>

    <div class="form-group">
      <label for="password">비밀번호</label>
      <input type="password" id="password" name="password" required>
    </div>

    <button type="submit" class="btn-primary">로그인</button>
  </form>
</section>
```

### 5-3. 로그인 성공 화면: views/auth/welcome.ejs

```ejs
<% layout('layouts/main') %>

<section class="card">
  <h2 class="card-title">로그인 성공</h2>
  <p><strong><%= name %></strong> 님, 환영합니다!</p>

  <a href="/login" class="btn-secondary">다시 로그인하기</a>
</section>
```

**뷰에서의 데이터 흐름**

- 컨트롤러에서 `res.render('auth/welcome', { name: '테스트 사용자' })` 처럼 넘기면
- EJS에서는 `<%= name %>` 으로 그 값을 표시합니다.

---

## 6. Step 4 – 아주 간단한 CSS: public/css/style.css

디자인은 중요한 포인트가 아니므로, 최소한의 스타일만 추가합니다.

```css
/* public/css/style.css */
body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  background-color: #f4f4f5;
  margin: 0;
}

.site-header,
.site-footer {
  background: #111827;
  color: #f9fafb;
  padding: 1rem 2rem;
}

.site-main {
  max-width: 480px;
  margin: 2rem auto;
  padding: 0 1rem;
}

.card {
  background: white;
  border-radius: 0.5rem;
  padding: 1.5rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

.card-title {
  margin-bottom: 1rem;
  font-size: 1.25rem;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

input[type="text"],
input[type="password"] {
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid #d1d5db;
}

.btn-primary,
.btn-secondary {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  text-decoration: none;
  border: none;
  cursor: pointer;
  font-weight: 600;
}

.btn-primary {
  background: #2563eb;
  color: white;
}

.btn-secondary {
  background: #e5e7eb;
  color: #111827;
}

.error {
  color: #b91c1c;
  margin-bottom: 0.5rem;
}
```

---

## 7. 여기까지 흐름 정리 – Part 1 완성!

정리하면, 이 작은 프로젝트에서 요청이 흐르는 경로는 다음과 같습니다.

```text
브라우저 (GET /login)
   ↓
Express app.js
   ↓  app.use('/', authRouter)
routes/auth.js (router.get('/login', ...))
   ↓
controllers/authController.showLoginForm
   ↓  res.render('auth/login', { ... })
views/layouts/main.ejs + views/auth/login.ejs
   ↓
완성된 HTML 이 브라우저로 응답
```

로그인 시도 시에는:

```text
브라우저 (POST /login, 폼 데이터)
   ↓
Express app.js (body 파싱)
   ↓
routes/auth.js (router.post('/login', ...))
   ↓
controllers/authController.handleLogin
   ↓
  - 성공: views/auth/welcome.ejs 렌더링
  - 실패: views/auth/login.ejs 를 에러 메시지와 함께 다시 렌더링
```

이것이 **"EJS 기반 서버 사이드 렌더링(SSR)"** 의 전형적인 흐름입니다.

**축하합니다!** 여기까지 하면 두 화면짜리 로그인이 완성됩니다.
브라우저에서 `http://localhost:3000/login` 으로 접속하면, 폼에 아이디/비밀번호를 넣고 로그인을 시도할 수 있습니다.

---

# Part 2. 같은 로그인을 REST API 방식으로 바꿔 보기

---

## 8. REST API란? – 왜 바꾸는 걸까

Part 1에서 만든 로그인은 잘 동작합니다. 그런데 한 가지 한계가 있습니다.

- 폼을 제출(POST)하면 **서버가 HTML을 통째로 만들어서 돌려줍니다**.
- 즉, "화면을 그리는 일"도 **서버가** 합니다.

만약 **모바일 앱**이나 **React/Vue 같은 SPA 프론트엔드**에서도 같은 로그인을 쓰고 싶다면?
이 클라이언트들은 서버가 준 HTML을 쓰지 않고, **자기 화면을 직접** 그립니다.
그래서 서버에게는 HTML 대신 **데이터(JSON)만** 달라고 요청합니다.

> **REST API** 는
> - URL로 "무엇(자원, Resource)을 다루는지" 표현하고
> - HTTP 메서드(GET, POST, PUT, DELETE 등)로 "무엇을 하려는지" 표현하며
> - 응답을 **JSON 형식**으로 돌려주는,
> - 서버와 클라이언트 간 통신 규칙입니다.

간단한 예시:

- `GET /api/products` → 상품 목록 조회
- `POST /api/products` → 새 상품 생성
- `GET /api/products/123` → 123번 상품 상세 조회
- `PUT /api/products/123` → 123번 상품 전체 수정
- `DELETE /api/products/123` → 123번 상품 삭제

이제 Part 1의 로그인을 REST API 방식으로 **바꿔 봅시다**.

---

## 9. 바꿔야 할 것 – 전체 그림 먼저 보기

Part 1 로그인을 REST API로 바꾸려면, **세 군데**를 수정해야 합니다.

```text
                  Part 1 (SSR)                     Part 2 (REST API)
                  ──────────                        ──────────────────
컨트롤러         res.render(HTML)                →  res.json(JSON)
라우터           POST /login (폼 데이터)          →  POST /api/login (JSON 데이터)
뷰(EJS)          <form> 으로 폼 제출              →  fetch() 로 JSON 전송
app.js           urlencoded 파서만                →  JSON 파서 추가 + API 라우터 연결
```

하나씩 바꿔 보겠습니다.

---

## 10. Step 5 – 컨트롤러 바꾸기: res.render → res.json

### 10-1. 바꾸기 전 (Part 1) – authController.js

```js
// controllers/authController.js (Part 1 – SSR 버전)
exports.handleLogin = (req, res) => {
  const { userId, password } = req.body;

  if (userId === VALID_USER.id && password === VALID_USER.password) {
    return res.render('auth/welcome', {       // ← HTML 화면을 만들어서 응답
      title: '로그인 성공',
      name: VALID_USER.name
    });
  }

  res.status(401).render('auth/login', {      // ← 에러 화면을 만들어서 응답
    title: '로그인',
    errorMessage: '아이디 또는 비밀번호가 올바르지 않습니다.'
  });
};
```

### 10-2. 바꾼 후 (Part 2) – authApiController.js

```js
// controllers/authApiController.js (Part 2 – REST API 버전)
const VALID_USER = {
  id: 'testuser',
  password: '1234',
  name: '테스트 사용자'
};

// POST /api/login
exports.login = (req, res) => {
  const { userId, password } = req.body;

  if (userId === VALID_USER.id && password === VALID_USER.password) {
    return res.json({                         // ← JSON 데이터만 응답
      success: true,
      name: VALID_USER.name
    });
  }

  res.status(401).json({                      // ← JSON 에러 메시지만 응답
    success: false,
    message: '아이디 또는 비밀번호가 올바르지 않습니다.'
  });
};
```

**무엇이 달라졌나?**

| 항목 | Part 1 (SSR) | Part 2 (REST API) |
|------|-------------|------------------|
| 응답 방식 | `res.render('뷰파일', 데이터)` | `res.json(데이터)` |
| 응답 내용 | 완성된 HTML | JSON 데이터 |
| 화면을 누가 그리나 | **서버**가 EJS로 그림 | **클라이언트**가 JSON을 받아서 그림 |

핵심 변화는 딱 하나입니다: **`res.render()` → `res.json()`**

---

## 11. Step 6 – 라우터 바꾸기: 폼 POST → API POST

### 11-1. 바꾸기 전 (Part 1) – routes/auth.js

```js
// routes/auth.js (Part 1 – SSR 버전)
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.get('/login', authController.showLoginForm);   // 폼 화면
router.post('/login', authController.handleLogin);     // 폼 제출 처리

module.exports = router;
```

### 11-2. 바꾼 후 (Part 2) – routes/api.js (새 파일)

```js
// routes/api.js (Part 2 – REST API 버전)
const express = require('express');
const router = express.Router();
const authApiController = require('../controllers/authApiController');

router.post('/login', authApiController.login);   // JSON 요청 처리

module.exports = router;
```

**무엇이 달라졌나?**

| 항목 | Part 1 (SSR) | Part 2 (REST API) |
|------|-------------|------------------|
| 파일 | `routes/auth.js` | `routes/api.js` (새 파일) |
| GET /login | 로그인 폼 화면을 보여줌 | 없음 (화면은 클라이언트가 알아서 만듦) |
| POST 경로 | `/login` (폼 데이터) | `/api/login` (JSON 데이터) |

> REST API에서는 **`GET /login`(폼 화면 보여주기)이 필요 없습니다**.
> 화면은 클라이언트(브라우저, 앱)가 직접 만들고,
> 서버는 데이터만 주고받으면 되기 때문입니다.

---

## 12. Step 7 – 뷰(EJS) 바꾸기: form 제출 → fetch()

### 12-1. 바꾸기 전 (Part 1) – login.ejs

Part 1에서는 `<form>` 태그의 `action`과 `method`로 POST 요청을 보냈습니다.

```ejs
<!-- views/auth/login.ejs (Part 1 – 전통적 폼 제출) -->
<form action="/login" method="post" class="form">
  <div class="form-group">
    <label for="userId">아이디</label>
    <input type="text" id="userId" name="userId" required>
  </div>
  <div class="form-group">
    <label for="password">비밀번호</label>
    <input type="password" id="password" name="password" required>
  </div>
  <button type="submit" class="btn-primary">로그인</button>
</form>
```

폼을 제출하면 **페이지 전체가 새로고침**되면서 서버가 보내준 HTML로 화면이 바뀌었습니다.

### 12-2. 바꾼 후 (Part 2) – login.ejs

REST API 방식에서는 `<form>` 의 기본 제출을 막고, **JavaScript의 `fetch()`** 로 JSON 요청을 보냅니다.

```ejs
<!-- views/auth/login.ejs (Part 2 – fetch()로 API 호출) -->
<% layout('layouts/main') %>

<section class="card">
  <h2 class="card-title">로그인</h2>

  <p id="errorMsg" class="error" style="display:none;"></p>

  <form id="loginForm" class="form">
    <div class="form-group">
      <label for="userId">아이디</label>
      <input type="text" id="userId" name="userId" required>
    </div>

    <div class="form-group">
      <label for="password">비밀번호</label>
      <input type="password" id="password" name="password" required>
    </div>

    <button type="submit" class="btn-primary">로그인</button>
  </form>
</section>

<script>
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();   // ← 폼의 기본 제출(페이지 이동)을 막음

    const userId = document.getElementById('userId').value;
    const password = document.getElementById('password').value;

    // REST API 에 JSON 으로 요청
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password })
    });

    const data = await response.json();

    if (data.success) {
      // 성공 → 환영 화면으로 이동 (클라이언트가 직접 이동)
      document.querySelector('.card').innerHTML =
        '<h2 class="card-title">로그인 성공</h2>' +
        '<p><strong>' + data.name + '</strong> 님, 환영합니다!</p>' +
        '<a href="/login" class="btn-secondary">다시 로그인하기</a>';
    } else {
      // 실패 → 에러 메시지 표시 (페이지 새로고침 없이!)
      const errorMsg = document.getElementById('errorMsg');
      errorMsg.textContent = data.message;
      errorMsg.style.display = 'block';
    }
  });
</script>
```

**무엇이 달라졌나?**

| 항목 | Part 1 (SSR) | Part 2 (REST API) |
|------|-------------|------------------|
| 폼 제출 | `<form action="/login" method="post">` | `fetch('/api/login', { method: 'POST', ... })` |
| 데이터 형식 | 폼 데이터 (key=value) | JSON (`{ userId, password }`) |
| 화면 갱신 | **페이지 전체 새로고침** | **새로고침 없이** 부분 갱신 |
| 에러 표시 | 서버가 새 HTML을 보내줌 | JavaScript가 에러 메시지만 표시 |
| 성공 처리 | 서버가 welcome.ejs를 렌더링 | JavaScript가 화면을 직접 바꿈 |

> 핵심: REST API 방식에서는 **"페이지가 깜빡이지 않는다"**.
> 서버는 JSON만 보내주고, 화면 변경은 **클라이언트(브라우저)의 JavaScript**가 담당합니다.

---

## 13. Step 8 – app.js 수정: API 라우터 연결

마지막으로 app.js에 API 라우터를 추가합니다.

### 13-1. 바꾸기 전 (Part 1)

```js
// app.js (Part 1)
app.use(express.urlencoded({ extended: true }));

const authRouter = require('./routes/auth');
app.use('/', authRouter);
```

### 13-2. 바꾼 후 (Part 2)

```js
// app.js (Part 2 – API 라우터 추가)
app.use(express.urlencoded({ extended: true })); // 폼 요청 파싱 (기존 유지)
app.use(express.json());                          // ← 추가! JSON 요청 파싱 (API용)

const authRouter = require('./routes/auth');
const apiRouter = require('./routes/api');         // ← 추가! API 라우터

app.use('/', authRouter);      // HTML 로그인 화면 (기존 유지)
app.use('/api', apiRouter);    // ← 추가! /api/login 같은 API 요청
```

**추가된 것 두 가지:**

1. `express.json()` – 클라이언트가 보내는 JSON을 파싱
2. `app.use('/api', apiRouter)` – `/api`로 시작하는 요청을 API 라우터로 보냄

---

## 14. 바꾼 후의 폴더 구조

REST API를 추가한 뒤의 전체 폴더 구조입니다.
**굵게** 표시된 항목이 Part 2에서 **추가/수정**된 파일입니다.

```text
simple-express-login/
  app.js                      # ← 수정: express.json() + API 라우터 연결 추가
  package.json
  public/
    css/
      style.css
  routes/
    auth.js                   # 기존 유지 (SSR 라우터)
    api.js                    # ← 새로 추가 (API 라우터)
  controllers/
    authController.js         # 기존 유지 (SSR 컨트롤러)
    authApiController.js      # ← 새로 추가 (API 컨트롤러)
  views/
    layouts/
      main.ejs
    auth/
      login.ejs               # ← 수정: fetch() 추가
      welcome.ejs              # 기존 유지 (SSR에서 직접 접근 시 사용)
```

---

## 15. 바꾼 후 흐름 정리 – Part 1 vs Part 2 비교

### Part 1 흐름 (SSR – 서버가 화면을 만들어 줌)

```text
브라우저                        서버
───────                        ─────
GET /login   ──────────────→   auth.js → authController.showLoginForm
                                          → res.render('auth/login')
             ←──────────────   완성된 HTML (로그인 폼)

폼 제출 (POST /login)  ────→   auth.js → authController.handleLogin
                                          → res.render('auth/welcome')
             ←──────────────   완성된 HTML (환영 화면)
```

### Part 2 흐름 (REST API – 서버는 데이터만, 화면은 클라이언트가)

```text
브라우저                        서버
───────                        ─────
GET /login   ──────────────→   auth.js → 로그인 폼 화면 (기존 SSR)
             ←──────────────   HTML (login.ejs + fetch 스크립트 포함)

fetch('/api/login', JSON)  →   api.js → authApiController.login
                                          → res.json({ success, name })
             ←──────────────   JSON 데이터만 응답

JavaScript가 JSON을 받아서
화면을 직접 업데이트                (서버는 관여 안 함)
```

> **Part 2 의 핵심**: 로그인을 시도할 때 페이지가 새로고침되지 않습니다.
> 브라우저의 JavaScript가 API에서 JSON을 받아서 화면을 직접 바꿉니다.

---

## 16. curl 로 API 직접 테스트하기

REST API는 브라우저 화면이 없어도, **터미널에서 바로 테스트**할 수 있습니다.

```bash
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"userId":"testuser","password":"1234"}'
```

성공 시:

```json
{ "success": true, "name": "테스트 사용자" }
```

실패 시:

```json
{ "success": false, "message": "아이디 또는 비밀번호가 올바르지 않습니다." }
```

> 이것이 REST API의 장점입니다.
> 웹 브라우저, 모바일 앱, 터미널, 다른 서버 등 **어떤 클라이언트**든
> 같은 방식으로 요청하고 같은 JSON 응답을 받을 수 있습니다.

---

## 17. 왜 REST API로 바꾸는가? – 정리

### 17-1. HTML 렌더링 vs REST API 요약 비교

| 구분 | Part 1: HTML 렌더링(SSR) | Part 2: RESTful API |
|------|--------------------------|---------------------|
| URL 예 | `/login` | `/api/login` |
| 응답 형식 | 완성된 HTML | JSON |
| 클라이언트 | 주로 웹 브라우저 | 웹, 모바일, 다른 서버 등 다양 |
| 화면 갱신 | 페이지 전체 새로고침 | 필요한 부분만 변경 |
| 장점 | SEO, 초기 로딩 속도, 단순한 구조 | 재사용성, 유연성, 클라이언트 다양성 |

### 17-2. 바꿀 때 건드린 파일 총정리

| 파일 | 변경 내용 |
|------|-----------|
| `controllers/authApiController.js` | **새로 생성** – `res.render()` 대신 `res.json()` 사용 |
| `routes/api.js` | **새로 생성** – `/api/login` 경로 정의 |
| `views/auth/login.ejs` | **수정** – `<form>` 제출 대신 `fetch()` 로 API 호출 |
| `app.js` | **수정** – `express.json()` 추가, API 라우터 연결 |

실제 현업에서는 **두 가지를 섞어서** 사용하는 경우가 많습니다.

- 사용자 웹 사이트: EJS/SSR로 화면 렌더링
- 모바일 앱/외부 연동: REST API 제공

이 프로젝트도 기본은 SSR(EJS) 구조이지만,
일부 관리자 기능이나 비동기 요청은 API 스타일로 설계할 수 있습니다.

---

## 18. 바이브코딩 프롬프트 예시 모음

마지막으로, 이 예제를 **AI에게 요청할 때 쓸 수 있는 프롬프트 예시**를 정리합니다.

### 18-1. Part 1: HTML 로그인 예제 만들기

> "Node.js + Express + EJS 로 된 아주 작은 연습용 프로젝트를 만들고 싶어.
>  DB는 쓰지 않고, 서버 코드 안에 하드코딩된 계정 1개만 존재하게 할 거야.
>  /login 에서는 아이디/비밀번호를 입력받는 폼을 보여주고,
>  POST /login 으로 제출하면 아이디/비밀번호를 검사해서
>  성공이면 환영 화면, 실패면 에러 메시지와 함께 다시 로그인 폼을 보여주고 싶어.
>  app.js, routes/auth.js, controllers/authController.js, views/layouts/main.ejs,
>  views/auth/login.ejs, views/auth/welcome.ejs, public/css/style.css 로
>  폴더 구조를 나눠서 만들어 줘. 초보자도 이해할 수 있게 주석과 설명도 함께 달아줘."

### 18-2. Part 2: 방금 만든 로그인을 REST API로 바꾸기

> "방금 만든 간단 로그인 예제를 RESTful API 버전으로 바꾸고 싶어.
>  기존 SSR 버전은 그대로 남겨 두고, 다음을 추가/수정해 줘:
>  1) controllers/authApiController.js – res.render 대신 res.json으로 응답하는 API 컨트롤러
>  2) routes/api.js – /api/login 경로를 처리하는 새 라우터
>  3) views/auth/login.ejs – form 제출 대신 fetch()로 /api/login에 JSON 요청을 보내도록 수정
>  4) app.js – express.json() 추가하고 /api 라우터 연결
>  before/after 비교도 함께 보여 줘서, 뭐가 달라졌는지 이해하기 쉽게 해 줘."

이런 식으로 요청하면, 이 문서에서 설명한 구조와 거의 비슷한 코드를 AI가 생성해 줄 것입니다.

---

## 19. 다음에 보면 좋은 문서

- Express와 주요 라이브러리 개념을 더 깊게 알고 싶다면: `express_libs.md`
- MVC 구조와 이 프로젝트의 요청 흐름을 이해하고 싶다면: `mvc.md`
- 실제 DB와 연동된 예제를 보고 싶다면: `example_notice.md`, `example_google_login.md`

이 문서를 통해 **"SSR 로그인 → REST API 로그인"** 으로의 전환을 맛봤다면,
이제 본 프로젝트의 구조를 탐색하면서 "어디까지 확장된 버전인지" 비교해 보는 것을 추천합니다.
