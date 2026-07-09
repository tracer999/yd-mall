---
name: unittest
description: "Express + MySQL Node.js 프로젝트(admin)의 단위 테스트 자동 수행 스킬. Jest 기반으로 서비스/컨트롤러/워커/AI 모듈의 단위 테스트를 생성하고 실행하여 오류를 찾아내고 커버리지 90% 이상을 달성한다. 사용 시점: (1) /unittest 명령 실행 시, (2) admin 프로젝트에 단위 테스트를 추가하거나 실행할 때, (3) 코드 변경 후 테스트 검증이 필요할 때, (4) 커버리지 리포트를 생성할 때."
---

# Unit Test Skill — Kotourlive Admin

admin 프로젝트(Express + MySQL, 함수 export 패턴)에 대해 Jest 기반 단위 테스트를 생성·실행하여 오류를 찾아내고 커버리지 90% 이상을 달성한다.

## Workflow

```
1. 환경 확인  → Jest 미설치 시 setup_jest.sh 실행
2. 대상 분석  → 테스트 대상 파일 목록 파악 (서비스 → 컨트롤러 → 워커 순)
3. 테스트 작성 → __tests__/ 하위에 테스트 파일 생성
4. 테스트 실행 → npm run test:coverage
5. 결과 분석  → 실패 원인 파악, 커버리지 미달 영역 보완
6. 반복        → 커버리지 90% 달성까지 3-5 반복
```

## Step 1: 환경 확인 및 설정

admin/node_modules/jest 존재 여부 확인. 없으면:

```bash
bash <skill-dir>/scripts/setup_jest.sh <project-root>
```

이 스크립트가 수행하는 작업:
- `jest`, `@types/jest`, `jest-html-reporters` 설치
- `jest.config.js` 복사 (assets/jest.config.js 기반)
- `__tests__/helpers/` 에 db-mock.js, express-mock.js, setup.js 복사
- package.json에 test 스크립트 추가

이미 설치되어 있으면 건너뛴다.

## Step 2: 대상 분석 및 우선순위

테스트 대상을 아래 우선순위로 분석한다. 각 파일을 읽고 export된 함수, 의존성, 분기 로직을 파악한 뒤 테스트를 작성한다.

### 우선순위 1 — 핵심 서비스 (services/)

| 파일 | 핵심 함수 | mock 대상 |
|------|----------|-----------|
| password_service.js | hash, compare | bcrypt |
| admin_service.js | authenticateAdmin | db.query, bcrypt |
| admin_stats_service.js | getSignupStats, getVisitorStats 등 | db.query |
| admin_banner_service.js | CRUD 전체 | db.query |
| admin_concert_service.js | CRUD 전체 | db.query |
| admin_festivals_service.js | CRUD 전체 | db.query |
| admin_news_service.js | CRUD 전체 | db.query |
| admin_notice_service.js | CRUD 전체 | db.query |
| admin_user_service.js | CRUD 전체 | db.query |
| admin_member_service.js | CRUD 전체 | db.query |
| admin_seo_service.js | CRUD 전체 | db.query |
| admin_translation_service.js | 트리 변환, CRUD | db.query |
| admin_popup_notice_service.js | CRUD 전체 | db.query |
| admin_news_category_service.js | CRUD 전체 | db.query |
| cmm_code_service.js | 코드 조회 | db.query |

### 우선순위 2 — AI 모듈 (services/ai_modules/)

| 파일 | mock 대상 |
|------|-----------|
| common.js (유틸리티 함수) | 없음 (순수 함수) |
| translation.js | OpenAI SDK |
| seo.js | OpenAI SDK |
| details_generation.js | OpenAI SDK |
| tag_generator.js | OpenAI SDK |
| news.js | OpenAI SDK |
| image_work.js | Google Vision API |

### 우선순위 3 — 컨트롤러 (controllers/)

서비스를 mock하고 req/res 객체로 테스트. express-mock.js 헬퍼 사용.

### 우선순위 4 — 워커/스케줄러 (schedule/)

무한루프 내부의 단일 iteration 함수 또는 호출하는 서비스 함수를 테스트.

## Step 3: 테스트 작성 규칙

### 디렉토리 구조

```
admin/__tests__/
├── helpers/
│   ├── db-mock.js          # DB query mock 헬퍼
│   ├── express-mock.js     # Express req/res mock 헬퍼
│   └── setup.js            # Jest 글로벌 setup
├── services/
│   ├── admin_service.test.js
│   ├── admin_stats_service.test.js
│   ├── password_service.test.js
│   └── ... (서비스별 1:1 매핑)
├── ai_modules/
│   ├── common.test.js
│   ├── translation.test.js
│   └── ...
├── controllers/
│   ├── admin_login_controller.test.js
│   └── ...
└── schedule/
    ├── translation_worker.test.js
    └── ...
```

### 핵심 규칙

1. **반드시 대상 파일을 읽은 뒤 테스트를 작성한다** — 함수 시그니처, query 반환값 destructuring 패턴, 에러 처리 방식을 확인
2. **jest.mock()으로 외부 의존성 격리** — db.query, AI SDK, axios, fs, puppeteer, bcrypt
3. **mysql2 반환값 패턴 확인 필수** — `const [rows] = await query(...)` vs `const rows = await query(...)` 에 따라 mock 값이 다름
4. **각 함수에 대해 최소 3개 테스트**: 정상 케이스, 빈/null 결과, 에러 케이스
5. **DB CRUD 서비스**: Create(정상+중복), Read(목록+상세+빈결과), Update(정상), Delete(정상) 모두 커버
6. **AI 모듈**: API 응답 mock, JSON 파싱 실패, rate limit(429), 타임아웃 케이스 포함

### Mock 패턴 상세

DB와 외부 서비스 모킹 전략은 [mock-strategies.md](references/mock-strategies.md) 참조.
서비스/컨트롤러/워커별 테스트 패턴 예시는 [test-patterns.md](references/test-patterns.md) 참조.

## Step 4: 테스트 실행

```bash
cd admin
npm test                     # 기본 실행
npm run test:coverage        # 커버리지 포함
npm run test:verbose         # 상세 출력
```

또는 커버리지 스크립트:

```bash
bash <skill-dir>/scripts/run_coverage.sh <admin-dir> 90
```

## Step 5: 결과 분석 및 반복

1. **실패 테스트**: 에러 메시지를 분석하고, mock 설정 오류인지 실제 코드 버그인지 구분
2. **코드 버그 발견 시**: 버그 내용을 명확히 보고하고, 수정 제안을 함께 제시
3. **커버리지 미달**: `coverage/index.html` 또는 텍스트 리포트에서 uncovered lines 확인 후 추가 테스트 작성
4. **목표**: 전체 커버리지 90% (branches, functions, lines, statements)

## Resources

### scripts/
- **setup_jest.sh** — Jest 환경 일괄 설치 (의존성 + 설정 + 헬퍼)
- **run_coverage.sh** — 커버리지 리포트 생성 + threshold 검증

### references/
- **[test-patterns.md](references/test-patterns.md)** — 서비스/컨트롤러/워커/AI 모듈별 테스트 작성 패턴과 예시
- **[mock-strategies.md](references/mock-strategies.md)** — DB, AI API, axios, fs, Puppeteer, bcrypt 등 모킹 전략 상세

### assets/
- **jest.config.js** — 프로젝트 맞춤 Jest 설정 템플릿
- **test-helpers/db-mock.js** — infrastructure/db.js query 함수 모킹 헬퍼
- **test-helpers/express-mock.js** — Express req/res/next 모킹 헬퍼
- **test-helpers/setup.js** — Jest 글로벌 환경변수 설정
