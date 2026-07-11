# 공지사항

## 1. 개요

- **라우트:** `routes/notices.js` (mount: `/notices`)
- **컨트롤러:** `controllers/noticeController.js`
- **뷰:** `views/user/notices/list.ejs`, `views/user/notices/detail.ejs`

공지 목록과 상세 보기를 제공합니다.

> 공지사항 경로는 **두 개**입니다. `/notices`(이 문서)와 `/boards/notice`(`controllers/boardController.js`, 페이지네이션 있음)가 같은 `notices` 테이블을 봅니다. 고객센터 LNB 는 `/boards/notice` 로 링크합니다([cs.md](./cs.md) 참고).

---

## 2. 목록 (GET /notices)

- **동작:** `notices` 테이블 전체 조회(`SELECT *`), `importance DESC, created_at DESC` 정렬. 페이지네이션 없음.
- **전달 변수:** title: '공지사항', notices, seo.
- **SEO:** `siteSettings.company_name`(기본값 '와이디몰')과 `global.systemSettings.domain` 으로 title·description·url 을 조립하고 `robots: 'index,follow'` 를 지정합니다.

---

## 3. 상세 (GET /notices/:id)

- **동작:** 해당 id의 공지 조회 전에 `view_count` +1 업데이트.
- **없을 때:** `user/404` 를 **404 상태로 렌더**합니다(리다이렉트 아님).
- **본문 처리:** `decodeHtmlEntities(notice.content)` 로 `&lt;`·`&amp;`·`&#39;` 등 HTML 엔티티를 최대 3회 반복 디코드합니다(이중 인코딩된 본문 대응).
- **전달 변수:** title: 공지 제목, notice: 공지 1건, seo(`type: 'article'`, description 은 태그 제거 후 150자).

---

*Last Updated: 2026-07-11*
