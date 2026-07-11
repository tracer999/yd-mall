# 고객센터

## 1. 개요

- **라우트:** `routes/cs.js` (mount: `/cs`), `routes/boards.js` (mount: `/boards`)
- **컨트롤러:** `controllers/csController.js`, `controllers/boardController.js`
- **뷰:** `views/user/cs/index.ejs`(목록·검색 공용), `views/user/boards/list.ejs`, `views/user/boards/detail.ejs`

`/cs` 는 FAQ 를 중심으로 한 고객센터 허브입니다(`feature_menu.HEADER_CS.default_path = '/cs'`). 1:1 문의·공지사항 같은 실제 기능은 각자의 모듈이 담당하고, 고객센터는 좌측 LNB 로 그쪽을 링크만 합니다.

FAQ 답변(`faq.answer`)은 HTML 이므로 **렌더 직전 반드시** `services/display/htmlSanitizer.sanitize()` 를 통과시킵니다.

---

## 2. 라우트

| URL | 메서드 | 액션 | 설명 |
|-----|--------|------|------|
| /cs | GET | csController.getIndex | 고객센터 메인 — FAQ BEST 10 + 공지사항 5건 |
| /cs/faq | GET | csController.getFaq | 분류별 FAQ / 검색 (`?categoryId=`, `?q=`) |
| /cs/faq/:id/view | POST | csController.postFaqView | FAQ 조회수 +1 (아코디언 펼침 시 AJAX) |
| /boards/notice | GET | boardController.getList | 공지사항 목록 (페이지네이션) |
| /boards/notice/:id | GET | boardController.getDetail | 공지사항 상세 |
| /boards/guide | GET | boardController.getList | 상품안내 목록 |
| /boards/guide/:id | GET | boardController.getDetail | 상품안내 상세 |

인증은 없습니다(전부 공개).

---

## 3. 고객센터 메인 (GET /cs)

- **FAQ BEST:** `faq WHERE mall_id = 1 AND is_active = 1 ORDER BY is_best DESC, view_count DESC, sort_order ASC, id ASC LIMIT 10`
- **분류:** `faq_category`(`mall_id=1 AND is_active=1`) + 분류별 활성 FAQ 개수(`faq_count`), `sort_order ASC, id ASC`
- **공지사항 5건:** `notices` 에서 최신 5건. `type`·`is_deleted`·`importance` 컬럼이 **런타임에 존재하는지 탐지**해서 WHERE·ORDER BY 를 조립하고, 결과를 모듈 변수(`noticeColsCache`)에 1회 캐시합니다.
- **전달 변수:** title, categories, faqs(sanitize 됨), notices, activeCategoryId(null), keyword(''), seo

> `mall_id = 1` 이 SQL 에 하드코딩되어 있습니다(`req.mallId` 를 쓰지 않음).

---

## 4. FAQ 목록·검색 (GET /cs/faq)

- 쿼리: `?categoryId=`(숫자), `?q=`(앞뒤 공백 제거 후 **100자 절단**)
- 조건: `f.mall_id = 1 AND f.is_active = 1` + (분류) + (`f.question LIKE ? OR f.answer LIKE ?`)
- LIKE 와일드카드는 파라미터로 전달합니다(문자열 결합 금지).
- 정렬 `sort_order ASC, id ASC`, **최대 30건**(페이지네이션 없음).
- 메인과 **같은 뷰**(`user/cs/index`)를 렌더하며 `activeCategoryId`·`keyword` 로 화면이 갈립니다.
- SEO: 검색어가 있으면 `'{키워드}' 검색 결과 | 고객센터`, `robots: 'noindex,follow'`.

## 5. FAQ 조회수 (POST /cs/faq/:id/view)

`UPDATE faq SET view_count = view_count + 1 WHERE id = ? AND is_active = 1`. 응답 `{ success: true }`. id 가 없거나 0 이면 400.

---

## 6. 좌측 LNB (views/user/cs/index.ejs)

| 항목 | 링크 |
|------|------|
| 1:1 문의하기 | `/inquiries` ([inquiries.md](./inquiries.md)) |
| 1:1 문의내역 | `/mypage/activities` ([mypage.md](./mypage.md)) |
| 공지사항 전체보기 | `/boards/notice` |
| 자주묻는질문 | `/cs`(전체) · `/cs/faq?categoryId={id}` |
| 비회원 주문조회 | `/mypage/orders` |
| 대표번호 | `siteSettings.contact_phone`(값이 있을 때만 노출) |

> **'비회원 주문조회' 는 실제로 비회원이 못 씁니다.** `/mypage/orders` 는 `ensureAuthenticated` 뒤에 있어 로그인 화면으로 리다이렉트됩니다. 비회원 주문조회 기능은 코드에 없습니다.

---

## 7. 게시판 (/boards)

`boardController` 는 `notices` 테이블 하나를 `type` 으로 나눠 두 게시판을 만듭니다.

| URL 파라미터 | DB `type` | 페이지 제목 |
|--------------|-----------|-------------|
| `notice` | `NOTICE` | 공지사항 |
| `guide` | `GUIDE` | 상품안내 |

- 그 외 `:type` 값은 `user/404` 를 404 로 렌더합니다.
- 목록: `?page=`(10건/페이지), `ORDER BY importance DESC, created_at DESC`. 전달 변수: posts, currentPage, totalPages, type, user.
- 상세: **조회 전에 `view_count` +1** 을 먼저 실행하므로, type 이 안 맞아 404 가 나도 조회수는 이미 올라갑니다.
- `getNoticeColumnInfo()` 가 `SHOW COLUMNS FROM notices` 로 `type`·`is_deleted` 존재 여부를 매 요청 확인합니다(csController 와 달리 캐시 없음).

> 공지사항 경로가 **두 개**입니다. `/notices`(`noticeController`, 페이지네이션 없음, [notices.md](./notices.md))와 `/boards/notice`(`boardController`, 페이지네이션 있음). 고객센터는 후자를 링크합니다.
> `/boards/guide`(상품안내, DB 게시물)와 `/guide`(이용안내, 정적 페이지, [terms_pages.md](./terms_pages.md))는 다른 페이지입니다.

---

## 8. 카카오톡 문의

고객센터 라우트가 아니라 **공통 레이아웃**(`views/layouts/main_layout.ejs`)에 있습니다.

- `siteSettings.kakao_channel_enabled` 가 켜져 있으면 `siteSettings.kakao_channel_url` 로 플로팅 문의 버튼을 띄웁니다(`buildKakaoChannelUrl()` 이 `pf.kakao.com` URL 로 정규화).
- 버튼에 `data-kakao-source`·`data-kakao-label`(예: `floating_btn` / '플로팅 문의 버튼')을 달아 두고, 레이아웃의 전역 클릭 리스너가 `[data-kakao-source]` 를 감지해 `navigator.sendBeacon('/api/kakao-inquiry', ...)` 로 기록합니다(`sendBeacon` 미지원 브라우저에서는 기록하지 않음).

| API | 라우트 | body | 저장 |
|-----|--------|------|------|
| POST /api/kakao-inquiry | `routes/index.js` | `{ source, sourceLabel, productId }` | `kakao_inquiry_logs`(source, source_label, product_id, user_id, ip_address, user_agent) |
| POST /api/kakao-click | `routes/index.js` | `{ productId }` | `kakao_click_logs`(product_id, user_id, ip_address) |

- 두 API 모두 **204 No Content** 를 반환하고, 실패해도 예외를 삼킵니다(`catch (_) {}`) — 추적 실패가 사용자 동선을 막지 않습니다.
- `source` 가 없으면 400, `/api/kakao-click` 은 `productId` 가 없으면 400.

---

## 9. DB

코드에서 참조하는 컬럼만 적습니다.

| 테이블 | 컬럼 |
|--------|------|
| `faq` | id, mall_id, category_id, question, answer(HTML), is_best, view_count, sort_order, is_active, created_at, updated_at |
| `faq_category` | id, mall_id, code, name, sort_order, is_active |
| `notices` | id, title, content, importance, type(NOTICE/GUIDE), view_count, created_at — **`is_deleted` 컬럼은 현재 DB 에 없습니다**(코드가 런타임 탐지로 대응) |
| `kakao_inquiry_logs` | id, source, source_label, product_id, user_id, ip_address, user_agent, created_at |
| `kakao_click_logs` | id, product_id, user_id, ip_address, created_at |

---

## 10. 관련 — 브랜드관 (/brands)

고객센터는 아니지만 `routes/brands.js` 도 문서가 없어 여기 짧게 남깁니다.

- `GET /brands` — `categories WHERE type='BRAND' AND mall_id = ?` 를 `display_order ASC, id ASC` 로 조회. 로그인 사용자면 `brand_likes` 의 `category_id` 목록(`likedBrandIds`)을 함께 내려 하트 초기 상태를 그립니다. `robots: 'index,follow'`.
- `GET /brands/:brandId` — 페이지가 아니라 **리다이렉트**입니다: `/products/brand/{brandId}` (쿼리 `?categoryId=` 가 있으면 그대로 전달).
- 브랜드 찜 토글은 `POST /likes/brand/toggle` ([mypage.md](./mypage.md) §8).

---

## 11. 주의사항

- FAQ 답변은 운영자 입력 HTML 입니다. 새 화면에서 `faq.answer` 를 쓸 때 `sanitize()` 를 빼먹지 마세요.
- `csController` 는 `mall_id = 1` 을 하드코딩합니다. 멀티몰로 확장하면 `req.mallId` 로 바꿔야 합니다.
- `csController.getNoticeColumns()` 의 캐시는 **프로세스 수명 동안 유지**됩니다. `notices` 스키마를 바꾸면 PM2 재시작이 필요합니다.
- `/boards/:type/:id` 는 존재하지 않는 게시물에도 `view_count` UPDATE 를 먼저 실행합니다.

---

*Last Updated: 2026-07-11*
