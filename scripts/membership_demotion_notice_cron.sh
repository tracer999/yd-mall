#!/usr/bin/env bash
# 강등 사전 안내 크론 진입점 (설계 §14, 2차). 월 배치(정기 평가 며칠 전 권장).
#   crontab 예: 0 9 25 * * /data/yd-mall/scripts/membership_demotion_notice_cron.sh
# ENCRYPTION_KEY 로드 · nvm node · flock 중복방지 · 항상 exit 0.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 0
LOG_DIR="$ROOT/logs"; LOG="$LOG_DIR/membership_demotion_notice.log"; mkdir -p "$LOG_DIR"
log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

if [ -z "${ENCRYPTION_KEY:-}" ] && [ -r /etc/environment ]; then
  ENCRYPTION_KEY="$(grep -m1 '^ENCRYPTION_KEY=' /etc/environment | cut -d= -f2- | tr -d '"'"'"'')"
  export ENCRYPTION_KEY
fi
[ -z "${ENCRYPTION_KEY:-}" ] && { log "✗ ENCRYPTION_KEY 없음 — 건너뜀"; exit 0; }

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  nvm use 22 >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
fi
command -v node >/dev/null 2>&1 || { log "✗ node 없음"; exit 0; }
export NODE_ENV="${NODE_ENV:-production}"

LOCK="$ROOT/logs/.membership_demotion_notice.lock"
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK"
  flock -n 9 || { log "이미 실행 중 — 건너뜀"; exit 0; }
fi

node scripts/calc_membership_demotion_notice.js >> "$LOG" 2>&1
rc=$?
[ $rc -ne 0 ] && log "✗ 강등 사전 안내 실패 (exit $rc)"
exit 0
