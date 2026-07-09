# Express와 주요 라이브러리 – 이 프로젝트에서 어떻게 쓰이고, 왜 쓰는가

이 문서는 **Node.js란** 문서 바로 다음 단계로,

- 이 쇼핑몰에서 함께 사용하고 있는 주요 Node.js 라이브러리/플러그인
- 각각이 **무슨 역할**을 하는지
- 왜 이 프로젝트에서 그 라이브러리를 선택했는지

를 개념 중심으로 정리한 가이드입니다.

다루는 라이브러리는 다음과 같습니다.

- Express
- EJS + express-ejs-layouts
- Tailwind CSS
- bcrypt
- multer

---

## 1. Express – Node.js로 웹 서버를 쉽게 만드는 프레임워크

### 1-1. Express가 무엇인지

**Express** 는 Node.js 위에서 돌아가는 **웹 프레임워크**입니다.

Node.js에는 기본적으로 `http` 모듈이 있어서, 직접 웹 서버를 만들 수 있습니다. 하지만 순수 `http` 만으로는 다음과 같은 일을 매번 직접 처리해야 합니다.

- URL 별로 분기 (라우팅)
- 요청 본문(JSON, 폼 데이터) 파싱
- 쿠키/세션 처리
- 공통 로직(로그, 인증 등)을 여러 라우트에 공통 적용

Express는 이런 작업을 편하게 해 주는 **도구 모음**이라고 보면 됩니다.

### 1-2. 왜 Express를 사용하는가

이 프로젝트에서 Express를 쓰는 이유는:

1. **라우팅 구조를 깔끔하게 나누기 좋음**
   - `routes/index.js`, `routes/products.js`, `routes/admin.js` 처럼, URL 별로 파일을 나누어 관리할 수 있습니다.

2. **미들웨어 개념이 단순하고 강력함**
   - `app.use(미들웨어)` 로 공통 기능(세션, 로그인, 메뉴 정보, 장바구니 정보 등)을 한 번만 등록하면, 모든 요청에 자동으로 적용됩니다.

3. **Node.js 생태계에서 사실상 표준**
   - 자료, 예제, 튜토리얼이 매우 많아서, 입문자가 검색해서 학습하기 좋습니다.

이 프로젝트의 핵심 엔트리 파일인 `app.js` 는 Express 앱을 생성해서, **모든 요청의 출발점** 역할을 합니다.

---

## 2. EJS + express-ejs-layouts – 서버에서 HTML을 만들어 보내는 템플릿 엔진

### 2-1. EJS란?

**EJS(Embedded JavaScript Templates)** 는 서버에서 HTML을 만들 때 사용하는 **템플릿 엔진**입니다.

- 보통 `.ejs` 확장자를 사용합니다.
- HTML 안에 `<%= 변수 %>` 같이 **JavaScript 표현식**을 꽂아서, 동적으로 내용을 바꿀 수 있습니다.

예를 들어:

```ejs
<h1><%= title %></h1>
<ul>
  <% items.forEach(function(item) { %>
    <li><%= item.name %></li>
  <% }); %>
</ul>
```

컨트롤러에서

```js
res.render('user/example', { title: '예시', items });
```

처럼 데이터를 넘기면, EJS가 실제 HTML 문자열로 변환해서 브라우저에 보내 줍니다.

### 2-2. express-ejs-layouts는 무엇을 돕는가

**express-ejs-layouts** 는 EJS에서 **레이아웃(공통 틀)** 을 쉽게 쓸 수 있게 도와주는 미들웨어입니다.

- 상단 헤더, 하단 푸터, 공통 CSS/JS 로딩 부분을 하나의 레이아웃 파일에 모아 두고
- 각 페이지(view)는 **본문 부분만** 정의합니다.

이 프로젝트에서는 예를 들어:

- `views/layouts/main_layout.ejs` – 사용자 사이트 공통 레이아웃
- `views/layouts/admin_layout.ejs` – 관리자 사이트 공통 레이아웃

을 두고, 각 화면은 이 레이아웃을 기반으로 그려집니다.

### 2-3. 왜 EJS + express-ejs-layouts를 사용하는가

1. **입문자에게 친숙한 HTML 기반 템플릿**
   - React, Vue 같은 프레임워크보다 개념이 단순합니다.
   - 기존 HTML 지식만 있어도 템플릿을 쉽게 이해할 수 있습니다.

2. **서버 사이드 렌더링(SSR)이 기본**
   - 페이지를 요청할 때마다 서버에서 필요한 데이터를 조회하고, 완성된 HTML을 내려줍니다.
   - SEO(검색 노출)와 초기 로딩 속도에 유리합니다.

3. **레이아웃 시스템으로 중복 제거**
   - 헤더/푸터/메뉴를 한 곳에서 관리할 수 있어, 디자인을 통일하고 유지보수를 쉽게 합니다.

---

## 3. Tailwind CSS – 유틸리티 클래스 기반 스타일 프레임워크

### 3-1. Tailwind CSS가 무엇인지

**Tailwind CSS** 는 **유틸리티 퍼스트(utility-first)** CSS 프레임워크입니다.

- 기존 Bootstrap처럼 미리 만들어진 컴포넌트를 쓰는 것이 아니라,
- `flex`, `p-4`, `text-gray-700`, `bg-white` 같은 **작은 스타일 클래스**를 여러 개 조합해서 디자인을 만듭니다.

예를 들어, 다음은 카드 하나를 표현하는 Tailwind 스타일의 예입니다.

```html
<div class="bg-white rounded-lg shadow p-4">
  <h2 class="text-lg font-semibold mb-2">상품명</h2>
  <p class="text-gray-600">설명 텍스트</p>
</div>
```

### 3-2. 이 프로젝트에서 Tailwind를 왜 쓰는가

1. **디자인 일관성 유지**
   - 색상, 여백, 폰트 크기를 클래스 수준에서 재사용하므로, 화면마다 스타일이 제멋대로 흩어지지 않습니다.

2. **개발 속도 향상**
   - 새로운 CSS 파일을 계속 만들지 않아도, HTML 안에서 바로 클래스를 조합해 빠르게 UI를 만들 수 있습니다.

3. **커스터마이징 용이**
   - `tailwind.config.js` 에서 색상, 폰트, 브레이크포인트 등을 한 번에 정의할 수 있습니다.

이 프로젝트에서는:

- `public/css/input.css` 에 Tailwind 지시자(`@tailwind base;`, `@tailwind components;`, `@tailwind utilities;`)를 적어 두고,
- 빌드 과정을 통해 `public/css/style.css` 로 변환하여 화면에서 사용합니다.

---

## 4. bcrypt – 비밀번호를 안전하게 저장하기 위한 해시 함수

### 4-1. bcrypt가 무엇인지

**bcrypt** 는 사용자의 비밀번호를 **그대로 DB에 저장하지 않고, 해시(hash) 형태로 변환**해서 보관하기 위한 라이브러리입니다.

- 해시(hash)는 **일방향 함수**입니다.
  - 같은 입력(비밀번호)에 대해서는 항상 같은 결과가 나오지만,
  - 결과값만 가지고는 원래 비밀번호를 복원하기 매우 어렵습니다.

bcrypt는 단순한 SHA-256 같은 해시보다 **느리고, 반복 연산을 많이 하는** 알고리즘이기 때문에, 무차별 대입 공격(brute force)에 더 강합니다.

### 4-2. 왜 bcrypt를 사용하는가

1. **비밀번호 평문 저장은 절대 금지**
   - DB가 유출되더라도, 사용자의 실제 비밀번호는 노출되지 않도록 막아야 합니다.

2. **보안 모범 사례에 가까운 라이브러리**
   - Node.js 진영에서 오래 쓰인 표준 라이브러리 중 하나입니다.

이 프로젝트에서는 다음과 같이 사용됩니다 (개념 예시).

```js
const bcrypt = require('bcrypt');

// 회원가입 시
const hashed = await bcrypt.hash(plainPassword, 10); // 10회 정도의 cost factor
// hashed 값을 users 테이블에 저장

// 로그인 시
const isMatch = await bcrypt.compare(plainPassword, user.password_hash);
if (isMatch) {
  // 로그인 성공
}
```

이렇게 하면, DB에는 `password_hash` 컬럼에 **해시된 값만** 저장되며, 실제 비밀번호는 알 수 없습니다.

---

## 5. multer – 파일 업로드(이미지 업로드)를 처리하는 미들웨어

### 5-1. multer가 무엇인지

**multer** 는 Express에서 **파일 업로드(특히 이미지)** 를 처리할 때 사용하는 미들웨어입니다.

브라우저에서 파일을 전송할 때는 `multipart/form-data` 형식으로 전송되는데, 기본 Express 바디 파서는 이 형식을 해석하지 못합니다. multer는 이 형식을 이해하고, 업로드된 파일을 다음과 같이 처리해 줍니다.

- 지정한 폴더(예: `public/uploads/products/`)에 파일 저장
- 파일 이름, 경로, 크기 등의 정보를 `req.file` 또는 `req.files` 로 넘겨줌

### 5-2. 이 프로젝트에서 multer를 왜 쓰는가

이 쇼핑몰에는 다음과 같은 “이미지 업로드” 기능들이 있습니다.

- 상품 이미지 업로드
- 배너 이미지 업로드
- (필요하다면) 로고/아이콘 이미지 업로드 등

이런 기능을 구현하려면,

1. 관리자 화면에서 **파일 선택 input** 으로 이미지를 고르고
2. 서버에서 파일을 받아 디스크(또는 클라우드)에 저장한 뒤
3. DB에는 파일 경로(예: `/uploads/products/파일명.jpg`) 를 저장

하는 흐름이 필요합니다.

multer는 이 전체 흐름에서 **2번 단계(파일 수신 및 저장)** 를 맡습니다.

이 프로젝트에는 예를 들어 `middleware/upload.js` 처럼 업로드 전용 미들웨어가 정의되어 있고,

```js
const upload = require('../middleware/upload');

router.post('/products', upload.single('image'), productController.create);
```

와 같이 `router` 에서 사용합니다.

---

## 6. 정리 – 각 라이브러리를 한 줄로 요약하면

- **Express**: Node.js 위에서 돌아가는 웹 프레임워크. 라우팅/미들웨어 구조를 제공해 서버 개발을 편하게 해 줍니다.
- **EJS + express-ejs-layouts**: 서버에서 HTML을 동적으로 만들어 보내는 템플릿 엔진 + 레이아웃 도구. 공통 레이아웃과 부분 템플릿을 쉽게 관리할 수 있습니다.
- **Tailwind CSS**: 유틸리티 클래스 기반 CSS 프레임워크. 일관된 디자인과 빠른 UI 개발을 돕습니다.
- **bcrypt**: 비밀번호를 안전하게 해시 형태로 저장하기 위한 라이브러리. 평문 비밀번호 유출을 막기 위해 필수입니다.
- **multer**: 이미지/파일 업로드를 처리하는 Express 미들웨어. 업로드된 파일을 디스크에 저장하고, 경로 정보를 컨트롤러에 넘겨 줍니다.

---

## 7. Express 미들웨어 동작 원리 – 요청 처리 흐름의 핵심

### 7-1. 미들웨어란 무엇인가

**미들웨어(Middleware)** 는 요청(Request)과 응답(Response) 사이에서 실행되는 함수입니다.

```
브라우저 요청 → 미들웨어1 → 미들웨어2 → 미들웨어3 → 라우터 → 응답
```

각 미들웨어는 다음을 수행할 수 있습니다:

- 요청 객체(`req`) 수정 (예: 사용자 정보 추가, 세션 데이터 로드)
- 응답 객체(`res`) 수정
- 다음 미들웨어로 넘기기 (`next()` 호출)
- 응답 보내고 종료 (`res.send()`, `res.render()` 등)

### 7-2. 미들웨어 실행 순서 시각화

```
┌─────────────────────────────────────────────────────────────┐
│                      Express 앱 시작                         │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ app.use(express.json())                                      │
│ → 요청 본문(JSON)을 파싱하여 req.body에 저장                 │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ app.use(session({ ... }))                                    │
│ → 세션 데이터를 req.session에 로드                           │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ app.use(passport.initialize())                               │
│ → 인증 시스템 초기화                                         │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ app.use((req, res, next) => {                                │
│   // 모든 뷰에서 사용할 공통 변수 주입                        │
│   res.locals.user = req.user;                                │
│   res.locals.cartCount = req.session.cartCount || 0;         │
│   next();                                                    │
│ })                                                           │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ app.use('/products', productsRouter)                         │
│ → /products로 시작하는 요청은 productsRouter로 전달          │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ productsRouter 내부                                          │
│ GET /products/list → controller.getList()                    │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 컨트롤러에서 res.render() 호출                               │
│ → EJS 템플릿 렌더링하여 HTML 응답                            │
└─────────────────────────────────────────────────────────────┘
```

### 7-3. 이 프로젝트의 실제 미들웨어 구조

`app.js` 파일에서 미들웨어들이 다음 순서로 등록됩니다:

```js
const express = require('express');
const session = require('express-session');
const passport = require('passport');

const app = express();

// 1. 정적 파일 제공
app.use(express.static('public'));

// 2. 요청 본문 파싱
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. 세션 설정
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

// 4. Passport 인증
app.use(passport.initialize());
app.use(passport.session());

// 5. 뷰 템플릿에 공통 변수 주입 (커스텀 미들웨어)
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.isAuthenticated = !!req.user;
  next();
});

// 6. 라우터 연결
app.use('/', indexRouter);
app.use('/products', productsRouter);
app.use('/admin', adminRouter);

// 7. 404 에러 처리
app.use((req, res, next) => {
  res.status(404).render('error/404');
});

// 8. 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error/500', { error: err.message });
});
```

---

## 8. Express 실전 예제 – 라우팅과 미들웨어 활용

### 8-1. 인증이 필요한 라우트 보호하기

관리자 페이지는 로그인한 사용자만 접근해야 합니다. 이를 위해 **인증 미들웨어**를 만듭니다.

**middleware/auth.js**
```js
// 로그인 여부 확인 미들웨어
exports.isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next(); // 로그인되어 있으면 다음 단계로
  }
  res.redirect('/login'); // 미로그인 시 로그인 페이지로
};

// 관리자 권한 확인 미들웨어
exports.isAdmin = (req, res, next) => {
  if (req.isAuthenticated() && req.user.role === 'admin') {
    return next();
  }
  res.status(403).send('관리자만 접근 가능합니다');
};
```

**routes/admin.js**
```js
const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// 모든 관리자 라우트에 인증 + 관리자 권한 체크 적용
router.use(isAuthenticated);
router.use(isAdmin);

// 이제 아래 라우트들은 자동으로 보호됨
router.get('/dashboard', adminController.dashboard);
router.get('/products', adminController.productList);
router.post('/products', adminController.createProduct);

module.exports = router;
```

### 8-2. 라우터 체이닝으로 CRUD 깔끔하게 정리

```js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/productController');
const upload = require('../middleware/upload');
const { isAdmin } = require('../middleware/auth');

// /products 경로의 CRUD
router.route('/')
  .get(controller.getList)              // GET /products → 목록
  .post(isAdmin, upload.single('image'), controller.create); // POST /products → 생성

router.route('/:id')
  .get(controller.getDetail)            // GET /products/123 → 상세
  .put(isAdmin, controller.update)      // PUT /products/123 → 수정
  .delete(isAdmin, controller.delete);  // DELETE /products/123 → 삭제

module.exports = router;
```

---

## 9. EJS 문법 완전 가이드 – 모든 태그와 활용법

### 9-1. EJS 태그 종류 총정리

| 태그 | 설명 | 예시 |
|------|------|------|
| `<%= %>` | 값을 **HTML 이스케이프**하여 출력 (XSS 방어) | `<%= user.name %>` → `홍길동` |
| `<%- %>` | 값을 **이스케이프 없이** 그대로 출력 (HTML 포함) | `<%- htmlContent %>` |
| `<% %>` | JavaScript 코드 실행 (출력 없음) | `<% if (user) { %>` |
| `<%# %>` | 주석 (HTML 출력에 포함 안 됨) | `<%# 이건 주석입니다 %>` |
| `<%- include() %>` | 다른 EJS 파일 포함 | `<%- include('partials/header') %>` |

### 9-2. 조건문 활용

```ejs
<% if (user) { %>
  <p>환영합니다, <%= user.name %>님!</p>
  <% if (user.role === 'admin') { %>
    <a href="/admin">관리자 페이지</a>
  <% } %>
<% } else { %>
  <a href="/login">로그인</a>
<% } %>
```

**삼항 연산자로 간단히**
```ejs
<span class="<%= isActive ? 'text-green-500' : 'text-gray-500' %>">
  <%= isActive ? '활성' : '비활성' %>
</span>
```

### 9-3. 반복문 활용

**배열 순회**
```ejs
<ul>
  <% products.forEach(function(product) { %>
    <li>
      <%= product.name %> - <%= product.price %>원
    </li>
  <% }); %>
</ul>
```

**인덱스와 함께 순회**
```ejs
<% products.forEach((product, index) => { %>
  <div class="product-<%= index %>">
    <h3><%= index + 1 %>. <%= product.name %></h3>
  </div>
<% }); %>
```

**배열이 비어있을 때 처리**
```ejs
<% if (products.length > 0) { %>
  <ul>
    <% products.forEach(product => { %>
      <li><%= product.name %></li>
    <% }); %>
  </ul>
<% } else { %>
  <p>등록된 상품이 없습니다.</p>
<% } %>
```

### 9-4. include와 partial 활용

**공통 컴포넌트 재사용**

**views/partials/product_card.ejs**
```ejs
<div class="bg-white rounded-lg shadow p-4">
  <img src="<%= product.image_url %>" alt="<%= product.name %>">
  <h3 class="text-lg font-semibold"><%= product.name %></h3>
  <p class="text-gray-600"><%= product.price.toLocaleString() %>원</p>
  <a href="/products/<%= product.id %>" class="btn">자세히 보기</a>
</div>
```

**views/user/products/list.ejs**
```ejs
<div class="grid grid-cols-4 gap-4">
  <% products.forEach(product => { %>
    <%- include('../../partials/product_card', { product: product }) %>
  <% }); %>
</div>
```

---

## 10. EJS 레이아웃 시스템 실전 활용

### 10-1. 레이아웃 구조 이해하기

```
views/
  layouts/
    main_layout.ejs         ← 사용자 사이트 레이아웃
    admin_layout.ejs        ← 관리자 사이트 레이아웃
    manual_layout.ejs       ← 매뉴얼 페이지 레이아웃
  user/
    products/
      list.ejs              ← body만 정의 (레이아웃 적용됨)
      detail.ejs
  admin/
    products/
      list.ejs
      form.ejs
```

### 10-2. 레이아웃 파일 작성 예시

**views/layouts/main_layout.ejs**
```ejs
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= title || '쇼핑몰' %></title>
  <link rel="stylesheet" href="/css/style.css">

  <!-- 페이지별 추가 CSS -->
  <% if (typeof extraCSS !== 'undefined') { %>
    <%- extraCSS %>
  <% } %>
</head>
<body>
  <!-- 공통 헤더 -->
  <%- include('../partials/header') %>

  <!-- 공통 네비게이션 -->
  <%- include('../partials/nav') %>

  <!-- 메인 콘텐츠 영역 (각 페이지의 body가 여기 삽입됨) -->
  <main class="container mx-auto px-4 py-8">
    <%- body %>
  </main>

  <!-- 공통 푸터 -->
  <%- include('../partials/footer') %>

  <!-- 공통 JavaScript -->
  <script src="/js/main.js"></script>

  <!-- 페이지별 추가 JS -->
  <% if (typeof extraJS !== 'undefined') { %>
    <%- extraJS %>
  <% } %>
</body>
</html>
```

### 10-3. 컨트롤러에서 레이아웃 지정

```js
// 기본 레이아웃 사용
res.render('user/products/list', {
  layout: 'main_layout',  // 이 레이아웃 사용
  title: '상품 목록',
  products
});

// 관리자 레이아웃 사용
res.render('admin/products/list', {
  layout: 'admin_layout',
  title: '상품 관리',
  products
});

// 레이아웃 없이 렌더링 (팝업, 이메일 템플릿 등)
res.render('email/welcome', {
  layout: false,
  user
});
```

### 10-4. 페이지별 추가 스크립트/스타일 주입

**views/user/products/detail.ejs**
```ejs
<%
  // 이 페이지에서만 필요한 CSS
  const extraCSS = `
    <link rel="stylesheet" href="/css/product-detail.css">
  `;

  // 이 페이지에서만 필요한 JS
  const extraJS = `
    <script src="/js/image-zoom.js"></script>
    <script>
      initImageZoom('.product-image');
    </script>
  `;
%>

<div class="product-detail">
  <img src="<%= product.image_url %>" class="product-image">
  <h1><%= product.name %></h1>
  <p><%= product.description %></p>
</div>
```

---

## 11. Tailwind CSS 이 프로젝트의 주요 패턴

### 11-1. 자주 사용하는 클래스 조합

**카드 디자인**
```html
<div class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
  <!-- 내용 -->
</div>
```

**버튼 스타일**
```html
<!-- 기본 버튼 -->
<button class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
  클릭
</button>

<!-- 보조 버튼 -->
<button class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
  취소
</button>

<!-- 위험 버튼 -->
<button class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
  삭제
</button>
```

**그리드 레이아웃 (상품 목록)**
```html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
  <!-- 모바일: 1열, 태블릿: 2열, 데스크톱: 4열 -->
  <div class="product-card">...</div>
  <div class="product-card">...</div>
</div>
```

**폼 입력**
```html
<input
  type="text"
  class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
  placeholder="상품명 입력"
>
```

### 11-2. 커스텀 유틸리티 클래스

**public/css/input.css**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* 커스텀 컴포넌트 클래스 */
@layer components {
  .btn {
    @apply px-4 py-2 rounded font-semibold transition;
  }

  .btn-primary {
    @apply btn bg-blue-500 text-white hover:bg-blue-600;
  }

  .btn-secondary {
    @apply btn bg-gray-200 text-gray-700 hover:bg-gray-300;
  }

  .card {
    @apply bg-white rounded-lg shadow-md p-6;
  }

  .input {
    @apply w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500;
  }
}

/* 커스텀 유틸리티 */
@layer utilities {
  .text-shadow {
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
  }
}
```

**사용 예시**
```html
<button class="btn-primary">저장</button>
<button class="btn-secondary">취소</button>
<div class="card">
  <input type="text" class="input" placeholder="검색...">
</div>
```

---

## 12. Tailwind 반응형 디자인 가이드

### 12-1. 브레이크포인트 이해하기

Tailwind의 기본 브레이크포인트:

| 접두사 | 최소 너비 | 설명 |
|--------|-----------|------|
| (없음) | 0px | 모든 화면 (모바일 우선) |
| `sm:` | 640px | 작은 태블릿 이상 |
| `md:` | 768px | 태블릿 이상 |
| `lg:` | 1024px | 노트북 이상 |
| `xl:` | 1280px | 데스크톱 이상 |
| `2xl:` | 1536px | 큰 데스크톱 이상 |

### 12-2. 모바일 우선 반응형 패턴

```html
<!-- 모바일: 1열, 태블릿: 2열, 데스크톱: 3열, 큰 화면: 4열 -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  <div class="product">...</div>
</div>

<!-- 모바일: 작은 패딩, 데스크톱: 큰 패딩 -->
<div class="px-4 md:px-8 lg:px-16">
  <h1 class="text-2xl md:text-3xl lg:text-4xl font-bold">
    제목
  </h1>
</div>

<!-- 모바일: 숨김, 데스크톱: 표시 -->
<div class="hidden lg:block">
  사이드바 메뉴
</div>

<!-- 모바일: 표시, 데스크톱: 숨김 -->
<button class="block lg:hidden">
  모바일 메뉴 열기
</button>
```

### 12-3. 실제 프로젝트 예시 - 상품 상세 페이지

```html
<div class="container mx-auto px-4 py-8">
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <!-- 왼쪽: 이미지 (모바일에서는 위에 배치) -->
    <div>
      <img
        src="<%= product.image_url %>"
        class="w-full rounded-lg shadow-lg"
      >
    </div>

    <!-- 오른쪽: 정보 (모바일에서는 아래 배치) -->
    <div class="space-y-4">
      <h1 class="text-2xl md:text-3xl lg:text-4xl font-bold">
        <%= product.name %>
      </h1>

      <p class="text-xl md:text-2xl text-blue-600 font-semibold">
        <%= product.price.toLocaleString() %>원
      </p>

      <p class="text-gray-600 text-sm md:text-base">
        <%= product.description %>
      </p>

      <div class="flex flex-col sm:flex-row gap-4">
        <button class="flex-1 btn-primary py-3">
          장바구니 담기
        </button>
        <button class="flex-1 btn-secondary py-3">
          바로 구매
        </button>
      </div>
    </div>
  </div>
</div>
```

---

## 13. bcrypt 완전 가이드 – saltRounds와 보안

### 13-1. saltRounds(cost factor)란?

bcrypt의 `saltRounds` 파라미터는 **해시 생성에 걸리는 시간을 조절**합니다.

```js
const bcrypt = require('bcrypt');

// saltRounds가 높을수록 안전하지만 느림
const hash1 = await bcrypt.hash('password123', 10); // ~100ms
const hash2 = await bcrypt.hash('password123', 12); // ~400ms
const hash3 = await bcrypt.hash('password123', 14); // ~1600ms
```

**권장 설정:**
- **10**: 표준 설정 (대부분의 서비스)
- **12**: 민감한 정보 (금융, 의료)
- **14 이상**: 매우 민감한 정보 (보안 소요가 극대화된 시스템)

### 13-2. 회원가입 시 비밀번호 해시 저장

```js
// controllers/authController.js
exports.register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    // 1. 이메일 중복 확인
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: '이미 가입된 이메일입니다' });
    }

    // 2. 비밀번호 해시 생성
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // 3. DB에 저장 (평문 비밀번호가 아닌 해시 저장!)
    const [result] = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)',
      [email, password_hash, name]
    );

    res.json({ message: '회원가입 성공', userId: result.insertId });
  } catch (err) {
    next(err);
  }
};
```

### 13-3. 로그인 시 비밀번호 검증

```js
// controllers/authController.js
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 1. 이메일로 사용자 찾기
    const [users] = await pool.query(
      'SELECT id, email, password_hash, name, role FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 틀렸습니다' });
    }

    const user = users[0];

    // 2. 비밀번호 검증 (평문 vs 해시 비교)
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 틀렸습니다' });
    }

    // 3. 로그인 성공 - 세션에 저장
    req.session.userId = user.id;
    req.session.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    res.json({ message: '로그인 성공', user: { id: user.id, name: user.name } });
  } catch (err) {
    next(err);
  }
};
```

### 13-4. 비밀번호 변경 시 주의사항

```js
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.session.userId;

    // 1. 현재 사용자 정보 조회
    const [users] = await pool.query(
      'SELECT password_hash FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다' });
    }

    // 2. 현재 비밀번호 확인
    const isMatch = await bcrypt.compare(currentPassword, users[0].password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: '현재 비밀번호가 틀렸습니다' });
    }

    // 3. 새 비밀번호 해시 생성
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // 4. DB 업데이트
    await pool.query(
      'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
      [newPasswordHash, userId]
    );

    res.json({ message: '비밀번호가 변경되었습니다' });
  } catch (err) {
    next(err);
  }
};
```

---

## 14. multer 파일 업로드 완전 가이드

### 14-1. multer 설정 파일 작성

**middleware/upload.js**
```js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 저장 설정
const storage = multer.diskStorage({
  // 파일이 저장될 경로
  destination: function (req, file, cb) {
    const uploadDir = 'public/uploads/products';

    // 폴더가 없으면 생성
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },

  // 파일명 지정 (중복 방지)
  filename: function (req, file, cb) {
    // 원본 확장자 추출
    const ext = path.extname(file.originalname);

    // 타임스탬프 + 랜덤값 + 확장자
    const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`;

    cb(null, filename);
  }
});

// 파일 필터 (이미지만 허용)
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // 허용
  } else {
    cb(new Error('이미지 파일만 업로드 가능합니다 (JPG, PNG, GIF, WEBP)'), false);
  }
};

// multer 인스턴스 생성
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB 제한
  }
});

module.exports = upload;
```

### 14-2. 단일 파일 업로드

**routes/products.js**
```js
const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const controller = require('../controllers/productController');

// upload.single('필드명') - 하나의 파일 업로드
router.post('/', upload.single('image'), controller.create);

module.exports = router;
```

**controllers/productController.js**
```js
exports.create = async (req, res, next) => {
  try {
    const { name, price, description } = req.body;

    // req.file에 업로드된 파일 정보가 담김
    if (!req.file) {
      return res.status(400).json({ error: '이미지를 업로드해주세요' });
    }

    // 이미지 경로 (DB에 저장할 상대 경로)
    const image_url = `/uploads/products/${req.file.filename}`;

    // DB에 저장
    const [result] = await pool.query(
      'INSERT INTO products (name, price, description, image_url) VALUES (?, ?, ?, ?)',
      [name, price, description, image_url]
    );

    res.json({
      message: '상품 등록 성공',
      productId: result.insertId,
      imageUrl: image_url
    });
  } catch (err) {
    // 에러 발생 시 업로드된 파일 삭제
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
};
```

### 14-3. 다중 파일 업로드

```js
// 여러 파일 업로드 (최대 5개)
router.post('/gallery', upload.array('images', 5), controller.createGallery);

// 컨트롤러
exports.createGallery = async (req, res, next) => {
  try {
    // req.files 배열에 모든 업로드된 파일 정보
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '이미지를 하나 이상 업로드해주세요' });
    }

    const imageUrls = req.files.map(file => `/uploads/products/${file.filename}`);

    // 각 이미지를 gallery 테이블에 저장
    for (const url of imageUrls) {
      await pool.query(
        'INSERT INTO product_gallery (product_id, image_url) VALUES (?, ?)',
        [req.body.productId, url]
      );
    }

    res.json({ message: '갤러리 이미지 등록 성공', imageUrls });
  } catch (err) {
    next(err);
  }
};
```

### 14-4. 여러 필드에서 파일 업로드

```js
// 메인 이미지 1개 + 상세 이미지 여러 개
router.post('/with-details', upload.fields([
  { name: 'mainImage', maxCount: 1 },
  { name: 'detailImages', maxCount: 10 }
]), controller.createWithDetails);

// 컨트롤러
exports.createWithDetails = async (req, res, next) => {
  try {
    // req.files는 객체 형태
    const mainImage = req.files['mainImage'] ? req.files['mainImage'][0] : null;
    const detailImages = req.files['detailImages'] || [];

    if (!mainImage) {
      return res.status(400).json({ error: '메인 이미지는 필수입니다' });
    }

    const mainImageUrl = `/uploads/products/${mainImage.filename}`;
    const detailImageUrls = detailImages.map(f => `/uploads/products/${f.filename}`);

    // 상품 생성
    const [result] = await pool.query(
      'INSERT INTO products (name, price, image_url) VALUES (?, ?, ?)',
      [req.body.name, req.body.price, mainImageUrl]
    );

    const productId = result.insertId;

    // 상세 이미지 저장
    for (const url of detailImageUrls) {
      await pool.query(
        'INSERT INTO product_images (product_id, image_url) VALUES (?, ?)',
        [productId, url]
      );
    }

    res.json({ message: '상품 등록 성공', productId, mainImageUrl, detailImageUrls });
  } catch (err) {
    next(err);
  }
};
```

---

## 15. 파일 업로드 보안과 검증

### 15-1. 보안 위협과 대응책

**주요 보안 위협:**

1. **악성 파일 업로드** (실행 파일, 스크립트 등)
   - 대응: MIME 타입 검증 + 확장자 화이트리스트

2. **파일명 조작 공격** (../../../etc/passwd)
   - 대응: 파일명을 직접 사용하지 않고 랜덤 생성

3. **대용량 파일 업로드** (서버 디스크/메모리 소진)
   - 대응: 파일 크기 제한

4. **이미지 위장 공격** (JPEG로 위장한 PHP 파일)
   - 대응: 실제 파일 내용 검증

### 15-2. 강화된 파일 검증

```js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp'); // 이미지 처리 라이브러리

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'public/uploads/products';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // 안전한 파일명 생성 (확장자 포함)
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`;
    cb(null, filename);
  }
});

// MIME 타입과 확장자 모두 검증
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('허용되지 않는 파일 형식입니다'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 10 // 최대 10개 파일
  }
});

module.exports = upload;
```

### 15-3. 이미지 실제 검증 (sharp 사용)

```js
// 컨트롤러에서 업로드 후 실제 이미지인지 검증
exports.create = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일을 업로드해주세요' });
    }

    // 실제 이미지 파일인지 검증
    try {
      const metadata = await sharp(req.file.path).metadata();

      // 이미지 크기 제한 (예: 최대 4000x4000)
      if (metadata.width > 4000 || metadata.height > 4000) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: '이미지 크기가 너무 큽니다 (최대 4000x4000)' });
      }
    } catch (err) {
      // sharp가 파싱 실패 = 실제 이미지가 아님
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: '올바른 이미지 파일이 아닙니다' });
    }

    // 검증 통과 - 썸네일 생성
    const thumbnailPath = `public/uploads/products/thumb_${req.file.filename}`;
    await sharp(req.file.path)
      .resize(300, 300, { fit: 'cover' })
      .toFile(thumbnailPath);

    const image_url = `/uploads/products/${req.file.filename}`;
    const thumbnail_url = `/uploads/products/thumb_${req.file.filename}`;

    // DB 저장
    const [result] = await pool.query(
      'INSERT INTO products (name, price, image_url, thumbnail_url) VALUES (?, ?, ?, ?)',
      [req.body.name, req.body.price, image_url, thumbnail_url]
    );

    res.json({ message: '상품 등록 성공', productId: result.insertId });
  } catch (err) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
};
```

### 15-4. 기존 파일 삭제 (상품 수정/삭제 시)

```js
// 상품 수정 시 기존 이미지 삭제
exports.update = async (req, res, next) => {
  try {
    const productId = req.params.id;

    // 새 이미지가 업로드되었으면 기존 이미지 삭제
    if (req.file) {
      // 기존 이미지 경로 조회
      const [products] = await pool.query(
        'SELECT image_url FROM products WHERE id = ?',
        [productId]
      );

      if (products.length > 0 && products[0].image_url) {
        const oldImagePath = `public${products[0].image_url}`;

        // 파일이 존재하면 삭제
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }

      // 새 이미지 경로
      const new_image_url = `/uploads/products/${req.file.filename}`;

      await pool.query(
        'UPDATE products SET name = ?, price = ?, image_url = ? WHERE id = ?',
        [req.body.name, req.body.price, new_image_url, productId]
      );
    } else {
      // 이미지 변경 없음
      await pool.query(
        'UPDATE products SET name = ?, price = ? WHERE id = ?',
        [req.body.name, req.body.price, productId]
      );
    }

    res.json({ message: '상품 수정 성공' });
  } catch (err) {
    next(err);
  }
};

// 상품 삭제 시 이미지 파일도 삭제
exports.delete = async (req, res, next) => {
  try {
    const productId = req.params.id;

    // 이미지 경로 조회
    const [products] = await pool.query(
      'SELECT image_url FROM products WHERE id = ?',
      [productId]
    );

    // DB에서 삭제
    await pool.query('DELETE FROM products WHERE id = ?', [productId]);

    // 파일 삭제
    if (products.length > 0 && products[0].image_url) {
      const imagePath = `public${products[0].image_url}`;
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    res.json({ message: '상품 삭제 성공' });
  } catch (err) {
    next(err);
  }
};
```

---

## 16. 라이브러리별 흔한 실수 TOP 10

### 실수 1: Express 미들웨어 순서 잘못 배치

❌ **잘못된 예:**
```js
// 라우터를 먼저 등록하고 body parser를 나중에 등록
app.use('/api', apiRouter);
app.use(express.json()); // ← 너무 늦음! 위의 라우터에서 req.body가 undefined
```

✅ **올바른 예:**
```js
// body parser를 먼저 등록
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 그 다음 라우터 등록
app.use('/api', apiRouter);
```

### 실수 2: EJS에서 변수가 undefined일 때 처리 안 함

❌ **잘못된 예:**
```ejs
<h1><%= user.name %></h1>
<!-- user가 없으면 에러 발생 -->
```

✅ **올바른 예:**
```ejs
<% if (user) { %>
  <h1><%= user.name %></h1>
<% } else { %>
  <h1>게스트</h1>
<% } %>

<!-- 또는 옵셔널 체이닝 -->
<h1><%= user?.name || '게스트' %></h1>
```

### 실수 3: EJS에서 HTML 이스케이프 혼동

❌ **잘못된 예:**
```ejs
<!-- HTML 태그를 포함한 내용을 <%= %>로 출력 -->
<div><%= htmlContent %></div>
<!-- 결과: &lt;p&gt;내용&lt;/p&gt; (태그가 문자열로 보임) -->
```

✅ **올바른 예:**
```ejs
<!-- HTML을 그대로 렌더링하려면 <%- %> 사용 -->
<div><%- htmlContent %></div>
<!-- 결과: <p>내용</p> (태그가 렌더링됨) -->

<!-- 주의: 사용자 입력을 <%- %>로 출력하면 XSS 위험! -->
```

### 실수 4: Tailwind CSS 빌드 안 함

❌ **잘못된 예:**
```html
<!-- input.css를 직접 링크 -->
<link href="/css/input.css" rel="stylesheet">
<!-- Tailwind 클래스가 작동하지 않음 -->
```

✅ **올바른 예:**
```bash
# Tailwind 빌드 후 사용
npx tailwindcss -i ./public/css/input.css -o ./public/css/style.css --watch
```

```html
<!-- 빌드된 CSS 사용 -->
<link href="/css/style.css" rel="stylesheet">
```

### 실수 5: Tailwind 임의 값 사용 시 따옴표 누락

❌ **잘못된 예:**
```html
<div class="w-[500px]">
  <!-- 작동하지만 빌드 시 제외될 수 있음 -->
</div>
```

✅ **올바른 예:**
```html
<!-- tailwind.config.js에서 미리 정의하거나 -->
<div class="w-[500px]">
  <!-- 또는 safelist에 추가 -->
</div>
```

### 실수 6: bcrypt를 동기적으로 사용

❌ **잘못된 예:**
```js
// hashSync는 블로킹됨 (서버가 멈춤)
const hash = bcrypt.hashSync(password, 10);
```

✅ **올바른 예:**
```js
// 비동기 방식 사용 (권장)
const hash = await bcrypt.hash(password, 10);
```

### 실수 7: bcrypt.compare에서 순서 바꿈

❌ **잘못된 예:**
```js
// 순서가 반대!
const isMatch = await bcrypt.compare(user.password_hash, plainPassword);
```

✅ **올바른 예:**
```js
// 평문을 첫 번째, 해시를 두 번째에
const isMatch = await bcrypt.compare(plainPassword, user.password_hash);
```

### 실수 8: multer 에러 처리 안 함

❌ **잘못된 예:**
```js
router.post('/upload', upload.single('image'), (req, res) => {
  // 파일 크기 초과나 MIME 타입 오류 시 서버 전체가 죽음
  res.json({ file: req.file });
});
```

✅ **올바른 예:**
```js
router.post('/upload', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // multer 에러 처리
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: '파일 크기가 너무 큽니다 (최대 5MB)' });
      }
      return res.status(400).json({ error: err.message });
    } else if (err) {
      // 기타 에러 (파일 타입 등)
      return res.status(400).json({ error: err.message });
    }

    // 정상 처리
    res.json({ file: req.file });
  });
});
```

### 실수 9: 파일 업로드 후 DB 저장 실패 시 파일 정리 안 함

❌ **잘못된 예:**
```js
exports.create = async (req, res) => {
  const image_url = `/uploads/${req.file.filename}`;

  // DB 저장 실패 시 파일만 남아있음 (고아 파일)
  await pool.query('INSERT INTO products (name, image_url) VALUES (?, ?)',
    [req.body.name, image_url]);

  res.json({ message: '성공' });
};
```

✅ **올바른 예:**
```js
exports.create = async (req, res, next) => {
  try {
    const image_url = `/uploads/${req.file.filename}`;

    await pool.query('INSERT INTO products (name, image_url) VALUES (?, ?)',
      [req.body.name, image_url]);

    res.json({ message: '성공' });
  } catch (err) {
    // DB 저장 실패 시 업로드된 파일 삭제
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
};
```

### 실수 10: Express 라우터에서 next() 호출 누락

❌ **잘못된 예:**
```js
app.use((req, res, next) => {
  console.log('로그:', req.url);
  // next()를 안 부르면 요청이 여기서 멈춤!
});

app.get('/', (req, res) => {
  res.send('Hello'); // ← 절대 실행 안 됨
});
```

✅ **올바른 예:**
```js
app.use((req, res, next) => {
  console.log('로그:', req.url);
  next(); // ← 반드시 호출!
});

app.get('/', (req, res) => {
  res.send('Hello');
});
```

---

## 17. 실전 튜토리얼 – 상품 이미지 업로드 기능 구축

이 튜토리얼에서는 **상품 등록 시 이미지 업로드** 기능을 처음부터 끝까지 구현합니다.

### 단계 1: multer 설치 및 설정

```bash
npm install multer sharp
```

**middleware/upload.js 작성**
```js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'public/uploads/products';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`;
    cb(null, filename);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('JPG, PNG, GIF만 업로드 가능합니다'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

module.exports = upload;
```

### 단계 2: 라우터에 업로드 미들웨어 연결

**routes/admin/products.js**
```js
const express = require('express');
const router = express.Router();
const upload = require('../../middleware/upload');
const controller = require('../../controllers/admin/productController');
const { isAdmin } = require('../../middleware/auth');

// 상품 등록 폼 보기
router.get('/new', isAdmin, controller.newForm);

// 상품 등록 처리 (이미지 포함)
router.post('/', isAdmin, upload.single('image'), controller.create);

// 상품 수정 폼
router.get('/:id/edit', isAdmin, controller.editForm);

// 상품 수정 처리
router.put('/:id', isAdmin, upload.single('image'), controller.update);

// 상품 삭제
router.delete('/:id', isAdmin, controller.delete);

module.exports = router;
```

### 단계 3: 컨트롤러 작성

**controllers/admin/productController.js**
```js
const pool = require('../../config/database');
const fs = require('fs');
const sharp = require('sharp');

// 상품 등록 폼 렌더링
exports.newForm = (req, res) => {
  res.render('admin/products/form', {
    layout: 'admin_layout',
    title: '상품 등록',
    product: null
  });
};

// 상품 등록 처리
exports.create = async (req, res, next) => {
  try {
    const { name, price, category, description, stock } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: '상품 이미지를 업로드해주세요' });
    }

    // 이미지 검증
    try {
      const metadata = await sharp(req.file.path).metadata();
      if (metadata.width > 4000 || metadata.height > 4000) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: '이미지 크기는 최대 4000x4000까지 가능합니다' });
      }
    } catch (err) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: '올바른 이미지 파일이 아닙니다' });
    }

    // 썸네일 생성
    const thumbnailFilename = `thumb_${req.file.filename}`;
    const thumbnailPath = `public/uploads/products/${thumbnailFilename}`;

    await sharp(req.file.path)
      .resize(300, 300, { fit: 'cover' })
      .toFile(thumbnailPath);

    const image_url = `/uploads/products/${req.file.filename}`;
    const thumbnail_url = `/uploads/products/${thumbnailFilename}`;

    // DB 저장
    const [result] = await pool.query(
      `INSERT INTO products (name, price, category, description, stock, image_url, thumbnail_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, price, category, description, stock, image_url, thumbnail_url]
    );

    res.json({
      message: '상품이 등록되었습니다',
      productId: result.insertId
    });
  } catch (err) {
    // 에러 발생 시 업로드된 파일 정리
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
};

// 상품 수정 처리
exports.update = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const { name, price, category, description, stock } = req.body;

    let updateQuery, updateParams;

    if (req.file) {
      // 새 이미지가 업로드된 경우

      // 기존 이미지 삭제
      const [products] = await pool.query(
        'SELECT image_url, thumbnail_url FROM products WHERE id = ?',
        [productId]
      );

      if (products.length > 0) {
        if (products[0].image_url) {
          const oldPath = `public${products[0].image_url}`;
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        if (products[0].thumbnail_url) {
          const oldThumbPath = `public${products[0].thumbnail_url}`;
          if (fs.existsSync(oldThumbPath)) fs.unlinkSync(oldThumbPath);
        }
      }

      // 새 썸네일 생성
      const thumbnailFilename = `thumb_${req.file.filename}`;
      const thumbnailPath = `public/uploads/products/${thumbnailFilename}`;

      await sharp(req.file.path)
        .resize(300, 300, { fit: 'cover' })
        .toFile(thumbnailPath);

      const image_url = `/uploads/products/${req.file.filename}`;
      const thumbnail_url = `/uploads/products/${thumbnailFilename}`;

      updateQuery = `
        UPDATE products
        SET name = ?, price = ?, category = ?, description = ?, stock = ?,
            image_url = ?, thumbnail_url = ?, updated_at = NOW()
        WHERE id = ?
      `;
      updateParams = [name, price, category, description, stock, image_url, thumbnail_url, productId];
    } else {
      // 이미지 변경 없음
      updateQuery = `
        UPDATE products
        SET name = ?, price = ?, category = ?, description = ?, stock = ?, updated_at = NOW()
        WHERE id = ?
      `;
      updateParams = [name, price, category, description, stock, productId];
    }

    await pool.query(updateQuery, updateParams);

    res.json({ message: '상품이 수정되었습니다' });
  } catch (err) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
};

// 상품 삭제 처리
exports.delete = async (req, res, next) => {
  try {
    const productId = req.params.id;

    // 이미지 파일 정보 조회
    const [products] = await pool.query(
      'SELECT image_url, thumbnail_url FROM products WHERE id = ?',
      [productId]
    );

    // DB에서 삭제
    await pool.query('DELETE FROM products WHERE id = ?', [productId]);

    // 이미지 파일 삭제
    if (products.length > 0) {
      if (products[0].image_url) {
        const imagePath = `public${products[0].image_url}`;
        if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
      }
      if (products[0].thumbnail_url) {
        const thumbPath = `public${products[0].thumbnail_url}`;
        if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
      }
    }

    res.json({ message: '상품이 삭제되었습니다' });
  } catch (err) {
    next(err);
  }
};
```

### 단계 4: 뷰 템플릿 작성

**views/admin/products/form.ejs**
```ejs
<div class="max-w-2xl mx-auto bg-white rounded-lg shadow p-6">
  <h1 class="text-2xl font-bold mb-6">
    <%= product ? '상품 수정' : '상품 등록' %>
  </h1>

  <form id="productForm" enctype="multipart/form-data">
    <!-- 상품명 -->
    <div class="mb-4">
      <label class="block text-gray-700 font-semibold mb-2">상품명</label>
      <input
        type="text"
        name="name"
        value="<%= product ? product.name : '' %>"
        class="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
        required
      >
    </div>

    <!-- 가격 -->
    <div class="mb-4">
      <label class="block text-gray-700 font-semibold mb-2">가격 (원)</label>
      <input
        type="number"
        name="price"
        value="<%= product ? product.price : '' %>"
        class="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
        required
      >
    </div>

    <!-- 카테고리 -->
    <div class="mb-4">
      <label class="block text-gray-700 font-semibold mb-2">카테고리</label>
      <input
        type="text"
        name="category"
        value="<%= product ? product.category : '' %>"
        class="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
      >
    </div>

    <!-- 설명 -->
    <div class="mb-4">
      <label class="block text-gray-700 font-semibold mb-2">설명</label>
      <textarea
        name="description"
        rows="4"
        class="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
      ><%= product ? product.description : '' %></textarea>
    </div>

    <!-- 재고 -->
    <div class="mb-4">
      <label class="block text-gray-700 font-semibold mb-2">재고</label>
      <input
        type="number"
        name="stock"
        value="<%= product ? product.stock : 0 %>"
        class="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
        required
      >
    </div>

    <!-- 이미지 업로드 -->
    <div class="mb-4">
      <label class="block text-gray-700 font-semibold mb-2">상품 이미지</label>

      <% if (product && product.image_url) { %>
        <div class="mb-2">
          <img src="<%= product.image_url %>" alt="현재 이미지" class="w-40 h-40 object-cover rounded">
          <p class="text-sm text-gray-600 mt-1">현재 이미지 (새 이미지 업로드 시 교체됩니다)</p>
        </div>
      <% } %>

      <input
        type="file"
        name="image"
        accept="image/jpeg,image/png,image/gif"
        class="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
        <%= product ? '' : 'required' %>
      >
      <p class="text-sm text-gray-600 mt-1">JPG, PNG, GIF 형식, 최대 5MB</p>

      <!-- 미리보기 -->
      <div id="preview" class="mt-2"></div>
    </div>

    <!-- 버튼 -->
    <div class="flex gap-4">
      <button
        type="submit"
        class="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        <%= product ? '수정' : '등록' %>
      </button>
      <a
        href="/admin/products"
        class="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
      >
        취소
      </a>
    </div>
  </form>
</div>

<script>
// 이미지 미리보기
document.querySelector('input[name="image"]').addEventListener('change', function(e) {
  const file = e.target.files[0];
  const preview = document.getElementById('preview');

  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      preview.innerHTML = `
        <img src="${e.target.result}" class="w-40 h-40 object-cover rounded border">
        <p class="text-sm text-gray-600 mt-1">새 이미지 미리보기</p>
      `;
    };
    reader.readAsDataURL(file);
  } else {
    preview.innerHTML = '';
  }
});

// 폼 제출
document.getElementById('productForm').addEventListener('submit', async function(e) {
  e.preventDefault();

  const formData = new FormData(this);
  const url = '<%= product ? `/admin/products/${product.id}` : "/admin/products" %>';
  const method = '<%= product ? "PUT" : "POST" %>';

  try {
    const response = await fetch(url, {
      method: method,
      body: formData
    });

    const result = await response.json();

    if (response.ok) {
      alert(result.message);
      window.location.href = '/admin/products';
    } else {
      alert('오류: ' + result.error);
    }
  } catch (err) {
    alert('오류가 발생했습니다: ' + err.message);
  }
});
</script>
```

이제 상품 등록/수정/삭제 시 이미지 업로드가 완벽하게 작동합니다!

---

## 18. 성능 최적화 팁

### 18-1. Express 성능 최적화

**압축 미들웨어 사용**
```bash
npm install compression
```

```js
const compression = require('compression');

// 응답을 gzip으로 압축 (전송 크기 ~70% 감소)
app.use(compression());
```

**정적 파일 캐싱**
```js
// 정적 파일을 1년간 캐싱 (브라우저)
app.use(express.static('public', {
  maxAge: '1y',
  etag: true
}));
```

**프로덕션 모드 설정**
```bash
# .env 파일
NODE_ENV=production
```

```js
if (process.env.NODE_ENV === 'production') {
  app.set('view cache', true); // EJS 템플릿 캐싱
}
```

### 18-2. EJS 성능 최적화

**템플릿 캐싱 활성화**
```js
app.set('view cache', true);
```

**불필요한 공백 제거**
```js
app.set('view options', {
  rmWhitespace: true  // HTML 공백 제거
});
```

### 18-3. Tailwind CSS 최적화

**프로덕션 빌드 (미사용 클래스 제거)**
```bash
# 파일 크기 ~90% 감소
npx tailwindcss -i ./public/css/input.css -o ./public/css/style.css --minify
```

**tailwind.config.js에서 사용하지 않는 기능 비활성화**
```js
module.exports = {
  content: ['./views/**/*.ejs'],
  corePlugins: {
    float: false,      // float 사용 안 하면 비활성화
    objectFit: false,
    objectPosition: false,
  }
};
```

### 18-4. 이미지 최적화

**Sharp로 이미지 최적화**
```js
await sharp(req.file.path)
  .resize(1200, 1200, { fit: 'inside' })  // 최대 크기 제한
  .jpeg({ quality: 85 })                   // JPEG 품질 85%
  .toFile(optimizedPath);
```

**WebP 형식 변환 (파일 크기 ~30% 감소)**
```js
await sharp(req.file.path)
  .webp({ quality: 80 })
  .toFile(webpPath);
```

### 18-5. bcrypt 성능 고려

**로그인 시 타이밍 공격 방어**
```js
exports.login = async (req, res) => {
  const { email, password } = req.body;

  const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

  if (users.length === 0) {
    // 사용자가 없어도 일정 시간 소요 (타이밍 공격 방어)
    await bcrypt.hash(password, 10);
    return res.status(401).json({ error: '로그인 실패' });
  }

  const isMatch = await bcrypt.compare(password, users[0].password_hash);

  if (!isMatch) {
    return res.status(401).json({ error: '로그인 실패' });
  }

  // 로그인 성공
};
```

---

## 19. FAQ – 자주 묻는 질문들

### Q1: Express 미들웨어와 라우터의 차이는 무엇인가요?

**A:** 미들웨어는 `app.use()`로 등록하며 **모든 요청**에 적용됩니다. 라우터는 특정 URL 패턴에만 적용됩니다.

```js
// 미들웨어 - 모든 요청에 적용
app.use((req, res, next) => {
  console.log('요청:', req.url);
  next();
});

// 라우터 - /products로 시작하는 요청만
app.use('/products', productsRouter);
```

### Q2: EJS에서 레이아웃을 사용하지 않으려면 어떻게 하나요?

**A:** 렌더링 시 `layout: false`를 전달합니다.

```js
res.render('email/welcome', {
  layout: false,  // 레이아웃 없이 렌더링
  user
});
```

### Q3: Tailwind CSS 클래스가 적용 안 되는데 왜 그런가요?

**A:** 다음을 확인하세요:

1. **빌드했나요?**
   ```bash
   npx tailwindcss -i ./public/css/input.css -o ./public/css/style.css
   ```

2. **빌드된 CSS를 링크했나요?**
   ```html
   <link href="/css/style.css" rel="stylesheet">  <!-- input.css 아님! -->
   ```

3. **tailwind.config.js에 경로가 맞나요?**
   ```js
   module.exports = {
     content: ['./views/**/*.ejs'],  // EJS 파일 경로
   };
   ```

### Q4: bcrypt 해시 값이 매번 다른데 괜찮은가요?

**A:** 네, **정상**입니다! bcrypt는 매번 랜덤 salt를 생성하므로 같은 비밀번호라도 해시 값이 다릅니다. 하지만 `bcrypt.compare()`는 정확히 검증합니다.

```js
const hash1 = await bcrypt.hash('password123', 10);
const hash2 = await bcrypt.hash('password123', 10);

console.log(hash1 === hash2); // false (매번 다름)

// 하지만 검증은 정확함
await bcrypt.compare('password123', hash1); // true
await bcrypt.compare('password123', hash2); // true
```

### Q5: multer로 여러 파일을 업로드하려면?

**A:** `upload.array()` 또는 `upload.fields()`를 사용합니다.

```js
// 하나의 필드에서 여러 파일
router.post('/gallery', upload.array('images', 10), controller.createGallery);

// 컨트롤러
exports.createGallery = (req, res) => {
  console.log(req.files); // 배열로 들어옴
  req.files.forEach(file => {
    console.log(file.filename);
  });
};

// 여러 필드에서 각각 파일
router.post('/product', upload.fields([
  { name: 'mainImage', maxCount: 1 },
  { name: 'detailImages', maxCount: 5 }
]), controller.create);

// 컨트롤러
exports.create = (req, res) => {
  console.log(req.files.mainImage);      // 배열
  console.log(req.files.detailImages);   // 배열
};
```

### Q6: 업로드된 파일을 어떻게 삭제하나요?

**A:** Node.js의 `fs` 모듈을 사용합니다.

```js
const fs = require('fs');

// 동기 삭제
fs.unlinkSync('public/uploads/products/파일명.jpg');

// 비동기 삭제
await fs.promises.unlink('public/uploads/products/파일명.jpg');
```

### Q7: Express에서 JSON과 URL-encoded 둘 다 처리하려면?

**A:** 두 미들웨어를 모두 등록합니다.

```js
app.use(express.json());                       // JSON 요청
app.use(express.urlencoded({ extended: true })); // 폼 요청
```

### Q8: EJS에서 JavaScript 변수를 그대로 전달하려면?

**A:** `JSON.stringify()`를 사용합니다.

**컨트롤러:**
```js
res.render('user/products/list', {
  products: [{ id: 1, name: '상품1' }, { id: 2, name: '상품2' }]
});
```

**EJS:**
```ejs
<script>
  const products = <%- JSON.stringify(products) %>;
  console.log(products[0].name); // '상품1'
</script>
```

### Q9: Tailwind CSS로 다크 모드를 구현하려면?

**A:** `dark:` 접두사를 사용합니다.

**tailwind.config.js:**
```js
module.exports = {
  darkMode: 'class',  // 또는 'media'
  // ...
};
```

**HTML:**
```html
<html class="dark">  <!-- 다크 모드 활성화 -->
<body class="bg-white dark:bg-gray-900">
  <h1 class="text-gray-900 dark:text-white">제목</h1>
</body>
</html>
```

### Q10: bcrypt saltRounds는 몇으로 설정해야 하나요?

**A:** **10**이 표준입니다. 보안이 매우 중요하면 12로 올리되, 로그인 속도가 느려질 수 있습니다.

```js
// 일반 서비스
const hash = await bcrypt.hash(password, 10);  // ~100ms

// 민감한 서비스 (금융, 의료)
const hash = await bcrypt.hash(password, 12);  // ~400ms
```

---

## 20. 정리 및 다음 단계

이 문서와 `tech_stack`, `nodejs`, `mvc`, `project_structure` 문서를 함께 보면,

- **어떤 기술이 어디에서 어떻게 쓰이고 있는지**,
- **왜 이 조합으로 프로젝트를 구성했는지**

를 한눈에 이해할 수 있고, 이후 `vibe_coding`, `workflow`, `example_*` 문서를 보면서 **바이브코딩으로 기능을 확장할 때 어떤 라이브러리를 어떻게 활용해야 할지** 자연스럽게 감을 잡을 수 있습니다.

**다음 단계:**

1. [project_structure.md](project_structure) - 프로젝트 폴더 구조 이해
2. [vibe_coding.md](vibe_coding) - AI와 협업하는 바이브코딩 방식 학습
3. [workflow.md](workflow) - 실제 기능 개발 워크플로우 따라하기
4. [example_notice.md](example_notice) - 공지사항 기능 구현 예시
5. [example_google_login.md](example_google_login) - 구글 로그인 구현 예시
