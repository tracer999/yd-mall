# MySQL과 DBMS – 처음부터 이해하는 데이터베이스 기초

이 문서는 **DBMS를 처음 접하는 사람**도

- 데이터베이스(DB)와 DBMS가 무엇인지
- 테이블, 컬럼, 행, 기본키(PK), 외래키(FK) 같은 **용어**가 무엇을 의미하는지
- 기본적인 **SQL 문법(SELECT, INSERT, UPDATE, DELETE)**

를 이해할 수 있도록 만든 **입문용 가이드**입니다.

Node.js 코드와 연동하는 방법은 [챕터2 – MySQL 실전 (Node.js 연동)](./mysql2.md)에서 다룹니다.

---

## 1. 데이터베이스와 DBMS란?

### 1-1. 엑셀과 데이터베이스의 차이

많은 분들이 **엑셀**을 써 본 경험이 있습니다. 엑셀 파일을 떠올려 보면:

- 여러 개의 시트(sheet)가 있고
- 각 시트 안에는 행(row)과 열(column)로 이루어진 표가 있으며
- 셀(cell)에 글자나 숫자, 날짜를 넣습니다.

**데이터베이스(Database)** 도 크게 보면 비슷합니다.

- 여러 개의 **테이블(table)** 이 있고
- 각 테이블 안에는 **행(row, 레코드)** 과 **열(column, 필드)** 이 있습니다.

차이점은:

- 엑셀은 주로 **사람이 직접 열어 보고, 손으로 수정**하는 도구
- 데이터베이스는 **프로그램(쇼핑몰 서버, 앱, 웹사이트)이 자동으로 읽고 쓰는 저장소**

이라고 생각하면 이해가 쉽습니다.

### 1-2. DBMS란 무엇인가

**DBMS (Database Management System)** 는

> "데이터베이스를 **만들고, 저장하고, 조회하고, 수정하고, 삭제**할 수 있게 해 주는 소프트웨어"

입니다.

우리가 잘 아는 DBMS에는

- MySQL, MariaDB
- PostgreSQL
- Oracle, MS SQL Server

같은 것들이 있습니다.

### 1-3. 관계형 데이터베이스(RDBMS)

이 쇼핑몰에서 사용하는 MySQL은 **관계형 데이터베이스(RDBMS)** 입니다.

- 데이터를 **테이블** 이라는 표 형식으로 저장하고
- 테이블과 테이블 사이를 **관계(relationship)** 로 연결합니다.

예를 들어:

- 회원을 저장하는 `users` 테이블이 있고
- 주문을 저장하는 `orders` 테이블이 있을 때
- `orders.user_id` 컬럼이 `users.id` 를 가리키도록 만드는 것 → 이것이 **관계**입니다.

이렇게 하면,

- "이 회원이 한 주문 목록"
- "이 상품을 포함하는 주문 목록"

같은 것을 쉽게 조회할 수 있습니다.

---

## 2. 테이블, 컬럼, 행, PK, FK – 용어 정리

### 2-1. 테이블(Table)

**테이블**은 엑셀의 시트와 비슷합니다.

- 회원 정보를 모아 두는 **users** 테이블
- 상품 정보를 모아 두는 **products** 테이블
- 주문 정보를 모아 두는 **orders** 테이블
- 공지사항을 모아 두는 **notices** 테이블

등을 각각 별도의 테이블로 둡니다.

### 2-2. 컬럼(Column, 필드)

**컬럼**은 테이블의 세로줄, 즉 **어떤 종류의 정보를 저장하는 칸**입니다.

예를 들어 공지사항 테이블 `notices`를 보면(예시):

| 컬럼 이름 | 의미 |
|-----------|------|
| `id` | 각 공지를 구분하는 번호 (기본키, 자동 증가) |
| `title` | 공지 제목 |
| `content` | 공지 내용 |
| `importance` | 중요도 (0: 일반, 1: 중요) |
| `view_count` | 조회수 |
| `created_at` | 작성 시각 |

각 컬럼은 **자료형(숫자, 글자, 날짜 등)** 과 **제약조건(비워도 되는지, 기본값은 무엇인지)** 을 가집니다.

### 2-3. 행(Row, 레코드)

**행(row)** 은 테이블의 가로줄, 즉 **한 건의 데이터** 입니다.

예를 들어 `notices` 테이블에서 한 행은 "공지사항 한 건" 입니다.

| id | title | content | importance | view_count | created_at |
|----|-------|---------|-----------|------------|-----------|
| 1 | 서버 점검 안내 | 3월 1일 새벽 2시 서버 점검… | 1 | 120 | 2026-02-01 10:00:00 |

여기서 이 한 줄 전체가 한 **레코드(record)** 입니다.

### 2-4. 기본키 (Primary Key, PK)

**기본키(PK)** 는 **각 행을 유일하게 구분할 수 있는 컬럼** 혹은 컬럼들의 조합입니다.

- `users.id`
- `products.id`
- `orders.id`
- `notices.id`

같은 컬럼이 기본키가 됩니다.

보통 **자동 증가(AUTO_INCREMENT)** 숫자 컬럼을 PK로 두고,

```sql
id INT NOT NULL AUTO_INCREMENT PRIMARY KEY
```

처럼 정의합니다.

### 2-5. 외래키 (Foreign Key, FK)

**외래키(FK)** 는 다른 테이블의 기본키를 **참조하는 컬럼**입니다.

예를 들어 주문 테이블을 생각해 보면:

- `orders.user_id` : 주문한 회원의 id (users.id를 참조)
- `order_items.product_id` : 주문한 상품의 id (products.id를 참조)

이렇게 "다른 테이블의 PK를 가리키는 컬럼"이 외래키입니다.

실제 MySQL에서는 대략 이런 식으로 정의합니다(예시).

```sql
CREATE TABLE orders (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  -- ... 기타 컬럼들
  CONSTRAINT fk_orders_users
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

외래키를 잘 설계하면 **데이터 일관성**을 지키기 쉽습니다.

### 2-6. 인덱스(Index)

**인덱스**는 책의 색인과 비슷합니다. 많이 조회하는 컬럼에 인덱스를 만들어 두면 **검색 속도**를 크게 높일 수 있습니다.

예시:

- `users.email` 에 인덱스를 만들어두면, 이메일로 회원을 검색할 때 빠르게 찾을 수 있습니다.
- `products.category_id` 에 인덱스를 두면, 카테고리별 상품 목록을 자주 조회할 때 유리합니다.

간단히는:

```sql
CREATE INDEX idx_users_email ON users(email);
```

처럼 만들 수 있습니다.

### 2-7. NULL, DEFAULT, NOT NULL

- **NULL**: "값이 없다"는 뜻입니다. 0이나 빈 문자열과는 다릅니다.
- **DEFAULT**: 값을 주지 않았을 때 자동으로 들어갈 기본값입니다.
- **NOT NULL**: 이 컬럼은 절대로 비워 둘 수 없다는 제약입니다.

예시:

```sql
created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
```

→ created_at은 반드시 값이 있어야 하고, 새 행을 넣을 때 값을 따로 안 주면 **현재 시각**이 자동으로 들어갑니다.

---

### 2-8. MySQL 8에서 자주 쓰는 컬럼 데이터 타입

컬럼을 정의할 때는 **어떤 종류의 값**을 넣을지에 따라 데이터 타입을 선택해야 합니다. 쇼핑몰 프로젝트에서 자주 쓰는 타입만 정리하면 다음과 같습니다.

- **정수 숫자 타입**
  - `TINYINT(1)` : 아주 작은 정수. 보통 **불리언(0/1)** 처럼 사용할 때 많이 씁니다. 예) `is_deleted TINYINT(1) NOT NULL DEFAULT 0`
  - `INT` : 일반적인 정수. id, 수량, 조회수 등에 가장 많이 사용합니다. 예) `id INT NOT NULL AUTO_INCREMENT`
  - `BIGINT` : 매우 큰 정수가 필요할 때 사용합니다. 주문번호를 아주 크게 잡고 싶을 때 등.

- **실수/금액 타입**
  - `DECIMAL(10,2)` : **소수점을 정확히** 다뤄야 하는 금액에 사용합니다. 예) `price DECIMAL(10,2) NOT NULL`
    - 10: 전체 자릿수, 2: 소수 자릿수 (예: 최대 99999999.99 까지 표현)

- **문자열 타입**
  - `VARCHAR(n)` : 길이가 **최대 n 글자**인 문자열. 제목, 이메일, 이름, URL 등에 사용합니다. 예) `title VARCHAR(100) NOT NULL`
  - `TEXT` : 길이가 긴 본문(공지 내용, 상품 설명 등)에 사용합니다. 최대 길이는 많지만, 너무 많은 TEXT 컬럼은 성능에 영향을 줄 수 있습니다.

- **날짜/시간 타입**
  - `DATE` : `YYYY-MM-DD` 형식의 날짜만 저장 (예: 생년월일)
  - `DATETIME` : `YYYY-MM-DD HH:MM:SS` 형식의 날짜+시간
  - `TIMESTAMP` : DATETIME과 비슷하지만, `DEFAULT CURRENT_TIMESTAMP`, `ON UPDATE CURRENT_TIMESTAMP` 같은 **자동 시간 기록**에 자주 사용합니다.
    - 예) `created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP`
    - 예) `updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP`

- **불리언(Boolean)처럼 쓰는 타입**
  - MySQL에는 진짜 `BOOLEAN` 타입이 있지만, 내부적으로는 `TINYINT(1)` 으로 취급됩니다.
  - 이 프로젝트에서도 보통 `TINYINT(1)` 또는 `INT` 에 0/1 값을 넣어 **참/거짓**을 표현합니다. 예) `is_visible TINYINT(1) NOT NULL DEFAULT 1`

컬럼을 설계할 때는 다음 질문을 스스로에게 던져 보면 좋습니다.

1. 이 값은 **정수인지, 소수인지, 글자인지, 날짜인지?**
2. **최대 길이/범위**는 어느 정도면 충분한지? (예: 제목 100자면 충분한가?)
3. 값이 없을 수도 있는지? 없다면 `NULL` 을 허용할지, 기본값을 둘지?

이 정도만 정리해 두면, 기능을 추가할 때 AI에게도 이렇게 요청할 수 있습니다.

> "MySQL 8 기준으로 products 테이블에 할인율 컬럼을 추가하고 싶습니다. 0~100 사이 정수(%)로 저장할 거고, 기본값은 0입니다. 적절한 데이터 타입과 제약을 포함한 ALTER TABLE 쿼리를 작성해 주세요."

---

## 3. SQL 실습 – HeidiSQL로 직접 해보기

지금까지 DB 기초 용어와 데이터 타입을 배웠습니다.
이제 **실제 SQL을 직접 실행**해 보면서 감을 잡아 봅시다.

> 이 섹션에서는 Node.js 코드 없이 **순수 SQL만** 다룹니다.
> GUI 도구에서 SQL을 붙여넣고 실행 버튼만 누르면 결과를 확인할 수 있습니다.

### 3-1. HeidiSQL이란?

**HeidiSQL**은 MySQL 데이터베이스를 시각적으로 관리할 수 있는 **무료 GUI 도구**입니다.

- 공식 사이트: https://www.heidisql.com
- Windows용 설치 프로그램 제공 (Mac에서는 DBeaver 또는 MySQL Workbench를 대신 사용할 수 있습니다)
- 테이블 구조 확인, SQL 실행, 데이터 편집을 마우스 클릭으로 할 수 있습니다

**접속 방법** (간단 요약):
1. HeidiSQL 설치 후 실행
2. "새로 만들기" 클릭
3. 접속 정보 입력:
   - **호스트**: DB 서버 주소 (예: `localhost` 또는 개발 서버 IP)
   - **사용자**: DB 사용자 이름
   - **암호**: DB 비밀번호
   - **포트**: `3306` (MySQL 기본 포트)
   - **데이터베이스**: `dev_mall` (이 프로젝트 DB 이름)
4. "열기" 클릭 → 접속 완료

접속하면 왼쪽에 테이블 목록이 보이고, 상단의 **"쿼리"** 탭에서 SQL을 직접 입력하고 실행(▶ 버튼 또는 F9)할 수 있습니다.

### 3-2. 이 프로젝트의 주요 테이블 구조

실습에서 사용할 두 테이블의 구조를 먼저 살펴봅시다.

**`users` 테이블** – 회원 정보

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | INT (PK, 자동증가) | 회원 고유 번호 |
| `email` | VARCHAR(100) | 이메일 주소 (고유값) |
| `name` | VARCHAR(50) | 사용자 이름 |
| `phone` | VARCHAR(20) | 전화번호 |
| `points_balance` | INT | 보유 포인트 |
| `is_active` | TINYINT(1) | 계정 활성 여부 (1=활성) |
| `created_at` | TIMESTAMP | 가입일시 |
| `last_login` | TIMESTAMP | 마지막 로그인 |

**`orders` 테이블** – 주문 정보

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | INT (PK, 자동증가) | 주문 고유 번호 |
| `user_id` | INT (FK → users.id) | 주문한 회원 |
| `order_number` | VARCHAR(50) | 주문 번호 (예: ORD-20260211-001) |
| `status` | ENUM | 주문 상태 (PENDING, PAID, PREPARING, SHIPPED, DELIVERED, CANCELLED, REFUNDED) |
| `total_amount` | INT | 최종 결제 금액 |
| `receiver_name` | VARCHAR(50) | 수령인 이름 |
| `receiver_phone` | VARCHAR(50) | 수령인 연락처 |
| `payment_method` | VARCHAR(50) | 결제 수단 |
| `created_at` | TIMESTAMP | 주문일시 |

### 3-3. SELECT – 데이터 조회하기

아래 SQL을 HeidiSQL의 쿼리 창에 붙여넣고 실행(F9)해 보세요.

```sql
-- 회원 목록 전체 조회
SELECT id, email, name, phone, created_at
FROM users;
```

```sql
-- 활성 회원만 조회 (WHERE 조건)
SELECT id, email, name, phone
FROM users
WHERE is_active = 1;
```

```sql
-- 최근 가입순 정렬 (ORDER BY)
SELECT id, email, name, created_at
FROM users
WHERE is_active = 1
ORDER BY created_at DESC;
```

```sql
-- 최근 가입한 회원 5명만 (LIMIT)
SELECT id, email, name, created_at
FROM users
WHERE is_active = 1
ORDER BY created_at DESC
LIMIT 5;
```

```sql
-- 이름에 '김'이 포함된 회원 검색 (LIKE)
SELECT id, email, name
FROM users
WHERE name LIKE '%김%';
```

```sql
-- 주문 목록 조회 (결제 완료된 것만, 최신순)
SELECT id, order_number, status, total_amount, created_at
FROM orders
WHERE status = 'PAID'
ORDER BY created_at DESC
LIMIT 10;
```

**핵심 정리**:
- `SELECT 컬럼들 FROM 테이블` : 어떤 테이블에서 어떤 컬럼을 가져올지
- `WHERE 조건` : 어떤 행만 필터링할지
- `ORDER BY 컬럼 DESC/ASC` : 정렬 기준 (DESC = 내림차순, ASC = 오름차순)
- `LIMIT 숫자` : 최대 몇 건만 가져올지

### 3-4. INSERT – 새 데이터 추가하기

```sql
-- 새 주문 추가
INSERT INTO orders (user_id, order_number, status, total_amount, receiver_name, receiver_phone, payment_method)
VALUES (1, 'ORD-20260211-999', 'PENDING', 45000, '홍길동', '010-1234-5678', '카드');
```

실행 후 확인:
```sql
-- 방금 추가한 주문 확인
SELECT * FROM orders WHERE order_number = 'ORD-20260211-999';
```

**핵심 정리**:
- `INSERT INTO 테이블 (컬럼1, 컬럼2, ...) VALUES (값1, 값2, ...)` 형태
- `id`와 `created_at`은 자동 생성되므로 넣지 않아도 됩니다

### 3-5. UPDATE – 기존 데이터 수정하기

```sql
-- 주문 상태를 '결제 완료'로 변경
UPDATE orders
SET status = 'PAID'
WHERE order_number = 'ORD-20260211-999';
```

```sql
-- 수령인 정보 변경
UPDATE orders
SET receiver_name = '김철수',
    receiver_phone = '010-9876-5432'
WHERE order_number = 'ORD-20260211-999';
```

실행 후 확인:
```sql
SELECT id, order_number, status, receiver_name, receiver_phone
FROM orders
WHERE order_number = 'ORD-20260211-999';
```

**주의**: `WHERE` 조건을 빼먹으면 **테이블의 모든 행**이 수정됩니다! 항상 `WHERE`를 먼저 확인하세요.

### 3-6. DELETE와 소프트 삭제

**물리적 삭제** (실제로 행을 지움):
```sql
-- 테스트 주문 삭제
DELETE FROM orders
WHERE order_number = 'ORD-20260211-999';
```

실제 운영 쇼핑몰에서는 데이터를 완전히 지우지 않고, **소프트 삭제(soft delete)** 방식을 많이 씁니다.

**소프트 삭제** (플래그만 변경):
```sql
-- is_deleted 컬럼이 있는 테이블에서 소프트 삭제
UPDATE notices
SET is_deleted = 1
WHERE id = 10;
```

소프트 삭제 후 조회할 때는 항상 조건을 붙입니다:
```sql
-- 삭제되지 않은 공지만 조회
SELECT * FROM notices WHERE is_deleted = 0;
```

**소프트 삭제의 장점**:
- 실수로 삭제해도 복구 가능
- 과거 데이터(주문 이력, 탈퇴 회원 등) 보존
- 통계/분석에 활용 가능

### 3-7. JOIN – 두 테이블 연결해서 조회하기

회원 이름과 주문 정보를 **함께** 보고 싶을 때, JOIN을 사용합니다.

```sql
-- 주문 목록에 회원 이름/이메일을 함께 표시
SELECT
  o.id AS 주문번호,
  o.order_number AS 주문코드,
  u.name AS 회원이름,
  u.email AS 회원이메일,
  o.total_amount AS 결제금액,
  o.status AS 주문상태,
  o.created_at AS 주문일시
FROM orders o
INNER JOIN users u ON o.user_id = u.id
ORDER BY o.created_at DESC
LIMIT 10;
```

**읽는 법**:
- `FROM orders o` : orders 테이블을 `o`라는 별명으로 사용
- `INNER JOIN users u ON o.user_id = u.id` : orders의 user_id와 users의 id가 같은 행끼리 연결
- `o.total_amount`, `u.name` : 별명.컬럼 으로 어떤 테이블의 컬럼인지 구분

```sql
-- 특정 회원의 주문 내역 조회
SELECT
  o.order_number,
  o.total_amount,
  o.status,
  o.created_at
FROM orders o
INNER JOIN users u ON o.user_id = u.id
WHERE u.email = 'hong@example.com'
ORDER BY o.created_at DESC;
```

```sql
-- 주문 상태별 건수 통계
SELECT
  status AS 주문상태,
  COUNT(*) AS 건수
FROM orders
GROUP BY status
ORDER BY 건수 DESC;
```

### 3-8. 정리 – 여기까지 배운 것

이 섹션에서 직접 실행해 본 SQL을 정리하면:

| SQL 명령어 | 하는 일 | 예시 |
|-----------|---------|------|
| **SELECT** | 데이터 조회 | `SELECT name FROM users WHERE is_active = 1` |
| **INSERT** | 새 데이터 추가 | `INSERT INTO orders (...) VALUES (...)` |
| **UPDATE** | 기존 데이터 수정 | `UPDATE orders SET status = 'PAID' WHERE id = 1` |
| **DELETE** | 데이터 삭제 | `DELETE FROM orders WHERE id = 1` |
| **JOIN** | 테이블 연결 조회 | `SELECT ... FROM orders o JOIN users u ON o.user_id = u.id` |

이 5가지만 알면 쇼핑몰 데이터베이스의 대부분을 읽고 다룰 수 있습니다.

> **다음 단계**: Node.js 코드에서 이 SQL들을 어떻게 실행하는지 알고 싶다면
> [챕터2 – MySQL 실전 (Node.js 연동)](./mysql2.md)으로 이동하세요.
