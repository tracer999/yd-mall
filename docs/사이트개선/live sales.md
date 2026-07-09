1차 MVP 기준 라이브 판매 페이지 구현 설계

기준은 다음입니다.

YouTube Live 또는 Vimeo embed
+ 자체 쇼핑몰 상품/구매 UI
+ 자체 쿠폰/혜택/공지
+ 자체 장바구니/바로구매
+ 최소 관리자 기능

YouTube는 공식적으로 IFrame Player API를 제공하며, 웹사이트 안에 YouTube 플레이어를 삽입하고 JavaScript로 재생 상태 등을 제어할 수 있습니다. 또한 embedded player parameters 문서를 통해 autoplay, controls, playsinline 등 일부 플레이어 옵션을 설정할 수 있습니다. 다만 YouTube 플레이어 자체의 브랜딩과 동작을 완전히 제거하거나 자체 플레이어처럼 만드는 것은 제한적입니다.

1. MVP 목표
목표

라이브커머스 플랫폼 전체를 만드는 것이 아니라, 기존 쇼핑몰 안에 라이브 판매 전용 랜딩 페이지를 추가하는 것입니다.

목표:
사용자가 우리 사이트 안에서 라이브를 보고,
동시에 상품을 확인하고,
쿠폰을 받고,
장바구니 또는 바로구매까지 진행할 수 있게 하는 것
MVP에서 하지 않는 것
제외:
- 자체 스트리밍 서버
- 자체 라이브 채팅
- 실시간 시청자 수 정확 집계
- 실시간 투표/이벤트
- 쇼호스트 콘솔
- 방송 중 상품 자동 전환
- PIP 고도화
- 자체 VOD 인코딩

초기에는 외부 영상 + 자체 커머스 UI가 핵심입니다.

2. 전체 구조
[관리자]
  ├─ 라이브 방송 등록
  ├─ 외부 영상 URL 등록
  ├─ 방송 상품 연결
  ├─ 쿠폰/혜택 연결
  ├─ 공지 등록
  └─ 노출 상태 관리

        ↓

[Backend API]
  ├─ Live Show API
  ├─ Live Product API
  ├─ Coupon API
  ├─ Cart API
  ├─ Order API
  └─ Tracking API

        ↓

[사용자 라이브 판매 페이지]
  ├─ 외부 영상 embed
  ├─ 방송 정보
  ├─ 대표 상품
  ├─ 함께 판매 상품
  ├─ 쿠폰/혜택
  ├─ 공지
  ├─ 장바구니
  └─ 바로구매
3. 사용자 화면 설계
3-1. 모바일 화면

모바일 우선으로 설계해야 합니다. 라이브 판매는 모바일 소비가 많고, 영상과 구매 버튼을 동시에 보여줘야 하기 때문입니다.

[상단 Header]
← 뒤로가기     라이브쇼 제목        공유

[영상 영역]
YouTube/Vimeo iframe player
LIVE 배지 / 방송 상태 / 남은 시간

[현재 상품 영역]
대표 상품 카드
가격 / 할인 / 쿠폰 / 무료배송
[쿠폰받기] [바로구매]

[탭]
상품 | 혜택 | 공지 | 문의

[상품 탭]
대표 상품
함께 판매 상품 리스트

[혜택 탭]
다운로드 쿠폰
카드 할인
적립금
무료배송 조건

[공지 탭]
배송 안내
이벤트 유의사항
옵션 안내

[하단 고정 바]
장바구니 | 바로구매
3-2. PC 화면
[Header / GNB]

좌측 영역
├─ 라이브 영상
├─ 방송 설명
└─ 공지

우측 고정 패널
├─ 대표 상품
├─ 가격/혜택
├─ 옵션 선택
├─ 쿠폰받기
├─ 장바구니
└─ 바로구매

하단 영역
├─ 함께 판매 상품
├─ 추천 상품
└─ 공지/문의

PC에서는 영상과 구매 패널이 동시에 보여야 합니다.
사용자가 상품 상세로 이동하지 않아도 기본 구매 판단이 가능해야 합니다.

4. 핵심 기능 구성
4-1. 라이브 영상 embed
기능
- YouTube Live URL 또는 Video ID 등록
- iframe embed 생성
- 방송 상태별 표시
  - 예정
  - 방송 중
  - 종료
- 종료 후 다시보기 URL 표시
- 영상 로딩 실패 처리
- 모바일 inline 재생 옵션 적용
YouTube embed 예시
<iframe
  src="https://www.youtube.com/embed/{videoId}?autoplay=0&controls=1&playsinline=1&rel=0&enablejsapi=1"
  title="Live shopping video"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  allowfullscreen>
</iframe>

enablejsapi=1을 사용하면 IFrame Player API로 플레이어 상태를 제어할 수 있고, playsinline은 모바일에서 전체화면 강제 전환을 줄이는 데 사용됩니다. YouTube의 embed parameter는 공식 문서에서 제공되는 범위 내에서만 제어 가능합니다.

주의점
YouTube embed 한계:
- YouTube 로고/플레이어 요소가 남을 수 있음
- 완전한 커스텀 플레이어 UI는 불가
- 영상 클릭 시 YouTube로 이동 가능성 있음
- 외부 추천/브랜딩 정책 영향 가능

그래서 MVP에서는 이질감을 완전히 제거하는 것이 아니라 쇼핑몰 UI로 감싸서 완화하는 전략이 맞습니다.

5. 방송 상태 설계

라이브쇼는 상태값이 중요합니다.

SCHEDULED  = 방송 예정
ON_AIR     = 방송 중
ENDED      = 방송 종료
HIDDEN     = 비노출
CANCELLED  = 방송 취소
상태별 화면
상태	화면 처리
방송 예정	썸네일, 방송 시작 시간, 알림 신청, 판매 예정 상품
방송 중	영상 embed, LIVE 배지, 구매 버튼 활성화
방송 종료	다시보기 영상, 상품 구매 유지 또는 종료 처리
비노출	접근 불가 또는 목록 제외
취소	방송 취소 안내
상태 계산 방식

초기에는 수동 상태 + 시간 조건 혼합이 적절합니다.

관리자 상태값 = 기본 기준
현재 시간 >= start_at && 현재 시간 <= end_at && status = ON_AIR
→ 방송 중으로 표시

관리자가 직접 ON_AIR, ENDED를 바꿀 수 있어야 합니다.
외부 라이브 URL 방식에서는 실제 방송 시작 여부를 완벽히 자동 감지하기 어렵기 때문입니다.

6. 상품 노출 기능
6-1. 대표 상품

대표 상품은 라이브 판매 페이지의 핵심 전환 요소입니다.

대표 상품 표시 항목:
- 상품 이미지
- 브랜드명
- 상품명
- 정상가
- 판매가
- 할인율
- 쿠폰 적용가
- 무료배송 여부
- 카드 혜택
- 리뷰 평점
- 재고 상태
- 구매 버튼
6-2. 함께 판매 상품
함께 판매 상품:
- 방송에서 같이 소개되는 상품
- 세트 상품
- 옵션 대체 상품
- 관련 상품
- 방송 종료 후에도 판매할 상품
6-3. 상품 역할 구분
MAIN      = 대표 상품
RELATED   = 함께 판매 상품
PINNED    = 현재 강조 상품
UPSELL    = 추가 구매 추천 상품
HIDDEN    = 방송 페이지에서는 숨김

MVP에서는 MAIN, RELATED만 있어도 충분합니다.

7. 구매 UX 설계
7-1. 권장 구매 방식

MVP에서는 두 가지 방식을 모두 지원하는 것이 좋습니다.

방식 A:
상품 상세 페이지 이동

방식 B:
라이브 페이지 내 옵션 선택 Bottom Sheet

냉정하게 보면 방식 B가 더 좋지만, 구현 난이도는 더 높습니다.

1차 MVP 추천
모바일:
- 대표 상품은 Bottom Sheet 옵션 선택
- 함께 판매 상품은 상품 상세 이동 가능

PC:
- 우측 패널에서 옵션 선택
- 장바구니 / 바로구매 처리
7-2. 모바일 Bottom Sheet
[옵션 선택 Bottom Sheet]
├─ 상품 이미지
├─ 상품명
├─ 가격
├─ 옵션 선택
├─ 수량 선택
├─ 쿠폰 적용 가능 여부
├─ 최종 결제 예상 금액
├─ 장바구니 담기
└─ 바로구매
7-3. 구매 플로우
사용자 라이브 페이지 진입
→ 영상 시청
→ 대표 상품 확인
→ 쿠폰받기
→ 옵션 선택
→ 장바구니 또는 바로구매
→ 결제 페이지 이동

결제는 기존 쇼핑몰 결제 프로세스를 그대로 사용합니다.
라이브 기능은 주문/결제 시스템을 새로 만들 필요가 없습니다.

8. 쿠폰/혜택 기능
8-1. MVP 쿠폰 기능
- 라이브 전용 쿠폰 연결
- 쿠폰 다운로드
- 다운로드 여부 표시
- 쿠폰 적용 가능 상품 표시
- 쿠폰 만료 시간 표시
8-2. 혜택 표시
혜택 표시 항목:
- 방송 특가
- 쿠폰 할인
- 카드 할인
- 무료배송
- 사은품
- 적립 예정 금액
8-3. 쿠폰 연결 방식
live_show_coupon
├─ live_show_id
├─ coupon_id
├─ display_order
├─ is_primary
└─ is_active

쿠폰은 기존 쿠폰 엔진을 재사용하고, 라이브쇼에는 연결만 하는 구조가 좋습니다.

9. 공지 기능

채팅을 넣지 않는 대신, MVP에서는 공지를 반드시 넣는 것이 좋습니다.

공지 예시:
- 방송 중 주문 시 무료배송
- 특정 옵션은 배송 지연
- 쿠폰은 방송 종료 후 1시간까지 사용 가능
- 사은품은 선착순 지급
- 교환/반품 조건
공지 표시 위치
모바일:
- 탭 영역의 공지 탭
- 중요 공지는 영상 아래 고정 박스

PC:
- 영상 아래
- 우측 구매 패널 하단
10. 문의/Q&A 기능

MVP에서 실시간 채팅은 제외해도 되지만, 문의 등록은 있으면 좋습니다.

MVP Q&A:
- 사용자 질문 등록
- 관리자 답변
- 공개/비공개 설정
- 상품별 질문 구분

실시간이 아니어도 됩니다.

실시간 채팅 ≠ 필수
상품 문의/Q&A = 전환에 도움
11. 관리자 기능 설계

관리자 메뉴는 다음처럼 추가합니다.

관리자
└─ 라이브쇼 관리
    ├─ 라이브쇼 목록
    ├─ 라이브쇼 등록/수정
    ├─ 방송 상품 관리
    ├─ 쿠폰/혜택 연결
    ├─ 공지 관리
    ├─ 문의 관리
    └─ 성과 통계
11-1. 라이브쇼 등록/수정
항목	설명
방송명	라이브 페이지 제목
방송 설명	간단한 소개
대표 이미지	방송 전/종료 후 썸네일
외부 영상 플랫폼	YouTube / Vimeo / 직접 iframe
영상 ID 또는 URL	YouTube videoId 등
방송 시작 시간	start_at
방송 종료 시간	end_at
방송 상태	예정/방송중/종료/숨김
다시보기 URL	종료 후 VOD
노출 여부	목록 노출 여부
구매 가능 여부	방송 종료 후 구매 가능 여부
11-2. 방송 상품 관리
항목	설명
대표 상품	MAIN 상품 1개
함께 판매 상품	RELATED 상품 N개
노출 순서	상품 표시 순서
방송 전용 문구	“방송 한정 특가” 등
방송 전용 가격	기존 가격 정책이 있으면 선택
구매 가능 여부	상품별 제어
품절 노출 여부	품절이어도 보여줄지
11-3. 쿠폰/혜택 연결
항목	설명
연결 쿠폰	기존 쿠폰 선택
대표 쿠폰	가장 강조할 쿠폰
노출 순서	쿠폰 카드 순서
노출 기간	방송 중/방송 종료 후
자동 다운로드 여부	비추천. 사용자가 직접 받게 하는 것이 명확함
11-4. 공지 관리
항목	설명
공지 제목	예: 배송 안내
공지 내용	상세 내용
중요도	일반/중요
노출 위치	영상 아래/공지 탭/구매 패널
노출 기간	시작/종료
사용 여부	ON/OFF
12. DB 설계
12-1. live_show
CREATE TABLE live_show (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  mall_id BIGINT NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  thumbnail_url VARCHAR(500) NULL,

  provider VARCHAR(30) NOT NULL,
  video_id VARCHAR(200) NULL,
  embed_url VARCHAR(1000) NULL,
  replay_url VARCHAR(1000) NULL,

  start_at DATETIME NOT NULL,
  end_at DATETIME NULL,
  status VARCHAR(30) NOT NULL,

  purchase_enabled BOOLEAN DEFAULT TRUE,
  replay_enabled BOOLEAN DEFAULT FALSE,
  is_visible BOOLEAN DEFAULT TRUE,

  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
12-2. live_show_product
CREATE TABLE live_show_product (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  live_show_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,

  role VARCHAR(30) NOT NULL,
  sort_order INT DEFAULT 0,

  live_badge_text VARCHAR(100) NULL,
  purchase_enabled BOOLEAN DEFAULT TRUE,
  visible BOOLEAN DEFAULT TRUE,

  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
12-3. live_show_coupon
CREATE TABLE live_show_coupon (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  live_show_id BIGINT NOT NULL,
  coupon_id BIGINT NOT NULL,

  is_primary BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,

  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
12-4. live_show_notice
CREATE TABLE live_show_notice (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  live_show_id BIGINT NOT NULL,

  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  notice_level VARCHAR(30) DEFAULT 'NORMAL',
  display_location VARCHAR(30) DEFAULT 'NOTICE_TAB',

  visible_start_at DATETIME NULL,
  visible_end_at DATETIME NULL,
  is_active BOOLEAN DEFAULT TRUE,

  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
12-5. live_show_question
CREATE TABLE live_show_question (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  live_show_id BIGINT NOT NULL,
  product_id BIGINT NULL,
  user_id BIGINT NOT NULL,

  question_text TEXT NOT NULL,
  answer_text TEXT NULL,
  status VARCHAR(30) DEFAULT 'WAITING',
  is_public BOOLEAN DEFAULT TRUE,

  answered_by BIGINT NULL,
  answered_at DATETIME NULL,

  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
12-6. live_show_event_log
CREATE TABLE live_show_event_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  live_show_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  session_id VARCHAR(100) NULL,

  event_type VARCHAR(50) NOT NULL,
  product_id BIGINT NULL,
  metadata_json JSON NULL,

  created_at DATETIME NOT NULL
);
13. API 설계
13-1. 사용자 API
GET /api/live-shows

라이브쇼 목록 조회.

GET /api/live-shows/{liveShowId}

라이브쇼 상세 조회.

응답 예시:

{
  "id": 1001,
  "title": "여름 특가 라이브",
  "provider": "YOUTUBE",
  "videoId": "abc123",
  "embedUrl": "https://www.youtube.com/embed/abc123",
  "status": "ON_AIR",
  "startAt": "2026-07-09T20:00:00",
  "endAt": "2026-07-09T21:00:00",
  "products": [
    {
      "productId": 501,
      "role": "MAIN",
      "name": "대표 상품",
      "salePrice": 39000,
      "imageUrl": "https://..."
    }
  ],
  "coupons": [],
  "notices": []
}
POST /api/live-shows/{liveShowId}/questions

질문 등록.

POST /api/live-shows/{liveShowId}/events

이벤트 로그 적재.

예:

{
  "eventType": "CLICK_BUY",
  "productId": 501
}
13-2. 관리자 API
GET /admin/api/live-shows
POST /admin/api/live-shows
GET /admin/api/live-shows/{id}
PUT /admin/api/live-shows/{id}
DELETE /admin/api/live-shows/{id}
POST /admin/api/live-shows/{id}/products
PUT /admin/api/live-shows/{id}/products/{mappingId}
DELETE /admin/api/live-shows/{id}/products/{mappingId}
POST /admin/api/live-shows/{id}/coupons
DELETE /admin/api/live-shows/{id}/coupons/{mappingId}
POST /admin/api/live-shows/{id}/notices
PUT /admin/api/live-shows/{id}/notices/{noticeId}
DELETE /admin/api/live-shows/{id}/notices/{noticeId}
14. 프론트엔드 컴포넌트 설계
LiveShoppingPage
├─ LiveHeader
├─ LiveVideoPlayer
├─ LiveStatusBadge
├─ LiveMainProductCard
├─ LiveBenefitPanel
├─ LiveProductTabs
│   ├─ LiveProductList
│   ├─ LiveCouponList
│   ├─ LiveNoticeList
│   └─ LiveQuestionList
├─ LivePurchaseBottomBar
└─ OptionBottomSheet
LiveVideoPlayer
역할:
- provider에 따라 player 렌더링
- YouTube iframe 생성
- Vimeo iframe 생성
- fallback thumbnail 표시
- loading/error 처리
LiveMainProductCard
역할:
- 대표 상품 표시
- 가격/혜택 표시
- 쿠폰받기 버튼
- 구매 버튼
LivePurchaseBottomBar
역할:
- 모바일 하단 고정 CTA
- 장바구니
- 바로구매
- 품절 시 비활성화
15. 상품/구매 연동 방식

기존 쇼핑몰에 상품/장바구니/주문 기능이 있다면 그대로 재사용합니다.

장바구니
POST /api/cart/items

요청:

{
  "productId": 501,
  "skuId": 9001,
  "quantity": 1,
  "sourceType": "LIVE_SHOW",
  "sourceId": 1001
}
바로구매
POST /api/orders/checkout-ready

요청:

{
  "items": [
    {
      "productId": 501,
      "skuId": 9001,
      "quantity": 1
    }
  ],
  "sourceType": "LIVE_SHOW",
  "sourceId": 1001
}

sourceType, sourceId를 넣어야 라이브쇼별 성과 분석이 가능합니다.

16. 성과 측정

MVP에서도 성과 로그는 반드시 넣어야 합니다.
라이브 기능을 유지할 가치가 있는지 판단하려면 데이터가 필요합니다.

수집 이벤트
LIVE_PAGE_VIEW
VIDEO_PLAY_CLICK
PRODUCT_CLICK
COUPON_DOWNLOAD
CLICK_CART
CLICK_BUY
QUESTION_SUBMIT
ORDER_COMPLETE
분석 지표
- 라이브 페이지 조회 수
- 상품 클릭 수
- 쿠폰 다운로드 수
- 장바구니 전환 수
- 바로구매 클릭 수
- 주문 완료 수
- 라이브쇼별 매출
- 상품별 매출
성과 연결

주문 테이블 또는 주문 아이템 테이블에 출처를 남기는 것이 좋습니다.

order_item
├─ source_type = LIVE_SHOW
└─ source_id = live_show_id
17. 라우팅 설계
/live
- 라이브쇼 목록

/live/{liveShowId}
- 라이브쇼 상세/판매 페이지

/live/{liveShowId}/replay
- 다시보기 페이지, 상세 페이지와 통합 가능

/admin/live-shows
- 관리자 목록

/admin/live-shows/new
- 관리자 등록

/admin/live-shows/{id}/edit
- 관리자 수정

SEO가 필요하면 slug를 추가합니다.

/live/{slug}

예:

/live/summer-beauty-live-2026
18. 외부 영상 URL 처리

관리자에서 임의 iframe을 그대로 받는 것은 위험합니다.
XSS, 악성 iframe, 보안 문제가 생길 수 있습니다.

권장 입력 방식
YouTube:
- videoId만 입력
- 또는 YouTube URL 입력 후 서버에서 videoId 추출

Vimeo:
- videoId만 입력
- 또는 Vimeo URL 입력 후 서버에서 videoId 추출

직접 iframe:
- MVP에서는 비추천
- 허용하더라도 최고관리자만 가능
검증 규칙
- 허용 provider만 저장
- youtube.com, youtu.be, vimeo.com 등 허용 도메인만 처리
- script 태그 저장 금지
- iframe HTML 직접 저장 금지
- 서버에서 embed_url 생성
19. 보안/운영 체크
필수
- 관리자 입력 URL 검증
- 외부 iframe 허용 도메인 제한
- 질문 등록 rate limit
- 로그인 사용자만 질문 가능 여부 설정
- 쿠폰 중복 다운로드 방지
- 품절 상품 구매 차단
- 방송 종료 후 구매 가능 여부 체크
- 주문 시점 가격 재검증
특히 중요한 부분

라이브 페이지에 표시된 가격만 믿으면 안 됩니다.
주문 생성 시점에는 반드시 백엔드에서 가격/재고/쿠폰을 다시 계산해야 합니다.

프론트 가격 = 표시용
백엔드 가격 = 결제 기준
20. 개발 우선순위
Sprint 1: 데이터/관리자 최소 기능
- live_show 테이블
- live_show_product 테이블
- 라이브쇼 등록/수정
- 영상 URL 등록
- 대표 상품 연결
- 함께 판매 상품 연결
Sprint 2: 사용자 라이브 페이지
- /live/{id} 페이지
- 영상 embed
- 방송 정보 표시
- 대표 상품 표시
- 함께 판매 상품 표시
- 모바일 하단 구매바
Sprint 3: 구매 연동
- 옵션 선택 Bottom Sheet
- 장바구니 연동
- 바로구매 연동
- source tracking 적용
Sprint 4: 쿠폰/공지/Q&A
- 라이브 쿠폰 연결
- 쿠폰 다운로드
- 공지 탭
- 질문 등록
- 관리자 답변
Sprint 5: 통계/운영 개선
- 이벤트 로그
- 라이브별 성과 통계
- 주문/매출 연결
- 방송 종료 후 다시보기 처리
21. MVP 최종 기능 범위
사용자 기능
- 라이브쇼 목록
- 라이브쇼 상세 페이지
- 외부 영상 시청
- 방송 상태 표시
- 대표 상품 확인
- 함께 판매 상품 확인
- 쿠폰 다운로드
- 공지 확인
- 질문 등록
- 장바구니 담기
- 바로구매
- 다시보기
관리자 기능
- 라이브쇼 등록/수정/삭제
- YouTube/Vimeo URL 등록
- 방송 시간 설정
- 방송 상태 설정
- 대표 상품 연결
- 함께 판매 상품 연결
- 쿠폰 연결
- 공지 등록
- 질문 답변
- 라이브쇼별 성과 조회
22. 최종 판단

1차 MVP는 아래 정도가 가장 적절합니다.

YouTube/Vimeo embed
+ 라이브 판매 페이지
+ 대표 상품/함께 판매 상품
+ 쿠폰/혜택
+ 공지
+ 질문 등록
+ 장바구니/바로구매
+ 성과 추적

이 구조는 개발 부담이 낮고, 기존 쇼핑몰 소스에 비교적 쉽게 붙일 수 있습니다.
다만 YouTube embed 기준으로는 외부 플랫폼 느낌이 일부 남습니다. 그래서 화면 전체를 우리 쇼핑몰의 Header, 상품 카드, 구매 패널, 쿠폰 UI로 강하게 감싸는 방식이 중요합니다.

정리하면, 이 MVP의 본질은 라이브 플랫폼 개발이 아니라 “영상이 포함된 상품 판매 랜딩 페이지”를 만드는 것입니다.