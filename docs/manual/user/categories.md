# 카테고리 메뉴

상품을 **분류를 따라가며 찾는** 메뉴입니다. 고객은 상단 메뉴줄에서 카테고리를 눌러 상품 목록으로 들어갑니다.

카테고리는 화면에 두 가지 방식 중 하나로 나타납니다. **맨 왼쪽의 [카테고리] 버튼 하나에 드롭다운 패널이 매달린 형태**, 또는 **1뎁스 카테고리가 각각 메뉴줄에 직접 올라온 형태**입니다. 어느 쪽인지는 Header 설정이 정합니다.

모바일에서는 하단바의 **카테고리** 탭을 누르면 화면 전체를 덮는 레이어가 열리고, 1뎁스 → 2뎁스 → 3뎁스로 단계별로 파고듭니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">바로 이동</span>
  <a class="manual-goto" href="/products" target="_blank">상품 목록 열기</a>
  <a class="manual-goto" href="/admin/categories" target="_blank">카테고리 관리</a>
  <a class="manual-goto is-sub" href="/admin/header-settings" target="_blank">Header 설정</a>
</div>

---

## 이 화면에 무엇이 보이나

- **카테고리 트리** — 최대 3단계까지 계층
- 카테고리를 고르면 열리는 **상품 목록** (`/products/category/{번호}`)
- 목록 상단의 **하위 카테고리 이동 패널**과 **브레드크럼**
- 카테고리마다 붙일 수 있는 **이미지와 간략 설명** (모바일 레이어 하단·PC 패널에 표시)
- 상품 목록의 **필터 패널** — 가격·브랜드·할인율 등. 자세한 동작은 [상품 목록 / 상품 상세](/manual/user/products) 의 *상품 목록 필터* 참고

---

## 이 화면은 관리자에서 이렇게 만들어집니다

| 고객 화면의 이 부분 | 관리자 어느 기능으로 만드나 | 비고 |
|---|---|---|
| 카테고리 이름 · 계층 · 순서 | 카테고리 관리 | 유형이 `NORMAL` 인 것만 카테고리 메뉴에 나옴 |
| 카테고리에 붙는 이미지 · 설명 | 카테고리 관리 | 드롭다운 패널·모바일 레이어에 표시 |
| 카테고리가 **몇 뎁스까지** 보일지 | Header 설정 (카테고리 최대 뎁스) | 기본 3단계 |
| 카테고리를 **드롭다운 버튼 하나로 묶을지, 메뉴줄에 펼칠지** | Header 설정 | 몰 전체에 적용 |
| [카테고리] 버튼 자체를 켜고 끄기 | 메뉴 관리 (카테고리 메뉴) | 끄면 카테고리가 통째로 GNB 에서 빠짐 |
| 특정 카테고리 하나만 메뉴에 따로 올리기 | 커스텀 메뉴 (링크 유형 = 카테고리) | 하위 카테고리가 자동으로 하위 메뉴로 붙음 |
| 카테고리에 어떤 상품이 담기는지 | 상품 관리 (상품별 카테고리 지정) | 카테고리 화면에서 상품을 담지 않음 |
| 이 몰에서 어떤 카테고리를 쓸지 | 카테고리 관리 (몰별 노출 설정) | 카테고리는 여러 몰이 공유하는 한 벌입니다 |

<div class="manual-goto-bar">
  <span class="manual-goto-label">카테고리 편집하기</span>
  <a class="manual-goto" href="/admin/categories" target="_blank">카테고리 관리</a>
  <a class="manual-goto is-sub" href="/admin/header-settings" target="_blank">Header 설정 (뎁스·배치)</a>
  <a class="manual-goto is-sub" href="/admin/products" target="_blank">상품 관리 (상품에 카테고리 지정)</a>
</div>

> **카테고리는 여러 몰이 공유합니다.** 상품 분류(NORMAL)는 몰마다 따로 만드는 것이 아니라 한 벌을 함께 쓰고, 몰별로 **보일지 말지만** 정합니다. 그래서 카테고리 이름을 바꾸면 그 카테고리를 쓰는 **모든 몰**에 반영됩니다.

> **부모 카테고리를 숨기면 자식도 함께 사라집니다.** 자식만 남겨 최상위로 올리는 동작은 하지 않습니다. 특정 하위 카테고리만 보이게 하려면 부모를 살려 두세요.

---

## 안 보이거나 비어 있을 때

**Q. 카테고리 버튼이 아예 없습니다.**
메뉴 관리에서 **카테고리 메뉴가 꺼져 있습니다.** 켜세요.

**Q. 만든 카테고리가 고객 화면에 없습니다.**
① 카테고리가 **활성** 상태인가, ② 이 몰에서 **노출**로 되어 있는가, ③ 유형이 `NORMAL` 인가(브랜드·테마 유형은 카테고리 메뉴에 나오지 않습니다), ④ **부모 카테고리가 숨겨져 있지 않은가** 를 확인하세요.

**Q. 3단계 카테고리를 만들었는데 2단계까지만 보입니다.**
Header 설정의 **카테고리 최대 뎁스**가 2로 되어 있습니다.

**Q. 카테고리를 눌렀는데 상품이 없습니다.**
그 카테고리에 지정된 상품이 없습니다. 상품 관리에서 상품마다 카테고리를 지정해야 합니다. 하위 카테고리에 담긴 상품은 상위 카테고리 목록에도 함께 나옵니다.

**Q. 카테고리를 삭제할 수 없습니다.**
하위 카테고리가 있으면 삭제가 막힙니다. 자식을 먼저 정리하세요.

<div class="manual-goto-bar">
  <span class="manual-goto-label">확인하러 가기</span>
  <a class="manual-goto" href="/admin/categories" target="_blank">카테고리 활성·노출 확인</a>
  <a class="manual-goto is-sub" href="/admin/menus" target="_blank">메뉴 관리에서 카테고리 켜기</a>
  <a class="manual-goto is-sub" href="/admin/menu-preview" target="_blank">메뉴 미리보기</a>
</div>

---

## 관련 매뉴얼

<div class="manual-goto-bar">
  <span class="manual-goto-label">함께 보면 좋은 문서</span>
  <a class="manual-goto is-sub" href="/manual/admin/categories">관리자 · 카테고리 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/header">관리자 · Header 설정</a>
  <a class="manual-goto is-sub" href="/manual/admin/menus">관리자 · 메뉴 관리</a>
  <a class="manual-goto is-sub" href="/manual/user/products">고객 · 상품 목록·상세</a>
</div>
