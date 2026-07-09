#!/usr/bin/env bash
# run_coverage.sh - 테스트 실행 + 커버리지 리포트 생성
# 사용법: bash scripts/run_coverage.sh <admin-dir> [threshold]
#
# threshold: 최소 커버리지 퍼센트 (기본값: 90)

set -euo pipefail

ADMIN_DIR="${1:-.}"
THRESHOLD="${2:-90}"

if [ ! -f "$ADMIN_DIR/package.json" ]; then
  echo "ERROR: $ADMIN_DIR/package.json 을 찾을 수 없습니다."
  exit 1
fi

cd "$ADMIN_DIR"

echo "=== 단위 테스트 + 커버리지 리포트 ==="
echo "타겟: $ADMIN_DIR"
echo "최소 커버리지: ${THRESHOLD}%"
echo ""

# Jest 설치 확인
if [ ! -d "node_modules/jest" ]; then
  echo "ERROR: Jest가 설치되지 않았습니다. setup_jest.sh를 먼저 실행하세요."
  exit 1
fi

# 테스트 실행 (커버리지 포함)
npx jest \
  --forceExit \
  --detectOpenHandles \
  --coverage \
  --coverageReporters=text \
  --coverageReporters=text-summary \
  --coverageReporters=html \
  --coverageThreshold="{\"global\":{\"branches\":${THRESHOLD},\"functions\":${THRESHOLD},\"lines\":${THRESHOLD},\"statements\":${THRESHOLD}}}" \
  --verbose \
  2>&1

EXIT_CODE=$?

echo ""
echo "=== 결과 ==="
if [ $EXIT_CODE -eq 0 ]; then
  echo "SUCCESS: 모든 테스트 통과, 커버리지 ${THRESHOLD}% 이상 달성"
else
  echo "FAILURE: 테스트 실패 또는 커버리지 미달 (exit code: $EXIT_CODE)"
fi

echo ""
echo "HTML 리포트: $ADMIN_DIR/coverage/index.html"
exit $EXIT_CODE
