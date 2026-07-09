#!/usr/bin/env bash
# setup_jest.sh - Jest 테스트 환경 설치 스크립트
# 사용법: bash scripts/setup_jest.sh <project-root>
#
# admin/ 프로젝트에 Jest, 관련 의존성, 설정 파일, 테스트 헬퍼를 설치한다.

set -euo pipefail

PROJECT_ROOT="${1:-.}"
ADMIN_DIR="$PROJECT_ROOT/admin"

if [ ! -f "$ADMIN_DIR/package.json" ]; then
  echo "ERROR: $ADMIN_DIR/package.json 을 찾을 수 없습니다."
  echo "사용법: bash scripts/setup_jest.sh <project-root>"
  exit 1
fi

echo "=== Jest 테스트 환경 설치 시작 ==="

# 1. 의존성 설치
echo "[1/4] Jest 및 관련 의존성 설치 중..."
cd "$ADMIN_DIR"
npm install --save-dev \
  jest@^29 \
  @types/jest \
  jest-html-reporters \
  2>&1 | tail -3

# 2. jest.config.js 복사 (없을 경우)
echo "[2/4] jest.config.js 설정 중..."
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ ! -f "$ADMIN_DIR/jest.config.js" ]; then
  cp "$SKILL_DIR/assets/jest.config.js" "$ADMIN_DIR/jest.config.js"
  echo "  -> jest.config.js 생성 완료"
else
  echo "  -> jest.config.js 이미 존재 (건너뜀)"
fi

# 3. test-helpers 복사 (없을 경우)
echo "[3/4] 테스트 헬퍼 설정 중..."
if [ ! -d "$ADMIN_DIR/__tests__/helpers" ]; then
  mkdir -p "$ADMIN_DIR/__tests__/helpers"
  cp "$SKILL_DIR/assets/test-helpers/db-mock.js" "$ADMIN_DIR/__tests__/helpers/db-mock.js"
  cp "$SKILL_DIR/assets/test-helpers/express-mock.js" "$ADMIN_DIR/__tests__/helpers/express-mock.js"
  cp "$SKILL_DIR/assets/test-helpers/setup.js" "$ADMIN_DIR/__tests__/helpers/setup.js"
  echo "  -> __tests__/helpers/ 생성 완료"
else
  echo "  -> __tests__/helpers/ 이미 존재 (건너뜀)"
fi

# 4. package.json scripts 업데이트
echo "[4/4] package.json test 스크립트 업데이트 중..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts = pkg.scripts || {};
pkg.scripts.test = 'jest --forceExit --detectOpenHandles';
pkg.scripts['test:coverage'] = 'jest --forceExit --detectOpenHandles --coverage';
pkg.scripts['test:watch'] = 'jest --watch --forceExit --detectOpenHandles';
pkg.scripts['test:verbose'] = 'jest --forceExit --detectOpenHandles --verbose';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
echo "  -> test, test:coverage, test:watch, test:verbose 스크립트 추가 완료"

echo ""
echo "=== 설치 완료 ==="
echo "사용법:"
echo "  cd $ADMIN_DIR"
echo "  npm test                    # 테스트 실행"
echo "  npm run test:coverage       # 커버리지 포함 실행"
echo "  npm run test:verbose        # 상세 출력"
