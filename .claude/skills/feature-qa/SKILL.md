---
name: feature-qa
description: |
  기능 개발 완료 후 코드 리뷰 + 테스트를 자동 수행하는 QA 게이트 스킬.
  변경된 코드를 분석하여 보안/품질/패턴 위반을 검출하고, 관련 테스트를 실행하여 결과를 리포트한다.
  커밋 전 품질 관문 역할. /finish 전에 반드시 실행해야 한다.
  PROACTIVE: 기능 개발이 완료되면 사용자가 요청하지 않아도 이 스킬을 자동으로 실행하라. "구현 완료", "개발 끝", "다 만들었어", "기능 추가했어" 등 개발 완료를 나타내는 메시지 후 자동 트리거한다.
  사용 시점: (1) /feature-qa 명령 실행 시, (2) 기능 개발 완료 후 커밋 전 (자동), (3) 코드 품질 점검이 필요할 때.
argument-hint: "[--skip-test] [--skip-review] [--files file1,file2]"
---

# Feature QA — 기능 완료 후 품질 게이트

기능 개발 완료 시 **코드 리뷰 + 테스트 실행**을 수행하고 결과를 리포트한다.
커밋(`/finish`)이나 PR 생성 전 품질 관문 역할.

## Workflow

```
1. 변경 분석    → git diff로 변경 파일/범위 파악
2. 영향 분류    → admin/user/blogAuto/shared 분류 + 변경 유형 태깅
3. 코드 리뷰    → 서브에이전트로 병렬 리뷰 (보안 + 품질 + 프로젝트 패턴)
4. 테스트 실행  → 관련 테스트가 있으면 실행, 없으면 테스트 필요 여부 판단
5. 결과 리포트  → 통합 리포트 출력 + PASS/WARN/FAIL 판정
```

---

## Step 1: 변경 분석

```bash
git diff --name-only HEAD
git diff --stat HEAD
git status --short
```

수집 정보:
- 변경/추가/삭제된 파일 목록
- 변경 라인 수 (규모 파악)
- 스테이징 상태

**인자 처리**:
- `--files file1,file2`: 지정된 파일만 리뷰 (전체 diff 대신)
- `--skip-test`: 테스트 실행 건너뜀
- `--skip-review`: 코드 리뷰 건너뜀

---

## Step 2: 영향 분류

변경 파일을 아래 기준으로 분류한다:

| 분류 | 경로 패턴 | 추가 체크 |
|------|----------|----------|
| **admin** | `admin/` | 워커 변경 시 batch.js 영향 확인 |
| **user** | `user/` | locale 변경 시 9개 언어 동기화 확인 |
| **blogAuto** | `blogAuto/` | n8n 연동 영향 확인 |
| **shared** | `shared/` | admin + user 양쪽 영향 확인 |
| **schema** | `schema.sql` | 개발/상용 DB 적용 여부 확인 |
| **config** | `.claude/`, `ecosystem.*` | 설정 변경 영향 확인 |

### 변경 유형 태깅

각 파일의 변경 유형을 파악한다:

| 태그 | 파일 패턴 | 리뷰 초점 |
|------|----------|----------|
| `route` | `routes/*.js`, `config/routes.js` | 라우트 등록, 미들웨어 순서 |
| `controller` | `controllers/*_controller.js` | 입력 검증, 응답 형식 |
| `service` | `services/*_service.js` | SQL 안전성, 비즈니스 로직 |
| `view` | `views/**/*.ejs` | XSS, i18n 키 사용 |
| `locale` | `locales/*.json` | 9개 언어 동기화 |
| `worker` | `schedule/*.js` | 무한루프 안전성, 에러 복구 |
| `ai` | `services/ai_modules/*.js` | API 키 노출, 에러 핸들링 |
| `infra` | `infrastructure/*.js` | DB 연결, 세션, 미들웨어 |
| `migration` | `schema.sql` | DDL 정합성 |

---

## Step 3: 코드 리뷰

**서브에이전트 2개를 병렬로 실행한다** (Agent 도구 사용):

### 에이전트 A — 보안 리뷰

변경된 파일을 읽고 아래 항목을 점검:

| # | 체크 항목 | 심각도 | 감지 패턴 |
|---|----------|--------|----------|
| 1 | SQL Injection | CRITICAL | 문자열 연결 쿼리, `${}` in SQL, prepared statement 미사용 |
| 2 | XSS | CRITICAL | `<%- %>` (unescaped EJS), 사용자 입력 직접 렌더 |
| 3 | 인증/인가 누락 | CRITICAL | 미들웨어 없는 라우트, 세션 체크 누락 |
| 4 | 하드코딩 시크릿 | CRITICAL | API 키, 비밀번호, 토큰이 코드에 직접 포함 |
| 5 | Path Traversal | HIGH | `req.params`/`req.query`로 파일 경로 구성 |
| 6 | SSRF | HIGH | 사용자 입력 URL로 HTTP 요청 |
| 7 | 에러 정보 노출 | MEDIUM | 에러 스택 트레이스를 클라이언트에 반환 |

### 에이전트 B — 품질 + 패턴 리뷰

변경된 파일을 읽고 아래 항목을 점검:

**코드 품질:**

| # | 체크 항목 | 심각도 | 기준 |
|---|----------|--------|------|
| 1 | 함수 길이 | HIGH | 50줄 초과 |
| 2 | 파일 길이 | HIGH | 800줄 초과 |
| 3 | 중첩 깊이 | HIGH | 4단계 초과 |
| 4 | 에러 핸들링 누락 | HIGH | async 함수에 try-catch 없음 |
| 5 | console.log 잔존 | MEDIUM | 디버그용 console.log |
| 6 | 미사용 변수/import | LOW | 선언 후 사용되지 않는 코드 |

**kotourlive 패턴 준수:**

| # | 체크 항목 | 심각도 | 기준 |
|---|----------|--------|------|
| 1 | DB 쿼리 패턴 | HIGH | `query(sql, params)` 대신 직접 문자열 조합 |
| 2 | Locale 동기화 | HIGH | view에서 사용하는 i18n 키가 9개 locale에 모두 존재 |
| 3 | 라우트 패턴 | MEDIUM | user 라우트가 `/:lang/` 하위에 마운트되었는지 |
| 4 | 컨트롤러 네이밍 | LOW | admin: `admin_*_controller.js`, user: `*_controller.js` |
| 5 | Service 분리 | MEDIUM | 컨트롤러에 직접 SQL 쿼리 작성 (서비스 레이어 우회) |
| 6 | 무한스크롤 패턴 | LOW | `?json=true` 분기 누락 |

**각 에이전트 프롬프트에 포함할 정보:**
- 변경 파일 목록
- 파일별 diff 내용
- 프로젝트 컨텍스트 (CLAUDE.md 요약)

---

## Step 4: 테스트 실행

`--skip-test` 인자가 없을 때만 실행한다.

### 테스트 탐색 순서

1. **기존 테스트 파일 확인**:
   ```bash
   # admin 테스트
   ls admin/__tests__/ 2>/dev/null
   # 변경 파일에 대응하는 테스트 파일 탐색
   # 예: services/admin_concert_service.js → __tests__/services/admin_concert_service.test.js
   ```

2. **테스트 실행** (존재하는 경우):
   ```bash
   cd admin && npx jest --passWithNoTests --no-coverage 2>&1 | head -50
   ```

3. **테스트가 없는 경우**:
   - 변경 규모가 크고(서비스 함수 3개 이상 변경) 비즈니스 로직이 포함된 경우 → "테스트 작성 권장" 메시지
   - 뷰/스타일/설정 변경만인 경우 → 건너뜀

### 관련 테스트만 실행

변경된 서비스에 대응하는 테스트만 선택 실행:
```bash
cd admin && npx jest --testPathPattern="admin_concert_service" --no-coverage 2>&1
```

---

## Step 5: 결과 리포트

### 판정 기준

| 판정 | 조건 |
|------|------|
| **PASS** | CRITICAL/HIGH 이슈 0개, 테스트 전체 통과 |
| **WARN** | CRITICAL 0개, HIGH 1-2개 또는 MEDIUM 3개 이상, 테스트 통과 |
| **FAIL** | CRITICAL 1개 이상, 또는 테스트 실패 |

### 출력 형식

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Feature QA 결과: [PASS/WARN/FAIL]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

변경 범위: {admin/user/shared} | 파일 {N}개 | +{added} -{deleted} 줄

── 보안 리뷰 ──────────────────────────────
  CRITICAL : {N}개
  HIGH     : {N}개
  MEDIUM   : {N}개
  (이슈가 있으면 상세 내용)

── 품질 리뷰 ──────────────────────────────
  CRITICAL : {N}개
  HIGH     : {N}개
  MEDIUM   : {N}개
  (이슈가 있으면 상세 내용)

── 패턴 준수 ──────────────────────────────
  Locale 동기화 : ✅/⚠️
  DB 쿼리 패턴  : ✅/⚠️
  라우트 패턴    : ✅/⚠️/N/A

── 테스트 ─────────────────────────────────
  실행: {N}개 통과 / {M}개 실패 / {K}개 건너뜀
  (또는: 관련 테스트 없음 — 테스트 작성 권장)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  이슈 상세
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## [CRITICAL] SQL Injection 위험
파일: admin/services/admin_concert_service.js:42
내용: 문자열 연결로 WHERE 절 구성
수정: prepared statement의 ? 파라미터 사용

## [HIGH] 에러 핸들링 누락
파일: admin/controllers/admin_concert_controller.js:15
내용: async 함수에 try-catch 없음
수정: try-catch 래핑 + 에러 로깅

...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  권장 조치
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. {구체적 수정 권장사항}
  2. {구체적 수정 권장사항}

  다음 단계: 이슈 수정 후 `/feature-qa` 재실행 또는 `/finish`로 커밋
```

---

## 이슈 상세 출력 규칙

각 이슈는 아래 형식을 따른다:

```
## [{심각도}] {이슈 제목}
파일: {파일경로}:{라인번호}
내용: {1-2문장 설명}
수정: {구체적 수정 방법}
```

- CRITICAL/HIGH 이슈는 반드시 **수정 방법**을 포함한다
- 이슈가 10개를 초과하면 상위 10개만 출력하고 "외 N개" 표시
- 같은 패턴의 반복 이슈는 묶어서 "N곳에서 동일 패턴" 으로 표시

---

## 에러 처리

| 상황 | 대응 |
|------|------|
| 변경 사항 없음 | "변경된 파일이 없습니다" 메시지 후 종료 |
| 테스트 실행 실패 (환경 문제) | 테스트 결과를 "실행 불가"로 표시, 리뷰 결과만 출력 |
| 서브에이전트 타임아웃 | 해당 섹션 "시간 초과"로 표시, 나머지 결과 출력 |

---

## 참고

- 이 스킬은 **조회/분석만** 수행한다. 코드를 자동 수정하지 않는다.
- 수정이 필요하면 리포트 후 사용자에게 수정 여부를 확인받는다.
- `/finish` 전에 실행하여 품질 게이트로 활용하는 것을 권장한다.
- 프로젝트 특화 체크리스트는 [references/kotourlive-checklist.md](references/kotourlive-checklist.md) 참조.
