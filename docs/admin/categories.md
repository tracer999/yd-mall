# 카테고리 관리 (Categories)

## 1. 개요

- **Base URL:** `/admin/categories`  
- **관련 테이블:** `categories`  
- **컨트롤러:** `controllers/admin/categoryController.js`  
- **뷰:** `views/admin/categories/list.ejs` (목록 + 등록 폼 동일 페이지)

상품 분류용 카테고리의 이름과 노출 순서(display_order)를 관리합니다. 테이블에 `parent_id` FK가 있으나 현재 관리자 화면은 1차원 목록 형태로만 사용합니다.

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/categories` | getList | 목록 + 등록 폼 표시 |
| POST | `/admin/categories/add` | postAdd | 카테고리 추가 |
| POST | `/admin/categories/edit` | postEdit | 카테고리 수정 |
| POST | `/admin/categories/delete` | postDelete | 카테고리 삭제 |

---

## 3. 목록 조회 (GET /admin/categories)

- **쿼리:** `SELECT * FROM categories ORDER BY display_order ASC`  
- **뷰:** 왼쪽에 등록 폼, 오른쪽에 카테고리 테이블  
- **테이블 컬럼:** 순서(display_order), 이름(name), 관리(수정/삭제 버튼)  
- **수정:** 각 행이 `/admin/categories/edit` POST 폼 (id, name, display_order)  
- **삭제:** JavaScript로 확인 후 hidden form `/admin/categories/delete` POST (id)

---

## 4. 카테고리 추가 (POST /admin/categories/add)

- **파라미터:** `name` (필수), `display_order` (숫자, 기본 0)  
- **동작:** `INSERT INTO categories (name, display_order) VALUES (?, ?)`  
- **성공 시:** `res.redirect('/admin/categories')`

---

## 5. 카테고리 수정 (POST /admin/categories/edit)

- **파라미터:** `id`, `name`, `display_order`  
- **동작:** `UPDATE categories SET name = ?, display_order = ? WHERE id = ?`  
- **성공 시:** `/admin/categories`로 리다이렉트  

---

## 6. 카테고리 삭제 (POST /admin/categories/delete)

- **파라미터:** `id`  
- **동작:** `DELETE FROM categories WHERE id = ?`  
- **성공 시:** `/admin/categories`로 리다이렉트  
- **참고:** 상품이 해당 category_id를 참조할 경우 FK 정책(ON DELETE SET NULL 등)에 따름

---

## 7. DB 스키마 (categories)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK AUTO_INCREMENT | 카테고리 ID |
| name | VARCHAR(50) | 카테고리명 |
| display_order | INT DEFAULT 0 | 노출 순서 |
| parent_id | INT FK NULL | 상위 카테고리 (현재 UI 미사용) |

---

*Last Updated: 2026-02-05*
