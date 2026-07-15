# 바이브코딩(Vibe Coding) – AI와 같이 개발하는 방법

이 문서는 **비개발자 / 입문자**가 이 쇼핑몰 프로젝트를 예시로 삼아,

- 바이브코딩이 무엇인지
- AI에게 **어떻게 말해야** 원하는 코드를 얻을 수 있는지
- 어떤 점을 조심해야 하는지
- 이 프로젝트에서 실제로 쓸 수 있는 **프롬프트 예시**

를 정리한 가이드입니다.

---

## 1. 바이브코딩이란?

**바이브코딩(Vibe Coding)** 은

> “AI와 대화하면서, 내가 원하는 기능과 느낌을 설명하고,
>  AI가 제안하는 코드/설계를 골라서 다듬어 가며 개발하는 방식”

입니다.

전통적인 방식과 비교해 보면:

- 전통: 개발자가 직접 설계하고, 문법을 다 외워서 한 줄씩 손으로 작성
- 바이브코딩: **무엇을 만들지**, **어떤 스타일인지**를 말로 설명 → AI가 만들어 준 초안을 검토/수정

그래서 바이브코딩을 잘하려면,

- “코드를 잘 치는 능력”보다
- “요구사항을 분명하게 설명하는 능력”과
- “AI가 준 결과를 읽고, 맞는지 판단하는 능력”

이 더 중요해집니다.

---

## 1-1. VSCode로 바이브코딩 시작하기

바이브코딩을 하려면 **AI와 대화할 수 있는 도구**가 필요합니다.
가장 간편하고 널리 쓰이는 방법은 **VSCode(Visual Studio Code)** 에 AI 확장 프로그램을 설치하는 것입니다.

### 왜 VSCode인가?

- 무료이고, Windows/Mac/Linux 어디서든 사용 가능
- 이 프로젝트의 코드를 열고, 편집하고, 터미널에서 실행하는 것까지 한 곳에서 가능
- AI 확장 프로그램을 설치하면, **코드 편집기 안에서 바로 AI와 대화** 가능

### 대표적인 AI 확장 프로그램

| 확장 프로그램 | 제공사 | 특징 |
|--------------|--------|------|
| **GitHub Copilot** | GitHub(Microsoft) | 코드를 치는 도중 자동 완성 제안, 채팅 패널에서 질문 가능 |
| **Cline** | 오픈소스 | VSCode 안에서 AI와 대화하며 파일을 직접 수정할 수 있는 자율 코딩 에이전트 |
| **Claude Code** | Anthropic | 터미널에서 실행하는 AI 코딩 에이전트, 프로젝트 전체를 이해하고 직접 파일을 수정 |
| **Gemini Code Assist** | Google | VSCode/JetBrains에서 코드 자동 완성, 코드 설명, 채팅 지원 |

> 어떤 도구를 쓰든 핵심은 같습니다: **"내가 원하는 것을 명확히 설명하면, AI가 코드를 제안해 준다."**

### VSCode + AI 확장 프로그램 설치 흐름

```text
1. VSCode 설치
   → https://code.visualstudio.com 에서 다운로드

2. AI 확장 프로그램 설치
   → VSCode 왼쪽 사이드바에서 확장(Extensions) 아이콘 클릭
   → 검색창에 "GitHub Copilot" 또는 "Cline" 입력
   → Install 버튼 클릭

3. 계정 연결 / API 키 설정
   → 각 도구의 안내에 따라 로그인 또는 API 키 입력

4. 이 프로젝트 폴더 열기
   → VSCode에서 File → Open Folder → 이 프로젝트 폴더 선택

5. AI와 대화 시작!
   → 채팅 패널을 열고, 이 문서의 프롬프트 예시를 그대로 입력해 보기
```

### VSCode에서 바이브코딩하는 실제 모습

```text
┌─────────────────────────────────────────────────────────────────┐
│  VSCode                                                         │
│  ┌───────────────┐  ┌──────────────────────┐  ┌──────────────┐ │
│  │               │  │                      │  │              │ │
│  │  파일 탐색기    │  │   코드 편집 영역       │  │  AI 채팅 패널 │ │
│  │               │  │                      │  │              │ │
│  │  routes/      │  │  // authController.js │  │  나: "이 컨트 │ │
│  │  controllers/ │  │  exports.getList =    │  │  롤러에 삭제  │ │
│  │  views/       │  │    async (req, res)   │  │  기능을 추가  │ │
│  │  config/      │  │    => { ... }         │  │  해줘"       │ │
│  │  app.js       │  │                      │  │              │ │
│  │               │  │                      │  │  AI: "다음과  │ │
│  │               │  │                      │  │  같이 post   │ │
│  │               │  │                      │  │  Delete 함수를│ │
│  │               │  │                      │  │  추가하면..." │ │
│  │               │  │                      │  │              │ │
│  └───────────────┘  └──────────────────────┘  └──────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  터미널: npm run dev                                        ││
│  │  Server is running on http://localhost:3000                 ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘

왼쪽: 프로젝트 파일 구조를 한눈에 확인
가운데: 코드를 직접 보고 편집
오른쪽: AI에게 질문하고 코드 제안을 받음
아래: 터미널에서 서버 실행 및 에러 확인
```

> **핵심**: VSCode 하나로 "코드 보기 + AI 대화 + 서버 실행 + 에러 확인"을 **전부 한 화면에서** 할 수 있습니다.
> 이것이 바이브코딩을 가장 효율적으로 하는 방법입니다.

---

## 2. 바이브코딩의 기본 원칙 4가지

### 2-1. 한 번에 하나씩, 작게 요청하기

> X: "쇼핑몰 하나 만들어줘"

> O: "이 프로젝트에 공지사항 기능을 추가하고 싶어. 먼저 MySQL notices 테이블 CREATE TABLE 문부터 작성해줘."

작은 단계로 나누면:

1. DB 테이블 만들기
2. 컨트롤러
3. 라우터
4. 뷰
5. 관리자 메뉴

이렇게 **단계별로 확인하면서** 나아갈 수 있어, 오류를 찾고 수정하기 쉽습니다.

### 2-2. 맥락(컨텍스트)을 충분히 알려주기

> X: "로그인 만들어줘"

> O: "Node.js + Express + MySQL + EJS 쓰는 쇼핑몰 프로젝트야. 이미 users 테이블이 있고, Passport로 세션 로그인 구조도 있어. 여기에서 구글 OAuth 로그인을 추가하고 싶어."

특히 다음 정보들은 최대한 자주, 분명하게 알려주세요.

- 사용하는 기술 스택: `Node.js + Express + MySQL8 + EJS + Tailwind`
- 프로젝트 구조: `app.js + routes/ + controllers/ + views/`, 관리자 기능은 `routes/admin/`, `controllers/admin/` 에 있음
- 이미 존재하는 비슷한 파일: `routes/admin/banners.js` 처럼 만들어줘 등

### 2-3. 예시와 기준을 제시하기

> "routes/admin/banners.js 와 controllers/admin/bannerController.js 처럼, notices 에 대한 관리자 CRUD 도 만들어줘. 파일 이름은 notices.js, noticeController.js 로 해줘."

이렇게 **“이 파일처럼”** 이라고 하면, AI가 기존 스타일과 패턴을 더 잘 따라갑니다.

### 2-4. 실행해 보고, 에러 메시지를 보여주기

AI가 작성한 코드는 **항상 100% 정답은 아닙니다.**

1. 코드를 적용한 뒤 `npm run dev` 로 서버를 켜고,
2. 브라우저에서 기능을 실제로 사용해 보고,
3. 에러가 나면 **에러 메시지 전체를 복사해서** AI에게 보여주세요.

> "이 코드를 추가하고 /admin/notices 접속했더니, 이런 에러가 나왔어" 라고 하면서, 에러 전문을 붙여 넣으면 AI가 수정 방향을 제안하기 좋습니다.

---

## 3. 좋은 프롬프트 vs 아쉬운 프롬프트 예시

### 3-1. 공지사항 목록 만들기

- 아쉬운 예시

> "공지사항 목록 페이지 만들어줘"

- 좋은 예시

> "Node.js + Express + MySQL + EJS로 만든 쇼핑몰 프로젝트야. notices 테이블이 있고, `config/db.js` 에 mysql2/promise pool 이 있어. `/notices` GET 요청이 오면 notices 테이블에서 is_deleted = 0 인 공지만 중요도, 작성일 역순으로 조회해서, `views/user/notices/list.ejs` 로 렌더링하는 라우터와 컨트롤러 코드를 작성해줘. MVC 구조(routes, controllers, views)에 맞게 routes/notices.js, controllers/noticeController.js를 사용해줘."

### 3-2. 관리자용 목록 + 폼 만들기

- 아쉬운 예시

> "공지사항 관리자 페이지 만들어줘"

- 좋은 예시

> "이 프로젝트는 관리자 기능을 routes/admin/ 와 controllers/admin/ 에 두고 있어. 예를 들어 배너 관리 기능은 routes/admin/banners.js 와 controllers/admin/bannerController.js 에 있어. 같은 패턴으로 공지사항(notices) 관리자 CRUD를 추가하고 싶어. routes/admin/notices.js 와 controllers/admin/noticeController.js 를 새로 만들어서 목록/등록/수정/삭제를 구현해줘. 뷰 파일은 views/admin/notices/list.ejs, form.ejs 로 해줘."

---

## 4. 이 프로젝트에서 자주 쓰는 프롬프트 패턴

### 4-1. “이 파일처럼 만들어줘” 패턴

> "routes/admin/products.js 와 controllers/admin/productController.js 처럼, 쿠폰(coupons) 관리자 기능을 추가하고 싶어. DB에는 coupons 테이블이 있고, 컬럼은 ~~~야. 같은 구조로 routes/admin/coupons.js, controllers/admin/couponController.js, views/admin/coupons/list.ejs, form.ejs 를 만들어줘."

이 패턴은 **새로운 기능을 기존 패턴에 맞춰 확장할 때** 가장 유용합니다.

### 4-2. “단계별로 도와줘” 패턴

> "Node.js + Express + MySQL8 + EJS 기반 쇼핑몰이야. FAQ 기능(자주 묻는 질문)을 추가하고 싶어. 1) MySQL 테이블 설계, 2) 관리자 CRUD, 3) 사용자 목록 페이지, 4) 관리자 메뉴에 항목 추가까지 단계별로 프롬프트를 나눠서 같이 진행하자. 우선 1단계, 테이블 설계부터 도와줘."

이렇게 미리 단계들을 말해 두면, AI도 그 구조에 맞춰 설명을 이어 갈 수 있습니다.

### 4-3. “에러 해결해줘” 패턴

> "routes/admin/notices.js 와 controllers/admin/noticeController.js 를 방금 추가했어. `/admin/notices` 에 접속했더니 다음과 같은 에러가 나와. (여기에 에러 메시지 전문 붙이기) 이 에러의 원인과 수정 방법을 알려줘. 이 프로젝트는 app.js에서 `/admin` 라우터를 routes/admin.js로 연결하고 있어."

에러 상황을 설명할 때는 **경로 + 실행한 URL + 에러 메시지** 세 가지를 함께 주면 좋습니다.

---

## 5. 이 프로젝트 기준 바이브코딩 “전체 흐름” 예시

### 5-1. 예시: 새 FAQ 기능을 끝까지 추가하는 시나리오

1) 테이블 설계

> "MySQL 8을 사용하는 이 프로젝트에 FAQ(자주 묻는 질문)를 저장할 faqs 테이블을 추가하고 싶어. id(PK, auto increment), question(질문, varchar 255), answer(text), display_order(int, 정렬용), is_visible(tinyint 1, 기본 1), created_at, updated_at 컬럼을 갖도록 CREATE TABLE 문을 tables.sql 스타일로 작성해줘."

2) 관리자 컨트롤러

> "controllers/admin 디렉터리에 faqController.js 파일을 만들고 싶어. 목록(getList), 등록 폼(getForm), 등록(postCreate), 수정 폼(getEdit), 수정(postUpdate), 삭제(postDelete) 함수를 만들어줘. notices 관리자 컨트롤러가 있다고 가정하고, 그와 같은 패턴으로 작성해줘. DB는 config/db.js 의 pool을 사용해."

3) 관리자 라우터

> "routes/admin/faq.js 파일을 만들고, GET / (목록), GET /new (등록 폼), POST / (등록), GET /:id/edit (수정 폼), POST /:id (수정), POST /:id/delete (삭제) 라우트를 faqController 의 각 함수와 연결해줘. routes/admin/banners.js 구조를 참고해줘. 그리고 routes/admin.js 에 /admin/faq 경로를 연결하는 코드도 같이 제안해줘."

4) 관리자 뷰

> "views/admin/faq/list.ejs 와 views/admin/faq/form.ejs 파일을 만들고 싶어. layout은 layouts/admin_layout 을 사용하고, list에서는 질문/노출 여부/정렬 순서/수정/삭제 버튼을 테이블로 보여줘. form에서는 질문/답변/노출 여부/정렬 순서를 입력할 수 있게 해줘. views/admin/banners/list.ejs 와 form.ejs 스타일을 참고해줘."

5) 사용자 뷰

> "사용자 사이트에서 /faq 주소로 자주 묻는 질문을 볼 수 있게 하고 싶어. routes/faq.js 와 controllers/faqController.js 의 getUserList, views/user/faq/list.ejs 를 만들어줘. is_visible = 1 인 것만 display_order 순으로 보여줘. layout은 layouts/main_layout 을 써줘."

이 정도 흐름을 반복해 보면, 앞으로 새 기능을 만들 때도 자연스럽게 **“테이블 → 컨트롤러 → 라우터 → 뷰”** 순서가 떠오르게 됩니다.

---

## 6. 바이브코딩할 때 조심해야 할 점

1. **AI가 항상 맞는 건 아니다**
   - 파일 경로나 함수 이름을 조금 다르게 제안할 수 있습니다.
   - 항상 실제 프로젝트의 폴더 구조와 비교해서, 필요한 부분은 직접 맞춰 주세요.

2. **한 단계씩 실행·테스트하기**
   - 테이블 만들고 → 컨트롤러/라우터 추가하고 → 서버 실행해서 한 번 확인하고 → 그다음 뷰를 만드는 식으로, *중간중간* 확인하는 것이 중요합니다.

3. **중복 코드/사용하지 않는 파일 주의**
   - 기존에 비슷한 파일이 있는지 먼저 찾아본 뒤, “이 파일을 참고해서 변경해줘”라고 요청하면 중복을 줄일 수 있습니다.

4. **보안/민감 정보는 .env로**
   - DB 비밀번호, API 키, 클라이언트 시크릿 등은 절대 코드에 직접 적지 말고 `.env` 를 사용해야 합니다.

---

## 7. 바이브코딩 프로세스 시각화

실제로 바이브코딩을 할 때의 흐름을 그림으로 표현하면 이렇습니다.

```
┌─────────────────────────────────────────────────────────────┐
│ 1단계: 기능 정의 및 맥락 설명                                │
│ "이 프로젝트는 Node.js + Express + MySQL... 구조이고,       │
│  ~~ 기능을 추가하고 싶어"                                    │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 2단계: AI가 전체 구조 제안                                   │
│ "이 기능은 DB → 컨트롤러 → 라우터 → 뷰 순서로..."          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 3단계: 세부 단계별 요청 (예: DB 테이블 설계)                │
│ "먼저 notices 테이블 CREATE TABLE 문을 만들어줘"            │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 4단계: AI 코드 검토                                          │
│ - 파일 경로 확인                                             │
│ - 테이블/컬럼명 확인                                         │
│ - 프로젝트 패턴과 일치하는지 확인                           │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 5단계: 코드 적용 및 테스트                                   │
│ - 파일에 코드 복사                                           │
│ - 서버 재시작 (npm run dev)                                  │
│ - 브라우저에서 기능 테스트                                   │
└─────────────────┬───────────────────────────────────────────┘
                  │
         ┌────────┴────────┐
         │                 │
    에러 발생?           성공!
         │                 │
         ▼                 ▼
┌─────────────────┐  ┌─────────────────┐
│ 6a: 에러 해결   │  │ 6b: 다음 단계로│
│ 에러 메시지를   │  │ (컨트롤러 작성)│
│ AI에게 보여주고 │  │                 │
│ 수정 방법 요청  │  │                 │
└────────┬────────┘  └─────────────────┘
         │
         └─────→ 5단계로 돌아감
```

---

## 8. 실전 대화 예시: AI와 주고받으며 기능 완성하기

실제로 AI와 대화하며 공지사항 기능을 만드는 전체 과정을 보여드립니다.

### 8-1. 첫 대화: 전체 그림 잡기

**나 (사용자):**
> "Node.js + Express + MySQL8 + EJS로 만든 쇼핑몰 프로젝트야.
> app.js + routes/ + controllers/ + views/ 구조이고,
> 관리자 기능은 routes/admin/, controllers/admin/ 에 있어.
>
> 공지사항 기능을 추가하고 싶은데, 관리자는 등록·수정·삭제를 할 수 있고,
> 사용자는 /notices 에서 목록과 상세를 볼 수 있게 하려고 해.
>
> 어떤 순서로 만들면 좋을까?"

**AI 응답 (예상):**
> "공지사항 기능은 다음 순서로 만드는 것을 추천합니다:
>
> 1. **DB 테이블 설계**: notices 테이블 생성
> 2. **관리자 컨트롤러**: CRUD 로직 작성
> 3. **관리자 라우터**: URL과 컨트롤러 연결
> 4. **관리자 뷰**: 목록/등록/수정 화면
> 5. **사용자 컨트롤러/라우터**: 목록/상세 조회
> 6. **사용자 뷰**: 목록/상세 화면
> 7. **메뉴 연결**: 관리자 사이드바에 메뉴 추가
>
> 먼저 1단계 DB 테이블부터 시작할까요?"

**✅ 체크포인트:**
- AI가 제안한 순서가 이해되나요?
- 궁금한 단계가 있다면 지금 물어보세요!

### 8-2. 두 번째 대화: DB 테이블 설계

**나:**
> "좋아! 먼저 DB 테이블부터 만들자.
> MySQL 8을 쓰고 있고, 다른 테이블들은 tables.sql 파일에 정의되어 있어.
>
> notices 테이블에는 이런 컬럼이 필요해:
> - id (자동 증가 PK)
> - title (제목, 최대 200자)
> - content (내용, 긴 텍스트)
> - importance (중요도, 0=일반 1=중요)
> - view_count (조회수, 기본값 0)
> - is_deleted (삭제 여부, 기본값 0)
> - created_at (작성일시)
> - updated_at (수정일시)
>
> 이 프로젝트 스타일에 맞게 CREATE TABLE 문을 작성해줘."

**AI 응답 (예상):**
```sql
CREATE TABLE IF NOT EXISTS `notices` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '공지 ID (PK)',
  `title` varchar(200) NOT NULL COMMENT '공지 제목',
  `content` text NOT NULL COMMENT '공지 내용',
  `importance` tinyint(1) DEFAULT 0 COMMENT '중요도 (0:일반, 1:중요)',
  `view_count` int DEFAULT 0 COMMENT '조회수',
  `is_deleted` tinyint(1) DEFAULT 0 COMMENT '삭제 여부 (0:정상, 1:삭제)',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '작성일시',
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시',
  PRIMARY KEY (`id`),
  KEY `idx_importance_created` (`importance`, `created_at`),
  KEY `idx_is_deleted` (`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='공지사항';
```

**✅ 코드 검토 체크리스트:**
- [ ] 테이블 이름이 `notices` 로 올바른가?
- [ ] 모든 필요한 컬럼이 포함되어 있나?
- [ ] 데이터 타입이 적절한가? (varchar vs text, int vs tinyint)
- [ ] COMMENT가 한글로 잘 작성되어 있나?
- [ ] ENGINE과 CHARSET이 프로젝트 표준과 일치하나?

**나 (확인 후):**
> "좋아! 이 SQL을 tables.sql에 추가하고 DB에 실행했어.
> 다음으로 관리자 컨트롤러를 만들어보자."

### 8-3. 세 번째 대화: 관리자 컨트롤러 작성

**나:**
> "이제 controllers/admin/noticeController.js 를 만들고 싶어.
>
> 이 프로젝트에는 controllers/admin/bannerController.js 가 있는데,
> 그 파일처럼 다음 함수들을 만들어줘:
> - getList: 전체 공지를 최신순으로 조회
> - getForm: 새 공지 등록 폼
> - postCreate: 새 공지 INSERT
> - getEdit: 수정 폼 (id로 조회)
> - postUpdate: 공지 UPDATE
> - postDelete: is_deleted = 1 로 soft delete
>
> DB 연결은 config/db.js 의 pool을 사용하고,
> bannerController.js 의 패턴을 최대한 따라줘."

**AI가 코드를 제공하면...**

**✅ 코드 검토 체크리스트:**
- [ ] `const pool = require('../config/db')` 가 맞는 경로인가?
- [ ] 모든 함수가 `async (req, res, next) => {}` 형태인가?
- [ ] SQL 쿼리에서 `?` 플레이스홀더를 사용하나? (SQL injection 방지)
- [ ] 에러 처리를 `try-catch`로 하고 `next(err)`를 호출하나?
- [ ] `res.render()` 경로가 `admin/notices/...` 형태인가?

**실전 팁:**
만약 AI가 제공한 코드에서 경로가 틀렸다면:
> "getList 함수에서 res.render 경로가 'notices/list' 인데,
> 이 프로젝트에서는 관리자 뷰가 'admin/notices/list' 에 있어. 수정해줘."

---

## 9. AI 응답을 검토하는 방법

AI가 코드를 제공하면, 바로 복사하지 말고 다음을 확인하세요.

### 9-1. 파일 경로 확인

```javascript
// AI가 제안한 코드
const pool = require('../config/db');  // ← 이 경로가 맞나?
res.render('admin/notices/list');      // ← 뷰 경로가 맞나?
```

**확인 방법:**
1. 파일 탐색기에서 실제 경로 확인
2. 다른 컨트롤러 파일의 경로와 비교

### 9-2. 변수/테이블명 확인

```javascript
// AI 코드
const [rows] = await pool.query('SELECT * FROM notice');  // ← notice? notices?
```

**자주 하는 실수:**
- 테이블명 단수/복수 혼동 (`notice` vs `notices`)
- 컬럼명 오타 (`createAt` vs `created_at`)

### 9-3. 프로젝트 패턴 일치 확인

이 프로젝트의 표준 패턴:
```javascript
// ✅ 좋은 예: 프로젝트 패턴
exports.getList = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM notices');
    res.render('admin/notices/list', { notices: rows });
  } catch (err) {
    next(err);
  }
};

// ❌ 나쁜 예: 다른 패턴
module.exports.getList = function(req, res) {  // async/await 미사용
  pool.query('SELECT * FROM notices', (err, rows) => {  // 콜백 패턴
    if (err) throw err;  // 에러 처리 미흡
    res.render('list', { data: rows });  // 경로 불일치
  });
};
```

---

## 10. 단계별 체크리스트

각 단계를 완료할 때마다 다음을 확인하세요.

### DB 테이블 생성 후
- [ ] SQL을 MySQL에서 실행했다
- [ ] 에러 없이 테이블이 생성되었다
- [ ] `SHOW TABLES;` 로 테이블 존재 확인
- [ ] `DESC 테이블명;` 으로 컬럼 구조 확인

### 컨트롤러 작성 후
- [ ] 파일을 올바른 경로에 저장했다
- [ ] require 경로가 모두 정확하다
- [ ] 모든 함수에 exports가 있다
- [ ] SQL 쿼리가 정확하다

### 라우터 작성 후
- [ ] 라우터 파일을 올바른 경로에 저장했다
- [ ] 컨트롤러를 정확히 require 했다
- [ ] app.js 또는 상위 라우터에 연결했다
- [ ] URL 패턴이 의도한 대로 정의되었다

### 뷰 작성 후
- [ ] 뷰 파일을 올바른 경로에 저장했다
- [ ] layout 경로가 정확하다
- [ ] 컨트롤러에서 전달한 변수명과 일치한다
- [ ] Tailwind 클래스가 제대로 적용되는지 확인

### 전체 기능 테스트 후
- [ ] 서버를 재시작했다 (`npm run dev`)
- [ ] 브라우저에서 해당 URL 접속 성공
- [ ] 목록이 정상적으로 표시된다
- [ ] 등록/수정/삭제가 모두 동작한다
- [ ] 에러 로그가 없다

---

## 11. 자주 발생하는 문제와 해결법

### 문제 1: "Cannot find module" 에러

**에러 메시지:**
```
Error: Cannot find module '../config/db'
```

**원인:** require 경로가 잘못됨

**해결법:**
1. 현재 파일의 위치 확인
2. 목표 파일까지의 상대 경로 재계산
3. AI에게 수정 요청:
   > "controllers/admin/noticeController.js 에서 config/db.js 를 require 하려는데
   > 'Cannot find module' 에러가 나. 올바른 상대 경로를 알려줘."

### 문제 2: 뷰가 렌더링되지 않음

**에러 메시지:**
```
Error: Failed to lookup view "admin/notices/list"
```

**원인:** 뷰 파일 경로 또는 파일명이 틀림

**해결법:**
1. `views/admin/notices/list.ejs` 파일이 실제로 존재하는지 확인
2. 컨트롤러에서 `res.render('admin/notices/list')` 경로가 정확한지 확인
3. 파일명에 오타가 없는지 확인 (`list.ejs` vs `lists.ejs`)

### 문제 3: DB 쿼리 에러

**에러 메시지:**
```
Error: ER_NO_SUCH_TABLE: Table 'yd_mall.notice' doesn't exist
```

**원인:** 테이블명 오타 (`notice` vs `notices`)

**해결법:**
1. SQL에서 올바른 테이블명 확인: `SHOW TABLES;`
2. 컨트롤러의 모든 쿼리에서 테이블명 수정
3. 단수형/복수형 일관성 유지

### 문제 4: 데이터가 화면에 표시되지 않음

**증상:** 에러는 없지만 목록이 비어 있음

**체크 포인트:**
1. DB에 실제 데이터가 있나? → `SELECT * FROM notices;`
2. 컨트롤러에서 `res.render('view', { notices: rows })`에서 변수명 확인
3. EJS에서 `<%= notices %>` 또는 `<% notices.forEach(...) %>` 변수명 일치 확인
4. 콘솔에 `console.log(rows)` 추가해서 데이터 확인

---

## 12. 프롬프트 템플릿 모음 (복사해서 사용)

### 템플릿 1: 새 CRUD 기능 추가

```
[프로젝트 정보]
- Node.js + Express + MySQL8 + EJS + Tailwind CSS
- 구조: app.js + routes/ + controllers/ + views/
- 관리자: routes/admin/, controllers/admin/
- DB 연결: config/db.js 의 pool (mysql2/promise)

[참고 파일]
- routes/admin/banners.js
- controllers/admin/bannerController.js
- views/admin/banners/list.ejs, form.ejs

[요청]
[기능명] 기능을 추가하고 싶어.

DB 테이블: [테이블명] (컬럼: [컬럼 목록])

다음을 만들어줘:
1. controllers/admin/[기능명]Controller.js
   - getList, getForm, postCreate, getEdit, postUpdate, postDelete
2. routes/admin/[기능명].js
   - GET /, GET /new, POST /, GET /:id/edit, POST /:id, POST /:id/delete
3. views/admin/[기능명]/list.ejs, form.ejs

참고 파일의 패턴을 따라줘.
```

### 템플릿 2: 에러 해결

```
[상황]
[어떤 작업]을 하고 [URL]에 접속했더니 에러가 발생했어.

[에러 메시지]
[여기에 에러 전문 붙여넣기]

[관련 파일]
- [파일1 경로]: [무엇을 했는지]
- [파일2 경로]: [무엇을 했는지]

[프로젝트 구조]
- app.js에서 라우터 연결 방식: [설명]
- DB 연결: config/db.js의 pool

에러의 원인과 수정 방법을 알려줘.
```

### 템플릿 3: 기존 코드 개선

```
[현재 코드]
```javascript
[여기에 현재 코드 붙여넣기]
```

[요청]
이 코드를 [어떻게] 개선하고 싶어.
- [개선 사항 1]
- [개선 사항 2]

[제약 조건]
- 이 프로젝트는 [기술 스택]을 사용
- [특정 패턴]을 유지해야 함

개선된 코드를 보여줘.
```

---

## 13. 처음부터 끝까지 실습: FAQ 기능 만들기

이제 배운 내용을 종합해서, FAQ 기능을 처음부터 끝까지 만들어 봅시다.

### 준비물
- 이 쇼핑몰 프로젝트가 로컬에 실행 중
- MySQL에 접속 가능
- 코드 에디터 (VS Code 등)

### 실습 1단계: 프로젝트 파악 (5분)

**해볼 것:**
1. `routes/admin/banners.js` 파일 열어보기
2. `controllers/admin/bannerController.js` 파일 열어보기
3. `views/admin/banners/list.ejs` 파일 열어보기
4. 패턴 파악하기

**AI에게 물어보기:**
> "routes/admin/banners.js 파일을 보면서,
> 이 프로젝트에서 관리자 CRUD는 어떤 패턴으로 만들어지는지 설명해줘."

### 실습 2단계: DB 테이블 설계 (10분)

**AI 프롬프트:**
> "MySQL 8 프로젝트에 FAQ 기능을 추가하려고 해.
>
> faqs 테이블이 필요한데, 다음 컬럼을 포함해줘:
> - id (PK, auto increment)
> - question (varchar 255)
> - answer (text)
> - display_order (int, 기본값 0)
> - is_visible (tinyint 1, 기본값 1)
> - created_at (timestamp)
> - updated_at (timestamp)
>
> tables.sql 스타일로 CREATE TABLE 문을 작성해줘."

**할 일:**
1. AI가 제공한 SQL을 검토
2. MySQL Workbench 또는 CLI에서 실행
3. `SHOW TABLES;` 로 확인
4. `DESC faqs;` 로 컬럼 확인

### 실습 3단계: 관리자 컨트롤러 작성 (15분)

**AI 프롬프트:**
> "controllers/admin/faqController.js 를 만들고 싶어.
>
> controllers/admin/bannerController.js 패턴을 따라서,
> getList, getForm, postCreate, getEdit, postUpdate, postDelete 함수를 만들어줘.
>
> - DB: config/db.js의 pool 사용
> - 테이블: faqs
> - 삭제는 is_visible = 0 으로 soft delete
> - 목록은 display_order, id 순 정렬"

**할 일:**
1. AI 코드 검토 (경로, 변수명, 패턴)
2. `controllers/admin/faqController.js` 파일 생성
3. 코드 붙여넣기
4. 저장

### 실습 4단계: 관리자 라우터 작성 (10분)

**AI 프롬프트:**
> "routes/admin/faq.js 를 만들어줘.
>
> routes/admin/banners.js 패턴으로,
> - GET / → faqController.getList
> - GET /new → faqController.getForm
> - POST / → faqController.postCreate
> - GET /:id/edit → faqController.getEdit
> - POST /:id → faqController.postUpdate
> - POST /:id/delete → faqController.postDelete
>
> 그리고 routes/admin.js에 추가할 코드도 보여줘."

**할 일:**
1. `routes/admin/faq.js` 파일 생성 및 코드 추가
2. `routes/admin.js` 파일 열어서 faq 라우터 연결 추가
3. 저장

### 실습 5단계: 관리자 뷰 작성 (20분)

**AI 프롬프트 (목록):**
> "views/admin/faq/list.ejs 를 만들어줘.
>
> - layout: layouts/admin_layout
> - 테이블로 question, display_order, is_visible, 수정/삭제 버튼 표시
> - 상단에 'FAQ 등록' 버튼 (/admin/faq/new)
> - views/admin/banners/list.ejs 스타일 참고"

**AI 프롬프트 (폼):**
> "views/admin/faq/form.ejs 를 만들어줘.
>
> - layout: layouts/admin_layout
> - 입력: question, answer(textarea), display_order, is_visible(체크박스)
> - 신규/수정 겸용 (faq 객체 유무에 따라 value 설정)
> - views/admin/banners/form.ejs 스타일 참고"

**할 일:**
1. `views/admin/faq/` 폴더 생성
2. `list.ejs`, `form.ejs` 파일 생성
3. 코드 붙여넣기
4. 저장

### 실습 6단계: 테스트 (15분)

**할 일:**
1. 서버 재시작: `npm run dev`
2. 관리자 로그인
3. 브라우저에서 `/admin/faq` 접속
4. FAQ 하나 등록해보기
5. 수정해보기
6. 삭제해보기

**에러가 나면:**
1. 터미널의 에러 메시지 복사
2. AI에게 에러 해결 요청 (템플릿 2 사용)

### 실습 7단계: 관리자 메뉴 추가 (선택)

**AI 프롬프트:**
> "admin_menus 테이블에 FAQ 메뉴를 추가하는 INSERT 문을 만들어줘.
> - name: 'FAQ 관리'
> - path: '/admin/faq'
> - display_order: 적당한 위치
> - icon_class: 'bi bi-question-circle'"

---

## 14. 고급 팁: 바이브코딩을 더 잘하려면

### 팁 1: 컨텍스트 유지하기

**여러 단계 작업 시:**
```
[1차 대화]
"이 프로젝트는 Node.js + Express... 구조야.
FAQ 기능을 추가하고 싶어. 먼저 DB 테이블부터..."

[2차 대화 - 컨텍스트 유지]
"좋아, 이제 컨트롤러를 만들자.
아까 만든 faqs 테이블을 사용해서..."
          ↑
    이전 대화 내용 참조
```

### 팁 2: 한 번에 너무 많이 요청하지 않기

**❌ 나쁜 예:**
> "FAQ 기능의 DB, 컨트롤러, 라우터, 뷰, 메뉴를 모두 만들어줘."

**✅ 좋은 예:**
> "먼저 DB 테이블만 만들자. 완료되면 다음 단계로 가자."

### 팁 3: 기존 코드 보여주기

**더 정확한 결과를 위해:**
```
"이 프로젝트의 bannerController.js 코드는 이렇게 생겼어:

```javascript
[실제 코드 일부 복사]
```

같은 패턴으로 faqController.js를 만들어줘."
```

### 팁 4: 명확한 파일 경로 사용

**모호한 표현 대신:**
- ❌ "컨트롤러 파일에..."
- ✅ "controllers/admin/faqController.js 파일에..."

---

## 15. 자주 하는 실수 TOP 5

### 실수 1: 프로젝트 맥락을 매번 설명 안 함
AI는 이전 프로젝트를 기억하지 못합니다. 매 세션마다 프로젝트 구조를 다시 설명해주세요.

### 실수 2: AI 코드를 검토 없이 바로 사용
AI 코드에는 경로 오류, 변수명 불일치 등이 있을 수 있습니다. 항상 검토 후 사용하세요.

### 실수 3: 에러 메시지를 일부만 복사
에러 해결을 위해서는 **전체 스택 트레이스**가 필요합니다. 일부가 아닌 전체를 복사하세요.

### 실수 4: 중간 테스트를 건너뜀
DB → 컨트롤러 → 라우터 → 뷰 각 단계마다 테스트하지 않고 끝까지 작성하면, 에러 원인 찾기가 어렵습니다.

### 실수 5: .env 파일을 git에 커밋
`.env` 파일에는 비밀 정보가 들어있습니다. `.gitignore`에 반드시 포함하세요.

---

## 16. 성공 사례: 실제로 이렇게 만들었어요

### 사례 1: 쿠폰 관리 기능 추가 (소요 시간: 2시간)

**배경:** 쇼핑몰에 할인 쿠폰 기능이 필요했습니다.

**과정:**
1. AI에게 "이 쇼핑몰에 쿠폰 기능을..." 으로 시작
2. DB 테이블 설계 → 실행 → 확인 (15분)
3. 관리자 CRUD 컨트롤러/라우터 작성 (30분)
4. 관리자 화면 (목록/폼) 작성 (30분)
5. 테스트 중 발견한 3개 에러를 AI와 해결 (30분)
6. 사용자 화면 추가 (15분)

**결과:** 완벽하게 동작하는 쿠폰 관리 기능 완성!

**핵심 팁:**
- 기존의 products 관리 패턴을 그대로 참조
- 각 단계마다 즉시 테스트해서 에러를 조기 발견
- 에러 메시지를 정확히 AI에게 전달

---

## 17. 한 줄 요약

이 프로젝트에서 바이브코딩을 잘하려면, AI에게 이렇게 말할 수 있으면 충분합니다.

> "이 쇼핑몰은 Node.js + Express + MySQL8 + EJS + Tailwind 스택이고,
>  app.js + routes/ + controllers/ + views/ 구조야. 비슷한 기능은 admin/products, admin/banners 안에 있어.
>  이 구조에 맞춰 ~~ 기능을 단계별로 같이 만들어 보자."

그리고 그다음부터는 이 문서와 다른 코딩 가이드(특히 `mvc`, `mysql`, `project_structure`)를 참고해, **작게 나눈 단계와 좋은 프롬프트 예시**들을 그대로 응용하면 됩니다.

---

## 18. 다음 단계

이 문서를 다 읽었다면:

1. ✅ **바이브코딩이 무엇인지** 이해했습니다
2. ✅ **좋은 프롬프트 작성법**을 배웠습니다
3. ✅ **실전 프로세스**를 알게 되었습니다

**이제 할 일:**
1. 📖 `workflow.md` 읽기 - 전체 워크플로우 상세 가이드
2. 📖 `example_notice.md` 읽기 - 공지사항 예제로 실전 연습
3. 🔨 **직접 FAQ 기능 만들어보기** - 이 문서의 실습 13번 따라하기

**궁금한 점이 있다면:**
- MVC 구조가 헷갈린다면 → `mvc.md` 문서 참고
- DB 쿼리가 어렵다면 → `mysql.md` 문서 참고
- 폴더 구조가 헷갈린다면 → `project_structure.md` 문서 참고

**화이팅! 바이브코딩으로 멋진 쇼핑몰을 만들어보세요! 🚀**
