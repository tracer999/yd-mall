# 마이페이지

고객이 **자기 주문·쿠폰·포인트·찜한 상품**을 확인하고, **회원 정보를 고치거나 취소·반품을 신청**하는 화면입니다. 주소는 `/mypage` 이며 **로그인해야** 들어갈 수 있습니다.

PC에서는 화면 위 오른쪽의 **마이쇼핑**, 모바일에서는 아래 고정 바의 **마이** 로 들어갑니다.

마이페이지는 고객이 직접 무언가를 만드는 화면이 아니라, **관리자에서 만들어 둔 데이터를 고객별로 비춰 주는 거울**에 가깝습니다. 주문·쿠폰·포인트·등급이 관리자에 없으면 마이페이지도 비어 있습니다.

---

## 이 화면에 무엇이 보이나

첫 화면에 최근 주문 5건, 주문 상태별 건수, 보유 쿠폰 수 · 포인트 잔액 · 찜한 상품 수 · 최근 본 상품 수가 요약됩니다. 왼쪽 메뉴는 다음과 같습니다.

| 메뉴 | 주소 | 내용 |
|---|---|---|
| 장바구니 | `/cart` | |
| 주문내역 | `/mypage/orders` | 주문 목록 · 주문 상세 · 취소/반품 신청 |
| 취소/반품 내역 | `/mypage/claims` | 진행 상황 확인 · 신청 철회 |
| 쿠폰함 | `/mypage/coupons` | 사용가능 / 주문진행중 / 사용완료 / 기간만료 |
| 포인트 | `/mypage/points` | 잔액 + 적립·사용 내역 |
| 1:1 문의 | `/mypage/activities` | 내 문의와 답변 상태 |
| 회원정보 수정 | `/mypage/profile` | |

이 밖에 찜한 상품(`/mypage/likes`), 찜한 브랜드(`/mypage/brand-likes`), 최근 본 상품(`/mypage/recent-views`, 최근 15일), 회원 탈퇴(`/mypage/withdraw`) 화면이 있습니다.

---

## 이 화면은 관리자에서 이렇게 만들어집니다

| 고객 화면의 이 부분 | 관리자 어느 기능으로 만드나 | 비고 |
|---|---|---|
| 주문내역 · 주문 상세 | 판매(주문) 관리 | 관리자가 주문 상태를 바꾸면 고객 화면에도 그대로 반영됩니다 |
| 주문 상태 뱃지 (결제완료 · 배송중 등) | 판매(주문) 관리의 상태 변경 | |
| **배송 조회** 버튼 | 배송 관리에서 **송장번호를 등록**했을 때만 나타납니다 | 송장이 없으면 버튼 자체가 없습니다 |
| 취소 · 반품 신청 결과 | 클레임 관리 | 담당자 승인이 필요한 건이 여기로 들어옵니다 |
| 환불 금액 · 반품 배송비 차감 | 클레임 관리 + 배송비 정책 | |
| 쿠폰함에 들어 있는 쿠폰 | 쿠폰 관리 (발급) | 발급하지 않으면 쿠폰함은 비어 있습니다 |
| 포인트 잔액과 내역 | 포인트 관리 · 사이트 설정의 적립률 | 주문 결제 시 자동 적립·차감됩니다 |
| 회원 등급 요약 (다음 등급까지 남은 실적) | 멤버십 관리 | 등급을 만들지 않으면 표시되지 않습니다 |
| 1:1 문의의 **답변완료** 표시 | 문의 관리에서 답변을 등록했을 때 | |
| 회원 정보 자체 · 강제 탈퇴 | 회원 관리 | |
| 본인 확인(카카오) 동작 | 사이트 설정의 **카카오 로그인 키** | 키가 없으면 휴대폰·주소 변경과 탈퇴가 막힙니다 |

<div class="manual-goto-bar">
  <span class="manual-goto-label">관리자에서 편집하기</span>
  <a class="manual-goto" href="/admin/sales" target="_blank">판매(주문) 관리</a>
  <a class="manual-goto" href="/admin/claims" target="_blank">클레임 관리</a>
  <a class="manual-goto" href="/admin/users" target="_blank">회원 관리</a>
  <a class="manual-goto is-sub" href="/admin/coupons" target="_blank">쿠폰 관리</a>
  <a class="manual-goto is-sub" href="/admin/points" target="_blank">포인트 관리</a>
  <a class="manual-goto is-sub" href="/admin/membership" target="_blank">멤버십 관리</a>
  <a class="manual-goto is-sub" href="/admin/shipping" target="_blank">배송 관리 (송장 등록)</a>
</div>

### 취소·반품이 처리되는 규칙

고객이 주문 상세에서 신청하면, **주문 상태에 따라 자동으로 취소 또는 반품으로 갈립니다.**

| 주문 상태 | 신청 결과 | 관리자 개입 |
|---|---|---|
| 결제 전 · 결제 완료 | **취소** | **자동 승인** — 바로 환불이 시작됩니다 |
| 상품 준비중 | **취소** | 클레임 관리에서 **승인 대기** |
| 배송중 · 배송완료 | **반품** | 클레임 관리에서 **승인 대기** |

- 반품은 **수령 후 7일 이내**만 신청할 수 있습니다.
- 사유는 **단순변심 / 상품불량 / 오배송 / 기타** 중에서 고릅니다.
- 승인 전(처리 중) 상태면 고객이 스스로 **철회**할 수 있습니다.
- **교환은 아직 지원하지 않습니다.**

> **자동 승인된 취소는 관리자가 되돌릴 수 없습니다.** 결제 완료 직후 취소는 승인 대기 없이 즉시 환불로 이어집니다.

---

## 안 보이거나 비어 있을 때

**"쿠폰함이 비어 있습니다"**
쿠폰 관리에서 그 회원에게 쿠폰이 **발급**되지 않았습니다. 쿠폰을 만들기만 하고 발급하지 않으면 고객 쿠폰함에는 아무것도 없습니다.

**"쿠폰이 '주문진행중'으로 묶여 있습니다"**
다른 주문서에서 그 쿠폰을 선택한 채 결제를 끝내지 않은 상태입니다. **30분이 지나면 자동으로 풀립니다.**

**"포인트가 안 쌓입니다"**
사이트 설정의 **구매 적립률**이 0이면 적립이 없습니다. 값이 비어 있을 때만 기본값이 쓰이고, **0을 저장하면 "적립 없음"으로 동작**합니다.

**"등급·멤버십 정보가 안 나옵니다"**
멤버십 관리에서 등급이 설정되지 않았습니다.

**"배송 조회 버튼이 없습니다"**
배송 관리에서 해당 주문에 **송장번호를 등록**하지 않았습니다.

**"휴대폰 번호나 주소를 못 고칩니다 / 탈퇴가 안 됩니다"**
이 항목들은 **카카오 본인 확인**을 거쳐야 합니다. 사이트 설정에 카카오 로그인 키와 콜백 URL이 들어 있어야 동작합니다. 확인 후 **15분이 지나면 다시 인증**해야 합니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">확인하러 가기</span>
  <a class="manual-goto is-sub" href="/admin/coupons" target="_blank">쿠폰 발급 확인</a>
  <a class="manual-goto is-sub" href="/admin/settings" target="_blank">적립률 · 카카오 키 확인</a>
  <a class="manual-goto is-sub" href="/admin/shipping" target="_blank">송장 등록 확인</a>
</div>

---

## 관련 매뉴얼

<div class="manual-goto-bar">
  <span class="manual-goto-label">함께 보면 좋은 문서</span>
  <a class="manual-goto is-sub" href="/manual/user/checkout">주문 · 결제</a>
  <a class="manual-goto is-sub" href="/manual/user/auth">로그인 · 회원가입</a>
  <a class="manual-goto is-sub" href="/manual/admin/sales">판매(주문) 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/claims">클레임 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/coupons">쿠폰 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/membership">멤버십 관리</a>
</div>
