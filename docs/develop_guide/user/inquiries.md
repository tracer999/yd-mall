# 1:1 문의

## 1. 개요

- **라우트:** `routes/inquiries.js` (mount: `/inquiries`)
- **컨트롤러:** `controllers/inquiryController.js`
- **뷰:** `views/user/inquiries/list.ejs`, `views/user/inquiries/form.ejs`, `views/user/inquiries/detail.ejs`

문의 목록·작성·상세는 모두 로그인 필요합니다. 비로그인 시 `/auth/login`으로 리다이렉트됩니다. 라우터에 `ensureAuthenticated` 미들웨어를 걸지 않고, 각 액션이 직접 `if (!req.user)` 를 검사합니다.

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
- **답변 표시:** 뷰가 `inquiry.is_answered` 로 '답변완료/답변대기' 배지를, `inquiry.answer` 가 있으면 답변 블록을 렌더합니다(관리자가 `/admin/inquiries` 에서 채우는 컬럼).

---

## 6. 관련

- 마이페이지 '나의 활동'(`/mypage/activities`)에도 같은 `inquiries` 행이 목록으로 나옵니다. 고객센터 LNB 의 '1:1 문의내역' 링크가 그쪽을 가리킵니다. [mypage.md](./mypage.md) · [cs.md](./cs.md)
- **DB `inquiries`:** `id, user_id, title, content, answer, is_answered, created_at`.

---

*Last Updated: 2026-07-11*
