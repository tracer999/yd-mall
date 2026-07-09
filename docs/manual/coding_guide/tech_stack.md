# 사용 기술과 이유

이 문서는 이 쇼핑몰 프로젝트에 실제로 사용된 **기술 스택 전체**를, 초보자·비개발자도 이해할 수 있도록 **“무엇 / 어디에 / 왜”** 관점에서 설명합니다.

- 무엇: 이 기술은 어떤 종류의 도구인지
- 어디에: 이 프로젝트의 어느 파일·폴더에서 쓰이는지
- 왜: 비슷한 쇼핑몰을 만들 때, 이 기술을 선택하면 어떤 점이 좋은지

각 기술은 **바이브코딩(Vibe Coding)** 으로 개발할 때, AI에게 어떻게 설명하면 되는지까지 함께 적습니다.

> 자세한 개념 설명은 다른 문서에서 이어집니다. 이 페이지는 “스택 지도”처럼, 전체 그림을 한 번에 잡는 데 집중합니다.

---

## 전체 기술 스택 한눈에 보기

| 구분 | 사용 기술 | 역할 | 이 프로젝트에서의 위치 |
|------|-----------|------|-------------------------|
| 런타임 | Node.js (npm 포함) | JavaScript 서버 실행 환경 | app.js, package.json, scripts/*.js |
| 웹 프레임워크 | Express | HTTP 요청 처리, 라우팅, 미들웨어 | app.js, routes/, middleware/ |
| 화면(View) | EJS + express-ejs-layouts | 서버 사이드 HTML 템플릿 | views/, views/layouts/ |
| 스타일 | Tailwind CSS | 유틸리티 기반 CSS 프레임워크 | public/css/input.css → style.css |
| 데이터베이스 | MySQL 8 + mysql2 | 회원·상품·주문 등 데이터 저장 | config/db.js, tables.sql, controllers/* |
| 세션/캐시 | express-session + connect-redis + Redis(선택) | 로그인/세션 유지, 확장성 | app.js, middleware/adminAuth.js |
| 인증 | Passport (Local, Google, Kakao 등) | 로그인 처리, 사용자 식별 | config/passport.js, routes/auth.js |
| 환경 변수 | dotenv | .env 설정 로드 | app.js, config/db.js 등 |
| 암호화·업로드 | bcrypt, multer | 비밀번호 해시, 이미지 업로드 | controllers/admin/*.js, middleware/upload.js |
| 문서 렌더링 | marked | Markdown → HTML 변환 | manual 관련 컨트롤러, routes/manual.js |
| 운영 도구 | nodemon, pm2 | 개발용 자동 재시작, 프로세스 관리 | package.json scripts, ecosystem.config.cjs |

각 항목을 아래에서 조금 더 자세히, **“바이브코딩 프롬프트에 바로 쓸 수 있는 표현”** 과 함께 설명합니다.

---

## 1. Node.js와 npm

### 무엇인지

Node.js는 **브라우저 밖에서 JavaScript를 실행할 수 있게 해 주는 런타임**입니다. 이 프로젝트의 모든 서버 코드는 Node.js 위에서 돌아갑니다.

- 진입점: `app.js`
- 실행: `node app.js` 또는 `npm start`
- 의존성 관리: `package.json` + `npm install`

자세한 개념 설명은 **Node.js란** 문서(`nodejs.md`)를 참고하세요.

### 어디에 쓰이는지

- 서버 시작: `npm start` → Node.js가 `app.js` 실행
- 개발 모드: `npm run dev` → nodemon이 Node.js 프로세스를 파일 변경 시마다 재시작
- CSS 빌드: `npm run build:css`, `npm run watch:css` → Node.js로 Tailwind CLI 실행
- DB 초기화·마이그레이션: `scripts/` 안의 Node.js 스크립트들

### 왜 이 프로젝트에서 Node.js를 선택했는지

- 브라우저(프론트)와 서버(백엔드)를 **모두 JavaScript 한 언어로** 다룰 수 있습니다.
- 쇼핑몰에 필요한 **웹 서버 + DB 연동 + 로그인 + 파일 업로드** 등 예제가 Node.js/Express 생태계에 아주 많습니다.
- 바이브코딩 시, “Node.js + Express 기반 쇼핑몰”이라고만 해도 AI가 이해하고 코드 패턴을 맞춰 줍니다.

### 바이브코딩 프롬프트 예시

> "Node.js + Express + MySQL로 만든 쇼핑몰 서버가 있고, 진입점은 app.js입니다. 이 구조에 맞춰 ~~ 기능을 추가하는 코드를 만들어 주세요."

---

## 2. Express (웹 프레임워크)

### 무엇인지

Express는 Node.js 위에서 동작하는 **웹 프레임워크**입니다. HTTP 요청을 다루는 대부분의 기본 작업을 도와줍니다.

- URL → 함수 연결 (라우팅)
- 요청/응답 사이 공통 작업 (미들웨어)
- 템플릿 엔진(EJS)과 연결해 HTML 응답 보내기

### 어디에 쓰이는지

- `app.js`
  - `const express = require('express')`
  - `const app = express()` 로 앱 인스턴스 생성
  - `app.use(미들웨어)` 로 공통 처리 연결 (예: `siteSettings`, `menuData` 등)
  - `app.use('/', require('./routes/index'))` 처럼 라우터 묶음 등록
- `routes/`
  - `routes/index.js`, `routes/products.js`, `routes/admin/*.js` 등에서 `express.Router()` 사용
- `middleware/`
  - Express 미들웨어 패턴(`(req, res, next) => { ... }`)으로 로그인 체크, 장바구니 정보 주입 등 구현

### 왜 Express를 선택했는지

- Node.js 표준에 가까운 웹 프레임워크라 **자료와 예제가 가장 풍부**합니다.
- `routes/`, `controllers/`, `views/`로 나누어 **MVC 스타일** 코드 구성이 쉽습니다.
- 초보자도 “URL마다 함수 하나씩” 구조만 이해하면 바로 코드를 읽고 수정할 수 있습니다.

### 바이브코딩 프롬프트 예시

> "Node.js + Express로 만든 쇼핑몰 프로젝트에서 `routes/products.js`와 `controllers/productController.js`가 있고, EJS 뷰를 사용합니다. `/products` GET 요청으로 상품 목록을 DB에서 읽어와 `views/user/products/list.ejs`에 렌더링하는 라우트와 컨트롤러 코드를 작성해 주세요."

---

## 3. MySQL 8 + mysql2 (데이터베이스)

### 무엇인지

MySQL은 대표적인 **관계형 데이터베이스(RDBMS)** 입니다. 테이블과 행(row)으로 구성된 구조화된 데이터를 **SQL**로 다룹니다.

- 회원: users
- 상품: products
- 주문: orders, order_items
- 공지사항: notices
- 쿠폰, 포인트, 방문 로그 등…

이 프로젝트는 Node.js에서 MySQL에 접속하기 위해 **mysql2**라는 패키지를 사용합니다.

### 어디에 쓰이는지

- `config/db.js`
  - `mysql2/promise` 의 `createPool`로 **연결 풀** 생성
  - 다른 파일들이 `pool.query('SELECT ...', [params])` 형태로 사용
- `controllers/*.js`
  - 예: `productController.js`, `cartController.js`, `checkoutController.js`, `admin/productController.js` 등에서 SQL 실행
- `tables.sql`
  - 실제 테이블 구조 정의 (CREATE TABLE ...)
- `scripts/init_db.js`, `scripts/migrations/`
  - 초기 데이터 입력, 스키마 변경 등

### 왜 MySQL을 선택했는지

- 쇼핑몰 구조(회원, 상품, 주문, 장바구니)는 **관계형 모델**에 잘 맞습니다.
- 무료이고, 호스팅/클라우드 어디서나 쉽게 사용할 수 있습니다.
- Node.js + MySQL 조합은 초보자용 튜토리얼과 AI 예제 코드가 매우 많습니다.

### 바이브코딩 프롬프트 예시

> "Node.js + Express + mysql2/promise를 사용하는 쇼핑몰 프로젝트입니다. `config/db.js`에 이미 `pool`이 정의되어 있고 `tables.sql`에 `products` 테이블이 있습니다. `controllers/productController.js`에 `getProductList` 함수를 추가해서, `SELECT * FROM products WHERE is_deleted = 0 ORDER BY created_at DESC` 쿼리 결과를 `res.render`로 넘겨 주세요."

MySQL과 SQL 기초 문법은 **MySQL과 DBMS** 문서에서 상세히 설명합니다.

---

## 4. EJS + express-ejs-layouts (화면 템플릿)

### 무엇인지

EJS(Embedded JavaScript)는 **HTML 안에 JavaScript 구문을 섞어 쓰는 템플릿 엔진**입니다.

- `<%= value %>`: 값을 출력
- `<% if (조건) { %> ... <% } %>`: 조건문
- `<% items.forEach(...) %>`: 반복

이 프로젝트는 **express-ejs-layouts**를 함께 사용해 공통 레이아웃(헤더, 푸터, 사이드바)을 관리합니다.

### 어디에 쓰이는지

- `views/layouts/`
  - `main_layout.ejs`: 사용자(쇼핑몰) 공통 레이아웃
  - `admin_layout.ejs`: 관리자 화면 레이아웃
  - `manual_layout.ejs`: 매뉴얼/코딩 가이드용 레이아웃
- `views/user/`
  - `index.ejs`, `products/`, `cart/`, `checkout/`, `notices/` 등 사용자 화면
- `views/admin/`
  - 대시보드, 상품 관리, 배너 관리 등
- `app.js`
  - `app.set('view engine', 'ejs')`
  - `app.use(expressLayouts)`

### 왜 이 조합을 선택했는지

- 순수 HTML에 `<% %>`만 섞어 쓰면 되므로, **디자인 템플릿을 그대로 가져와 붙이기 쉽습니다**.
- SPA(React, Vue 등)보다 초기 진입 장벽이 낮아, 초보자·비개발자도 코드를 따라가기 좋습니다.
- 서버에서 HTML까지 만들어 보내므로, **SEO(검색엔진 최적화)** 와 초기 로딩 속도 측면에서도 유리합니다.

### 바이브코딩 프롬프트 예시

> "Express + EJS 기반 쇼핑몰에서, `views/user/products/list.ejs` 파일을 작성하려고 합니다. `layout('layouts/main_layout')`을 사용하고, `products` 배열을 받아서 카드 형태로 상품명, 가격, 썸네일 이미지를 보여 주세요. Tailwind CSS 클래스를 활용해 그리드 레이아웃으로 배치해 주세요."

---

## 5. Tailwind CSS (스타일)

### 무엇인지

Tailwind CSS는 **유틸리티 퍼스트(Utility-First)** 스타일의 CSS 프레임워크입니다. “클래스 이름이 곧 스타일”이라는 생각으로, HTML 요소에 여러 개의 클래스를 붙여 디자인을 완성합니다.

- 예: `class="flex justify-between items-center p-4 bg-white rounded-lg shadow"`

### 어디에 쓰이는지

- `public/css/input.css`
  - Tailwind 디렉티브(`@tailwind base; @tailwind components; @tailwind utilities;` 등)와, 이 프로젝트만의 커스텀 스타일 정의
- `tailwind.config.js`
  - 어떤 파일에서 클래스를 스캔할지, 색상/폰트/반응형 설정 등
- `public/css/style.css`
  - 빌드 결과물 (브라우저가 실제로 로드하는 파일)
- `views/**/*.ejs`
  - 버튼, 카드, 목록, 테이블, 모달 등 모든 화면에서 Tailwind 클래스 사용

### 빌드 방식

- 개발 또는 배포 전에 **Tailwind CLI**로 빌드합니다.
  - `npm run build:css` : 한 번 빌드
  - `npm run watch:css` : 파일 변경 감지하면서 계속 빌드
- 레이아웃에서는 `style.css`만 `<link>` 태그로 포함하면 됩니다.

### 왜 Tailwind를 선택했는지

- 디자이너가 만든 Figma/디자인 시안을 **클래스 조합만으로 재현하기 쉬움**
- 반응형(모바일, 태블릿, PC)을 `sm:`, `md:`, `lg:` 같은 접두사로 직관적으로 표현 가능
- 쇼핑몰 특유의 카드·배너·리스트·폼 UI를 통일성 있게 관리하기 좋음

### 바이브코딩 프롬프트 예시

> "Tailwind CSS를 사용하는 EJS 페이지에서, 관리자 상품 목록 테이블을 만들고 싶습니다. 데스크톱에서는 표 형태, 모바일에서는 카드 형태로 보이게 하는 반응형 레이아웃을 Tailwind 클래스만으로 구성해 주세요."

---

## 6. 세션과 Redis, 인증: express-session, connect-redis, Passport

### 세션과 express-session

로그인한 사용자가 사이트를 돌아다닐 때, **매 요청마다 다시 로그인하지 않고도** “누구인지”를 기억해야 합니다. 이때 필요한 것이 **세션(Session)** 입니다.

- `express-session`은 사용자의 브라우저에 **세션 ID 쿠키**를 심고, 서버 쪽에 세션 데이터를 저장합니다.
- 이 프로젝트에서는 로그인한 사용자/관리자 정보가 세션에 보관됩니다.

### Redis와 connect-redis (선택 기능)

- 세션을 서버 메모리에만 저장하면, **서버를 여러 대로 늘릴 때** 문제가 생깁니다.
- 그래서 세션 저장소로 **Redis(인메모리 키-값 DB)** 를 사용할 수 있게 해 두었습니다.
- `REDIS_HOST` 등이 설정되어 있으면 `connect-redis`를 통해 세션이 Redis에 저장되고, 없으면 기본 메모리를 사용합니다.

### Passport (로그인/인증)

- `config/passport.js` 에서 **전략(strategy)** 을 정의합니다.
  - 로컬 로그인 (아이디/비밀번호)
  - Google, Kakao 등 OAuth 로그인 (예: 예제 문서의 구글 로그인)
- `routes/auth.js` 에서 `/auth/login`, `/auth/google`, `/auth/google/callback` 등을 정의해 로그인 플로우를 구성합니다.
- `middleware/adminAuth.js` 에서는 “관리자 로그인 여부”를 검사해, `/admin` 페이지 보호에 사용합니다.

### 왜 이렇게 구성했는지

- 로그인은 보안 이슈가 많기 때문에, **검증된 라이브러리(Passport)** 를 쓰는 것이 안전합니다.
- 세션 저장소를 Redis로 분리해 두면, 나중에 서비스가 커져도 같은 코드 구조를 유지한 채 서버만 늘리기 쉽습니다.

### 바이브코딩 프롬프트 예시

> "Express + Passport + express-session으로 이미 기본 세션과 로컬 로그인이 설정된 쇼핑몰 프로젝트입니다. `config/passport.js`에 구글 OAuth 전략을 추가하고, `routes/auth.js`에 `/auth/google` 과 `/auth/google/callback` 라우트를 구현해 주세요. 성공 시 사용자 정보를 세션에 저장하고, `/`로 리다이렉트하는 흐름으로 만들어 주세요."

---

## 7. 환경 변수와 보조 도구들 (dotenv, bcrypt, multer, marked, nodemon, pm2)

### dotenv (환경 변수)

- `.env` 파일에 적힌 `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `SESSION_SECRET` 등을 `process.env`로 불러옵니다.
- 코드에 비밀번호를 직접 적지 않고, **환경마다 다른 설정**을 쉽게 관리할 수 있습니다.

### bcrypt (비밀번호 해시)

- 사용자가 입력한 비밀번호를 그대로 DB에 저장하면 매우 위험합니다.

- bcrypt는 비밀번호를 **일방향 해시**로 바꿔 저장해, 유출되더라도 원문을 알기 어렵게 합니다.
- 회원가입, 관리자 계정 생성 로직 등에서 사용됩니다.

### multer (파일 업로드)

- 상품 이미지, 배너 이미지 등을 업로드받아 `public/uploads/` 밑에 저장합니다.
- `middleware/upload.js` 같이, 업로드 관련 설정을 별도 파일로 분리해 관리합니다.

### marked (문서 렌더링)

- `docs/manual/`에 있는 Markdown(.md) 문서를 HTML로 바꿀 때 사용합니다.
- `/manual` 관련 라우트에서 이 코딩 가이드와 사용자/관리자 매뉴얼을 화면에 보여 줄 수 있는 이유입니다.

### nodemon (개발용), pm2 (운영용)

- **nodemon**: 개발 중에 파일을 저장하면 자동으로 서버를 재시작해 줍니다. `npm run dev` 스크립트에 연결되어 있습니다.
- **pm2**: 서버를 백그라운드에서 안정적으로 돌리고, 장애 시 자동 재시작 등을 관리해 주는 프로세스 관리자입니다. `ecosystem.config.cjs` 파일로 설정해 둘 수 있습니다.

### 바이브코딩 프롬프트 예시

> "Express 기반 쇼핑몰 프로젝트에서 multer를 사용해 `/admin/products`에 상품 이미지를 업로드하고 싶습니다. 파일은 `public/uploads/products` 폴더에 저장하고, 파일명은 현재 시각 + 원래 확장자로 저장하는 미들웨어와 컨트롤러 예제를 만들어 주세요."

---

## 8. 이 스택으로 ‘비슷한 쇼핑몰’을 만들고 싶을 때

이 프로젝트와 **비슷한 구조의 쇼핑몰을 새로 만들고 싶을 때**, AI에게는 아래처럼 요약해서 설명하면 좋습니다.

> "Node.js + Express + MySQL8 + EJS + Tailwind CSS 기술 스택으로 쇼핑몰을 만들고 싶습니다. MVC 구조(controllers, routes, views)를 사용하고, 로그인은 Passport + express-session, 세션 저장소는 나중에 Redis로 바꿀 수 있게 설계해 주세요."

그다음, 이 코딩 가이드의 다른 문서들을 참고해, 기능별로 조금씩 쪼개어 프롬프트를 던지면 됩니다.

- 구조: `프로젝트 폴더 구조` 문서
- 흐름: `MVC 패턴과 app.js` 문서
- DB: `MySQL과 DBMS` 문서
- 예제 기능: `example_google_login.md`, `example_notice.md` 등

이 페이지는 그 모든 것의 **"지도" 역할**을 하는 문서입니다. 지금 읽은 내용을 머릿속에 대략 그려 둔 뒤, 다른 문서를 보면서 "아, 이게 아까 말한 Express 부분이구나", "이 쿼리가 MySQL 부분이구나" 하고 연결해 보면 금방 감이 잡힐 것입니다.

---

## 9. 전체 아키텍처 시각화 – 기술들이 어떻게 연결되는가

```
┌────────────────────────────────────────────────────────────────────────┐
│                            브라우저 (사용자)                              │
│  - HTML/CSS/JavaScript                                                 │
│  - Tailwind CSS 클래스가 적용된 UI                                       │
│  - Session Cookie (세션 ID 포함)                                        │
└─────────────────────────────┬──────────────────────────────────────────┘
                              │ HTTP Request (GET /products)
                              ↓
┌────────────────────────────────────────────────────────────────────────┐
│                         Node.js + Express (app.js)                     │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ 1. 공통 미들웨어 처리 (순서대로 실행)                             │ │
│  │    - express.json() / urlencoded() : 요청 바디 파싱              │ │
│  │    - express-session : 세션 확인 (Redis 또는 메모리)             │ │
│  │    - passport.initialize/session() : 로그인 사용자 복원          │ │
│  │    - siteSettings : DB에서 사이트 설정 읽어 res.locals에 주입    │ │
│  │    - menuData : 카테고리 메뉴 조회                                │ │
│  │    - cartData : 로그인 사용자 장바구니 개수                       │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ 2. 라우터로 위임                                                   │ │
│  │    app.use('/products', productsRouter)                           │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬──────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────────────┐
│                      routes/products.js (Router)                       │
│  - URL 패턴 매칭: GET /                                                 │
│  - productController.getList 호출                                      │
└─────────────────────────────┬──────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────────────┐
│              controllers/productController.js (Controller)             │
│  exports.getList = async (req, res, next) => {                        │
│    const [products] = await pool.query('SELECT ...');  ───────┐       │
│    res.render('user/products/list', { products });            │       │
│  }                                                            │       │
└───────────────────────────────────────────────────────────────┼───────┘
                                                                │
                    ┌───────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────────────────────────────┐
│                    config/db.js + MySQL 8 (Database)                   │
│  - mysql2/promise 연결 풀                                               │
│  - Tables: users, products, orders, order_items, categories...         │
│  - Query 실행 후 결과 반환                                              │
└─────────────────────────────┬──────────────────────────────────────────┘
                              │ [products] 데이터 반환
                              ↓
┌────────────────────────────────────────────────────────────────────────┐
│                views/user/products/list.ejs (View/Template)            │
│  <%- layout('layouts/main_layout') %>                                  │
│  <% products.forEach(p => { %>                                         │
│    <div class="p-4 border rounded-lg"> ← Tailwind CSS                 │
│      <h2><%= p.name %></h2>                                            │
│      <p><%= p.price.toLocaleString() %>원</p>                          │
│    </div>                                                              │
│  <% }) %>                                                              │
│  → HTML 생성                                                            │
└─────────────────────────────┬──────────────────────────────────────────┘
                              │ 렌더링된 HTML
                              ↓
┌────────────────────────────────────────────────────────────────────────┐
│                            브라우저 (사용자)                              │
│  - HTML 파싱 및 렌더링                                                  │
│  - CSS 로드: /css/style.css (Tailwind 빌드 결과)                       │
│  - JavaScript 로드: /js/number-format.js 등                            │
│  - 이미지 로드: /uploads/products/썸네일.jpg                            │
└────────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────────────────┐
                    │   보조 시스템 (병렬 처리)    │
                    ├──────────────────────────────┤
                    │ Redis (Session Store)        │
                    │ - 세션 데이터 저장/조회       │
                    │ - connect-redis로 연결       │
                    ├──────────────────────────────┤
                    │ Passport (인증 전략)         │
                    │ - Local (ID/PW)              │
                    │ - Google OAuth               │
                    │ - Kakao OAuth                │
                    ├──────────────────────────────┤
                    │ File System                  │
                    │ - public/uploads/ (multer)   │
                    │ - docs/manual/ (marked)      │
                    └──────────────────────────────┘
```

### 9-1. 기술 간 통신 흐름 요약

1. **브라우저 → Express**: HTTP 요청 (+ 세션 쿠키)
2. **Express → Session Store**: 세션 ID로 사용자 정보 조회 (Redis 또는 메모리)
3. **Express → Router**: URL 패턴 매칭
4. **Router → Controller**: 비즈니스 로직 실행
5. **Controller → MySQL**: SQL 쿼리 실행 (mysql2)
6. **MySQL → Controller**: 데이터 반환
7. **Controller → EJS**: 템플릿 렌더링 (+ Tailwind 클래스)
8. **EJS → Express**: 생성된 HTML
9. **Express → 브라우저**: HTML 응답
10. **브라우저**: CSS/JS/이미지 로드, 렌더링

---

## 10. 버전 호환성 매트릭스 – 이 프로젝트의 기술 버전

| 기술 | 이 프로젝트 버전 | 최소 요구 버전 | 호환성 노트 |
|------|------------------|----------------|-------------|
| **Node.js** | v20.x | v18.x 이상 | LTS 버전 권장 (v18, v20, v22) |
| **npm** | v10.x | v9.x 이상 | Node.js 설치 시 자동 포함 |
| **Express** | ^4.18.0 | 4.16.0 이상 | Express 5.x는 아직 정식 출시 전 |
| **MySQL** | 8.0.x | 8.0.0 이상 | MySQL 5.7은 2023년 EOL |
| **mysql2** | ^3.6.0 | 3.0.0 이상 | Promise 지원 필수 |
| **EJS** | ^3.1.0 | 3.0.0 이상 | - |
| **Tailwind CSS** | ^3.4.0 | 3.0.0 이상 | v4 alpha 있지만 안정화 필요 |
| **Passport** | ^0.7.0 | 0.6.0 이상 | - |
| **bcrypt** | ^5.1.0 | 5.0.0 이상 | 네이티브 모듈 (C++ 의존성) |
| **Redis** | 7.x (선택) | 6.x 이상 | 세션 저장용, 필수 아님 |

### 10-1. 버전 업그레이드 시 주의사항

```bash
# Node.js 버전 확인
node -v  # v20.11.0

# 패키지 버전 확인
npm list --depth=0

# 주요 패키지 업데이트 (신중하게!)
npm update express mysql2 ejs
# 또는 package.json 수정 후
npm install
```

**주의**:
- **bcrypt**: Node.js 버전 업그레이드 시 재컴파일 필요
  ```bash
  npm rebuild bcrypt
  ```
- **mysql2**: 3.x → 4.x 업그레이드 시 API 변경 가능성
- **Tailwind CSS**: 3.x → 4.x 시 설정 파일 형식 변경

---

## 11. 왜 다른 기술이 아닌 이것들인가? – 대안 비교

### 11-1. 백엔드: Node.js/Express vs 대안들

| 기술 스택 | 장점 | 단점 | 선택 이유 |
|-----------|------|------|----------|
| **Node.js/Express** | • 프론트/백 모두 JavaScript<br>• 방대한 npm 생태계<br>• 바이브코딩 AI 예제 풍부 | • 타입 안정성 낮음 (TypeScript 도입 가능)<br>• CPU 집약 작업에 부적합 | ✅ 쇼핑몰은 I/O 집약적 (DB, 파일)<br>• 초보자 진입장벽 낮음 |
| **Laravel (PHP)** | • 완성도 높은 풀스택 프레임워크<br>• Eloquent ORM | • PHP 런타임 필요<br>• Node.js만큼 실시간 처리 용이하지 않음 | ❌ 추가 언어 학습 필요 |
| **Django (Python)** | • 관리자 패널 자동 생성<br>• ORM 강력 | • Python 런타임 필요<br>• 프론트와 백 언어 분리 | ❌ 추가 언어 학습 필요 |
| **Spring Boot (Java)** | • 엔터프라이즈급 안정성<br>• 타입 안정성 | • 무겁고 복잡<br>• 초보자에게 어려움 | ❌ 개인/소규모 프로젝트에 과함 |

### 11-2. 데이터베이스: MySQL vs 대안들

| 기술 | 장점 | 단점 | 선택 이유 |
|------|------|------|----------|
| **MySQL** | • 무료, 오픈소스<br>• 쇼핑몰 구조에 적합 (관계형)<br>• 호스팅 지원 광범위 | • 복잡한 JSON 처리는 약함 | ✅ 회원, 상품, 주문은 관계형 모델에 완벽히 맞음 |
| **PostgreSQL** | • 고급 기능 (JSON, 전문 검색)<br>• 표준 준수 | • MySQL만큼 호스팅 지원 넓지 않음 | 🤔 복잡한 데이터 구조 없으면 오버스펙 |
| **MongoDB** | • JSON 문서 저장<br>• 스키마 유연 | • 관계 표현 복잡<br>• 트랜잭션 약함 | ❌ 쇼핑몰은 주문/재고 정합성 중요 |
| **SQLite** | • 파일 기반, 설치 불필요 | • 동시 쓰기 성능 낮음<br>• 운영 환경 부적합 | ❌ 개발용 프로토타입만 적합 |

### 11-3. 템플릿: EJS vs 대안들

| 기술 | 장점 | 단점 | 선택 이유 |
|------|------|------|----------|
| **EJS** | • 순수 HTML + JS<br>• 학습 곡선 낮음<br>• SSR 간단 | • 복잡한 상태 관리 어려움 | ✅ 초보자에게 가장 직관적 |
| **Pug** | • 간결한 문법 | • HTML과 다른 문법 학습 필요 | ❌ 기존 디자인 템플릿 적용 어려움 |
| **Handlebars** | • 로직 분리 명확 | • 유연성 낮음 | 🤔 EJS와 유사한 수준 |
| **React/Vue** | • 컴포넌트 재사용<br>• 풍부한 생태계 | • 빌드 과정 복잡<br>• SSR 설정 어려움 | ❌ 초보자에게 진입장벽 높음 |

### 11-4. CSS: Tailwind vs 대안들

| 기술 | 장점 | 단점 | 선택 이유 |
|------|------|------|----------|
| **Tailwind CSS** | • 클래스만으로 디자인<br>• 일관성 유지 쉬움<br>• 반응형 간단 | • 클래스명 길어짐<br>• 커스텀 디자인 제약 | ✅ 쇼핑몰 UI 패턴 통일에 최적 |
| **Bootstrap** | • 컴포넌트 제공<br>• 빠른 프로토타이핑 | • 모든 사이트가 비슷해짐<br>• 커스터마이징 어려움 | ❌ 차별화된 디자인 어려움 |
| **순수 CSS** | • 완전한 자유<br>• 빌드 불필요 | • 일관성 유지 어려움<br>• 대규모 프로젝트 관리 힘듦 | ❌ 유지보수 비용 높음 |
| **Styled Components** | • CSS-in-JS<br>• 컴포넌트 스코핑 | • React 전용<br>• 런타임 오버헤드 | ❌ EJS에서 사용 불가 |

---

## 12. 개발 워크플로우 – 하루의 개발은 어떻게 흘러가는가

### 12-1. 로컬 개발 환경 시작하기

```bash
# 1) 터미널 1: 서버 실행 (nodemon으로 자동 재시작)
npm run dev
# → http://localhost:3000 에서 접속 가능

# 2) 터미널 2: Tailwind CSS 워치 모드
npm run watch:css
# → views/*.ejs 파일 수정 시 자동으로 CSS 재빌드

# 3) 터미널 3: MySQL 접속 (필요 시)
mysql -u root -p
# 또는 MySQL Workbench 사용

# 4) 브라우저
# - http://localhost:3000 (사용자 사이트)
# - http://localhost:3000/admin (관리자 대시보드)
# - http://localhost:3000/manual (코딩 가이드)
```

### 12-2. 전형적인 기능 추가 워크플로우

```
┌─────────────────────────────────────────────────────────┐
│ STEP 1: 요구사항 정리 (3분)                              │
│ - 어떤 기능? (예: 상품 찜하기)                           │
│ - 누가 사용? (사용자/관리자)                             │
│ - DB에 뭐 필요? (테이블/컬럼)                            │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│ STEP 2: DB 설계 및 생성 (10분)                           │
│ 1. tables.sql 또는 MySQL Workbench에서 CREATE TABLE     │
│ 2. 외래키/인덱스 설정                                    │
│ 3. 테스트 데이터 INSERT                                  │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│ STEP 3: 컨트롤러 작성 (15분)                             │
│ 1. controllers/wishlistController.js 생성               │
│ 2. getList, addItem, removeItem 함수 작성               │
│ 3. pool.query로 DB 조회/저장                            │
│ 4. try-catch 에러 처리                                  │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│ STEP 4: 라우터 연결 (5분)                                │
│ 1. routes/wishlist.js 생성                              │
│ 2. GET /, POST /, DELETE /:id 정의                     │
│ 3. app.js에 app.use('/wishlist', ...) 추가             │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│ STEP 5: 뷰 작성 (20분)                                   │
│ 1. views/user/wishlist/list.ejs 생성                   │
│ 2. Tailwind CSS로 디자인                                │
│ 3. 상품 상세 페이지에 "찜하기" 버튼 추가                 │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│ STEP 6: 테스트 (10분)                                    │
│ 1. 브라우저에서 기능 확인                                │
│ 2. 에러 로그 확인 (터미널 출력)                          │
│ 3. DB에서 데이터 확인 (MySQL Workbench)                 │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│ STEP 7: 디버깅 및 개선 (5-15분)                          │
│ - console.log로 변수 확인                               │
│ - 에러 메시지 복사 → AI에게 질문                        │
│ - UI 개선 (Tailwind 클래스 조정)                        │
└─────────────────────────────────────────────────────────┘

총 소요 시간: 약 60-80분 (경험에 따라 단축)
```

### 12-3. 바이브코딩 병렬 워크플로우

```
AI에게 여러 작업을 동시에 요청하면 더 빠릅니다!

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ AI 요청 1:       │  │ AI 요청 2:       │  │ AI 요청 3:       │
│ DB 테이블 설계   │  │ 컨트롤러 코드    │  │ 뷰 템플릿 작성   │
│ (3분)            │  │ (5분)            │  │ (5분)            │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                     │                     │
         └─────────────┬───────┴───────┬─────────────┘
                       ↓               ↓
                  ┌─────────────────────────────┐
                  │ 사용자가 코드 통합 (10분)   │
                  │ - 테이블 실행                │
                  │ - 컨트롤러 배치              │
                  │ - 라우터 연결                │
                  │ - 뷰 배치                    │
                  └──────────────┬──────────────┘
                                 ↓
                          ┌──────────────┐
                          │ 테스트 (5분) │
                          └──────────────┘

총 소요 시간: 약 30분 (병렬 처리로 50% 단축!)
```

---

## 13. 일반적인 기술 스택 문제 해결

### 문제 1: "Cannot find module 'express'" 에러

```bash
# 원인: npm install 안 했거나 node_modules 삭제됨
# 해결:
npm install
```

### 문제 2: MySQL 연결 실패 "ER_ACCESS_DENIED_ERROR"

```js
// .env 파일 확인
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password  // ← 비밀번호 확인!
DB_NAME=shop_db

// MySQL 사용자 권한 확인
mysql> GRANT ALL PRIVILEGES ON shop_db.* TO 'root'@'localhost';
mysql> FLUSH PRIVILEGES;
```

### 문제 3: 세션이 유지 안 됨 (로그인해도 바로 로그아웃됨)

```js
// 원인 1: SESSION_SECRET 설정 안 됨
// .env에 추가
SESSION_SECRET=your_long_random_secret_key_here

// 원인 2: 쿠키 설정 문제 (HTTPS 환경)
app.use(session({
  // ...
  cookie: {
    secure: false, // 개발 환경: false, 운영(HTTPS): true
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7일
  }
}));
```

### 문제 4: Tailwind CSS가 적용 안 됨

```bash
# 원인 1: 빌드 안 함
npm run build:css

# 원인 2: tailwind.config.js에 파일 경로 누락
// tailwind.config.js
module.exports = {
  content: [
    './views/**/*.ejs',  // ← 확인!
    './public/**/*.js',
  ],
  // ...
};

# 원인 3: 레이아웃에서 CSS 파일 링크 누락
<!-- views/layouts/main_layout.ejs -->
<link rel="stylesheet" href="/css/style.css">
```

### 문제 5: bcrypt 설치 실패 (Windows/Mac M1)

```bash
# Windows: Visual Studio Build Tools 필요
# https://visualstudio.microsoft.com/downloads/

# Mac M1: Rosetta 또는 네이티브 빌드
npm install bcrypt --build-from-source

# 대안: bcryptjs (순수 JavaScript, 느리지만 호환성 좋음)
npm uninstall bcrypt
npm install bcryptjs
```

### 문제 6: 포트 3000이 이미 사용 중 "EADDRINUSE"

```bash
# 다른 프로세스가 포트 사용 중
# 방법 1: 해당 프로세스 종료 (Mac/Linux)
lsof -i :3000
kill -9 <PID>

# 방법 2: 다른 포트 사용
# .env에 추가
PORT=3001
```

### 문제 7: Passport 로그인 후 req.user가 undefined

```js
// 원인: serializeUser/deserializeUser 설정 누락

// config/passport.js에 반드시 추가
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    done(null, users[0]);
  } catch (err) {
    done(err);
  }
});

// app.js에서 순서 확인
app.use(session({ ... }));
app.use(passport.initialize());  // ← 순서 중요!
app.use(passport.session());
```

---

## 14. 성능 최적화 팁 – 각 기술별

### Node.js/Express 최적화

```js
// 1) Gzip 압축 활성화
const compression = require('compression');
app.use(compression());

// 2) 정적 파일 캐싱
app.use(express.static('public', {
  maxAge: '1d', // 1일 캐싱
  etag: true,
}));

// 3) 프로덕션 모드
// .env
NODE_ENV=production

// 4) 클러스터 모드 (CPU 코어 활용)
// ecosystem.config.cjs (PM2)
module.exports = {
  apps: [{
    name: 'shop-mall',
    script: './app.js',
    instances: 'max', // CPU 코어 수만큼
    exec_mode: 'cluster',
  }],
};
```

### MySQL 최적화

```sql
-- 1) 자주 조회하는 컬럼에 인덱스
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_orders_user ON orders(user_id);

-- 2) 쿼리 실행 계획 확인
EXPLAIN SELECT * FROM products WHERE category_id = 7;

-- 3) 불필요한 JOIN 제거
-- ❌ 느림: 3개 테이블 JOIN
SELECT * FROM orders o
JOIN users u ON o.user_id = u.id
JOIN addresses a ON u.id = a.user_id;

-- ✅ 빠름: 필요한 것만 JOIN
SELECT o.*, u.username, u.email FROM orders o
JOIN users u ON o.user_id = u.id
WHERE o.id = 123;
```

### Tailwind CSS 최적화

```bash
# 프로덕션 빌드 (사용하지 않는 클래스 제거)
NODE_ENV=production npx tailwindcss -i ./public/css/input.css -o ./public/css/style.css --minify

# 빌드 전: 3.5MB
# 빌드 후: 20KB (99% 감소!)
```

### Redis 세션 최적화

```js
// 세션 만료 시간 설정
app.use(session({
  store: redisStore,
  ttl: 60 * 60 * 24 * 7, // 7일
  resave: false, // 변경 없으면 저장 안 함
  saveUninitialized: false, // 빈 세션 저장 안 함
}));
```

---

## 15. 자주 묻는 질문 (FAQ)

### Q1. 이 스택으로 몇 명까지 동시 접속 가능한가요?

**A**: **적절한 최적화 시 수천~수만 명**

- **기본 설정**: 동시 접속 ~1,000명 (단일 서버)
- **최적화 후**: 동시 접속 ~10,000명 (Redis + 클러스터 모드)
- **스케일 아웃**: 로드 밸런서 + 여러 서버 → 무제한 확장 가능

**병목 구간**:
1. MySQL 연결 풀 (기본 10개 → 100개로 증가 가능)
2. 세션 저장소 (메모리 → Redis로 변경)
3. Node.js 단일 스레드 (클러스터 모드로 해결)

### Q2. TypeScript로 변환할 수 있나요?

**A**: **가능하지만 초보자에게는 비추천**

```bash
# TypeScript 설치
npm install -D typescript @types/node @types/express

# tsconfig.json 생성
npx tsc --init

# .js → .ts 변환 (점진적으로)
mv app.js app.ts
mv controllers/productController.js controllers/productController.ts

# 빌드 및 실행
npm run build  # tsc
npm start      # node dist/app.js
```

**장단점**:
- ✅ 타입 안정성, IDE 자동완성 향상
- ❌ 빌드 과정 추가, 초보자 학습 곡선 높음

### Q3. React/Vue로 프론트를 바꿀 수 있나요?

**A**: **가능하지만 프로젝트 구조 대폭 변경**

**옵션 1: API 서버로 전환**
- Express는 JSON API만 제공 (`res.json`)
- React/Vue는 별도 프로젝트로 분리
- 장점: 프론트/백 독립 개발
- 단점: 복잡도 증가, SSR 안 됨

**옵션 2: 하이브리드 (일부만 SPA)**
- EJS 베이스 유지
- 복잡한 부분만 React 컴포넌트 사용
- 예: 실시간 채팅, 장바구니 등

### Q4. MongoDB로 바꾸면 어떤 장점이 있나요?

**A**: **쇼핑몰에는 권장하지 않음**

| 측면 | MySQL (현재) | MongoDB |
|------|--------------|---------|
| 주문 정합성 | ✅ 트랜잭션 강력 | ⚠️ 약함 |
| 재고 동시성 | ✅ 락 지원 | ⚠️ 복잡 |
| 관계 표현 | ✅ JOIN 쉬움 | ❌ 어려움 |
| 스키마 유연성 | ❌ 고정 | ✅ 자유 |

**MongoDB가 적합한 경우**:
- 로그 데이터 (방문 기록, 이벤트)
- 비정형 데이터 (상품 리뷰, 댓글)
- 스키마 자주 변경

### Q5. 프로덕션 배포는 어떻게 하나요?

**A**: **주요 옵션 3가지**

**1) VPS (Virtual Private Server)**
- 예: AWS EC2, DigitalOcean, Vultr
- 비용: $5~20/월
- 방법: PM2로 프로세스 관리, Nginx로 리버스 프록시

**2) PaaS (Platform as a Service)**
- 예: Heroku, Railway, Render
- 비용: $0~25/월 (무료 플랜 있음)
- 방법: Git push만으로 자동 배포

**3) 컨테이너 (Docker)**
- 예: AWS ECS, Google Cloud Run
- 비용: 사용량 기반
- 방법: Dockerfile 작성 후 이미지 빌드/배포

### Q6. 이 스택의 유지보수 비용은?

**A**: **매우 낮음**

- **서버**: $5~20/월 (VPS)
- **DB**: 무료 (MySQL 자체 설치) 또는 $15/월 (관리형 DB)
- **Redis**: $0~10/월 (소규모는 불필요)
- **도메인**: $10~15/년
- **SSL 인증서**: 무료 (Let's Encrypt)

**총 비용**: 월 $10~50 (트래픽에 따라)

### Q7. 보안은 충분한가요?

**A**: **기본 보안은 갖췄지만 추가 조치 필요**

**✅ 이미 적용된 보안**:
- bcrypt 비밀번호 해싱
- Passport 인증
- SQL 파라미터 바인딩 (인젝션 방지)
- express-session (세션 관리)

**⚠️ 추가 권장 사항**:
- Helmet.js (HTTP 헤더 보안)
- Rate Limiting (brute force 방지)
- CSRF 토큰 (폼 보호)
- HTTPS 필수 (운영 환경)
- 정기 패키지 업데이트 (`npm audit`)

---

## 16. 다음 단계 – 기술 스택 마스터하기

### 16-1. 추천 학습 순서

1. ✅ **이 문서 (tech_stack.md)** - 전체 기술 스택 이해
2. → [nodejs.md](./nodejs.md) - Node.js 런타임 깊이 이해
3. → [express_libs.md](./express_libs.md) - Express 미들웨어 마스터
4. → [mysql.md](./mysql.md) - DB 설계 및 SQL 최적화
5. → [mvc.md](./mvc.md) - 기술들을 MVC로 엮는 방법

### 16-2. 실전 연습 과제

**초급** (각 기술 개별 이해):
- [ ] Node.js로 간단한 HTTP 서버 만들기 (Express 없이)
- [ ] MySQL에 임의 데이터 1000건 INSERT
- [ ] EJS로 동적 테이블 렌더링
- [ ] Tailwind로 반응형 카드 레이아웃 만들기

**중급** (기술 통합):
- [ ] Passport로 카카오 로그인 추가
- [ ] Redis 세션 저장소로 전환
- [ ] multer로 여러 이미지 동시 업로드
- [ ] 페이지네이션 구현 (LIMIT/OFFSET)

**고급** (성능 및 운영):
- [ ] PM2 클러스터 모드로 배포
- [ ] MySQL 슬로우 쿼리 최적화
- [ ] Nginx + Let's Encrypt HTTPS 설정
- [ ] Docker로 전체 스택 컨테이너화

---

## 17. 마무리 – 기술 스택은 "도구 상자"입니다

이제 이 프로젝트의 기술 스택을 이렇게 이해할 수 있습니다:

- **Node.js/Express**: 집을 짓는 **기초와 골격**
- **MySQL**: 중요한 물건을 보관하는 **창고**
- **EJS + Tailwind**: 방을 꾸미는 **인테리어**
- **Passport + Session**: 집 현관의 **자물쇠와 출입 관리**
- **Redis**: 빠른 접근을 위한 **현관 신발장** (선택)
- **bcrypt, multer, marked**: 특수한 작업을 위한 **전문 도구들**

여러분은 이제:
- ✅ 각 기술이 무엇이고 왜 선택되었는지 이해했습니다
- ✅ 기술들이 서로 어떻게 연결되는지 시각화할 수 있습니다
- ✅ 버전 호환성과 대안 기술들을 비교할 수 있습니다
- ✅ 일반적인 문제를 스스로 해결할 수 있습니다
- ✅ 성능 최적화 방향을 알고 있습니다

**다음 단계**: 다른 기술 상세 문서([nodejs.md](./nodejs.md), [express_libs.md](./express_libs.md), [mysql.md](./mysql.md))로 이동해서 각 기술을 더 깊이 이해해 보세요!
