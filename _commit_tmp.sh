#!/usr/bin/env bash
set -uo pipefail
cd /home/ikcho/dev/nodeWs/ydmall

echo "=== 임시파일 잔존 확인 ==="
ls _*tmp* 2>/dev/null || echo "  (없음)"

echo "=== status ==="
git status -s

git add -A
git commit -m "feat(P1.5): 레이아웃 골격(main_right_utility_v1) + 우측 유틸 레일

- views/partials/storefront/right_utility.ejs 신설: 로그인박스/장바구니/찜/최근본/멤버십/앱QR/TOP
  · 섹션이 전부 full-bleed 라 2컬럼 래핑 시 배경 잘림 회귀 → position:fixed 레일로 구현(CT-7 규약과 동일)
  · >=1600px 에서만 노출(본문 max-w-1400px 미충돌)
- page.layout_type 연동: main_layout 이 layoutType 으로 레일 노출 분기
  · mainController.getHome/getHomePreview 가 page.layout_type 주입
  · 홈 page(id=1) → main_right_utility_v1
- views/partials/storefront/header.ejs 로 헤더 분해 (main_layout 794→601줄, 렌더 결과 동일)
- 최근 본 상품: 상품 상세에서 localStorage(yd_recent_products) 적재 → 레일 패널 렌더
- 중복 렌더 제거: >=1600px 에서 레거시 #scrollTopBtn, 히어로 .hero-util-rail 숨김
- 개발문서 진행상황 갱신(P1.5 완료, CT-7 부분 반영)" 2>&1 | tail -6

echo "=== push ==="
GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new" git push origin main 2>&1 | tail -6
echo "=== 최종 ==="
git status -sb | head -2
git log --oneline -2
