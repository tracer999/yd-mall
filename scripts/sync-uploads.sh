#!/usr/bin/env bash
#
# public/uploads/ 를 로컬 ↔ 개발 서버 간에 동기화한다.
#
# 업로드 이미지는 .gitignore 대상이라 git 으로는 절대 넘어가지 않는다(바이너리 수백 MB).
# 그런데 DB 는 로컬·서버가 한 벌을 공유하므로, 한쪽에서 올린 상품 이미지는
# 다른 쪽에서 경로만 있고 파일이 없어 깨진다. 그 구멍을 rsync 로 메운다.
#
# 사용법:
#   ./scripts/sync-uploads.sh            # 양방향 합집합 (기본) — 서로 없는 파일만 채운다
#   ./scripts/sync-uploads.sh pull       # 서버 → 로컬
#   ./scripts/sync-uploads.sh push       # 로컬 → 서버
#   ./scripts/sync-uploads.sh both -n    # -n / --dry-run: 실제 전송 없이 차이만 출력
#
# **삭제도 덮어쓰기도 하지 않는다**(--delete 없음, --ignore-existing).
#   - 삭제 금지: 양쪽 모두 원본이 될 수 있어, 한쪽에 없다는 사실만으로 지우면 상대편 이미지를 날린다.
#   - 덮어쓰기 금지: 업로드 파일명은 고유(타임스탬프/난수)라 같은 이름 = 같은 파일이다.
#     내용은 같은데 mtime 만 달라서 rsync 가 "변경됨"으로 보고 900 MB 를 통째로 다시 미는 것을 막는다.
set -euo pipefail

SSH_HOST="${MALL_SSH_HOST:-office.ydata.co.kr}"
SSH_PORT="${MALL_SSH_PORT:-2022}"
SSH_USER="${MALL_SSH_USER:-ydatasvc}"
SSH_PASS="${MALL_SSH_PASS:-NEWtec4075@@}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_DIR="$ROOT/public/uploads/"
REMOTE_DIR="/data/yd-mall/public/uploads/"

MODE="${1:-both}"
DRY=""
for arg in "$@"; do
    case "$arg" in
        -n|--dry-run) DRY="--dry-run" ;;
    esac
done

command -v rsync   >/dev/null || { echo "rsync 가 없습니다: sudo apt install rsync"; exit 1; }
command -v sshpass >/dev/null || { echo "sshpass 가 없습니다: sudo apt install sshpass"; exit 1; }

mkdir -p "$LOCAL_DIR"

# --ignore-existing: 수신 측에 없는 파일만 보낸다 / --out-format: 실제로 넘어간 파일명만 출력
RSYNC_OPTS=(-rlt --ignore-existing --info=stats1 --human-readable --out-format='  + %n' $DRY)
SSH_CMD="ssh -p $SSH_PORT -o StrictHostKeyChecking=no"
REMOTE="$SSH_USER@$SSH_HOST:$REMOTE_DIR"

do_pull() {
    echo "── 서버 → 로컬 ${DRY:+(dry-run)}"
    sshpass -p "$SSH_PASS" rsync "${RSYNC_OPTS[@]}" -e "$SSH_CMD" "$REMOTE" "$LOCAL_DIR"
}
do_push() {
    echo "── 로컬 → 서버 ${DRY:+(dry-run)}"
    sshpass -p "$SSH_PASS" rsync "${RSYNC_OPTS[@]}" -e "$SSH_CMD" "$LOCAL_DIR" "$REMOTE"
}

case "$MODE" in
    pull) do_pull ;;
    push) do_push ;;
    both|-n|--dry-run) do_pull; do_push ;;
    *) echo "사용법: $0 [pull|push|both] [-n]"; exit 1 ;;
esac

echo "완료."
