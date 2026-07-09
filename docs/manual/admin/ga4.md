# GA4 설정/추적 (관리자)

## 1) GA4 측정 ID 등록
1. 관리자 메뉴 → **사이트 설정** 이동
2. `Google Analytics 4 측정 ID` 입력 (예: `G-XXXXXXXXXX`)
3. 저장 후 사용자 사이트를 새로고침

> 측정 ID가 비어 있으면 GA4 스크립트는 삽입되지 않습니다.

## 2) 적용 방식
- 사용자 레이아웃(`main_layout.ejs`)에서 측정 ID가 있을 때만 gtag 스니펫을 삽입합니다.
- GA 이벤트는 페이지 내 스크립트에서 `window.gtag('event', ...)` 호출로 전송됩니다.

## 3) 기본 이벤트 매핑
- **view_item**: 상품 상세 페이지 로드 시 자동 전송
- **add_to_cart**: 상품 상세에서 장바구니 추가 시 전송 (수량 반영)
- **begin_checkout**: 상세 페이지에서 구매하기 클릭 시 전송 (수량/금액 반영)
- **purchase**: 주문 완료 페이지에서 전송 (주문번호, 금액, 품목 목록 반영)

## 4) 데이터 필드
- `items[].item_id`: 상품 slug가 있으면 slug, 없으면 product id
- `items[].item_name`: 상품명
- `items[].item_brand`: 공급사(provider)
- `items[].item_category`: 카테고리명
- `items[].price`: 결제 단가 (회원가가 있으면 회원가)
- `items[].quantity`: 수량
- `currency`: `KRW`
- `value`: 총 금액

## 5) 점검 방법
- GA4 DebugView 또는 브라우저 개발자 도구의 네트워크 탭에서 `collect` 요청 확인
- 측정 ID 오타나 adblock 필터가 없는지 확인

## 6) 배포/DB 반영 체크리스트
- DB 컬럼 추가 (운영 DB에 직접 실행 필요)
  - `ALTER TABLE site_settings ADD COLUMN ga4_measurement_id VARCHAR(32);`
- 관리자 화면에서 측정 ID 입력 및 저장
- 실서버에서 이벤트 유입 확인 (DebugView 또는 Realtime)
