# 문의 관리 (Inquiries)

## 1. 개요

- **Base URL:** `/admin/inquiries`  
- **관련 테이블:** `inquiries`, `users`  
- **컨트롤러:** `controllers/admin/inquiryController.js`  
- **뷰:** `views/admin/inquiries/list.ejs`, `views/admin/inquiries/detail.ejs`

사용자 1:1 문의 목록을 보고, 상세에서 답변을 등록합니다.

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

---

## 4. 문의 상세 (GET /admin/inquiries/:id)

- **쿼리:** 동일 JOIN, `WHERE i.id = ?`  
- **없을 때:** `/admin/inquiries`로 리다이렉트  
- **뷰 전달:** `inquiry` (1건), `title: '문의 상세'`, `path`, `layout`  
- **표시:** 제목, 내용, 작성자, 작성일, 답변 영역(답변 폼 또는 기존 답변+답변일)

---

## 5. 답변 등록 (POST /admin/inquiries/:id/answer)

- **URL 파라미터:** `id` (문의 ID)  
- **Body:** `answer` (답변 내용)  
- **동작:**  
  - `UPDATE inquiries SET answer = ?, is_answered = 1, answered_at = NOW() WHERE id = ?`  
  - 성공 시 `res.redirect('/admin/inquiries/' + id)`  
- **예외:** 500

---

## 6. DB 스키마 (inquiries, 참고)

| 컬럼 | 설명 |
|------|------|
| id | 문의 ID |
| user_id | 작성자 (users.id) |
| title | 제목 |
| content | 문의 내용 |
| answer | 관리자 답변 |
| is_answered | 답변 여부 0/1 |
| created_at | 작성일시 (answered_at 별도 컬럼 있을 수 있음) |

---

*Last Updated: 2026-02-05*
