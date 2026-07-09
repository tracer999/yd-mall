# MySQL 실전 – Node.js 쇼핑몰과 연결하기

> **사전 지식**: DB 기초 용어(테이블, 컬럼, PK, FK 등)와 데이터 타입이 익숙하지 않다면
> 먼저 [챕터1 – MySQL과 DBMS 기초](./mysql.md)를 읽고 오세요.

이 문서는 **Node.js + Express + mysql2** 환경에서 MySQL을 실제로 연동하는 방법을 다룹니다.
컨트롤러에서 쿼리를 실행하는 패턴, JOIN, 집계, 트랜잭션, 보안, 성능 디버깅까지
쇼핑몰 프로젝트 코드를 예시로 설명합니다.

---

## 1. MySQL 8과 이 쇼핑몰 프로젝트의 연결 구조

이 프로젝트에서 MySQL은 **모든 비즈니스 데이터의 저장소** 역할을 합니다.

### 1-1. 어디에서 연결하나 – config/db.js

- [config/db.js](../../config/db.js) 파일에서 `mysql2/promise` 패키지를 사용해 **연결 풀(pool)** 을 만듭니다.
- DB 접속 정보는 `.env` 의 환경 변수에서 가져옵니다.

개념적으로는 이런 구조입니다.

```js
// config/db.js (개념 버전)
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
```

### 1-2. 컨트롤러에서 어떻게 쓰나

컨트롤러 파일에서는 보통 이렇게 사용합니다.

```js
const pool = require('../config/db');

exports.getNotices = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM notices WHERE is_deleted = 0 ORDER BY importance DESC, created_at DESC'
    );

    res.render('user/notices/list', { notices: rows });
  } catch (err) {
    next(err);
  }
};
```

여기서 중요한 점은:

- `pool.query(SQL, [파라미터])` 형태로 쿼리를 실행한다.
- 결과는 `[rows]` 로 받는데, `rows` 가 곧 **행들의 배열(Array)** 이다.
- 이 배열을 EJS 뷰에 넘겨서 화면에 표시한다.

### 1-3. 테이블 정의는 어디에 있나 – tables.sql

- 프로젝트 루트의 [tables.sql](../../tables.sql)에 주요 테이블 정의가 모여 있습니다.
- 새 기능을 추가할 때는 여기 스타일을 본떠 테이블을 추가하는 것이 좋습니다.

예를 들어, 공지사항 테이블은 `notices` 같은 이름으로 정의되어 있습니다.

```sql
CREATE TABLE IF NOT EXISTS `notices` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '공지 ID (PK)',
  `title` varchar(100) NOT NULL COMMENT '공지 제목',
  `content` text NOT NULL COMMENT '공지 내용',
  `importance` int DEFAULT 0 COMMENT '중요도 (0:일반, 1:중요)',
  `view_count` int DEFAULT 0 COMMENT '조회수',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '작성일시',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='공지사항';
```

---

## 2. SQL 기본 문법 – CRUD 중심으로 보기

SQL은 크게 **CRUD** 네 가지 작업으로 나눌 수 있습니다.

- **C**reate (생성) → INSERT
- **R**ead (조회) → SELECT
- **U**pdate (수정) → UPDATE
- **D**elete (삭제) → DELETE

### 2-1. SELECT – 데이터 조회하기

```sql
-- 공지 목록 전체 조회 (중요도 높은 것부터, 최신순)
SELECT *
FROM notices
WHERE is_deleted = 0
ORDER BY importance DESC, created_at DESC;

-- 특정 ID의 공지 한 건 조회
SELECT * FROM notices WHERE id = 10;

-- 특정 회원의 주문 목록
SELECT * FROM orders WHERE user_id = 5 ORDER BY created_at DESC;
```

컨트롤러에서는 이렇게 사용합니다.

```js
const [rows] = await pool.query(
  'SELECT * FROM notices WHERE is_deleted = 0 ORDER BY importance DESC, created_at DESC'
);
```

### 2-2. INSERT – 새 데이터 추가하기

```sql
-- 새 공지 추가
INSERT INTO notices (title, content, importance)
VALUES ('서버 점검 안내', '3월 1일 새벽 2시 서버 점검...', 1);

-- 새 회원 추가 (일부 컬럼만 예시)
INSERT INTO users (email, name, password)
VALUES ('hong@example.com', '홍길동', '암호화된비밀번호');
```

컨트롤러에서는

```js
await pool.query(
  'INSERT INTO notices (title, content, importance) VALUES (?, ?, ?)',
  [title, content, importance]
);
```

처럼 **? 자리**에 실제 값을 배열로 넘겨 SQL 인젝션을 예방합니다.

### 2-3. UPDATE – 기존 데이터 수정하기

```sql
-- 공지 제목/내용/중요도 수정
UPDATE notices
SET title = '제목 수정',
    content = '내용 수정',
    importance = 0
WHERE id = 10;

-- 공지 조회수 1 증가
UPDATE notices
SET view_count = view_count + 1
WHERE id = 10;
```

Node.js 코드에서는:

```js
await pool.query(
  'UPDATE notices SET view_count = view_count + 1 WHERE id = ?',
  [id]
);
```

### 2-4. DELETE – 데이터 삭제하기

```sql
-- 특정 공지 삭제 (실제 운영에서는 보통 is_deleted 플래그만 변경)
DELETE FROM notices WHERE id = 10;
```

실제 쇼핑몰에서는 물리적 삭제 대신 다음처럼 **논리 삭제(soft delete)** 를 많이 씁니다.

```sql
UPDATE notices SET is_deleted = 1 WHERE id = 10;
```

그다음 조회할 때는 항상 `WHERE is_deleted = 0` 조건을 붙입니다.

---

## 3. 테이블 만들기와 변경하기 – CREATE TABLE, ALTER TABLE

새 기능을 만들다 보면 **새 테이블이 필요**하거나, 기존 테이블에 **컬럼을 추가**해야 할 때가 있습니다.

### 3-1. CREATE TABLE – 새 테이블 만들기

예를 들어 "FAQ(자주 묻는 질문)" 기능을 위해 `faqs` 테이블을 만든다고 해 봅시다.

```sql
CREATE TABLE IF NOT EXISTS faqs (
  id INT NOT NULL AUTO_INCREMENT COMMENT 'FAQ ID (PK)',
  question VARCHAR(255) NOT NULL COMMENT '질문',
  answer TEXT NOT NULL COMMENT '답변',
  display_order INT DEFAULT 0 COMMENT '노출 순서 (작을수록 위)',
  is_visible TINYINT(1) NOT NULL DEFAULT 1 COMMENT '노출 여부 (1:노출, 0:숨김)',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일시',
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='FAQ(자주 묻는 질문)';
```

이 정도만 읽을 수 있으면, 새로운 기능에 맞는 테이블을 충분히 설계할 수 있습니다.

### 3-2. ALTER TABLE – 기존 테이블 바꾸기

이미 운영 중인 서비스에서 테이블을 바꿀 때는 **주의**가 필요합니다.
간단한 컬럼 추가 정도는 아래처럼 할 수 있습니다.

```sql
-- 공지사항에 수정일 컬럼 추가
ALTER TABLE notices
ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시';
```

컬럼 타입 변경, 이름 변경 등은 위험할 수 있으니 꼭 **백업 후**, 테스트 환경에서 먼저 시도하는 것이 좋습니다.

---

## 4. 이 쇼핑몰의 대표적인 테이블 관계 예시

정확한 구조는 [tables.sql](../../tables.sql) 을 보면 되지만, 개념적으로는 다음과 비슷합니다.

- `users` : 회원
- `products` : 상품
- `orders` : 주문(주문 번호, 주문자, 총액 등)
- `order_items` : 주문에 포함된 개별 상품
- `carts` / `cart_items` : 장바구니
- `notices` : 공지사항
- `coupons`, `points` : 쿠폰, 포인트

관계 예시:

- `orders.user_id` → `users.id` (회원 1명이 여러 주문을 할 수 있음)
- `order_items.order_id` → `orders.id` (주문 1건에 여러 상품이 있을 수 있음)
- `order_items.product_id` → `products.id`

이런 관계를 머릿속에 떠올리면서, SQL을 이렇게 쓸 수 있습니다.

```sql
-- 특정 회원의 최근 주문 5개
SELECT * FROM orders
WHERE user_id = ?
ORDER BY created_at DESC
LIMIT 5;

-- 특정 주문에 포함된 상품 목록
SELECT oi.*, p.name, p.price
FROM order_items oi
JOIN products p ON oi.product_id = p.id
WHERE oi.order_id = ?;
```

---

## 5. 바이브코딩(Vibe Coding)에서 DB를 다룰 때의 프롬프트 예시

바이브코딩으로 AI에게 DB 관련 작업을 부탁할 때는, **테이블 구조와 목적**을 먼저 설명해 주면 좋습니다.

### 5-1. 테이블 설계 요청 예시

> "MySQL 8을 사용하는 쇼핑몰 프로젝트입니다. 회원(users), 주문(orders) 테이블이 이미 있고, 주문에 포함된 상품을 저장할 `order_items` 테이블을 추가하고 싶습니다. order_items는 id(PK, auto increment), order_id(orders.id FK), product_id(products.id FK), quantity(수량), price(당시 상품 가격), created_at 컬럼을 가지도록 CREATE TABLE 쿼리를 작성해 주세요. InnoDB, utf8mb4를 사용해 주세요."

### 5-2. 쿼리 작성 요청 예시

> "Node.js + Express + mysql2/promise를 사용하는 프로젝트입니다. `config/db.js`에 `pool`이 있고, `orders`와 `order_items`, `products` 테이블이 있습니다. 특정 회원의 최근 주문 10개를 조회하는 SQL과, 각 주문의 상품 목록을 JOIN으로 함께 가져오는 SQL 예제를 작성해 주세요."

이렇게 **DB 구조 + 의도**를 먼저 설명하면, AI가 이 프로젝트에 맞는 SQL과 Node.js 코드를 제안하기 쉬워집니다.

---

## 6. 정리

이제 데이터베이스와 MySQL을 이렇게 이해할 수 있으면 충분합니다.

1. 데이터베이스는 **프로그램이 사용하는 엑셀 파일 묶음** 같은 것, DBMS는 그걸 관리하는 **전문 프로그램**이다.
2. MySQL은 그중 하나의 **관계형 DBMS** 이고, 이 프로젝트의 모든 중요한 데이터가 여기 저장된다.
3. 테이블은 시트, 행은 한 건의 데이터, 컬럼은 데이터의 종류, PK/FK/인덱스/NULL/DEFAULT 같은 용어가 있다.
4. Node.js 코드에서는 `config/db.js`의 `pool`을 통해 `pool.query(SQL, [파라미터])` 로 DB와 대화한다.
5. CRUD(SELECT, INSERT, UPDATE, DELETE)와 테이블 정의/변경(CREATE TABLE, ALTER TABLE)만 이해해도, 쇼핑몰 대부분 기능의 SQL을 읽고 수정할 수 있다.

이제 MySQL이 그냥 "어딘가에 있는 검은 상자"가 아니라,

> "회원, 상품, 주문, 공지 같은 정보를 **표 형태로 안전하게 보관해 주는 창고"이고,
>  Node.js 컨트롤러가 SQL로 그 창고에 말을 거는 구조"

라는 정도로 느껴진다면, 이 문서의 목적은 달성된 것입니다.

---

## 7. JOIN 연산 완전 정복 – 테이블 관계 연결하기

실전 쇼핑몰에서는 **여러 테이블을 연결해서** 데이터를 조회하는 경우가 매우 많습니다. 이때 사용하는 것이 **JOIN**입니다.

### 7-1. JOIN이 왜 필요한가?

데이터를 **정규화(normalization)** 하면, 중복을 줄이고 일관성을 유지하기 쉽지만, 데이터가 여러 테이블로 분산됩니다.

**예시**:
- `orders` 테이블: 주문 기본 정보 (주문 번호, 주문자 ID, 총액, 날짜)
- `order_items` 테이블: 주문에 포함된 개별 상품 (주문 ID, 상품 ID, 수량, 가격)
- `products` 테이블: 상품 정보 (상품명, 설명, 이미지)
- `users` 테이블: 회원 정보 (이름, 이메일)

**문제**: "주문 번호 123에 포함된 상품 이름과 수량을 보고 싶다"
→ `order_items`에는 `product_id`만 있고, 상품명은 `products`에 있음
→ 두 테이블을 **JOIN**해야 함!

### 7-2. INNER JOIN – 양쪽 모두 있는 것만

```sql
-- 주문 번호 123의 상품 목록 (상품명 포함)
SELECT
  oi.id,
  oi.quantity,
  oi.price AS unit_price,
  p.name AS product_name,
  p.thumbnail_url
FROM order_items oi
INNER JOIN products p ON oi.product_id = p.id
WHERE oi.order_id = 123;
```

**결과**: `order_items`와 `products` 둘 다 있는 행만 반환
- 만약 `product_id`가 10인데 `products`에 id=10이 없으면 그 행은 제외됨

**시각화**:
```
order_items (oi)         products (p)
┌────┬──────────┬────┐   ┌────┬─────────┐
│ id │product_id│qty │   │ id │  name   │
├────┼──────────┼────┤   ├────┼─────────┤
│ 1  │    5     │ 2  │   │ 5  │  마우스  │ ← 매칭 O
│ 2  │    7     │ 1  │   │ 7  │ 키보드   │ ← 매칭 O
│ 3  │   99     │ 1  │   │ 8  │ 모니터  │
└────┴──────────┴────┘   └────┴─────────┘
                            ↑ id=99 없음

INNER JOIN 결과:
┌────┬──────────┬────┬─────────┐
│ id │product_id│qty │  name   │
├────┼──────────┼────┼─────────┤
│ 1  │    5     │ 2  │ 마우스   │
│ 2  │    7     │ 1  │ 키보드   │
└────┴──────────┴────┴─────────┘
(id=99는 products에 없어서 제외됨)
```

### 7-3. LEFT JOIN – 왼쪽은 전부, 오른쪽은 있으면

```sql
-- 모든 주문 상품 목록 (상품이 삭제되었어도 표시)
SELECT
  oi.id,
  oi.quantity,
  oi.price,
  COALESCE(p.name, '(삭제된 상품)') AS product_name
FROM order_items oi
LEFT JOIN products p ON oi.product_id = p.id
WHERE oi.order_id = 123;
```

**결과**: `order_items`의 모든 행 반환, `products`에 없으면 NULL

**시각화**:
```
LEFT JOIN 결과:
┌────┬──────────┬────┬─────────────┐
│ id │product_id│qty │    name     │
├────┼──────────┼────┼─────────────┤
│ 1  │    5     │ 2  │ 마우스       │
│ 2  │    7     │ 1  │ 키보드       │
│ 3  │   99     │ 1  │ NULL        │ ← 여전히 표시됨!
└────┴──────────┴────┴─────────────┘
(COALESCE로 NULL을 '(삭제된 상품)'으로 대체 가능)
```

### 7-4. 여러 테이블 JOIN

```sql
-- 주문 번호 123의 전체 정보 (주문자 이름, 상품명, 수량)
SELECT
  o.id AS order_id,
  o.created_at AS order_date,
  u.username AS customer_name,
  u.email AS customer_email,
  p.name AS product_name,
  oi.quantity,
  oi.price,
  (oi.quantity * oi.price) AS subtotal
FROM orders o
INNER JOIN users u ON o.user_id = u.id
INNER JOIN order_items oi ON o.id = oi.order_id
INNER JOIN products p ON oi.product_id = p.id
WHERE o.id = 123;
```

**JOIN 순서**:
1. `orders` ← `users` 연결 (주문자 정보)
2. `orders` ← `order_items` 연결 (주문 상품들)
3. `order_items` ← `products` 연결 (상품 정보)

### 7-5. Node.js 코드에서 JOIN 사용

```js
// controllers/orderController.js
const pool = require('../config/db');

exports.getOrderDetail = async (req, res, next) => {
  try {
    const orderId = req.params.id;

    // 주문 기본 정보 + 주문자 정보
    const [orders] = await pool.query(`
      SELECT
        o.*,
        u.username,
        u.email,
        u.phone
      FROM orders o
      INNER JOIN users u ON o.user_id = u.id
      WHERE o.id = ?
    `, [orderId]);

    if (orders.length === 0) {
      return res.status(404).send('주문을 찾을 수 없습니다.');
    }

    const order = orders[0];

    // 주문 상품 목록
    const [items] = await pool.query(`
      SELECT
        oi.*,
        p.name AS product_name,
        p.thumbnail_url
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `, [orderId]);

    res.render('user/orders/detail', {
      order,
      items,
    });
  } catch (err) {
    next(err);
  }
};
```

---

## 8. 집계와 그룹핑 – GROUP BY, COUNT, SUM, AVG

통계나 분석이 필요할 때는 **집계 함수**를 사용합니다.

### 8-1. 기본 집계 함수

```sql
-- 전체 상품 개수
SELECT COUNT(*) AS total_products
FROM products
WHERE is_deleted = 0;

-- 전체 주문 금액 합계
SELECT SUM(total_amount) AS total_sales
FROM orders
WHERE status = 'completed';

-- 평균 주문 금액
SELECT AVG(total_amount) AS avg_order_amount
FROM orders
WHERE status = 'completed';

-- 최고가 상품
SELECT MAX(price) AS max_price FROM products;

-- 최저가 상품
SELECT MIN(price) AS min_price FROM products;
```

### 8-2. GROUP BY – 그룹별 집계

```sql
-- 카테고리별 상품 개수
SELECT
  category_id,
  COUNT(*) AS product_count
FROM products
WHERE is_deleted = 0
GROUP BY category_id
ORDER BY product_count DESC;
```

**결과 예시**:
| category_id | product_count |
|-------------|---------------|
| 1           | 45            |
| 3           | 32            |
| 2           | 28            |

```sql
-- 카테고리명과 함께 표시
SELECT
  c.name AS category_name,
  COUNT(p.id) AS product_count
FROM categories c
LEFT JOIN products p ON c.id = p.category_id AND p.is_deleted = 0
GROUP BY c.id, c.name
ORDER BY product_count DESC;
```

### 8-3. HAVING – 그룹 필터링

**WHERE vs HAVING**:
- `WHERE`: 개별 행 필터링 (GROUP BY 전)
- `HAVING`: 그룹 결과 필터링 (GROUP BY 후)

```sql
-- 상품이 10개 이상인 카테고리만 조회
SELECT
  c.name AS category_name,
  COUNT(p.id) AS product_count
FROM categories c
LEFT JOIN products p ON c.id = p.category_id AND p.is_deleted = 0
GROUP BY c.id, c.name
HAVING product_count >= 10
ORDER BY product_count DESC;
```

```sql
-- 총 구매 금액이 100만원 이상인 회원 목록
SELECT
  u.id,
  u.username,
  u.email,
  SUM(o.total_amount) AS total_spent,
  COUNT(o.id) AS order_count
FROM users u
INNER JOIN orders o ON u.id = o.user_id
WHERE o.status = 'completed'
GROUP BY u.id, u.username, u.email
HAVING total_spent >= 1000000
ORDER BY total_spent DESC;
```

### 8-4. 실전 예제: 월별 매출 통계

```sql
-- 2026년 월별 매출
SELECT
  DATE_FORMAT(created_at, '%Y-%m') AS month,
  COUNT(*) AS order_count,
  SUM(total_amount) AS total_sales,
  AVG(total_amount) AS avg_order_amount
FROM orders
WHERE status = 'completed'
  AND YEAR(created_at) = 2026
GROUP BY month
ORDER BY month;
```

**결과 예시**:
| month   | order_count | total_sales | avg_order_amount |
|---------|-------------|-------------|------------------|
| 2026-01 | 156         | 12,450,000  | 79,807.69        |
| 2026-02 | 203         | 18,230,000  | 89,803.94        |

### 8-5. Node.js에서 집계 쿼리 사용

```js
// controllers/admin/dashboardController.js
exports.getDashboard = async (req, res, next) => {
  try {
    // 오늘 통계
    const [todayStats] = await pool.query(`
      SELECT
        COUNT(*) AS order_count,
        COALESCE(SUM(total_amount), 0) AS total_sales
      FROM orders
      WHERE DATE(created_at) = CURDATE()
        AND status = 'completed'
    `);

    // 카테고리별 상품 수
    const [categoryStats] = await pool.query(`
      SELECT
        c.name AS category_name,
        COUNT(p.id) AS product_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.is_deleted = 0
      GROUP BY c.id, c.name
      ORDER BY product_count DESC
      LIMIT 10
    `);

    res.render('admin/dashboard', {
      todayStats: todayStats[0],
      categoryStats,
    });
  } catch (err) {
    next(err);
  }
};
```

---

## 9. 흔한 SQL 실수 TOP 10 – 그리고 해결 방법

### 실수 1: WHERE 없이 UPDATE/DELETE

```sql
-- ❌ 위험: 모든 행이 수정됨!
UPDATE products SET price = 0;

-- ❌ 위험: 모든 행이 삭제됨!
DELETE FROM products;

-- ✅ 안전: WHERE 조건 필수
UPDATE products SET price = 0 WHERE id = 123;
DELETE FROM products WHERE id = 123;
```

**보호 방법**:
```sql
-- MySQL에서 safe-updates 모드 활성화
SET SQL_SAFE_UPDATES = 1;
-- 이제 WHERE 없는 UPDATE/DELETE는 에러 발생
```

### 실수 2: SELECT * 남발

```sql
-- ❌ 비효율: 불필요한 컬럼까지 모두 조회
SELECT * FROM products;

-- ✅ 효율적: 필요한 컬럼만 명시
SELECT id, name, price, thumbnail_url FROM products;
```

**이유**:
- 네트워크 대역폭 낭비
- 메모리 사용량 증가
- 나중에 컬럼 추가 시 예상치 못한 부작용

### 실수 3: N+1 쿼리 문제

```js
// ❌ 비효율: 상품마다 카테고리 조회 (N+1 문제)
const [products] = await pool.query('SELECT * FROM products');

for (const product of products) {
  const [categories] = await pool.query(
    'SELECT name FROM categories WHERE id = ?',
    [product.category_id]
  );
  product.category_name = categories[0]?.name;
}

// ✅ 효율적: JOIN으로 한 번에 조회
const [products] = await pool.query(`
  SELECT
    p.*,
    c.name AS category_name
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
`);
```

### 실수 4: 인덱스 없이 자주 조회하는 컬럼

```sql
-- 이메일로 회원 검색이 자주 일어남
SELECT * FROM users WHERE email = 'hong@example.com';
-- → 인덱스 없으면 전체 테이블 스캔 (느림!)

-- ✅ 해결: 인덱스 추가
CREATE INDEX idx_users_email ON users(email);
-- 이제 검색이 빠름!
```

**인덱스가 필요한 컬럼**:
- WHERE 절에 자주 사용하는 컬럼
- JOIN 조건에 사용하는 외래키
- ORDER BY에 사용하는 컬럼

### 실수 5: NULL 비교를 = 로 하기

```sql
-- ❌ 잘못됨: NULL은 = 로 비교 안 됨!
SELECT * FROM products WHERE deleted_at = NULL;
-- 결과: 0건 (항상!)

-- ✅ 올바름: IS NULL / IS NOT NULL 사용
SELECT * FROM products WHERE deleted_at IS NULL;
SELECT * FROM products WHERE deleted_at IS NOT NULL;
```

### 실수 6: 문자열 연결로 SQL 작성 (SQL 인젝션)

```js
// ❌ 위험: SQL 인젝션 취약점!
const email = req.body.email; // 사용자 입력: "'; DROP TABLE users; --"
const query = `SELECT * FROM users WHERE email = '${email}'`;
await pool.query(query);
// → 실제 실행: SELECT * FROM users WHERE email = ''; DROP TABLE users; --'

// ✅ 안전: 파라미터 바인딩 (? 플레이스홀더)
const email = req.body.email;
const query = 'SELECT * FROM users WHERE email = ?';
await pool.query(query, [email]);
// → MySQL이 자동으로 이스케이프 처리
```

### 실수 7: LIMIT 없이 대량 데이터 조회

```js
// ❌ 위험: 수백만 건 조회 → 메모리 부족
const [products] = await pool.query('SELECT * FROM products');

// ✅ 페이지네이션 적용
const page = parseInt(req.query.page) || 1;
const limit = 20;
const offset = (page - 1) * limit;

const [products] = await pool.query(
  'SELECT * FROM products LIMIT ? OFFSET ?',
  [limit, offset]
);

// 전체 개수도 함께 조회 (페이지 수 계산용)
const [countResult] = await pool.query(
  'SELECT COUNT(*) AS total FROM products'
);
const total = countResult[0].total;
const totalPages = Math.ceil(total / limit);
```

### 실수 8: DATETIME/TIMESTAMP 타임존 무시

```sql
-- ❌ 문제: 서버 타임존이 다를 수 있음
INSERT INTO orders (created_at) VALUES (NOW());

-- ✅ 해결 1: UTC로 통일
INSERT INTO orders (created_at) VALUES (UTC_TIMESTAMP());

-- ✅ 해결 2: DB 연결 시 타임존 설정
-- config/db.js에서
const pool = mysql.createPool({
  // ...
  timezone: '+09:00', // 한국 시간 (KST)
});
```

### 실수 9: FLOAT 타입으로 금액 저장

```sql
-- ❌ 문제: 부동소수점 오차 발생
price FLOAT NOT NULL
-- 예: 99.99가 100.00000001로 저장될 수 있음

-- ✅ 해결: DECIMAL 사용
price DECIMAL(10, 2) NOT NULL
-- 정확한 소수점 계산
```

### 실수 10: 트랜잭션 없이 관련 데이터 수정

```js
// ❌ 위험: 중간에 실패하면 데이터 불일치
await pool.query('INSERT INTO orders (...) VALUES (...)', [...]);
await pool.query('INSERT INTO order_items (...) VALUES (...)', [...]); // 여기서 에러 → orders만 생성됨!

// ✅ 안전: 트랜잭션 사용
const connection = await pool.getConnection();
try {
  await connection.beginTransaction();

  const [orderResult] = await connection.query(
    'INSERT INTO orders (...) VALUES (...)',
    [...]
  );
  const orderId = orderResult.insertId;

  await connection.query(
    'INSERT INTO order_items (...) VALUES (...)',
    [orderId, ...]
  );

  await connection.commit();
} catch (err) {
  await connection.rollback();
  throw err;
} finally {
  connection.release();
}
```

---

## 10. 데이터베이스 설계 베스트 프랙티스

### 10-1. 테이블/컬럼 이름 규칙

```sql
-- ✅ 좋은 이름
users, products, orders, order_items
user_id, product_id, created_at, is_deleted

-- ❌ 나쁜 이름
tbl_user, Users, PRODUCTS (일관성 없음)
uid, pid (약어 남발)
date1, date2 (의미 불명확)
```

**규칙**:
- 테이블명: 복수형, 소문자, 언더스코어 (`order_items`)
- 컬럼명: 소문자, 언더스코어, 의미 명확히 (`created_at`, `is_active`)
- 외래키: `테이블명_id` 형식 (`user_id`, `product_id`)
- 불리언: `is_`, `has_`, `can_` 접두사 (`is_deleted`, `has_coupon`)

### 10-2. 정규화 vs 비정규화

**정규화 (Normalization)**: 중복 제거, 일관성 유지

```sql
-- 정규화된 구조
CREATE TABLE orders (
  id INT PRIMARY KEY,
  user_id INT NOT NULL,
  total_amount DECIMAL(10,2),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE order_items (
  id INT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
```

**비정규화 (Denormalization)**: 성능을 위해 의도적으로 중복 허용

```sql
-- order_items에 상품명도 함께 저장 (상품 삭제 대비)
CREATE TABLE order_items (
  id INT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  product_name VARCHAR(255) NOT NULL, -- 비정규화!
  quantity INT NOT NULL,
  price DECIMAL(10,2) NOT NULL
);
```

**언제 비정규화할까?**:
- 조회 성능이 매우 중요한 경우
- 히스토리 보존이 필요한 경우 (주문 시점의 상품명/가격)
- JOIN 비용이 너무 클 때

### 10-3. 소프트 삭제 패턴

```sql
-- ❌ 하드 삭제: 데이터 완전 삭제
DELETE FROM products WHERE id = 123;
-- 문제: 과거 주문 내역에서 상품 정보 사라짐

-- ✅ 소프트 삭제: 플래그만 변경
UPDATE products SET is_deleted = 1, deleted_at = NOW() WHERE id = 123;
-- 조회 시: WHERE is_deleted = 0 조건 추가
```

**소프트 삭제 컬럼**:
```sql
is_deleted TINYINT(1) NOT NULL DEFAULT 0,
deleted_at TIMESTAMP NULL DEFAULT NULL
```

### 10-4. 타임스탬프 컬럼 표준

```sql
-- 모든 테이블에 공통으로 포함
created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',
updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시'
```

---

## 11. SQL 쿼리 디버깅 가이드

### 11-1. EXPLAIN으로 쿼리 분석

```sql
-- 쿼리 앞에 EXPLAIN 붙이기
EXPLAIN SELECT * FROM products WHERE category_id = 7;
```

**결과 읽는 법**:
| 항목 | 의미 | 좋은 값 |
|------|------|---------|
| `type` | 조인 타입 | `const`, `eq_ref`, `ref` (좋음) / `ALL` (나쁨, 전체 스캔) |
| `possible_keys` | 사용 가능한 인덱스 | 적절한 인덱스 표시됨 |
| `key` | 실제 사용한 인덱스 | NULL이 아님 |
| `rows` | 검사할 예상 행 수 | 적을수록 좋음 |

**개선 예시**:
```sql
-- type=ALL (전체 스캔, 느림)
EXPLAIN SELECT * FROM products WHERE category_id = 7;

-- 인덱스 추가 후
CREATE INDEX idx_products_category ON products(category_id);

-- type=ref (인덱스 사용, 빠름)
EXPLAIN SELECT * FROM products WHERE category_id = 7;
```

### 11-2. 쿼리 실행 시간 측정

```sql
-- MySQL에서
SET profiling = 1;

SELECT * FROM products WHERE category_id = 7;

SHOW PROFILES;
-- Query_ID  Duration  Query
--    1      0.00234   SELECT * FROM ...
```

### 11-3. 슬로우 쿼리 로그 확인

```sql
-- 슬로우 쿼리 로그 활성화 (my.cnf 또는 런타임)
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1; -- 1초 이상 걸리는 쿼리 기록

-- 로그 파일 위치 확인
SHOW VARIABLES LIKE 'slow_query_log_file';
```

---

## 12. 실전 실습 – 상품 리뷰 시스템 DB 설계

이제 배운 지식을 활용해서, **상품 리뷰 기능**의 데이터베이스를 처음부터 설계해 봅시다.

### 12-1. 요구사항 정리 (3분)

- 회원은 구매한 상품에 리뷰를 작성할 수 있다
- 리뷰에는 별점(1-5), 내용, 사진(선택)이 포함된다
- 한 회원은 같은 상품에 리뷰를 한 번만 작성할 수 있다
- 리뷰는 수정/삭제 가능하다 (소프트 삭제)
- 상품 상세 페이지에 평균 별점과 리뷰 목록이 표시된다

### 12-2. 테이블 설계 (10분)

```sql
CREATE TABLE product_reviews (
  -- 기본 컬럼
  id INT NOT NULL AUTO_INCREMENT COMMENT '리뷰 ID (PK)',
  product_id INT NOT NULL COMMENT '상품 ID (FK → products.id)',
  user_id INT NOT NULL COMMENT '작성자 ID (FK → users.id)',

  -- 리뷰 내용
  rating TINYINT NOT NULL COMMENT '별점 (1-5)',
  content TEXT NOT NULL COMMENT '리뷰 내용',
  image_url VARCHAR(255) DEFAULT NULL COMMENT '리뷰 이미지 URL (선택)',

  -- 메타 정보
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '작성일시',
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시',
  is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '삭제 여부',
  deleted_at TIMESTAMP NULL DEFAULT NULL COMMENT '삭제일시',

  -- 제약 조건
  PRIMARY KEY (id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

  -- 중복 방지: 한 회원당 상품 한 개당 리뷰 1개
  UNIQUE KEY uk_product_user (product_id, user_id),

  -- 인덱스 (자주 조회하는 컬럼)
  INDEX idx_product_id (product_id),
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at),

  -- 별점 유효성 검사
  CHECK (rating >= 1 AND rating <= 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='상품 리뷰';
```

### 12-3. 설계 포인트 설명

| 요소 | 설명 |
|------|------|
| **UNIQUE KEY** | `(product_id, user_id)` 조합이 고유 → 중복 리뷰 방지 |
| **CHECK** | `rating >= 1 AND rating <= 5` → 별점 범위 강제 |
| **INDEX** | `product_id`, `user_id`, `created_at` → 조회 성능 향상 |
| **ON DELETE CASCADE** | 상품/회원 삭제 시 리뷰도 자동 삭제 |
| **소프트 삭제** | `is_deleted`, `deleted_at` → 삭제 이력 보존 |

### 12-4. 실전 쿼리 예제

```sql
-- 1) 상품 ID 123의 리뷰 목록 (최신순, 삭제 제외)
SELECT
  r.id,
  r.rating,
  r.content,
  r.image_url,
  r.created_at,
  u.username,
  u.profile_image
FROM product_reviews r
INNER JOIN users u ON r.user_id = u.id
WHERE r.product_id = 123
  AND r.is_deleted = 0
ORDER BY r.created_at DESC
LIMIT 10;

-- 2) 상품 ID 123의 평균 별점 및 리뷰 수
SELECT
  COUNT(*) AS review_count,
  AVG(rating) AS avg_rating,
  COUNT(CASE WHEN rating = 5 THEN 1 END) AS rating_5_count,
  COUNT(CASE WHEN rating = 4 THEN 1 END) AS rating_4_count,
  COUNT(CASE WHEN rating = 3 THEN 1 END) AS rating_3_count,
  COUNT(CASE WHEN rating = 2 THEN 1 END) AS rating_2_count,
  COUNT(CASE WHEN rating = 1 THEN 1 END) AS rating_1_count
FROM product_reviews
WHERE product_id = 123
  AND is_deleted = 0;

-- 3) 회원 ID 45가 상품 ID 123에 이미 리뷰를 작성했는지 확인
SELECT COUNT(*) AS has_review
FROM product_reviews
WHERE product_id = 123
  AND user_id = 45
  AND is_deleted = 0;

-- 4) 리뷰 작성
INSERT INTO product_reviews (product_id, user_id, rating, content, image_url)
VALUES (123, 45, 5, '아주 좋은 제품입니다!', '/uploads/reviews/img123.jpg');

-- 5) 리뷰 수정
UPDATE product_reviews
SET content = '수정된 리뷰 내용', rating = 4
WHERE id = 567 AND user_id = 45; -- 본인 리뷰만 수정 가능

-- 6) 리뷰 소프트 삭제
UPDATE product_reviews
SET is_deleted = 1, deleted_at = NOW()
WHERE id = 567 AND user_id = 45;
```

### 12-5. Node.js 컨트롤러 예제

```js
// controllers/reviewController.js
const pool = require('../config/db');

// 특정 상품의 리뷰 목록 + 통계
exports.getProductReviews = async (req, res, next) => {
  try {
    const productId = req.params.productId;

    // 리뷰 목록
    const [reviews] = await pool.query(`
      SELECT
        r.id,
        r.rating,
        r.content,
        r.image_url,
        r.created_at,
        u.username,
        u.profile_image
      FROM product_reviews r
      INNER JOIN users u ON r.user_id = u.id
      WHERE r.product_id = ?
        AND r.is_deleted = 0
      ORDER BY r.created_at DESC
      LIMIT 20
    `, [productId]);

    // 통계
    const [stats] = await pool.query(`
      SELECT
        COUNT(*) AS review_count,
        ROUND(AVG(rating), 1) AS avg_rating
      FROM product_reviews
      WHERE product_id = ?
        AND is_deleted = 0
    `, [productId]);

    res.json({
      reviews,
      stats: stats[0],
    });
  } catch (err) {
    next(err);
  }
};

// 리뷰 작성
exports.createReview = async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { productId } = req.params;
    const userId = req.user.id;
    const { rating, content, imageUrl } = req.body;

    // 입력 검증
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: '별점은 1-5 사이여야 합니다.' });
    }

    // 중복 체크
    const [existing] = await connection.query(
      'SELECT id FROM product_reviews WHERE product_id = ? AND user_id = ? AND is_deleted = 0',
      [productId, userId]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: '이미 리뷰를 작성하셨습니다.' });
    }

    // 리뷰 등록
    const [result] = await connection.query(
      'INSERT INTO product_reviews (product_id, user_id, rating, content, image_url) VALUES (?, ?, ?, ?, ?)',
      [productId, userId, rating, content, imageUrl]
    );

    res.json({
      success: true,
      reviewId: result.insertId,
    });
  } catch (err) {
    next(err);
  } finally {
    connection.release();
  }
};
```

---

## 13. 보안 베스트 프랙티스

### 13-1. SQL 인젝션 방지 – 절대 규칙

```js
// ❌ 절대 금지: 문자열 연결
const userId = req.params.id;
const query = `SELECT * FROM users WHERE id = ${userId}`;
await pool.query(query);

// ✅ 항상 사용: 파라미터 바인딩
const userId = req.params.id;
const query = 'SELECT * FROM users WHERE id = ?';
await pool.query(query, [userId]);
```

**공격 시나리오**:
```js
// 공격자가 userId = "1 OR 1=1" 입력
const query = `SELECT * FROM users WHERE id = ${userId}`;
// 실제 실행: SELECT * FROM users WHERE id = 1 OR 1=1
// → 모든 회원 정보 유출!

// 파라미터 바인딩 사용 시
const query = 'SELECT * FROM users WHERE id = ?';
await pool.query(query, ['1 OR 1=1']);
// → MySQL이 '1 OR 1=1'을 문자열로 인식, 안전
```

### 13-2. 최소 권한 원칙

```sql
-- ❌ 나쁨: root 계정 사용
DB_USER=root
DB_PASSWORD=rootpassword

-- ✅ 좋음: 애플리케이션 전용 계정 생성
CREATE USER 'shopapp'@'localhost' IDENTIFIED BY 'strong_password';

-- 필요한 권한만 부여
GRANT SELECT, INSERT, UPDATE, DELETE ON shop_db.* TO 'shopapp'@'localhost';
-- CREATE, DROP, ALTER 권한은 제외 (마이그레이션 시에만 필요)

FLUSH PRIVILEGES;
```

### 13-3. 비밀번호 저장

```js
// ❌ 절대 금지: 평문 저장
INSERT INTO users (email, password) VALUES ('hong@example.com', 'mypassword123');

// ✅ 필수: bcrypt 해싱
const bcrypt = require('bcrypt');

// 회원가입 시
const hashedPassword = await bcrypt.hash(req.body.password, 10);
await pool.query(
  'INSERT INTO users (email, password) VALUES (?, ?)',
  [email, hashedPassword]
);

// 로그인 시
const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
if (users.length === 0) return res.status(401).send('인증 실패');

const user = users[0];
const isValid = await bcrypt.compare(req.body.password, user.password);
if (!isValid) return res.status(401).send('인증 실패');
```

---

## 14. 자주 묻는 질문 (FAQ)

### Q1. INNER JOIN과 LEFT JOIN 중 어떤 걸 써야 하나요?

**A**: 왼쪽 테이블의 모든 행을 보존해야 하면 `LEFT JOIN`, 양쪽 모두 있는 것만 필요하면 `INNER JOIN`

```sql
-- INNER JOIN: 주문에 실제 있는 상품만 (상품 삭제 시 제외)
SELECT o.*, p.name
FROM orders o
INNER JOIN products p ON o.product_id = p.id;

-- LEFT JOIN: 주문은 모두 표시 (상품 삭제되어도 NULL로 표시)
SELECT o.*, p.name
FROM orders o
LEFT JOIN products p ON o.product_id = p.id;
```

### Q2. VARCHAR 길이는 어떻게 정해야 하나요?

**A**: 실제 데이터 특성에 맞춰 결정

| 용도 | 권장 길이 | 예시 |
|------|----------|------|
| 이메일 | VARCHAR(255) | `hong@example.com` |
| 이름 | VARCHAR(50) | `홍길동` |
| 전화번호 | VARCHAR(20) | `010-1234-5678` |
| 제목 | VARCHAR(100-200) | `신상품 입고 안내` |
| URL | VARCHAR(500) | `https://example.com/...` |
| 본문 | TEXT | 길이 제한 없는 긴 텍스트 |

### Q3. AUTO_INCREMENT는 언제 사용하나요?

**A**: **대부분의 테이블에서 기본키(PK)로 사용**

```sql
-- ✅ 일반적인 경우: AUTO_INCREMENT 사용
id INT NOT NULL AUTO_INCREMENT PRIMARY KEY

-- ❌ 사용하지 않는 경우:
-- 1) 복합 키 (여러 컬럼 조합이 PK)
PRIMARY KEY (user_id, product_id) -- 찜하기 테이블 등

-- 2) UUID/ULID 사용
id VARCHAR(36) NOT NULL PRIMARY KEY -- UUID
```

### Q4. TIMESTAMP vs DATETIME 무엇을 쓸까요?

**A**: **보통 TIMESTAMP 권장** (자동 업데이트 기능)

```sql
-- TIMESTAMP: 자동 시간 기록 가능
created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP

-- DATETIME: 수동 관리 필요, 범위 더 넓음 (1000-9999년)
created_at DATETIME NOT NULL
```

### Q5. 외래키 제약(FOREIGN KEY)은 꼭 필요한가요?

**A**: **권장하지만 선택사항**

**장점**:
- 데이터 일관성 자동 보장
- 존재하지 않는 ID 참조 방지
- CASCADE 옵션으로 자동 삭제/업데이트

**단점**:
- INSERT/UPDATE 성능 약간 저하
- 복잡한 마이그레이션 시 제약

**실무 선택**:
```sql
-- 방법 1: FK 제약 사용 (강력한 일관성)
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE

-- 방법 2: FK 제약 없이 INDEX만 (유연성)
INDEX idx_user_id (user_id)
-- 애플리케이션 레벨에서 일관성 관리
```

### Q6. 트랜잭션은 언제 사용하나요?

**A**: **여러 테이블을 동시에 수정하는 작업**

```js
// ✅ 트랜잭션 필요: 주문 생성 (orders + order_items)
const connection = await pool.getConnection();
try {
  await connection.beginTransaction();

  const [order] = await connection.query('INSERT INTO orders ...');
  await connection.query('INSERT INTO order_items ...', [order.insertId, ...]);

  await connection.commit();
} catch (err) {
  await connection.rollback();
  throw err;
} finally {
  connection.release();
}

// ❌ 트랜잭션 불필요: 단일 테이블 조회/수정
await pool.query('SELECT * FROM products');
await pool.query('UPDATE products SET view_count = view_count + 1 WHERE id = ?', [id]);
```

### Q7. 쿼리가 느린데 어떻게 최적화하나요?

**A**: 3단계 접근
1. **EXPLAIN으로 분석** → 인덱스 사용 확인
2. **인덱스 추가** → WHERE/JOIN/ORDER BY 컬럼
3. **쿼리 재작성** → 불필요한 JOIN 제거, LIMIT 추가

```sql
-- 1) EXPLAIN으로 분석
EXPLAIN SELECT * FROM products WHERE category_id = 7 ORDER BY price;
-- → type=ALL (전체 스캔), key=NULL (인덱스 없음)

-- 2) 인덱스 추가
CREATE INDEX idx_category_price ON products(category_id, price);

-- 3) 다시 EXPLAIN
EXPLAIN SELECT * FROM products WHERE category_id = 7 ORDER BY price;
-- → type=ref (인덱스 사용), key=idx_category_price
```

---

## 15. 다음 단계 – MySQL 마스터로 가는 길

### 15-1. 추천 학습 순서

1. ✅ **챕터1 (mysql.md)** - MySQL 기초와 DBMS 용어, SQL 실습
2. ✅ **이 문서 (mysql2.md)** - Node.js 프로젝트 연동과 실전
3. → [mvc.md](./mvc.md) - 컨트롤러에서 DB 사용법
4. → [example_notice.md](./example_notice.md) - 실전 DB 활용 예제
5. → **공식 문서**: [MySQL 8.0 Reference Manual](https://dev.mysql.com/doc/refman/8.0/en/)

### 15-2. 실전 연습 과제

**초급**:
- [ ] 기존 테이블에 컬럼 추가하기 (ALTER TABLE)
- [ ] 간단한 SELECT 쿼리 10개 작성해 보기
- [ ] 소프트 삭제 패턴 적용해 보기

**중급**:
- [ ] 상품 리뷰 시스템 구현 (Section 12 실습)
- [ ] 2개 이상 테이블 JOIN 쿼리 작성
- [ ] 집계 쿼리로 통계 데이터 만들기 (GROUP BY, COUNT, SUM)

**고급**:
- [ ] 복잡한 트랜잭션 처리 (주문/결제 시스템)
- [ ] 쿼리 성능 최적화 (EXPLAIN, 인덱스 전략)
- [ ] DB 마이그레이션 스크립트 작성

---

## 16. 마무리 – 데이터베이스는 "신뢰할 수 있는 창고"

이제 MySQL과 DBMS를 이렇게 이해할 수 있습니다:

- **데이터베이스**: 회원, 상품, 주문 같은 중요한 정보를 **안전하게 보관하는 창고**
- **테이블**: 정보를 **표 형식으로 정리**한 시트
- **SQL**: 그 창고에 **"이 상품 정보 줘", "이 주문 저장해줘"라고 말하는 언어**
- **JOIN**: 여러 테이블을 **연결해서 필요한 정보를 조합**
- **인덱스**: **빠르게 찾을 수 있게 하는 색인**
- **트랜잭션**: 여러 작업을 **모두 성공 또는 모두 실패**로 묶어주는 안전장치

여러분은 이제:
- ✅ 기본 SQL(SELECT, INSERT, UPDATE, DELETE)을 읽고 쓸 수 있습니다
- ✅ 테이블을 설계하고 컬럼 타입을 선택할 수 있습니다
- ✅ JOIN으로 여러 테이블 데이터를 연결할 수 있습니다
- ✅ GROUP BY로 통계를 낼 수 있습니다
- ✅ SQL 인젝션 같은 보안 위협을 막을 수 있습니다
- ✅ 쿼리 성능을 분석하고 개선할 수 있습니다

**다음 단계**: [mvc.md](./mvc.md)로 이동해서 Node.js 컨트롤러에서 DB를 어떻게 활용하는지 배워 보세요!
