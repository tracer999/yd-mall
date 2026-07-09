# PR to Main — staging → main Pull Request 생성 스킬

staging 브랜치의 변경 사항을 main에 머지하기 위한 PR을 생성한다.
develop → staging은 GitHub Actions가 자동 처리하므로, 이 스킬은 스테이징 테스트 완료 후 상용 배포 시 사용한다.

## 사전 요구사항

이 스킬은 **GitHub CLI (`gh`)**가 설치 및 인증되어 있어야 한다. 아래 명령으로 확인:

```bash
gh auth status
```

### gh 미설치 시 설치 방법

**macOS (Homebrew)**:
```bash
brew install gh
```

**Ubuntu 22.04 / 24.04 (또는 WSL)**:
```bash
(type -p wget >/dev/null || (sudo apt update && sudo apt-get install wget -y)) \
  && sudo mkdir -p -m 755 /etc/apt/keyrings \
  && out=$(mktemp) && wget -nv -O$out https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  && cat $out | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
  && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && sudo apt update \
  && sudo apt install gh -y
```

### gh 인증

```bash
gh auth login
# → GitHub.com → HTTPS → Login with a web browser 선택
```

인증 후 `gh auth status`에서 `✓ Logged in` 상태여야 한다.

---

## Workflow

```
1. 사전 검증    → gh 설치/인증 확인, 브랜치 확인
2. 변경 분석    → staging과 main 사이 커밋 목록 수집
3. PR 본문 작성 → 커밋 기반 자동 요약
4. PR 생성      → gh pr create
5. 자동 머지    → gh pr merge (확인 없이 바로 실행)
6. 결과 보고    → PR URL 출력
```

## Step 0: 사전 검증

아래 명령을 **순서대로** 실행하여 환경을 검증한다. 하나라도 실패하면 사용자에게 안내 후 중단.

```bash
# 1) gh 설치 확인
gh --version

# 2) gh 인증 확인
gh auth status

# 3) 현재 브랜치 확인 (develop 또는 staging이어야 함)
git branch --show-current

# 4) 워킹 트리 클린 확인
git status --porcelain
```

| 검증 항목 | 실패 시 대응 |
|-----------|-------------|
| `gh` 미설치 | 위 설치 방법 안내 후 중단 |
| `gh auth` 미인증 | `gh auth login` 안내 후 중단 |
| 현재 브랜치가 develop/staging이 아님 | 경고 후 사용자에게 계속 여부 확인 |
| 스테이징되지 않은 변경 사항 존재 | 커밋 또는 stash 안내 후 중단 |

## Step 1: 변경 분석

staging과 main 사이의 차이를 분석한다:

```bash
# main, staging 최신화
git fetch origin main staging

# staging에만 있는 커밋 목록
git log origin/main..origin/staging --oneline --no-merges

# 변경 파일 통계
git diff origin/main..origin/staging --stat
```

**커밋이 0개인 경우**: "staging과 main이 동일합니다. PR 생성할 변경 사항이 없습니다." 출력 후 중단.

## Step 2: PR 본문 작성

수집한 커밋 목록을 기반으로 PR 제목과 본문을 작성한다.

### PR 제목 규칙
- 한국어로 작성
- 70자 이내
- 핵심 변경 사항 요약 (예: "봇 필터 강화 및 PV/UV 데이터 정확도 개선")
- 사용자가 인자로 제목을 지정한 경우 (`/merge-main 봇 필터 개선`) 해당 값을 제목으로 사용

### PR 본문 형식

```markdown
## 변경 요약
{커밋 목록을 분석하여 2-5줄로 요약}

## 커밋 목록
{git log --oneline 결과를 그대로 나열}

## 변경 파일
{변경된 파일 수 + 주요 파일 목록}

## 테스트
- [ ] 로컬 테스트 완료
- [ ] 상용 배포 후 확인

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Step 3: PR 생성

```bash
gh pr create \
  --base main \
  --head staging \
  --title "PR 제목" \
  --body "$(cat <<'EOF'
PR 본문 (Step 2에서 작성한 내용)
EOF
)"
```

PR 생성 후 출력되는 PR URL을 캡처한다.

## Step 4: 자동 머지

PR 생성 후 **사용자 확인 없이 바로 머지**한다:

```bash
gh pr merge {PR_NUMBER} --merge --delete-branch=false
```

머지 후 로컬 main을 최신화:

```bash
git fetch origin main
```

**주의사항**:
- `--delete-branch=false`: staging 브랜치는 삭제하지 않는다 (계속 사용하는 브랜치)
- 머지 방식은 `--merge` (merge commit) 사용. squash/rebase 아님.

## Step 5: 결과 보고

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  /merge-main 완료
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PR     : {PR_URL}
  Title  : {PR 제목}
  Base   : main ← staging
  Commits: {N}개
  Files  : {N}개 변경
  Status : {Created | Merged}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 에러 처리

| 상황 | 대응 |
|------|------|
| 이미 열린 PR 존재 | 기존 PR URL을 보여주고, 업데이트할지 새로 만들지 사용자에게 확인 |
| merge conflict | 충돌 파일 목록을 보여주고 해결 방법 안내 (PR은 생성하되 머지는 보류) |
| gh 권한 부족 | 필요한 scope 안내 (`repo`, `workflow`) |
| push 되지 않은 로컬 커밋 | `git push origin develop` 먼저 실행할지 사용자에게 확인 |

## 주의사항

- **staging, develop 브랜치는 절대 삭제하지 않는다** (지속적으로 사용하는 브랜치)
- PR 제목/본문은 한국어로 작성한다
- main 브랜치에 직접 커밋하지 않는다 (CLAUDE.md 규칙)
- 민감 정보(API 키, DB 비밀번호 등)가 커밋에 포함되지 않았는지 변경 파일 목록에서 확인한다
- develop → staging 머지는 GitHub Actions가 자동 처리. 이 스킬은 staging → main만 담당
