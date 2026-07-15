# 멤버십 등급 관리 (개발자 문서)

회원을 구매 실적으로 등급화하고, 등급별 혜택(정률 할인·추가 적립·무료배송)을 결제에 자동 적용하는 모듈. 설계 원문은 [`docs/사이트개선/membership_grade_admin_design.md`](../../사이트개선/membership_grade_admin_design.md) (특히 **부록 A** 연동 지점 · **부록 B** 구현 현황).

> 착수 배경: `users` 에 등급 컬럼이 없고 등급을 정적 상수(`membershipInfo.js`)로만 안내하던 것을, 1차 MVP 로 실제 등급 시스템으로 구현(2026-07).

---

## 마운트 · 접근 제어

- 마운트: `routes/admin.js` → `router.use('/membership', requireMenuAccess('/admin/membership'), require('./admin/membership'))`
- 상위 체인 공통: `adminAuth` → `adminMallContext`(→ `req.adminMallId`). 모든 조회·변경은 **편집 몰(`req.adminMallId`) 스코프**.
- RBAC: `admin_menus` "멤버십 관리" 그룹 + 리프 5개. 대시보드/등급/회원현황/이력 = `super_admin,admin,customer_admin`, 평가 정책 = `super_admin,admin`.

## 라우트 (`routes/admin/membership.js`)

| 메서드 · 경로 | 컨트롤러 | 설명 |
|---|---|---|
| GET `/admin/membership` | getDashboard | 등급 분포·평가 현황 요약 |
| GET `/admin/membership/grades` | getGrades | 등급 목록(+혜택 요약) |
| GET `/admin/membership/grades/new` · `/:id/edit` | getGradeForm | 등급 등록/수정 폼 |
| POST `/admin/membership/grades` · `/:id` | postGradeSave | 등급 + 혜택 저장(트랜잭션) |
| POST `/admin/membership/grades/:id/delete` | postGradeDelete | 삭제(소속 회원·이력 있으면 차단) |
| GET `/admin/membership/policy` | getPolicy | 평가 정책 + 등급별 기준 |
| POST `/admin/membership/policy` | postPolicySave | 정책 + 기준 upsert |
| POST `/admin/membership/policy/simulate` | postSimulate | 반영 없이 승급/강등 예정 미리보기 |
| POST `/admin/membership/policy/evaluate` | postEvaluate | 즉시 전체 평가·반영 |
| GET `/admin/membership/customers` | getCustomers | 회원 등급 현황(검색·페이지네이션) |
| POST `/admin/membership/customers/change-grade` | postChangeGrade | 수동 등급 변경(이력 기록) |
| POST `/admin/membership/customers/lock` | postLock | 등급 고정/해제(자동 평가 제외) |
| GET `/admin/membership/history` | getHistory | 변경 이력 + 평가 실행 이력 |

## 서비스 계층 (`services/membership/`)

| 파일 | 책임 |
|---|---|
| `gradeService.js` | 등급 CRUD + 등급당 혜택 1행(`membership_grade_benefit`) upsert. 기본 등급 해석, 삭제 가드 |
| `membershipService.js` | 회원 등급 상태(`customer_membership`) — `ensureMembership`(지연 생성), `setGrade`(이력 기록), `setLock` |
| `performanceService.js` | 실적 원장 — `appendConfirmed`(구매확정 적립, 멱등) · `reverseForOrder`(취소 역분개, 멱등) · `aggregate`(최근 N개월 상계 집계) · `recognizedAmountOf`(A/B/C/D 산식) |
| `evaluationService.js` | 평가 엔진 — 히스테리시스(진입/유지) 판정, `evaluateCustomer`(즉시 승급), `evaluateMall`(정기 배치·시뮬레이션), `getCustomerSummary`(마이페이지), `getPublicTiers`(공개 등급표) |
| `membershipBenefitService.js` | 주문 등급 혜택 계산 — `getOrderBenefits`(할인액·적립률·무료배송) · `effectivePointRate` |
| `gradeCouponService.js` | **등급 진입 쿠폰(쿠폰팩, 2차)** — 등급↔쿠폰 연결(`membership_grade_coupon`) + `issueEntryCoupons`(승급 시 자동 발급, `couponIssueService` 재사용) |
| `membershipInfo.js` | 정적 폴백 상수(활성 등급 없을 때만) |

### 평가 로직 (히스테리시스)

`evaluationService.computeDecision` — 인정 실적(`aggregate`) vs 정책 기준(`membership_grade_criterion`):
- **진입 기준** 충족 최상위 등급이 현재보다 위 → **승급**
- 아니고 현재 등급 **유지 기준** 충족 → **유지**
- 둘 다 아니면 유지 기준 충족 최상위로 **강등**
- `immediateOnly`(결제 시): 승급만 반영. 강등은 정기 배치(`downgrade_mode`)가 판정.

## 결제 · 취소 통합

- **결제 확정**(`checkoutController.completeOrderWithStockAndPaid`): 적립률은 주문 스냅샷(`order_membership_benefit_snapshot.grade_point_rate`, 주문 시점 유효 적립률)로 계산. 커밋 후 `appendConfirmed` + `evaluateCustomer(immediateOnly)` 로 실적 적립 + 즉시 승급(best-effort).
- **주문 생성**(`checkoutController.postForm`): `membershipBenefitService.getOrderBenefits` → `grade_discount`(정률 할인, `orders.grade_discount` 컬럼) 총액 반영, 무료배송 override 는 `calcShippingFee({..., grade})` 로. 스냅샷 INSERT.
- **총액 공식**: `subtotal − coupon − grade − point + shipping_fee − shipping_discount`. 등급 할인은 쿠폰과 같은 주문 할인 층(중복 허용).
- **배송비**(`services/shipping/shippingCalculator.js`): `grade.freeShipping`(상시)·`grade.freeShipThreshold`(문턱 override). 지역 할증은 등급 무료배송이어도 청구.
- **취소·환불**(`services/order/orderCancelService.js`): `reverseForOrder` 로 실적 역분개(멱등). 강등은 하지 않음(정기 평가가 판정).

## 배치

- `scripts/calc_membership_grade.js` — `--scheduled`(정책 `evaluation_cycle` 주기 도래 몰만) · `--mall <id>` · `--force`. `_bootstrap` 선행, 종료코드 `failed?1:0`, `membership_evaluation_run` 기록.
- `scripts/membership_evaluate_cron.sh` — 크론 진입점(ENCRYPTION_KEY·nvm·flock·exit 0). crontab 예: `0 4 * * * /data/yd-mall/scripts/membership_evaluate_cron.sh`. 미등록이어도 즉시 승급 + 관리자 "지금 평가 실행"으로 동작.

## 스토어프론트

- 마이페이지 대시보드 등급 위젯: `mypageController.getDashboard` → `evaluationService.getCustomerSummary(userId, req.mallId)`.
- `/membership`(`routes/feature.js`) · `/event` 멤버십 섹션(`eventController.getList`): `evaluationService.getPublicTiers(mallId)` (DB 등급 → tier, 상수 폴백).

## 데이터 모델

정본 DDL: `scripts/migrate_membership.sql` (`tables.sql` 동기화). 9테이블 + `orders.grade_discount`.

`membership_grade`(등급, 몰별) · `membership_grade_benefit`(등급당 혜택 1행) · `membership_evaluation_policy`(평가 정책·버전) · `membership_grade_criterion`(등급별 진입/유지 기준) · `customer_membership`(회원×몰 등급 상태) · `customer_performance_ledger`(실적 원장, append-only) · `membership_grade_history`(변경 이력) · `membership_evaluation_run`(평가 실행 이력) · `order_membership_benefit_snapshot`(주문 등급혜택 스냅샷).

시드: `scripts/seed_membership.sql`(4등급·혜택·정책·기준 + 기존 회원 BASIC 배정 + PAID 주문 실적 백필) · `scripts/seed_membership_admin_menu.sql`(관리자 메뉴).

## 멀티몰

회원(`users`)은 몰 전역(몰 컬럼 없음)이지만 등급은 `(user_id, mall_id)` 로 분리. 몰별 등급 행은 주문·평가·조회 시 `ensureMembership` 으로 지연 생성.

## 2차 추가 구현 (2026-07)

- **쿠폰 혜택 3종(쿠폰팩)**: `membership_grade_coupon`(`issue_on` = ENTRY/BIRTHDAY/PERIODIC), 발급 모두 `gradeCouponService` + `couponIssueService.issueCoupon(issuedBy='EVENT')`.
  - ENTRY: `membershipService.setGrade`(UPGRADE·MANUAL) → `issueEntryCoupons`(`skipIfHeld`).
  - BIRTHDAY: `scripts/calc_membership_birthday.js`(일일 cron `membership_birthday_cron.sh`) → `issueBirthdayCoupons`, 연 1회 가드 `membership_birthday_issue_log`.
  - PERIODIC: `scripts/calc_membership_periodic.js`(월 cron `membership_periodic_cron.sh`) → `issuePeriodicCoupons`, 월 1회 가드 `membership_periodic_issue_log`.
- **혜택별 사용여부 토글**: `membership_grade_benefit.{discount_enabled,point_enabled,shipping_enabled}`. `membershipBenefitService.getOrderBenefits` 가 enabled 인 혜택만 반영(미사용이면 할인 0 / 적립률 null / 무료배송 off). 등급 편집 폼 체크박스.
- **대시보드 분석**: `membershipController.getDashboard` 가 `order_membership_benefit_snapshot` 집계 → 등급별 최근 30일 매출·객단가·할인 비용·적립 예정액.
- **강등 사전 알림**: `evaluationService.getDowngradeCandidates(mallId)`(computeDecision 재사용, DOWNGRADE 필터, is_locked 제외) → `/admin/membership/downgrade` 뷰 + `scripts/calc_membership_demotion_notice.js`(월 배치, `emailService.sendEmail`, `membership_demotion_notice_log` 월1회 가드)+크론.
- **설정형 할인 우선순위**: `membership_config.discount_stacking_mode`(STACK/COUPON_PRIORITY). `membershipConfigService`. 체크아웃 `postForm` 이 COUPON_PRIORITY+주문쿠폰 시 `gradeDiscount=0`(폼 JS `effectiveGradeDiscount()` 도 동일). 관리자 평가정책 화면에서 설정.

## 알려진 한계 (남은 2차)

- 혜택: 등급당 1행(정률할인·적립·무료배송)으로 단순화 — 채널/결제수단 제한·중복 그룹·benefit_policy 재사용 미도입.
- 상품/브랜드별 등급 혜택·고객 세그먼트 미구현.
- 실적 확정 시점 = 결제확정(PAID). 부분 반품 비율 차감은 반품 모듈 도입 시.
- 생일 쿠폰: 2/29 생일은 평년에 미발급(흔한 한계).

---

*Last Updated: 2026-07-15*
