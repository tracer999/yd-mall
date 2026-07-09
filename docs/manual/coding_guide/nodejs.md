# Node.js 입문 – 비개발자를 위한 이해부터 첫 코드까지

이 문서는 **비개발자** 또는 **Node.js가 처음인 초보 개발자**가

- Node.js가 **어떤 배경**에서 만들어졌는지
- 왜 전 세계에서 이렇게 **많이 쓰이는지**
- 아주 간단한 **샘플 코드**를 직접 실행해 보고
- 쇼핑몰 프로젝트를 보기 전에 알아두면 좋은 **기초 문법**

을 한 번에 이해할 수 있도록 만든 **입문 가이드**입니다.

---

## 1. Node.js는 왜 생겼을까? (배경 이야기)

### 1-1. 원래 JavaScript의 자리

원래 **JavaScript**는 오직 **웹 브라우저 안**에서만 쓰는 언어였습니다.

- 버튼 클릭 시 팝업 열기
- 폼 입력값 검사하기
- 화면 일부를 동적으로 바꾸기

같은 일을 할 때만 사용되었습니다.

즉, 옛날에는 대략 이렇게 역할이 나뉘었습니다.

- **브라우저(프론트엔드)**: JavaScript, HTML, CSS
- **서버(백엔드)**: PHP, Java(Spring), .NET, Python(Django/Flask) 등

그래서 개발자는 **프론트용 언어 + 서버용 언어**를 따로 배워야 했습니다.

### 1-2. Node.js의 등장

구글 크롬 브라우저에는 **V8**이라는 매우 빠른 JavaScript 엔진이 들어 있습니다.
개발자 Ryan Dahl이 이 엔진을 브라우저 밖으로 꺼내와, **서버에서 돌아가는 JavaScript 런타임**을 만든 것이 바로 **Node.js**입니다.

핵심 아이디어는 단순합니다.

> “브라우저 말고도, **서버에서도 JavaScript를 돌릴 수 있게 해 보자.”

이 아이디어 덕분에, 이제는 **웹 서버, API 서버, CLI 도구, 배치 스크립트**까지 JavaScript로 만들 수 있게 되었습니다.

---

## 2. 왜 전 세계에서 Node.js를 많이 쓸까?

### 2-1. 프론트와 백엔드를 모두 JavaScript로

가장 큰 장점은 이것 하나로 요약할 수 있습니다.

> **“한 언어(JavaScript)로 프론트와 백엔드를 모두 개발할 수 있다.”**

덕분에:

- 팀이 **언어를 하나만 깊게** 가져가도 됨
- 프론트 개발자가 서버 코드도 이해하기 쉬움
- 풀스택 개발자(프론트+백)를 키우기 좋음

이 쇼핑몰 프로젝트도 바로 이 장점을 활용합니다.

- 브라우저: JavaScript (예: public/js/*.js)
- 서버: Node.js 위에서 돌아가는 JavaScript (app.js, controllers/*.js 등)

### 2-2. npm – 세계 최대 규모의 패키지 생태계

Node.js에는 **npm(Node Package Manager)** 이라는 패키지 관리 도구가 함께 딸려옵니다.

- 로그인/인증: Passport
- DB 연결: mysql2, mongoose 등
- 웹 프레임워크: Express, NestJS, Fastify 등
- 테스트, 빌드, 번들링, Lint, 포맷터…

필요한 대부분의 기능을 **이미 누군가 구현해 둔 패키지**로 가져다 쓸 수 있습니다.

쇼핑몰 프로젝트에서도 npm 패키지가 아주 많이 쓰입니다.

- express, express-session, connect-redis
- mysql2, ejs, express-ejs-layouts
- bcrypt, multer, marked
- nodemon, pm2 등

`package.json` 하나만 가져가면, 다른 환경에서도 `npm install`로 같은 구성을 재현할 수 있습니다.

### 2-3. 비동기 I/O와 빠른 응답

Node.js는 **비동기(Asynchronous) I/O**에 강합니다.

서버가 해야 할 일 중에는 이런 것들이 있습니다.

- DB에서 데이터 가져오기
- 디스크에서 파일 읽기/쓰기
- 외부 API(예: 결제, 배송사) 호출하기

이런 작업은 “기다리는 시간”이 많습니다. Node.js는 그 기다리는 동안 **다른 요청을 처리**해 버릴 수 있어서, 같은 자원으로 더 많은 요청을 처리할 수 있습니다.

쇼핑몰 규모에서는 “엄청난 속도 차이”를 체감하긴 어렵지만,

- **동시에 여러 사용자가 들어오는 사이트**
- **API 서버**, **채팅 서버**

등에서는 매우 큰 장점이 됩니다.

### 2-4. JSON과 찰떡궁합

웹에서 데이터를 주고받을 때 가장 많이 쓰는 형식이 **JSON**입니다.

- JavaScript Object Notation – 원래 JavaScript 객체 표기법에서 나온 형식
- 브라우저, 서버, 모바일 앱, DB 등 어디서나 쉽게 읽고 쓸 수 있음

Node.js는 애초에 JavaScript 런타임이라 **JSON을 다루기 매우 쉽고 자연스럽습니다.**

---

## 3. 이 쇼핑몰 프로젝트에서 Node.js의 역할

이 프로젝트는 한 줄로 요약하면 이렇게 말할 수 있습니다.

> “**Node.js + Express + MySQL + EJS + Tailwind** 기반의 쇼핑몰 서버”

Node.js는 그 중 **“실행 환경”** 역할을 합니다.

- `npm start` 또는 `node app.js` 로 서버 시작
- app.js 안에서 Express 앱을 만들고, 미들웨어/라우터/에러 핸들러 등을 연결
- 요청이 들어오면
  - 컨트롤러에서 MySQL에 쿼리 실행
  - 결과를 EJS 템플릿으로 넘겨 HTML 생성
  - 최종 HTML을 브라우저로 응답

즉, **쇼핑몰 전체의 엔진**이 Node.js라고 보면 됩니다.

---

## 4. Node.js와 첫 만남 – 정말 간단한 예제

### 4-1. “Hello, Node.js” 찍어 보기

1. 프로젝트 폴더 바깥 아무 곳에서, `hello.js` 라는 파일을 하나 만듭니다.
2. 파일 안에 아래 코드를 적습니다.

```js
console.log('Hello, Node.js!');
```

3. 터미널(또는 VS Code 터미널)을 열고, 해당 폴더로 이동한 다음:

```bash
node hello.js
```

4. 화면에 아래와 같이 나오면 성공입니다.

```text
Hello, Node.js!
```

여기서 중요한 포인트는 단 하나입니다.

> **JavaScript 파일을 브라우저가 아니라 터미널에서 실행했다.**

이게 바로 Node.js의 존재 이유입니다.

### 4-2. 초간단 웹 서버 만들기 (http 모듈)

이번에는 직접 작은 웹 서버를 만들어 봅니다.

1. `server.js`라는 파일을 만들고, 아래 코드를 넣습니다.

```js
// 1) Node.js 내장 모듈 불러오기
const http = require('http');

// 2) 서버 생성
const server = http.createServer((req, res) => {
  console.log('새 요청이 들어왔습니다:', req.method, req.url);

  res.statusCode = 200; // HTTP 상태 코드
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('안녕하세요! 이것은 순수 Node.js 웹 서버입니다.');
});

// 3) 포트 3000에서 서버 실행
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
```

2. 터미널에서 실행합니다.

```bash
node server.js
```

3. 브라우저에서 `http://localhost:3000` 에 접속하면, “안녕하세요! …” 라는 문장이 보일 것입니다.

이 예제는 **Express 없이** 순수 Node.js만으로 만든 웹 서버입니다.
실제 프로젝트에서는 이 코드를 직접 쓰기보다는, Express를 사용해서

- 라우팅
- 미들웨어
- 에러 처리

를 더 편하게 관리합니다.

---

## 5. Node.js를 이해하기 위한 JavaScript 기초 문법

여기서는 **Node.js 코드를 읽고 수정**할 수 있을 정도의 최소한의 JavaScript 문법만 짚고 넘어갑니다.

### 5-1. 변수: `let`과 `const`

```js
let count = 1;       // 변경 가능한 변수
const PI = 3.14159;  // 변경 불가능한 상수

count = count + 1;   // 가능
// PI = 4;          // 에러 (const는 재할당 불가)
```

- `let`: 나중에 값을 바꿀 수 있는 변수
- `const`: 한 번 정하면 바꾸지 않을 값 (기본적으로 이걸 먼저 쓰는 습관 권장)

### 5-2. 기본 자료형

```js
const age = 20;              // 숫자 (number)
const name = '홍길동';       // 문자열 (string)
const isAdmin = true;        // 논리값 (boolean)
const nothing = null;        // 값 없음 (null)
let notDefined;              // 아직 값이 없음 (undefined)
```

Node.js에서도 브라우저 JavaScript와 같은 타입을 사용합니다.

### 5-3. 객체와 배열 – JSON의 기초

```js
// 객체 (Object)
const user = {
  id: 1,
  name: '홍길동',
  email: 'hong@example.com',
};

console.log(user.name); // '홍길동'

// 배열 (Array)
const products = ['사과', '바나나', '오렌지'];
console.log(products[0]); // '사과'
```

쇼핑몰 프로젝트에서 DB에서 가져온 데이터는 보통 **객체/배열** 형태로 다룹니다.

예를 들어, 컨트롤러에서 이런 식으로 EJS에 넘겨줍니다.

```js
res.render('user/products/list', { products });
```

여기서 `products`는 “상품 목록 배열”이라고 생각하면 됩니다.

### 5-4. 조건문과 반복문

```js
// 조건문
if (age >= 19) {
  console.log('성인입니다.');
} else {
  console.log('미성년자입니다.');
}

// 반복문 (for)
for (let i = 0; i < products.length; i++) {
  console.log(products[i]);
}

// 배열 반복 (forEach)
products.forEach((item) => {
  console.log(item);
});
```

EJS 템플릿에서도 비슷한 방식으로 반복을 사용합니다.

```ejs
<% products.forEach((p) => { %>
  <div><%= p.name %></div>
<% }) %>
```

### 5-5. 함수와 화살표 함수

```js
// 일반 함수 선언
function add(a, b) {
  return a + b;
}

// 함수 표현식 + 화살표 함수
const multiply = (a, b) => {
  return a * b;
};

console.log(add(2, 3));       // 5
console.log(multiply(2, 3));  // 6
```

Node.js 코드(컨트롤러, 미들웨어)에서 자주 보는 패턴입니다.

```js
// 미들웨어 예시
const exampleMiddleware = (req, res, next) => {
  console.log('요청 시간:', new Date());
  next(); // 다음 미들웨어/라우트로 넘기기
};
```

### 5-6. 모듈: `require`와 `module.exports`

Node.js는 파일을 **모듈 단위**로 나눠서 재사용합니다.

```js
// math.js
function add(a, b) {
  return a + b;
}

module.exports = {
  add,
};
```

```js
// app.js
const { add } = require('./math');

console.log(add(1, 2)); // 3
```

이 프로젝트에서도 대부분의 파일에서 `require()`와 `module.exports`를 사용합니다.

- `config/db.js` : DB 연결 모듈 내보내기
- `controllers/*.js` : 컨트롤러 함수 묶어서 내보내기
- `routes/*.js` : `router` 객체를 모듈로 내보내기

### 5-7. 비동기 처리: `async/await`의 아주 간단한 맛보기

DB 쿼리나 파일 읽기 같은 작업은 시간이 걸립니다. Node.js에서는 이런 작업을 **비동기**로 처리합니다.

```js
// 예시: 1초 기다린 뒤에 숫자 42를 돌려주는 비동기 함수
function waitAndReturn42() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(42);
    }, 1000);
  });
}

// async/await 사용
async function run() {
  console.log('기다리는 중...');
  const result = await waitAndReturn42();
  console.log('결과:', result);
}

run();
```

실제 쇼핑몰 코드에서는 DB 쿼리를 이렇게 씁니다.

```js
// 예시 형태 (실제 코드는 컨트롤러 파일 참고)
const [rows] = await pool.query('SELECT * FROM products');
res.render('user/products/list', { products: rows });
```

여기서 중요한 것은

- `await` 는 “결과가 올 때까지 **기다렸다가** 다음 줄로 넘어간다”는 뜻
- 덕분에 비동기 코드를 **동기 코드처럼 읽기 쉽게** 쓸 수 있다는 점입니다.

---

## 6. 이 프로젝트를 기준으로 한 Node.js 요약

지금까지 내용을 **이 쇼핑몰 프로젝트 관점**에서 다시 한 줄씩 정리해 보면:

1. **Node.js**: JavaScript를 서버에서 실행하게 해 주는 런타임 – 이 프로젝트의 모든 서버 코드는 Node.js 위에서 돌아갑니다.
2. **npm**: 필요한 라이브러리를 설치하고 관리하는 도구 – `package.json`에 의존성이 기록됩니다.
3. **Express**: Node.js로 웹 서버를 만들기 쉽게 도와주는 프레임워크 – 라우팅/미들웨어/에러 처리를 담당합니다.
4. **MySQL + mysql2**: 회원·상품·주문 데이터 저장소 – Node.js 코드에서 SQL을 실행해 데이터를 읽고 씁니다.
5. **EJS + Tailwind**: 화면을 만드는 도구 – Node.js가 데이터를 담아 HTML을 만들어 브라우저로 보냅니다.

이제 “Node.js가 뭐냐”라는 질문에는 이렇게 답할 수 있으면 충분합니다.

> “브라우저 밖에서 JavaScript를 실행하게 해 주는 서버용 런타임이고,
>  이 쇼핑몰에서는 Express, MySQL, EJS 같은 것들을 얹어서 **웹 서버 전체를 만드는 기반**으로 쓰이고 있다.”

여기까지 이해했다면, 다음 단계로는 아래 문서를 이어서 보면 좋습니다.

- **MVC 패턴과 app.js** – 이 Node.js 서버가 어떤 구조(MVC)로 나뉘어 있는지
- **MySQL과 DBMS** – Node.js 코드와 DB가 어떻게 연결되는지
- **프로젝트 폴더 구조** – 실제 파일이 어디에 있는지

이제 Node.js라는 이름이 **막연한 단어**가 아니라, "아, 우리 쇼핑몰 코드를 실제로 실행시키는 그 환경이구나" 정도로 느껴지면 이 문서의 목표는 달성된 것입니다.

---

## 7. Node.js 이벤트 루프 – 비동기 처리의 핵심

Node.js가 빠른 이유는 **이벤트 루프(Event Loop)** 라는 독특한 구조 때문입니다.

### 7-1. 동기 vs 비동기

**동기(Synchronous)**: 한 작업이 끝나야 다음 작업 시작
```javascript
console.log('1');
console.log('2');
console.log('3');
// 출력: 1, 2, 3 (순서대로)
```

**비동기(Asynchronous)**: 기다리는 동안 다른 작업 진행
```javascript
console.log('1');
setTimeout(() => {
  console.log('2');
}, 1000); // 1초 후 실행
console.log('3');
// 출력: 1, 3, 2 (2는 1초 후)
```

### 7-2. 이벤트 루프 작동 원리 (간단히)

```
┌───────────────────────────┐
│   호출 스택 (Call Stack)   │ ← JavaScript 코드 실행
└───────────┬───────────────┘
            │
            ↓
┌───────────────────────────┐
│   Node.js API             │ ← 비동기 작업 (파일, DB, 타이머)
│  (파일, 네트워크, DB 등)  │
└───────────┬───────────────┘
            │ 작업 완료
            ↓
┌───────────────────────────┐
│   콜백 큐 (Callback Queue)│ ← 완료된 작업들 대기
└───────────┬───────────────┘
            │
            ↓
┌───────────────────────────┐
│   이벤트 루프             │ ← "호출 스택이 비었나?" 확인
│   (Event Loop)            │    비었으면 큐에서 꺼내 실행
└───────────────────────────┘
```

**실전 예제:**
```javascript
console.log('시작');

// DB 쿼리 (비동기)
pool.query('SELECT * FROM users', (err, rows) => {
  console.log('DB 결과:', rows.length);
});

console.log('끝');

// 출력 순서:
// 1. 시작
// 2. 끝
// 3. DB 결과: 5
```

### 7-3. Promise와 async/await

**콜백 지옥 (Callback Hell) 문제:**
```javascript
// ❌ 읽기 어려운 코드
pool.query('SELECT * FROM users', (err1, users) => {
  pool.query('SELECT * FROM products', (err2, products) => {
    pool.query('SELECT * FROM orders', (err3, orders) => {
      // 점점 깊어짐...
    });
  });
});
```

**Promise로 개선:**
```javascript
pool.query('SELECT * FROM users')
  .then(users => pool.query('SELECT * FROM products'))
  .then(products => pool.query('SELECT * FROM orders'))
  .then(orders => console.log('완료'))
  .catch(err => console.error('에러:', err));
```

**async/await로 더 깔끔하게 (이 프로젝트 방식):**
```javascript
// ✅ 읽기 쉬운 코드
async function getData() {
  try {
    const [users] = await pool.query('SELECT * FROM users');
    const [products] = await pool.query('SELECT * FROM products');
    const [orders] = await pool.query('SELECT * FROM orders');
    console.log('완료');
  } catch (err) {
    console.error('에러:', err);
  }
}
```

---

## 8. npm 완전 가이드 – 패키지 관리의 모든 것

### 8-1. package.json 이해하기

```json
{
  "name": "dev-mall",
  "version": "1.0.0",
  "description": "쇼핑몰 프로젝트",
  "main": "app.js",
  "scripts": {
    "start": "node app.js",
    "dev": "nodemon app.js",
    "build:css": "tailwindcss -i ./public/css/input.css -o ./public/css/style.css",
    "watch:css": "tailwindcss -i ./public/css/input.css -o ./public/css/style.css --watch"
  },
  "dependencies": {
    "express": "^4.18.0",
    "mysql2": "^3.6.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
```

**주요 필드 설명:**

| 필드 | 설명 | 예시 |
|------|------|------|
| `name` | 프로젝트 이름 | "dev-mall" |
| `version` | 버전 (Semantic Versioning) | "1.0.0" |
| `scripts` | npm 명령어 단축키 | `npm run dev` |
| `dependencies` | 운영에 필요한 패키지 | express, mysql2 |
| `devDependencies` | 개발에만 필요한 패키지 | nodemon, eslint |

### 8-2. 의존성 버전 관리

```json
"dependencies": {
  "express": "4.18.0",      // 정확히 4.18.0
  "mysql2": "^3.6.0",       // 3.6.0 이상, 4.0.0 미만
  "ejs": "~3.1.9"           // 3.1.x (마이너 버전 고정)
}
```

**버전 표기법:**
- `1.2.3`: Major.Minor.Patch
- `^1.2.3`: 1.x.x (Major 고정)
- `~1.2.3`: 1.2.x (Minor 고정)
- `*` 또는 빈 값: 최신 버전

### 8-3. npm 주요 명령어

```bash
# 패키지 설치
npm install express           # 최신 버전 설치
npm install express@4.18.0    # 특정 버전 설치
npm install                   # package.json의 모든 패키지 설치

# 개발 의존성 설치
npm install --save-dev nodemon  # devDependencies에 추가

# 패키지 제거
npm uninstall express

# 패키지 업데이트
npm update                    # 모든 패키지 업데이트
npm update express            # 특정 패키지 업데이트

# 보안 취약점 확인 및 수정
npm audit                     # 취약점 확인
npm audit fix                 # 자동 수정

# 스크립트 실행
npm run dev                   # scripts의 dev 명령 실행
npm start                     # scripts의 start 명령 실행 (run 생략 가능)

# 패키지 정보 확인
npm list                      # 설치된 패키지 트리
npm list --depth=0            # 최상위 패키지만
npm outdated                  # 업데이트 가능한 패키지 확인
```

### 8-4. package-lock.json의 역할

```
package.json          package-lock.json
     │                       │
     │ "express": "^4.18.0"  │ "express": "4.18.2" (정확한 버전)
     │                       │ + 모든 하위 의존성의 정확한 버전
     └───────────────────────┘
```

**왜 필요한가?**
- 팀원 모두가 **정확히 같은 버전**의 패키지 설치
- `npm install` 속도 향상
- **package-lock.json도 git에 커밋해야 함!**

---

## 9. Node.js 모듈 시스템 – CommonJS vs ES Modules

### 9-1. CommonJS (이 프로젝트 방식)

```javascript
// 내보내기 (module.exports)
// math.js
function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

module.exports = {
  add,
  subtract
};

// 또는 개별 내보내기
exports.multiply = (a, b) => a * b;
```

```javascript
// 가져오기 (require)
// app.js
const math = require('./math');
console.log(math.add(2, 3));  // 5

// 또는 구조 분해
const { add, subtract } = require('./math');
console.log(add(2, 3));  // 5
```

### 9-2. ES Modules (최신 방식)

```javascript
// 내보내기 (export)
// math.mjs
export function add(a, b) {
  return a + b;
}

export function subtract(a, b) {
  return a - b;
}

// 또는 기본 내보내기
export default {
  add,
  subtract
};
```

```javascript
// 가져오기 (import)
// app.mjs
import { add, subtract } from './math.mjs';
console.log(add(2, 3));  // 5

// 또는 기본 가져오기
import math from './math.mjs';
console.log(math.add(2, 3));  // 5
```

### 9-3. 이 프로젝트에서는 CommonJS 사용

**이유:**
- Node.js 전통 방식 (안정적)
- 대부분의 npm 패키지가 CommonJS
- 설정 없이 바로 사용 가능

**ES Modules 사용하려면:**
- `package.json`에 `"type": "module"` 추가
- 또는 파일 확장자를 `.mjs`로 변경

---

## 10. 환경 변수와 process.env

### 10-1. .env 파일

```bash
# .env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=mypassword
DB_NAME=shop_db

SESSION_SECRET=your-secret-key-here

NODE_ENV=development
PORT=3000
```

### 10-2. dotenv로 불러오기

```javascript
// app.js 맨 위에
require('dotenv').config();

// 이제 process.env로 접근 가능
const port = process.env.PORT || 3000;
const dbHost = process.env.DB_HOST;

console.log('서버 포트:', port);
console.log('DB 호스트:', dbHost);
```

### 10-3. 환경별 설정 분리

```
.env                  (기본값)
.env.development      (개발 환경)
.env.production       (운영 환경)
.env.test             (테스트 환경)
```

```javascript
// 환경별 설정 로드
const envFile = process.env.NODE_ENV === 'production'
  ? '.env.production'
  : '.env.development';

require('dotenv').config({ path: envFile });
```

### 10-4. 보안 주의사항

```bash
# .gitignore에 반드시 추가!
.env
.env.*
!.env.example
```

```bash
# .env.example (git에 커밋 가능)
DB_HOST=localhost
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=your_database
SESSION_SECRET=your_secret_key
PORT=3000
```

---

## 11. Node.js 디버깅 가이드

### 11-1. console.log 디버깅

```javascript
// 기본 출력
console.log('디버깅:', variable);

// 객체 출력
console.log('사용자:', JSON.stringify(user, null, 2));

// 여러 값 한 번에
console.log({ userId, productId, quantity });

// 시간 측정
console.time('쿼리 실행');
await pool.query('SELECT * FROM products');
console.timeEnd('쿼리 실행');  // 쿼리 실행: 234ms
```

### 11-2. VS Code 디버거 사용

**launch.json 설정:**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Node.js 디버그",
      "program": "${workspaceFolder}/app.js",
      "envFile": "${workspaceFolder}/.env"
    }
  ]
}
```

**사용 방법:**
1. 코드에 중단점(breakpoint) 설정 (줄 번호 옆 클릭)
2. F5 키로 디버그 시작
3. 변수 값 확인, 단계별 실행

### 11-3. Node.js 내장 디버거

```bash
# 디버그 모드로 실행
node --inspect app.js

# Chrome DevTools로 디버깅
# chrome://inspect 접속 → "Open dedicated DevTools for Node"
```

---

## 12. 이 프로젝트에서 자주 쓰이는 Node.js 패턴

### 패턴 1: 비동기 컨트롤러

```javascript
exports.getList = async (req, res, next) => {
  try {
    // 비동기 작업
    const [rows] = await pool.query('SELECT * FROM products');

    // 응답
    res.render('products/list', { products: rows });
  } catch (err) {
    // 에러 전달
    next(err);
  }
};
```

### 패턴 2: 미들웨어 체이닝

```javascript
// 여러 미들웨어를 순서대로 실행
app.get('/admin/products',
  requireLogin,           // 1. 로그인 확인
  requireAdminRole,       // 2. 관리자 권한 확인
  productController.getList  // 3. 컨트롤러 실행
);
```

### 패턴 3: 에러 처리 미들웨어

```javascript
// 모든 라우트 뒤에 배치
app.use((err, req, res, next) => {
  console.error('에러 발생:', err);

  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});
```

### 패턴 4: 유틸리티 함수 모듈화

```javascript
// utils/format.js
exports.formatPrice = (price) => {
  return price.toLocaleString('ko-KR') + '원';
};

exports.formatDate = (date) => {
  return new Date(date).toLocaleDateString('ko-KR');
};

// controllers/productController.js
const { formatPrice } = require('../utils/format');

exports.getDetail = async (req, res, next) => {
  const [products] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  const product = products[0];

  res.render('products/detail', {
    product,
    formattedPrice: formatPrice(product.price)
  });
};
```

---

## 13. 성능 최적화 팁

### 팁 1: 클러스터 모드로 CPU 활용

```javascript
// cluster.js
const cluster = require('cluster');
const os = require('os');

if (cluster.isMaster) {
  // CPU 코어 수만큼 워커 생성
  const numCPUs = os.cpus().length;

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    console.log(`워커 ${worker.id} 종료, 재시작...`);
    cluster.fork();
  });
} else {
  // 워커 프로세스는 실제 서버 실행
  require('./app.js');
}
```

### 팁 2: 캐싱으로 DB 부하 감소

```javascript
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 600 }); // 10분 캐시

exports.getProducts = async (req, res, next) => {
  const cacheKey = 'products_list';

  // 캐시 확인
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.render('products/list', { products: cached });
  }

  // 캐시 없으면 DB 조회
  const [products] = await pool.query('SELECT * FROM products');

  // 캐시 저장
  cache.set(cacheKey, products);

  res.render('products/list', { products });
};
```

### 팁 3: 연결 풀 최적화

```javascript
// config/db.js
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  // 성능 튜닝
  connectionLimit: 10,          // 동시 연결 수
  waitForConnections: true,     // 연결 대기
  queueLimit: 0                 // 대기 큐 무제한
});
```

---

## 14. 자주 묻는 질문 (FAQ)

### Q1. Node.js와 JavaScript의 차이는?

**A**: JavaScript는 **언어**, Node.js는 **실행 환경**

- JavaScript: 프로그래밍 언어 (문법, 규칙)
- Node.js: JavaScript를 서버에서 실행하는 런타임
- 브라우저: JavaScript를 클라이언트에서 실행하는 또 다른 런타임

### Q2. npm과 npx의 차이는?

**A**:
- `npm`: 패키지 설치/관리 도구
- `npx`: 패키지를 설치하지 않고 일회성 실행

```bash
# npm: 설치 후 실행
npm install -g create-react-app
create-react-app my-app

# npx: 설치 없이 즉시 실행
npx create-react-app my-app
```

### Q3. Node.js가 싱글 스레드인데 어떻게 많은 요청을 처리하나요?

**A**: **비동기 I/O + 이벤트 루프** 덕분

```
[요청 1] DB 조회 → 대기 중...
[요청 2] 파일 읽기 → 대기 중...
[요청 3] API 호출 → 대기 중...
          ↓
    이벤트 루프가 완료된 작업부터 처리
```

CPU 작업은 싱글 스레드지만, I/O 작업은 백그라운드에서 병렬 처리

### Q4. require vs import 어떤 걸 써야 하나요?

**A**: **이 프로젝트는 require (CommonJS)**

- `require`: Node.js 전통 방식 (안정적)
- `import`: 최신 방식 (ES6+)
- 혼용 불가, 한 프로젝트에서 하나만 선택

### Q5. async/await 없이 pool.query를 쓰면 어떻게 되나요?

**A**: **Promise 객체가 반환됨 (실제 데이터 아님)**

```javascript
// ❌ 잘못된 코드
const [products] = pool.query('SELECT * FROM products');
console.log(products);  // Promise { <pending> }

// ✅ 올바른 코드
const [products] = await pool.query('SELECT * FROM products');
console.log(products);  // [ { id: 1, name: '상품A' }, ... ]
```

### Q6. Node.js 버전을 어떻게 관리하나요?

**A**: **nvm (Node Version Manager) 사용**

```bash
# nvm 설치 후
nvm install 20        # Node.js 20 설치
nvm use 20            # Node.js 20 사용
nvm list              # 설치된 버전 목록

# 프로젝트별 버전 고정
echo "20.11.0" > .nvmrc
nvm use               # .nvmrc 파일의 버전 자동 사용
```

---

## 15. 다음 단계 – Node.js 마스터하기

### 15-1. 추천 학습 순서

1. ✅ **이 문서 (nodejs.md)** - Node.js 기초
2. → [express_libs.md](./express_libs.md) - Express 프레임워크 깊이 이해
3. → [mvc.md](./mvc.md) - Node.js로 MVC 구현하기
4. → **공식 문서**: [Node.js Documentation](https://nodejs.org/docs/)

### 15-2. 실전 연습 과제

**초급**:
- [ ] 간단한 HTTP 서버 만들기 (Express 없이)
- [ ] 파일 읽기/쓰기 (fs 모듈)
- [ ] 환경 변수 사용해보기 (.env)

**중급**:
- [ ] REST API 서버 만들기 (Express + MySQL)
- [ ] 미들웨어 체이닝 구현
- [ ] 에러 처리 시스템 구축

**고급**:
- [ ] 클러스터 모드로 멀티 프로세스 운영
- [ ] 메모리 캐싱 구현
- [ ] 웹소켓 실시간 통신 (Socket.IO)

---

## 16. 마무리 – Node.js는 "엔진"입니다

이제 Node.js를 이렇게 이해할 수 있습니다:

- **Node.js**: JavaScript를 서버에서 실행하는 **런타임 엔진**
- **npm**: 필요한 도구(패키지)를 설치하는 **도구 상자**
- **비동기 I/O**: 여러 작업을 동시에 처리하는 **효율적인 작업 방식**
- **이벤트 루프**: 작업 완료를 감시하는 **교통 정리**
- **모듈 시스템**: 코드를 재사용 가능하게 나누는 **조립식 구조**

여러분은 이제:
- ✅ Node.js가 무엇인지 이해했습니다
- ✅ 기본 JavaScript 문법을 알게 되었습니다
- ✅ 비동기 처리(async/await)를 이해했습니다
- ✅ npm으로 패키지를 관리할 수 있습니다
- ✅ 환경 변수로 설정을 관리할 수 있습니다
- ✅ 디버깅 방법을 알게 되었습니다

**다음 단계**: [express_libs.md](./express_libs.md)로 이동해서 Node.js 위에서 돌아가는 Express 프레임워크를 배워 보세요!
