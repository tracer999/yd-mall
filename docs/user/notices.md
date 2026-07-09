# 공지사항

## 1. 개요

- **라우트:** `routes/notices.js` (mount: `/notices`)
- **컨트롤러:** `controllers/noticeController.js`
- **뷰:** `views/user/notices/list.ejs`, `views/user/notices/detail.ejs`

공지 목록과 상세 보기를 제공합니다.

---

## 2. 목록 (GET /notices)

- **동작:** `notices` 테이블 전체 조회, `importance DESC, created_at DESC` 정렬.
- **전달 변수:** title: '공지사항', notices.

---

## 3. 상세 (GET /notices/:id)

- **동작:** 해당 id의 공지 조회 전에 `view_count` +1 업데이트. 해당 id가 없으면 `/notices`로 리다이렉트.
- **전달 변수:** title: 공지 제목, notice: 공지 1건.

---

*Last Updated: 2026-02-08*
