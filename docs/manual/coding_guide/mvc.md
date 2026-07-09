# MVC 패턴과 app.js – 쇼핑몰 프로젝트 흐름 완전 이해하기

이 문서는 **비개발자 / Node.js 초보자**가

- MVC가 무엇인지
- 현재 쇼핑몰 프로젝트에 MVC가 **어떻게 적용**되어 있는지
- URL → 라우터 → 컨트롤러 → DB → 뷰 로 이어지는 **전체 요청 흐름**
- 바이브코딩으로 기능을 추가할 때 **어디를 어떻게 건드리면 되는지**

를 단계적으로 이해할 수 있도록 만든 가이드입니다.

---

## 1. MVC가 무엇인지 – 개념부터 잡기

**MVC**는 **Model – View – Controller**의 줄임말입니다.

웹 애플리케이션을 만들 때, 역할을 이렇게 나누자는 약속입니다.

| 역할 | 하는 일 | 이 프로젝트에서는 |
|------|---------|----------------------|
| **Model (모델)** | 데이터의 구조, 데이터 읽기/쓰기 로직 | MySQL 테이블 구조(tables.sql) + 컨트롤러 안의 SQL (`pool.query`) |
| **View (뷰)** | 사용자에게 보여 줄 화면(HTML) | `views/`의 EJS 파일들 (`views/user`, `views/admin`, `views/layouts` 등) |
| **Controller (컨트롤러)** | 사용자의 요청을 받아서, 필요한 데이터를 조회/저장하고, 어떤 뷰를 보여줄지 결정 | `controllers/` 폴더의 JS 파일들 |

조금 더 쉬운 비유를 해 보면:

- **Model**: “DB, 데이터 저장소” – 가게 창고(재고 목록)
- **View**: “화면” – 진열대, 쇼핑몰 웹페이지
- **Controller**: “중간에서 판단하는 뇌” – “어떤 상품을 얼마만큼 가져와서 어떤 페이지에 어떻게 보여 줄까?”를 결정

이 프로젝트는 **엄격한 MVC 프레임워크(예: Rails, Laravel)** 는 아니지만, 구조상 **MVC 스타일**을 따르고 있습니다.

> Model을 위한 별도 `models/` 폴더는 없고, **MySQL 테이블 + 컨트롤러 안의 SQL**이 Model 역할을 함께 담당합니다.

---

## 2. 이 프로젝트에서의 MVC 구조 한눈에 보기

현재 쇼핑몰 프로젝트를 기준으로 하면 이렇게 정리할 수 있습니다.

- **Model 쪽**
  - [tables.sql](../../tables.sql) : MySQL 테이블 정의 (users, products, orders, notices 등)
  - [config/db.js](../../config/db.js) : MySQL 연결 풀 (`pool`) 설정
  - 각 컨트롤러에서의 `pool.query('SELECT ...')` 구문들

- **View 쪽**
  - [views/layouts/main_layout.ejs](../../views/layouts) : 사용자 공통 레이아웃
  - [views/layouts/admin_layout.ejs](../../views/layouts) : 관리자 공통 레이아웃
  - [views/user/*](../../views/user) : 쇼핑몰 사용자 화면 (메인, 상품, 장바구니, 주문, 공지 등)
  - [views/admin/*](../../views/admin) : 관리자 화면 (대시보드, 상품/배너/카테고리/회원 관리 등)

- **Controller 쪽**
  - [controllers/mainController.js](../../controllers/mainController.js) : 메인 페이지 등
  - [controllers/productController.js](../../controllers/productController.js) : 사용자 상품 관련
  - [controllers/noticeController.js](../../controllers/noticeController.js) : 공지사항
  - [controllers/admin/*](../../controllers/admin) : 관리자용 기능들

- **Router (이 문서에서는 Controller와 함께 다루는 핵심 요소)**
  - [routes/index.js](../../routes/index.js) : `/`, 검색, 공지, 문의 등 사용자 메인 라우트
  - [routes/products.js](../../routes/products.js) : `/products` 관련 사용자 라우트
  - [routes/admin.js](../../routes/admin.js) : `/admin` 진입, 하위 라우터 묶음
  - [routes/admin/*](../../routes/admin) : `/admin/products`, `/admin/notices` 등 세부 관리자 라우트

정리하면, **라우터는 URL → 컨트롤러 연결**, 컨트롤러는 **DB(모델 역할) → 뷰 연결**, 뷰는 **EJS 템플릿**입니다.

---

## 3. app.js의 역할 – 전체를 엮어주는 “시작점”

[app.js](../../app.js)는 이 프로젝트의 **진입점(엔트리 포인트)** 입니다.

Node.js가 `node app.js`를 실행하면, app.js 안에서:

1. **Express 앱을 생성**하고
2. **공통 미들웨어**들을 등록하고
3. **라우터**들을 연결하고
4. 마지막에 `app.listen(PORT, ...)` 으로 서버를 켭니다.

### 3-1. app.js의 구조 (개념 버전)

실제 코드는 더 길지만, 개념만 단순화해서 쓰면 대략 이런 흐름입니다.

```js
// 1) 필수 모듈, 설정 불러오기
const express = require('express');
const session = require('express-session');
const passport = require('passport');
// ... 그 외 미들웨어, 라우터 import

const app = express();

// 2) 뷰 엔진(EJS)과 레이아웃 설정
app.set('view engine', 'ejs');
// app.set('views', 'views'); // 기본값이라면 생략 가능

// 3) 공통 미들웨어 등록
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session(/* 세션 옵션 */));
app.use(passport.initialize());
app.use(passport.session());

// 사이트 설정, 메뉴, 장바구니 정보 등을 req / res.locals에 심는 커스텀 미들웨어들
// app.use(siteSettings);
// app.use(menuData);
// app.use(cartData);

// 4) 라우터 연결
app.use('/', require('./routes/index'));
app.use('/products', require('./routes/products'));
app.use('/cart', require('./routes/cart'));
app.use('/admin', require('./routes/admin'));
// ... 기타 라우터들

// 5) 에러 처리 미들웨어 등

// 6) 서버 시작
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
```

중요한 포인트는:

- app.js는 **요청을 직접 처리하지 않습니다.**
- “**어떤 URL은 어떤 라우터에게 맡긴다**” 만 정의합니다.
- 세션, 로그인, 사이트 설정처럼 **모든 요청에 공통으로 필요한 작업**은 `app.use(미들웨어)` 형태로 한 번만 설정합니다.

---

## 4. Router – URL을 Controller에 연결하는 다리

### 4-1. 라우터의 기본 형태

Express에서 라우터는 보통 이렇게 생겼습니다.

```js
// routes/example.js
const express = require('express');
const router = express.Router();
const exampleController = require('../controllers/exampleController');

// GET /example
router.get('/', exampleController.getExampleList);

// POST /example
router.post('/', exampleController.createExample);

module.exports = router;
```

app.js에서:

```js
app.use('/example', require('./routes/example'));
```

이렇게 연결하면, 실제 동작은 다음과 같습니다.

- **GET /example** → `exampleController.getExampleList`
- **POST /example** → `exampleController.createExample`

### 4-2. 이 프로젝트에서의 라우터 예시

예를 들어, 사용자 메인 페이지와 관련된 라우터는 [routes/index.js](../../routes/index.js)에 있습니다.

개념적으로는 이런 구조입니다.

```js
const express = require('express');
const router = express.Router();
const mainController = require('../controllers/mainController');
const noticeController = require('../controllers/noticeController');
// ... 기타 컨트롤러들

// 메인 페이지
router.get('/', mainController.getHome);

// 공지사항 목록
router.get('/notices', noticeController.getList);

// 공지사항 상세
router.get('/notices/:id', noticeController.getDetail);

module.exports = router;
```

app.js에서는 이 라우터를 이렇게 연결해 둡니다.

```js
app.use('/', require('./routes/index'));
```

이제 요청 흐름은 다음과 같습니다.

> 브라우저 → `GET /notices` 요청 → app.js → `'/' 라우터 사용` → `routes/index.js` → `noticeController.getList` 실행

---

## 5. Controller – DB(모델 역할)와 뷰를 잇는 중간다리

컨트롤러는 보통 다음과 같은 일을 합니다.

1. URL/쿼리/폼에서 **입력값(req.params, req.query, req.body)** 을 읽는다.
2. **DB(또는 다른 서비스)에서 데이터**를 읽거나 쓴다.
3. 어떤 뷰를 사용할지 결정하고, **데이터를 담아 `res.render`** 를 호출한다.

### 5-1. 예시: 메인 페이지 컨트롤러

아주 단순화한 예를 들면 다음과 같습니다.

```js
// controllers/mainController.js
const pool = require('../config/db');

exports.getHome = async (req, res, next) => {
  try {
    // 1) DB에서 필요한 데이터 조회 (예: 배너, 인기 상품 등)
    const [banners] = await pool.query('SELECT * FROM banners WHERE is_active = 1');
    const [products] = await pool.query('SELECT * FROM products WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT 8');

    // 2) 뷰 렌더링
    res.render('user/index', {
      title: '메인 페이지',
      banners,
      products,
    });
  } catch (err) {
    next(err); // 에러 처리 미들웨어로 넘기기
  }
};
```

여기서 볼 수 있는 MVC 요소는:

- `pool.query(...)` : **Model(DB)** 에 해당하는 작업
- `res.render('user/index', { ... })` : 어떤 **View** 를 쓸지, 어떤 데이터를 넘길지 결정
- 전체 함수 `getHome` : **Controller** 역할

### 5-2. 예시: 공지사항 목록 컨트롤러

```js
// controllers/noticeController.js
const pool = require('../config/db');

exports.getList = async (req, res, next) => {
  try {
    const [notices] = await pool.query(
      'SELECT * FROM notices WHERE is_deleted = 0 ORDER BY pinned DESC, created_at DESC'
    );

    res.render('user/notices/list', {
      title: '공지사항',
      notices,
    });
  } catch (err) {
    next(err);
  }
};
```

이 컨트롤러도 구조는 같습니다.

- `pool.query(...)` 로 **notices 테이블**에서 데이터를 가져오고
- `res.render('user/notices/list', { notices })` 로 **공지사항 목록 뷰**를 렌더링합니다.

---

## 6. 실제 예시: `/products/category/7` 요청이 어떻게 흐르는가?

이번에는 조금 더 구체적으로, 사용자가 브라우저에서

> `/products/category/7`

주소로 접속했을 때, **라우터 → 컨트롤러 → 뷰** 가 어떻게 동작하는지 살펴보겠습니다.

### 6-1. ① app.js – `/products` 요청을 products 라우터에 맡기기

[app.js](../../app.js) 에서는 다음과 같이 라우터를 연결해 둡니다.

```js
// app.js 의 일부 (개념 예시)
const productsRouter = require('./routes/products');

// ... 공통 미들웨어들 뒤에
app.use('/products', productsRouter);
```

의미를 풀어 쓰면:

- "주소가 `/products` 로 시작하는 모든 요청은 `routes/products.js` 에게 맡긴다" 는 뜻입니다.

즉, 브라우저에서 `/products/category/7` 으로 접속하면:

> 브라우저 → 서버(app.js) → `/products` 로 시작하니까 → `routes/products.js` 로 전달

이 됩니다.

### 6-2. ② routes/products.js – URL 패턴과 컨트롤러 연결

[routes/products.js](../../routes/products.js) 의 일부를 보면:

```js
const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

// List
router.get('/', productController.getList);
router.get('/category/:categoryId', productController.getList);
```

여기서 중요한 줄은:

```js
router.get('/category/:categoryId', productController.getList);
```

입니다.

- `GET /products/category/:categoryId`
- `:categoryId` 부분은 **변수 자리**입니다.

그래서 `/products/category/7` 으로 들어오면:

- `categoryId` 라는 이름의 파라미터에 문자열 `'7'` 이 들어가고
- `productController.getList` 함수가 실행됩니다.

정리하면, 지금까지 흐름은 이렇습니다.

> 브라우저 `/products/category/7` 요청 → app.js 가 `/products` 라우터로 전달 →
> routes/products.js 가 `/category/:categoryId` 패턴과 매칭 → `productController.getList` 실행

### 6-3. ③ controllers/productController.js – 카테고리별 상품 조회

`productController.getList` 함수 안에서는

1. `req.params.categoryId` 값을 읽고
2. 해당 카테고리에 속한 상품만 DB에서 조회한 다음
3. 상품 목록 뷰를 렌더링합니다.

예를 들어(개념을 위한 예시 코드):

```js
// controllers/productController.js
const pool = require('../config/db');

exports.getList = async (req, res, next) => {
  try {
    const categoryId = req.params.categoryId || null; // /products 일 때는 undefined

    let products;
    if (categoryId) {
      const [rows] = await pool.query(
        'SELECT * FROM products WHERE category_id = ? AND is_deleted = 0 ORDER BY created_at DESC',
        [categoryId]
      );
      products = rows;
    } else {
      const [rows] = await pool.query(
        'SELECT * FROM products WHERE is_deleted = 0 ORDER BY created_at DESC'
      );
      products = rows;
    }

    res.render('user/products/list', {
      title: '상품 목록',
      products,
      currentCategoryId: categoryId,
    });
  } catch (err) {
    next(err);
  }
};
```

실제 코드 구조와 100% 같지는 않을 수 있지만, 흐름은 비슷합니다.

- `/products` → `categoryId` 없음 → 전체 상품 목록
- `/products/category/7` → `categoryId = '7'` → 7번 카테고리 상품만 조회

그리고 마지막에:

```js
res.render('user/products/list', { ... })
```

로 **View(템플릿)** 를 렌더링합니다.

### 6-4. ④ views/user/products/list.ejs – 화면에 그리기

`res.render('user/products/list', { products, currentCategoryId })` 가 호출되면,

1. `views/user/products/list.ejs` 파일을 찾아 열고
2. `products` 배열을 순회하면서 카드/리스트 형태로 상품을 그립니다.

예를 들어 (개념용 단순 예시):

```ejs
<h1>상품 목록</h1>

<% if (currentCategoryId) { %>
  <p><strong><%= currentCategoryId %></strong> 번 카테고리 상품만 보고 있습니다.</p>
<% } %>

<div class="product-grid">
  <% products.forEach(function (product) { %>
    <div class="product-card">
      <h2><%= product.name %></h2>
      <p><%= product.price %>원</p>
    </div>
  <% }); %>
  <% if (products.length === 0) { %>
    <p>등록된 상품이 없습니다.</p>
  <% } %>
</div>
```

이렇게 해서, 브라우저에서 보는 최종 화면이 만들어집니다.

정리하면 `/products/category/7` 의 전체 흐름은 다음과 같습니다.

> 브라우저 → `GET /products/category/7` 요청 → app.js (`/products` 라우터로 위임) →
> routes/products.js (`/category/:categoryId` 와 매칭) →
> controllers/productController.getList (categoryId 기반 DB 조회 후 `res.render`) →
> views/user/products/list.ejs (상품 목록 화면 렌더링)

---

## 7. MVC 관점에서 기능을 바라보는 연습

이제부터는 새로운 기능을 떠올릴 때, 항상 이렇게 스스로에게 물어보면 좋습니다.

1. **URL / 화면**: 사용자가 어떤 주소로 들어오고, 어떤 화면을 보게 될까? (View)
2. **필요한 데이터**: 그 화면을 위해 어떤 데이터가 필요하고, 어느 테이블에 있어야 할까? (Model)
3. **처리 로직**: 그 데이터를 어떻게 조합하거나 가공해서 화면에 넘겨야 할까? (Controller)

예를 들어,

- "카테고리별 인기 상품 TOP 10 페이지"를 만들고 싶다면:
  - URL: `/products/category/:categoryId/top`
  - Model: `products`, `order_items` 테이블에서 카테고리/판매량 기준 집계
  - Controller: 집계 쿼리 실행 후, `res.render('user/products/top', { ... })`
  - View: `views/user/products/top.ejs` 에서 랭킹 리스트 그리기

이렇게 **URL → Router → Controller → Model(DB) → View** 흐름을 머릿속에 그려 가면서
`vibe_coding`, `workflow` 문서에 있는 프롬프트 예시들을 그대로 응용하면, 바이브코딩으로도 충분히 쇼핑몰 기능을 확장할 수 있습니다.
};
```

요청 흐름을 글로 적어 보면 이렇게 됩니다.

> 1. 사용자가 `/notices` URL로 접속한다.
> 2. app.js → `'/'` 라우터 → `routes/index.js`에서 `router.get('/notices', noticeController.getList)` 를 찾는다.
> 3. `noticeController.getList` 가 실행되어 DB에서 공지 목록을 가져온다.
> 4. `views/user/notices/list.ejs` 뷰에 `notices` 데이터를 넘겨서 HTML을 만들고, 브라우저로 응답한다.

---

## 6. View – EJS 템플릿으로 화면 만들기

View는 EJS 파일로 된 **HTML 템플릿**입니다.

### 6-0. EJS 기본 문법 빠른 참고표

| 문법 | 설명 | 예시 |
|------|------|------|
| `<%= %>` | 변수 출력 (HTML 이스케이프) | `<%= user.name %>` |
| `<%- %>` | 변수 출력 (HTML 이스케이프 안 함) | `<%- htmlContent %>` |
| `<% %>` | JavaScript 코드 실행 | `<% if (isAdmin) { %>` |
| `<%# %>` | 주석 (렌더링 안 됨) | `<%# TODO: 수정 필요 %>` |

**중요**:
- 사용자 입력을 출력할 때는 반드시 `<%= %>` 사용 (XSS 방지)
- 신뢰할 수 있는 HTML만 `<%- %>` 사용 (예: 마크다운 변환 결과)

### 6-1. 메인 페이지 뷰 예시 (개념)

```ejs
<!-- views/user/index.ejs -->
<%- layout('layouts/main_layout') %>

<h1 class="text-2xl font-bold mb-4"><%= title %></h1>

<!-- 배너 슬라이더 -->
<div class="mb-8">
  <% banners.forEach((banner) => { %>
    <a href="<%= banner.link_url %>">
      <img src="<%= banner.image_url %>" alt="<%= banner.title %>">
    </a>
  <% }) %>
  <!-- 실제 프로젝트에서는 Tailwind 클래스로 디자인 정교화 -->
</div>

<!-- 상품 목록 -->
<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
  <% products.forEach((p) => { %>
    <div class="border p-2 rounded">
      <img src="<%= p.thumbnail_url %>" alt="<%= p.name %>">
      <h2 class="font-semibold mt-2"><%= p.name %></h2>
      <p class="text-sm text-gray-500"><%= p.price.toLocaleString() %>원</p>
    </div>
  <% }) %>
  <% if (products.length === 0) { %>
    <p>등록된 상품이 없습니다.</p>
  <% } %>
  
</div>
```

컨트롤러에서 넘겨준 `title`, `banners`, `products` 변수를 화면에 그려 주는 역할만 합니다.

### 6-2. 레이아웃 (layouts)

한 프로젝트 안에서

- 공통 헤더/푸터
- 공통 네비게이션(메뉴)

등은 매 페이지마다 직접 쓰면 유지보수가 힘듭니다. 그래서 **레이아웃**을 둡니다.

- `views/layouts/main_layout.ejs` : 사용자 사이트 공통 레이아웃
- `views/layouts/admin_layout.ejs` : 관리자 사이트 공통 레이아웃
- `views/layouts/manual_layout.ejs` : 매뉴얼/코딩가이드용 레이아웃

각 페이지(EJS)는

```ejs
<%- layout('layouts/main_layout') %>
```

처럼 선언해서 공통 레이아웃 안에 자신을 끼워 넣습니다.

---

## 7. “새 기능 추가”를 MVC 관점에서 생각하기 (바이브코딩용 사고방식)

예를 들어, **사용자 공지사항에 “FAQ(자주 묻는 질문)” 페이지를 추가**한다고 가정해 보겠습니다.

### 7-1. 필요한 것들

1. **DB 테이블 (Model)**
   - `faqs` 테이블: 질문/답변/노출 순서/노출 여부 컬럼
2. **컨트롤러 함수 (Controller)**
   - 예: `faqController.getList`
3. **라우터 (Router)**
   - 예: `GET /faq` → `faqController.getList`
4. **뷰 (View)**
   - 예: `views/user/faq/list.ejs`

### 7-2. 바이브코딩 프롬프트 예시

AI에게는 이렇게 단계별로 요청할 수 있습니다.

1) 테이블 설계

> "MySQL을 사용 중인 쇼핑몰 프로젝트입니다. FAQ(자주 묻는 질문)를 저장할 `faqs` 테이블을 만들고 싶습니다. id(PK, auto increment), question(질문), answer(답변), display_order(노출 순서), is_visible(노출 여부), created_at, updated_at 컬럼을 포함한 CREATE TABLE 쿼리를 작성해 주세요."

2) 컨트롤러 추가

> "Node.js + Express + mysql2/promise를 사용하는 프로젝트입니다. `config/db.js`에 `pool`이 있고, 컨트롤러들은 `controllers/` 폴더에 있습니다. `controllers/faqController.js` 파일을 새로 만들어서, `getList` 함수 안에서 `SELECT * FROM faqs WHERE is_visible = 1 ORDER BY display_order ASC` 쿼리로 데이터를 조회한 뒤, `res.render('user/faq/list', { faqs })`로 렌더링해 주세요. MVC 구조를 지켜 주세요."

3) 라우터 연결

> "`routes/` 폴더에 사용자용 라우터가 있습니다. `/faq` 경로를 처리하기 위해 `routes/faq.js` 파일을 만들고, `GET /` 요청이 오면 `faqController.getList`를 호출하도록 작성해 주세요. 그리고 `app.js`에 `app.use('/faq', require('./routes/faq'))`를 추가하는 코드도 함께 제안해 주세요."

4) 뷰 템플릿 작성

> "EJS + Tailwind CSS를 사용하는 사용자 사이트입니다. `views/user/faq/list.ejs` 파일을 작성하려고 합니다. `layout('layouts/main_layout')`을 사용하고, 컨트롤러에서 넘겨주는 `faqs` 배열을 카드 형태로 반복 출력해 주세요. 질문은 굵게, 답변은 일반 텍스트로 표시해 주세요. 빈 배열일 경우 '등록된 FAQ가 없습니다.' 문구를 보여 주세요."

이처럼 **MVC의 4가지 요소(Model/Controller/Router/View)** 를 머릿속에 두고, AI에게도 그 구조에 맞춰 부탁하면

- 코드가 프로젝트 구조에 자연스럽게 들어가고
- 나중에 유지보수나 확장도 훨씬 쉽습니다.

---

## 8. 정리 – MVC를 안다는 것은 “길을 잃지 않는다는 것”

이제 이 정도만 기억하면 충분합니다.

1. **Model**: DB와 데이터 구조 – 이 프로젝트에서는 MySQL 테이블 + `pool.query` 가 그 역할을 한다.
2. **View**: 화면 – `views/` 아래의 EJS 템플릿들.
3. **Controller**: 중간 로직 – `controllers/` 안에서 데이터 읽고 뷰를 선택해 `res.render` 한다.
4. **Router**: URL → 컨트롤러 연결 – `routes/` 안에서 `router.get(...)` / `router.post(...)` 를 정의한다.
5. **app.js**: Express 앱 생성, 공통 미들웨어 설정, 라우터를 전체 URL 구조에 붙이는 **시작점**.

지금 프로젝트 코드를 볼 때,

- “이 기능은 **어느 URL**로 들어오지?” → `routes/`
- “그 URL을 받으면 **어떤 함수**가 실행되지?” → `controllers/`
- “이 함수는 **어떤 DB 테이블**을 쓰지?” → SQL / `tables.sql`
- “그 결과는 **어떤 화면**에 뿌려지지?” → `views/`

이 네 가지 질문만 반복해도, 금방 전체 구조를 머릿속에 그릴 수 있게 됩니다.

이제 MVC가 단순한 이론 용어가 아니라, **내가 보는 코드 구조를 설명하는 언어**가 되었으면 좋겠습니다.

---

## 9. 완전한 MVC 흐름 시각화 – 그림으로 한눈에 보기

아래 다이어그램은 **사용자의 요청이 어떻게 MVC 각 계층을 거쳐 응답되는지** 전체 흐름을 보여줍니다.

```
┌─────────────────────────────────────────────────────────────────────┐
│                           브라우저 (사용자)                           │
│                   GET /products/category/7                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│                           app.js (진입점)                            │
│  - Express 앱 생성                                                   │
│  - 공통 미들웨어 등록 (세션, Passport, 사이트 설정 등)                │
│  - app.use('/products', productsRouter) ← 라우터 연결                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    routes/products.js (Router)                      │
│  - URL 패턴 매칭: /category/:categoryId                             │
│  - router.get('/category/:categoryId', productController.getList)   │
│  - req.params.categoryId = '7' 추출                                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│              controllers/productController.js (Controller)          │
│  exports.getList = async (req, res, next) => {                     │
│    1. req.params.categoryId 읽기 → '7'                              │
│    2. pool.query('SELECT ... WHERE category_id = ?', [7]) ───┐     │
│    3. 조회 결과를 products 변수에 저장                      │     │
│    4. res.render('user/products/list', { products })        │     │
│  }                                                          │     │
└─────────────────────────────────────────────────────────────┼─────┘
                                                              │
                                                              ↓
                                               ┌──────────────────────────┐
                                               │   config/db.js (DB Pool) │
                                               │   + MySQL 8 (Model)      │
                                               │   - products 테이블 조회  │
                                               │   - category_id = 7      │
                                               │   - is_deleted = 0       │
                                               └──────────┬───────────────┘
                                                          │
                                                          ↓ (조회 결과 반환)
┌─────────────────────────────────────────────────────────────────────┐
│               views/user/products/list.ejs (View)                   │
│  <%- layout('layouts/main_layout') %>                               │
│  <% products.forEach(p => { %>                                      │
│    <div class="product-card">                                       │
│      <h2><%= p.name %></h2>                                         │
│      <p><%= p.price.toLocaleString() %>원</p>                       │
│    </div>                                                           │
│  <% }) %>                                                           │
│  → HTML 생성                                                         │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        브라우저 (사용자)                              │
│              렌더링된 HTML 화면 표시 (상품 목록)                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 9-1. 각 단계에서 어떤 일이 일어나는가?

| 단계 | 계층 | 역할 | 실제 파일/코드 |
|-----|------|------|---------------|
| 1 | **브라우저** | 사용자가 URL 입력 | `/products/category/7` |
| 2 | **app.js** | 요청을 적절한 라우터로 위임 | `app.use('/products', productsRouter)` |
| 3 | **Router** | URL 패턴과 매칭, 파라미터 추출 | `router.get('/category/:categoryId', ...)` |
| 4 | **Controller** | 비즈니스 로직, DB 조회, 뷰 선택 | `productController.getList` |
| 5 | **Model (DB)** | 데이터 읽기/쓰기 | `pool.query('SELECT ... FROM products')` |
| 6 | **View** | 데이터를 HTML로 변환 | `views/user/products/list.ejs` |
| 7 | **브라우저** | HTML 렌더링 및 표시 | 사용자가 보는 화면 |

---

## 10. 요청-응답 사이클 완전 해부 – 코드와 함께 단계별로

이제 실제 프로젝트 코드 수준에서 **한 단계씩 정확히 무슨 일이 일어나는지** 살펴봅시다.

### 10-1. 시작: 사용자가 링크를 클릭

```html
<!-- 어딘가의 HTML에서 -->
<a href="/products/category/7">전자제품 보기</a>
```

사용자가 이 링크를 클릭하면:
- 브라우저가 `GET /products/category/7` HTTP 요청을 서버로 전송

### 10-2. app.js: 요청 수신 및 라우터 위임

```js
// app.js (개념 예시)
const express = require('express');
const app = express();

// 1) 공통 미들웨어 (세션, Passport 등)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ /* 세션 설정 */ }));

// 2) 라우터 연결
const productsRouter = require('./routes/products');
app.use('/products', productsRouter);
// ↑ "/products"로 시작하는 모든 요청은 productsRouter로 위임

app.listen(3000);
```

**동작**:
- Express가 요청 URL `/products/category/7`을 받음
- `/products`로 시작하므로 `productsRouter`로 전달
- 남은 경로는 `/category/7`

### 10-3. routes/products.js: URL 패턴 매칭

```js
// routes/products.js
const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

// GET /products/
router.get('/', productController.getList);

// GET /products/category/:categoryId
router.get('/category/:categoryId', productController.getList);
//                   ↑ 변수 자리
// GET /products/:id (상품 상세)
router.get('/:id', productController.getDetail);

module.exports = router;
```

**동작**:
- 남은 경로 `/category/7`이 `/category/:categoryId` 패턴과 매칭
- `req.params = { categoryId: '7' }` 설정
- `productController.getList` 함수 실행

**중요**: URL 순서 주의!
```js
// ❌ 잘못된 순서 - /:id가 먼저 와서 'category'를 id로 인식
router.get('/:id', productController.getDetail);
router.get('/category/:categoryId', productController.getList);

// ✅ 올바른 순서 - 구체적인 패턴을 먼저
router.get('/category/:categoryId', productController.getList);
router.get('/:id', productController.getDetail);
```

### 10-4. controllers/productController.js: 비즈니스 로직 실행

```js
// controllers/productController.js
const pool = require('../config/db');

exports.getList = async (req, res, next) => {
  try {
    // 1) 파라미터 읽기
    const categoryId = req.params.categoryId; // '7'

    // 2) DB 쿼리 실행 (Model 역할)
    let query, params;

    if (categoryId) {
      query = `
        SELECT p.*, c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.category_id = ? AND p.is_deleted = 0
        ORDER BY p.created_at DESC
      `;
      params = [categoryId];
    } else {
      query = `
        SELECT p.*, c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.is_deleted = 0
        ORDER BY p.created_at DESC
      `;
      params = [];
    }

    const [products] = await pool.query(query, params);

    // 3) 카테고리 정보 조회 (제목 표시용)
    let categoryName = '전체 상품';
    if (categoryId) {
      const [categories] = await pool.query(
        'SELECT name FROM categories WHERE id = ?',
        [categoryId]
      );
      if (categories.length > 0) {
        categoryName = categories[0].name;
      }
    }

    // 4) 뷰 렌더링 (View 선택)
    res.render('user/products/list', {
      title: `${categoryName} 목록`,
      products,
      currentCategoryId: categoryId,
      categoryName,
    });

  } catch (err) {
    console.error('상품 목록 조회 에러:', err);
    next(err); // 에러 미들웨어로 전달
  }
};
```

**핵심 포인트**:
- `async/await`로 비동기 DB 조회
- `pool.query`의 첫 번째 반환값 `[products]`가 실제 데이터 (두 번째는 메타데이터)
- SQL 인젝션 방지를 위해 `?` 플레이스홀더 사용
- 에러는 `next(err)`로 전달해서 Express 에러 핸들러가 처리하게 함

### 10-5. views/user/products/list.ejs: HTML 생성

```ejs
<%- layout('layouts/main_layout') %>

<!-- 제목 섹션 -->
<div class="container mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold mb-6">
    <%= categoryName %>
  </h1>

  <!-- 상품 그리드 -->
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
    <% if (products.length === 0) { %>
      <div class="col-span-full text-center text-gray-500 py-12">
        등록된 상품이 없습니다.
      </div>
    <% } else { %>
      <% products.forEach(function(product) { %>
        <a href="/products/<%= product.id %>" class="block border rounded-lg overflow-hidden hover:shadow-lg transition">
          <!-- 상품 이미지 -->
          <div class="aspect-square bg-gray-100">
            <% if (product.thumbnail_url) { %>
              <img src="<%= product.thumbnail_url %>"
                   alt="<%= product.name %>"
                   class="w-full h-full object-cover">
            <% } else { %>
              <div class="w-full h-full flex items-center justify-center text-gray-400">
                이미지 없음
              </div>
            <% } %>
          </div>

          <!-- 상품 정보 -->
          <div class="p-4">
            <h2 class="font-semibold text-lg mb-2 truncate">
              <%= product.name %>
            </h2>
            <p class="text-gray-600 text-sm mb-2">
              <%= product.category_name %>
            </p>
            <p class="text-xl font-bold text-blue-600">
              <%= product.price.toLocaleString() %>원
            </p>

            <% if (product.stock_quantity === 0) { %>
              <span class="inline-block mt-2 px-2 py-1 bg-red-100 text-red-700 text-xs rounded">
                품절
              </span>
            <% } %>
          </div>
        </a>
      <% }); %>
    <% } %>
  </div>
</div>
```

**EJS 렌더링 과정**:
1. `<%- layout(...) %>`로 레이아웃 지정
2. 컨트롤러에서 넘긴 `categoryName`, `products` 변수 사용
3. `<% if/forEach %>` 로 로직 실행
4. `<%= %>` 로 변수 출력 (HTML 이스케이프)
5. 최종 HTML 문자열 생성

### 10-6. 브라우저: HTML 수신 및 렌더링

생성된 HTML이 브라우저로 전송되면:
1. 브라우저가 HTML 파싱
2. CSS (`/css/style.css`) 로드
3. 이미지 (`/uploads/products/...`) 로드
4. 사용자에게 렌더링된 페이지 표시

---

## 11. 흔한 MVC 실수 TOP 7 – 그리고 해결 방법

### 실수 1: 라우터 순서 잘못 배치

```js
// ❌ 문제: /:id가 /category/:categoryId보다 먼저 매칭됨
router.get('/:id', productController.getDetail);
router.get('/category/:categoryId', productController.getList);
// → /products/category/7 요청 시 'category'를 id로 인식

// ✅ 해결: 구체적인 패턴을 먼저 정의
router.get('/category/:categoryId', productController.getList);
router.get('/:id', productController.getDetail);
```

### 실수 2: async 함수 안에서 await 빼먹기

```js
// ❌ 문제: await 없이 쿼리 실행
exports.getList = async (req, res, next) => {
  const [products] = pool.query('SELECT * FROM products');
  // ↑ Promise 객체가 반환됨 (실제 데이터 아님)
  res.render('user/products/list', { products });
};

// ✅ 해결: await 추가
exports.getList = async (req, res, next) => {
  const [products] = await pool.query('SELECT * FROM products');
  //                  ↑↑↑↑↑
  res.render('user/products/list', { products });
};
```

### 실수 3: 컨트롤러에서 에러 처리 안 함

```js
// ❌ 문제: try-catch 없음 → 에러 시 서버 크래시
exports.getList = async (req, res) => {
  const [products] = await pool.query('SELCT * FROM products'); // 오타!
  res.render('user/products/list', { products });
};

// ✅ 해결: try-catch로 감싸기
exports.getList = async (req, res, next) => {
  try {
    const [products] = await pool.query('SELECT * FROM products');
    res.render('user/products/list', { products });
  } catch (err) {
    console.error('상품 목록 에러:', err);
    next(err); // Express 에러 핸들러로 전달
  }
};
```

### 실수 4: SQL 인젝션 취약점

```js
// ❌ 위험: 사용자 입력을 직접 문자열에 삽입
const categoryId = req.params.categoryId;
const query = `SELECT * FROM products WHERE category_id = ${categoryId}`;
const [products] = await pool.query(query);
// → SQL 인젝션 공격 가능!

// ✅ 안전: 플레이스홀더(?) 사용
const categoryId = req.params.categoryId;
const query = 'SELECT * FROM products WHERE category_id = ?';
const [products] = await pool.query(query, [categoryId]);
//                                          ↑ 배열로 전달
```

### 실수 5: 뷰에서 undefined 변수 참조

```js
// 컨트롤러
res.render('user/products/list', {
  products,
  // categoryName을 전달하지 않음!
});
```

```ejs
<!-- 뷰 -->
<h1><%= categoryName %></h1>
<!-- ↑ ReferenceError: categoryName is not defined -->
```

**해결 방법**:
```js
// ✅ 방법 1: 컨트롤러에서 모든 변수 전달
res.render('user/products/list', {
  products,
  categoryName: categoryName || '전체 상품',
});

// ✅ 방법 2: 뷰에서 방어 코드
<h1><%= typeof categoryName !== 'undefined' ? categoryName : '전체 상품' %></h1>

// ✅ 방법 3: locals 기본값 설정 (app.js)
app.use((req, res, next) => {
  res.locals.categoryName = res.locals.categoryName || '전체 상품';
  next();
});
```

### 실수 6: 레이아웃 경로 오타

```ejs
<!-- ❌ 문제: 경로 오타 -->
<%- layout('layout/main_layout') %>
<!--        ^^^^^^ layouts가 아니라 layout -->

<!-- ✅ 해결: 정확한 경로 -->
<%- layout('layouts/main_layout') %>
```

### 실수 7: res.render 후 추가 응답 시도

```js
// ❌ 문제: 이미 응답을 보낸 후 다시 응답 시도
exports.getList = async (req, res, next) => {
  try {
    const [products] = await pool.query('SELECT * FROM products');
    res.render('user/products/list', { products });
    res.json({ success: true }); // ← Error: Cannot set headers after they are sent
  } catch (err) {
    next(err);
  }
};

// ✅ 해결: 한 번만 응답
exports.getList = async (req, res, next) => {
  try {
    const [products] = await pool.query('SELECT * FROM products');
    res.render('user/products/list', { products });
    // 여기서 끝! 더 이상 res.send/json/render 호출 금지
  } catch (err) {
    next(err);
  }
};
```

---

## 12. MVC 애플리케이션 디버깅 가이드 – 어디서 문제가 생겼을까?

에러가 발생했을 때, **어느 계층(Layer)**에서 문제가 생긴 건지 빠르게 파악하는 방법입니다.

### 12-1. 디버깅 체크리스트

```
┌─────────────────────────────────────────────────────────────┐
│ 에러 발생! → 어느 계층이 문제인가?                           │
└─────────────────────────────────────────────────────────────┘
           │
           ↓
    ┌──────────────┐
    │ 1. 라우터?   │ → URL이 매칭 안 됨? 404 에러?
    └──────┬───────┘    → routes/*.js 파일 확인
           │            → app.js에서 라우터 연결 확인
           ↓
    ┌──────────────┐
    │ 2. 컨트롤러? │ → 500 에러? 함수 실행 중 크래시?
    └──────┬───────┘    → controllers/*.js 확인
           │            → console.log로 변수 값 확인
           ↓
    ┌──────────────┐
    │ 3. 모델/DB?  │ → SQL 에러? 테이블/컬럼 없음?
    └──────┬───────┘    → MySQL 워크벤치에서 쿼리 직접 실행
           │            → 테이블 구조 확인 (DESCRIBE 테이블명)
           ↓
    ┌──────────────┐
    │ 4. 뷰?       │ → 렌더링 에러? 변수 undefined?
    └──────────────┘    → views/**/*.ejs 확인
                        → 컨트롤러에서 전달한 변수명 일치 확인
```

### 12-2. 계층별 디버깅 방법

#### 라우터 문제 디버깅

**증상**:
- `Cannot GET /products/category/7` (404 에러)
- 라우터 함수가 실행 안 됨

**체크 포인트**:
```js
// 1) app.js에서 라우터 연결 확인
console.log('라우터 연결됨:', require('./routes/products'));
app.use('/products', require('./routes/products'));

// 2) routes/products.js에서 패턴 확인
router.get('/category/:categoryId', (req, res) => {
  console.log('라우터 실행됨! params:', req.params);
  // ...
});

// 3) URL 패턴 순서 확인
// 구체적인 패턴이 먼저 와야 함
```

#### 컨트롤러 문제 디버깅

**증상**:
- 500 Internal Server Error
- 서버 콘솔에 에러 로그

**체크 포인트**:
```js
exports.getList = async (req, res, next) => {
  console.log('1. 컨트롤러 시작');
  console.log('2. params:', req.params);

  try {
    console.log('3. DB 쿼리 실행 전');
    const [products] = await pool.query('SELECT * FROM products');
    console.log('4. DB 쿼리 결과:', products.length, '개');

    console.log('5. 렌더링 직전');
    res.render('user/products/list', { products });
    console.log('6. 렌더링 완료');
  } catch (err) {
    console.error('❌ 에러 발생:', err.message);
    console.error('❌ 전체 스택:', err.stack);
    next(err);
  }
};
```

#### 모델/DB 문제 디버깅

**증상**:
- SQL syntax error
- ER_NO_SUCH_TABLE: Table 'db_name.products' doesn't exist
- ER_BAD_FIELD_ERROR: Unknown column

**체크 포인트**:
```sql
-- 1) 테이블 존재 확인
SHOW TABLES;

-- 2) 테이블 구조 확인
DESCRIBE products;

-- 3) 쿼리 직접 실행 테스트
SELECT * FROM products WHERE category_id = 7;

-- 4) 데이터 있는지 확인
SELECT COUNT(*) FROM products;
```

```js
// 쿼리 로깅
const query = 'SELECT * FROM products WHERE category_id = ?';
const params = [categoryId];
console.log('실행할 쿼리:', query);
console.log('파라미터:', params);

const [products] = await pool.query(query, params);
console.log('조회 결과:', products);
```

#### 뷰 문제 디버깅

**증상**:
- ReferenceError: products is not defined
- Cannot read property 'name' of undefined
- 화면이 깨지거나 일부만 렌더링됨

**체크 포인트**:
```js
// 컨트롤러에서 전달하는 변수 로깅
const renderData = {
  title: '상품 목록',
  products,
  categoryName,
};
console.log('뷰에 전달하는 데이터:', renderData);
res.render('user/products/list', renderData);
```

```ejs
<!-- 뷰에서 받은 데이터 확인 -->
<%# 디버깅용 출력 (주석으로 제거 가능) %>
<pre style="background: #f0f0f0; padding: 10px;">
<%= JSON.stringify({
  title: typeof title !== 'undefined' ? title : 'undefined',
  products: typeof products !== 'undefined' ? products.length : 'undefined',
  categoryName: typeof categoryName !== 'undefined' ? categoryName : 'undefined'
}, null, 2) %>
</pre>

<!-- 안전한 변수 접근 -->
<% if (typeof products !== 'undefined' && products.length > 0) { %>
  <% products.forEach(p => { %>
    <div><%= p.name %></div>
  <% }) %>
<% } else { %>
  <p>상품 없음</p>
<% } %>
```

---

## 13. 실전 실습 – MVC로 "리뷰" 기능 만들어 보기

이제 배운 MVC 지식을 활용해서, **상품 리뷰 기능**을 처음부터 끝까지 만들어 보겠습니다.

### 13-1. 기능 요구사항 정의 (1분)

- 사용자는 구매한 상품에 대해 리뷰를 작성할 수 있다
- 리뷰 목록은 상품 상세 페이지에서 볼 수 있다
- 리뷰에는 별점(1-5), 내용, 작성자, 작성일이 포함된다

**MVC 관점 정리**:
- **Model**: `product_reviews` 테이블 필요
- **Controller**: 리뷰 목록 조회, 리뷰 작성 함수
- **Router**: `GET /products/:id/reviews`, `POST /products/:id/reviews`
- **View**: 리뷰 목록 표시, 리뷰 작성 폼

### 13-2. STEP 1: Model – DB 테이블 설계 (5분)

```sql
-- tables.sql에 추가
CREATE TABLE product_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  user_id INT NOT NULL,
  rating TINYINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT(1) DEFAULT 0,

  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

  INDEX idx_product_id (product_id),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='상품 리뷰';
```

**MySQL에서 실행**:
```bash
mysql -u root -p < tables.sql
# 또는 MySQL Workbench에서 직접 실행
```

### 13-3. STEP 2: Controller – 리뷰 로직 작성 (10분)

```js
// controllers/reviewController.js (새 파일 생성)
const pool = require('../config/db');

/**
 * 특정 상품의 리뷰 목록 조회
 * GET /products/:productId/reviews
 */
exports.getReviewsByProduct = async (req, res, next) => {
  try {
    const productId = req.params.productId;

    const query = `
      SELECT
        r.id,
        r.rating,
        r.content,
        r.created_at,
        u.username,
        u.email
      FROM product_reviews r
      INNER JOIN users u ON r.user_id = u.id
      WHERE r.product_id = ? AND r.is_deleted = 0
      ORDER BY r.created_at DESC
    `;

    const [reviews] = await pool.query(query, [productId]);

    // 평균 별점 계산
    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    res.json({
      success: true,
      reviews,
      avgRating: avgRating.toFixed(1),
      totalCount: reviews.length,
    });
  } catch (err) {
    console.error('리뷰 조회 에러:', err);
    next(err);
  }
};

/**
 * 리뷰 작성
 * POST /products/:productId/reviews
 */
exports.createReview = async (req, res, next) => {
  try {
    const productId = req.params.productId;
    const userId = req.user?.id; // Passport 인증 필요
    const { rating, content } = req.body;

    // 1) 입력 검증
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: '로그인이 필요합니다.'
      });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: '별점은 1~5 사이여야 합니다.'
      });
    }

    if (!content || content.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: '리뷰 내용은 최소 10자 이상이어야 합니다.'
      });
    }

    // 2) 중복 리뷰 체크 (선택사항)
    const [existing] = await pool.query(
      'SELECT id FROM product_reviews WHERE product_id = ? AND user_id = ? AND is_deleted = 0',
      [productId, userId]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: '이미 이 상품에 리뷰를 작성하셨습니다.'
      });
    }

    // 3) 리뷰 저장
    const insertQuery = `
      INSERT INTO product_reviews (product_id, user_id, rating, content)
      VALUES (?, ?, ?, ?)
    `;

    const [result] = await pool.query(insertQuery, [
      productId,
      userId,
      rating,
      content.trim(),
    ]);

    res.json({
      success: true,
      message: '리뷰가 등록되었습니다.',
      reviewId: result.insertId,
    });
  } catch (err) {
    console.error('리뷰 작성 에러:', err);
    next(err);
  }
};
```

### 13-4. STEP 3: Router – URL 연결 (5분)

```js
// routes/products.js에 추가
const reviewController = require('../controllers/reviewController');

// 기존 라우트들...
router.get('/', productController.getList);
router.get('/:id', productController.getDetail);

// 리뷰 라우트 추가
router.get('/:productId/reviews', reviewController.getReviewsByProduct);
router.post('/:productId/reviews', reviewController.createReview);

module.exports = router;
```

**또는 별도 파일로 분리**:
```js
// routes/reviews.js (새 파일)
const express = require('express');
const router = express.Router({ mergeParams: true }); // 중요!
const reviewController = require('../controllers/reviewController');

router.get('/', reviewController.getReviewsByProduct);
router.post('/', reviewController.createReview);

module.exports = router;
```

```js
// routes/products.js
const reviewRouter = require('./reviews');

router.use('/:productId/reviews', reviewRouter);
```

### 13-5. STEP 4: View – 화면에 표시 (10분)

```ejs
<!-- views/user/products/detail.ejs에 추가 -->

<!-- 기존 상품 상세 정보 ... -->

<!-- 리뷰 섹션 -->
<div class="mt-12">
  <h2 class="text-2xl font-bold mb-6">상품 리뷰</h2>

  <!-- 리뷰 작성 폼 (로그인한 사용자만) -->
  <% if (user) { %>
    <div class="bg-gray-50 p-6 rounded-lg mb-8">
      <h3 class="font-semibold mb-4">리뷰 작성하기</h3>
      <form id="reviewForm" class="space-y-4">
        <!-- 별점 선택 -->
        <div>
          <label class="block mb-2 font-medium">별점</label>
          <div class="flex gap-2">
            <% for (let i = 1; i <= 5; i++) { %>
              <label class="cursor-pointer">
                <input type="radio" name="rating" value="<%= i %>" class="hidden peer" required>
                <span class="text-3xl peer-checked:text-yellow-400 text-gray-300">★</span>
              </label>
            <% } %>
          </div>
        </div>

        <!-- 리뷰 내용 -->
        <div>
          <label class="block mb-2 font-medium">리뷰 내용</label>
          <textarea
            name="content"
            rows="4"
            class="w-full border rounded-lg p-3"
            placeholder="상품에 대한 솔직한 리뷰를 작성해 주세요 (최소 10자)"
            required
          ></textarea>
        </div>

        <button
          type="submit"
          class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
        >
          리뷰 등록
        </button>
      </form>
    </div>
  <% } else { %>
    <p class="text-gray-500 mb-8">
      <a href="/auth/login" class="text-blue-600 underline">로그인</a>하시면 리뷰를 작성할 수 있습니다.
    </p>
  <% } %>

  <!-- 리뷰 목록 -->
  <div id="reviewList" class="space-y-4">
    <!-- JavaScript로 동적 로드 -->
  </div>
</div>

<script>
// 리뷰 목록 로드
async function loadReviews() {
  try {
    const productId = '<%= product.id %>';
    const res = await fetch(`/products/${productId}/reviews`);
    const data = await res.json();

    const reviewList = document.getElementById('reviewList');

    if (data.reviews.length === 0) {
      reviewList.innerHTML = '<p class="text-gray-500">첫 리뷰를 작성해 주세요!</p>';
      return;
    }

    reviewList.innerHTML = `
      <div class="mb-4">
        <span class="text-lg font-semibold">평균 별점: ${data.avgRating}</span>
        <span class="text-gray-500">(총 ${data.totalCount}개 리뷰)</span>
      </div>
      ${data.reviews.map(review => `
        <div class="border rounded-lg p-4">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-yellow-400">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span>
            <span class="font-semibold">${review.username}</span>
            <span class="text-sm text-gray-500">${new Date(review.created_at).toLocaleDateString('ko-KR')}</span>
          </div>
          <p class="text-gray-700">${review.content}</p>
        </div>
      `).join('')}
    `;
  } catch (err) {
    console.error('리뷰 로드 실패:', err);
  }
}

// 리뷰 작성 폼 제출
const reviewForm = document.getElementById('reviewForm');
if (reviewForm) {
  reviewForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const productId = '<%= product.id %>';

    try {
      const res = await fetch(`/products/${productId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: parseInt(formData.get('rating')),
          content: formData.get('content'),
        }),
      });

      const data = await res.json();

      if (data.success) {
        alert('리뷰가 등록되었습니다!');
        e.target.reset();
        loadReviews(); // 목록 새로고침
      } else {
        alert(data.message || '리뷰 등록 실패');
      }
    } catch (err) {
      console.error('리뷰 등록 실패:', err);
      alert('리뷰 등록 중 오류가 발생했습니다.');
    }
  });
}

// 페이지 로드 시 리뷰 목록 가져오기
loadReviews();
</script>
```

### 13-6. STEP 5: 테스트 (5분)

1. **서버 재시작**
   ```bash
   npm run dev
   ```

2. **테스트 시나리오**
   - [ ] 상품 상세 페이지 접속 → 리뷰 섹션 표시 확인
   - [ ] 로그아웃 상태 → "로그인하시면..." 메시지 확인
   - [ ] 로그인 → 리뷰 작성 폼 표시 확인
   - [ ] 리뷰 작성 (별점 + 내용) → "리뷰가 등록되었습니다" 확인
   - [ ] 페이지 새로고침 → 작성한 리뷰가 목록에 표시되는지 확인
   - [ ] 다른 계정으로 로그인 → 다른 리뷰 작성 → 목록에 여러 리뷰 표시 확인

3. **에러 테스트**
   - [ ] 별점 없이 제출 → 브라우저 required 검증
   - [ ] 10자 미만 내용 → "최소 10자 이상" 에러 메시지
   - [ ] 중복 리뷰 작성 → "이미 작성하셨습니다" 메시지

### 13-7. 실습 정리 – MVC 각 계층의 역할 복습

| 계층 | 파일 | 역할 | 핵심 코드 |
|-----|------|------|----------|
| **Model** | `tables.sql` | 데이터 구조 정의 | `CREATE TABLE product_reviews` |
| **Controller** | `controllers/reviewController.js` | 비즈니스 로직, DB 조회/저장 | `pool.query(...)`, 검증 로직 |
| **Router** | `routes/products.js` | URL → Controller 연결 | `router.post('/:productId/reviews', ...)` |
| **View** | `views/user/products/detail.ejs` | 화면 렌더링 | EJS 템플릿 + JavaScript |

---

## 14. MVC 베스트 프랙티스 체크리스트

새 기능을 만들 때마다 아래 체크리스트를 확인하세요.

### ✅ Model (DB) 체크리스트

- [ ] 테이블 이름은 복수형으로 (products, users, reviews)
- [ ] PRIMARY KEY는 id (AUTO_INCREMENT)
- [ ] 외래 키(FK)에는 INDEX 추가
- [ ] 소프트 삭제 사용 시 is_deleted 컬럼 추가
- [ ] created_at, updated_at 타임스탬프 추가
- [ ] 문자열 컬럼에는 적절한 길이 제한 (VARCHAR(255) 등)
- [ ] 필수 컬럼에는 NOT NULL 제약
- [ ] CHARSET utf8mb4, COLLATE utf8mb4_unicode_ci 설정

### ✅ Controller 체크리스트

- [ ] 모든 컨트롤러 함수는 async 함수
- [ ] DB 쿼리는 반드시 await 사용
- [ ] try-catch로 에러 처리
- [ ] SQL 인젝션 방지 (? 플레이스홀더 사용)
- [ ] 사용자 입력 검증 (빈 값, 길이, 형식 등)
- [ ] 에러는 next(err)로 전달
- [ ] 성공 응답은 res.render 또는 res.json 한 번만 호출
- [ ] 민감한 정보 (비밀번호 등)는 SELECT에서 제외

### ✅ Router 체크리스트

- [ ] 구체적인 패턴을 먼저 정의 (/category/:id 다음에 /:id)
- [ ] REST 원칙 준수 (GET=조회, POST=생성, PUT=수정, DELETE=삭제)
- [ ] 파라미터 이름은 의미 있게 (:id, :categoryId, :userId)
- [ ] 관리자 라우트는 인증 미들웨어 적용
- [ ] app.js에서 라우터 연결 확인

### ✅ View 체크리스트

- [ ] 레이아웃 경로 정확히 지정 (layouts/main_layout)
- [ ] 사용자 입력은 `<%= %>` 로 출력 (XSS 방지)
- [ ] undefined 에러 방지 (typeof 체크 또는 기본값)
- [ ] 빈 배열 처리 (products.length === 0)
- [ ] Tailwind 클래스로 일관된 디자인
- [ ] 모바일 반응형 고려 (md:, lg: 등)

---

## 15. 자주 묻는 질문 (FAQ)

### Q1. 이 프로젝트는 왜 별도 models/ 폴더가 없나요?

**A**: 엄격한 MVC 프레임워크(Laravel, Rails 등)와 달리, 이 프로젝트는 **경량 MVC 스타일**을 따릅니다.
- Model 역할은 MySQL 테이블 + 컨트롤러 안의 `pool.query`가 담당
- 규모가 커지면 models/ 폴더를 만들어 분리할 수 있지만, 소규모 프로젝트에서는 컨트롤러에 포함하는 것이 더 간단함

### Q2. 컨트롤러와 라우터 중 어디에 로직을 넣어야 하나요?

**A**: **비즈니스 로직은 컨트롤러에**, **URL 매칭만 라우터에**
```js
// ❌ 라우터에 로직 (나쁨)
router.get('/products', async (req, res) => {
  const [products] = await pool.query('SELECT * FROM products');
  res.render('user/products/list', { products });
});

// ✅ 컨트롤러로 분리 (좋음)
router.get('/products', productController.getList);
```

### Q3. res.render와 res.json은 언제 구분해서 쓰나요?

**A**:
- `res.render('view', data)`: **서버 사이드 렌더링 (SSR)** - 전체 HTML 페이지 생성
- `res.json(data)`: **API 응답** - JavaScript fetch로 호출, AJAX/SPA 용도

이 프로젝트는 주로 SSR이지만, 리뷰 같은 일부 기능은 JSON API로 구현

### Q4. async/await가 헷갈려요. 언제 써야 하나요?

**A**:
```js
// ❌ 잘못된 패턴
exports.getList = async (req, res, next) => {
  const [products] = pool.query('SELECT ...'); // await 없음!
  // → products는 Promise 객체 (실제 데이터 아님)
};

// ✅ 올바른 패턴
exports.getList = async (req, res, next) => {
  const [products] = await pool.query('SELECT ...');
  // → products는 실제 배열 데이터
};
```

**규칙**:
- `async` 함수 안에서만 `await` 사용 가능
- `pool.query`, `fs.readFile`, `fetch` 등 비동기 작업에는 반드시 `await`

### Q5. EJS에서 <%= %>와 <%- %>의 차이는?

**A**:
```ejs
<% const html = '<script>alert("XSS")</script>'; %>

<!-- ✅ 안전: HTML 이스케이프 (태그가 문자열로 표시됨) -->
<div><%= html %></div>
<!-- 출력: <div>&lt;script&gt;alert("XSS")&lt;/script&gt;</div> -->

<!-- ❌ 위험: HTML 이스케이프 안 함 (스크립트 실행됨!) -->
<div><%- html %></div>
<!-- 출력: <div><script>alert("XSS")</script></div> (XSS 공격) -->
```

**원칙**: 사용자 입력은 항상 `<%= %>`

### Q6. URL 패턴 순서가 왜 중요한가요?

**A**: Express는 **위에서 아래로 순서대로** 패턴을 매칭합니다.

```js
// ❌ 잘못된 순서
router.get('/:id', productController.getDetail); // 먼저 매칭
router.get('/new', productController.getNewForm); // 절대 실행 안 됨!
// → /products/new 요청 시 'new'를 id로 인식

// ✅ 올바른 순서
router.get('/new', productController.getNewForm); // 구체적인 패턴 먼저
router.get('/:id', productController.getDetail);   // 변수 패턴은 나중에
```

### Q7. MVC를 모르고도 바이브코딩이 가능한가요?

**A**: 가능하지만, **MVC를 알면 AI에게 더 정확한 요청**을 할 수 있습니다.

**MVC 모르고 요청**:
> "공지사항 기능을 만들어 줘"
> → AI가 어디에 뭘 만들어야 할지 추측해야 함

**MVC 알고 요청**:
> "공지사항 기능을 만들고 싶어. 1) tables.sql에 notices 테이블 추가, 2) controllers/noticeController.js에 getList/getDetail 함수 작성, 3) routes/notices.js에 라우터 연결, 4) views/user/notices/ 에 list.ejs, detail.ejs 작성해 줘. 이 프로젝트는 MVC 패턴을 따르고 있어."
> → AI가 정확히 이해하고 프로젝트 구조에 맞게 코드 생성

---

## 16. 다음 단계 – MVC 마스터로 가는 길

이제 MVC 기본을 이해했다면, 다음 단계로 넘어갈 수 있습니다.

### 16-1. 추천 학습 순서

1. ✅ **이 문서 (mvc.md)** - MVC 개념과 프로젝트 구조 이해
2. → [mysql.md](./mysql.md) - DB 스키마 설계, SQL 쿼리 작성법
3. → [express_libs.md](./express_libs.md) - Express 미들웨어 이해
4. → [example_notice.md](./example_notice.md) - 공지사항 기능 전체 구현 예제
5. → [example_google_login.md](./example_google_login.md) - 복잡한 기능 구현 예제

### 16-2. 실전 연습 과제

**초급**:
- [ ] FAQ 페이지 만들기 (이 문서의 Section 13 참고)
- [ ] 공지사항에 조회수 추가하기
- [ ] 상품 목록에 정렬 옵션 추가 (최신순, 가격순, 인기순)

**중급**:
- [ ] 상품 찜하기 기능 (users_wishlist 테이블)
- [ ] 1:1 문의 답변 기능 (관리자 → 사용자)
- [ ] 쿠폰 다운로드 기능 (user_coupons 테이블)

**고급**:
- [ ] 주문/결제 통합 테스트
- [ ] 실시간 알림 시스템 (Socket.IO)
- [ ] 이미지 최적화 자동화 (sharp 라이브러리)

### 16-3. 도움이 되는 리소스

- **공식 문서**:
  - [Express.js 공식 가이드](https://expressjs.com/)
  - [EJS 공식 문서](https://ejs.co/)
  - [MySQL 8 레퍼런스](https://dev.mysql.com/doc/refman/8.0/en/)

- **이 프로젝트 문서**:
  - [프로젝트 구조](./project_structure.md) - 폴더/파일 설명
  - [바이브코딩 가이드](./vibe_coding.md) - AI와 협업하는 법
  - [워크플로우](./workflow.md) - 기능 추가 전체 흐름

---

## 17. 마무리 – MVC는 "지도"입니다

MVC를 배운다는 것은 **코드라는 미로에서 길을 잃지 않는 지도를 얻는 것**과 같습니다.

어떤 기능을 만들 때:
- **"URL은 어디?"** → Router
- **"데이터는 어디?"** → Model (DB)
- **"처리는 어디?"** → Controller
- **"화면은 어디?"** → View

이 네 가지만 기억하면, 복잡해 보이는 웹 애플리케이션도 결국 **이 네 가지의 조합**일 뿐입니다.

이제 여러분은:
- ✅ MVC가 무엇인지 이해했습니다
- ✅ 이 프로젝트에서 MVC가 어떻게 적용되었는지 알았습니다
- ✅ 요청이 app.js → Router → Controller → Model → View를 거치는 전체 흐름을 그릴 수 있습니다
- ✅ 실제로 리뷰 기능을 MVC 패턴으로 구현해 봤습니다

**다음 단계**: [workflow.md](./workflow.md)로 이동해서 실제 기능 개발 워크플로우를 익혀 보세요!
