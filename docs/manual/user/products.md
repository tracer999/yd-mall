# 상품 목록 / 상품 상세

고객이 **상품을 고르고 자세히 보는** 화면입니다. 쇼핑몰에서 가장 많이 열리는 두 화면이며, 결제가 시작되는 지점도 여기입니다.

**상품 목록**은 카테고리·브랜드·검색·기획전 등 어디서 들어와도 같은 화면을 씁니다. 정렬 탭과 필터가 붙어 있고, 상품 카드가 격자로 나열됩니다.

**상품 상세**는 `/products/{주소이름}` 으로 열립니다. 이미지·가격·옵션·설명·리뷰·추천 상품이 한 화면에 들어갑니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">바로 이동</span>
  <a class="manual-goto" href="/products" target="_blank">상품 목록 열기</a>
  <a class="manual-goto" href="/admin/products" target="_blank">상품 관리</a>
  <a class="manual-goto is-sub" href="/admin/deals" target="_blank">쇼핑특가 관리</a>
</div>

---

## 이 화면에 무엇이 보이나

**상품 목록**

- 정렬 탭 — 인기상품 · 낮은가격 · 높은가격 · 판매량 · 최근등록 · 상품평
- 상품 카드 — 이미지, 이름, 브랜드, 가격(할인 시 정가에 취소선), 뱃지

**상품 상세**

- 대표 이미지 + 추가 이미지
- 상품명 · 브랜드 · 가격 · 할인율
- 옵션 선택 (옵션 상품인 경우)
- 수량 선택, 장바구니 담기 / 바로 구매, 찜
- 상세 설명, 상품평, 함께 보면 좋은 상품
- 카카오톡 문의 버튼 (설정한 경우)

---

## 이 화면은 관리자에서 이렇게 만들어집니다

| 고객 화면의 이 부분 | 관리자 어느 기능으로 만드나 | 비고 |
|---|---|---|
| 상품명 · 이미지 · 상세 설명 | 상품 관리 | |
| 판매가 · 정가 · 할인율 | 상품 관리 | 정가를 넣어야 취소선이 생깁니다 |
| **실제로 결제되는 할인가** | 쇼핑특가 관리 | 상품 가격보다 우선합니다 |
| 재고 · 품절 표시 | 상품 관리 | |
| 옵션 선택 상자 | 상품 관리 (옵션 상품) | |
| 상품 카드의 뱃지 (NEW 등) | 상품 관리 | |
| 상품이 속한 카테고리 · 브랜드 | 상품 관리 (카테고리·브랜드 지정) | 분류 자체는 카테고리 관리에서 |
| 주소(`/products/xxx`)에 들어가는 이름 | 상품 관리 (주소용 이름) | **바꾸면 기존 링크가 깨집니다** |
| 회원에게만 보이기 / 숨기기 | 상품 관리 (노출 설정) | 숨김 상품은 주소로 들어와도 안 열림 |
| 함께 보면 좋은 상품 | 상품 관리 (추천 상품 등록) | 수동 등록분만 나옵니다 |
| 세트·기획 상품 | 세트·기획상품 관리 | |
| 상품평 | **관리 대상 아님** — 고객이 작성 | |
| 카카오톡 문의 버튼 | 사이트 설정 (카카오 채널) | |

<div class="manual-goto-bar">
  <span class="manual-goto-label">상품 편집하기</span>
  <a class="manual-goto" href="/admin/products" target="_blank">상품 관리</a>
  <a class="manual-goto is-sub" href="/admin/deals" target="_blank">쇼핑특가 관리 (할인가)</a>
  <a class="manual-goto is-sub" href="/admin/derived-products" target="_blank">세트·기획상품 관리</a>
  <a class="manual-goto is-sub" href="/admin/categories" target="_blank">카테고리 관리</a>
</div>

> **가격은 두 곳에서 정해집니다.** 상품 관리의 판매가가 기본이고, **쇼핑특가가 걸려 있으면 특가가 이깁니다.** 특가가는 화면 표시뿐 아니라 **실제 결제 금액**에도 반영됩니다. 기획전 배너에 적은 할인율과 고객이 보는 금액이 다르다면 대부분 이 때문입니다.

> **주소용 이름을 나중에 바꾸지 마세요.** 문자·카카오톡·SNS로 뿌린 상품 링크가 전부 깨집니다.

---

## 안 보이거나 비어 있을 때

**Q. 등록한 상품이 목록에 없습니다.**
① 판매 상태가 **판매중**인가, ② 노출 설정이 **전체 공개**인가(회원 전용이면 비로그인 고객에게 안 보입니다), ③ **편집 중인 몰**이 맞는가를 확인하세요.

**Q. 상품 상세가 404 로 뜹니다.**
노출 설정이 **숨김**이면 주소로 직접 들어와도 열리지 않습니다.

**Q. 할인 전 가격(취소선)이 안 보입니다.**
상품 관리에서 **정가**를 입력하지 않았습니다. 판매가만 있으면 취소선이 생기지 않습니다.

**Q. 배너에 적은 가격과 실제 결제 금액이 다릅니다.**
그 상품에 쇼핑특가가 걸려 있습니다. 특가 관리에서 진행 중인 특가를 확인하세요.

**Q. 함께 보면 좋은 상품이 비어 있습니다.**
수동으로 등록한 추천 상품만 노출됩니다. 자동 추천은 하지 않습니다.

**Q. 옵션 선택 상자가 안 나옵니다.**
그 상품이 옵션 상품으로 등록되어 있지 않습니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">확인하러 가기</span>
  <a class="manual-goto" href="/admin/products" target="_blank">상품 상태·노출 확인</a>
  <a class="manual-goto is-sub" href="/admin/deals" target="_blank">진행 중인 특가 확인</a>
</div>

---

## 관련 매뉴얼

<div class="manual-goto-bar">
  <span class="manual-goto-label">함께 보면 좋은 문서</span>
  <a class="manual-goto is-sub" href="/manual/admin/products">관리자 · 상품 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/deals">관리자 · 쇼핑특가 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/derived-products">관리자 · 세트·기획상품</a>
  <a class="manual-goto is-sub" href="/manual/user/categories">고객 · 카테고리 메뉴</a>
  <a class="manual-goto is-sub" href="/manual/user/cart">고객 · 장바구니</a>
</div>
