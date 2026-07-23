# 3. 몰 채우기

카테고리를 만들고 → 상품을 넣고 → 메뉴와 홈을 정리합니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">바로 이동</span>
  <a class="manual-goto" href="/admin/categories" target="_blank">카테고리 관리</a>
  <a class="manual-goto is-sub" href="/admin/products" target="_blank">상품 관리</a>
  <a class="manual-goto is-sub" href="/admin/feature-menus" target="_blank">일반 메뉴 관리</a>
  <a class="manual-goto is-sub" href="/admin/page-builder" target="_blank">페이지 빌더</a>
</div>

> **상품·메뉴·홈은 "편집 중인 몰"에 저장됩니다.** 시작 전에 대상 몰이 맞는지 확인하세요. 엉뚱한 몰을 고치기 가장 쉬운 단계입니다.

---

## 1) 카테고리 만들기

<div class="manual-goto-bar">
  <span class="manual-goto-label">이 단계 화면</span>
  <a class="manual-goto" href="/admin/categories" target="_blank">카테고리 관리 열기</a>
</div>

- 상품을 담을 분류를 먼저 만듭니다. 상품 등록 시 필요하므로 순서가 중요합니다.
- **카테고리·브랜드는 전 몰 공용 마스터**입니다. 여기서 만든 분류는 다른 몰에서도 함께 보입니다.
- 각 몰 스토어에는 **그 몰에 상품이 담긴 카테고리만** 노출됩니다(빈 카테고리는 자동 숨김). 특정 몰에서만 숨기려면 목록의 **몰별 표시** 토글을 씁니다.
- 최대 **3단계**까지 계층을 만들 수 있습니다. 자식이 있는 카테고리, 상품이 연결된 카테고리는 삭제할 수 없습니다.

**완료 판단:** 상품 등록 화면의 카테고리 드롭다운에 방금 만든 분류가 뜬다.

## 2) 상품 등록

<div class="manual-goto-bar">
  <span class="manual-goto-label">이 단계 화면</span>
  <a class="manual-goto" href="/admin/products" target="_blank">상품 관리 열기</a>
</div>

- 상품은 **편집 중인 몰에 묶입니다.** 등록 전 대상 몰을 꼭 확인하세요.
- 카테고리는 단계별 드롭다운으로 고르거나 `대>중>소` 경로를 직접 입력하면 없는 단계가 자동 생성됩니다.
- 색상·사이즈 등 선택지가 있는 상품은 **옵션·SKU 관리**에서 조합별 재고·가격을 설정합니다.

**완료 판단:** `/?mall=<코드>` 의 카테고리 메뉴에 상품이 보인다.

## 3) 메뉴 · 홈 정리

<div class="manual-goto-bar">
  <span class="manual-goto-label">이 단계 화면</span>
  <a class="manual-goto" href="/admin/feature-menus" target="_blank">일반 메뉴 관리</a>
  <a class="manual-goto is-sub" href="/admin/page-builder" target="_blank">페이지 빌더</a>
</div>

- **일반 메뉴 관리** — 상단 메뉴 켜기/끄기·이름·순서.
- **페이지 빌더** — 메인(홈) 화면 섹션 조립.

> ⚠️ **페이지 빌더는 "발행"해야 반영됩니다.** 편집만 하고 발행하지 않으면 고객 화면은 그대로입니다.

## 4) 주문 받기 전에 — 메일 확인

<div class="manual-goto-bar">
  <span class="manual-goto-label">이 단계 화면</span>
  <a class="manual-goto" href="/admin/settings?tab=system" target="_blank">시스템 설정 (SMTP)</a>
  <a class="manual-goto is-sub" href="/admin/email-templates" target="_blank">이메일 템플릿 관리</a>
</div>

주문이 들어오면 고객에게 **주문 완료·배송 시작·배송 완료 안내 메일이 자동으로 나갑니다.** 새 몰도 아무 설정 없이 기본 문구로 발송되므로 따로 만들 것은 없지만, 두 가지만 확인하세요.

- **시스템 설정 > SMTP** — 발송 계정이 비어 있으면 어떤 메일도 나가지 않습니다.
- **이메일 템플릿 관리** — 메일 맨 위에 뜨는 이름이 이 몰 이름이 맞는지 [미리보기]로 확인합니다. 문구를 이 몰 말투로 바꾸거나 특정 안내를 끌 수도 있습니다.

**완료 판단:** 이메일 템플릿 관리에서 [테스트 발송]으로 보낸 메일이 내 메일함에 도착한다.

---

## 최종 확인

몰 리스트의 **스토어 링크**(`?mall=<코드> ↗`)를 눌러 손님이 보는 화면을 확인합니다. 카테고리·상품·메인 화면이 모두 정상이면 몰 하나가 완성된 것입니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">관련 매뉴얼</span>
  <a class="manual-goto" href="/manual/admin/products">상품 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/categories">카테고리 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/menus">메뉴 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/page_builder">페이지 빌더</a>
  <a class="manual-goto is-sub" href="/manual/admin/email_templates">이메일 템플릿 관리</a>
  <a class="manual-goto is-sub" href="/manual/mall_builder/delete_rebuild">4. 몰 지우고 다시 만들기</a>
</div>
