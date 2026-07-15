#!/usr/bin/env bash
# 생일 쿠폰 발급 크론 진입점 (설계 §7.1, 2차). 하루 1회 실행.
#   crontab 예: 0 9 * * * /data/yd-mall/scripts/membership_birthday_cron.sh
# ENCRYPTION_KEY 로드 · nvm node · flock 중복방지 · 항상 exit 0.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 0
LOG_DIR="$ROOT/logs"; LOG="$LOG_DIR/membership_birthday.log"; mkdir -p "$LOG_DIR"
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

LOCK="$ROOT/logs/.membership_birthday.lock"
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK"
  flock -n 9 || { log "이미 실행 중 — 건너뜀"; exit 0; }
fi

node scripts/calc_membership_birthday.js >> "$LOG" 2>&1
rc=$?
[ $rc -ne 0 ] && log "✗ 생일 쿠폰 발급 실패 (exit $rc)"
exit 0
