---
name: issue-report
description: "현재 세션에서 진행한 작업·발견한 문제를 Notion '이슈 및 공유사항' 데이터베이스에 이슈/공유 문서로 등록하는 스킬. '/issue-report' 명령 또는 '이슈사항으로 등록/문서화해줘' 요청 시 실행한다."
argument-hint: "이슈 제목 (선택, 미입력 시 세션 내용으로 자동 생성)"
---

# Issue Report — 세션 작업을 Notion 이슈로 등록

현재 세션에서 진행한 작업(또는 발견한 문제)을 종합 분석해 **원인→조치→변화→후속조치** 구조의 이슈 문서를 작성하고, Notion **「이슈 및 공유사항」** 데이터베이스에 등록한다.

## 설정

- **API 설정**: `.claude/notion_config.json` (저장소에 추적됨 — 기존 save-to-notion과 동일 컨벤션)
  - `api_key`: Notion 통합(claude_bot) 토큰
  - `issue_db_id`: 이슈 및 공유사항 DB ID (`37c69f3a-dbcd-80c8-8534-fd03d5d6b67a`)
- **업로더**: `.claude/skills/issue-report/issue_uploader.js`
  (markdown→Notion 블록 변환은 `save-to-notion/notion_uploader.js`의 변환기를 재사용)

## 대상 DB 속성

| 속성 | 타입 | 값 |
|------|------|-----|
| 제목 | title | 이슈 제목 |
| 유형 | select | `이슈사항` \| `공유사항` |
| 우선순위 | select | `긴급` \| `높음` \| `보통` \| `낮음` |
| 상태 | status | `신규` \| `진행중` \| `해결됨` \| `보류` |
| 등록일 | date | YYYY-MM-DD |

## Workflow

```
1. 세션 분석     → 이번 세션의 작업·문제·결정사항 수집 (git log/diff + 대화 맥락 + docs/)
2. 분류 판단     → 유형(이슈/공유)·우선순위·상태 결정 (애매하면 사용자에게 확인)
3. 본문 작성     → 아래 구조의 Markdown 작성 (로컬 docs/에도 저장 권장)
4. JSON 생성     → /tmp 에 업로더 입력 JSON 작성
5. 업로드        → node .claude/skills/issue-report/issue_uploader.js --input <json>
6. 결과 보고     → Notion URL 출력, 임시 JSON 삭제
```

## Step 1–2: 세션 분석 및 분류

1. `git log --oneline` 으로 이번 세션 커밋, `git status`로 미커밋 변경 확인.
2. 세션 중 작성한 계획/리포트 문서(`docs/expected/`, `docs/team/`, `docs/develop/`)가 있으면 **그 내용을 종합**한다(중복 작성 금지 — 기존 문서를 근거 자료로 활용).
3. 분류 기준:
   - **이슈사항**: 장애·버그·실적 하락 등 문제와 그 대응 (예: GSC 노출 급락)
   - **공유사항**: 기능 추가·프로세스 변경 등 정보 공유
   - 우선순위: 서비스 영향 크면 `긴급/높음`, 일상 개선이면 `보통/낮음`
   - 상태: 대응 완료면 `해결됨`, 관찰/잔여 작업 있으면 `진행중`, 미착수면 `신규`

## Step 3: 본문 Markdown 구조

이슈사항은 아래 구조를 따른다 (공유사항은 현상/원인 대신 "배경 → 내용" 으로 단순화):

```markdown
## 1. 현상 — 무슨 일이 발생했나
(언제부터, 어떤 지표가, 얼마나. 정량 수치 필수)

## 2. 원인 — 왜 발생했나
(직접 트리거 + 근본 원인. 코드/DB 실측 근거를 표로)

## 3. 조치 내역 — 어떤 방식으로 무엇을 했나
(조치별 내용. PR 번호·파일·DB 변경 명시)

## 4. 앞으로 달라지는 것
(이전 vs 이후 비교표. 운영 주의사항 포함)

## 5. 후속 조치
(우선순위 표: 필수/권장/선택/보류 + 근거)

## 6. 참고
(관련 문서 경로, PR/배포 이력)
```

**작성 원칙**:
- 정량 수치·파일 경로·PR 번호를 구체적으로 (예: "노출 95% 급락(1,500→100)", "PR #398").
- 표를 적극 사용 (업로더가 markdown 표→Notion 표 변환 지원).
- 기대치 관리: 효과가 즉시가 아니면 시점을 명시 (예: "재크롤 2~6주 후 측정").

## Step 4–5: 업로드

```bash
# 입력 JSON 작성 (/tmp/issue_report_input.json)
{
  "title": "구글 검색 노출 95% 급락 — 원인·조치·향후 변화",
  "type": "이슈사항",
  "priority": "높음",
  "status": "진행중",
  "date": "2026-06-11",
  "body_markdown": "## 1. 현상 ..."
}

# 실행 (프로젝트 루트에서)
node .claude/skills/issue-report/issue_uploader.js --input /tmp/issue_report_input.json
```

성공 시 `__RESULT__{json}__RESULT__` 마커로 URL 이 출력된다. 완료 후 `/tmp` 입력 파일은 삭제한다.

## 에러 처리

| 상황 | 대응 |
|------|------|
| `issue_db_id` 없음 | `.claude/notion_config.json` 에 추가 안내 |
| 401/403 | claude_bot 통합이 해당 DB에 연결되어 있는지 확인 안내 (DB 페이지 → Connections) |
| validation 오류 (select/status 옵션) | DB 스키마 변경 가능성 — 옵션명을 DB 에서 재조회 후 맞춤 |
| 본문 2000자 블록 제한 | 업로더가 자동 분할 처리 (변환기 내장) |

## 참고

- 작업 로그(개발 일지) 저장은 `/save-to-notion`(Work Logs DB), **이슈/공유 문서 등록은 이 스킬**(이슈 및 공유사항 DB) — 용도가 다르다.
- 본문이 긴 종합 보고서면 로컬 `docs/team/` 에도 같은 내용을 저장해 레포에 이력을 남긴다.
