---
name: finish-and-deploy
description: >-
  현재 변경을 커밋·푸시(main)한 뒤, 상용 서버
  office.ydata.co.kr(/data/shopify-test)에서 git pull로 최신을 받아 문서를 반영하는 스킬.
  문서(docs/)는 dev-mall이 `/docs` 경로로 정적 서빙하므로 pull만으로 즉시 반영된다.
  사용 시점: (1) /finish-and-deploy 명령 실행 시,
  (2) docs/ 문서(리포트)를 수정한 뒤 상용에 반영할 때,
  (3) 로컬 커밋·푸시 후 서버 동기화가 필요할 때.
---

# finish-and-deploy — 커밋·푸시 + 서버 pull(docs 반영)

로컬 변경을 **커밋·푸시(main)** 한 뒤, **상용 서버에서 `git pull`** 로 최신을 받아 문서를 반영한다. `docs/` 문서는 **dev-mall이 `/docs` 경로로 정적 서빙**(`app.use('/docs', express.static(path.join(__dirname, '..', 'docs')))`)하므로, 파일을 요청마다 읽는 구조라 **콘텐츠(HTML/CSS/JS)만 바뀌면 pull만으로 즉시 반영**된다(프로세스 재시작 불필요). dev-mall 코드 자체가 바뀐 경우에만 별도로 `/deploy-dev-mall`로 dev-mall을 재기동한다.

## 배포 대상 환경

| 항목 | 값 |
|------|-----|
| SSH 호스트 | `office.ydata.co.kr` |
| 계정 | `ydatasvc` |
| 비밀번호 | `NEWtec4075@@` (비공개 저장소 정책상 기재) |
| 프로젝트 경로 | `/data/shopify-test` (모노레포 루트, git 추적) |
| 문서 루트 | `docs/` (저장소 루트의 문서·리포트, 진입 `index.html`) |
| 문서 서빙 | dev-mall이 `/docs`로 정적 서빙 → `https://dev-mall.ydata.co.kr/docs/` (포트 3006) |

> 로컬에 `sshpass`가 필요하다(`brew install sshpass`). 비밀번호는 `SSHPASS` 환경변수로 전달한다.
> 이 스킬과 [deploy-dev-mall]은 **같은 체크아웃 `/data/shopify-test`(모노레포)** 를 공유한다. `git pull`은 모노레포 전체를 당기지만 이번 변경은 `docs/`(문서)에 한정되며, **PM2 앱 재시작은 하지 않는다** — 문서는 dev-mall이 정적 서빙하므로 pull만으로 반영된다. `dev-mall` 등 같은 서버의 PM2 앱은 절대 건드리지 않는다.

## 1단계 — 로컬 커밋·푸시 (main)

1. `git status`로 변경을 확인한다. 변경이 없고 `origin/main`과 이미 동기화돼 있으면 1단계를 건너뛰고 2단계(서버 pull)만 수행한다.
2. 커밋 메시지는 **한국어**로 작성한다(사용자가 메시지를 주면 그대로 사용, 없으면 변경 내용을 요약). 커밋 본문 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` 를 붙인다.
3. push가 거부되면(원격이 앞서 있음) `git pull --rebase origin main` 후 재푸시한다.

```bash
cd /Users/tracer999/github/shopify-test
git add -A
git commit -F - <<'MSG'
<한국어 커밋 메시지>

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
MSG
git push origin main 2>&1 | tail -3 || true
# 거부 시 rebase 후 재시도
if ! git rev-list @{u}..HEAD --count 2>/dev/null | grep -q '^0$'; then
  git pull --rebase origin main 2>&1 | tail -3
  git push origin main 2>&1 | tail -3
fi
```

## 2단계 — 서버에서 git pull (한 번에 실행)

`--ff-only`로 당겨 서버를 최신 main에 맞춘다. 충돌/비-fast-forward면 멈추고 서버 git 상태를 사람에게 보고한다(임의로 reset/merge 하지 말 것).

```bash
export SSHPASS='NEWtec4075@@'
sshpass -e ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 ydatasvc@office.ydata.co.kr '
set -e
cd /data/shopify-test
echo "=== 현재 브랜치 ==="; git rev-parse --abbrev-ref HEAD
echo "=== git pull ==="; git pull --ff-only origin main 2>&1 | tail -8
echo "=== 최신 커밋 ==="; git log --oneline -1
'
```

> ⚠️ 서버가 `main` 브랜치인지 확인한다. `--ff-only` 실패(로컬 변경/충돌) 시 임의 조작 없이 보고한다.

## 3단계 — 반영 검증

```bash
export SSHPASS='NEWtec4075@@'
sshpass -e ssh -o StrictHostKeyChecking=accept-new ydatasvc@office.ydata.co.kr '
echo "=== 문서 목록 ==="; ls /data/shopify-test/docs/*.html 2>/dev/null | xargs -n1 basename
echo "=== dev-mall /docs 응답 ==="; curl -s -o /dev/null -w "/docs/ HTTP %{http_code}\n" http://127.0.0.1:3006/docs/ || echo "로컬 3006 응답 없음(dev-mall 미기동일 수 있음)"
'
```

- 로컬 `git log -1`과 서버 `git log -1`의 커밋 해시가 같으면 동기화 성공.
- dev-mall(3006)이 기동 중이면 `/docs/`가 `200`(또는 진입 리다이렉트) 응답이면 정상. dev-mall이 안 떠 있으면 `/deploy-dev-mall`로 기동한다.

## 흔한 문제

- **`sshpass` 없음**: `brew install sshpass`.
- **`--ff-only` 실패**: 서버에 로컬 커밋/충돌이 있으면 발생. 서버 `git status`를 보고만 하고 임의 reset/merge 금지.
- **권한/경로 오류**: 경로는 `/data/shopify-test` 고정. `ydatasvc` 계정으로 접근 가능한지 확인.
- **문서가 안 바뀜**: dev-mall이 정적 서빙하므로 pull만으로 반영. 캐시면 브라우저 강력 새로고침. 그래도 안 되면 dev-mall 기동 여부 확인(`/deploy-dev-mall`).
- **절대 금지**: 서버에서 `git reset --hard`/강제 merge, `pm2 kill`, 다른 앱 restart.
