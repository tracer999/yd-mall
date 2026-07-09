---
name: deploy-spfmall
description: >-
  spf-mall(Shopify 헤드리스 해외향 몰, Next.js)을 상용 서버 office.ydata.co.kr에 배포하는 스킬.
  SSH 접속 → /data/shopify-test git pull → spf-mall npm install → npm run build →
  PM2(spf-mall, ecosystem.config.cjs, fork/싱글) 재시작/기동 → 기동 검증까지 자동 수행한다.
  사용 시점: (1) /deploy-spfmall 명령 실행 시, (2) spf-mall 코드를 푸시한 뒤 상용에 반영할 때,
  (3) 상용 spf-mall 재기동이 필요할 때.
---

# deploy-spfmall — spf-mall 상용 배포

Shopify 헤드리스 해외향 몰 `spf-mall`(Next.js 16)을 상용 서버에 배포/재기동한다. **이 스킬은 `spf-mall`만 다룬다** — 같은 서버에서 돌고 있는 다른 PM2 앱(`dev-mall`, `KTL_admin`, `KTL_user_staging`, `n8n` 등)은 **절대 건드리지 않는다**.

## 배포 대상 환경

| 항목 | 값 |
|------|-----|
| SSH 호스트 | `office.ydata.co.kr` |
| 계정 | `ydatasvc` |
| 비밀번호 | `NEWtec4075@@` (비공개 저장소 정책상 기재) |
| 프로젝트 경로 | `/data/shopify-test` (모노레포 루트, git 추적) |
| 앱 경로 | `/data/shopify-test/spf-mall` |
| PM2 앱 이름 | `spf-mall` (fork/**싱글 인스턴스**, `ecosystem.config.cjs`, cluster·`-i` 금지) |
| 포트 | `3307` (`ecosystem.config.cjs`의 `PORT`, `NODE_ENV=production`) |
| 외부 도메인 | `https://spf-mall.ydata.co.kr` (nginx가 SSL 종단 후 3307로 프록시) |
| 런타임 | Node 22 (Next 16 요구: `>=20.19 <22 || >=22.12`) |

> 로컬에 `sshpass`가 필요하다(`apt install sshpass` / `brew install sshpass`). 비밀번호는 `SSHPASS` 환경변수로 전달한다.

## 사전 점검 (선택이지만 권장)

1. 로컬 `git status`가 깨끗하고 `origin/main`과 동기화돼 있어야 서버 `git pull`이 최신을 받는다. 미푸시 커밋이 있으면 먼저 `git push origin main`.
2. **`.env.local` 은 git 미추적**이다(시크릿 포함). 서버 `/data/shopify-test/spf-mall/.env.local` 이 이미 존재해야 한다(`SHOPIFY_STOREFRONT_API_TOKEN`, `APP_BASE_URL=https://spf-mall.ydata.co.kr` 등). git pull로는 갱신되지 않으므로, `.env` 계열을 바꿨다면 **서버에서 직접 수정**해야 한다.
   - 참고: 기본 언어/마켓(US/EN)은 코드 fallback(`market.ts`, `dictionaries.ts`)에도 박혀 있어 env 없이도 영문 기본이 유지된다. `SHOPIFY_DEFAULT_COUNTRY/LANGUAGE` env는 오버라이드용(선택).

## 배포 절차 (한 번에 실행)

아래 명령을 그대로 실행한다. `pull → install → build → 재시작/기동 → save`를 수행하며, spf-mall이 이미 PM2에 있으면 `restart`, 없으면 `ecosystem.config.cjs`로 `start` 한다.

```bash
export SSHPASS='NEWtec4075@@'
sshpass -e ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 ydatasvc@office.ydata.co.kr '
set -e
cd /data/shopify-test
echo "=== git pull ==="
git pull --ff-only origin main 2>&1 | tail -5
echo "=== node/npm 버전 ==="
node -v; npm -v
echo "=== npm install ==="
cd spf-mall && npm install --no-audit --no-fund 2>&1 | tail -3
echo "=== next build ==="
npm run build 2>&1 | tail -12
echo "=== PM2 재시작 또는 기동 (spf-mall, 싱글/fork, ecosystem) ==="
if pm2 describe spf-mall >/dev/null 2>&1; then
  pm2 restart spf-mall --update-env 2>&1 | tail -3
else
  pm2 start ecosystem.config.cjs 2>&1 | tail -3
fi
pm2 save 2>&1 | tail -2
'
```

> ⚠️ `--ff-only`로 pull 한다. 서버가 main 브랜치인지도 확인한다.
>
> **pull이 "로컬 변경 사항을 병합 때문에 덮어 쓰게 됩니다"로 막히는 경우**: 서버에서 `npm install`이 재생성한 `spf-mall/package-lock.json`이나 실행권한 변경(`spfmall.sh` 100644→100755) 같은 **무해한 부산물**이 원인일 때가 많다. 먼저 `git status --short`와 `git diff <파일>`로 **실제 소스 수정이 아닌지 확인**한 뒤, 부산물이면 되돌릴 수 있게 **stash로 보존**하고 pull 한다:
> ```bash
> git stash push -u -m "deploy-spfmall auto-stash" -- spf-mall/package-lock.json spfmall.sh
> git pull --ff-only origin main
> git log --oneline -1   # HEAD가 최신 커밋인지 확인
> ```
> 소스 코드에 대한 **의미 있는 로컬 수정**이 보이면 stash/pull 하지 말고 **멈추고 사람에게 보고**한다(임의 reset/merge 금지).
>
> ⚠️ `set -e` + 파이프(`... | tail`) 조합은 앞 명령 실패를 못 잡는다. pull/build 성공 여부는 종료코드로 명시적으로 확인한다.
> ⚠️ `npm run build`(Next/Turbopack)는 메모리를 꽤 쓴다. OOM으로 실패하면 로그를 보고 사람에게 알린다(임의로 swap/설정 변경 금지).

## 기동 검증 (배포 후 반드시 실행)

```bash
export SSHPASS='NEWtec4075@@'
sshpass -e ssh -o StrictHostKeyChecking=accept-new ydatasvc@office.ydata.co.kr '
echo "=== PM2 상태 ==="
pm2 describe spf-mall 2>/dev/null | grep -E "status|exec mode|restarts|script path"
echo "=== 기동 로그 ==="
pm2 logs spf-mall --lines 15 --nostream 2>&1 | tail -18
echo "=== 포트 3307 LISTEN ==="
(ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null) | grep ":3307" || echo "3307 LISTEN 안됨!"
echo "=== HTTP (도메인 Host로) ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" -H "Host: spf-mall.ydata.co.kr" http://127.0.0.1:3307/
'
```

정상 기준:
- PM2 `status: online`, `exec mode: fork_mode`, `restarts`가 비정상적으로 늘지 않음
- 로그에 `▲ Next.js 16.x` / `Ready in ...` / `Local: http://localhost:3307`
- 3307 LISTEN
- HTTP `200`(직접) 또는 nginx+SSL 뒤에서 도메인 접속 시 200. `<html lang="en-US">` 로 영문 기본 확인 가능.

## 흔한 문제

- **spf-mall 폴더 없음 / 옛 커밋**: 서버가 구버전이면 `git pull`로 해결. pull 후에도 없으면 브랜치/리모트 확인.
- **`.env.local` 없음/구버전**: 시크릿 미추적이라 서버에 직접 있어야 한다. `SHOPIFY_STOREFRONT_API_TOKEN` 누락 시 상품이 안 뜬다(빌드는 통과, 런타임 502).
- **`.next` 없음 / start 실패**: `next start`는 사전 `next build` 산출물(`.next`)이 필요하다. 배포 절차에 build가 포함돼 있으니 build 로그를 먼저 확인.
- **Node 버전**: Next 16은 Node `>=20.19 <22 || >=22.12` 요구. `node -v`가 낮으면 build/start 실패 → nvm 등으로 Node 22 사용.
- **3307 사용 중**: 다른 프로세스 점유 시 `ss -ltnp | grep 3307`. spf-mall 중복 기동이면 `pm2 restart spf-mall`.
- **절대 금지**: `pm2 kill`, `pm2 delete all`, cluster 모드(`-i`)로 기동, 다른 앱 restart/delete.

## 비고

- 외부 접속은 nginx가 `spf-mall.ydata.co.kr` SSL 종단 후 `127.0.0.1:3307`으로 프록시한다. nginx/SSL 설정은 이 스킬 범위 밖.
- 부팅 시 자동 기동까지 원하면 `pm2 startup` 1회 설정 후 `pm2 save`.
- 롤백: 문제가 생기면 서버에서 직전 커밋으로 `git reset --hard <이전커밋>` 후 재-build/restart(신중히, 사람 확인 후).
