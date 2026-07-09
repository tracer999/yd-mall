# 1:1 문의

## 1. 개요

- **라우트:** `routes/inquiries.js` (mount: `/inquiries`)
- **컨트롤러:** `controllers/inquiryController.js`
- **뷰:** `views/user/inquiries/list.ejs`, `views/user/inquiries/form.ejs`, `views/user/inquiries/detail.ejs`

문의 목록·작성·상세는 모두 로그인 필요합니다. 비로그인 시 `/auth/login`으로 리다이렉트됩니다.

---

## 2. 목록 (GET /inquiries)

- **인증:** 로그인 필수.
- **동작:** `inquiries` 테이블에서 `user_id = req.user.id` 조건으로 조회, `created_at DESC` 정렬.
- **전달 변수:** title: '1:1 문의', inquiries.

---

## 3. 작성 폼 (GET /inquiries/write)

- **인증:** 로그인 필수.
- **동작:** 문의 작성 폼 뷰 렌더. title: '문의 작성'.

---

## 4. 문의 등록 (POST /inquiries/write)

- **인증:** 로그인 필수. 없으면 401.
- **요청 body:** title, content.
- **동작:** `inquiries` 테이블에 INSERT (user_id, title, content) 후 `/inquiries`로 리다이렉트.

---

## 5. 상세 (GET /inquiries/:id)

- **인증:** 로그인 필수.
- **동작:** `id`와 `user_id = req.user.id`로 1건 조회. 없으면 `/inquiries`로 리다이렉트.
- **전달 변수:** title: '문의 내역', inquiry.

---

*Last Updated: 2026-02-08*
