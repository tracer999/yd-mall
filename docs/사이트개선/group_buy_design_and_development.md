# 공동구매 관리 및 사용자 화면 설계/개발 설계

## 0. 설계 전제

본 문서는 쇼핑몰 빌더에서 **공동구매(Group Buy)** 기능을 별도 도메인으로 설계하기 위한 문서이다.

공동구매는 기획전과 유사하게 상품을 묶어 판매하지만, 본질은 다르다.

- 기획전은 테마/브랜드/시즌별 상품 전시이다.
- 공동구매는 목표 수량, 참여자 수, 기간, 가격 조건이 있는 **조건부 판매 캠페인**이다.
- 공동구매는 단순 상품 목록이 아니라 **참여 현황, 남은 시간, 목표 달성률, 공동구매가**를 사용자에게 명확히 보여줘야 한다.
- 공동구매는 주문/결제/취소 정책이 일반 상품과 달라질 수 있으므로 별도 관리가 필요하다.

---

## 1. 공동구매의 기능 정의

공동구매는 다음 세 가지 방식 중 하나로 설계할 수 있다.

## 1-1. 단순 공동구매형

가장 현실적인 MVP 방식이다.

```text
공동구매 상품 등록
→ 일정 기간 동안 공동구매가로 판매
→ 목표 수량은 표시만 하거나 선택적으로 사용
→ 사용자는 일반 상품처럼 즉시 결제
```

장점:

- 개발이 쉽다.
- 주문/결제 시스템 재사용 가능.
- 운영 리스크가 낮다.

단점:

- 진짜 공동구매의 “목표 달성 후 확정” 느낌은 약하다.

## 1-2. 목표 달성형

```text
목표 수량 설정
→ 사용자가 참여/결제
→ 목표 달성 시 주문 확정
→ 미달성 시 자동 취소/환불 또는 주문 취소
```

장점:

- 공동구매 본질에 가깝다.
- 참여 유도 효과가 좋다.

단점:

- 결제 보류, 환불, 재고, CS 복잡도가 높다.
- PG 정책 검토 필요.

## 1-3. 단계별 가격형

```text
참여 수량 50개 이상 → 10% 할인
참여 수량 100개 이상 → 15% 할인
참여 수량 300개 이상 → 25% 할인
```

장점:

- 공동구매 참여 동기가 강하다.
- 바이럴 유도 가능.

단점:

- 최종 가격 확정, 차액 환불, 주문 변경 로직이 복잡하다.

## 1-4. 최종 권장 방식

쇼핑몰 빌더의 1차 구현은 다음이 적절하다.

```text
1차 MVP:
단순 공동구매형 + 목표 수량/참여 수 표시

2차:
목표 달성형

3차:
단계별 가격형
```

---

## 2. 공동구매 사용자 화면 구조

## 2-1. 공동구매 목록 화면

### URL

```text
/group-buy
/group-buying
/deal/group
```

쇼핑몰 빌더 표준 URL은 `/group-buy`를 권장한다.

### 화면 구성

```text
[Header / GNB]

[페이지 타이틀]
공동구매

[상단 배너]
- 공동구매 메인 배너
- 진행중인 대표 공동구매
- 마감임박 공동구매

[상태 필터]
전체 | 진행중 | 마감임박 | 예정 | 종료

[카테고리 필터]
전체 | 식품 | 뷰티 | 생활 | 패션 | 가전 ...

[정렬]
마감임박순 | 인기순 | 참여자순 | 할인율순 | 최신순

[공동구매 카드 리스트]
- 상품 이미지
- 공동구매명
- 상품명
- 공동구매가
- 정상가
- 할인율
- 참여자 수
- 목표 수량
- 달성률
- 남은 시간
- 상태 배지
- 참여하기 버튼
```

---

## 2-2. 공동구매 카드 표시 항목

| 항목 | 설명 | 필수 |
|---|---|---:|
| 상품 이미지 | 공동구매 대표 이미지 | 필수 |
| 공동구매명 | 캠페인명 | 필수 |
| 상품명 | 연결 상품명 | 필수 |
| 공동구매가 | 판매 가격 | 필수 |
| 정상가 | 비교 가격 | 권장 |
| 할인율 | 전환 요소 | 권장 |
| 남은 시간 | 마감 유도 | 필수 |
| 참여자 수 | 사회적 증거 | 권장 |
| 목표 수량 | 달성형일 경우 필수 | 선택 |
| 달성률 | 목표 달성형일 경우 필수 | 선택 |
| 상태 | 예정/진행중/마감/종료 | 필수 |
| CTA | 참여하기/구매하기 | 필수 |

---

## 2-3. 공동구매 상세 화면

### URL

```text
/group-buy/{groupBuyId}
/group-buy/{slug}
```

### 상세 화면 구조

```text
[Header / GNB]

[공동구매 상태 영역]
- 진행중 / 마감임박 / 종료
- 남은 시간
- 목표 달성률

[대표 상품 영역]
- 상품 이미지
- 공동구매명
- 상품명
- 정상가
- 공동구매가
- 할인율
- 옵션 선택
- 수량 선택
- 참여하기/구매하기

[참여 현황]
- 현재 참여 수량
- 목표 수량
- 달성률 progress bar
- 최소 진행 수량
- 최대 판매 수량

[혜택 영역]
- 공동구매 전용 쿠폰
- 무료배송
- 사은품
- 카드 혜택

[상품 상세 정보]
- 기존 상품 상세 재사용
- 공동구매 전용 안내 추가

[공동구매 유의사항]
- 목표 미달 시 처리
- 주문 취소/환불 기준
- 배송 예정일
- 마감 후 처리 일정

[관련 공동구매]
```

---

## 3. 공동구매 상태 설계

공동구매는 상태값이 중요하다.

```text
DRAFT       = 임시저장
SCHEDULED   = 예정
ACTIVE      = 진행중
CLOSING     = 마감임박
SUCCESS     = 목표달성
FAILED      = 목표미달
ENDED       = 종료
CANCELLED   = 취소
HIDDEN      = 숨김
```

### 상태 계산 기준

```text
현재 시간 < start_at
→ SCHEDULED

start_at <= 현재 시간 <= end_at
→ ACTIVE

end_at까지 24시간 이하
→ CLOSING

목표 달성 && end_at 도달
→ SUCCESS

목표 미달 && end_at 도달
→ FAILED

관리자 수동 종료
→ ENDED 또는 CANCELLED
```

MVP에서는 아래 정도만 사용해도 충분하다.

```text
SCHEDULED
ACTIVE
CLOSING
ENDED
HIDDEN
```

---

## 4. 공동구매 유형별 주문 처리

## 4-1. 단순 공동구매형

```text
사용자 참여
→ 즉시 결제
→ 일반 주문 생성
→ 공동구매 source 기록
→ 배송 처리
```

주문 시스템 부담이 가장 낮다.

```text
order_item.source_type = GROUP_BUY
order_item.source_id = group_buy.id
```

## 4-2. 목표 달성형

```text
사용자 참여
→ 결제 승인 또는 결제 예약
→ 목표 달성 시 주문 확정
→ 목표 미달 시 취소/환불
```

이 방식은 PG 정책과 환불 프로세스가 중요하므로 1차 MVP에서는 비추천한다.

## 4-3. 단계별 가격형

```text
사용자 구매
→ 현재 단계 가격으로 결제
→ 최종 단계 가격 확정
→ 차액 적립금/환불/쿠폰 처리
```

운영 복잡도가 매우 높다. 3차 이후로 미루는 것이 낫다.

---

## 5. 관리자 메뉴 설계

```text
관리자
└─ 프로모션 관리
    └─ 공동구매 관리
        ├─ 공동구매 목록
        ├─ 공동구매 등록/수정
        ├─ 공동구매 상품 관리
        ├─ 공동구매 주문/참여자 관리
        ├─ 공동구매 쿠폰/혜택 관리
        ├─ 공동구매 배너 관리
        └─ 공동구매 성과 통계
```

공동구매는 프로모션 관리 하위에 둘 수 있지만, 주문 처리와 목표 수량이 있기 때문에 일반 할인/쿠폰과는 별도 메뉴로 분리한다.

---

## 5-1. 공동구매 목록 관리

### 목록 컬럼

| 컬럼 | 설명 |
|---|---|
| ID | 공동구매 ID |
| 썸네일 | 대표 이미지 |
| 공동구매명 | 캠페인명 |
| 상품명 | 연결 상품 |
| 상태 | 예정/진행중/마감/종료 |
| 시작일 | 시작 시간 |
| 종료일 | 종료 시간 |
| 공동구매가 | 판매 가격 |
| 목표 수량 | 목표 |
| 참여 수량 | 현재 참여 |
| 달성률 | 참여/목표 |
| 주문 수 | 주문 건수 |
| 매출 | 공동구매 매출 |
| 수정 | 관리 버튼 |

### 필터

```text
- 상태
- 카테고리
- 기간
- 목표 달성 여부
- 상품명
- 브랜드
```

---

## 5-2. 공동구매 등록/수정 항목

### 기본 정보

| 항목 | 설명 |
|---|---|
| 공동구매명 | 사용자 화면 캠페인명 |
| slug | URL |
| 설명 | 짧은 소개 |
| 대표 이미지 | 목록/상세 공통 |
| 상세 배너 | 상세 상단 이미지 |
| 상태 | 임시/예정/진행/종료/숨김 |
| 시작일 | 판매 시작 |
| 종료일 | 판매 종료 |
| 목록 노출 여부 | 공동구매 목록 노출 |
| 검색 노출 여부 | 검색 결과 노출 |

### 상품/가격

| 항목 | 설명 |
|---|---|
| 대표 상품 | 공동구매 대상 상품 |
| 옵션 사용 여부 | 상품 옵션 재사용 |
| 정상가 | 기준 가격 |
| 공동구매가 | 실제 판매 가격 |
| 할인율 | 자동 계산 |
| 1인 구매 제한 | 중복 구매 제한 |
| 최소 구매 수량 | 기본 1 |
| 최대 구매 수량 | 재고/운영 기준 |
| 재고 차감 방식 | 주문 시/결제 완료 시 |

### 목표/참여

| 항목 | 설명 |
|---|---|
| 목표 수량 사용 여부 | ON/OFF |
| 목표 수량 | 예: 100개 |
| 최소 진행 수량 | 목표달성형에서 사용 |
| 참여자 수 표시 | ON/OFF |
| 참여 수량 표시 | ON/OFF |
| 달성률 표시 | ON/OFF |
| 가상 참여 수 보정 | 비추천. 사용 시 내부표시 필요 |

### 종료/실패 정책

| 항목 | 설명 |
|---|---|
| 종료 후 구매 가능 여부 | 종료 후 일반 상품으로 이동 |
| 목표 미달 처리 | 주문 유지/취소/관리자 처리 |
| 배송 예정일 | 공동구매 종료 후 배송일 |
| 자동 종료 | 종료 시간 도달 시 자동 종료 |

---

## 6. DB 설계

## 6-1. group_buy

```sql
CREATE TABLE group_buy (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  mall_id BIGINT NOT NULL,

  title VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  summary VARCHAR(500) NULL,

  list_thumbnail_url VARCHAR(500) NULL,
  detail_banner_url VARCHAR(500) NULL,

  status VARCHAR(30) NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,

  list_visible BOOLEAN DEFAULT TRUE,
  search_visible BOOLEAN DEFAULT TRUE,

  target_enabled BOOLEAN DEFAULT FALSE,
  target_quantity INT NULL,
  minimum_success_quantity INT NULL,

  participant_count_visible BOOLEAN DEFAULT TRUE,
  quantity_count_visible BOOLEAN DEFAULT TRUE,
  progress_visible BOOLEAN DEFAULT TRUE,

  ended_purchase_policy VARCHAR(30) DEFAULT 'DISALLOW',
  fail_policy VARCHAR(30) DEFAULT 'KEEP_ORDER',

  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,

  UNIQUE KEY uk_group_buy_mall_slug (mall_id, slug)
);
```

## 6-2. group_buy_product

```sql
CREATE TABLE group_buy_product (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  group_buy_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,

  role VARCHAR(30) DEFAULT 'MAIN',
  sort_order INT DEFAULT 0,

  normal_price DECIMAL(12,2) NULL,
  group_buy_price DECIMAL(12,2) NOT NULL,
  discount_rate DECIMAL(5,2) NULL,

  min_order_quantity INT DEFAULT 1,
  max_order_quantity INT NULL,
  per_user_limit_quantity INT NULL,

  purchase_enabled BOOLEAN DEFAULT TRUE,
  visible BOOLEAN DEFAULT TRUE,

  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

## 6-3. group_buy_participation

```sql
CREATE TABLE group_buy_participation (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  group_buy_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  order_id BIGINT NULL,
  order_item_id BIGINT NULL,

  product_id BIGINT NOT NULL,
  sku_id BIGINT NULL,
  quantity INT NOT NULL,

  status VARCHAR(30) NOT NULL,

  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

status 예시:

```text
RESERVED
PAID
CONFIRMED
CANCELLED
REFUNDED
FAILED
```

## 6-4. group_buy_coupon

```sql
CREATE TABLE group_buy_coupon (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  group_buy_id BIGINT NOT NULL,
  coupon_id BIGINT NOT NULL,

  sort_order INT DEFAULT 0,
  is_primary BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,

  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

## 6-5. group_buy_notice

```sql
CREATE TABLE group_buy_notice (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  group_buy_id BIGINT NOT NULL,

  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  notice_level VARCHAR(30) DEFAULT 'NORMAL',

  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,

  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

---

## 7. API 설계

## 7-1. 사용자 API

```http
GET /api/group-buys
```

공동구매 목록 조회.

Query:

```text
status
category
sort
page
size
```

```http
GET /api/group-buys/{slug}
```

공동구매 상세 조회.

응답 예시:

```json
{
  "id": 2001,
  "title": "여름 캠핑 바비큐 공동구매",
  "status": "ACTIVE",
  "startAt": "2026-07-01T00:00:00",
  "endAt": "2026-07-10T23:59:59",
  "targetEnabled": true,
  "targetQuantity": 100,
  "currentQuantity": 64,
  "progressRate": 64,
  "products": [
    {
      "productId": 501,
      "name": "바비큐 세트",
      "normalPrice": 59000,
      "groupBuyPrice": 39000,
      "discountRate": 33.9
    }
  ],
  "coupons": [],
  "notices": []
}
```

```http
POST /api/group-buys/{id}/cart
```

공동구매 상품 장바구니 담기.

```http
POST /api/group-buys/{id}/checkout
```

공동구매 바로구매.

---

## 7-2. 관리자 API

```http
GET    /admin/api/group-buys
POST   /admin/api/group-buys
GET    /admin/api/group-buys/{id}
PUT    /admin/api/group-buys/{id}
DELETE /admin/api/group-buys/{id}
```

```http
POST   /admin/api/group-buys/{id}/products
PUT    /admin/api/group-buys/{id}/products/{mappingId}
DELETE /admin/api/group-buys/{id}/products/{mappingId}
```

```http
GET    /admin/api/group-buys/{id}/participants
GET    /admin/api/group-buys/{id}/orders
```

---

## 8. 프론트엔드 컴포넌트 설계

```text
GroupBuyListPage
├─ GroupBuyHeroBanner
├─ GroupBuyStatusTabs
├─ GroupBuyCategoryTabs
├─ GroupBuySortBar
└─ GroupBuyCardGrid

GroupBuyDetailPage
├─ GroupBuyHeader
├─ GroupBuyStatusTimer
├─ GroupBuyMainProduct
├─ GroupBuyProgress
├─ GroupBuyBenefitArea
├─ GroupBuyOptionSelector
├─ GroupBuyNotice
├─ GroupBuyDetailInfo
└─ RelatedGroupBuyList
```

### GroupBuyProgress

```text
역할:
- 목표 수량 표시
- 현재 참여 수량 표시
- 달성률 progress bar
- 마감 시간 표시
```

### GroupBuyStatusTimer

```text
역할:
- 남은 시간 표시
- 마감임박 배지 표시
- 종료 시 구매 버튼 비활성화
```

### GroupBuyMainProduct

```text
역할:
- 상품 이미지
- 가격/할인율
- 구매 제한 안내
- 옵션 선택
- CTA
```

---

## 9. 주문/재고 연동

## 9-1. 단순 공동구매형 주문

```text
사용자 구매
→ 기존 주문 생성
→ group_buy_participation 생성
→ order_item.source_type = GROUP_BUY
→ order_item.source_id = group_buy.id
```

## 9-2. 구매 가능 여부 검증

주문 생성 전 백엔드에서 반드시 검증한다.

```text
- 공동구매 상태 ACTIVE 여부
- 현재 시간이 판매 기간 안인지
- 상품 구매 가능 여부
- 재고 여부
- 1인 구매 제한 초과 여부
- 옵션/SKU 유효성
- 가격 재계산
```

프론트 가격은 표시용이고, 결제 가격은 반드시 백엔드가 다시 계산해야 한다.

---

## 10. 성과 측정

### 이벤트 로그

```text
GROUP_BUY_LIST_VIEW
GROUP_BUY_DETAIL_VIEW
GROUP_BUY_PRODUCT_CLICK
GROUP_BUY_CART_CLICK
GROUP_BUY_BUY_CLICK
GROUP_BUY_SHARE_CLICK
GROUP_BUY_ORDER_COMPLETE
```

### 분석 지표

```text
- 공동구매 목록 조회 수
- 공동구매 상세 조회 수
- 참여자 수
- 참여 수량
- 목표 달성률
- 장바구니 수
- 주문 수
- 매출
- 공유 수
- 마감 전환율
```

---

## 11. 개발 우선순위

### 1차

```text
- 공동구매 목록
- 공동구매 상세
- 관리자 공동구매 등록/수정
- 상품 1개 연결
- 공동구매가 설정
- 남은 시간 표시
- 장바구니/바로구매
- 주문 출처 기록
```

### 2차

```text
- 목표 수량/달성률 표시
- 참여자 수/참여 수량 표시
- 공동구매 쿠폰 연결
- 참여자/주문 관리
- 성과 통계
```

### 3차

```text
- 목표 달성형 주문 처리
- 목표 미달 자동 취소/환불
- 단계별 가격
- 공유 보상
- 공동구매 초대 링크
```

---

## 12. 운영상 주의점

공동구매는 일반 상품보다 CS 리스크가 크다.

```text
주의 항목:
- 목표 미달 시 처리 방식
- 배송 시작일
- 주문 취소 가능 기간
- 환불 조건
- 공동구매 가격 적용 기준
- 품절 발생 시 처리
- 옵션별 목표 수량 여부
```

따라서 MVP에서는 목표 미달 환불형보다 **공동구매가로 즉시 구매하는 단순 공동구매형**을 먼저 구현하는 것이 안전하다.

---

## 13. 최종 권장안

공동구매는 기획전과 별도 도메인으로 관리한다.

```text
기획전 = 상품 전시/브랜드/시즌 랜딩
공동구매 = 기간/참여/목표/가격 조건이 있는 판매 캠페인
```

초기 구현은 다음이 가장 현실적이다.

```text
1차:
단순 공동구매형
- 공동구매 목록
- 공동구매 상세
- 공동구매가
- 남은 시간
- 참여 수량 표시
- 장바구니/바로구매
- 주문 출처 기록

2차:
목표 수량/달성률
- 참여 현황
- 쿠폰
- 성과 통계

3차:
목표 달성형/단계별 가격형
```

공동구매를 기획전이나 이벤트 안에 넣으면 주문/가격/목표/참여 현황 로직이 섞여 관리가 어려워지므로, 반드시 별도 기능으로 분리하는 것을 권장한다.
