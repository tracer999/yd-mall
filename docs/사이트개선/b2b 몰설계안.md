현재 조건에는 B2C몰과 B2B몰을 별도로 만드는 방식보다, 하나의 상품·재고·화면 구조를 유지하면서 로그인 사용자의 거래 컨텍스트에 따라 가격과 주문 프로세스를 분기하는 구조가 적합합니다.

핵심은 다음과 같습니다.

상품은 하나로 관리하고, 가격 정책·회원 권한·장바구니·견적·주문 워크플로는 B2C/B2B로 분리합니다.

실제 B2B 커머스도 기본 상품 카탈로그는 유지하면서 회사별 카탈로그와 가격을 연결하는 형태를 사용합니다. Shopify B2B는 회사·회사 지점에 카탈로그를 할당해 제품 노출과 가격을 제어하며, 수량 규칙과 구간별 가격도 지원합니다. Adobe Commerce도 기본 상품 카탈로그와 별도로 회사별 공유 카탈로그, 사용자 지정 가격, 협상 견적을 연결합니다.

1. 전체 권장 구조
                         ┌──────────────────────┐
                         │     상품 마스터       │
                         │ Product / SKU / 재고  │
                         └──────────┬───────────┘
                                    │
                 ┌──────────────────┴──────────────────┐
                 │                                     │
        ┌────────▼─────────┐                  ┌────────▼─────────┐
        │   B2C 거래 정책    │                  │   B2B 거래 정책    │
        │ 일반 판매가        │                  │ 기업별 가격        │
        │ 즉시 결제          │                  │ 수량별 가격        │
        │ 일반 배송          │                  │ 견적/네고/승인      │
        └────────┬─────────┘                  └────────┬─────────┘
                 │                                     │
        ┌────────▼─────────┐                  ┌────────▼─────────┐
        │   B2C 장바구니     │                  │   B2B 장바구니     │
        │   B2C 주문         │                  │   견적/협상/주문    │
        └──────────────────┘                  └──────────────────┘

사용자 몰은 동일하게 유지하되 로그인 세션에 다음 값을 포함합니다.

{
  "customerId": 1234,
  "customerType": "B2B",
  "companyId": 501,
  "companyLocationId": 502,
  "pricePolicyId": 30,
  "permissions": [
    "VIEW_B2B_PRICE",
    "REQUEST_QUOTE",
    "PLACE_ORDER"
  ]
}

프론트엔드는 상품 페이지 자체를 바꾸는 것이 아니라 이 컨텍스트에 따라 다음 항목만 바꿉니다.

표시 가격
최소 주문 수량
수량 구간 가격
장바구니 유형
바로 구매 또는 견적 요청 버튼
결제 방식
주문 승인 절차
배송 및 세금계산서 처리
2. 상품은 절대로 B2C/B2B로 복제하지 않는 것이 좋음

예를 들어 동일한 상품을 다음처럼 두 개로 만들면 안 됩니다.

PRODUCT-100-B2C
PRODUCT-100-B2B

이 구조는 이후 다음 문제가 발생합니다.

재고가 이중 관리됨
상품 설명과 이미지 수정이 중복됨
ERP·공급사 상품 연동이 복잡해짐
옵션과 SKU가 불일치할 가능성이 커짐
판매 통계가 상품별로 분산됨
B2C와 B2B가 같은 실물 재고인지 판단하기 어려움

대신 상품과 SKU는 하나로 유지합니다.

Product
 └─ Variant/SKU
     ├─ B2C 가격 정책
     ├─ 기본 B2B 가격 정책
     ├─ 등급별 가격 정책
     ├─ 회사별 계약 가격
     └─ 견적 확정 가격
3. 가격 구조
3.1 권장 가격 우선순위

B2B 가격은 단순히 b2b_price 컬럼 하나를 상품 테이블에 추가하는 방식보다 가격 정책 계층으로 설계하는 것이 좋습니다.

권장 우선순위는 다음과 같습니다.

1. 확정 견적 가격
2. 회사별 계약 가격
3. 회사 그룹별 가격
4. B2B 회원등급별 가격
5. 수량 구간 가격
6. 기본 B2B 가격
7. B2C 판매가

예를 들어:

구분	가격
B2C 판매가	100,000원
기본 B2B 가격	85,000원
VIP 대리점 가격	80,000원
A회사 계약 가격	77,000원
100개 이상 가격	72,000원
최종 협상 견적 가격	69,000원

가격 결정 서비스는 다음과 같이 동작합니다.

resolvePrice(
    productSku,
    customerType,
    companyId,
    companyGroupId,
    quantity,
    quoteId,
    requestedAt
)
3.2 가격 테이블 예시
product_variant
id
product_id
sku
stock_quantity
cost_price
status
price_policy
id
name
policy_type
currency
tax_included
valid_from
valid_to
status

policy_type 예:

B2C_DEFAULT
B2B_DEFAULT
COMPANY_GROUP
COMPANY_CONTRACT
CAMPAIGN
price_policy_item
id
price_policy_id
variant_id
fixed_price
discount_rate
minimum_quantity
maximum_quantity
company_price_policy
company_id
price_policy_id
priority
valid_from
valid_to
volume_price
variant_id
price_policy_id
minimum_quantity
unit_price

Shopify와 Adobe Commerce도 기업 또는 기업 위치에 카탈로그를 할당하고, 제품별 고정 가격·가격 조정·수량 규칙을 적용하는 방식으로 구성합니다.

4. B2B 회원 구조

B2B 사용자는 일반 개인회원과 달리 회사와 사용자 계정을 분리해야 합니다.

Company
 ├─ 회사 기본정보
 ├─ 사업자등록정보
 ├─ 거래 조건
 ├─ 가격 정책
 ├─ 결제 조건
 ├─ 배송지
 └─ Company User
      ├─ 관리자
      ├─ 구매 담당자
      ├─ 승인 담당자
      └─ 조회 전용 사용자
4.1 회사 테이블
company
id
company_name
business_number
representative_name
business_type
business_category
tax_invoice_email
credit_limit
payment_terms
price_policy_id
sales_manager_id
status
approved_at

회사 상태:

PENDING
UNDER_REVIEW
APPROVED
SUSPENDED
REJECTED
4.2 회사 소속 사용자
company_user
id
company_id
customer_id
role
department
position
purchase_limit
approval_limit
status

권한 예:

권한	설명
VIEW_PRICE	B2B 가격 조회
CREATE_QUOTE	견적 작성
REQUEST_QUOTE	견적 요청
NEGOTIATE_QUOTE	가격 협상
APPROVE_PURCHASE	회사 내부 구매 승인
PLACE_ORDER	주문 확정
VIEW_COMPANY_ORDERS	회사 전체 주문 조회
MANAGE_USERS	회사 사용자 관리

사업자 로그인을 별도 로그인 페이지로 완전히 분리할 필요는 없습니다.

일반 로그인 후 다음과 같이 컨텍스트를 판단하면 됩니다.

로그인
 → customer 조회
 → company_user 연결 여부 확인
 → 회사 승인 상태 확인
 → 사용자의 회사 역할 및 권한 조회
 → B2B 세션 활성화

한 사용자가 개인 구매와 회사 구매를 모두 할 수 있다면 상단에 다음 전환 기능을 제공할 수 있습니다.

구매 유형
○ 개인 구매
● ABC회사 구매

단, 동일 장바구니 안에 B2C 상품과 B2B 거래를 혼합하지 않는 것이 좋습니다.

5. 사용자 몰 설계
5.1 상품 목록 및 상세 화면

같은 URL과 같은 상품 상세 화면을 사용합니다.

/products/100
B2C 사용자가 볼 때
판매가: 100,000원
[장바구니] [바로 구매]
승인된 B2B 사용자가 볼 때
기업 전용가: 85,000원
최소 주문수량: 10개

10개 이상   85,000원
50개 이상   80,000원
100개 이상  별도 견적

[장바구니] [견적 요청]
비승인 사업자 사용자가 볼 때
기업회원 승인 후 가격 확인 가능
[기업회원 승인 요청]
5.2 상품 노출 정책

상품별로 다음 값을 둡니다.

sales_channel:
- B2C_ONLY
- B2B_ONLY
- B2C_AND_B2B

추가로 회사별 카탈로그가 필요하다면:

catalog
catalog_product
company_catalog

구조를 사용합니다.

A회사 → 일반 B2B 카탈로그
B회사 → 대리점 카탈로그
C회사 → 특판 카탈로그
6. B2B 장바구니와 견적 구조
6.1 장바구니는 논리적으로 분리
cart_type:
- B2C
- B2B

B2B 장바구니에는 다음 정보가 추가됩니다.

company_id
company_user_id
price_policy_id
requested_delivery_date
purchase_order_number
internal_reference
quote_required
6.2 B2B 구매 방식

상품이나 회사 정책에 따라 두 가지로 나눕니다.

방식 A: 즉시 주문
상품 선택
 → B2B 가격 적용
 → 장바구니
 → 주문서
 → 결제 또는 후불
 → 주문 완료
방식 B: 견적 후 주문
상품 선택
 → 견적 요청
 → 관리자 검토
 → 가격·수량·배송비 협상
 → 견적 확정
 → 고객 승인
 → 주문 전환
 → 결제/후불 처리
 → 출고

상품별 또는 회사별로 설정할 수 있습니다.

transaction_mode:
- DIRECT_ORDER
- QUOTE_OPTIONAL
- QUOTE_REQUIRED

예:

조건	처리
일반 B2B 상품 10개	즉시 주문
100개 이상	견적 필수
주문제작 상품	견적 필수
특정 거래처	후불 즉시 주문
신규 거래처	선결제 견적 주문
7. 견적·네고 상태 설계

견적은 주문 테이블의 임시 상태로 처리하지 말고 별도 도메인으로 분리하는 것이 중요합니다.

7.1 견적 상태
DRAFT
REQUESTED
UNDER_REVIEW
SELLER_PROPOSED
BUYER_COUNTERED
BUYER_ACCEPTED
SELLER_ACCEPTED
REJECTED
EXPIRED
CONVERTED_TO_ORDER
CANCELLED

권장 상태 전이는 다음과 같습니다.

DRAFT
  ↓ 고객 제출
REQUESTED
  ↓ 관리자 검토
UNDER_REVIEW
  ├─ 관리자 제안 → SELLER_PROPOSED
  ├─ 반려 → REJECTED
  └─ 추가정보 요청 → BUYER_COUNTERED

SELLER_PROPOSED
  ├─ 고객 재협상 → BUYER_COUNTERED
  ├─ 고객 수락 → BUYER_ACCEPTED
  └─ 유효기간 만료 → EXPIRED

BUYER_COUNTERED
  ├─ 관리자 재제안 → SELLER_PROPOSED
  ├─ 관리자 수락 → SELLER_ACCEPTED
  └─ 관리자 거절 → REJECTED

BUYER_ACCEPTED / SELLER_ACCEPTED
  ↓ 주문 생성
CONVERTED_TO_ORDER

Adobe Commerce의 협상 견적도 구매자 또는 판매자가 견적을 시작하고, 상품·수량·할인·배송 조건·메모를 변경하며 합의할 때까지 이력을 유지하는 별도 워크플로로 운영됩니다.

7.2 견적 테이블
quote
id
quote_number
company_id
requested_by
assigned_sales_manager_id
status
currency
catalog_total
proposed_total
tax_amount
shipping_amount
discount_amount
final_total
valid_until
payment_terms
delivery_terms
requested_delivery_date
version
created_at
updated_at
quote_item
id
quote_id
variant_id
sku_snapshot
product_name_snapshot
quantity
catalog_unit_price
requested_unit_price
proposed_unit_price
final_unit_price
tax_rate
item_note
quote_message
id
quote_id
sender_type
sender_id
message
visibility
created_at
quote_attachment
id
quote_id
uploaded_by
filename
storage_key
mime_type
file_size
quote_revision
id
quote_id
revision_number
changed_by
snapshot_json
created_at

견적 수정 기록은 덮어쓰지 말고 버전으로 보관해야 합니다.

견적 v1: 고객 요청 1,000개 / 7,000원
견적 v2: 관리자 제안 1,000개 / 6,800원
견적 v3: 고객 제안 1,200개 / 6,500원
견적 v4: 최종 확정 1,200개 / 6,600원
8. 견적에서 주문으로 전환할 때

견적을 주문으로 전환할 때는 현재 상품 가격을 다시 조회해 적용하면 안 됩니다.

확정된 견적 내용을 주문 스냅샷으로 복사해야 합니다.

Quote
  ├─ 상품
  ├─ 수량
  ├─ 확정 단가
  ├─ 할인
  ├─ 배송비
  ├─ 납기
  ├─ 결제 조건
  └─ 세금 조건
          ↓ 복사
B2B Order

전환 시 처리:

1. 견적 상태 및 유효기간 검사
2. 구매자 권한 검사
3. 재고 가용성 검사
4. 확정 가격 잠금
5. 주문 생성
6. 견적-주문 연결
7. 재고 예약
8. 결제 또는 여신 처리
9. 견적 상태를 CONVERTED_TO_ORDER로 변경
주문에 저장할 가격 정보
catalog_price
contract_price
negotiated_price
discount_amount
final_unit_price
price_source
quote_id
quote_revision

price_source 예:

B2B_DEFAULT
VOLUME_PRICE
COMPANY_CONTRACT
NEGOTIATED_QUOTE
MANUAL_ADMIN
9. B2B 주문은 별도로 관리하되 주문 엔진은 공통화

관리 화면에서는 B2C 주문과 B2B 주문을 분리해 보여주는 것이 맞습니다.

그러나 내부 주문 엔진과 기본 테이블을 완전히 별도로 만드는 것은 권장하지 않습니다.

권장 구조
order
 ├─ order_type = B2C / B2B
 ├─ 공통 주문 정보
 ├─ 공통 상품 정보
 ├─ 공통 결제 정보
 └─ 공통 배송 정보

b2b_order_detail
 ├─ company_id
 ├─ quote_id
 ├─ purchase_order_number
 ├─ payment_terms
 ├─ credit_transaction_id
 ├─ tax_invoice_required
 ├─ requested_delivery_date
 └─ internal_approval_reference

즉:

주문 번호 체계
결제
재고 차감
출고
배송 추적
취소
반품

은 공통 엔진을 사용합니다.

다음 항목만 B2B 확장 테이블로 분리합니다.

회사
견적
발주서
후불 조건
여신
세금계산서
분할 배송
납기
내부 승인
영업 담당자
10. 주문번호도 구분하는 것이 좋음

관리상 다음과 같이 구분할 수 있습니다.

B2C 주문: C-20260720-000123
B2B 주문: B-20260720-000045
견적번호: Q-20260720-000018

다만 데이터베이스의 PK는 공통 숫자 또는 UUID를 사용하고, 위 번호는 표시용으로만 사용합니다.

11. 관리자 화면 설계
11.1 관리자 메뉴
상품 관리
 ├─ 상품 목록
 ├─ 옵션/SKU
 ├─ 재고
 ├─ B2C 가격
 ├─ B2B 기본 가격
 ├─ 수량별 가격
 └─ 판매 채널 설정

B2B 관리
 ├─ 기업회원 승인
 ├─ 회사 관리
 ├─ 회사 사용자 관리
 ├─ 가격 정책
 ├─ 기업별 계약 가격
 ├─ B2B 카탈로그
 ├─ 견적 관리
 ├─ 협상 관리
 ├─ B2B 주문
 ├─ 발주서 관리
 ├─ 여신/후불 관리
 ├─ 세금계산서
 └─ 거래처별 매출

주문 관리
 ├─ 전체 주문
 ├─ B2C 주문
 ├─ B2B 주문
 ├─ 출고 관리
 ├─ 취소/반품
 └─ 배송 관리
11.2 상품 관리자 화면

기존 상품 수정 화면에 B2B 판매 탭을 추가합니다.

[기본 정보]
[옵션/SKU]
[B2C 판매]
[B2B 판매]
[재고]
[배송]

B2B 판매 탭:

B2B 판매 여부: 사용
기본 B2B 가격: 85,000원
최소 주문수량: 10
주문 단위: 5
최대 주문수량: 제한 없음

거래 방식:
○ 즉시 주문
● 견적 선택 가능
○ 견적 필수

수량별 가격:
10개     85,000원
50개     80,000원
100개    75,000원

가격 공개:
○ 로그인 전 공개
● 승인된 기업회원만 공개
○ 가격 비공개/문의
11.3 회사 관리 화면
회사명
사업자번호
승인 상태
회사 등급
적용 카탈로그
가격 정책
결제 조건
여신 한도
미수금
담당 영업사원
최근 주문
누적 매출

회사별 설정:

가격 정책: B2B-VIP
결제 조건: 월말 마감 후 익월 15일
여신 한도: 50,000,000원
현재 여신 사용액: 12,000,000원
견적 필수 금액: 10,000,000원 이상
무료배송 기준: 3,000,000원
세금계산서: 필수
11.4 견적 관리 화면

견적 목록 컬럼:

견적번호
회사명
요청자
담당자
상태
상품 수
요청 금액
제안 금액
최종 금액
유효기간
최근 응답일

상세 화면:

[견적 기본정보]
[상품 및 가격]
[할인]
[배송비]
[납기]
[결제 조건]
[협상 메시지]
[첨부파일]
[변경 이력]
[주문 전환]

관리자는 다음 작업이 가능해야 합니다.

상품 추가·삭제
수량 변경
품목별 단가 변경
전체 할인
품목별 할인
배송비 제안
납기 제안
결제 조건 지정
견적 유효기간 설정
메모·파일 첨부
견적 반려
견적 승인
주문 전환
PDF 견적서 발행
12. B2B 주문 상태

B2C 주문보다 다음 상태가 추가될 수 있습니다.

ORDER_DRAFT
PENDING_INTERNAL_APPROVAL
PENDING_SELLER_CONFIRMATION
PENDING_PAYMENT
CREDIT_REVIEW
PAYMENT_CONFIRMED
PREPARING
PARTIALLY_SHIPPED
SHIPPED
DELIVERED
COMPLETED
CANCEL_REQUESTED
CANCELLED

후불 거래라면 결제 완료를 출고 전제 조건으로 사용하면 안 됩니다.

payment_method:
- CARD
- BANK_TRANSFER
- VIRTUAL_ACCOUNT
- CREDIT_ACCOUNT
- MONTHLY_SETTLEMENT
- MANUAL_INVOICE

주문 상태와 결제 상태는 반드시 분리합니다.

order_status = PREPARING
payment_status = CREDIT_APPROVED
fulfillment_status = NOT_SHIPPED
invoice_status = NOT_ISSUED
13. 재고 관리

실물 재고가 같다면 B2C/B2B 재고를 별도로 만들 필요는 없습니다.

공통 재고
 ├─ 판매 가능 재고
 ├─ 예약 재고
 ├─ 출고 예정 재고
 └─ 안전 재고

다만 B2B 견적은 협상 기간이 길기 때문에 견적 요청 즉시 재고를 차감하면 안 됩니다.

권장 방식:

단계	재고 처리
견적 초안	차감 없음
견적 요청	차감 없음
협상 중	차감 없음 또는 소프트 홀드
최종 수락	제한 시간 재고 예약
주문 전환	정식 예약
결제/여신 승인	출고 가능
출고	실제 차감

대량 주문은 재고 부족 시 다음 선택지를 제공해야 합니다.

전체 출고
분할 출고
예약 주문
생산 후 출고
대체 상품 제안
14. 세금과 가격 표시

B2C와 B2B는 가격 표시 기준이 달라질 수 있으므로 가격값 하나만 저장해서는 안 됩니다.

price_amount
tax_included
tax_rate
tax_amount
currency

화면 예:

B2C: 110,000원, 부가세 포함
B2B: 공급가 100,000원 + VAT 10,000원

견적과 주문에는 다음 금액을 모두 저장하는 것이 좋습니다.

subtotal_excluding_tax
tax_amount
subtotal_including_tax
shipping_excluding_tax
shipping_tax
discount_amount
grand_total
15. API 구조

프론트엔드는 직접 B2C/B2B 가격을 계산하지 않고 서버 가격 API를 호출해야 합니다.

상품 조회
GET /api/products/{productId}

서버가 로그인 컨텍스트를 확인해 응답합니다.

{
  "productId": 100,
  "sku": "SKU-100",
  "name": "상품 A",
  "salesContext": "B2B",
  "price": {
    "unitPrice": 85000,
    "originalPrice": 100000,
    "priceSource": "B2B_DEFAULT",
    "taxIncluded": false
  },
  "quantityRule": {
    "minimum": 10,
    "increment": 5
  },
  "transactionMode": "QUOTE_OPTIONAL"
}
가격 시뮬레이션
POST /api/pricing/resolve
{
  "companyId": 501,
  "items": [
    {
      "sku": "SKU-100",
      "quantity": 100
    }
  ]
}
견적 요청
POST /api/b2b/quotes
견적 재제안
POST /api/b2b/quotes/{quoteId}/counter-offers
견적 승인
POST /api/b2b/quotes/{quoteId}/accept
주문 전환
POST /api/b2b/quotes/{quoteId}/convert-to-order

주문 전환 API에는 중복 생성을 방지하기 위한 idempotency-key가 필요합니다.

16. 서비스 모듈 구성

초기에는 별도 마이크로서비스보다 모듈형 모놀리스가 적합합니다.

Commerce Application
 ├─ Identity Module
 ├─ Customer Module
 ├─ Company Module
 ├─ Catalog Module
 ├─ Pricing Module
 ├─ Cart Module
 ├─ Quote Module
 ├─ Negotiation Module
 ├─ Order Module
 ├─ Payment/Credit Module
 ├─ Inventory Module
 ├─ Fulfillment Module
 ├─ Tax Invoice Module
 └─ Notification Module

특히 다음 네 모듈의 경계가 중요합니다.

Pricing Module
B2C 가격
B2B 기본 가격
회사별 가격
수량 가격
견적 가격
가격 우선순위
Quote Module
견적 생성
견적 버전
상태 전이
유효기간
주문 전환
Company Module
회사 계정
사업자 승인
사용자 권한
가격 정책
결제 조건
Order Module
B2C/B2B 주문 공통 처리
재고 예약
결제
출고
취소·반품
17. 반드시 피해야 할 구조
17.1 로그인 여부만으로 B2B 판정
로그인 사용자 = B2B

이렇게 처리하면 안 됩니다.

반드시 다음을 확인해야 합니다.

회사 소속 여부
회사 승인 상태
사용자 상태
가격 조회 권한
견적 권한
주문 권한
회사 계약 유효기간
17.2 프론트엔드에서 가격만 숨김

HTML이나 JavaScript에서 B2B 가격을 숨기는 방식은 보안상 의미가 없습니다.

가격 결정과 주문 금액 검증은 모두 서버에서 다시 수행해야 합니다.

17.3 장바구니 가격을 주문 시 그대로 신뢰

주문 생성 시 다음을 다시 검사해야 합니다.

회사 상태
회원 권한
가격 정책 유효기간
상품 판매 가능 상태
최소 수량
재고
견적 유효기간
결제 조건

다만 확정된 견적 주문은 현재 가격이 아니라 견적 확정 가격을 사용해야 합니다.

17.4 견적 협상 내용을 단순 댓글로만 저장

가격·수량·배송비 변경은 구조화된 데이터와 버전으로 저장해야 합니다.

댓글: 협상 커뮤니케이션
Revision: 금액과 조건 변경 기록
Audit Log: 관리자 작업 기록
18. 단계별 구축 권장안
1단계: 기본 B2B 판매
회사 회원 가입 및 승인
상품별 B2B 가격
최소 주문 수량
B2B 장바구니
B2B 주문 구분
관리자 B2B 주문 목록
2단계: 가격 정책
회사 등급
회사별 가격
수량별 가격
적용 기간
가격 우선순위
가격 CSV 일괄 등록
3단계: 견적 및 협상
견적 요청
관리자 가격 제안
고객 재제안
메시지 및 첨부파일
견적 버전
유효기간
견적서 PDF
주문 전환
4단계: 기업 구매 고도화
회사 내부 승인
구매 한도
발주서 번호
후불·여신
세금계산서
분할 출고
월별 정산
영업 담당자
ERP 연동
최종 권장 모델
하나의 몰
하나의 상품 마스터
하나의 SKU 및 재고
하나의 공통 주문 엔진

+ 사용자 거래 컨텍스트
+ 기업 계정과 권한
+ 다단계 가격 정책
+ B2B 전용 장바구니
+ 별도 견적/협상 도메인
+ B2B 주문 확장정보
+ 관리자 B2B 전용 업무화면

가장 중요한 설계 원칙은 다음 세 가지입니다.

상품과 재고는 통합한다.
가격은 상품 속성이 아니라 회사·수량·계약·견적을 고려하는 정책으로 관리한다.
견적은 주문의 상태가 아니라 별도 객체로 관리하고, 합의된 견적을 주문으로 전환한다.

이 구조라면 현재 B2C 쇼핑몰 빌더를 크게 훼손하지 않고 B2B 기능을 추가할 수 있으며, 향후 회사별 계약가·대리점 등급·후불·발주서·분할 배송까지 확장할 수 있습니다.