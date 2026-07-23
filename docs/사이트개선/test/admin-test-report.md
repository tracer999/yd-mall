# 관리자 테스트 보고서

- 테스트 일시: 2026-07-23
- 대상 URL: `https://yd-mall.ydata.co.kr/admin`
- 방식: Playwright 기반 브라우저 스모크 테스트
- 계정: `admin`
- 결과 요약: 9 / 9 통과

## 항목별 결과

| 항목 | 결과 | 상태/비고 |
| --- | --- | --- |
| 로그인 | 통과 | 로그인 후 `/admin/malls` 진입 확인 |
| 관리자 랜딩 (`/admin`) | 통과 | `200`, `/admin/malls` 랜딩 확인 |
| 상품 관리 (`/admin/products`) | 통과 | `200` |
| 카테고리 관리 (`/admin/categories`) | 통과 | `200` |
| 메뉴 관리 (`/admin/menus`) | 통과 | `200` |
| 주문/매출 (`/admin/sales`) | 통과 | `200` |
| 설정 (`/admin/settings`) | 통과 | `200` |
| 회원 관리 (`/admin/users`) | 통과 | `200` |
| 로그아웃 가드 | 통과 | 로그아웃 후 보호 페이지 접근 시 `/admin/login` 이동 확인 |

## 메모

- 로그인 직후 기본 진입 화면은 `/admin`이 아니라 `/admin/malls`입니다.
- 테스트 범위 내 주요 관리자 메뉴는 모두 정상 접근되었습니다.
