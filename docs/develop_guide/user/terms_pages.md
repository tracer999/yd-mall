# 약관/정책/소개

## 1. 개요

- **라우트:** `routes/terms.js` (mount: `/`)
- **컨트롤러:** `controllers/termsController.js`
- **뷰:** `views/user/terms.ejs`, `views/user/privacy.ejs`, `views/user/about.ejs`, `views/user/guide.ejs`

이용약관, 개인정보 처리방침, 회사 소개, 이용안내 페이지를 제공합니다. 컨트롤러는 **제목과 SEO 메타만** 전달하고 본문을 조회하지 않습니다. 본문은 `middleware/siteSettings.js` 가 `site_settings` 테이블(몰별 1행)에서 읽어 `res.locals.siteSettings` 에 넣어 둔 값을 뷰가 직접 출력합니다.

---

## 2. URL 및 처리

| URL | 메서드 | 컨트롤러 | 뷰 | title |
|-----|--------|----------|-----|-------|
| /terms | GET | getTerms | user/terms | 이용약관 |
| /privacy | GET | getPrivacy | user/privacy | 개인정보 처리방침 |
| /about | GET | getAbout | user/about | 회사 소개 |
| /guide | GET | getGuide | user/guide | 이용안내 |

각 액션은 `res.render(뷰경로, { title, seo })` 만 수행합니다(**컨트롤러 자체의 DB 조회 없음**). `seo` 는 `buildSeo()` 가 `res.locals.siteSettings.company_name`(기본값 '와이디몰')과 `global.systemSettings.domain`(기본값 `https://dev-mall.ydata.co.kr`)으로 조립하며, 네 페이지 모두 `robots: 'index,follow'` 입니다.

## 3. 본문 데이터

| 뷰 | 본문 소스 | 없을 때 |
|----|-----------|---------|
| user/terms | `siteSettings.terms_of_service` (`<%- %>` 로 HTML 그대로 출력) | "등록된 이용약관이 없습니다." |
| user/privacy | `siteSettings.privacy_policy` (HTML 그대로) | "등록된 개인정보 처리방침이 없습니다." |
| user/about | `siteSettings.company_intro` (HTML 그대로) | "등록된 회사 소개 내용이 없습니다..." |
| user/guide | **정적 마크업**(뷰에 직접 작성) | - |

`terms_of_service`·`privacy_policy`·`company_intro` 는 관리자 사이트 설정에서 저장하는 값이며, 뷰가 이스케이프 없이(`<%- %>`) 출력합니다. 새니타이즈하지 않으므로 신뢰할 수 있는 관리자 입력이라는 전제가 깔려 있습니다.

> `/guide`(이용안내 — 주문·배송·결제·반품 안내)와 `/boards/guide`(상품안내 — `notices` 테이블의 `type='GUIDE'` 게시물, [cs.md](./cs.md))는 **다른 페이지**입니다.

---

*Last Updated: 2026-07-11*
