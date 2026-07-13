#!/usr/bin/env bash
#
# 베스트/랭킹 집계 — cron 진입점
#
# 서버 crontab 에 등록할 것은 **이 한 줄뿐이고, 다시는 바뀌지 않는다**:
#
#   */5 * * * * /data/yd-mall/scripts/best_ranking_cron.sh
#
# 무엇을 언제 돌릴지는 크론이 아니라 **관리자 화면**이 정한다
# (/admin/best-groups → 집계 스케줄 → best_ranking_schedule 테이블).
# 이 스크립트는 5분마다 깨어나 "지금 주기가 된 기간"만 계산한다(--scheduled).
# 그래서 주기를 바꾸려고 서버에 SSH 로 들어갈 일이 없다.
#
# 이 스크립트가 흡수하는 것 (크론 라인을 단순하게 유지하려고):
#   1. ENCRYPTION_KEY  — cron 은 /etc/environment 를 자동 로드하지 않는다.
#                        없으면 config/env.js 가 process.exit(1) 한다.
#   2. node 경로       — nvm 은 비대화 셸의 PATH 에 없다. dev-mall.sh 와 같은 방식으로 로드한다.
#   3. 중복 실행       — 긴 집계가 다음 tick 과 겹치거나, 관리자의 "지금 집계"와 부딪힐 수 있다.
#   4. 종료 코드       — 실패해도 exit 0. 안 그러면 cron 이 5분마다 실패 메일을 쏜다.
#                        실패는 로그와 관리자 화면(best_ranking_run.status)에 남는다.

set -uo pipefail

# 저장소 루트 — 스크립트 위치 기준. 경로를 하드코딩하지 않는다(worktree·경로 변경에 안전).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 0

LOG_DIR="$ROOT/logs"
LOG="$LOG_DIR/best_ranking.log"
mkdir -p "$LOG_DIR"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

# --- 1. ENCRYPTION_KEY (dev-mall.sh 와 동일한 방식) ---
if [ -z "${ENCRYPTION_KEY:-}" ] && [ -r /etc/environment ]; then
  ENCRYPTION_KEY="$(grep -m1 '^ENCRYPTION_KEY=' /etc/environment | cut -d= -f2- | tr -d '"'"'"'')"
  export ENCRYPTION_KEY
fi
if [ -z "${ENCRYPTION_KEY:-}" ]; then
  log "✗ ENCRYPTION_KEY 없음 — /etc/environment 확인 필요. 집계를 건너뜁니다."
  exit 0
fi

# --- 2. Node 22 (nvm) — 비대화 셸에서도 동작하도록 (dev-mall.sh 와 동일) ---
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  nvm use 22 >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
fi
if ! command -v node >/dev/null 2>&1; then
  log "✗ node 를 찾을 수 없습니다 (NVM_DIR=$NVM_DIR). 집계를 건너뜁니다."
  exit 0
fi

export NODE_ENV="${NODE_ENV:-production}"

# --- 3. 중복 실행 방지 ---
# flock 이 없는 서버도 있으므로 없으면 그냥 진행한다(instances:1 이라 치명적이지 않다).
LOCK="$ROOT/logs/.best_ranking.lock"
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK"
  if ! flock -n 9; then
    log "이미 집계가 실행 중입니다 — 이번 tick 을 건너뜁니다."
    exit 0
  fi
fi

# --- 4. 실행 ---
# 무엇을 돌릴지는 --scheduled 가 DB(best_ranking_schedule + best_ranking_run)를 보고 정한다.
node scripts/calc_best_ranking.js --scheduled >> "$LOG" 2>&1
rc=$?
[ $rc -ne 0 ] && log "✗ 집계 실패 (exit $rc) — 관리자 화면의 집계 상태를 확인하세요."

# cron 실패 메일 방지. 실패는 로그와 best_ranking_run 에 남는다.
exit 0
