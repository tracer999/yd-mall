#!/usr/bin/env bash
#
# 네이버 카테고리/브랜드 참조 리소스 수집 — cron 진입점
#
# 서버 crontab 에 등록할 것은 **이 한 줄뿐이고, 다시는 바뀌지 않는다**:
#
#   */5 * * * * /data/yd-mall/scripts/naver_taxonomy_cron.sh
#
# 무엇을 언제 수집할지는 크론이 아니라 **DB(naver_taxonomy_schedule)** 가 정한다.
# 이 스크립트는 5분마다 깨어나 --scheduled 로 "지금 주기가 됐는지"만 확인한다
# (기본 24시간=하루 1회). 그래서 주기를 바꾸려고 SSH 로 들어갈 일이 없다.
#
# best_ranking_cron.sh 와 동일한 골격(ENCRYPTION_KEY 로드 · nvm node · flock · exit 0).

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 0

LOG_DIR="$ROOT/logs"
LOG="$LOG_DIR/naver_taxonomy.log"
mkdir -p "$LOG_DIR"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

# --- 1. ENCRYPTION_KEY (yd-mall.sh 와 동일한 방식) ---
if [ -z "${ENCRYPTION_KEY:-}" ] && [ -r /etc/environment ]; then
  ENCRYPTION_KEY="$(grep -m1 '^ENCRYPTION_KEY=' /etc/environment | cut -d= -f2- | tr -d '"'"'"'')"
  export ENCRYPTION_KEY
fi
if [ -z "${ENCRYPTION_KEY:-}" ]; then
  log "✗ ENCRYPTION_KEY 없음 — /etc/environment 확인 필요. 수집을 건너뜁니다."
  exit 0
fi

# --- 2. Node 22 (nvm) — 비대화 셸에서도 동작 ---
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  nvm use 22 >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
fi
if ! command -v node >/dev/null 2>&1; then
  log "✗ node 를 찾을 수 없습니다 (NVM_DIR=$NVM_DIR). 수집을 건너뜁니다."
  exit 0
fi

export NODE_ENV="${NODE_ENV:-production}"

# --- 3. 중복 실행 방지 ---
LOCK="$ROOT/logs/.naver_taxonomy.lock"
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK"
  if ! flock -n 9; then
    log "이미 수집이 실행 중입니다 — 이번 tick 을 건너뜁니다."
    exit 0
  fi
fi

# --- 4. 실행 (무엇을 돌릴지는 --scheduled 가 naver_taxonomy_schedule 을 보고 정한다) ---
node scripts/sync_naver_taxonomy.js --scheduled >> "$LOG" 2>&1
rc=$?
[ $rc -ne 0 ] && log "✗ 수집 실패 (exit $rc) — 관리자 '네이버 카테고리 리소스' 화면의 로그를 확인하세요."

# cron 실패 메일 방지. 실패는 로그와 naver_taxonomy_sync_log 에 남는다.
exit 0
