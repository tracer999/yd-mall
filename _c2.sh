#!/usr/bin/env bash
set -uo pipefail
cd /home/ikcho/dev/nodeWs/ydmall
rm -f _m1_tmp.sh _m3_tmp.sh _survey_tmp.js _survey_tmp.sh _eolcheck.sh
echo "=== status ==="
git status -s
git add -A
git commit -q -m "feat(M1-M3): 통제된 동적 메뉴 아키텍처 + 표준 기능 라우트 + 찜한 브랜드

메뉴 설계 전환(docs/사이트개선/shopping_mall_builder_menu_design_summary.md):
자유형 storefront_menu → 카테고리(동적) / 일반메뉴(사전정의 ON·OFF) /
커스텀메뉴(슬롯 제한) / 시스템메뉴(고정) 4분리. 위치(position)는 코드 고정.

M1 DB (scripts/migrate_menu_architecture.js, 멱등):
- feature_menu / mall_feature_menu / custom_menu / navigation_config / brand_likes 신설
- categories += mall_id, slug, depth, is_active, pc_visible, mobile_visible (최대 3뎁스)
- module_ready 게이트: 렌더 조건 = is_enabled AND module_ready → 죽은 링크 구조적 차단

M2 시드/이관:
- 기능메뉴 카탈로그 23건(gnb 13 / right_rail 5 / header_util 5), 몰1 활성 15건
- 기존 GNB 6개 → 오늘특가·베스트·신상품·이벤트&혜택 4개로 정리
- TV편성표 폐기, 쇼핑라이브·공동구매는 모듈 미구현으로 비활성

M3 표준 라우트 + 찜한 브랜드:
- routes/feature.js: /best /new /deal/today (+ /event → /boards/notice 302 별칭)
- productController: req.featurePreset 병합 (Express 5 req.query getter 변형 회피)
- 찜한 브랜드: brand_likes, POST /likes/brand/toggle, GET /mypage/brand-likes,
  브랜드 목록 하트 토글
- fix: P1.5 우측 레일의 찜 링크가 /likes(GET 404) → /mypage/likes 로 교정

tables.sql 반영, 개발문서 §6 폐기 처리 및 M 트랙 현황 갱신" 2>&1 | tail -3

GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new" git push origin main 2>&1 | tail -3
git log --oneline -1
