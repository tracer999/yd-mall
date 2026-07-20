# GA4 이벤트 안내 (고객 화면)

고객이 쇼핑하는 동안 **Google Analytics 4(GA4)로 자동 전송되는 행동 데이터**에 대한 안내입니다. 고객이 조작할 것은 아무것도 없고, 화면에 보이는 것도 없습니다.

추적은 **관리자에 GA4 측정 ID가 입력돼 있을 때만** 동작합니다. 측정 ID가 비어 있으면 추적 스크립트 자체가 페이지에 들어가지 않습니다.

추적 스크립트는 **고객 화면(스토어프론트)에만** 삽입됩니다. 관리자 화면은 GA4로 추적되지 않습니다.

---

## 실제로 전송되는 이벤트 — 4가지

| 이벤트 | 언제 발생하나 | 함께 보내는 값 |
|---|---|---|
| `view_item` | 고객이 **상품 상세 화면**을 열었을 때 | 상품 정보 1건, 판매 단가 |
| `add_to_cart` | 상품 상세에서 **장바구니 담기**를 눌렀을 때 | 상품 정보 + 선택한 수량 |
| `begin_checkout` | 상품 상세에서 **구매하기**로 주문서로 넘어갈 때 | 상품 정보 + 수량 + 금액 |
| `purchase` | **주문 완료 화면**에 도달했을 때 | 주문번호, 총 결제금액, 구매 품목 전체 |

각 이벤트가 함께 보내는 상품 정보는 **상품 ID(주소용 이름 우선) · 상품명 · 브랜드(공급사) · 카테고리명 · 단가 · 수량 · 통화(KRW)** 입니다.

> **위 4가지가 전부입니다.** 상품 목록 조회, 검색, 로그인, 회원가입, 장바구니 화면 열람, 찜하기는 **GA4로 전송되지 않습니다.** GA4 보고서에서 이 항목들이 비어 있는 것은 정상입니다.

---

## 이 기능은 관리자에서 이렇게 만들어집니다

| 고객 화면의 이 부분 | 관리자 어느 기능으로 만드나 | 비고 |
|---|---|---|
| GA4 추적이 켜지는 것 | **사이트 설정 → 분석 & 추적 설정**의 `Google Analytics 4 측정 ID` | `G-` 로 시작하는 값. 비우면 추적이 완전히 꺼집니다 |
| 추적되는 몰 | 사이트 설정은 **몰마다 따로** 저장됨 | 몰별로 다른 측정 ID를 쓸 수 있습니다 |
| 이벤트에 실리는 상품명·브랜드·카테고리 | 상품 관리 (상품명 · 공급사 · 카테고리) | 관리자에 입력한 값이 그대로 GA4로 갑니다 |
| 이벤트에 실리는 상품 ID | 상품 관리의 **주소용 이름(slug)** | slug 가 없으면 상품 번호가 대신 쓰입니다 |
| `purchase` 의 금액 | 판매(주문) 관리에 기록된 실제 결제금액 | |

<div class="manual-goto-bar">
  <span class="manual-goto-label">관리자에서 편집하기</span>
  <a class="manual-goto" href="/admin/settings" target="_blank">사이트 설정 (GA4 측정 ID)</a>
  <a class="manual-goto is-sub" href="/admin/products" target="_blank">상품 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/ga4">GA4 설정 매뉴얼</a>
  <a class="manual-goto is-sub" href="/manual/admin/settings">사이트 설정 매뉴얼</a>
</div>

> **상품의 주소용 이름(slug)을 바꾸면 GA4의 상품 ID도 바뀝니다.** 이전 데이터와 이어지지 않아 리포트가 둘로 쪼개지니, 운영 중인 상품의 slug 는 되도록 바꾸지 마세요.

---

## 안 보이거나 비어 있을 때

**"GA4에 데이터가 하나도 안 들어옵니다"**
사이트 설정의 **GA4 측정 ID**가 비어 있습니다. `G-` 로 시작하는 값을 넣고 저장하세요.

**"어떤 몰만 데이터가 안 들어옵니다"**
사이트 설정은 몰마다 따로 저장됩니다. 그 몰의 설정에도 측정 ID를 넣어야 합니다.

**"장바구니 화면이나 검색 데이터가 안 보입니다"**
현재 그 이벤트들은 전송하지 않습니다. 위 4가지 외에는 수집되지 않습니다.

**"일부 고객의 데이터만 빠집니다"**
고객 브라우저의 **광고 차단 확장 프로그램**이 GA4 전송을 막습니다. 이는 정상적인 현상이며 관리자에서 해결할 수 없습니다.

**"관리자 화면 사용 기록이 GA4에 없습니다"**
정상입니다. 추적 스크립트는 고객 화면에만 들어갑니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">확인하러 가기</span>
  <a class="manual-goto is-sub" href="/admin/settings" target="_blank">측정 ID 입력 여부 확인</a>
</div>

---

## 관련 매뉴얼

<div class="manual-goto-bar">
  <span class="manual-goto-label">함께 보면 좋은 문서</span>
  <a class="manual-goto is-sub" href="/manual/admin/ga4">GA4 설정 / 추적 (관리자)</a>
  <a class="manual-goto is-sub" href="/manual/admin/settings">사이트 설정</a>
  <a class="manual-goto is-sub" href="/manual/admin/visitors">방문자 통계</a>
  <a class="manual-goto is-sub" href="/manual/user/checkout">주문 · 결제</a>
</div>
