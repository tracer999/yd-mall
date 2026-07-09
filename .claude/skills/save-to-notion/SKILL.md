---
name: save-to-notion
description: "현재 작업 세션의 작업 내용을 Notion Work Logs 데이터베이스에 저장하는 스킬. 작업 완료 후 '/save-to-notion' 명령으로 실행한다."
argument-hint: "작업 제목 (선택, 미입력 시 자동 생성)"
---

# Save to Notion — 작업 로그 자동 저장

현재 세션에서 수행한 작업을 Notion Work Logs 데이터베이스에 저장한다.

## 설정 파일

- **API 설정**: `.claude/notion_config.json` (gitignored)
- **업로더 스크립트**: `.claude/skills/save-to-notion/notion_uploader.js`

## Workflow

```
1. 작업 내용 수집   → 현재 세션의 변경 사항 분석
2. 문서 작성        → 구조화된 Markdown 작업 보고서 생성
3. JSON 입력 생성   → Notion 업로더용 JSON 파일 작성
4. 업로드 실행      → notion_uploader.js 실행
5. 결과 확인        → Notion URL 출력
```

## Step 1: 작업 내용 수집

현재 세션에서 수행한 작업을 분석한다:

1. **git diff / git status**로 변경된 파일 목록 확인
2. 대화 컨텍스트에서 수행한 작업 내용 파악
3. 다음 정보를 정리:
   - 작업 제목 (간결하게, 예: "SEO 개선", "배너 시스템 구현")
   - 브랜치 (현재 git 브랜치)
   - 상태 (Feature / Fix / Refactor / DB 중 택 1)
   - 태그 (관련 키워드, 예: SEO, 다국어, 성능)
   - 변경 파일 수
   - 변경 요약 (1-2문장)

## Step 2: Markdown 작업 보고서 작성

아래 구조로 Markdown 본문을 작성한다:

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

**핵심 코드**:
```코드```

### {항목 2 제목}
...

---

## 변경 파일 목록 (총 N개)

1. `파일경로1`
2. `파일경로2`
...
```

## Step 3: JSON 입력 파일 생성

`/tmp/notion_work_log.json` 파일을 생성한다:

```json
{
  "title": "작업 제목",
  "branch": "develop",
  "status": "Feature",
  "tags": ["태그1", "태그2"],
  "file_count": 26,
  "summary": "변경 요약 (1-2문장, 200자 이내)",
  "body_markdown": "# 전체 Markdown 본문..."
}
```

**주의사항**:
- `title`: 50자 이내
- `summary`: 200자 이내 (Notion rich_text 셀에 표시됨)
- `status`: 반드시 `Feature`, `Fix`, `Refactor`, `DB` 중 하나
- `tags`: 배열, 각 태그 50자 이내
- `body_markdown`: 전체 작업 보고서 Markdown

## Step 4: 업로더 실행

```bash
node .claude/skills/save-to-notion/notion_uploader.js --input /tmp/notion_work_log.json
```

성공 시 출력:
```
[Notion] 페이지 생성 중... "작업 제목"
[Notion] 성공! 페이지 URL: https://www.notion.so/...
[Notion] 페이지 ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## Step 5: 결과 보고

사용자에게 결과를 보고한다:

```
✓ Notion에 작업 로그가 저장되었습니다.
  - 제목: {title}
  - 상태: {status}
  - 변경 파일: {N}개
  - URL: {notion_url}
```

## 에러 처리

| 상황 | 대응 |
|------|------|
| `notion_config.json` 없음 | 설정 파일 경로 안내 |
| API 인증 실패 (401) | API 키 확인 요청 |
| 데이터베이스 접근 불가 (403) | Notion에서 Integration 연결 확인 요청 |
| 속성 불일치 | DB 속성명과 JSON 키 비교 안내 |

## 인자 처리

- `/save-to-notion` — 자동으로 작업 내용을 수집하여 저장
- `/save-to-notion SEO 개선` — 제목을 지정하여 저장
- `/save-to-notion --dry-run` — 실제 업로드 없이 생성될 JSON만 미리보기

## 주의사항

- **항상 한국어로 작성한다** (제목, 요약, 본문 모두)
- JSON의 body_markdown에서 큰따옴표(")는 반드시 이스케이프한다
- 민감 정보(API 키, DB 비밀번호 등)는 절대 본문에 포함하지 않는다
- `.claude/notion_config.json`은 gitignore 대상이다. 커밋하지 않는다
