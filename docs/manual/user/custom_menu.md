# 커스텀 메뉴

쇼핑몰이 **직접 만들어 붙인 메뉴**입니다. 몰마다 있을 수도, 없을 수도 있습니다.

상단 메뉴줄에는 두 종류가 섞여 있습니다. 하나는 쇼핑특가·베스트처럼 **기능이 정해진 메뉴**이고, 다른 하나가 이 커스텀 메뉴입니다. 커스텀 메뉴는 운영자가 **이름과 목적지를 직접 정해** 만든 것이라 고객 입장에서는 겉모습이 다른 메뉴와 똑같습니다.

"가을 보양전", "선물하기", "회사 소개"처럼 기본 메뉴로는 표현할 수 없는 것을 올릴 때 씁니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">바로 이동</span>
  <a class="manual-goto" href="/admin/custom-menus" target="_blank">커스텀 메뉴 관리</a>
  <a class="manual-goto is-sub" href="/admin/menus" target="_blank">메뉴 관리</a>
  <a class="manual-goto is-sub" href="/admin/menu-preview" target="_blank">메뉴 미리보기</a>
</div>

---

## 이 화면에 무엇이 보이나

커스텀 메뉴는 **놓이는 위치가 세 곳** 중 하나입니다.

- **GNB (상단 메뉴)** — 기능 메뉴와 나란히 섞여 나옵니다
- **푸터** — 화면 맨 아래
- **모바일 퀵 메뉴**

메뉴에 **NEW · HOT · SALE** 배지를 달 수 있고, 외부 링크는 항상 새 창으로 열립니다.

---

## 이 화면은 관리자에서 이렇게 만들어집니다

| 고객 화면의 이 부분 | 관리자 어느 기능으로 만드나 | 비고 |
|---|---|---|
| 메뉴 자체를 만들기 | 커스텀 메뉴 | |
| 메뉴에 보이는 이름 | 커스텀 메뉴 (메뉴 이름) | |
| 놓이는 자리 | 커스텀 메뉴 (노출 위치) | GNB · 푸터 · 모바일 퀵 메뉴 |
| 기능 메뉴들 사이에서의 순서 | 커스텀 메뉴 (순서) | 기능 메뉴와 **같은 순서 축**을 씁니다 |
| NEW · HOT · SALE 배지 | 커스텀 메뉴 (배지) | 이 셋만 가능 |
| 특정 기간에만 보이기 | 커스텀 메뉴 (노출 시작 · 종료) | |
| 로그인한 고객에게만 보이기 | 커스텀 메뉴 (로그인 필요) | |
| PC 에만 / 모바일에만 보이기 | 커스텀 메뉴 | |
| GNB 에 커스텀 메뉴를 몇 개까지 둘지 | Header 설정 | 위치별 슬롯 제한 |

### 어디로 보낼지 (링크 유형 5가지)

| 링크 유형 | 어디로 보내나 | 목적지를 만드는 곳 |
|---|---|---|
| **기획전 · 전문관** | 발행된 기획전/전문관 상세로 | 기획전·전문관 관리 |
| **카테고리** | 그 카테고리 상품 목록으로 | 카테고리 관리 |
| **브랜드** | 그 브랜드 상품 목록으로 | 카테고리 관리(브랜드) · 브랜드 관리 |
| **내부 페이지 (직접 입력)** | 이 쇼핑몰 안의 경로 (`/` 로 시작) | 직접 입력 |
| **외부 링크** | 다른 사이트 (`http(s)://`) | 직접 입력 — 항상 새 창 |

<div class="manual-goto-bar">
  <span class="manual-goto-label">목적지를 먼저 만들어야 한다면</span>
  <a class="manual-goto is-sub" href="/admin/exhibitions" target="_blank">기획전·전문관 관리</a>
  <a class="manual-goto is-sub" href="/admin/categories" target="_blank">카테고리 관리</a>
  <a class="manual-goto is-sub" href="/admin/brands" target="_blank">브랜드 관리</a>
</div>

> **목적지가 무효해지면 메뉴가 조용히 사라집니다.** 연결한 기획전을 임시저장으로 되돌리거나, 카테고리를 비활성화하거나, 대상을 삭제하면 그 메뉴는 고객 화면에서 빠집니다. 고객에게 404 링크를 보여주지 않기 위한 동작이며, **메뉴를 지운 것이 아니므로** 대상을 되살리면 다시 나타납니다.

> **커스텀 메뉴는 기능 메뉴와 같은 줄에서 순서를 다툽니다.** 순서 값을 잘 주면 쇼핑특가와 베스트 사이에 끼워 넣을 수 있습니다. 다만 GNB 총 개수 상한을 넘기면 뒤쪽부터 잘리니, 꼭 보여야 할 메뉴는 순서를 앞으로 당기세요.

---

## 안 보이거나 비어 있을 때

**Q. 메뉴를 만들었는데 고객 화면에 없습니다.**
아래를 순서대로 확인하세요.
1. **사용 여부**가 켜져 있는가
2. **노출 기간**이 오늘을 포함하는가
3. **연결한 대상**이 아직 유효한가 (기획전이 발행 상태인가, 카테고리가 활성인가)
4. **로그인 필요**를 켜 두고 비로그인 상태로 보고 있지 않은가
5. **PC/모바일 노출** 설정이 지금 보는 기기와 맞는가
6. **편집 중인 몰**이 맞는가

**Q. 만든 메뉴 중 앞의 몇 개만 나옵니다.**
GNB 커스텀 메뉴 슬롯 수 또는 GNB 총 개수 상한에 걸렸습니다. Header 설정에서 조정하거나 순서를 바꾸세요.

**Q. 링크 유형에 상품 그룹이 없습니다.**
현재 커스텀 메뉴가 지원하는 유형은 위 5가지뿐입니다.

**Q. 외부 링크를 같은 창에서 열고 싶습니다.**
외부 링크는 항상 새 창으로 고정되어 있습니다. 변경할 수 없습니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">확인하러 가기</span>
  <a class="manual-goto" href="/admin/menu-preview" target="_blank">메뉴 미리보기 (숨김 사유 확인)</a>
  <a class="manual-goto is-sub" href="/admin/custom-menus" target="_blank">커스텀 메뉴 설정 확인</a>
  <a class="manual-goto is-sub" href="/admin/header-settings" target="_blank">Header 설정 (슬롯 수)</a>
</div>

---

## 관련 매뉴얼

<div class="manual-goto-bar">
  <span class="manual-goto-label">함께 보면 좋은 문서</span>
  <a class="manual-goto is-sub" href="/manual/admin/menus">관리자 · 메뉴 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/header">관리자 · Header 설정</a>
  <a class="manual-goto is-sub" href="/manual/admin/exhibitions">관리자 · 기획전·전문관</a>
  <a class="manual-goto is-sub" href="/manual/user/index">고객 화면 안내</a>
</div>
