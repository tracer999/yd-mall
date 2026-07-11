# 공지사항 관리 (Notices)

## 1. 개요

공지사항은 **정적 게시판**입니다. 기획전·이벤트·공동구매와 달리 캠페인이 아닙니다 — 기간(`start_at`/`end_at`)도, 발행 상태(DRAFT/PUBLISHED)도, 몰 스코프(`mall_id`)도, 상품 매핑도 없습니다. `notices` 테이블 컬럼은 `title`·`content`·`importance`·`type`·`view_count`·`created_at` 이 전부이고, 저장되는 순간 고객에게 노출됩니다. 캠페인 3종이 "무엇을 언제 어떤 조건으로 판매/전시/참여시킬 것인가" 를 다룬다면, 공지사항은 "글을 하나 올린다" 입니다.

| | 공지사항 (`notices`) | 기획전 / 이벤트 / 공동구매 |
|---|---|---|
| 기간·상태 | **없음** (저장 즉시 노출) | `start_at`/`end_at` + `status` |
| 몰 스코프 | **없음** (`mall_id` 컬럼 없음) | 전부 `mall_id` 로 스코프 |
| 상품 연결 | 없음 | 기획전·공동구매는 상품 매핑 있음 |
| slug URL | 없음 (숫자 id 로 접근) | `(mall_id, slug)` 유니크 |
| 서비스 레이어 | 없음 (컨트롤러가 SQL 직접) | `services/{exhibition,event,groupBuy}/` |
| 관리자 메뉴명 | "공지사항 관리" (`admin_menus` id=17) | — |

> **주의:** 관리자 화면의 제목은 코드상 **"게시판 관리"** 입니다(`controllers/admin/noticeController.js:53`, `views/admin/notices/list.ejs:3`). `notices` 테이블은 `type` 으로 **공지사항(NOTICE)** 과 **상품안내(GUIDE)** 두 게시판을 겸하기 때문입니다.

- **Base URL:** `/admin/notices` (`routes/admin.js:70`, `requireMenuAccess('/admin/notices')`)
- **관련 테이블:** `notices` (단일)
- **컨트롤러:** `controllers/admin/noticeController.js`
- **뷰:** `views/admin/notices/list.ejs`, `form.ejs`(등록·수정 공용), `detail.ejs`
- **에디터:** TinyMCE 6 (`process.env.TINYMCE_KEY`), 이미지 업로드 URL `/admin/notices/image-upload` (`views/admin/notices/form.ejs:41-49`)
- **권한:** `admin_menus.visible_roles = super_admin,admin,content_admin` (DB, id=17)

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/notices` | getList | 목록 (`?type=NOTICE\|GUIDE\|ALL`) |
| GET | `/admin/notices/create` | getCreate | 등록 폼 |
| POST | `/admin/notices/create` | postCreate | 등록 처리 |
| GET | `/admin/notices/detail/:id` | getDetail | 상세 조회 |
| GET | `/admin/notices/edit/:id` | getEdit | 수정 폼 |
| POST | `/admin/notices/edit/:id` | postEdit | 수정 처리 |
| POST | `/admin/notices/delete` | postDelete | 삭제 (`body.id`) |
| POST | `/admin/notices/image-upload` | postUploadImage | TinyMCE 이미지 업로드 (Multer `single('file')`, JSON) |

`routes/admin/notices.js` 전체가 이 8줄입니다. 등록·수정·삭제는 전부 폼 POST → `res.redirect('/admin/notices')`.

---

## 3. 목록 (GET /admin/notices)

- 쿼리: `SELECT * FROM notices` + (`type` 이 `NOTICE`/`GUIDE` 일 때만) `WHERE type = ?`, `ORDER BY importance DESC, created_at DESC` (`noticeController.js:38-48`)
- 탭 UI: 전체(`?type=ALL`) / 공지사항(`?type=NOTICE`) / 상품안내(`?type=GUIDE`) — `views/admin/notices/list.ejs:10-21`
- 표시: 구분 배지, 제목(`importance=1` 이면 `[중요]` + 행 배경 `bg-red-50`), 조회수, 등록일, 수정/삭제
- **페이지네이션 없음** — 전건 조회입니다.

---

## 4. 등록·수정 (POST /admin/notices/create, /edit/:id)

### 4.1 폼 필드 (`views/admin/notices/form.ejs`)

| name | 타입 | 설명 |
|------|------|------|
| type | select | `NOTICE`(공지사항) / `GUIDE`(상품안내) |
| title | text | 필수 |
| importance | checkbox | 체크 시 1 = 중요 공지(상단 고정) |
| content | textarea (TinyMCE) | 본문 HTML |

### 4.2 상단 고정 3개 제한

`importance` 를 켠 채 저장하면 `SELECT COUNT(*) FROM notices WHERE importance = 1` (수정 시 `AND id != ?`) 을 세어 **3개 이상이면 거부**합니다. 거부 응답은 리다이렉트가 아니라 인라인 스크립트입니다 — `res.send('<script>alert("상단 고정은 최대 3개까지만 가능합니다.");history.back();</script>')` (`noticeController.js:76-82`, `144-150`).

### 4.3 HTML 엔티티 디코딩 (`decodeHtmlEntities`, 3-33행)

`content` 는 저장 전(`postCreate`/`postEdit`)과 렌더 전(`getDetail`/`getEdit`) 양쪽에서 `decodeHtmlEntities()` 를 통과합니다. `&lt;`, `&amp;`, `&#39;`, `&nbsp;` 등을 **최대 3회 반복 디코드**해 이중 인코딩을 풉니다.

> ⚠️ 이 함수는 **새니타이저가 아니라 디코더**입니다. 기획전·공동구매·이벤트가 쓰는 `services/display/htmlSanitizer` 를 공지사항은 쓰지 않습니다. 관리자 입력 HTML이 그대로 저장·렌더됩니다(§7 참고).

### 4.4 이미지 업로드 (POST /admin/notices/image-upload)

- Multer `upload.single('file')`, 응답 `{ location: '/uploads/products/' + req.file.filename }` (`noticeController.js:175-185`)
- 응답 경로가 `/uploads/products/` 로 하드코딩돼 있는데, `middleware/upload.js` 의 destination 이 `file` 필드명에 대해 분기하지 않아 기본값 `public/uploads/products` 로 저장되므로 **결과적으로 일치합니다**(`middleware/upload.js:36-51`). 다만 destination 분기가 바뀌면 이 하드코딩이 깨집니다.
- `file` 은 image-only 필드라 이미지 MIME 만 통과합니다. 용량 상한은 `MAX_UPLOAD_FILE_MB`(기본 20MB) (`middleware/upload.js:5-8`, `64-101`)

---

## 5. DB 테이블 (`notices`)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | int PK AI | |
| title | varchar(100) NOT NULL | 제목 |
| content | text NOT NULL | 본문 (HTML) |
| importance | int (기본 0) | 0=일반, 1=중요(상단 고정, 최대 3) |
| type | varchar(50) (기본 'NOTICE') | `NOTICE`(공지사항) / `GUIDE`(상품안내) — **DB enum 이 아니라 varchar**. 제약은 애플리케이션에만 있음 |
| view_count | int (기본 0) | 조회수 (고객 상세 진입 시 +1) |
| created_at | timestamp (기본 CURRENT_TIMESTAMP) | |

- `updated_at`, `mall_id`, `is_deleted`, `start_at`/`end_at`, `status` **없음**.
- `boardController.getNoticeColumnInfo()` 가 `SHOW COLUMNS` 로 `type`·`is_deleted` 컬럼 존재 여부를 런타임에 확인합니다(`controllers/boardController.js:3-10`) — `is_deleted` 는 현재 DB 에 없으므로 소프트 삭제는 동작하지 않습니다.

---

## 6. 고객 화면 연계

`notices` 를 읽는 고객 측 진입점은 **세 곳**입니다.

| 경로 | 컨트롤러 | 뷰 | 조회 조건 |
|------|----------|-----|-----------|
| `GET /notices`, `GET /notices/:id` (`routes/index.js:67`) | `controllers/noticeController.js` | `user/notices/list`, `user/notices/detail` | **type 무관 전건**, `ORDER BY importance DESC, created_at DESC` (`:37`) |
| `GET /boards/:type`, `GET /boards/:type/:id` (`notice`/`guide`) (`app.js:274`) | `controllers/boardController.js` | `user/boards/list`, `user/boards/detail` | `type = 'NOTICE'` 또는 `'GUIDE'`, 페이지네이션 10건 (`:20-28`, `:53-60`) |
| `GET /cs` (고객센터 메인) (`app.js:270`) | `controllers/csController.js` | — | `type='NOTICE'` 최근 N건 (`:56-75`) |

- 조회수 증가: `/notices/:id`(`noticeController.js:68`), `/boards/:type/:id`(`boardController.js:81`) 두 곳 모두 `view_count + 1`
- 사이트맵: 최근 50건이 포함됩니다 (`routes/sitemap.js:78`)
- 관리자 `/admin/notices/detail/:id` 는 **조회수를 올리지 않습니다**.

> `/notices` 는 `type` 을 안 걸러서 **상품안내(GUIDE) 글도 함께 노출**됩니다. 반면 `/boards/notice` 는 `type='NOTICE'` 만 봅니다. 같은 테이블을 서로 다른 조건으로 읽는 두 화면이 공존합니다.

---

## 7. 주의사항

- **새니타이즈가 없습니다.** 공지 본문은 `decodeHtmlEntities()` 로 **디코드만** 되고 `htmlSanitizer` 를 거치지 않습니다. 관리자 권한(`content_admin` 이상)이 필요한 화면이지만, 캠페인 3종과 방어 수준이 다릅니다.
- **상단 고정 제한의 실패 응답이 HTML 스크립트입니다.** 리다이렉트+메시지가 아니라 `alert()` + `history.back()` 이라, 되돌아간 폼에는 입력값이 **남아 있지 않을 수 있습니다**(브라우저 bfcache 의존).
- **몰 스코프가 없습니다.** 멀티몰이 늘어나면 모든 몰이 같은 공지를 봅니다. 캠페인 3종은 전부 `mall_id` 를 걸고 있습니다.
- **삭제 확인은 프론트 `confirm()` 뿐**이며, 서버는 `DELETE FROM notices WHERE id = ?` 를 무조건 실행합니다(소프트 삭제 없음).
- **`type` 값 검증은 목록 필터에만 있습니다.** `postCreate`/`postEdit` 는 `type || 'NOTICE'` 로 받아 폼 이외의 값도 저장될 수 있습니다(`noticeController.js:86`, `154`).
- 목록에 페이지네이션이 없어 글이 쌓이면 관리자 목록이 전건 렌더됩니다.

---

*Last Updated: 2026-07-11*
