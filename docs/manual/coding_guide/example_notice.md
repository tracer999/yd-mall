# 예제: 바이브코딩으로 공지사항 기능 구현하기

이 문서는 **공지사항 기능 하나**를 예로 들어,

- 기획 → DB → 관리자 화면 → 사용자 화면 → 메뉴까지

를 바이브코딩으로 어떻게 구현할 수 있는지 **전체 스토리**로 보여 줍니다.

> 실제 이 프로젝트에는 notices 테이블과 사용자 공지 목록/상세(/notices) 가 이미 있습니다.
> 이 문서는 "공지 기능이 아직 없다"고 가정하고, 관리자 공지 CRUD 를 중심으로 설명합니다.

---

## 1. Step 0 – 무엇을 만들지 한 줄로 정리하기

먼저 간단히 정리합니다.

> "관리자가 공지사항을 등록·수정·삭제할 수 있고,
>  사용자는 /notices 에서 공지 목록과 상세를 볼 수 있게 하고 싶다."

이 문장 그대로를 시작 프롬프트로 사용합니다.

> "Node.js + Express + MySQL8 + EJS 로 만든 쇼핑몰 프로젝트야.
>  관리자가 공지사항을 등록·수정·삭제할 수 있고,
>  사용자는 /notices 에서 공지 목록과 상세를 볼 수 있게 하고 싶어.
>  이 프로젝트 구조(app.js + routes/ + controllers/ + views/, 관리자 기능은 routes/admin/, controllers/admin/)에 맞춰,
>  DB → 관리자 → 사용자 → 관리자 메뉴 순서로 단계별로 같이 만들어 보자."

AI가 전체 흐름을 개략적으로 설명해 줄 것입니다.

---

## 2. Step 1 – DB 테이블 설계/생성

### 2-1. 필드(컬럼) 생각해 보기

공지사항에 어떤 정보가 필요할지 먼저 적어 봅니다.

- 제목(title)
- 내용(content)
- 중요도(importance, 예: 0=일반, 1=중요)
- 조회수(view_count)
- 작성일(created_at)

### 2-2. 바이브코딩 프롬프트 예시

> "MySQL 8 을 쓰는 쇼핑몰 프로젝트야. 공지사항을 저장할 notices 테이블을 만들고 싶어.
>  컬럼은 id(자동증가 PK), title(varchar 255), content(text), importance(tinyint 1, 기본 0), view_count(int, 기본 0), created_at(timestamp) 정도면 될 것 같아.
>  이 프로젝트의 tables.sql 스타일에 맞춰 CREATE TABLE 문을 작성해줘."

AI가 제안한 SQL 을 tables.sql 에 추가하거나 DB 에 직접 실행합니다.

> 이미 notices 테이블이 있다면, **있는 구조를 기준으로** 다음 단계를 진행하면 됩니다.

---

## 3. Step 2 – 관리자 컨트롤러 만들기

관리자용 공지 관리 코드는 controllers/admin/noticeController.js 에 둔다고 가정하겠습니다.

### 3-1. 어떤 화면이 필요한지 정리

관리자 입장에서 필요한 행동은 보통 다음과 같습니다.

1. 공지 목록 보기 (리스트)
2. 공지 새로 등록 (등록 폼 + 저장)
3. 기존 공지 수정 (수정 폼 + 저장)
4. 공지 삭제 (또는 숨기기)

### 3-2. 바이브코딩 프롬프트 예시

> "controllers/admin/noticeController.js 파일을 새로 만들고 싶어.
>  이 프로젝트는 controllers/admin/bannerController.js 와 controllers/admin/inquiryController.js 처럼 관리자가 CRUD 할 수 있는 컨트롤러들이 있어.
>  notices 테이블을 대상으로 다음 함수를 만들어줘.
>  - getList: 전체 공지를 최신순으로 조회해서 관리자 목록 뷰에 넘김
>  - getForm: 새 공지 등록 폼
>  - postCreate: 새 공지 INSERT
>  - getEdit: 특정 id 의 공지를 조회해서 수정 폼에 넘김
>  - postUpdate: 특정 id 공지 UPDATE
>  - postDelete: 특정 id 공지 삭제(또는 is_deleted=1 로 soft delete)
>  DB 연결은 config/db.js 의 mysql2/promise pool 을 써줘.
>  코드 스타일과 에러 처리, res.render 방식은 bannerController 패턴을 최대한 따라줘."

이렇게 요청하면 AI가 테이블 구조에 맞는 SQL 과 함께 컨트롤러 코드를 작성해 줍니다.

---

## 4. Step 3 – 관리자 라우터 연결(routes/admin/notices.js)

컨트롤러만 있어서는 쓸 수 없으니, **URL을 컨트롤러에 연결**합니다.

### 4-1. 필요한 주소 설계

- GET /admin/notices – 목록
- GET /admin/notices/new – 새 공지 등록 폼
- POST /admin/notices – 등록 처리
- GET /admin/notices/:id/edit – 수정 폼
- POST /admin/notices/:id – 수정 처리
- POST /admin/notices/:id/delete – 삭제 처리

### 4-2. 바이브코딩 프롬프트 예시

> "routes/admin/notices.js 파일을 새로 만들고 싶어.
>  Express Router 를 쓰고, 다음 라우트를 정의해줘.
>  - GET /       → noticeController.getList
>  - GET /new    → noticeController.getForm
>  - POST /      → noticeController.postCreate
>  - GET /:id/edit → noticeController.getEdit
>  - POST /:id   → noticeController.postUpdate
>  - POST /:id/delete → noticeController.postDelete
>  routes/admin/banners.js 의 패턴을 참고해서 작성해줘."

그리고 routes/admin.js 에 이 라우터를 붙이도록 요청합니다.

> "routes/admin.js 에 /admin/notices 는 routes/admin/notices.js 를 쓰게 연결해줘.
>  products, banners 가 연결된 부분을 참고해서 require 와 use 를 추가해줘.
>  필요하다면 requireAdminAuth 나 메뉴 권한 체크도 같이 달아줘."

---

## 5. Step 4 – 관리자 뷰(EJS) 만들기

이제 관리자용 화면을 만듭니다.

### 5-1. 목록 화면(list.ejs)

> "views/admin/notices/list.ejs 파일을 만들고 싶어.
>  layout 은 layouts/admin_layout 을 사용하고,
>  컨트롤러에서 notices 배열을 넘겨준다고 가정해줘.
>  테이블에는 제목, 중요도, 조회수, 작성일, 수정/삭제 버튼을 보여주고,
>  상단에는 '공지 등록' 버튼이 있어서 /admin/notices/new 로 이동하게 해줘.
>  views/admin/banners/list.ejs 의 구조와 클래스를 최대한 맞춰줘."

### 5-2. 등록/수정 폼(form.ejs)

> "views/admin/notices/form.ejs 를 만들어줘.
>  layout 은 layouts/admin_layout.
>  title, content(textarea), importance(셀렉트 또는 체크박스) 입력 필드를 넣고,
>  신규 등록과 수정 모두에 사용할 수 있도록, notice 객체가 있을 때/없을 때를 구분해서 value 를 채워줘.
>  views/admin/banners/form.ejs 를 참고해서 비슷한 UX 로 만들어줘."

이렇게 하면, 관리자 공지 등록/수정 화면이 완성됩니다.

---

## 6. Step 5 – 사용자 쪽 공지 목록/상세

사용자 사이트에서는 보통 다음 두 가지만 있으면 충분합니다.

- /notices – 공지 목록
- /notices/:id – 공지 상세

이미 구현되어 있지 않다고 가정하고, 다음처럼 요청할 수 있습니다.

> "routes/notices.js, controllers/noticeController.js 파일을 새로 만들고 싶어.
>  GET / (목록) 과 GET /:id (상세) 를 구현해줘.
>  목록은 notices 테이블에서 is_deleted = 0 인 공지만 중요도, 작성일 역순으로 조회해서 views/user/notices/list.ejs 로 렌더링하고,
>  상세는 id 로 한 건 조회하면서 view_count 를 1 증가시키고 views/user/notices/detail.ejs 로 렌더링해줘.
>  이 프로젝트의 MVC 구조에 맞게 작성해줘."

뷰도 비슷하게 요청합니다.

> "views/user/notices/list.ejs 와 detail.ejs 를 만들어줘.
>  layout 은 layouts/main_layout 을 쓰고, Tailwind 클래스를 사용해서 심플한 리스트/상세 화면을 구성해줘.
>  다른 사용자 페이지(예: products 목록)와 톤을 맞춰줘."

---

## 7. Step 6 – 관리자 메뉴에 "공지사항" 추가

관리자 화면에서 새 기능은 **메뉴에 보이지 않으면 접근하기 어렵습니다.**

이 프로젝트는 관리자 메뉴를 admin_menus 테이블로 관리합니다.

> "이 프로젝트에서 관리자 메뉴는 admin_menus 테이블과 관련 화면으로 관리해.
>  공지사항 메뉴를 /admin/notices 로 연결하고 싶어.
>  적당한 name, path, display_order, icon_class 를 사용하는 INSERT SQL 예시를 만들어줘."

또는 관리자 메뉴 관리 화면에서 직접 추가할 수 있다면,

> "관리자 메뉴 관리 화면에서 '공지사항' 메뉴를 추가하려고 해.
>  어떤 필드에 무엇을 입력해야 /admin/notices 로 연결되는지, 이 프로젝트 구조를 기준으로 설명해줘."

라고 요청합니다.

---

## 8. Step 7 – 테스트 & 에러 해결

이제 전체 흐름을 실제로 확인합니다.

1. 관리자 로그인
2. 관리자 메뉴에서 "공지사항" 클릭 → 목록 페이지 열리는지 확인
3. "공지 등록" 버튼으로 새 공지 작성 → 목록에 잘 보이는지
4. 수정/삭제 버튼도 각각 한 번씩 테스트
5. 사용자 사이트 /notices 와 /notices/:id 에서도 목록/상세가 잘 보이는지 확인

### 8-1. 에러가 났을 때 프롬프트 패턴

> "방금 /admin/notices 페이지에 접속했더니 에러가 났어.
>  에러 메시지는 다음과 같아. (여기에 에러 전문 붙이기)
>  오늘 controllers/admin/noticeController.js, routes/admin/notices.js, views/admin/notices/*.ejs 파일을 새로 만들었어.
>  이 에러의 원인과 수정 방법을 알려줘."

에러 메시지 전체 + 어떤 URL에서 + 어떤 파일을 수정했는지 세 가지를 꼭 함께 알려 주세요.

---

## 9. 전체 구현 흐름 시각화

### 9-1. 관리자가 공지를 등록하면 사용자에게 보이기까지

아래 다이어그램은 관리자가 공지를 작성한 뒤, 사용자가 해당 공지를 열람하는 전체 흐름을 보여 줍니다.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        관리자 공지 등록 흐름                             │
└─────────────────────────────────────────────────────────────────────────┘

  [관리자 브라우저]
       │
       │ 1) GET /admin/notices/new
       ▼
  ┌──────────────────┐     require     ┌──────────────────────────────────┐
  │ routes/admin/    │ ──────────────► │ controllers/admin/               │
  │  notices.js      │                 │  noticeController.js             │
  │  (라우터)         │                 │  → getForm()                     │
  └──────────────────┘                 └──────────┬───────────────────────┘
                                                  │ res.render(...)
                                                  ▼
                                       ┌──────────────────────────────────┐
                                       │ views/admin/notices/form.ejs     │
                                       │ (등록/수정 폼 화면)                │
                                       └──────────────────────────────────┘
                                                  │
                                                  │ 2) 관리자가 제목·내용 입력 후 "저장" 클릭
                                                  ▼
  ┌──────────────────┐     require     ┌──────────────────────────────────┐
  │ routes/admin/    │ ──────────────► │ controllers/admin/               │
  │  notices.js      │                 │  noticeController.js             │
  │  POST /          │                 │  → postCreate()                  │
  └──────────────────┘                 └──────────┬───────────────────────┘
                                                  │ INSERT INTO notices ...
                                                  ▼
                                       ┌──────────────────────────────────┐
                                       │         MySQL (notices 테이블)    │
                                       │  새 행 저장 완료                   │
                                       └──────────┬───────────────────────┘
                                                  │ redirect → /admin/notices
                                                  ▼
                                       ┌──────────────────────────────────┐
                                       │ 관리자 공지 목록 페이지             │
                                       │ (방금 등록한 공지가 보임)            │
                                       └──────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────┐
│                       사용자 공지 열람 흐름                               │
└─────────────────────────────────────────────────────────────────────────┘

  [사용자 브라우저]
       │
       │ 1) GET /notices
       ▼
  ┌──────────────────┐     require     ┌──────────────────────────────────┐
  │ routes/           │ ──────────────► │ controllers/                     │
  │  notices.js       │                 │  noticeController.js             │
  │  GET /            │                 │  → getList()                     │
  └──────────────────┘                 └──────────┬───────────────────────┘
                                                  │ SELECT * FROM notices
                                                  │ WHERE is_deleted = 0
                                                  ▼
                                       ┌──────────────────────────────────┐
                                       │         MySQL (notices 테이블)    │
                                       └──────────┬───────────────────────┘
                                                  │ 결과 배열 → res.render
                                                  ▼
                                       ┌──────────────────────────────────┐
                                       │ views/user/notices/list.ejs      │
                                       │ (공지 목록 화면)                   │
                                       └──────────────────────────────────┘
                                                  │
                                                  │ 2) 사용자가 제목 클릭
                                                  │    GET /notices/:id
                                                  ▼
                                       ┌──────────────────────────────────┐
                                       │ controllers/noticeController.js  │
                                       │  → getDetail()                   │
                                       │  UPDATE view_count + 1           │
                                       │  SELECT * WHERE id = :id         │
                                       └──────────┬───────────────────────┘
                                                  │ res.render
                                                  ▼
                                       ┌──────────────────────────────────┐
                                       │ views/user/notices/detail.ejs    │
                                       │ (공지 상세 화면)                   │
                                       └──────────────────────────────────┘
```

### 9-2. 파일 관계 맵 (어떤 파일이 관여하는가)

```
프로젝트 루트/
├── config/
│   └── db.js                          ← DB 커넥션 풀 (mysql2/promise)
├── controllers/
│   ├── admin/
│   │   └── noticeController.js        ← 관리자 CRUD 로직
│   └── noticeController.js            ← 사용자 목록/상세 로직
├── routes/
│   ├── admin/
│   │   └── notices.js                 ← 관리자 URL 매핑
│   ├── admin.js                       ← /admin 하위 라우터 모음 (여기에 notices 연결)
│   └── notices.js                     ← 사용자 URL 매핑
├── views/
│   ├── admin/
│   │   └── notices/
│   │       ├── list.ejs               ← 관리자 목록 화면
│   │       └── form.ejs               ← 관리자 등록/수정 폼
│   └── user/
│       └── notices/
│           ├── list.ejs               ← 사용자 목록 화면
│           └── detail.ejs             ← 사용자 상세 화면
└── sql/
    └── tables.sql                     ← notices CREATE TABLE 문
```

### 9-3. CRUD 동작별 요청 흐름 요약표

| 동작 | HTTP 메서드 & URL | 컨트롤러 함수 | SQL | 결과 |
|------|-------------------|---------------|-----|------|
| 관리자 목록 | `GET /admin/notices` | `admin/noticeController.getList` | `SELECT * FROM notices ORDER BY created_at DESC` | list.ejs 렌더링 |
| 등록 폼 | `GET /admin/notices/new` | `admin/noticeController.getForm` | 없음 | form.ejs (빈 폼) |
| 등록 처리 | `POST /admin/notices` | `admin/noticeController.postCreate` | `INSERT INTO notices (...)` | redirect → 목록 |
| 수정 폼 | `GET /admin/notices/:id/edit` | `admin/noticeController.getEdit` | `SELECT * WHERE id = ?` | form.ejs (값 채움) |
| 수정 처리 | `POST /admin/notices/:id` | `admin/noticeController.postUpdate` | `UPDATE notices SET ... WHERE id = ?` | redirect → 목록 |
| 삭제 처리 | `POST /admin/notices/:id/delete` | `admin/noticeController.postDelete` | `UPDATE notices SET is_deleted = 1 WHERE id = ?` | redirect → 목록 |
| 사용자 목록 | `GET /notices` | `noticeController.getList` | `SELECT * WHERE is_deleted = 0` | user list.ejs |
| 사용자 상세 | `GET /notices/:id` | `noticeController.getDetail` | `UPDATE view_count + 1` → `SELECT` | user detail.ejs |

---

## 10. 실제 코드 완성본 – 각 파일의 전체 코드

이 섹션에서는 공지사항 기능에 필요한 모든 파일의 프로덕션 수준 코드를 제공합니다.
바이브코딩을 통해 생성한 결과물과 비교해 보거나, 그대로 사용해도 좋습니다.

### 10-1. DB 테이블 (CREATE TABLE)

```sql
-- ============================================================
-- 공지사항 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS notices (
    id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    title       VARCHAR(255)    NOT NULL            COMMENT '공지 제목',
    content     TEXT            NOT NULL            COMMENT '공지 본문',
    importance  TINYINT(1)      NOT NULL DEFAULT 0  COMMENT '중요도 (0=일반, 1=중요)',
    view_count  INT UNSIGNED    NOT NULL DEFAULT 0  COMMENT '조회수',
    is_deleted  TINYINT(1)      NOT NULL DEFAULT 0  COMMENT '삭제 여부 (0=정상, 1=삭제)',
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '작성일',
    updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일',
    PRIMARY KEY (id),
    KEY idx_notices_deleted_importance (is_deleted, importance),
    KEY idx_notices_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='공지사항';
```

> **참고**: `is_deleted` 컬럼은 소프트 삭제를 위해 사용합니다. 실제 데이터를 지우지 않고 `is_deleted = 1` 로 전환하여 복구 가능하게 합니다.

### 10-2. 관리자 컨트롤러 (controllers/admin/noticeController.js)

```js
/**
 * 관리자 공지사항 컨트롤러
 * - 공지사항 CRUD (목록/등록/수정/삭제) 처리
 */
const pool = require('../../config/db');

/* ───────────────────────────────────────────────
   목록 조회 (GET /admin/notices)
   - 페이지네이션 포함
─────────────────────────────────────────────── */
exports.getList = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;   // 현재 페이지
        const limit = 15;                              // 한 페이지에 보여줄 개수
        const offset = (page - 1) * limit;

        // 전체 건수 조회
        const [[{ totalCount }]] = await pool.query(
            'SELECT COUNT(*) AS totalCount FROM notices WHERE is_deleted = 0'
        );
        const totalPages = Math.ceil(totalCount / limit);

        // 해당 페이지 목록 조회
        const [notices] = await pool.query(
            `SELECT id, title, importance, view_count, created_at
               FROM notices
              WHERE is_deleted = 0
              ORDER BY importance DESC, created_at DESC
              LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        res.render('admin/notices/list', {
            layout: 'layouts/admin_layout',
            notices,
            currentPage: page,
            totalPages,
            totalCount,
        });
    } catch (err) {
        console.error('공지 목록 조회 실패:', err);
        res.status(500).send('서버 오류가 발생했습니다.');
    }
};

/* ───────────────────────────────────────────────
   등록 폼 (GET /admin/notices/new)
─────────────────────────────────────────────── */
exports.getForm = (req, res) => {
    res.render('admin/notices/form', {
        layout: 'layouts/admin_layout',
        notice: null,       // 신규 등록이므로 null
        formAction: '/admin/notices',
        pageTitle: '공지사항 등록',
    });
};

/* ───────────────────────────────────────────────
   등록 처리 (POST /admin/notices)
─────────────────────────────────────────────── */
exports.postCreate = async (req, res) => {
    try {
        const { title, content, importance } = req.body;

        // 필수값 검증
        if (!title || !content) {
            return res.status(400).send('제목과 내용은 필수입니다.');
        }

        await pool.query(
            `INSERT INTO notices (title, content, importance)
             VALUES (?, ?, ?)`,
            [title.trim(), content.trim(), importance ? 1 : 0]
        );

        res.redirect('/admin/notices');
    } catch (err) {
        console.error('공지 등록 실패:', err);
        res.status(500).send('서버 오류가 발생했습니다.');
    }
};

/* ───────────────────────────────────────────────
   수정 폼 (GET /admin/notices/:id/edit)
─────────────────────────────────────────────── */
exports.getEdit = async (req, res) => {
    try {
        const { id } = req.params;

        const [[notice]] = await pool.query(
            'SELECT * FROM notices WHERE id = ? AND is_deleted = 0',
            [id]
        );

        if (!notice) {
            return res.status(404).send('공지사항을 찾을 수 없습니다.');
        }

        res.render('admin/notices/form', {
            layout: 'layouts/admin_layout',
            notice,
            formAction: `/admin/notices/${id}`,
            pageTitle: '공지사항 수정',
        });
    } catch (err) {
        console.error('공지 수정 폼 조회 실패:', err);
        res.status(500).send('서버 오류가 발생했습니다.');
    }
};

/* ───────────────────────────────────────────────
   수정 처리 (POST /admin/notices/:id)
─────────────────────────────────────────────── */
exports.postUpdate = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, importance } = req.body;

        if (!title || !content) {
            return res.status(400).send('제목과 내용은 필수입니다.');
        }

        const [result] = await pool.query(
            `UPDATE notices
                SET title = ?, content = ?, importance = ?
              WHERE id = ? AND is_deleted = 0`,
            [title.trim(), content.trim(), importance ? 1 : 0, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).send('공지사항을 찾을 수 없습니다.');
        }

        res.redirect('/admin/notices');
    } catch (err) {
        console.error('공지 수정 실패:', err);
        res.status(500).send('서버 오류가 발생했습니다.');
    }
};

/* ───────────────────────────────────────────────
   삭제 처리 – 소프트 삭제 (POST /admin/notices/:id/delete)
─────────────────────────────────────────────── */
exports.postDelete = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await pool.query(
            'UPDATE notices SET is_deleted = 1 WHERE id = ? AND is_deleted = 0',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).send('공지사항을 찾을 수 없습니다.');
        }

        res.redirect('/admin/notices');
    } catch (err) {
        console.error('공지 삭제 실패:', err);
        res.status(500).send('서버 오류가 발생했습니다.');
    }
};
```

### 10-3. 관리자 라우터 (routes/admin/notices.js)

```js
/**
 * 관리자 공지사항 라우터
 * - 마운트 경로: /admin/notices
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/admin/noticeController');

// 목록
router.get('/', ctrl.getList);

// 등록 폼 (주의: /:id 보다 위에 있어야 함)
router.get('/new', ctrl.getForm);

// 등록 처리
router.post('/', ctrl.postCreate);

// 수정 폼
router.get('/:id/edit', ctrl.getEdit);

// 수정 처리
router.post('/:id', ctrl.postUpdate);

// 삭제 처리
router.post('/:id/delete', ctrl.postDelete);

module.exports = router;
```

> **주의**: `/new` 라우트는 반드시 `/:id` 계열 라우트보다 **위에** 선언해야 합니다.
> 그렇지 않으면 Express 가 "new" 를 id 파라미터로 해석합니다.

**routes/admin.js 에 연결하기:**

```js
// routes/admin.js (기존 파일에 아래 두 줄 추가)
const noticeRoutes = require('./admin/notices');
router.use('/notices', requireAdminAuth, noticeRoutes);
```

### 10-4. 사용자 컨트롤러 (controllers/noticeController.js)

```js
/**
 * 사용자 공지사항 컨트롤러
 * - 공지 목록 조회 / 상세 조회 (조회수 증가 포함)
 */
const pool = require('../config/db');

/* ───────────────────────────────────────────────
   공지 목록 (GET /notices)
   - 삭제되지 않은 공지만 표시
   - 중요 공지 우선, 최신순 정렬
   - 페이지네이션 포함
─────────────────────────────────────────────── */
exports.getList = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const offset = (page - 1) * limit;

        // 전체 건수
        const [[{ totalCount }]] = await pool.query(
            'SELECT COUNT(*) AS totalCount FROM notices WHERE is_deleted = 0'
        );
        const totalPages = Math.ceil(totalCount / limit);

        // 목록 조회
        const [notices] = await pool.query(
            `SELECT id, title, importance, view_count, created_at
               FROM notices
              WHERE is_deleted = 0
              ORDER BY importance DESC, created_at DESC
              LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        res.render('user/notices/list', {
            layout: 'layouts/main_layout',
            notices,
            currentPage: page,
            totalPages,
            totalCount,
        });
    } catch (err) {
        console.error('공지 목록 조회 실패:', err);
        res.status(500).send('서버 오류가 발생했습니다.');
    }
};

/* ───────────────────────────────────────────────
   공지 상세 (GET /notices/:id)
   - 조회수 1 증가 후 상세 내용 렌더링
─────────────────────────────────────────────── */
exports.getDetail = async (req, res) => {
    try {
        const { id } = req.params;

        // 조회수 증가
        await pool.query(
            'UPDATE notices SET view_count = view_count + 1 WHERE id = ? AND is_deleted = 0',
            [id]
        );

        // 상세 조회
        const [[notice]] = await pool.query(
            'SELECT * FROM notices WHERE id = ? AND is_deleted = 0',
            [id]
        );

        if (!notice) {
            return res.status(404).send('공지사항을 찾을 수 없습니다.');
        }

        // 이전글 / 다음글
        const [[prevNotice]] = await pool.query(
            `SELECT id, title FROM notices
              WHERE is_deleted = 0 AND id < ?
              ORDER BY id DESC LIMIT 1`,
            [id]
        );
        const [[nextNotice]] = await pool.query(
            `SELECT id, title FROM notices
              WHERE is_deleted = 0 AND id > ?
              ORDER BY id ASC LIMIT 1`,
            [id]
        );

        res.render('user/notices/detail', {
            layout: 'layouts/main_layout',
            notice,
            prevNotice: prevNotice || null,
            nextNotice: nextNotice || null,
        });
    } catch (err) {
        console.error('공지 상세 조회 실패:', err);
        res.status(500).send('서버 오류가 발생했습니다.');
    }
};
```

### 10-5. 사용자 라우터 (routes/notices.js)

```js
/**
 * 사용자 공지사항 라우터
 * - 마운트 경로: /notices
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/noticeController');

// 공지 목록
router.get('/', ctrl.getList);

// 공지 상세
router.get('/:id', ctrl.getDetail);

module.exports = router;
```

**app.js 에 연결하기:**

```js
// app.js (기존 파일에 아래 두 줄 추가)
const noticeRoutes = require('./routes/notices');
app.use('/notices', noticeRoutes);
```

### 10-6. 관리자 뷰 – 목록 (views/admin/notices/list.ejs)

```html
<!-- views/admin/notices/list.ejs -->
<div class="p-6">
    <!-- 페이지 헤더 -->
    <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-gray-800">공지사항 관리</h1>
        <a href="/admin/notices/new"
           class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            + 공지 등록
        </a>
    </div>

    <!-- 전체 건수 -->
    <p class="text-sm text-gray-500 mb-4">전체 <strong><%= totalCount %></strong>건</p>

    <!-- 목록 테이블 -->
    <div class="bg-white rounded-xl shadow overflow-hidden">
        <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-600 uppercase text-xs">
                <tr>
                    <th class="px-4 py-3 text-left w-16">번호</th>
                    <th class="px-4 py-3 text-left">제목</th>
                    <th class="px-4 py-3 text-center w-24">중요도</th>
                    <th class="px-4 py-3 text-center w-24">조회수</th>
                    <th class="px-4 py-3 text-center w-32">작성일</th>
                    <th class="px-4 py-3 text-center w-40">관리</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
                <% if (notices.length === 0) { %>
                    <tr>
                        <td colspan="6" class="px-4 py-8 text-center text-gray-400">
                            등록된 공지사항이 없습니다.
                        </td>
                    </tr>
                <% } %>
                <% notices.forEach(notice => { %>
                    <tr class="hover:bg-gray-50 transition">
                        <td class="px-4 py-3 text-gray-500"><%= notice.id %></td>
                        <td class="px-4 py-3 font-medium text-gray-800">
                            <% if (notice.importance === 1) { %>
                                <span class="inline-block bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded mr-2">중요</span>
                            <% } %>
                            <%= notice.title %>
                        </td>
                        <td class="px-4 py-3 text-center">
                            <% if (notice.importance === 1) { %>
                                <span class="text-red-600 font-semibold">중요</span>
                            <% } else { %>
                                <span class="text-gray-400">일반</span>
                            <% } %>
                        </td>
                        <td class="px-4 py-3 text-center text-gray-600"><%= notice.view_count %></td>
                        <td class="px-4 py-3 text-center text-gray-500">
                            <%= new Date(notice.created_at).toLocaleDateString('ko-KR') %>
                        </td>
                        <td class="px-4 py-3 text-center space-x-2">
                            <a href="/admin/notices/<%= notice.id %>/edit"
                               class="text-blue-600 hover:text-blue-800 text-xs font-medium">수정</a>
                            <form action="/admin/notices/<%= notice.id %>/delete" method="POST"
                                  class="inline" onsubmit="return confirm('정말 삭제하시겠습니까?');">
                                <button type="submit"
                                        class="text-red-500 hover:text-red-700 text-xs font-medium">삭제</button>
                            </form>
                        </td>
                    </tr>
                <% }); %>
            </tbody>
        </table>
    </div>

    <!-- 페이지네이션 -->
    <% if (totalPages > 1) { %>
        <div class="flex justify-center mt-6 space-x-1">
            <% if (currentPage > 1) { %>
                <a href="?page=<%= currentPage - 1 %>"
                   class="px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">이전</a>
            <% } %>

            <% for (let p = 1; p <= totalPages; p++) { %>
                <a href="?page=<%= p %>"
                   class="px-3 py-2 rounded-lg text-sm
                          <%= p === currentPage ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100' %>">
                    <%= p %>
                </a>
            <% } %>

            <% if (currentPage < totalPages) { %>
                <a href="?page=<%= currentPage + 1 %>"
                   class="px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">다음</a>
            <% } %>
        </div>
    <% } %>
</div>
```

### 10-7. 관리자 뷰 – 폼 (views/admin/notices/form.ejs)

```html
<!-- views/admin/notices/form.ejs -->
<!-- notice 가 null 이면 신규 등록, 있으면 수정 모드 -->
<div class="p-6 max-w-3xl mx-auto">
    <h1 class="text-2xl font-bold text-gray-800 mb-6"><%= pageTitle %></h1>

    <form action="<%= formAction %>" method="POST" class="bg-white rounded-xl shadow p-6 space-y-6">

        <!-- 제목 -->
        <div>
            <label for="title" class="block text-sm font-medium text-gray-700 mb-1">제목 <span class="text-red-500">*</span></label>
            <input type="text" id="title" name="title"
                   value="<%= notice ? notice.title : '' %>"
                   required maxlength="255"
                   class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                   placeholder="공지사항 제목을 입력하세요">
        </div>

        <!-- 내용 -->
        <div>
            <label for="content" class="block text-sm font-medium text-gray-700 mb-1">내용 <span class="text-red-500">*</span></label>
            <textarea id="content" name="content"
                      rows="12" required
                      class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="공지 내용을 입력하세요"><%= notice ? notice.content : '' %></textarea>
        </div>

        <!-- 중요도 -->
        <div class="flex items-center space-x-3">
            <input type="checkbox" id="importance" name="importance" value="1"
                   <%= notice && notice.importance === 1 ? 'checked' : '' %>
                   class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
            <label for="importance" class="text-sm text-gray-700">중요 공지로 설정 (목록 상단에 고정됩니다)</label>
        </div>

        <!-- 버튼 -->
        <div class="flex items-center justify-end space-x-3 pt-4 border-t">
            <a href="/admin/notices"
               class="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition">취소</a>
            <button type="submit"
                    class="px-6 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition">
                <%= notice ? '수정 완료' : '등록하기' %>
            </button>
        </div>
    </form>
</div>
```

### 10-8. 사용자 뷰 – 목록 (views/user/notices/list.ejs)

```html
<!-- views/user/notices/list.ejs -->
<div class="max-w-4xl mx-auto px-4 py-10">
    <h1 class="text-3xl font-bold text-gray-900 mb-2">공지사항</h1>
    <p class="text-gray-500 mb-8">서비스 관련 공지 및 안내 사항을 확인하세요.</p>

    <!-- 공지 목록 -->
    <div class="bg-white rounded-xl shadow divide-y divide-gray-100">
        <% if (notices.length === 0) { %>
            <div class="px-6 py-12 text-center text-gray-400">
                등록된 공지사항이 없습니다.
            </div>
        <% } %>

        <% notices.forEach(notice => { %>
            <a href="/notices/<%= notice.id %>"
               class="block px-6 py-4 hover:bg-blue-50 transition group">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <% if (notice.importance === 1) { %>
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                                중요
                            </span>
                        <% } else { %>
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                                일반
                            </span>
                        <% } %>
                        <span class="text-gray-800 font-medium group-hover:text-blue-700 transition">
                            <%= notice.title %>
                        </span>
                    </div>
                    <div class="flex items-center space-x-4 text-xs text-gray-400">
                        <span>조회 <%= notice.view_count %></span>
                        <span><%= new Date(notice.created_at).toLocaleDateString('ko-KR') %></span>
                    </div>
                </div>
            </a>
        <% }); %>
    </div>

    <!-- 페이지네이션 -->
    <% if (totalPages > 1) { %>
        <nav class="flex justify-center mt-8 space-x-1">
            <% if (currentPage > 1) { %>
                <a href="?page=<%= currentPage - 1 %>"
                   class="px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition">
                    &laquo; 이전
                </a>
            <% } %>

            <% for (let p = 1; p <= totalPages; p++) { %>
                <a href="?page=<%= p %>"
                   class="px-3 py-2 rounded-lg text-sm font-medium transition
                          <%= p === currentPage
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-600 hover:bg-gray-100' %>">
                    <%= p %>
                </a>
            <% } %>

            <% if (currentPage < totalPages) { %>
                <a href="?page=<%= currentPage + 1 %>"
                   class="px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition">
                    다음 &raquo;
                </a>
            <% } %>
        </nav>
    <% } %>
</div>
```

### 10-9. 사용자 뷰 – 상세 (views/user/notices/detail.ejs)

```html
<!-- views/user/notices/detail.ejs -->
<div class="max-w-4xl mx-auto px-4 py-10">

    <!-- 뒤로가기 -->
    <a href="/notices" class="inline-flex items-center text-sm text-gray-500 hover:text-blue-600 mb-6 transition">
        &larr; 공지사항 목록으로
    </a>

    <!-- 공지 헤더 -->
    <div class="bg-white rounded-xl shadow p-6 mb-6">
        <div class="flex items-center space-x-3 mb-3">
            <% if (notice.importance === 1) { %>
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                    중요
                </span>
            <% } %>
            <span class="text-xs text-gray-400">
                <%= new Date(notice.created_at).toLocaleDateString('ko-KR', {
                    year: 'numeric', month: 'long', day: 'numeric'
                }) %>
            </span>
            <span class="text-xs text-gray-400">조회 <%= notice.view_count %></span>
        </div>

        <h1 class="text-2xl font-bold text-gray-900 mb-6"><%= notice.title %></h1>

        <!-- 공지 본문 -->
        <div class="prose max-w-none text-gray-700 leading-relaxed whitespace-pre-line">
            <%= notice.content %>
        </div>
    </div>

    <!-- 이전글 / 다음글 네비게이션 -->
    <div class="bg-white rounded-xl shadow divide-y divide-gray-100">
        <% if (nextNotice) { %>
            <a href="/notices/<%= nextNotice.id %>"
               class="flex items-center px-6 py-4 hover:bg-gray-50 transition">
                <span class="text-xs text-gray-400 w-16">다음글</span>
                <span class="text-sm text-gray-700"><%= nextNotice.title %></span>
            </a>
        <% } %>
        <% if (prevNotice) { %>
            <a href="/notices/<%= prevNotice.id %>"
               class="flex items-center px-6 py-4 hover:bg-gray-50 transition">
                <span class="text-xs text-gray-400 w-16">이전글</span>
                <span class="text-sm text-gray-700"><%= prevNotice.title %></span>
            </a>
        <% } %>
    </div>
</div>
```

---

## 11. 페이지네이션 구현하기

공지사항이 많아지면 한 페이지에 전부 보여 줄 수 없으므로 **페이지네이션**이 필수입니다.

### 11-1. SQL 에서의 LIMIT / OFFSET

```sql
-- page = 2, limit = 10 이면 → offset = (2-1)*10 = 10
SELECT * FROM notices
 WHERE is_deleted = 0
 ORDER BY importance DESC, created_at DESC
 LIMIT 10 OFFSET 10;
```

| 용어 | 의미 |
|------|------|
| `LIMIT` | 가져올 행 개수 (한 페이지에 보여줄 개수) |
| `OFFSET` | 건너뛸 행 개수 |
| `page` | 현재 페이지 번호 (1부터 시작) |
| `totalPages` | 전체 페이지 수 = `Math.ceil(totalCount / limit)` |

### 11-2. 컨트롤러에서의 페이지 계산 로직

```js
// 1) 요청에서 page 파라미터 추출 (기본값 1)
const page = parseInt(req.query.page) || 1;
const limit = 10;
const offset = (page - 1) * limit;

// 2) 전체 건수 조회
const [[{ totalCount }]] = await pool.query(
    'SELECT COUNT(*) AS totalCount FROM notices WHERE is_deleted = 0'
);

// 3) 전체 페이지 수 계산
const totalPages = Math.ceil(totalCount / limit);

// 4) 해당 페이지 데이터 조회
const [notices] = await pool.query(
    'SELECT * FROM notices WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [limit, offset]
);

// 5) 뷰에 전달
res.render('뷰경로', { notices, currentPage: page, totalPages, totalCount });
```

### 11-3. EJS 페이지네이션 컴포넌트

아래는 재사용 가능한 페이지네이션 UI 패턴입니다.

```html
<% if (totalPages > 1) { %>
<nav class="flex justify-center mt-8 space-x-1" aria-label="페이지네이션">
    <!-- 처음 -->
    <% if (currentPage > 1) { %>
        <a href="?page=1" class="px-3 py-2 rounded text-sm text-gray-500 hover:bg-gray-100">처음</a>
    <% } %>

    <!-- 이전 -->
    <% if (currentPage > 1) { %>
        <a href="?page=<%= currentPage - 1 %>" class="px-3 py-2 rounded text-sm text-gray-500 hover:bg-gray-100">이전</a>
    <% } %>

    <!-- 페이지 번호 (최대 5개씩 표시) -->
    <%
        const startPage = Math.max(1, currentPage - 2);
        const endPage   = Math.min(totalPages, currentPage + 2);
    %>
    <% for (let p = startPage; p <= endPage; p++) { %>
        <a href="?page=<%= p %>"
           class="px-3 py-2 rounded text-sm font-medium
                  <%= p === currentPage ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100' %>">
            <%= p %>
        </a>
    <% } %>

    <!-- 다음 -->
    <% if (currentPage < totalPages) { %>
        <a href="?page=<%= currentPage + 1 %>" class="px-3 py-2 rounded text-sm text-gray-500 hover:bg-gray-100">다음</a>
    <% } %>

    <!-- 마지막 -->
    <% if (currentPage < totalPages) { %>
        <a href="?page=<%= totalPages %>" class="px-3 py-2 rounded text-sm text-gray-500 hover:bg-gray-100">마지막</a>
    <% } %>
</nav>
<% } %>
```

### 11-4. 바이브코딩 프롬프트 – 페이지네이션 추가

> "내 공지사항 목록 컨트롤러(controllers/admin/noticeController.js 의 getList)에
>  페이지네이션 기능을 추가해줘.
>  한 페이지에 15개씩 보여주고, req.query.page 로 현재 페이지를 받아서,
>  totalCount, totalPages, currentPage 를 뷰에 넘겨줘.
>  뷰(views/admin/notices/list.ejs)에도 페이지 번호 링크를 추가해줘.
>  기존 banners/list.ejs 에서 페이지네이션 쓰는 방식이 있으면 그걸 참고해줘."

---

## 12. 검색 기능 추가하기

공지사항이 많아지면 검색 기능도 필요합니다.

### 12-1. 검색 폼 (뷰에 추가)

```html
<!-- 목록 페이지 상단에 추가 -->
<form action="/admin/notices" method="GET" class="flex items-center space-x-2 mb-6">
    <select name="searchType" class="border border-gray-300 rounded-lg px-3 py-2 text-sm">
        <option value="title" <%= searchType === 'title' ? 'selected' : '' %>>제목</option>
        <option value="content" <%= searchType === 'content' ? 'selected' : '' %>>내용</option>
        <option value="all" <%= searchType === 'all' ? 'selected' : '' %>>제목+내용</option>
    </select>
    <input type="text" name="keyword" value="<%= keyword || '' %>"
           placeholder="검색어를 입력하세요"
           class="border border-gray-300 rounded-lg px-4 py-2 text-sm w-64 focus:ring-2 focus:ring-blue-500">
    <button type="submit"
            class="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-900 transition">
        검색
    </button>
    <% if (keyword) { %>
        <a href="/admin/notices" class="text-sm text-gray-500 hover:text-gray-700">초기화</a>
    <% } %>
</form>
```

### 12-2. 컨트롤러에 검색 조건 추가

```js
exports.getList = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const offset = (page - 1) * limit;
        const keyword = req.query.keyword || '';
        const searchType = req.query.searchType || 'title';

        // 검색 조건 SQL 조립
        let whereClause = 'WHERE is_deleted = 0';
        const params = [];

        if (keyword.trim()) {
            switch (searchType) {
                case 'title':
                    whereClause += ' AND title LIKE ?';
                    params.push(`%${keyword.trim()}%`);
                    break;
                case 'content':
                    whereClause += ' AND content LIKE ?';
                    params.push(`%${keyword.trim()}%`);
                    break;
                case 'all':
                default:
                    whereClause += ' AND (title LIKE ? OR content LIKE ?)';
                    params.push(`%${keyword.trim()}%`, `%${keyword.trim()}%`);
                    break;
            }
        }

        // 전체 건수
        const [[{ totalCount }]] = await pool.query(
            `SELECT COUNT(*) AS totalCount FROM notices ${whereClause}`,
            params
        );
        const totalPages = Math.ceil(totalCount / limit);

        // 목록 조회
        const [notices] = await pool.query(
            `SELECT id, title, importance, view_count, created_at
               FROM notices ${whereClause}
              ORDER BY importance DESC, created_at DESC
              LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        res.render('admin/notices/list', {
            layout: 'layouts/admin_layout',
            notices,
            currentPage: page,
            totalPages,
            totalCount,
            keyword,
            searchType,
        });
    } catch (err) {
        console.error('공지 목록 조회 실패:', err);
        res.status(500).send('서버 오류가 발생했습니다.');
    }
};
```

### 12-3. 페이지네이션에서 검색어 유지하기

검색 후 페이지를 이동하면 검색어가 사라지는 문제를 방지합니다.

```html
<!-- 페이지네이션 링크에 검색 파라미터 포함 -->
<%
    // 현재 검색 파라미터를 쿼리스트링으로 만드는 헬퍼
    const searchParams = keyword
        ? `&searchType=${searchType}&keyword=${encodeURIComponent(keyword)}`
        : '';
%>

<a href="?page=<%= p %><%= searchParams %>"
   class="px-3 py-2 rounded text-sm ...">
    <%= p %>
</a>
```

### 12-4. 바이브코딩 프롬프트 – 검색 기능

> "공지사항 관리자 목록에 검색 기능을 추가해줘.
>  제목, 내용, 제목+내용 으로 검색할 수 있는 셀렉트박스와 텍스트 입력란을 만들고,
>  검색 결과에 페이지네이션이 적용되면서 페이지 이동 시 검색어가 유지되도록 해줘.
>  컨트롤러의 getList 와 뷰의 list.ejs 를 수정해줘."

---

## 13. 공지사항 기능 확장 아이디어

기본 공지사항 CRUD 가 완성되면, 다음과 같은 기능을 확장할 수 있습니다.
각 기능에 대한 바이브코딩 프롬프트 예시도 함께 제공합니다.

### 13-1. 파일 첨부 기능

공지에 이미지나 PDF 를 첨부할 수 있도록 합니다.

> **바이브코딩 프롬프트:**
>
> "공지사항에 파일 첨부 기능을 추가해줘.
>  multer 미들웨어를 사용해서 /uploads/notices/ 폴더에 파일을 저장하고,
>  notices 테이블에 file_name, file_path 컬럼을 추가(ALTER TABLE)해줘.
>  등록/수정 폼에 파일 업로드 input 을 넣고, 상세 화면에서 다운로드 링크를 보여줘.
>  기존 banners 의 이미지 업로드 구조를 참고해줘."

### 13-2. 중요 공지 상단 고정

이미 importance 컬럼이 있으므로, 정렬 시 중요 공지를 상단에 고정하는 것은 간단합니다.

```sql
-- ORDER BY 에서 importance DESC 를 먼저 배치
ORDER BY importance DESC, created_at DESC
```

> 이 정렬은 이미 위 코드 예제에 적용되어 있습니다.

추가로 관리자 뷰에서 **드래그로 순서를 바꾸는 기능**을 원한다면:

> "관리자 공지 목록에서 중요 공지의 표시 순서를 드래그 앤 드롭으로 변경할 수 있게 해줘.
>  notices 테이블에 sort_order 컬럼(INT, 기본 0)을 추가하고,
>  SortableJS 라이브러리를 사용해서 순서 변경 시 AJAX 로 sort_order 를 업데이트하는 API(/admin/notices/reorder)를 만들어줘."

### 13-3. 공지사항 카테고리

공지를 유형별로 분류하고 싶을 때 사용합니다.

> "notices 테이블에 category 컬럼(VARCHAR(50))을 추가해줘.
>  카테고리 목록은 '일반', '이벤트', '점검', '업데이트' 로 하고,
>  등록/수정 폼에 셀렉트박스를 넣고,
>  목록에서 카테고리별 필터링(탭 또는 드롭다운)이 가능하도록 해줘."

### 13-4. 새 공지 등록 시 이메일 알림

> "공지가 새로 등록되면 관리자에게 이메일로 알림을 보내고 싶어.
>  nodemailer 를 사용해서 config/mail.js 에 메일 설정을 만들고,
>  postCreate 함수에서 INSERT 성공 후 sendNoticeEmail() 을 호출하도록 해줘.
>  이메일 제목은 '[쇼핑몰] 새 공지사항 등록: {제목}' 형식으로 보내줘."

### 13-5. 읽음/안 읽음 추적

로그인한 사용자별로 어떤 공지를 읽었는지 추적합니다.

> "사용자별 공지 읽음 여부를 추적하고 싶어.
>  notice_reads 테이블(notice_id, user_id, read_at)을 만들고,
>  사용자가 공지 상세를 열 때 읽음 기록을 INSERT 해줘.
>  공지 목록에서 아직 안 읽은 공지 옆에 'NEW' 뱃지를 보여주도록 해줘.
>  로그인하지 않은 사용자는 무시하면 돼."

---

## 14. 흔한 에러와 해결법 TOP 7

공지사항 기능 구현 중 가장 자주 마주치는 에러를 정리했습니다.

### 에러 1: 테이블이 존재하지 않음

```
Error: ER_NO_SUCH_TABLE: Table 'mydb.notices' doesn't exist
```

| 항목 | 내용 |
|------|------|
| **원인** | CREATE TABLE 문을 아직 실행하지 않았거나, 테이블명이 다릅니다 (예: `notice` vs `notices`). |
| **해결** | MySQL 에서 `SHOW TABLES LIKE 'notices';` 로 확인하고, 없으면 CREATE TABLE 을 실행합니다. |
| **바이브코딩** | "notices 테이블이 없다는 에러가 나. CREATE TABLE SQL 을 보여줘." |

### 에러 2: 컬럼명 불일치

```
Error: ER_BAD_FIELD_ERROR: Unknown column 'is_deleted' in 'where clause'
```

| 항목 | 내용 |
|------|------|
| **원인** | SQL 에서 사용하는 컬럼명이 실제 테이블의 컬럼명과 다릅니다. |
| **해결** | `DESCRIBE notices;` 로 실제 컬럼명을 확인하고, 컨트롤러의 SQL 을 맞춥니다. |
| **바이브코딩** | "notices 테이블에 is_deleted 컬럼이 없어. ALTER TABLE 로 추가해줘." |

### 에러 3: 뷰 파일을 찾을 수 없음 (경로 오류)

```
Error: Failed to lookup view "admin/notices/list" in views directory "/app/views"
```

| 항목 | 내용 |
|------|------|
| **원인** | `res.render()` 에 지정한 경로에 ejs 파일이 없습니다. 폴더 이름 오타, 대소문자 문제 등. |
| **해결** | `views/admin/notices/` 폴더가 존재하는지, 파일명이 일치하는지 확인합니다. |
| **체크** | 폴더 경로에 오타가 없는지 확인: `notice` vs `notices`, `admin` 폴더 안에 있는지 등. |

### 에러 4: 레이아웃이 로드되지 않음

```
TypeError: Cannot read properties of undefined (reading 'title')
```

또는 화면이 레이아웃 없이 내용만 렌더링되는 경우.

| 항목 | 내용 |
|------|------|
| **원인** | `res.render()` 에서 `layout` 옵션을 누락했거나, 레이아웃 경로가 잘못되었습니다. |
| **해결** | 컨트롤러에서 `layout: 'layouts/admin_layout'` 을 정확히 지정합니다. |
| **확인** | `views/layouts/admin_layout.ejs` 파일이 실제로 존재하는지 확인합니다. |

### 에러 5: 폼 데이터가 컨트롤러에 도달하지 않음

```js
// req.body 가 undefined 또는 빈 객체
console.log(req.body); // → {} 또는 undefined
```

| 항목 | 내용 |
|------|------|
| **원인 1** | `app.js` 에 `express.urlencoded({ extended: true })` 미들웨어가 빠져 있습니다. |
| **원인 2** | form 태그의 `method` 가 "GET" 으로 되어 있거나, `action` URL 이 잘못되었습니다. |
| **원인 3** | input 의 `name` 속성이 빠져 있습니다. |
| **해결** | app.js 에 `app.use(express.urlencoded({ extended: true }));` 가 있는지 확인하고, form 의 method="POST" 와 input 의 name 속성을 점검합니다. |

### 에러 6: 등록/수정 후 리다이렉트 무한 루프

```
ERR_TOO_MANY_REDIRECTS
```

| 항목 | 내용 |
|------|------|
| **원인** | POST 처리 후 `res.redirect()` 대상 URL 이 다시 POST 를 트리거하는 구조이거나, 라우터 순서 문제로 잘못된 핸들러가 실행됩니다. |
| **해결** | `res.redirect('/admin/notices')` 처럼 GET 목록 페이지로 리다이렉트하고 있는지 확인합니다. 라우터의 순서도 점검합니다. |

### 에러 7: 삭제가 동작하지 않음 (METHOD 문제)

```
Cannot GET /admin/notices/3/delete
```

| 항목 | 내용 |
|------|------|
| **원인** | 삭제 버튼이 `<a>` 태그로 되어 있어 GET 요청을 보내지만, 라우터는 POST 로 정의되어 있습니다. |
| **해결** | 삭제는 반드시 `<form method="POST">` 안의 `<button>` 으로 요청합니다. 또는 라우터를 GET 으로 바꾸되 보안상 추천하지 않습니다. |
| **올바른 코드** | 아래와 같이 인라인 form 을 사용합니다. |

```html
<form action="/admin/notices/<%= notice.id %>/delete" method="POST"
      class="inline" onsubmit="return confirm('정말 삭제하시겠습니까?');">
    <button type="submit" class="text-red-500 hover:text-red-700">삭제</button>
</form>
```

---

## 15. 테스트 체크리스트

구현이 끝나면 아래 체크리스트로 모든 기능을 하나씩 확인합니다.

### 15-1. 관리자 – 공지 등록

| 번호 | 테스트 항목 | 확인 |
|------|------------|------|
| 1 | `/admin/notices/new` 에 접속하면 빈 등록 폼이 보인다 | [ ] |
| 2 | 제목과 내용을 입력하고 "등록하기" 를 누르면 목록으로 이동한다 | [ ] |
| 3 | 방금 등록한 공지가 목록 상단에 보인다 | [ ] |
| 4 | 제목 없이 등록하면 에러 메시지가 나온다 (또는 required 로 막힌다) | [ ] |
| 5 | "중요 공지" 체크 후 등록하면 목록에서 중요 뱃지가 보인다 | [ ] |

### 15-2. 관리자 – 공지 수정

| 번호 | 테스트 항목 | 확인 |
|------|------------|------|
| 1 | 목록에서 "수정" 을 클릭하면 폼에 기존 값이 채워져 있다 | [ ] |
| 2 | 제목을 변경하고 저장하면 목록에서 변경된 제목이 보인다 | [ ] |
| 3 | 중요도를 변경(체크 해제 등)하면 반영된다 | [ ] |
| 4 | 존재하지 않는 id 로 접근하면 404 또는 에러 페이지가 나온다 | [ ] |

### 15-3. 관리자 – 공지 삭제

| 번호 | 테스트 항목 | 확인 |
|------|------------|------|
| 1 | "삭제" 를 클릭하면 확인 다이얼로그가 뜬다 | [ ] |
| 2 | 확인을 누르면 해당 공지가 목록에서 사라진다 | [ ] |
| 3 | DB 에서 `is_deleted = 1` 로 되어 있다 (데이터가 실제로 지워지지 않았다) | [ ] |
| 4 | 삭제된 공지는 사용자 목록에도 안 보인다 | [ ] |

### 15-4. 사용자 – 공지 목록

| 번호 | 테스트 항목 | 확인 |
|------|------------|------|
| 1 | `/notices` 에 접속하면 공지 목록이 보인다 | [ ] |
| 2 | 중요 공지에 "중요" 뱃지가 표시된다 | [ ] |
| 3 | 중요 공지가 일반 공지보다 위에 표시된다 | [ ] |
| 4 | 삭제된 공지(is_deleted = 1)는 목록에 안 보인다 | [ ] |
| 5 | 페이지네이션이 정상 작동한다 (다음 페이지 이동, 돌아오기) | [ ] |

### 15-5. 사용자 – 공지 상세

| 번호 | 테스트 항목 | 확인 |
|------|------------|------|
| 1 | 목록에서 제목을 클릭하면 상세 화면이 보인다 | [ ] |
| 2 | 조회수가 1 증가한다 (새로고침하면 다시 증가) | [ ] |
| 3 | 이전글 / 다음글 링크가 동작한다 | [ ] |
| 4 | 존재하지 않는 id 로 접근하면 404 처리된다 | [ ] |
| 5 | "목록으로" 링크를 누르면 `/notices` 로 돌아간다 | [ ] |

### 15-6. 엣지 케이스

| 번호 | 테스트 항목 | 확인 |
|------|------------|------|
| 1 | 공지가 0건일 때 "등록된 공지가 없습니다" 메시지가 보인다 | [ ] |
| 2 | 제목에 특수문자(`<script>`, `'`, `"`)를 넣어도 정상 표시된다 (XSS 방지) | [ ] |
| 3 | 아주 긴 제목(255자)을 등록할 수 있다 | [ ] |
| 4 | 내용에 줄바꿈을 넣으면 상세에서도 줄바꿈이 보인다 | [ ] |
| 5 | 비로그인 상태에서 `/admin/notices` 접근 시 로그인 페이지로 리다이렉트된다 | [ ] |
| 6 | URL 에 없는 page 번호(?page=9999)를 넣으면 빈 목록이 보인다 (에러 아님) | [ ] |

---

## 16. FAQ – 자주 묻는 질문들

### Q1. 소프트 삭제(is_deleted)와 하드 삭제(DELETE FROM) 중 어떤 것을 써야 하나요?

**소프트 삭제를 권장합니다.** 실수로 삭제해도 복구할 수 있고, 삭제 이력이 남습니다.
하드 삭제는 데이터가 영구적으로 사라지므로, 정말 필요한 경우(개인정보 완전 삭제 등)에만 사용합니다.

```sql
-- 소프트 삭제: 데이터는 남아 있고, is_deleted 플래그만 변경
UPDATE notices SET is_deleted = 1 WHERE id = 5;

-- 하드 삭제: 데이터 영구 삭제 (복구 불가)
DELETE FROM notices WHERE id = 5;
```

### Q2. 리치 텍스트 에디터(위지윅)를 추가하려면 어떻게 하나요?

공지 내용에 글꼴, 이미지, 표 등을 넣고 싶다면 위지윅 에디터를 연동합니다.
대표적인 라이브러리로 **TinyMCE**, **CKEditor**, **Toast UI Editor** 가 있습니다.

> **바이브코딩 프롬프트:**
>
> "공지사항 등록/수정 폼의 content textarea 를 Toast UI Editor 로 교체해줘.
>  CDN 을 사용해서 admin_layout 에 스크립트를 추가하고,
>  폼 제출 시 에디터 내용을 textarea 의 value 로 넣어서 서버에 전달하는 방식으로 해줘.
>  사용자 상세 화면에서는 HTML 로 렌더링해줘."

주의: 위지윅 에디터로 HTML 을 저장하면, 상세 뷰에서 `<%- notice.content %>` (이스케이프 안 함)로 출력해야 합니다. 이때 **XSS 공격**에 취약해질 수 있으므로 `DOMPurify` 같은 서버 측 새니타이저를 함께 사용하세요.

### Q3. 공지 내용이 매우 길 때(대용량 텍스트) 어떻게 처리하나요?

MySQL 의 `TEXT` 타입은 약 65,535 바이트(약 16,000자 한글)까지 저장 가능합니다.
그보다 긴 내용이 필요하면 `MEDIUMTEXT`(약 1,600만 자) 또는 `LONGTEXT` 를 사용합니다.

```sql
ALTER TABLE notices MODIFY COLUMN content MEDIUMTEXT NOT NULL;
```

목록에서는 내용 전체를 불러올 필요가 없으므로, 컬럼 선택을 명시합니다.

```sql
-- 목록 조회 시 content 제외 (성능 향상)
SELECT id, title, importance, view_count, created_at
  FROM notices WHERE is_deleted = 0;
```

### Q4. 관리자만 볼 수 있는 공지를 만들고 싶어요.

`notices` 테이블에 `visibility` 컬럼을 추가합니다.

```sql
ALTER TABLE notices ADD COLUMN visibility VARCHAR(20) NOT NULL DEFAULT 'public'
    COMMENT '공개범위(public=모두, admin=관리자만)';
```

사용자 쪽 공지 목록에서는 `WHERE visibility = 'public'` 조건을 추가합니다.

### Q5. 공지에 작성자(작성 관리자)를 기록하려면?

`notices` 테이블에 `admin_id` 컬럼을 추가하고, 등록 시 로그인된 관리자의 ID 를 저장합니다.

```sql
ALTER TABLE notices ADD COLUMN admin_id INT UNSIGNED DEFAULT NULL COMMENT '작성 관리자 ID';
```

```js
// postCreate 에서
const adminId = req.session.admin?.id || null;
await pool.query(
    'INSERT INTO notices (title, content, importance, admin_id) VALUES (?, ?, ?, ?)',
    [title, content, importance ? 1 : 0, adminId]
);
```

### Q6. 공지사항에 이미지를 본문에 삽입하려면?

두 가지 접근법이 있습니다.

1. **위지윅 에디터 + 이미지 업로드 API**: 에디터에서 이미지를 삽입하면 서버에 업로드하고, URL 을 본문 HTML 에 포함합니다.
2. **마크다운 + 이미지 URL**: 마크다운으로 작성하고 `![alt](이미지URL)` 형식으로 이미지를 넣습니다.

위지윅 에디터 방식이 관리자에게 더 직관적입니다.

### Q7. 공지사항 목록 API(JSON)를 만들고 싶어요.

모바일 앱이나 SPA 프론트엔드에서 사용할 REST API 가 필요한 경우입니다.

```js
// routes/api/notices.js
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const offset = (page - 1) * limit;

        const [[{ totalCount }]] = await pool.query(
            'SELECT COUNT(*) AS totalCount FROM notices WHERE is_deleted = 0'
        );
        const [notices] = await pool.query(
            `SELECT id, title, importance, view_count, created_at
               FROM notices WHERE is_deleted = 0
              ORDER BY importance DESC, created_at DESC
              LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        res.json({
            success: true,
            data: notices,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit),
                totalCount,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});
```

### Q8. 한 페이지에 보여줄 개수(limit)를 사용자가 선택하게 하려면?

```html
<!-- 목록 상단에 추가 -->
<select onchange="location.href='?page=1&limit=' + this.value">
    <option value="10" <%= limit == 10 ? 'selected' : '' %>>10개씩</option>
    <option value="20" <%= limit == 20 ? 'selected' : '' %>>20개씩</option>
    <option value="50" <%= limit == 50 ? 'selected' : '' %>>50개씩</option>
</select>
```

컨트롤러에서는 아래와 같이 처리합니다.

```js
const allowedLimits = [10, 20, 50];
const limit = allowedLimits.includes(parseInt(req.query.limit))
    ? parseInt(req.query.limit)
    : 10;
```

> **보안 주의**: 사용자가 임의로 limit=99999 를 보낼 수 있으므로, 반드시 허용 목록으로 제한합니다.

---

## 17. 전체 흐름 요약 및 다음 단계

### 17-1. 전체 흐름 요약

공지사항 기능 하나를 기준으로 정리하면, 바이브코딩 워크플로우는 이렇게 됩니다.

1. **기획**: 기능 한 줄 요약 (관리자/사용자 관점 정리)
2. **DB**: 테이블/컬럼 설계 및 CREATE TABLE 또는 ALTER TABLE
3. **관리자 컨트롤러**: 목록/등록/수정/삭제 함수 작성
4. **관리자 라우터**: /admin/notices 이하 URL 과 컨트롤러 연결
5. **관리자 뷰**: 목록/폼 EJS 템플릿 작성
6. **사용자 라우터/뷰**: /notices 목록/상세 구현
7. **메뉴 연결**: admin_menus 또는 뷰에서 메뉴/링크 추가
8. **테스트 & 에러 해결**: 실제로 눌러 보고, 에러를 AI와 함께 고치기

이 예제를 한 번 끝까지 따라가 보면, 이후에는 **이벤트 배너, FAQ, 팝업, 태그 관리** 등 거의 모든 백오피스 기능을 같은 패턴으로 바이브코딩할 수 있습니다.

### 17-2. 이 문서에서 다룬 핵심 내용

| 섹션 | 핵심 내용 |
|------|----------|
| 1~8 | 바이브코딩으로 공지 기능을 단계별로 구현하는 프롬프트 가이드 |
| 9 | 전체 구현 흐름을 ASCII 다이어그램으로 시각화 |
| 10 | 모든 파일(DB, 컨트롤러, 라우터, 뷰)의 완성 코드 |
| 11 | 페이지네이션 원리와 구현 |
| 12 | 검색 기능 추가 방법 |
| 13 | 파일첨부, 카테고리, 알림 등 확장 아이디어 |
| 14 | 자주 발생하는 에러 7가지와 해결법 |
| 15 | CRUD 테스트 체크리스트 |
| 16 | FAQ (소프트 삭제, 위지윅, API 등) |

### 17-3. 관련 가이드 참고

이 프로젝트의 다른 코딩 가이드도 함께 읽어 보면, 전체 개발 역량을 높이는 데 도움이 됩니다.

- **[Express 기반 라이브러리 가이드](./express_libs.md)** – 이 프로젝트에서 사용하는 Express, mysql2, multer 등 주요 라이브러리 설명
- **[Node.js 코딩 가이드](./nodejs.md)** – async/await, 에러 처리, 프로젝트 구조 등 Node.js 코딩 컨벤션

### 17-4. 다음 단계 – 이 패턴을 다른 기능에 적용하기

공지사항과 동일한 패턴으로 만들 수 있는 기능 리스트입니다.
각 기능별로 Step 0 의 한 줄 요약만 바꾸면, 나머지 흐름은 거의 같습니다.

| 기능 | Step 0 한 줄 요약 | 테이블 |
|------|-------------------|--------|
| FAQ 관리 | "관리자가 자주 묻는 질문을 등록하고, 사용자는 /faq 에서 목록을 볼 수 있게" | `faqs` |
| 이벤트 배너 | "관리자가 이벤트 배너를 등록(이미지 포함)하고, 메인 페이지에 표시" | `banners` |
| 팝업 관리 | "관리자가 팝업을 등록하고, 사용자에게 기간 내에만 노출" | `popups` |
| 1:1 문의 | "사용자가 문의를 작성하면, 관리자가 답변" | `inquiries` |
| 리뷰 관리 | "사용자가 작성한 상품 리뷰를 관리자가 승인/삭제" | `reviews` |

각 기능의 바이브코딩 프롬프트 구조는 다음과 같이 공통화할 수 있습니다.

```
"Node.js + Express + MySQL8 + EJS 로 만든 쇼핑몰 프로젝트야.
 {기능 한 줄 설명}.
 이 프로젝트 구조(app.js + routes/ + controllers/ + views/)에 맞춰,
 DB → 관리자 → 사용자 → 메뉴 순서로 단계별로 같이 만들어 보자."
```

이것이 바이브코딩의 핵심입니다. **패턴을 이해하면, 무엇이든 만들 수 있습니다.**
