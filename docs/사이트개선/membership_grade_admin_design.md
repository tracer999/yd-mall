# 쇼핑몰 멤버십 등급 및 혜택 관리 설계서

> 작성일: 2026-07-15  
> 대상: 쇼핑몰 빌더 관리자 및 스토어프론트  
> 범위: 멤버십 등급, 등급 평가 기준, 자동 승급·강등, 등급별 혜택, 주문·취소·환불 연계, 운영 이력 및 통계

---

## 1. 문서 목적

쇼핑몰 회원을 구매 실적과 운영 정책에 따라 등급화하고, 각 등급에 할인·적립·쿠폰·배송비·전용 접근 등의 혜택을 자동 적용하기 위한 관리자 기능과 처리 로직을 정의한다.

본 설계의 핵심은 다음 세 영역을 분리하는 것이다.

1. **등급 정의**: 등급명, 순위, 표시 정보, 사용 상태
2. **평가 정책**: 어떤 실적을 어느 기간 동안 계산하여 언제 승급·유지·강등할지
3. **혜택 정책**: 해당 등급에 어떤 혜택을 어떤 조건과 우선순위로 적용할지

등급 테이블에 기준과 혜택을 모두 직접 저장하는 단순 구조는 정책 변경 이력, 예약 적용, 시뮬레이션, 주문 취소에 따른 재계산을 처리하기 어렵다. 따라서 정책 버전과 적용 이력을 별도 관리하는 구조를 권장한다.

> **§4~§21 은 제품·업계 표준에 기반한 일반 설계다. 이 설계를 yd-mall 의 현행 코드·스키마에 어떻게 얹을지(연동 지점, 실측 근거, 착수를 미룬 배경)는 문서 맨 끝 [부록 A. yd-mall 현행 연동 지점 및 배경(실측)](#부록-a-yd-mall-현행-연동-지점-및-배경실측) 에 정리했다. 구현 착수 전 부록 A 를 먼저 읽는다.**

---

## 2. 설계 원칙

### 2.1 등급과 고객군을 구분한다

- **멤버십 등급**: 한 회원에게 원칙적으로 하나만 부여되는 순위형 상태
- **고객 세그먼트**: VIP 후보, 휴면 위험, 특정 브랜드 구매자처럼 여러 조건에 동시에 포함될 수 있는 집합

등급은 혜택과 승급 체계에 사용하고, 세그먼트는 타기팅·캠페인·분석에 사용한다.

### 2.2 주문 시점의 등급과 혜택을 주문에 스냅샷으로 저장한다

회원의 현재 등급이 이후 변경되더라도 과거 주문의 할인 근거가 변하지 않도록 주문에 다음 정보를 저장한다.

- 주문 당시 회원 등급 ID 및 등급명
- 적용된 혜택 정책 버전
- 혜택별 할인·적립 금액
- 중복 적용 및 제외 사유

### 2.3 등급 평가는 확정 실적만 사용한다

기본 권장 기준은 다음과 같다.

- 결제 완료만으로 실적에 즉시 포함하지 않음
- 배송 완료 또는 구매 확정 후 실적 확정
- 취소·반품·환불 금액은 실적에서 차감
- 부분 반품은 해당 품목의 인정 실적만 차감
- 테스트 주문, 관리자 생성 주문, 부정 거래는 제외 가능

### 2.4 정책 변경은 즉시 덮어쓰지 않고 버전으로 관리한다

정책에는 `작성중 → 예약 → 적용중 → 종료` 상태를 둔다. 적용 중인 정책은 직접 수정하지 않고 새 버전을 생성하여 적용일을 예약한다.

### 2.5 자동 평가와 수동 조정을 함께 지원한다

- 자동 평가: 정기 배치 또는 이벤트 기반
- 수동 변경: CS, 제휴, 임직원, 보상 목적
- 등급 고정: 자동 평가 대상에서 일시적 또는 영구 제외
- 수동 변경에는 사유, 관리자, 만료일, 이전 등급을 기록

---

## 3. 관리자 메뉴 구조

```text
회원관리
└─ 멤버십 관리
   ├─ 멤버십 대시보드
   ├─ 등급 관리
   ├─ 등급 평가 정책
   ├─ 등급별 혜택 관리
   ├─ 회원 등급 현황
   ├─ 등급 변경 예정자
   ├─ 등급 변경 이력
   ├─ 평가 실행 이력
   └─ 멤버십 운영 설정
```

### 3.1 권장 권한 분리

| 권한 | 조회 | 등급 정의 | 정책 변경 | 수동 등급 변경 | 평가 실행 | 이력 다운로드 |
|---|---:|---:|---:|---:|---:|---:|
| 최고 관리자 | O | O | O | O | O | O |
| 회원 운영자 | O | 제한 | 제한 | O | 제한 | O |
| 프로모션 운영자 | O | X | 혜택만 | X | X | O |
| CS 운영자 | O | X | X | 제한 | X | 제한 |
| 분석 담당자 | O | X | X | X | X | O |

---

## 4. 멤버십 대시보드

### 4.1 주요 지표

- 전체 회원 수 및 활성 회원 수
- 등급별 회원 수와 구성비
- 최근 평가일 및 다음 평가 예정일
- 승급·유지·강등 예정 인원
- 등급별 최근 30일 매출, 객단가, 주문 빈도
- 등급별 할인 비용, 적립 예정액, 쿠폰 비용
- 혜택 비용 대비 매출 기여도
- 수동 고정 회원 수
- 평가 실패 및 혜택 적용 오류 건수

### 4.2 경고 항목

- 기준 구간이 겹치거나 비어 있는 등급
- 활성 등급인데 혜택이 없는 경우
- 혜택 종료일이 임박한 경우
- 동일 주문에 과도한 중복 할인이 가능한 경우
- 평가 정책이 변경됐지만 시뮬레이션하지 않은 경우
- 강등 예정자가 급증한 경우

---

## 5. 등급 관리

### 5.1 등급 목록 화면

| 필드 | 설명 |
|---|---|
| 등급명 | 사용자 노출 명칭 |
| 내부 코드 | API·데이터 연계용 불변 코드 |
| 순위 | 1이 최상위인 정렬 순위 |
| 회원 수 | 현재 소속 회원 수 |
| 평가 기준 요약 | 금액·건수·포인트 기준 요약 |
| 주요 혜택 | 할인·적립·무료배송 등 |
| 자동 평가 대상 | 포함/제외 |
| 상태 | 작성중/사용/중지 |
| 적용 기간 | 시작일~종료일 |

### 5.2 등급 등록·수정 항목

#### 기본 정보

- 등급명
- 내부 코드
- 설명
- 순위
- 아이콘 및 배지 이미지
- 사용자 노출 색상
- 마이페이지 안내 문구
- 기본 가입 등급 여부
- 사용 여부

#### 운영 속성

- 자동 평가 대상 여부
- 수동 전용 등급 여부
- 강등 금지 여부
- 등급 유지 최소 기간
- 신규 회원 보호 기간
- 탈퇴 후 재가입 시 등급 복원 여부
- 기업·임직원·파트너 등 특수 등급 구분

### 5.3 삭제 정책

다음 조건에서는 물리 삭제를 금지하고 비활성화만 허용한다.

- 현재 회원이 소속되어 있음
- 주문 또는 혜택 적용 이력이 있음
- 적용 중이거나 예약된 평가 정책에 참조됨

삭제 전 회원 이동 대상 등급을 지정하게 한다.

---

## 6. 등급 평가 정책

## 6.1 평가 기준 종류

### 구매 기반

- 인정 구매금액
- 인정 주문 건수
- 인정 상품 수량
- 평균 주문금액
- 특정 카테고리 또는 브랜드 구매금액

### 활동 기반

- 적립 포인트
- 리뷰 작성 수
- 출석 수
- 추천 가입 수
- 정기구독 유지기간

### 혼합 기준

- 구매금액 AND 주문 건수
- 구매금액 OR 주문 건수
- 구매금액 + 활동점수의 가중치 점수

MVP에서는 운영 복잡도를 낮추기 위해 다음 세 가지를 우선 지원한다.

1. 인정 구매금액
2. 인정 구매금액 AND 인정 주문 건수
3. 인정 구매금액 OR 인정 주문 건수

## 6.2 인정 구매금액 정의

관리자가 다음 산식을 선택하도록 한다.

```text
A. 상품 판매가 합계
B. 상품 판매가 - 상품할인 - 주문할인 - 쿠폰할인
C. B - 사용 적립금 - 예치금 - 기타 결제수단
D. B + 인정 배송비
```

**권장 기본값:** `B`, 즉 실제 상품 매출에 가까운 금액. 배송비, 쿠폰 재원, 적립금 사용액을 실적에 포함할지는 정책으로 선택한다.

### 제외 항목

- 취소·반품·환불 금액
- 배송비 또는 추가 배송비
- 사은품
- 0원 주문
- 테스트 주문
- 부정 주문
- 특정 상품·카테고리·브랜드
- 세금 또는 관세 등 대납 비용

## 6.3 평가 기간

지원 유형:

- 최근 N개월 이동 기간: 최근 3·6·12·24개월
- 직전 분기
- 직전 반기
- 직전 연도
- 연간 누적
- 평생 누적
- 사용자 지정 기간

**권장 기본안:** 최근 12개월 이동 구매 실적.

## 6.4 평가 주기

- 실시간: 구매 확정·환불 완료 이벤트마다 후보 계산
- 일 1회: 새벽 배치
- 월 1회: 매월 1일
- 분기 1회
- 수동 실행

**권장 구조:**

- 구매 확정 시 승급 후보는 실시간 또는 일 배치로 반영
- 정식 승급·유지·강등은 월 1회 실행
- 환불 발생 시 실적은 즉시 차감하되, 이미 사용한 혜택은 소급 회수하지 않음

## 6.5 승급·강등 규칙

### 승급

- 현재 등급보다 높은 등급 중 조건을 충족하는 최상위 등급으로 이동
- 즉시 승급 또는 다음 정기 평가일 승급을 선택
- 승급 시 보호기간을 부여할 수 있음

### 유지

- 현재 등급의 유지 기준을 충족하면 유지
- 진입 기준과 유지 기준을 다르게 설정 가능

### 강등

- 유지 기준 미충족 시 한 단계 또는 적정 등급으로 강등
- 한 번에 한 단계만 강등하는 완충 옵션 제공
- 강등 유예기간 제공 가능

### 권장 히스테리시스 예시

등급 경계에서 반복 승급·강등되는 현상을 줄이기 위해 진입 기준과 유지 기준을 다르게 둔다.

| 등급 | 승급 기준 | 유지 기준 |
|---|---:|---:|
| GOLD | 최근 12개월 100만원 | 최근 12개월 80만원 |
| VIP | 최근 12개월 300만원 | 최근 12개월 250만원 |

## 6.6 평가 정책 화면 항목

- 정책명 및 버전
- 적용 시작일·종료일
- 기준 실적 종류
- 인정 금액 산식
- 실적 기간
- 평가 주기
- 승급 반영 방식
- 강등 반영 방식
- 신규 회원 보호기간
- 승급 후 최소 유지기간
- 환불·취소 반영 방식
- 대상/제외 회원 조건
- 등급별 진입·유지 구간
- 변경 알림 설정

## 6.7 정책 검증

저장 전 다음을 자동 검증한다.

- 등급별 금액 구간 중복
- 조건 미설정 등급
- 상위 등급 기준이 하위 등급보다 낮은 역전
- AND/OR 조건 모호성
- 평가 기간보다 짧은 데이터 보존기간
- 적용 시작일이 과거이면서 기존 정책과 중복
- 모든 회원이 한 등급에 몰릴 가능성이 높은 기준

---

## 7. 등급별 혜택 관리

## 7.1 혜택 유형

### 가격 혜택

- 주문 금액 정률 할인
- 주문 금액 정액 할인
- 상품 금액 정률 할인
- 상품 금액 정액 할인
- 회원 전용 판매가
- 카테고리·브랜드별 할인

### 적립 혜택

- 기본 적립률 대체
- 기본 적립률에 추가 적립
- 정액 추가 적립
- 특정 상품·브랜드 추가 적립
- 구매 확정 후 지급

### 쿠폰 혜택

- 등급 진입 시 자동 발급
- 월 정기 쿠폰팩
- 생일 쿠폰
- 등급 유지 기념 쿠폰
- 무료배송 쿠폰

### 배송 혜택

- 무료배송
- 도서산간 추가 배송비 제외 여부
- 당일·우선 배송
- 무료 반품 횟수

### 접근·서비스 혜택

- 회원 전용 상품 구매
- 선오픈·사전 구매
- 구매 수량 제한 완화
- 전용 기획전 접근
- 전용 CS 채널
- 사은품 자동 증정

## 7.2 혜택 정책 공통 필드

- 혜택명 및 내부 코드
- 혜택 유형
- 대상 등급
- 적용 기간
- 적용 채널: PC·모바일 웹·앱·오프라인·API
- 적용 상품 범위
- 최소 주문금액
- 최대 할인금액
- 사용 횟수 제한
- 결제수단 제한
- 정기배송·예약상품 적용 여부
- 중복 적용 그룹
- 우선순위
- 자동 적용/쿠폰 발급 방식
- 비용 부담 주체
- 상태

## 7.3 할인 중복 적용 정책

관리자에서 전역 중복 규칙과 혜택별 예외를 설정한다.

### 권장 할인 계산 순서

```text
상품 판매가
→ 상품 자체 할인
→ 회원 등급 상품 할인
→ 상품 쿠폰
→ 주문 등급 할인
→ 주문 쿠폰
→ 프로모션 코드
→ 적립금·예치금 사용
→ 배송비 할인
```

### 중복 모드

- 중복 허용
- 동일 그룹 내 최댓값 1개만 적용
- 회원에게 유리한 조합 자동 선택
- 특정 혜택 우선 적용
- 등급 할인과 쿠폰 중 선택

### 필수 안전장치

- 상품별 최대 할인율
- 주문별 최대 할인금액
- 원가 이하 판매 방지 옵션
- 쿠폰과 등급 할인 중복 시 예상 할인 표시
- 혜택 적용 사유와 미적용 사유 로그

## 7.4 적립 정책

다음 중 하나를 명시적으로 선택한다.

- 기본 적립률을 등급 적립률로 **대체**
- 기본 적립률에 등급 적립률을 **추가**
- 상품 적립과 등급 적립 중 큰 값만 적용

적립금은 결제 시 계산하되 구매 확정 후 지급하는 구조를 권장한다. 취소·반품 시 미확정 적립은 취소하고, 이미 지급된 적립은 회수한다. 잔액 부족 시 음수 잔액 허용 여부 또는 향후 적립 상계 정책을 설정한다.

---

## 8. 회원 등급 현황 관리

### 8.1 검색 조건

- 회원 ID·이름·연락처
- 현재 등급
- 다음 예상 등급
- 등급 변경 유형
- 가입일
- 최근 구매일
- 인정 구매금액·주문 건수
- 수동 고정 여부
- 휴면·탈퇴 상태

### 8.2 목록 필드

- 회원 정보
- 현재 등급 및 적용일
- 평가기간 인정 실적
- 다음 등급까지 필요한 금액·건수
- 다음 평가 예정 등급
- 고정 여부·만료일
- 최근 등급 변경일

### 8.3 관리 기능

- 개별 수동 변경
- 다건 일괄 변경
- 등급 고정 및 해제
- 변경 예약
- 엑셀 업로드·다운로드
- 평가 상세보기
- 회원 통지 재발송

수동 변경 시 필수 입력:

- 변경 등급
- 변경 사유 코드
- 상세 사유
- 적용일
- 종료일 또는 무기한
- 자동 평가 제외 여부
- 고객 통지 여부

---

## 9. 변경 예정자 및 시뮬레이션

정책 적용 전 반드시 시뮬레이션 기능을 제공한다.

### 9.1 시뮬레이션 결과

- 현재 등급별 대상자 수
- 승급·유지·강등 인원
- 회원별 변경 전후 등급
- 기준 충족 근거
- 예상 월간 할인 비용
- 예상 적립금 지급액
- 예상 무료배송 비용
- 정책 변경 전후 차이

### 9.2 실행 방식

1. 정책 작성
2. 전체 또는 샘플 시뮬레이션
3. 운영자 검토
4. 승인
5. 적용 예약
6. 평가 실행
7. 결과 검증 및 알림 발송

대규모 회원의 경우 평가 작업을 비동기 잡으로 실행하며 진행률, 성공·실패 수, 재시도 상태를 제공한다.

---

## 10. 핵심 처리 로직

## 10.1 주문 실적 확정

```text
[구매확정 이벤트]
  → 주문·회원·상품 유효성 확인
  → 제외 주문/상품 판정
  → 인정 실적 산출
  → 회원 실적 원장에 적립
  → 등급 후보 재계산
  → 즉시 승급 정책이면 등급 변경
  → 변경 이력 및 알림 생성
```

## 10.2 취소·반품·환불

```text
[취소/반품/환불 확정]
  → 기존 실적 원장 조회
  → 환불 품목 비율에 따라 인정 실적 차감
  → 적립 예정 취소 또는 지급 적립 회수
  → 등급 후보 재계산
  → 정책에 따라 즉시 강등 또는 다음 평가일까지 유예
```

### 권장 원칙

- 승급은 빠르게, 강등은 정기 평가 시 수행
- 이미 완료된 과거 주문 할인은 소급 환수하지 않음
- 부정 승급으로 판정된 경우에만 관리자 강제 조정 가능

## 10.3 정기 등급 평가

```text
1. 적용 중인 평가 정책과 버전 잠금
2. 평가 대상 회원 스냅샷 생성
3. 회원별 인정 실적 집계
4. 최상위 등급부터 기준 판정
5. 수동 고정·보호기간·특수등급 제외
6. 변경 예정 결과 생성
7. 검증 및 오류 분리
8. 회원 등급 일괄 반영
9. 혜택·쿠폰 후속 작업 실행
10. 알림 발송
11. 실행 결과 및 정책 버전 기록
```

## 10.4 주문 혜택 계산

```text
1. 로그인 회원의 현재 유효 등급 조회
2. 주문 시점에 유효한 혜택 정책 조회
3. 채널·상품·결제수단·최소금액 조건 필터링
4. 적용 가능한 혜택 후보 생성
5. 중복 그룹과 우선순위에 따라 조합 계산
6. 최대 할인 한도 및 원가 제한 검증
7. 최종 혜택 확정
8. 주문에 등급·정책·계산 결과 스냅샷 저장
```

---

## 11. 데이터 모델

### 11.1 핵심 테이블

#### `membership_grade`

- `grade_id`
- `mall_id`
- `grade_code`
- `grade_name`
- `rank_order`
- `is_default`
- `is_manual_only`
- `is_auto_evaluation`
- `status`
- `display_config_json`
- `created_at`, `updated_at`

#### `membership_evaluation_policy`

- `policy_id`
- `mall_id`
- `policy_name`
- `version`
- `status`
- `performance_period_type`
- `performance_period_value`
- `evaluation_cycle`
- `amount_basis`
- `upgrade_mode`
- `downgrade_mode`
- `effective_from`, `effective_to`

#### `membership_grade_criterion`

- `criterion_id`
- `policy_id`
- `grade_id`
- `entry_amount_min`
- `entry_order_count_min`
- `retention_amount_min`
- `retention_order_count_min`
- `condition_operator`
- `minimum_holding_days`
- `grace_days`

#### `membership_benefit_policy`

- `benefit_id`
- `mall_id`
- `benefit_code`
- `benefit_name`
- `benefit_type`
- `calculation_type`
- `benefit_value`
- `max_benefit_amount`
- `minimum_order_amount`
- `stack_group`
- `stack_mode`
- `priority`
- `effective_from`, `effective_to`
- `status`

#### `membership_grade_benefit`

- `grade_id`
- `benefit_id`
- `override_config_json`

#### `customer_membership`

- `customer_id`
- `current_grade_id`
- `grade_started_at`
- `grade_expires_at`
- `is_locked`
- `lock_reason`
- `lock_expires_at`
- `last_evaluated_at`
- `next_evaluation_at`

#### `customer_performance_ledger`

- `ledger_id`
- `customer_id`
- `source_type`
- `source_id`
- `event_type`
- `recognized_amount`
- `recognized_order_count`
- `recognized_point`
- `occurred_at`
- `reversal_of_ledger_id`

#### `membership_grade_history`

- `history_id`
- `customer_id`
- `from_grade_id`
- `to_grade_id`
- `change_type`
- `reason_code`
- `policy_id`
- `evaluation_run_id`
- `effective_at`
- `changed_by`

#### `membership_evaluation_run`

- `run_id`
- `policy_id`
- `target_count`
- `success_count`
- `failure_count`
- `upgrade_count`
- `downgrade_count`
- `started_at`, `completed_at`
- `status`

#### `order_membership_benefit_snapshot`

- `order_id`
- `customer_id`
- `grade_id`
- `grade_name_snapshot`
- `benefit_policy_version`
- `benefit_details_json`
- `total_grade_discount`
- `expected_grade_point`

---

## 12. API 설계 예시

```http
GET    /admin/membership/grades
POST   /admin/membership/grades
PUT    /admin/membership/grades/{gradeId}

GET    /admin/membership/evaluation-policies
POST   /admin/membership/evaluation-policies
POST   /admin/membership/evaluation-policies/{policyId}/simulate
POST   /admin/membership/evaluation-policies/{policyId}/activate

GET    /admin/membership/benefits
POST   /admin/membership/benefits
PUT    /admin/membership/benefits/{benefitId}

GET    /admin/membership/customers
POST   /admin/membership/customers/{customerId}/change-grade
POST   /admin/membership/customers/bulk-change-grade

POST   /internal/membership/performance/order-confirmed
POST   /internal/membership/performance/order-refunded
POST   /internal/membership/evaluate
POST   /internal/membership/calculate-benefits
```

### API 공통 요구사항

- `mall_id` 기반 테넌트 격리
- 관리자 권한 검증
- 멱등키 지원
- 정책 버전 반환
- 변경 사유 및 감사 로그 기록
- 평가·혜택 계산 API의 재현 가능성 확보

---

## 13. 사용자 화면

### 마이페이지

- 현재 등급과 배지
- 등급 유효기간
- 제공 혜택 목록
- 다음 등급까지 필요한 금액·주문 수
- 평가기간과 다음 평가일
- 최근 12개월 인정 구매금액
- 실적 제외 기준 안내
- 등급 변경 이력

### 장바구니·주문서

- 적용 예정 등급 할인
- 예상 적립금
- 무료배송 적용 여부
- 쿠폰과 중복 여부
- 미적용 사유

### 등급 안내 페이지

- 전체 등급과 기준
- 각 등급 혜택
- 평가 주기
- 취소·반품 반영 원칙
- 정책 변경 공지

---

## 14. 알림 정책

알림 이벤트:

- 승급 완료
- 등급 유지
- 강등 예정
- 강등 완료
- 등급 만료 예정
- 정기 쿠폰 발급
- 다음 등급 임박

채널:

- 앱 푸시
- 이메일
- SMS·알림톡
- 마이페이지 알림

강등은 최소 7~30일 전에 사전 안내하는 옵션을 권장한다.

---

## 15. 예외 및 운영 정책

### 15.1 비회원 주문 후 회원 전환

- 본인 인증이 가능한 경우 주문 귀속 기능 제공
- 귀속 가능 기간과 대상 주문 상태 제한
- 중복 귀속 방지

### 15.2 계정 통합

- 주 계정으로 실적 원장 이전
- 등급은 통합 실적 기준 재평가
- 변경 이력 보존

### 15.3 탈퇴 및 재가입

- 법적 보존 주문정보와 회원 프로필을 분리
- 재가입 시 과거 실적 복원 여부를 운영정책으로 결정
- 동일인 판별 근거와 동의 절차 필요

### 15.4 부정 이용

- 반복 취소 후 승급
- 가족·복수 계정 합산 악용
- 쿠폰·적립금 비정상 사용
- 관리자 수동 등급 오남용

의심 이벤트를 별도 감사 로그에 기록하고 등급 평가 보류 기능을 제공한다.

---

## 16. 로그 및 감사

반드시 기록할 항목:

- 등급·기준·혜택 정책 생성 및 변경
- 변경 전후 값
- 작업 관리자
- 작업 시각과 IP
- 수동 등급 변경 사유
- 평가 실행 입력 정책 버전
- 회원별 판정 근거
- 주문별 혜택 계산 근거
- 오류 및 재처리 결과

정책 및 주문 혜택 로그는 분쟁 대응을 위해 장기 보존을 권장한다.

---

## 17. MVP 권장 범위

### 1차 MVP

- 등급 CRUD 및 순위 관리
- 기본 가입 등급
- 최근 12개월 인정 구매금액·주문 건수 기준
- 월 1회 자동 평가
- 수동 등급 변경 및 고정
- 등급별 정률 할인·추가 적립·무료배송
- 할인 중복 우선순위
- 주문·환불 실적 원장
- 등급 변경 이력
- 평가 시뮬레이션
- 마이페이지 등급·혜택 표시

### 2차

- 실시간 승급
- 진입·유지 기준 분리
- 쿠폰팩·생일·기념일 혜택
- 상품·브랜드별 혜택
- 등급 비용·효율 분석
- 강등 사전 안내
- 고객 세그먼트 연계

### 3차

- 포인트 기반 복합 평가
- 제휴·오프라인 통합 멤버십
- 예측 기반 VIP 후보 추천
- 멤버십 A/B 테스트
- 외부 CRM·CDP 연동

---

## 18. 권장 초기 정책 예시

| 등급 | 최근 12개월 승급 기준 | 유지 기준 | 혜택 예시 |
|---|---:|---:|---|
| BASIC | 가입 | - | 기본 적립 1% |
| SILVER | 30만원 또는 3건 | 20만원 | 추가 적립 0.5% |
| GOLD | 100만원 또는 8건 | 80만원 | 2% 할인, 추가 적립 1%, 월 1회 무료배송 |
| VIP | 300만원 또는 15건 | 250만원 | 5% 할인, 추가 적립 2%, 상시 무료배송, 선오픈 |

이 수치는 예시이며 실제 적용 전 최근 12개월 회원별 구매 분포를 이용해 시뮬레이션해야 한다. 등급별 회원 비율, 예상 할인 비용, 강등 규모를 확인한 뒤 기준을 확정한다.

---

## 19. 구현 시 핵심 결정사항

1. 인정 구매금액을 총 주문금액, 할인 후 금액, 실결제금액 중 무엇으로 정의할지
2. 구매확정·배송완료 중 어느 시점에 실적을 확정할지
3. 승급은 즉시, 강등은 정기 평가로 할지
4. 최근 N개월 이동기간과 달력 기준 기간 중 무엇을 사용할지
5. 기본 적립과 등급 적립을 대체할지 추가할지
6. 등급 할인과 쿠폰의 중복을 어디까지 허용할지
7. 수동 등급의 자동 평가 제외 기간을 어떻게 관리할지
8. 정책 변경 시 기존 회원을 즉시 재평가할지 다음 평가일부터 적용할지
9. 멀티몰에서 등급을 몰별로 분리할지 통합 멤버십으로 운영할지
10. 외부 주문 채널의 실적을 어떤 상태와 기준으로 동기화할지

---

## 20. 참고한 공식·운영 자료

- 카페24 회원 등급 관리: 일정 기간 구매 이력에 따른 자동 등급 변경, 구매금액·구매건수 조건, 실적 기간, 등급별 할인·적립·무료배송 설정  
  https://support.cafe24.com/hc/ko/articles/7751395095449
- 카페24 회원 등급별 적립금: 기본 적립과 등급별 추가 적립 및 지급 제외 등급 설정  
  https://support.cafe24.com/hc/ko/articles/8465867297817
- 카페24 회원 등급별 할인: 등급 관리와 쿠폰을 통한 할인·적립·배송비 혜택  
  https://support.cafe24.com/hc/ko/articles/8467148104729
- NHN커머스 고도몰 회원관리: 등급별 할인, 평가기간, 일괄 변경 운영 사례  
  https://godomall-help.nhn-commerce.com/faq/admin/member/managing-member
- Shopify 고객 세그먼트: 조건 테스트, 세그먼트 기반 할인·무료배송·Buy X Get Y 구성  
  https://help.shopify.com/en/manual/customers/customer-segmentation/manage-customer-segments
- Yotpo Loyalty Tiers: 등급 기간, 진입 임계값, 등급별 혜택의 분리 구성  
  https://support.yotpo.com/docs/create-loyalty-tiers-program

---

## 21. 결론

멤버십 기능은 `회원의 현재 등급`만 저장하는 기능이 아니라 다음 네 개의 독립 영역으로 구현해야 한다.

```text
회원 실적 원장
→ 등급 평가 엔진
→ 등급 상태 및 변경 이력
→ 주문 혜택 계산 엔진
```

관리자에서는 **등급 관리**, **평가 정책**, **혜택 정책**, **회원별 상태**, **시뮬레이션과 실행 이력**을 분리한다. 주문에는 적용 당시의 등급과 혜택 정책을 스냅샷으로 저장하고, 취소·반품은 실적 원장에서 역분개하는 구조가 가장 안정적이다.

---

## 부록 A. yd-mall 현행 연동 지점 및 배경(실측)

> 이 부록은 위 일반 설계(§4~§21)를 **이 저장소의 실제 코드·스키마**에 접지한다. 파일:라인은 2026-07 실측이며, 스키마 판단은 항상 **실 DB(84테이블) 를 소스 오브 트루스**로 한다(`tables.sql` 은 42테이블만 정의 — 드리프트 있음). 다른 계획서에 흩어져 있던 멤버십 관련 항목(잔여과제·미룬 배경·쿠폰 의존)을 여기로 통합했다.

### A.1 현재 상태 — "정적 안내"까지만 구현됨

- 등급·혜택은 **하드코딩 상수**뿐이다: `services/membership/membershipInfo.js` 의 `TIERS`(웰컴 1% / 실버 2% / 골드 3% / VIP 5%) · `BENEFITS`. 등급을 **산정하지 않는다.**
- 소비처는 안내용 2곳뿐: `GET /membership`(`routes/feature.js:285`) 랜딩, `/event` 혜택 허브의 멤버십 섹션(`controllers/eventController.js:51`). 두 곳 모두 회원별 계산 없이 상수를 렌더한다.
- **등급 저장소가 없다.** `users` 에 등급 컬럼이 없고 `points_balance`(int) 뿐이다(`tables.sql` users 정의). `user_grade`/`membership_grade` 테이블도 없다 → §11 데이터 모델을 **신규로** 만들어야 한다.
- 구매 적립률이 **회원 전체 단일 5% 하드코딩 폴백**이다: `controllers/checkoutController.js:190` `const rate = Number(global.systemSettings?.point_accumulate_rate || 5) || 5;` — 등급별 차등이 없다.

### A.2 착수를 미룬 배경 (gnb_menu_design.md 에서 이관)

- 미룬 이유는 **주문 데이터 부족**이었다(설계 시점 `orders` 약 21건). 구매액 기반 등급을 계산할 표본이 없으면 전 회원이 최하위 등급으로만 나온다. **주문이 쌓인 뒤 착수**한다는 판단이었다.
- 멤버십은 2026-07 사용자 결정으로 GNB 에서 내려가 `/event` 하위 섹션 + `/membership` 정적 랜딩으로 편입됐다(라우트는 유지 — 기존 링크·북마크 보호).

### A.3 실적 원장의 데이터 원천 (§2.3 · §6.2 · §10.1 접지)

- 회원별 누적 실적의 현행 원천은 이 쿼리다(관리자 회원관리가 이미 사용): `controllers/admin/userController.js:17-28`
  ```sql
  SELECT user_id, COUNT(*) order_count, SUM(total_amount) total_payment
  FROM orders WHERE status = 'PAID' AND user_id IS NOT NULL GROUP BY user_id
  ```
- **취소·환불 반영은 상태 전이로 자동 처리**된다: 취소·환불 시 `orders.status` 가 `CANCELLED`/`REFUNDED` 로 바뀌어 `status='PAID'` 집계에서 빠진다(별도 차감 로직 불필요). 단 이는 주문 단위이므로, §10.2 의 **부분 반품 비율 차감**은 `customer_performance_ledger` 역분개(§11.1)로 별도 구현해야 한다.
- 결제 확정 = `status='PAID'`. 일반 주문에는 **구매확정(CONFIRMED) 상태가 없다**(공동구매 `group_buy` 에만 존재). 따라서 §2.3 "배송완료/구매확정 후 확정" 원칙을 쓰려면 `DELIVERED` 를 확정 트리거로 삼거나 구매확정 상태를 신설해야 한다 → §19-2 결정사항과 직결.
- ⚠️ 결함 주의: 현재 결제 확정이 `orderStatusService.transition()` 을 우회해 `payment_status` 가 어긋난다(`commerce_backbone.md` 알려진 결함). 실적 확정 트리거를 `status` 전이에 걸 때 이 경로 단일화가 선행돼야 한다.

### A.4 혜택 적용 지점 매핑 (§7 · §10.4 접지)

| 설계 혜택 | 현행 코드 | 등급 연동 방법 |
|---|---|---|
| 적립률 대체/추가(§7.4) | `checkoutController.js:189-203`, 기준액 `payAmount`(배송비 제외), `point_transactions`(`PURCHASE_ACCUMULATE`) | 단일 `rate` 를 **등급 적립률로 대체/가산**. 적립은 결제 트랜잭션과 같은 커밋에서 일어남 — 등급 조회를 이 지점에 주입 |
| 무료배송/배송 혜택(§7.1) | `services/shipping/shippingCalculator.js` `calcShippingFee({mallId, subtotalAmount, receiverZipcode})`, 판정 `subtotal >= free_threshold`(`:55-56`) | 시그니처에 `userGrade` 추가 → 등급별 `free_threshold`/`base_fee` 오버라이드. **서버 계산 원칙 유지**(폼 입력 금지) |
| 등급 진입/정기 쿠폰(§7.1) | `services/coupon/couponIssueService.js` `issueCoupon()`(선착순 조건부 UPDATE), 가입 자동발급 `services/auth/profileService.js:185` `issueSignupCoupons()`(`issue_method='AUTO_SIGNUP'`) | 가입 자동발급 패턴을 **등급 진입 트리거**로 복제. 쿠폰 대상은 현재 `scope_json`(상품/카테고리 범위)뿐 — 등급 타깃팅 컬럼/조건은 신설 필요 |
| 등급 할인(정률/정액)(§7.1) | 체크아웃 금액 계산부. 쿠폰·적립금·특가와 겹침 | §7.3 할인 계산 순서를 이 계산부에 반영. 특가는 이미 "특가가 기준, 쿠폰 추가"(sales_promotions) — 등급 할인의 stack 위치를 명시 |
| 주문 스냅샷(§2.2 · §10.4) | `order_membership_benefit_snapshot`(§11.1 신규) | 결제 확정 트랜잭션에서 등급·정책버전·계산결과 기록 |

### A.5 관리자 배선 (§3 · §12 접지)

- 서브라우트 등록 패턴: `router.use('/membership', requireMenuAccess('/admin/membership'), require('./admin/membership'));` (`routes/admin.js` 의 points·coupons 등록과 동일). 상위에 `adminAuth` → `adminMallContext`(→ `req.adminMallId` 주입)가 이미 적용된다.
- 사이드바·RBAC: `admin_menus` 테이블에 행을 추가한다(`name`, `path=/admin/membership...`, `icon_class`, `display_order`, `parent_id`(회원관리 그룹), `is_active=1`, `visible_roles`(예 `super_admin,admin`)). 접근 통제는 `middleware/adminRoleGuard.js` `requireMenuAccess(path)` 가 `visible_roles` CSV 로 판정. **경로를 바꾸면 매칭이 깨지므로** §12 API 경로를 admin_menus.path 와 일치시킨다.
- 컨트롤러 액션 네이밍은 기존 규칙을 따른다: `getList`/`getEdit`/`postEdit`/`getDetail` + 도메인 동사형(`postSimulate`, `postActivate`, `changeGrade`). 뷰는 `res.render('admin/membership/<view>', { layout:'layouts/admin_layout' })`.
- §3.1 권한표는 이 CSV RBAC 로 구현한다. `super_admin` 은 전 메뉴 통과(가드 특례).

### A.6 평가 배치 (§6.4 · §10.3 접지) — 기존 랭킹 배치 패턴 재사용

`services/best/` 랭킹 배치가 유일한 주기 배치이며, 등급 산정 배치는 이 구조를 그대로 복제한다.

- 크론 진입점: `scripts/best_ranking_cron.sh`(ENCRYPTION_KEY 로드 + nvm node + flock 중복방지 + 실패해도 `exit 0`) → `scripts/membership_evaluate_cron.sh` 로 복제.
- 실행 스크립트: `node scripts/calc_best_ranking.js --scheduled` → `scripts/calc_membership_grade.js`.
- **"언제 돌릴지"는 크론이 아니라 DB 테이블이 정한다**(`best_ranking_schedule`/`best_ranking_run`). 등급 평가도 §6.4 주기·§9 시뮬레이션·§11.1 `membership_evaluation_run` 을 관리자 화면에서 제어 — 랭킹의 `/admin/best-groups` 와 같은 형태.
- 산정 서비스는 `services/membership/` 하위 신규(현재 `membershipInfo.js` 상수만 존재).

### A.7 멀티몰 스코핑 결정 (§19-9 접지)

이 프로젝트는 몰 빌더(멀티몰)다. 현행 스코핑이 **테이블마다 다르다**:

- `users` 에 **`mall_id` 가 없다 → 회원은 몰 전역 공유**. `user_coupons`·`point_transactions` 도 `user_id` 로만 연결(몰 비분리).
- `orders.mall_id`·`coupons.mall_id` 는 **있다**(주문·쿠폰은 몰 분리, 단 과거 `orders.mall_id` NULL 가능).
- 관리자 편집 몰은 `req.adminMallId`(손님 몰 `req.mallId` 와 별개).

→ **권장**: 회원은 전역이되 등급은 **몰별로 분리**한다. `customer_membership`·`membership_grade` 를 `(customer_id, mall_id)` 복합 스코프로 두고(§11.1 이미 `mall_id` 포함), 실적 집계는 `orders.mall_id` 로 몰별 그룹핑한다. 통합 멤버십을 원하면 `mall_id` 를 NULL/공용으로 운용. 이 결정을 착수 전에 확정한다.

### A.8 스키마·구현 유의

- 스키마 변경은 **개발 DB 기준**으로만 진행(상용 없음). `alter-table` 스킬로 `tables.sql`(schema) 동기화 — 신규 테이블이 드리프트로 누락되지 않게 한다.
- 일회성 검증 스크립트는 `ENCRYPTION_KEY` source + `scripts/_bootstrap` 선행(멤버십은 Shopify 무관이나 DB 접속을 위해 필요).
- 등급별 적립률을 `system_settings` 단일 키(`point_accumulate_rate`)와 어떻게 공존시킬지 정한다: 단일 폴백은 유지하되 등급률이 있으면 등급률이 이긴다.

### A.9 다른 계획서에서 이관된 항목 (원본에서는 제거하고 이 문서로 포인터)

| 원본 파일 | 이관 전 내용 | 이관 위치 |
|---|---|---|
| `gnb_menu_design.md` 잔여과제 #2 | "멤버십 등급 시스템 — `user_grade` 없음, `membershipInfo.js` 정적 상수, 구매액 집계 배치 + `users.grade_id` 필요" | 본 문서 전체 + A.1 |
| `gnb_menu_design.md` 함정 | "멤버십 등급을 미룬 이유 — 주문 데이터 부족(orders 21건)" | A.2 |
| `admin_dev_plan.md` 회원/프로모션 잔여과제 | "회원 등급 · 멤버십 혜택 관리 — 정적 하드코딩" | 본 문서 + A.1 |
| `commerce_backbone.md` 쿠폰 3차 #4 | "발급 조건 확장(등급·누적구매·생일) — `user_grade` 도입" | 등급·누적구매 축은 본 문서 §7.1 쿠폰 혜택 + A.4. 생일 축은 쿠폰 모듈 잔존 |

---

## 부록 B. 구현 현황 — 1차 MVP 완료 (2026-07)

> §17 의 **1차 MVP** 범위를 구현·검증 완료했다. 아래는 실제 산출물 지도와 운영 방법이다. 표준 설계(§4~§16)와 이 부록의 차이(단순화·연기)는 각 항목에 명시했다.

### B.1 구현된 것 (§17 1차 MVP)

- **등급 CRUD·순위·기본 등급** — `membership_grade` + 등급당 혜택 1행 `membership_grade_benefit`(§11 의 benefit_policy+link 를 MVP 로 단순화).
- **평가 정책 + 등급별 진입/유지 기준(히스테리시스)** — `membership_evaluation_policy` + `membership_grade_criterion`. 최근 N개월 인정 실적, 금액/건수 AND·OR·금액전용.
- **실적 원장** — `customer_performance_ledger`(구매확정 적립 / 취소 역분개, append-only). 인정금액 산식 A/B/C/D(§6.2), 기본 B_NET.
- **자동 평가** — 즉시 승급(결제 확정 시) + 정기 배치(승급·강등). `membership_evaluation_run` 에 실행 기록.
- **수동 등급 변경·고정** — 관리자 회원 등급 현황 화면. `membership_grade_history` 에 이력.
- **등급 혜택 적용** — 정률 할인(`orders.grade_discount`)·추가/대체 적립률·무료배송(상시/문턱 override). 결제 계산에 반영.
- **주문 스냅샷** — `order_membership_benefit_snapshot`(주문 시점 등급·유효 적립률·할인·무료배송, §2.2).
- **시뮬레이션** — 정책 화면에서 반영 없이 승급/강등 예정 인원·명단 미리보기.
- **마이페이지 등급 표시** — 현재 등급·인정 실적·다음 등급까지 남은 금액·혜택 배지.
- **공개 등급 안내** — `/membership`·`/event` 멤버십 섹션을 DB 등급으로 동적화(상수 폴백).

### B.2 산출물 지도

| 영역 | 파일 |
|---|---|
| DDL / 시드 | `scripts/migrate_membership.sql` · `scripts/seed_membership.sql` · `scripts/seed_membership_admin_menu.sql` (+ `tables.sql` 동기화, `orders.grade_discount` 컬럼) |
| 서비스 | `services/membership/` — `gradeService`(등급·혜택 CRUD) · `membershipService`(회원 등급 상태·이력) · `performanceService`(실적 원장) · `evaluationService`(평가 엔진·요약·공개 등급표) · `membershipBenefitService`(주문 혜택 계산) · `membershipInfo`(정적 폴백 상수) |
| 관리자 | `controllers/admin/membershipController.js` · `routes/admin/membership.js`(+`routes/admin.js` 등록) · `views/admin/membership/*`(dashboard·grades·grade_form·policy·customers·history) · `admin_menus` "멤버십 관리" 그룹 |
| 결제·취소 통합 | `controllers/checkoutController.js`(적립률·등급할인·무료배송·스냅샷·실적적립·즉시승급) · `services/shipping/shippingCalculator.js`(grade 인자) · `services/order/orderCancelService.js`(실적 역분개) · `views/user/checkout/form.ejs`(등급 할인 표시·포인트 상한) |
| 배치 | `scripts/calc_membership_grade.js` · `scripts/membership_evaluate_cron.sh`(best_ranking 패턴) |
| 스토어프론트 | `controllers/mypageController.js`(대시보드 등급 위젯) · `views/user/mypage/dashboard.ejs` · `routes/feature.js`(`/membership` 동적) · `controllers/eventController.js`(`/event` 멤버십 섹션) |

### B.3 운영 방법

- **관리자**: `/admin/membership` (멤버십 관리 그룹). 등급/혜택 편집 → 등급 관리, 기준·주기 → 평가 정책(시뮬레이션·지금 평가 실행 버튼), 회원별 조정 → 회원 등급 현황, 이력 → 변경·평가 이력.
- **정기 평가 크론**(선택): `scripts/membership_evaluate_cron.sh` 를 crontab 에 등록(예 `0 4 * * *`). 무엇을 돌릴지는 각 몰 정책 `evaluation_cycle` 이 판정. 미등록이어도 결제 시 **즉시 승급** + 관리자 "지금 평가 실행" 으로 동작한다.
- **초기 등급 기준**은 §18 예시값으로 시드됨(SILVER 30만/3건, GOLD 100만/8건, VIP 300만/15건, 유지 기준 별도). 실데이터 분포로 재조정 시 정책 화면에서 수정 후 시뮬레이션.

### B.4 표준 설계 대비 단순화·연기 (2차 이후)

- **혜택 모델**: benefit_policy 재사용/채널·결제수단 제한·중복 그룹(§7.2/7.3)은 미도입 — 등급당 혜택 1행(정률할인·적립·무료배송)로 단순화. 등급 할인은 쿠폰과 같은 주문 할인 층으로 총액에서 차감(중복 허용).
- **쿠폰 혜택**(등급 진입/정기 쿠폰팩·생일)·**상품/브랜드별 혜택**·**세그먼트**·**비용/효율 분석**·**강등 사전 알림**·**계정 통합/재가입 복원**: 2차(§17).
- **실적 확정 시점**: 배송완료/구매확정이 아니라 **결제확정(PAID)** 에 적립(부록 A.3). 취소·환불은 상태 전이 + 원장 역분개로 정합. 부분 반품 비율 차감은 반품 모듈 도입 시.
- **멀티몰**: 등급은 `(user_id, mall_id)` 분리, 회원은 전역(부록 A.7). 회원의 몰별 등급 행은 주문/평가 시 지연 생성.

### B.5 2차 추가 구현 (2026-07)

MVP 이후 아래 2차 항목을 추가 구현했다.

- **등급 진입 쿠폰(쿠폰팩)** — `membership_grade_coupon`(등급↔쿠폰 연결) 신설. 승급·수동 상향으로 등급에 **진입**할 때 연결 쿠폰을 자동 발급한다(기존 `couponIssueService.issueCoupon` 재사용, `issued_by='EVENT'`, `skipIfHeld` 로 재평가 중복 방지). 관리자 등급 편집 폼에서 "등급 진입 시 지급 쿠폰"으로 연결. 산출물: `services/membership/gradeCouponService.js` · `membershipService.setGrade` 훅 · `views/admin/membership/grade_form.ejs`. (강등·가입에는 미발급. 정기 쿠폰팩·생일은 여전히 2차 잔여.)
- **멤버십 대시보드 분석** — 등급별 최근 30일 매출·주문수·객단가·**등급 할인 비용**·**적립 예정액**(주문 스냅샷 집계, §4.1). 산출물: `membershipController.getDashboard` + `views/admin/membership/dashboard.ejs`.

남은 2차: 정기(월) 쿠폰팩·생일 혜택, 상품/브랜드별 등급 혜택, 고객 세그먼트, 강등 사전 알림, 설정형 할인 우선순위.
