#!/usr/bin/env bash
#
# dev-mall(국내몰, Express) 만 PM2로 관리하는 스크립트.
# (spf-mall / spf-admin 등 다른 앱은 건드리지 않는다.)
#
# 사용법:
#   ./dev-mall.sh start            # dev-mall 기동/갱신 (상용, NODE_ENV=production) [기본]
#   ./dev-mall.sh start dev        # dev-mall 기동/갱신 (개발, NODE_ENV=development)
#   ./dev-mall.sh dev              # 위와 동일(개발 모드 기동 단축)
#   ./dev-mall.sh restart [dev]    # 재시작 (dev 지정 시 개발 모드)
#   ./dev-mall.sh stop             # dev-mall 중지
#   ./dev-mall.sh delete           # dev-mall PM2에서 제거
#   ./dev-mall.sh status           # 상태 표시
#   ./dev-mall.sh logs             # 로그(tail)
#   ./dev-mall.sh build            # 의존성 설치 + Tailwind CSS 빌드만
#
# 환경 구분(config/env.js): NODE_ENV 하나로 env 파일이 결정된다.
#   production  → .env → .env.production  (PORT=3006)
#   development → .env → .env.development (PORT=3006, 로컬도 상용과 동일 포트로 통일)
# 두 모드의 실질 차이는 로드되는 env 파일과 NODE_ENV(예: 세션 쿠키 secure) 이며 포트는 동일(3006).
# 런타임: Node 22 (nvm) — 비대화 셸에서도 동작하도록 nvm을 로드한다.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_MALL_DIR="$ROOT/dev-mall"
APP="dev-mall"

# --- Node 22 (nvm) 로드 ---
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  nvm use 22 >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
fi
echo "node $(node -v 2>/dev/null) / npm $(npm -v 2>/dev/null)"

# --- pm2 확인 ---
if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2가 설치되어 있지 않아 설치합니다..."
  npm i -g pm2
fi

# --- 실행 모드 판별 (인자 중 dev/development 이 있으면 개발 모드) ---
PM2_ENV="production"
PORT_INFO="3006 (.env.production)"
for arg in "$@"; do
  case "$arg" in
    dev|development)
      PM2_ENV="development"
      PORT_INFO="3006 (.env.development)"
      ;;
  esac
done

build_dev() {
  echo "▶ dev-mall 의존성 설치 (npm install)..."
  ( cd "$DEV_MALL_DIR" && npm install )
  echo "▶ dev-mall Tailwind CSS 빌드..."
  ( cd "$DEV_MALL_DIR" && npm run build:css )
}

up() {
  echo "▶ dev-mall 기동/갱신 (NODE_ENV=$PM2_ENV, 포트 $PORT_INFO)..."
  ( cd "$DEV_MALL_DIR" && pm2 startOrRestart ecosystem.config.cjs --env "$PM2_ENV" --update-env )
  pm2 save >/dev/null 2>&1 || true
  pm2 status
}

CMD="${1:-start}"
case "$CMD" in
  start|restart) up ;;
  dev)           up ;;   # 개발 모드 기동 단축 (PM2_ENV는 위에서 development로 판별됨)
  build)         build_dev ;;
  stop)          pm2 stop "$APP"; pm2 status ;;
  delete)        pm2 delete "$APP" || true; pm2 status ;;
  status)        pm2 status ;;
  logs)          pm2 logs "$APP" --lines 50 ;;
  *)
    echo "사용법: $0 {start [dev]|restart [dev]|dev|stop|status|logs|delete|build}"
    exit 1
    ;;
esac
