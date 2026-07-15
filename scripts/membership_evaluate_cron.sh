#!/usr/bin/env bash
# 멤버십 등급 정기 평가 크론 진입점 (설계 §6.4). best_ranking_cron.sh 와 동일 패턴.
#
#   crontab (예: 하루 1회 새벽 4시 — 실제 주기는 각 몰 정책 evaluation_cycle 이 정한다):
#     0 4 * * * /data/yd-mall/scripts/membership_evaluate_cron.sh
#
# 스크립트가 흡수: ENCRYPTION_KEY 로드 · nvm node · flock 중복방지 · 항상 exit 0(실패메일 억제).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 0
LOG_DIR="$ROOT/logs"; LOG="$LOG_DIR/membership_evaluate.log"; mkdir -p "$LOG_DIR"
log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

# 1. ENCRYPTION_KEY — cron 은 /etc/environment 를 자동 로드하지 않는다
if [ -z "${ENCRYPTION_KEY:-}" ] && [ -r /etc/environment ]; then
  ENCRYPTION_KEY="$(grep -m1 '^ENCRYPTION_KEY=' /etc/environment | cut -d= -f2- | tr -d '"'"'"'')"
  export ENCRYPTION_KEY
fi
[ -z "${ENCRYPTION_KEY:-}" ] && { log "✗ ENCRYPTION_KEY 없음 — 평가 건너뜀"; exit 0; }

# 2. Node 22 (nvm) — 비대화 셸
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  nvm use 22 >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
fi
command -v node >/dev/null 2>&1 || { log "✗ node 없음"; exit 0; }
export NODE_ENV="${NODE_ENV:-production}"

# 3. 중복 실행 방지 (flock)
LOCK="$ROOT/logs/.membership_evaluate.lock"
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK"
  flock -n 9 || { log "이미 평가 실행 중 — 건너뜀"; exit 0; }
fi

# 4. 실행 — 주기 도래한 몰만 (정책 evaluation_cycle 기준)
node scripts/calc_membership_grade.js --scheduled >> "$LOG" 2>&1
rc=$?
[ $rc -ne 0 ] && log "✗ 평가 실패 (exit $rc)"
exit 0
