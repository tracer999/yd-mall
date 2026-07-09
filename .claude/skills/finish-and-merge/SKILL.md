---
name: finish-and-merge
description: "/finish + /merge-main을 순차 실행. 작업 마무리(Notion 저장 + commit + push) 후 staging→main PR 생성 및 머지까지 한 번에 처리한다."
argument-hint: "작업 제목 (선택)"
---

# Finish & Merge — 작업 마무리 + 상용 배포 통합 스킬

`/finish`와 `/merge-main`을 순차적으로 실행하여 한 번에 처리한다.

## Workflow

```
Phase 1: /finish 실행
  1. 변경 사항 분석 (git diff/status)
  2. 작업 보고서 작성
  3. Notion 저장
  4. docs/ 저장
  5. git commit
  6. git push (develop)

Phase 2: /merge-main 실행 (finish 성공 후)
  7. GitHub Actions develop→staging 머지 대기 (최대 60초)
  8. staging→main PR 생성
  9. 자동 머지
  10. 최종 결과 보고
```

## 실행 방법

**Phase 1**은 `/finish` 스킬을 그대로 실행한다. 인자가 있으면 `/finish`에 전달한다.

**Phase 2 진입 조건**: Phase 1의 git push가 성공한 경우에만 진행한다.

### Phase 2 사전 대기

develop → staging 머지는 GitHub Actions가 자동 처리하므로, push 후 staging이 업데이트될 때까지 대기한다:

```bash
# develop push 후 staging 동기화 대기
sleep 10
git fetch origin staging
```

staging이 최신화되면 `/merge-main` 스킬을 실행한다. 인자가 있으면 PR 제목으로 전달한다.

## 에러 처리

| 상황 | 대응 |
|------|------|
| Phase 1 실패 (Notion/commit/push) | Phase 1 에러 보고 후 Phase 2 진행 여부를 사용자에게 확인 |
| Phase 2 실패 (PR 생성/머지) | Phase 2 에러 보고. Phase 1은 이미 완료됨을 안내 |
| staging 동기화 안 됨 | 수동으로 `git fetch origin staging` 후 재시도 안내 |

## 최종 결과 보고

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  /finish-and-merge 완료
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [Phase 1 — finish]
  Notion : {notion_url}
  Docs   : docs/develop/{YYYY-MM-DD-slug}.md
  Commit : {commit_hash} — {commit_message}
  Branch : develop → origin/develop

  [Phase 2 — merge-main]
  PR     : {PR_URL}
  Title  : {PR 제목}
  Base   : main ← staging
  Status : Merged
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 주의사항

- Phase 1과 Phase 2는 반드시 순차적으로 실행한다 (병렬 금지)
- 각 Phase의 세부 동작은 `/finish`, `/merge-main` 스킬 문서를 따른다
- main 브랜치에 직접 커밋하지 않는다
- staging, develop 브랜치는 삭제하지 않는다
