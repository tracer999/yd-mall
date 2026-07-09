# 약관/정책/소개

## 1. 개요

- **라우트:** `routes/terms.js` (mount: `/`)
- **컨트롤러:** `controllers/termsController.js`
- **뷰:** `views/user/terms.ejs`, `views/user/privacy.ejs`, `views/user/about.ejs`

이용약관, 개인정보 처리방침, 회사 소개 페이지를 제공합니다. 컨트롤러는 제목만 전달하며, 본문 내용은 뷰 또는 레이아웃에서 참조하는 데이터 소스(예: site_settings, policies 테이블)에 따라 다를 수 있습니다.

---

## 2. URL 및 처리

| URL | 메서드 | 컨트롤러 | 뷰 | title |
|-----|--------|----------|-----|-------|
| /terms | GET | getTerms | user/terms | 이용약관 |
| /privacy | GET | getPrivacy | user/privacy | 개인정보 처리방침 |
| /about | GET | getAbout | user/about | 회사 소개 |

각 액션은 `res.render(뷰경로, { title })`만 수행합니다. 별도 DB 조회 없음.

---

*Last Updated: 2026-02-08*
