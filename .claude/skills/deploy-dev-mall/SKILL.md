---
name: deploy-dev-mall
description: >-
  dev-mall(자체 쇼핑몰)을 상용 서버 office.ydata.co.kr에 배포하는 스킬.
  SSH 접속 → /data/shopify-test git pull → dev-mall npm install →
  PM2(dev-mall, 싱글/fork) 재시작/기동 → 기동 검증까지 자동 수행한다.
  사용 시점: (1) /deploy-dev-mall 명령 실행 시, (2) dev-mall 코드를 푸시한 뒤 상용에 반영할 때,
  (3) 상용 dev-mall 재기동이 필요할 때.
---

# deploy-dev-mall — dev-mall 상용 배포

자체 쇼핑몰 `dev-mall`을 상용 서버에 배포/재기동한다. **이 스킬은 `dev-mall`만 다룬다** — 같은 서버에서 돌고 있는 다른 PM2 앱(`KTL_admin`, `KTL_user_staging`, `n8n` 등)은 **절대 건드리지 않는다**.

## 배포 대상 환경

| 항목 | 값 |
|------|-----|
| SSH 호스트 | `office.ydata.co.kr` |
| 계정 | `ydatasvc` |
| 비밀번호 | `NEWtec4075@@` (비공개 저장소 정책상 기재) |
| 프로젝트 경로 | `/data/shopify-test` (모노레포 루트, git 추적) |
| 앱 경로 | `/data/shopify-test/dev-mall` |
| PM2 앱 이름 | `dev-mall` (fork/**싱글 인스턴스**, cluster·`-i` 금지) |
| 포트 | `3006` (`.env.production`, `NODE_ENV=production`) |
| 외부 도메인 | `https://dev-mall.ydata.co.kr` (nginx가 SSL 종단 후 3006으로 프록시) |

> 로컬에 `sshpass`가 필요하다(`brew install sshpass`). 비밀번호는 `SSHPASS` 환경변수로 전달한다.

## 사전 점검 (선택)

먼저 푸시가 끝났는지 확인한다. 로컬에서 `git status`가 깨끗하고 `origin/main`과 동기화돼 있어야 서버 `git pull`이 최신을 받는다. 미푸시 커밋이 있으면 먼저 push 한다.

## 배포 절차 (한 번에 실행)

아래 명령을 그대로 실행한다. `pull → install → 재시작/기동 → save`를 수행하며, dev-mall이 이미 PM2에 있으면 `restart`, 없으면 `start` 한다.

```bash
export SSHPASS='NEWtec4075@@'
sshpass -e ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 ydatasvc@office.ydata.co.kr '
set -e
cd /data/shopify-test
echo "=== git pull ==="
git pull --ff-only origin main 2>&1 | tail -5
echo "=== npm install ==="
cd dev-mall && npm install --no-audit --no-fund 2>&1 | tail -3
echo "=== PM2 재시작 또는 기동 (dev-mall, 싱글/fork) ==="
if pm2 describe dev-mall >/dev/null 2>&1; then
  NODE_ENV=production pm2 restart dev-mall --update-env 2>&1 | tail -3
else
  NODE_ENV=production pm2 start app.js --name dev-mall 2>&1 | tail -3
fi
pm2 save 2>&1 | tail -2
'
```

> ⚠️ `--ff-only`로 pull 한다. 충돌/비-fast-forward면 멈추고 서버 git 상태를 사람에게 보고한다(임의로 reset/merge 하지 말 것). 서버가 main 브랜치인지도 확인한다.

## 기동 검증 (배포 후 반드시 실행)

```bash
export SSHPASS='NEWtec4075@@'
sshpass -e ssh -o StrictHostKeyChecking=accept-new ydatasvc@office.ydata.co.kr '
echo "=== PM2 상태 ==="
pm2 describe dev-mall 2>/dev/null | grep -E "status|exec mode|restarts|script path" 
echo "=== env 로딩 / 기동 로그 ==="
pm2 logs dev-mall --lines 15 --nostream 2>&1 | tail -18
echo "=== 포트 3006 LISTEN ==="
(ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null) | grep ":3006" || echo "3006 LISTEN 안됨!"
echo "=== HTTP (도메인 Host로) ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" -H "Host: dev-mall.ydata.co.kr" http://127.0.0.1:3006/
'
```

정상 기준:
- PM2 `status: online`, `exec mode: fork_mode`, `restarts`가 비정상적으로 늘지 않음
- 로그에 `[env] NODE_ENV=production, Loaded: .env → .env.production`, `Server running on http://0.0.0.0:3006`
- 3006 LISTEN
- HTTP `301`(→ `https://dev-mall.ydata.co.kr/`, `FORCE_HTTPS=true` 때문이라 정상). nginx+SSL 뒤에서는 200.

## 흔한 문제

- **dev-mall 폴더 없음 / 옛 커밋**: 서버가 구버전이면 `git pull`로 해결. pull 후에도 없으면 브랜치/리모트 확인.
- **3006 사용 중**: 다른 프로세스가 점유 시 `ss -ltnp | grep 3006`으로 확인. dev-mall 중복 기동이면 `pm2 restart dev-mall`.
- **DB/Redis 연결 오류**: `.env.production`의 DB/Redis가 `ydata.co.kr`(또는 동일 머신이면 localhost)인지 확인. 로그의 `Failed to load system_settings` 메시지 확인.
- **카카오/OAuth 변경 미반영**: 설정은 기동 시 `system_settings`→`process.env`로 주입되므로 DB 변경 후 `pm2 restart dev-mall` 필요.
- **절대 금지**: `pm2 kill`, `pm2 delete all`, cluster 모드(`-i`)로 dev-mall 기동, 다른 앱 restart.

## 비고

- 외부 접속은 nginx가 `dev-mall.ydata.co.kr` SSL 종단 후 `127.0.0.1:3006`으로 프록시한다. nginx/SSL 설정은 이 스킬 범위 밖(별도 설정 필요).
- 부팅 시 자동 기동까지 원하면 `pm2 startup` 1회 설정 후 `pm2 save`.
