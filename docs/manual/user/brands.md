# 브랜드관

**브랜드를 찾아보고, 브랜드별 전용관에서 상품과 혜택을 한번에 보는 곳**입니다. 상단 메뉴의 **브랜드**를 누르면 열립니다.

브랜드관은 두 층입니다. **브랜드 홈**(`/brands`)은 브랜드를 검색·탐색하는 화면이고, **브랜드 상세관**(`/brands/{번호}`)은 특정 브랜드 하나의 전용 매장입니다.

브랜드는 카테고리 관리 안에서 **유형이 `브랜드`인 항목**으로 만들어집니다. 여기에 브랜드 관리 화면에서 로고·소개·대표 이미지 같은 살을 붙입니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">바로 이동</span>
  <a class="manual-goto" href="/brands" target="_blank">브랜드관 열기</a>
  <a class="manual-goto" href="/admin/brands" target="_blank">브랜드 관리</a>
  <a class="manual-goto is-sub" href="/admin/categories" target="_blank">카테고리 관리 (브랜드 만들기)</a>
</div>

---

## 이 화면에 무엇이 보이나

**브랜드 홈**

- 브랜드 검색창 (자동완성)
- 인기 브랜드 쇼케이스 · 신규 입점 브랜드
- 카테고리별 브랜드
- 이번 주 브랜드 혜택
- 전체 브랜드 목록 — 초성(ㄱㄴㄷ) 필터, 정렬(상품수 · 인기 · 이름 · 신규)

**브랜드 상세관**

- 최상단 브랜드 배너
- 탭 — 홈 · 베스트 · 신상품 · 전체상품 · 혜택
- 브랜드 찜하기
- 함께 보면 좋은 브랜드

---

## 이 화면은 관리자에서 이렇게 만들어집니다

| 고객 화면의 이 부분 | 관리자 어느 기능으로 만드나 | 비고 |
|---|---|---|
| 브랜드 자체를 만들기 | 카테고리 관리 (유형 = 브랜드) | 여기서 만들지 않으면 브랜드가 존재하지 않습니다 |
| 브랜드 로고 · 소개글 · 대표 이미지 | 브랜드 관리 | 브랜드 상세 편집 화면 |
| 브랜드 검색·목록에 쓰이는 이름 | 카테고리 관리 | |
| 브랜드에 어떤 상품이 속하는지 | 상품 관리 (상품별 브랜드 지정) 또는 브랜드 관리 (상품 배정) | 두 경로 모두 가능 |
| 상세관 최상단 배너 | 배너 관리 (브랜드 배너) | 브랜드별 배너가 없으면 공통 브랜드 배너로 대체 |
| **혜택 탭**의 쿠폰 | 쿠폰 관리 | 그 브랜드 대상 쿠폰이 자동으로 모임 |
| **혜택 탭**의 기획전 | 기획전·전문관 관리 (브랜드 지정) | 기획전에 브랜드를 지정하면 여기에 나옴 |
| **혜택 탭**의 특가 | 쇼핑특가 관리 | |
| **혜택 탭**의 공동구매 | 공동구매 관리 | |
| 인기 · 신규 · 상품수 정렬 순서 | **관리 대상 아님** — 자동 집계 | 브랜드 관리의 집계 재계산으로 갱신 |
| 베스트 · 신상품 탭의 상품 | **관리 대상 아님** — 자동 산출 | 판매·좋아요와 판매 시작일 기준 |
| 브랜드 메뉴를 GNB 에 올리기 | 메뉴 관리 (브랜드 메뉴) | |

<div class="manual-goto-bar">
  <span class="manual-goto-label">브랜드 만들기·편집하기</span>
  <a class="manual-goto" href="/admin/categories" target="_blank">1단계 — 카테고리 관리에서 브랜드 생성</a>
  <a class="manual-goto" href="/admin/brands" target="_blank">2단계 — 브랜드 관리에서 로고·소개 입력</a>
  <a class="manual-goto is-sub" href="/admin/banners" target="_blank">브랜드 배너 등록</a>
</div>

> **브랜드는 두 곳에 나뉘어 있습니다.** "브랜드라는 항목의 존재"는 **카테고리 관리**가, "그 브랜드의 로고·소개·상품 배정"은 **브랜드 관리**가 담당합니다. 브랜드 관리 목록에 원하는 브랜드가 없다면 아직 카테고리 관리에서 만들지 않은 것입니다.

> **혜택 탭은 직접 입력하는 화면이 없습니다.** 쿠폰·기획전·특가·공동구매를 만들 때 **그 브랜드를 대상으로 지정**하면 자동으로 모여 표시됩니다.

---

## 안 보이거나 비어 있을 때

**Q. 브랜드 메뉴가 GNB 에 없습니다.**
메뉴 관리에서 브랜드 메뉴가 꺼져 있습니다.

**Q. 만든 브랜드가 브랜드 홈 목록에 없습니다.**
카테고리 관리에서 그 브랜드가 **활성** 상태이고 이 몰에서 **노출**로 되어 있는지 확인하세요.

**Q. 브랜드 목록에 로고가 안 보입니다.**
브랜드 관리에서 로고 이미지를 등록하지 않았습니다. 로고가 없는 브랜드는 이름만 표시됩니다.

**Q. 브랜드 상세관에 상품이 없습니다.**
그 브랜드로 지정된 상품이 없습니다. 상품 관리에서 상품마다 브랜드를 지정하거나, 브랜드 관리의 상품 배정 기능을 쓰세요.

**Q. 상품 수·인기 순위가 실제와 다릅니다.**
브랜드 집계는 미리 계산해 둔 값을 씁니다. 브랜드 관리의 **집계 재계산**을 실행하세요.

**Q. 혜택 탭이 비어 있습니다.**
그 브랜드를 대상으로 지정한 쿠폰·기획전·특가·공동구매가 없습니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">확인하러 가기</span>
  <a class="manual-goto" href="/admin/brands" target="_blank">브랜드 관리 (로고·집계 재계산)</a>
  <a class="manual-goto is-sub" href="/admin/categories" target="_blank">카테고리 관리 (활성·노출 확인)</a>
  <a class="manual-goto is-sub" href="/admin/products" target="_blank">상품 관리 (브랜드 지정)</a>
</div>

---

## 관련 매뉴얼

<div class="manual-goto-bar">
  <span class="manual-goto-label">함께 보면 좋은 문서</span>
  <a class="manual-goto is-sub" href="/manual/admin/brands">관리자 · 브랜드 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/categories">관리자 · 카테고리 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/banners">관리자 · 배너 관리</a>
  <a class="manual-goto is-sub" href="/manual/user/products">고객 · 상품 목록·상세</a>
</div>
