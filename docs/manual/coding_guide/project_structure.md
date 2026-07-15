# 프로젝트 폴더 구조 – 어디에 무엇이 있는지 한눈에 보기

이 문서는 **비개발자 / Node.js 초보자**가 이 쇼핑몰 프로젝트를 열었을 때

- 폴더와 파일들이 **무엇을 뜻하는지**
- 새 기능을 넣을 때 **어디를 손대야 하는지**
- 바이브코딩할 때 AI에게 **어떤 경로를 알려 주면 좋은지**

를 이해하도록 돕는 **지도로 쓰이는 문서**입니다.

---

## 1. 루트 구조 전체 그림

프로젝트 최상위(루트)에서 보면 대략 이렇게 생겼습니다.

```text
yd-mall/
├── app.js                 # 진입점. Express 앱, 미들웨어, 라우터 연결
├── package.json           # 프로젝트 정보, npm 스크립트, 의존성
├── .env                   # 환경 변수 (DB, 세션, API 키 등) — git에 올리지 않음
├── config/                # DB, Passport, 시스템 설정 등
├── controllers/           # 요청 처리 로직 (DB 조회·저장, 뷰 선택)
├── routes/                # URL → 컨트롤러 매핑
├── views/                 # EJS 템플릿 (화면)
├── middleware/            # 공통 처리 (로그인 체크, 메뉴, 장바구니 등)
├── public/                # 정적 파일 (CSS, JS, 이미지)
├── docs/                  # 매뉴얼, 코딩 가이드 (Markdown)
├── scripts/               # DB 초기화, 마이그레이션 스크립트
├── tables.sql             # DB 테이블 정의 모음
└── logs/, uploads/, ...  # 로그, 업로드 파일 등
```

이제 각 폴더가 구체적으로 무슨 역할을 하는지 하나씩 보겠습니다.

---

## 2. app.js – 서버의 시작점

- 위치: `app.js`
- 역할:
  - Express 앱 생성 (`const app = express()`)
  - 공통 미들웨어 등록 (세션, Passport, 사이트 설정, 메뉴, 장바구니 등)
  - 라우터 연결 (`app.use('/', indexRoutes)`, `app.use('/admin', adminRoutes)` 등)
  - 마지막에 `app.listen(PORT, ...)` 으로 서버 시작

이 파일은 **“이 프로젝트를 켜는 스위치이자, 전체 흐름을 엮는 곳”** 입니다.

바이브코딩할 때는 이렇게 설명해 줄 수 있습니다.

> "이 프로젝트의 진입점은 app.js이고, 여기에서 Express 앱을 만들고 routes/ 폴더의 라우터들을 연결해. 공통 미들웨어(세션, 로그인, 사이트 설정 등)도 app.js에 붙어 있어."

---

## 3. config/ – 환경과 설정 모음

- 위치: `config/`
- 주요 파일:
  - `db.js` : MySQL **연결 풀(pool)** 설정
  - `passport.js` : 로그인/인증(Passport) 전략 설정 (로컬, 구글, 카카오 등)
  - `systemSettings.js` : DB에서 읽는 사이트 설정 관련 로직

여기에는 **환경에 따라 달라질 수 있는 설정** 과 **외부 시스템 연결 정보**가 모여 있습니다.

예를 들어 DB 주소, 아이디/비밀번호, 어떤 OAuth 클라이언트 ID를 쓸지 등은 코드가 아니라 `.env` + `config/` 에서 관리합니다.

---

## 4. routes/ – URL 설계도 (어떤 주소가 어떤 기능으로 가는지)

- 위치: `routes/`
- 역할: **URL 경로**를 **컨트롤러 함수**에 연결하는 곳

대표 파일들:

- 사용자 쪽
  - `routes/index.js` : `/` 메인, 검색, 공지, 문의 등 메인 라우트
  - `routes/products.js` : `/products` 관련
  - `routes/cart.js`, `routes/checkout.js` : 장바구니, 주문
  - `routes/notices.js`, `routes/inquiries.js`, `routes/terms.js` 등
- 인증/매뉴얼
  - `routes/auth.js` : `/auth/*` (로그인, 구글/카카오 콜백 등)
  - `routes/manual.js` : `/manual/*` (매뉴얼/코딩 가이드 페이지)
- 관리자 쪽
  - `routes/admin.js` : `/admin` 진입, 하위 관리자 라우터 묶음
  - `routes/admin/products.js`, `routes/admin/banners.js`, `routes/admin/users.js` 등

예를 들어 사용자가 `/products`로 들어오면:

1. app.js 에서 `app.use('/products', require('./routes/products'))` 로 연결
2. `routes/products.js` 에서 `router.get('/', productController.getList)` 같은 식으로 컨트롤러를 호출

새 URL을 만들고 싶을 때는 **routes/** 폴더에서 시작하면 됩니다.

> 예: `/faq` 페이지를 만들고 싶다면 `routes/faq.js` 생성 → app.js 에 `app.use('/faq', require('./routes/faq'))` 추가.

---

## 5. controllers/ – 실제 일을 하는 뇌 (비즈니스 로직)

- 위치: `controllers/`
- 역할:
  - 요청을 받아 **DB에서 데이터를 읽거나 쓰고**
  - 어떤 뷰를 사용할지 정한 후 `res.render(뷰, 데이터)` 로 화면을 렌더링

대표 파일들:

- 사용자 컨트롤러
  - `controllers/mainController.js` : 메인 페이지
  - `controllers/productController.js` : 상품 목록/상세
  - `controllers/cartController.js` : 장바구니
  - `controllers/checkoutController.js` : 주문/결제
  - `controllers/noticeController.js` : 공지사항
  - `controllers/inquiryController.js` : 1:1 문의
- 관리자 컨트롤러
  - `controllers/admin/productController.js`
  - `controllers/admin/bannerController.js`
  - `controllers/admin/userController.js`
  - `controllers/admin/settingsController.js` 등

컨트롤러 파일들은 보통 이런 패턴을 가집니다.

```js
const pool = require('../config/db');

exports.getSomething = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT ... FROM ... WHERE ...');
    res.render('어떤/뷰/경로', { data: rows });
  } catch (err) {
    next(err);
  }
};
```

바이브코딩할 때는 이렇게 말해 주면 좋습니다.

> "controllers/productController.js 에 상품 목록을 가져오는 getList 함수가 있고, mysql2/promise의 pool을 써. 여기에 카테고리 필터 기능을 추가해 줘."

---

## 6. views/ – 화면(HTML)을 담당하는 곳

- 위치: `views/`
- 기술: EJS + Tailwind CSS

구성:

- `views/layouts/`
  - `main_layout.ejs` : 사용자(쇼핑몰) 공통 레이아웃
  - `admin_layout.ejs` : 관리자 공통 레이아웃
  - `manual_layout.ejs` : 매뉴얼/코딩 가이드 레이아웃
- `views/user/`
  - `index.ejs` : 메인 페이지
  - `products/`, `cart/`, `checkout/`, `notices/`, `inquiries/` 등 사용자 화면
- `views/admin/`
  - `dashboard.ejs` : 관리자 대시보드
  - `products/`, `banners/`, `users/`, `settings/` 등 관리자 화면
- `views/manual/`
  - 매뉴얼/코딩 가이드 렌더링용 뷰

각 뷰 파일 상단에는 보통 다음과 같이 레이아웃을 지정합니다.

```ejs
<%- layout('layouts/main_layout') %>   <!-- 사용자 -->
<%- layout('layouts/admin_layout') %>  <!-- 관리자 -->
```

그리고 컨트롤러에서 넘겨준 데이터를 이런 식으로 씁니다.

```ejs
<h1><%= title %></h1>

<% products.forEach((p) => { %>
  <div><%= p.name %> - <%= p.price %>원</div>
<% }) %>
```

화면을 수정하고 싶을 때는 **views/** 에서 시작하면 됩니다.

> 예: 메인 화면에 문구 추가 → `views/user/index.ejs`

---

## 7. middleware/ – 여러 곳에서 공통으로 거치는 처리

- 위치: `middleware/`
- 역할: 요청이 컨트롤러에 도달하기 **전에** 또는 **후에** 공통으로 처리할 로직들을 모아 둔 곳

대표 파일들:

- `adminAuth.js` : 관리자 로그인 여부 확인
- `adminRoleGuard.js` : 관리자 권한(역할) 확인
- `siteSettings.js` : 사이트 설정을 미리 읽어 `res.locals` 에 넣기
- `menuData.js` : 메뉴/카테고리 목록을 미리 읽어 뷰에서 바로 쓸 수 있게 하기
- `cartData.js` : 로그인한 사용자의 장바구니 개수 등 공통 데이터
- `upload.js` : 상품/배너 이미지 업로드 설정 (multer)
- `visitorLogger.js` : 방문 로그 기록

이들은 app.js 또는 특정 라우터에서 이렇게 사용됩니다.

```js
const siteSettings = require('./middleware/siteSettings');
app.use(siteSettings);
```

공통 기능(예: “모든 페이지에서 사이트 제목, 메뉴, 장바구니 개수 보여 주기”)을 추가/수정하고 싶을 때는 **middleware/** 를 확인하면 됩니다.

---

## 8. public/ – 정적 파일 (브라우저가 직접 가져가는 것들)

- 위치: `public/`
- 내용:
  - `css/` : Tailwind에서 빌드된 `style.css` 와 기타 CSS
  - `js/` : 브라우저에서 실행되는 JS (예: 검색 모달, 숫자 포맷터 등)
  - `uploads/` : 업로드된 이미지 (배너, 상품, 로고 등)

Express에서는 app.js 에서 대략 이렇게 연결합니다.

```js
app.use(express.static('public'));
```

브라우저에서 `/css/style.css`, `/js/number-format.js`, `/uploads/products/이미지.jpg` 와 같이 직접 요청할 수 있습니다.

디자인이나 프론트 쪽 스크립트를 수정하고 싶을 때는 **public/** 와 **views/** 를 같이 보면 됩니다.

---

## 9. docs/ – 사용자/관리자 매뉴얼 + 코딩 가이드

- 위치: `docs/manual/`
- 구성:
  - `docs/manual/user/` : 사용자용 매뉴얼
  - `docs/manual/admin/` : 관리자용 매뉴얼
  - `docs/manual/coding_guide/` : 지금 보고 있는 코딩 가이드들

이 파일들은 모두 **Markdown(.md)** 형식이고,

- `/manual/user/...`
- `/manual/admin/...`
- `/manual/coding_guide/...`

URL을 통해 웹 화면으로도 볼 수 있습니다. Node.js 서버가 Markdown을 읽어 **marked** 라이브러리로 HTML로 바꿔 렌더링합니다.

문서 수정이 필요하면 **docs/** 아래 md 파일들을 직접 고치면 됩니다.

---

## 10. scripts/, tables.sql, logs/, 기타

- `scripts/`
  - DB 초기화, 마이그레이션용 Node.js 스크립트가 들어 있습니다.
  - 예: 초기 테이블 생성/데이터 삽입 스크립트 등
- `tables.sql`
  - 전체 테이블 정의(CREATE TABLE)가 모여 있는 파일입니다.
  - 새 테이블이 필요하면 이 파일에 추가하고, DB에 반영합니다.
- `logs/`
  - 방문/에러/운영 로그 파일을 저장하는 폴더입니다.

---

## 11. “이럴 때는 어디를 볼까?” – 상황별 길찾기

| 하고 싶은 일 | 먼저 볼 곳 | 그다음 |
|---------------|-----------|--------|
| 메인 페이지에 배너 하나 더 보여주기 | `routes/index.js` | `controllers/mainController.js` → `views/user/index.ejs` |
| 새 URL(`/faq`) 추가하기 | `routes/` (새 `routes/faq.js`) | `controllers/faqController.js`, `views/user/faq/` |
| 사용자 공지 목록 디자인 바꾸기 | `views/user/notices/list.ejs` | 필요 시 `controllers/noticeController.js` |
| 관리자 상품 목록 컬럼 추가 | `views/admin/products/list.ejs` | `controllers/admin/productController.js` |
| DB 테이블 구조 확인/수정 | `tables.sql` | DB 클라이언트(MySQL Workbench 등) |
| 구글/카카오 로그인 흐름 이해 | `config/passport.js` | `routes/auth.js`, `views/auth/login.ejs` |
| 모든 페이지에서 쓸 공통 데이터 추가 | `middleware/siteSettings.js`, `middleware/menuData.js` | app.js에서 미들웨어 등록 위치 |

바이브코딩을 할 때도, 이런 식으로 **“어떤 폴더에 어떤 역할이 있다”** 를 먼저 AI에게 알려주면, 더 정확한 파일 경로와 코드를 제안받기 쉽습니다.

> 예: "이 프로젝트는 app.js + routes/ + controllers/ + views/ 구조야. 관리자 기능은 routes/admin/ 과 controllers/admin/ 아래에 있어. 이 구조에 맞게 ~~ 기능을 추가해 줘."

이제 프로젝트를 열어 봤을 때, 파일이 많아도 **어디부터 손대야 할지 길을 잃지 않을 것**이 목표입니다.

다음 섹션부터는 **더 깊이** 들어가, 파일들이 서로 어떻게 연결되는지, 이름은 왜 이렇게 짓는지, 새 기능을 만들 때 무엇을 빠뜨리기 쉬운지 등을 다룹니다.

---

## 12. MVC 파일 관계 시각화 – 하나의 기능이 어떤 파일들을 거치는지

이 프로젝트는 **MVC(Model-View-Controller)** 패턴을 따릅니다.
하나의 기능(예: 상품 목록 보기)이 실행될 때, 요청은 여러 파일을 거쳐 화면까지 도달합니다.

### 12-1. 전체 흐름 다이어그램

```text
[브라우저] ──── GET /products ────▶

  ┌─────────────────────────────────────────────────────────────────────┐
  │  app.js                                                             │
  │  app.use('/products', require('./routes/products'))                  │
  │        │                                                            │
  │        ▼                                                            │
  │  ┌──────────────────────┐                                           │
  │  │  routes/products.js  │  ← URL과 컨트롤러를 연결하는 "이정표"     │
  │  │  router.get('/',     │                                           │
  │  │    productController │                                           │
  │  │      .getList)       │                                           │
  │  └────────┬─────────────┘                                           │
  │           │                                                         │
  │           ▼                                                         │
  │  ┌────────────────────────────────┐                                 │
  │  │  controllers/                  │                                 │
  │  │    productController.js        │  ← 실제 일을 하는 "뇌"          │
  │  │                                │                                 │
  │  │  exports.getList = async (...) │                                 │
  │  │    const [rows] = await        │                                 │
  │  │      pool.query('SELECT ...')  │──────┐                          │
  │  │    res.render('user/products/  │      │                          │
  │  │      list', { products: rows })│      │                          │
  │  └────────┬───────────────────────┘      │                          │
  │           │                              │                          │
  │           │                     ┌────────▼──────────┐               │
  │           │                     │  config/db.js     │               │
  │           │                     │  (MySQL 연결 풀)  │               │
  │           │                     │  → DB에서 데이터  │               │
  │           │                     │    조회/저장       │               │
  │           │                     └───────────────────┘               │
  │           ▼                                                         │
  │  ┌────────────────────────────────────────┐                         │
  │  │  views/user/products/list.ejs          │  ← 화면 템플릿          │
  │  │  <%- layout('layouts/main_layout') %>  │                         │
  │  │  <% products.forEach(...) { %>         │                         │
  │  │    상품 카드 HTML                       │                         │
  │  │  <% }) %>                              │                         │
  │  └────────┬───────────────────────────────┘                         │
  │           │                                                         │
  │           ▼                                                         │
  │  ┌──────────────────────────────────┐                               │
  │  │  views/layouts/main_layout.ejs   │  ← 공통 껍데기 (헤더/푸터)    │
  │  │  <head>, <nav>, <%- body %>,     │                               │
  │  │  <footer>                        │                               │
  │  └─────────────────────────────────-┘                               │
  └─────────────────────────────────────────────────────────────────────┘

◀──── 완성된 HTML 응답 ──── [브라우저]
```

### 12-2. 관리자 쪽도 같은 구조

관리자 상품 목록(`GET /admin/products`)도 동일한 흐름입니다. 차이는 **폴더가 admin/** 아래에 있다는 것뿐입니다.

```text
routes/admin/products.js
    → controllers/admin/productController.js
        → config/db.js
        → views/admin/products/list.ejs
            → views/layouts/admin_layout.ejs
```

### 12-3. 미들웨어가 끼어드는 경우

로그인 체크나 장바구니 데이터처럼, 컨트롤러에 도달하기 **전에** 처리해야 할 것이 있으면 미들웨어가 중간에 들어갑니다.

```text
[요청] → app.js 공통 미들웨어 실행 순서:
  1) siteSettings.js   (사이트 설정 로드)
  2) menuData.js        (메뉴 데이터 로드)
  3) cartData.js        (장바구니 개수 로드)
  4) visitorLogger.js   (방문 기록)
           │
           ▼
     routes/products.js  →  controllers/productController.js  →  views/...
```

### 12-4. 요약 표

| 단계 | 파일 위치 | 하는 일 |
|------|----------|---------|
| 1. URL 매핑 | `routes/products.js` | 어떤 URL이 어떤 함수를 호출할지 정의 |
| 2. 비즈니스 로직 | `controllers/productController.js` | DB 조회, 데이터 가공, 뷰 선택 |
| 3. DB 연결 | `config/db.js` | MySQL 연결 풀 제공 |
| 4. 화면 렌더링 | `views/user/products/list.ejs` | HTML 템플릿에 데이터를 넣어 완성 |
| 5. 공통 레이아웃 | `views/layouts/main_layout.ejs` | 헤더, 푸터, 네비게이션 등 공통 껍데기 |

> 바이브코딩 팁: AI에게 "상품 목록 페이지의 전체 흐름은 routes/products.js → controllers/productController.js → views/user/products/list.ejs 야. 이 흐름을 이해하고 수정해 줘." 라고 알려주면 정확한 코드를 받을 확률이 훨씬 높아집니다.

---

## 13. 파일/폴더 이름 규칙 – 왜 이렇게 이름을 짓는가

이 프로젝트의 파일 이름에는 일정한 **규칙(컨벤션)** 이 있습니다. 규칙을 알면 파일 이름만 보고도 역할을 짐작할 수 있습니다.

### 13-1. 라우트 파일 – 복수형 명사

라우트 파일은 **복수형 명사**로 이름을 짓습니다. 하나의 자원(resource)에 대한 여러 동작(목록, 상세, 생성, 수정, 삭제)을 다루기 때문입니다.

| 파일명 | 다루는 URL | 왜 복수형? |
|--------|-----------|-----------|
| `routes/products.js` | `/products`, `/products/:id` | 상품 **여러 개**를 다룸 |
| `routes/notices.js` | `/notices`, `/notices/:id` | 공지 **여러 개**를 다룸 |
| `routes/inquiries.js` | `/inquiries`, `/inquiries/:id` | 문의 **여러 개**를 다룸 |
| `routes/cart.js` | `/cart` | 장바구니는 사용자당 **하나**이므로 단수 |
| `routes/auth.js` | `/auth/*` | 인증은 자원이 아니라 행위이므로 단수 |

### 13-2. 컨트롤러 파일 – camelCase + Controller 접미사

컨트롤러 파일은 **camelCase**로 작성하며, 반드시 `Controller`로 끝납니다.

```text
productController.js     ← 상품 관련 로직
cartController.js        ← 장바구니 관련 로직
noticeController.js      ← 공지사항 관련 로직
inquiryController.js     ← 1:1 문의 관련 로직
checkoutController.js    ← 주문/결제 관련 로직
mainController.js        ← 메인 페이지 관련 로직
```

규칙: `[기능명(단수, camelCase)]Controller.js`

> 왜 단수? 컨트롤러는 "상품"이라는 **개념**을 담당하는 것이지, "상품들"을 의미하는 것이 아니기 때문입니다.

### 13-3. 뷰 폴더 – 라우트 경로와 일치

뷰 폴더 구조는 URL 경로와 최대한 **일치**시킵니다. 그래야 URL만 보고 어떤 뷰 파일을 찾아야 하는지 바로 알 수 있습니다.

```text
URL                    →  뷰 파일 경로
/products              →  views/user/products/list.ejs
/products/:id          →  views/user/products/detail.ejs
/notices               →  views/user/notices/list.ejs
/notices/:id           →  views/user/notices/detail.ejs
/inquiries             →  views/user/inquiries/list.ejs
/admin/products        →  views/admin/products/list.ejs
/admin/banners         →  views/admin/banners/list.ejs
```

### 13-4. 사용자 vs 관리자 분리 패턴

이 프로젝트는 사용자/관리자 코드를 **폴더 수준**에서 분리합니다.

```text
사용자 쪽                          관리자 쪽
──────────────                    ─────────────────
routes/products.js                routes/admin/products.js
controllers/productController.js  controllers/admin/productController.js
views/user/products/              views/admin/products/
```

같은 이름의 파일이 있어도 **폴더가 다르면 역할이 다릅니다**.
- `controllers/productController.js` → 사용자가 상품을 **보는** 기능
- `controllers/admin/productController.js` → 관리자가 상품을 **관리(CRUD)** 하는 기능

### 13-5. 미들웨어 파일 – 역할을 설명하는 이름

미들웨어는 **무엇을 하는지** 이름으로 바로 알 수 있게 짓습니다.

| 파일명 | 이름에서 읽히는 역할 |
|--------|-------------------|
| `adminAuth.js` | 관리자 인증(Auth) 확인 |
| `adminRoleGuard.js` | 관리자 역할(Role) 검사를 지키는(Guard) 것 |
| `siteSettings.js` | 사이트 설정을 로드 |
| `menuData.js` | 메뉴 데이터를 로드 |
| `cartData.js` | 장바구니 데이터를 로드 |
| `upload.js` | 파일 업로드 처리 |
| `visitorLogger.js` | 방문자 로그 기록 |

### 13-6. 이름 규칙 요약

| 카테고리 | 규칙 | 예시 |
|----------|------|------|
| 라우트 | 복수형 명사 + `.js` | `products.js`, `notices.js` |
| 컨트롤러 | camelCase + `Controller.js` | `productController.js` |
| 뷰 폴더 | URL 경로와 일치 | `views/user/products/` |
| 뷰 파일 | 동작 이름 | `list.ejs`, `detail.ejs`, `form.ejs` |
| 미들웨어 | 역할 설명 camelCase | `adminAuth.js`, `cartData.js` |
| 레이아웃 | `[영역]_layout.ejs` | `main_layout.ejs`, `admin_layout.ejs` |

---

## 14. 새 기능 추가 시 파일 생성 체크리스트

새로운 기능(예: "위시리스트")을 추가한다고 가정해 봅시다. 아래 체크리스트를 순서대로 따라가면 빠뜨리는 일이 없습니다.

### 14-1. 체크리스트

```text
□  1단계: DB 테이블 설계
   → tables.sql에 CREATE TABLE 추가
   → DB에 실제 테이블 생성

□  2단계: 라우트 파일 생성
   → routes/wishlist.js (사용자)
   → routes/admin/wishlist.js (관리자, 필요 시)

□  3단계: 컨트롤러 파일 생성
   → controllers/wishlistController.js (사용자)
   → controllers/admin/wishlistController.js (관리자, 필요 시)

□  4단계: 뷰 파일 생성
   → views/user/wishlist/list.ejs
   → views/user/wishlist/detail.ejs (필요 시)
   → views/admin/wishlist/ (관리자, 필요 시)

□  5단계: 미들웨어 확인/추가
   → 로그인 필수인지? (기존 adminAuth.js 또는 별도 미들웨어)
   → 새로운 공통 데이터가 필요한지?

□  6단계: app.js에 라우트 등록
   → app.use('/wishlist', require('./routes/wishlist'))

□  7단계: 메뉴/네비게이션 업데이트
   → views/layouts/main_layout.ejs 또는
   → middleware/menuData.js에서 메뉴 항목 추가
```

### 14-2. 생성될 파일 트리

위시리스트 기능을 추가한 후의 새 파일들을 트리로 보면 이렇습니다.

```text
yd-mall/
├── tables.sql                          ← [수정] wishlist 테이블 추가
├── app.js                              ← [수정] 라우트 등록 추가
│
├── routes/
│   └── wishlist.js                     ← [새로 생성]
│
├── controllers/
│   └── wishlistController.js           ← [새로 생성]
│
├── views/
│   └── user/
│       └── wishlist/
│           ├── list.ejs                ← [새로 생성]
│           └── detail.ejs              ← [새로 생성] (필요 시)
│
└── views/layouts/
    └── main_layout.ejs                 ← [수정] 메뉴에 위시리스트 링크 추가
```

### 14-3. 각 단계별 코드 예시

**1단계: tables.sql에 테이블 추가**

```sql
CREATE TABLE IF NOT EXISTS wishlists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
```

**2단계: routes/wishlist.js 생성**

```js
const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/wishlistController');

// 위시리스트 목록
router.get('/', wishlistController.getList);

// 위시리스트에 추가
router.post('/add', wishlistController.addItem);

// 위시리스트에서 삭제
router.post('/remove', wishlistController.removeItem);

module.exports = router;
```

**3단계: controllers/wishlistController.js 생성**

```js
const pool = require('../config/db');

exports.getList = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.query(
      `SELECT w.*, p.name, p.price, p.image
       FROM wishlists w
       JOIN products p ON w.product_id = p.id
       WHERE w.user_id = ?
       ORDER BY w.created_at DESC`,
      [userId]
    );
    res.render('user/wishlist/list', {
      title: '위시리스트',
      wishlists: rows
    });
  } catch (err) {
    next(err);
  }
};
```

**6단계: app.js에 등록**

```js
const wishlistRoutes = require('./routes/wishlist');
app.use('/wishlist', wishlistRoutes);
```

### 14-4. 바이브코딩 프롬프트 예시

새 기능을 추가할 때 AI에게 이렇게 요청하면 좋습니다.

> "이 프로젝트에 위시리스트 기능을 추가하고 싶어. 프로젝트 구조는 routes/ → controllers/ → views/ 패턴이야.
> 1) tables.sql에 wishlists 테이블을 추가하고
> 2) routes/wishlist.js, controllers/wishlistController.js, views/user/wishlist/list.ejs를 만들어 줘.
> 3) app.js에 라우트 등록도 해 줘.
> 기존 productController.js 패턴을 참고해서 작성해 줘."

---

## 15. 프로젝트에서 자주 수정하는 파일 TOP 10

개발을 하다 보면 유독 자주 손대는 파일들이 있습니다. 아래 목록을 알아 두면 "이걸 고치려면 어디를 열어야 하지?" 라는 고민을 줄일 수 있습니다.

### 자주 수정하는 파일 순위

| 순위 | 파일 | 언제 수정하는가 | 수정 빈도 |
|------|------|----------------|----------|
| 1 | `views/user/*.ejs` | 화면 디자인, 텍스트, 레이아웃 변경 | ★★★★★ |
| 2 | `views/layouts/main_layout.ejs` | 헤더, 푸터, 네비게이션 수정 | ★★★★☆ |
| 3 | `controllers/*.js` | 비즈니스 로직 추가/수정, DB 쿼리 변경 | ★★★★☆ |
| 4 | `views/admin/*.ejs` | 관리자 화면 수정 | ★★★★☆ |
| 5 | `routes/*.js` | 새 URL 추가, URL 구조 변경 | ★★★☆☆ |
| 6 | `public/css/style.css` | 스타일 변경 (Tailwind 빌드 결과) | ★★★☆☆ |
| 7 | `middleware/*.js` | 공통 처리 로직 추가/수정 | ★★☆☆☆ |
| 8 | `tables.sql` | DB 테이블 추가/컬럼 변경 | ★★☆☆☆ |
| 9 | `app.js` | 새 라우트 등록, 미들웨어 추가 | ★★☆☆☆ |
| 10 | `config/db.js` | DB 연결 설정 변경 (거의 안 건드림) | ★☆☆☆☆ |

### 상황별 수정 대상

**"화면에 보이는 글자나 디자인을 바꾸고 싶다"**

```text
1순위: views/ 아래 해당 .ejs 파일
2순위: public/css/style.css (Tailwind 클래스가 아닌 별도 스타일인 경우)
3순위: public/js/ (프론트엔드 동작을 바꿔야 할 경우)
```

**"데이터를 더 가져오거나, 저장 방식을 바꾸고 싶다"**

```text
1순위: controllers/ 아래 해당 컨트롤러 파일
2순위: tables.sql (테이블 구조가 바뀌어야 할 경우)
```

**"새로운 페이지/기능을 통째로 추가하고 싶다"**

```text
1순위: routes/ (새 라우트 파일 생성)
2순위: controllers/ (새 컨트롤러 파일 생성)
3순위: views/ (새 뷰 파일 생성)
4순위: app.js (라우트 등록)
```

**"모든 페이지에 공통으로 적용되는 것을 바꾸고 싶다"**

```text
1순위: middleware/ 아래 해당 미들웨어
2순위: views/layouts/ 아래 레이아웃 파일
3순위: app.js (미들웨어 등록 순서)
```

---

## 16. 폴더 구조 관련 흔한 실수와 해결

초보자가 자주 하는 실수들을 모았습니다. 각 실수마다 잘못된 예와 올바른 예를 함께 보여줍니다.

### 실수 1: 파일을 잘못된 폴더에 생성

사용자용 컨트롤러를 관리자 폴더에 만들거나, 그 반대를 하는 실수입니다.

```text
잘못된 예:
  controllers/admin/productController.js   ← 사용자용 상품 로직을 여기에 작성
  (관리자 폴더에 사용자 기능을 넣음)

올바른 예:
  controllers/productController.js         ← 사용자용 상품 로직
  controllers/admin/productController.js   ← 관리자용 상품 로직
```

> 핵심: 사용자 기능은 `controllers/`, `routes/`, `views/user/`에, 관리자 기능은 `controllers/admin/`, `routes/admin/`, `views/admin/`에 넣습니다.

### 실수 2: app.js에 라우트 등록을 잊음

파일을 다 만들었는데 페이지가 안 열리는 경우, 대부분 이 실수입니다.

```text
잘못된 예:
  routes/wishlist.js 파일은 만들었지만
  app.js에 app.use('/wishlist', ...) 를 추가하지 않음
  → 브라우저에서 /wishlist 접속 시 404 에러

올바른 예:
  // app.js
  const wishlistRoutes = require('./routes/wishlist');
  app.use('/wishlist', wishlistRoutes);  ← 이 줄을 반드시 추가!
```

### 실수 3: res.render()에서 뷰 경로를 잘못 지정

컨트롤러에서 뷰 파일의 경로를 잘못 쓰면 "뷰를 찾을 수 없다"는 에러가 납니다.

```text
잘못된 예:
  res.render('products/list', { ... })
  → views/products/list.ejs 를 찾지만, 실제 파일은 views/user/products/list.ejs

올바른 예:
  res.render('user/products/list', { ... })
  → views/user/products/list.ejs 를 정확히 찾음
```

> 핵심: `res.render()`의 경로는 `views/` 폴더를 기준으로 합니다. `views/` 자체는 경로에 쓰지 않지만, 그 아래의 `user/` 등은 포함해야 합니다.

### 실수 4: 라우트 파일과 컨트롤러 파일의 require 경로 불일치

상대 경로(`../`)를 잘못 써서 모듈을 찾지 못하는 에러입니다.

```text
잘못된 예:
  // routes/admin/products.js 에서
  const controller = require('../productController');
  → controllers/productController.js (사용자용)를 가져옴

올바른 예:
  // routes/admin/products.js 에서
  const controller = require('../../controllers/admin/productController');
  → controllers/admin/productController.js (관리자용)를 정확히 가져옴
```

### 실수 5: 이름 규칙을 따르지 않음

일관성이 없으면 나중에 파일을 찾기 어려워집니다.

```text
잘못된 예:
  controllers/HandleProducts.js     ← PascalCase, Controller 접미사 없음
  controllers/product_ctrl.js       ← snake_case, 다른 파일과 불일치
  routes/Product.js                 ← 대문자 시작, 단수형

올바른 예:
  controllers/productController.js  ← camelCase + Controller
  routes/products.js                ← 소문자, 복수형
```

### 실수 6: 레이아웃 지정을 빠뜨림

뷰 파일 상단에 레이아웃을 지정하지 않으면, 헤더/푸터 없이 본문만 나옵니다.

```text
잘못된 예:
  <!-- views/user/wishlist/list.ejs -->
  <h1>위시리스트</h1>
  (레이아웃 지정 없음 → 헤더, 메뉴, 푸터가 안 나옴)

올바른 예:
  <!-- views/user/wishlist/list.ejs -->
  <%- layout('layouts/main_layout') %>
  <h1>위시리스트</h1>
  (main_layout.ejs의 헤더, 메뉴, 푸터와 함께 렌더링됨)
```

### 실수 요약 표

| # | 실수 | 증상 | 해결 |
|---|------|------|------|
| 1 | 잘못된 폴더에 파일 생성 | 기능은 되지만 코드가 뒤섞임 | 사용자/관리자 폴더 분리 확인 |
| 2 | app.js 라우트 미등록 | 404 Not Found | app.js에 `app.use()` 추가 |
| 3 | 뷰 경로 오타 | "Failed to lookup view" 에러 | `views/` 기준 경로 확인 |
| 4 | require 경로 불일치 | "Cannot find module" 에러 | 상대 경로 `../` 단계 확인 |
| 5 | 이름 규칙 미준수 | 파일을 못 찾음, 일관성 없음 | 기존 파일 이름 패턴 따르기 |
| 6 | 레이아웃 미지정 | 헤더/푸터 없는 허전한 화면 | `<%- layout(...) %>` 추가 |

---

## 17. 실전 튜토리얼 – "위시리스트" 기능의 파일 구조 설계

이 섹션에서는 **위시리스트(찜하기)** 기능을 처음부터 끝까지 설계하는 과정을 보여줍니다. 14장의 체크리스트를 실제로 적용하는 예제입니다.

### 17-1. 기능 요구사항 정리

위시리스트 기능에서 필요한 것:

- 사용자가 상품을 **찜 목록에 추가**할 수 있다
- 사용자가 자신의 **찜 목록을 조회**할 수 있다
- 사용자가 찜 목록에서 **상품을 제거**할 수 있다
- **로그인한 사용자만** 이용 가능하다

### 17-2. 파일 구조 설계

이 기능을 구현하기 위해 만들거나 수정해야 할 파일들입니다.

```text
yd-mall/
│
├── tables.sql                              [수정] wishlists 테이블 추가
│
├── routes/
│   └── wishlist.js                         [생성] URL 매핑
│
├── controllers/
│   └── wishlistController.js               [생성] 비즈니스 로직
│
├── views/
│   └── user/
│       └── wishlist/
│           └── list.ejs                    [생성] 위시리스트 목록 화면
│
├── app.js                                  [수정] 라우트 등록
│
└── views/
    └── layouts/
        └── main_layout.ejs                 [수정] 네비게이션에 링크 추가
```

### 17-3. 파일 간 연결 관계

```text
[사용자가 /wishlist 접속]
        │
        ▼
   app.js
   app.use('/wishlist', require('./routes/wishlist'))
        │
        ▼
   routes/wishlist.js
   ┌─────────────────────────────────────────┐
   │ GET  /          → getList    (목록)     │
   │ POST /add       → addItem   (추가)     │
   │ POST /remove    → removeItem (삭제)    │
   └──────────────────┬──────────────────────┘
                      │
                      ▼
   controllers/wishlistController.js
   ┌─────────────────────────────────────────┐
   │ const pool = require('../config/db')    │
   │                                         │
   │ exports.getList = async (req, res) => { │
   │   // DB에서 찜 목록 조회                │
   │   // res.render('user/wishlist/list')   │
   │ }                                       │
   │                                         │
   │ exports.addItem = async (req, res) => { │
   │   // DB에 찜 항목 추가                  │
   │   // res.redirect('back')              │
   │ }                                       │
   │                                         │
   │ exports.removeItem = async (...) => {   │
   │   // DB에서 찜 항목 삭제                │
   │   // res.redirect('/wishlist')         │
   │ }                                       │
   └──────────────────┬──────────────────────┘
                      │
                      ▼
   views/user/wishlist/list.ejs
   ┌─────────────────────────────────────────┐
   │ <%- layout('layouts/main_layout') %>    │
   │                                         │
   │ <h1>내 위시리스트</h1>                  │
   │ <% wishlists.forEach((item) => { %>     │
   │   <div>                                 │
   │     <%= item.name %>                    │
   │     <%= item.price %>원                 │
   │     <form action="/wishlist/remove"     │
   │           method="POST">                │
   │       <button>삭제</button>             │
   │     </form>                             │
   │   </div>                                │
   │ <% }) %>                                │
   └─────────────────────────────────────────┘
```

### 17-4. 상품 상세 페이지에 "찜하기" 버튼 추가

기존 파일도 수정이 필요합니다. 상품 상세 페이지에 찜하기 버튼을 넣어야 합니다.

```text
수정 대상: views/user/products/detail.ejs

추가할 코드 (상품 정보 아래):
┌─────────────────────────────────────────┐
│ <form action="/wishlist/add"            │
│       method="POST">                    │
│   <input type="hidden"                  │
│          name="product_id"              │
│          value="<%= product.id %>">     │
│   <button type="submit">               │
│     찜하기                              │
│   </button>                             │
│ </form>                                 │
└─────────────────────────────────────────┘
```

### 17-5. 바이브코딩으로 구현하는 단계별 프롬프트

위 설계를 AI에게 전달할 때, 다음과 같이 **단계별로 나눠서** 요청하면 좋습니다.

**프롬프트 1 – DB 테이블**

> "tables.sql 파일을 열어서, 기존 테이블 아래에 wishlists 테이블을 추가해 줘. user_id, product_id, created_at 컬럼이 필요하고, users, products 테이블을 참조하는 외래 키를 걸어 줘."

**프롬프트 2 – 라우트 + 컨트롤러**

> "routes/wishlist.js와 controllers/wishlistController.js를 만들어 줘. 기존 routes/products.js, controllers/productController.js 패턴을 참고해서 getList, addItem, removeItem 세 기능을 구현해 줘. DB는 config/db.js의 pool을 사용해."

**프롬프트 3 – 뷰**

> "views/user/wishlist/list.ejs를 만들어 줘. 레이아웃은 layouts/main_layout 을 사용하고, 기존 views/user/products/list.ejs의 디자인 스타일을 참고해 줘."

**프롬프트 4 – 연결**

> "app.js에 wishlist 라우트를 등록해 줘. 기존 products 라우트 등록 방식과 동일하게 해 줘."

> 바이브코딩 팁: 한 번에 모든 것을 요청하기보다, **파일 단위로 나눠서** 요청하면 AI가 더 정확한 코드를 생성합니다. 각 단계에서 결과를 확인한 뒤 다음 단계로 넘어가세요.

---

## 18. FAQ – 자주 묻는 질문들

### Q1. 새로운 CSS를 추가하려면 어디에 넣어야 하나요?

**A.** 이 프로젝트는 **Tailwind CSS**를 사용합니다. 대부분의 스타일링은 뷰 파일(`.ejs`) 안에서 Tailwind 클래스를 직접 사용합니다.

```ejs
<!-- views/ 안의 .ejs 파일에서 직접 Tailwind 클래스 사용 -->
<div class="bg-white p-4 rounded-lg shadow-md">
  <h2 class="text-xl font-bold text-gray-800">제목</h2>
</div>
```

Tailwind로 해결이 안 되는 별도 CSS가 필요하면 `public/css/` 아래에 추가합니다.

- 기본 빌드 CSS: `public/css/style.css`
- Tailwind 소스: `public/css/input.css`

### Q2. 클라이언트(브라우저)에서 실행되는 JavaScript는 어디에 넣나요?

**A.** `public/js/` 폴더에 넣습니다. 현재 이 프로젝트에는 다음 파일들이 있습니다.

```text
public/js/
├── number-format.js       ← 가격 숫자 콤마 포맷터
└── user-search-modal.js   ← 사용자 검색 모달 관련 스크립트
```

새 JS 파일을 추가한 후, 필요한 뷰 파일에서 이렇게 불러옵니다.

```ejs
<script src="/js/새파일이름.js"></script>
```

### Q3. DB 쿼리(SQL)는 어디에서 찾을 수 있나요?

**A.** DB 쿼리는 **컨트롤러 파일** 안에 있습니다. `controllers/` 폴더의 각 파일에서 `pool.query()`를 검색하면 됩니다.

```js
// controllers/productController.js 안의 예시
const [rows] = await pool.query('SELECT * FROM products WHERE is_active = 1');
```

테이블 구조(CREATE TABLE)는 `tables.sql`에 모여 있습니다.

### Q4. 뷰(EJS)에서 레이아웃은 어떻게 연결되나요?

**A.** 뷰 파일 **맨 위**에 `<%- layout(...) %>`을 써서 연결합니다. 레이아웃 파일의 `<%- body %>` 위치에 뷰의 내용이 삽입됩니다.

```text
views/layouts/main_layout.ejs       views/user/products/list.ejs
┌──────────────────────────┐       ┌──────────────────────────┐
│ <html>                   │       │ <%- layout('layouts/     │
│ <head>...</head>         │       │   main_layout') %>       │
│ <body>                   │       │                          │
│   <nav>메뉴</nav>       │       │ <h1>상품 목록</h1>       │
│   <%- body %>  ──────────┼───────┤ <div>상품 카드들...</div>│
│   <footer>...</footer>   │       │                          │
│ </body>                  │       └──────────────────────────┘
│ </html>                  │
└──────────────────────────┘
```

레이아웃 종류:
- `layouts/main_layout` → 사용자(쇼핑몰) 화면에 사용
- `layouts/admin_layout` → 관리자 화면에 사용
- `layouts/manual_layout` → 매뉴얼/가이드 화면에 사용

### Q5. 업로드된 이미지(상품 사진, 배너)는 어디에 저장되나요?

**A.** `public/uploads/` 폴더에 저장됩니다. 업로드 처리는 `middleware/upload.js`에서 **multer** 라이브러리로 관리합니다.

```text
public/uploads/
├── products/    ← 상품 이미지
├── banners/     ← 배너 이미지
└── logos/       ← 사이트 로고 등
```

브라우저에서는 `/uploads/products/이미지파일.jpg` 같은 경로로 접근합니다.

### Q6. 로그인/인증 관련 코드는 어디에 있나요?

**A.** 인증 관련 코드는 여러 곳에 나뉘어 있습니다.

| 파일 | 역할 |
|------|------|
| `config/passport.js` | Passport 전략 설정 (로컬, 구글, 카카오) |
| `routes/auth.js` | 로그인/로그아웃/소셜 콜백 URL 정의 |
| `views/auth/login.ejs` | 로그인 화면 |
| `middleware/adminAuth.js` | 관리자 로그인 여부 확인 |
| `middleware/adminRoleGuard.js` | 관리자 권한(역할) 확인 |

### Q7. "사이트 설정"(사이트 이름, 로고 등)은 어디에서 관리하나요?

**A.** 세 곳이 관련됩니다.

1. `config/systemSettings.js` → 사이트 설정을 DB에서 불러오는 로직
2. `middleware/siteSettings.js` → 모든 요청에서 설정을 로드하여 뷰에서 쓸 수 있게 `res.locals`에 넣음
3. `controllers/admin/settingsController.js` + `views/admin/settings/` → 관리자가 설정을 변경하는 화면과 로직

### Q8. 에러가 발생하면 로그는 어디서 확인하나요?

**A.** `logs/` 폴더에 로그 파일이 저장됩니다. 그리고 개발 중에는 터미널(콘솔)에 에러가 직접 출력됩니다.

```text
logs/
├── access.log     ← 접속 로그
├── error.log      ← 에러 로그
└── ...
```

컨트롤러에서 `next(err)`를 호출하면 Express의 에러 핸들러가 이를 받아서 로그에 기록하고 에러 페이지를 보여줍니다.

### Q9. 새 라우트를 만들었는데 "Cannot GET /경로" 에러가 나요.

**A.** 가장 흔한 원인 3가지를 순서대로 확인하세요.

1. **app.js 등록 확인** → `app.use('/경로', require('./routes/파일'))` 이 있는지
2. **라우트 경로 확인** → `router.get('/', ...)` 에서 경로가 맞는지
3. **서버 재시작** → `nodemon`을 사용하지 않는 경우 서버를 다시 시작해야 합니다

### Q10. views/ 안의 partials/ 폴더는 무엇인가요?

**A.** `views/partials/`에는 여러 뷰에서 **공통으로 재사용**하는 HTML 조각이 들어 있습니다. 예를 들어 검색 모달, 팝업 오버레이 같은 것입니다.

```text
views/partials/
├── modal_overlay.ejs       ← 모달 배경 오버레이
└── user_search_modal.ejs   ← 사용자 검색 모달
```

다른 뷰에서 `<%- include('../partials/modal_overlay') %>` 같은 방식으로 불러와 사용합니다.

---

## 19. 정리 및 다음 단계

이 문서에서는 프로젝트의 폴더 구조를 **전체 그림부터 세부 파일까지** 살펴보았습니다.

### 핵심 요약

```text
1.  파일 찾기의 출발점   → 어떤 URL/기능인지 파악
2.  URL → 파일 추적      → routes/ → controllers/ → views/
3.  공통 처리            → middleware/
4.  DB 관련              → config/db.js + tables.sql
5.  화면 관련            → views/ + views/layouts/ + public/
6.  새 기능 추가         → 체크리스트 7단계를 순서대로
7.  이름 규칙            → 기존 파일 패턴을 따르면 됨
```

### 관련 가이드 문서

이 프로젝트의 다른 코딩 가이드도 함께 읽으면 더 깊이 이해할 수 있습니다.

| 문서 | 설명 | 경로 |
|------|------|------|
| MVC 패턴 가이드 | MVC 구조와 데이터 흐름 상세 설명 | `docs/manual/coding_guide/mvc.md` |
| Node.js 기초 | Node.js와 npm 기본 개념 | `docs/manual/coding_guide/nodejs.md` |
| Express 라이브러리 | Express와 주요 라이브러리 설명 | `docs/manual/coding_guide/express_libs.md` |
| MySQL 가이드 | DB 연결과 쿼리 작성법 | `docs/manual/coding_guide/mysql.md` |
| 기술 스택 개요 | 프로젝트에 사용된 기술 목록 | `docs/manual/coding_guide/tech_stack.md` |
| 바이브코딩 가이드 | AI를 활용한 코딩 방법 | `docs/manual/coding_guide/vibe_coding.md` |
| 워크플로우 | 개발 작업 흐름 | `docs/manual/coding_guide/workflow.md` |
| 예제: 공지사항 | 공지사항 기능 구현 예제 | `docs/manual/coding_guide/example_notice.md` |
| 예제: 구글 로그인 | 구글 로그인 구현 예제 | `docs/manual/coding_guide/example_google_login.md` |

> 바이브코딩을 시작할 때, 이 문서의 폴더 구조 설명을 AI에게 먼저 알려주면 프로젝트에 맞는 정확한 코드를 받을 수 있습니다. "이 프로젝트는 이런 구조야" 라고 컨텍스트를 주는 것이 바이브코딩의 핵심입니다.
