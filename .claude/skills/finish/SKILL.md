---
name: finish
description: "작업 완료 시 실행. Notion에 작업 보고서를 저장하고, git commit + push(develop)까지 한 번에 처리한다."
argument-hint: "작업 제목 (선택)"
---

# Finish — 작업 마무리 통합 스킬

작업 세션 종료 시 **Notion 저장 → git commit → git push**를 한 번에 처리한다.

## Workflow

```
1. 변경 사항 분석   → git diff/status로 변경 파일 파악
2. 작업 보고서 작성  → 세션 컨텍스트 기반 Markdown 생성
3. Notion 저장      → notion_uploader.js로 Work Logs DB에 업로드
4. docs/ 저장       → docs/develop/YYYY-MM-DD-{slug}.md 파일 생성
5. git commit       → 변경 파일 + docs 파일 스테이징 + 커밋
6. git push         → develop 브랜치에 푸시
7. 결과 보고        → Notion URL + 커밋 해시 + docs 파일 경로 출력
```

## Step 1: 변경 사항 분석

아래 명령으로 현재 세션의 작업 내용을 파악한다:

```bash
git status
git diff --stat
git diff --cached --stat
git log --oneline -1  # 최근 커밋 메시지 스타일 참고
```

수집할 정보:
- 변경/추가/삭제된 파일 목록과 개수
- 현재 브랜치 (반드시 `develop`인지 확인)
- 대화 컨텍스트에서 수행한 작업 내용

## Step 2: 작업 보고서 작성

대화 컨텍스트를 기반으로 아래 정보를 결정한다.

**날짜 기준**: 모든 날짜는 **KST(UTC+9)** 기준으로 생성한다. 서버 시간대와 무관하게 아래 함수를 사용:
```javascript
function getKSTDate() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10); // YYYY-MM-DD
}
```

| 필드 | 설명 | 예시 |
|------|------|------|
| `title` | 작업 제목 (50자 이내) | "SEO 개선 — 다국어 canonical 정상화" |
| `branch` | 현재 git 브랜치 | "develop" |
| `status` | Feature / Fix / Refactor / DB 중 택 1 | "Feature" |
| `tags` | 관련 키워드 (배열) | ["SEO", "다국어"] |
| `file_count` | 변경 파일 수 | 26 |
| `summary` | 변경 요약 (200자 이내) | "다국어 canonical URL 정상화..." |
| `body_markdown` | 전체 작업 보고서 Markdown | (아래 형식 참조) |

### body_markdown 형식

```markdown
# {작업 제목}

- **작업일**: {YYYY-MM-DD}
- **브랜치**: {branch}
- **작업 범위**: {간단한 범위 설명}

---

## 요약

{2-3문장으로 전체 작업 요약}

---

## 작업 상세

### {항목 1 제목}

**문제**: {해결한 문제}

**수정 파일**:

| 파일 | 변경 내용 |
|------|----------|
| `파일경로` | 변경 설명 |

**핵심 코드** (선택):
```코드```

---

## 변경 파일 목록 (총 N개)

1. `파일경로1`
2. `파일경로2`
```

**사용자가 인자로 제목을 지정한 경우** (`/finish SEO 개선`) 해당 값을 title로 사용한다.

## Step 3: Notion 저장

1. JSON 입력 파일을 `/tmp/notion_work_log.json`에 생성:

```javascript
// Node.js 스크립트로 JSON 생성 (Markdown 이스케이프 안전)
const fs = require('fs');
const data = {
  title: "...",
  branch: "develop",
  status: "Feature",
  tags: [...],
  file_count: N,
  summary: "...",
  body_markdown: `...`
};
fs.writeFileSync('/tmp/notion_work_log.json', JSON.stringify(data));
```

**중요**: body_markdown에 큰따옴표가 포함될 수 있으므로, 반드시 Node.js `JSON.stringify()`를 통해 JSON 파일을 생성한다. 쉘에서 직접 JSON을 만들지 않는다.

2. 업로더 실행:

```bash
node .claude/skills/save-to-notion/notion_uploader.js --input /tmp/notion_work_log.json
```

3. 출력에서 Notion URL을 캡처한다.

## Step 4: docs/ 저장

`body_markdown`을 `docs/develop/` 폴더에 날짜 기반 파일명으로 저장한다.

### 파일명 규칙

```
docs/develop/YYYY-MM-DD-{slug}.md
```

- `YYYY-MM-DD`: 작업일 (오늘 날짜)
- `{slug}`: title에서 생성. 한글/영문/숫자만 유지, 공백·특수문자 → 하이픈, 소문자 변환
  - 예) `"SEO 개선 — 다국어 canonical"` → `seo-개선-다국어-canonical`
  - 예) `"Claude Forge 에이전트 설정"` → `claude-forge-에이전트-설정`

### Node.js 스크립트로 생성

```javascript
const fs = require('fs');
const path = require('path');

// slug 생성 함수
function toSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, '')   // 한글·영숫자·공백 외 제거
    .trim()
    .replace(/\s+/g, '-');           // 공백 → 하이픈
}

// KST(UTC+9) 기준 날짜 반환
function getKSTDate() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
const today = getKSTDate(); // YYYY-MM-DD (KST 기준)
const slug = toSlug(title);                          // title은 Step 2에서 결정된 값
const docsDir = path.join(process.cwd(), 'docs', 'develop');
const filePath = path.join(docsDir, `${today}-${slug}.md`);

fs.mkdirSync(docsDir, { recursive: true });
fs.writeFileSync(filePath, body_markdown, 'utf8');
console.log('docs 파일 저장:', filePath);
```

**결과**: `docs/develop/2026-02-24-claude-forge-에이전트-설정.md` 형태로 저장됨.

> 이 파일은 Step 5 git commit 시 함께 스테이징하여 커밋에 포함시킨다.

## Step 5: git commit

```bash
git add <변경된_파일들>
git add docs/develop/<YYYY-MM-DD-slug>.md   # Step 4에서 생성한 docs 파일 포함
git add docs/develop/                        # 개발 중 생성된 모든 기획/설계 문서 포함
git add docs/research/                       # 리서치 문서가 있으면 포함
git commit -m "커밋 메시지

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

**커밋 메시지 규칙**:
- 한국어로 작성
- 첫 줄: 간결한 요약 (예: "SEO 전면 개선 및 홈 페이지 JSON-LD 추가")
- 빈 줄 후 상세 내용 (선택)
- 마지막에 Co-Authored-By 태그

**주의**:
- 코드 변경 사항이 없어도 docs 파일만 있으면 커밋한다.
- `docs/develop/` 하위의 기획 문서(task_plan.md, findings.md 등)와 기능별 폴더도 반드시 포함한다.
- `docs/research/` 하위 리서치 문서도 있으면 함께 포함한다.

## Step 6: git push

```bash
git push origin develop
```

**안전 확인**:
- 현재 브랜치가 `develop`인지 확인. `main`이면 경고하고 중단.
- push 전 사용자에게 확인을 요청한다.

## Step 7: 결과 보고

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  /finish 완료
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Notion : {notion_url}
  Docs   : docs/develop/{YYYY-MM-DD-slug}.md
  Commit : {commit_hash} — {commit_message_first_line}
  Branch : develop → origin/develop
  Files  : {N}개 변경
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 에러 처리

| 상황 | 대응 |
|------|------|
| Notion 업로드 실패 | 에러 메시지 표시 후 docs 저장 및 commit/push는 계속 진행할지 사용자에게 확인 |
| docs/ 쓰기 실패 | 에러 메시지 표시 후 계속 진행 (docs는 선택적 산출물) |
| git push 실패 | 에러 원인 분석 (충돌, 권한 등) 후 사용자에게 보고 |
| `main` 브랜치 | 경고 후 중단. develop으로 전환 안내 |
| 변경 사항 없음 | Notion + docs 저장 후 커밋(docs 파일만)하고 push |
| `notion_config.json` 없음 | Notion 저장 건너뛰고 docs 저장 + commit/push만 진행할지 확인 |

## 주의사항

- **항상 한국어로 작성한다**
- 민감 정보(API 키, DB 비밀번호)는 보고서에 절대 포함하지 않는다
- `.claude/notion_config.json`은 gitignore 대상이다
- 커밋 시 `.env`, `credentials` 등 민감 파일이 포함되지 않도록 확인한다
- Notion 저장 → commit → push 순서를 반드시 지킨다 (Notion 저장이 먼저)
