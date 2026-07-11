# 문의 관리 (Inquiries)

## 1. 개요

- **Base URL:** `/admin/inquiries`  
- **관련 테이블:** `inquiries`, `users`  
- **컨트롤러:** `controllers/admin/inquiryController.js`  
- **뷰:** `views/admin/inquiries/list.ejs`, `views/admin/inquiries/detail.ejs`

사용자 1:1 문의 목록을 보고, 상세에서 답변을 등록합니다. 고객센터 FAQ 는 별도 화면(`/admin/faqs`)이며 [7장](#7-고객센터-faq-관리-adminfaqs)에서 다룹니다.

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/inquiries` | getList | 문의 목록 |
| GET | `/admin/inquiries/:id` | getDetail | 문의 상세 |
| POST | `/admin/inquiries/:id/answer` | postAnswer | 답변 등록 |

---

## 3. 문의 목록 (GET /admin/inquiries)

- **쿼리:** `inquiries` JOIN `users` (user_name, user_email), `ORDER BY i.created_at DESC`  
- **표시:** 문의 제목, 작성자(이름/이메일), 답변 여부, 작성일 등  
- **뷰 전달:** `inquiries`, `title: '문의 관리'`, `path: '/admin/inquiries'`, `layout: 'layouts/admin_layout'`  
- 검색·필터·페이지네이션 없음 (전건 조회)  
- `JOIN users` 라 회원이 삭제된 문의는 목록에서 사라집니다(INNER JOIN)

---

## 4. 문의 상세 (GET /admin/inquiries/:id)

- **쿼리:** 동일 JOIN, `WHERE i.id = ?`  
- **없을 때:** `/admin/inquiries`로 리다이렉트 (404 아님)  
- **뷰 전달:** `inquiry` (1건), `title: '문의 상세'`, `path`, `layout`  
- **표시:** 제목, 내용, 작성자, 작성일, 답변 영역(답변 폼 또는 기존 답변)

---

## 5. 답변 등록 (POST /admin/inquiries/:id/answer)

- **URL 파라미터:** `id` (문의 ID)  
- **Body:** `answer` (답변 내용)  
- **동작:**  
  - `UPDATE inquiries SET answer = ?, is_answered = 1, answered_at = NOW() WHERE id = ?` (`inquiryController.js:53`)  
  - 성공 시 `res.redirect('/admin/inquiries/' + id)`  
- **예외:** 500  
- 답변 내용은 새니타이즈하지 않습니다 (FAQ 와 다름 — 7장 참고)

> ⚠️ **스키마 드리프트 — 답변 등록은 현재 500 입니다.**  
> `inquiryController.js:53` 이 `answered_at` 컬럼에 쓰지만, **운영 DB `inquiries` 테이블에 `answered_at` 컬럼이 없습니다** (`SELECT answered_at FROM inquiries` → `ERROR 1054 (42S22) Unknown column 'answered_at'`). `tables.sql` 에도 정의가 없습니다 — 저장소 어디에도 이 컬럼의 DDL 이 없습니다. 컬럼을 추가하거나 UPDATE 문에서 제거해야 답변 기능이 동작합니다.

---

## 6. DB 스키마 (inquiries)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK | 문의 ID |
| user_id | INT NOT NULL | 작성자 (users.id, 인덱스) |
| title | VARCHAR(100) NOT NULL | 제목 |
| content | TEXT NOT NULL | 문의 내용 |
| answer | TEXT | 관리자 답변 |
| is_answered | TINYINT 0/1 (기본 0) | 답변 여부 |
| created_at | TIMESTAMP | 작성일시 |

> **`answered_at` 컬럼은 존재하지 않습니다** (5장 경고 참고). 답변일시를 화면에 표시하려면 컬럼 추가가 선행되어야 합니다.

---

## 7. 고객센터 FAQ 관리 (/admin/faqs)

- **Base URL:** `/admin/faqs`  
- **라우트:** `routes/admin/faqs.js`  
- **컨트롤러:** `controllers/admin/faqController.js`  
- **뷰:** `views/admin/faqs/list.ejs`, `form.ejs`  
- **테이블:** `faq`, `faq_category`  
- **스토어프론트:** `/cs` (`controllers/csController.js`)

FAQ 데이터·스토어프론트는 먼저 있었고 관리 UI 만 뒤늦게 붙은 화면입니다. `faq_category.code` 는 고정 식별자이고, 운영자는 분류명(`name`)만 바꿉니다 — **분류 CRUD 화면은 없습니다**(FAQ 항목 CRUD 만).

### 7.1 라우트

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/faqs` | getList | FAQ 목록 (분류 필터) |
| GET | `/admin/faqs/new` | getNew | 등록 폼 |
| POST | `/admin/faqs` | postCreate | 등록 |
| GET | `/admin/faqs/:id` | getEdit | 수정 폼 |
| POST | `/admin/faqs/:id` | postUpdate | 수정 |
| POST | `/admin/faqs/:id/delete` | postDelete | 삭제 |

> Express 5(path-to-regexp v8)는 `:id(\d+)` 정규식 파라미터를 지원하지 않습니다. 그래서 `/new` 를 `/:id` 보다 **먼저** 선언하고, 숫자 검증은 라우터의 `requireNumericId` 미들웨어가 합니다(비숫자 → 404). `routes/admin/faqs.js:11-22`

### 7.2 몰 스코프

FAQ 는 **몰별 데이터**입니다. 모든 쿼리가 `req.adminMallId`(→ [`settings.md`](./settings.md) 1.1)로 스코프됩니다 — 조회·수정·삭제 모두 `WHERE ... AND mall_id = ?` 를 붙여 다른 몰의 FAQ 를 건드릴 수 없습니다.

### 7.3 목록 (GET /admin/faqs)

- **쿼리 파라미터:** `category_id` (숫자일 때만 필터 적용), `saved=1` (저장 완료 배너)  
- **쿼리:** `faq` LEFT JOIN `faq_category`, `WHERE f.mall_id = ?` (+ 분류 필터), `ORDER BY c.sort_order, f.sort_order, f.id`  
- **표시:** 질문, 분류명, 노출 여부, BEST 여부, 정렬순서, 조회수, 수정일  
- **뷰 전달:** `faqs`, `categories`(활성 분류), `selectedCategory`, `saved`

### 7.4 등록/수정 폼

| name | 타입 | 설명 |
|------|------|------|
| category_id | select | 분류 (`faq_category` 활성 목록). 숫자가 아니면 NULL |
| question | text | 질문 — **255자로 잘림** |
| answer | textarea (TinyMCE) | 답변 (HTML) — 저장 시 새니타이즈 |
| is_active | checkbox | 노출 여부 |
| is_best | checkbox | BEST FAQ 여부 |
| sort_order | number | 정렬 순서 — 0~9999 로 클램프, 숫자 아니면 0 |

- **뷰 전달:** `faq`, `categories`, `tinymceKey` (`process.env.TINYMCE_KEY`)

### 7.5 저장 시 새니타이즈 (핵심)

`faq.answer` 는 HTML 입니다. `csController` 가 **렌더 시** 새니타이즈하지만, `faqController.normalize()` 가 **저장 시에도** `services/display/htmlSanitizer.sanitize()` 를 통과시켜 이중 방어합니다 (`faqController.js:97`).

> 이는 `pageBuilderService.updateSection` 과 같은 원칙입니다 — **저장된 것이 곧 노출되는 것**이어야 관리자가 결과를 예측할 수 있습니다. (5장의 문의 답변은 새니타이즈하지 않습니다)

`question` 또는 `answer` 가 (새니타이즈 후) 비면 저장하지 않고 폼으로 리다이렉트합니다 (`faqController.js:109`, `128`).

### 7.6 삭제 (POST /admin/faqs/:id/delete)

- `DELETE FROM faq WHERE id = ? AND mall_id = ?` — 하드 딜리트  
- FAQ 를 참조하는 테이블이 없어(조회수도 `faq` 행 자체에 있음) 연관 정리가 필요 없습니다  
- 성공 시 `/admin/faqs?saved=1`

### 7.7 DB 스키마

**faq**

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT PK | FAQ ID |
| mall_id | BIGINT (기본 1) | 몰 ID |
| category_id | BIGINT NULL | 분류 FK → `faq_category` |
| question | VARCHAR(255) NOT NULL | 질문 |
| answer | TEXT NOT NULL | 답변 (HTML, 새니타이즈됨) |
| is_best | TINYINT (기본 0) | BEST 노출 |
| view_count | INT (기본 0) | 조회수 (스토어프론트가 증가) |
| sort_order | INT (기본 0) | 정렬 |
| is_active | TINYINT (기본 1) | 노출 여부 |
| created_at, updated_at | DATETIME | 생성·수정일시 |

**faq_category** (관리 UI 없음 — DB 로 관리)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT PK | 분류 ID |
| mall_id | BIGINT (기본 1) | 몰 ID |
| code | VARCHAR(50) NOT NULL | 고정 식별자 (`ORDER_PAY`, `DELIVERY`, `CANCEL_RETURN`, `POINT`, `MEMBER`, `ETC`) |
| name | VARCHAR(100) NOT NULL | 분류명 (운영자 노출) |
| sort_order | INT (기본 0) | 정렬 |
| is_active | TINYINT (기본 1) | 사용 여부 |

---

*Last Updated: 2026-07-11*
