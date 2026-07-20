# 메인 화면 (홈)

쇼핑몰 주소로 접속했을 때 **가장 먼저 보이는 화면**입니다.

홈은 정해진 모양이 없습니다. **위에서 아래로 쌓인 구역(섹션)의 나열**이며, 어떤 구역을 몇 번째에 놓을지는 몰마다 다릅니다. 그래서 A몰 홈과 B몰 홈은 완전히 다르게 생길 수 있습니다.

이 구조는 **페이지 빌더**가 만듭니다. 운영자가 팔레트에서 섹션을 골라 순서대로 쌓으면 그대로 고객 화면이 됩니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">바로 이동</span>
  <a class="manual-goto" href="/" target="_blank">메인 화면 열기</a>
  <a class="manual-goto" href="/admin/page-builder" target="_blank">페이지 빌더</a>
  <a class="manual-goto is-sub" href="/admin/banners" target="_blank">배너 관리</a>
</div>

---

## 이 화면에 무엇이 보이나

- **최상단 큰 배너(히어로)** — 넘어가는 슬라이드 또는 상품 쇼케이스
- **팝업** — 접속 직후 뜨는 안내 창 (설정한 경우)
- **여러 개의 섹션** — 상품줄 · 배너줄 · 카테고리 · 랭킹 탭 · 브랜드 · 퀵메뉴 등
- **최근 본 상품** — 사람마다 다르게 보이며, 본 상품이 없으면 나타나지 않음

---

## 이 화면은 관리자에서 이렇게 만들어집니다

홈은 **두 화면이 나눠 담당**합니다. 배치는 페이지 빌더, 배너 이미지는 배너 관리입니다.

| 고객 화면의 이 부분 | 관리자 어느 기능으로 만드나 | 비고 |
|---|---|---|
| 섹션의 종류와 순서 전체 | 페이지 빌더 | 홈의 골격을 정하는 곳 |
| 최상단 큰 배너의 **배치** | 페이지 빌더 (테마 히어로 섹션) | 좌우 분할 / 전체 폭 / 풀블리드 중 선택 |
| 최상단 큰 배너의 **내용** | 배너 관리 (MAIN 배너) · 히어로 슬라이드 | 이미지·링크는 여기서 등록 |
| 히어로 하단 흐름문구(마퀴) | 배너 관리 > 메인 슬라이더 | 페이지 빌더 발행과 무관하게 즉시 반영 |
| 접속 직후 뜨는 팝업 | 배너 관리 (POPUP 배너) | 노출 기간이 있는 것만 뜸 |
| 중간에 깔리는 배너줄 | 배너 관리 + 페이지 빌더 (프로모션 배너 섹션) | 같은 그룹 키로 묶어 등록 |
| 상품이 격자·가로슬라이드로 나열된 줄 | 상품 그룹 + 페이지 빌더 (상품 그리드 / 상품 캐러셀) | 어떤 상품을 담을지는 상품 그룹에서 |
| 특가만 모은 가로 슬라이드 | 쇼핑특가 관리 (페이지 빌더의 쇼핑특가 캐러셀 섹션) | 특가 기간이 끝나면 섹션이 저절로 사라짐 |
| 랭킹 탭 · 베스트 순위 | 베스트/랭킹 관리 | 탭이 곧 랭킹 그룹 |
| 카테고리별 상품 묶음 | 카테고리 관리 | 노출 카테고리를 따라감 |
| 브랜드 로고 + 상품 줄 | 카테고리 관리(브랜드) | 브랜드 카테고리를 자동으로 끌어옴 |
| 아이콘 바로가기 버튼 줄 | 페이지 빌더 (퀵 메뉴 섹션) | 이동할 페이지를 목록에서 고르면 링크·아이콘 자동 |
| 카카오 상담 배너 | 사이트 설정 (카카오 채널) | |
| 최근 본 상품 | **관리 대상 아님** | 고객별로 자동 생성 |

<div class="manual-goto-bar">
  <span class="manual-goto-label">홈 편집하기</span>
  <a class="manual-goto" href="/admin/page-builder" target="_blank">페이지 빌더 (배치)</a>
  <a class="manual-goto is-sub" href="/admin/banners" target="_blank">배너 관리 (이미지·팝업)</a>
  <a class="manual-goto is-sub" href="/admin/product-groups" target="_blank">상품 그룹 (상품줄 내용)</a>
  <a class="manual-goto is-sub" href="/admin/best-groups" target="_blank">베스트/랭킹 관리</a>
</div>

> **배치와 내용이 분리되어 있습니다.** 페이지 빌더는 "무엇을 몇 번째에 놓을지"만 정하고, 그 안에 들어갈 상품·이미지는 각각 상품 그룹·배너 관리·특가 관리에서 옵니다. "섹션은 있는데 비어 보인다"면 배치가 아니라 **내용 쪽**을 확인하세요.

---

## 안 보이거나 비어 있을 때

**Q. 홈이 통째로 예전 모습 그대로입니다.**
페이지 빌더에서 **발행**을 하지 않았을 수 있습니다. 저장만으로는 고객 화면이 바뀌지 않습니다.

**Q. 최상단 배너가 비어 있습니다.**
배너 관리에서 **MAIN 타입** 배너가 등록되어 있고 활성 상태인지 확인하세요. 히어로가 상품 쇼케이스 형태로 설정된 몰이라면 **히어로 슬라이드**가 등록되어 있어야 합니다.

**Q. 모바일에서만 배너가 안 넘어갑니다.**
모바일 이미지가 없는 배너는 PC 이미지로 대체되어 표시됩니다. 슬라이드가 1장뿐이면 넘김 동작이 없으니 2장 이상 등록하세요.

**Q. 특가 섹션이 사라졌습니다.**
진행 중인 특가가 하나도 없으면 그 섹션은 자동으로 빠집니다. 정상 동작입니다.

**Q. 상품줄이 비어 있습니다.**
연결된 상품 그룹에 상품이 없거나, 담긴 상품이 전부 판매중지·품절일 수 있습니다.

**Q. 팝업이 안 뜹니다.**
배너 관리에서 POPUP 타입 배너의 **노출 기간이 오늘을 포함하는지** 확인하세요.

<div class="manual-goto-bar">
  <span class="manual-goto-label">확인하러 가기</span>
  <a class="manual-goto" href="/admin/page-builder" target="_blank">페이지 빌더에서 발행하기</a>
  <a class="manual-goto is-sub" href="/admin/banners" target="_blank">배너 등록 상태 확인</a>
  <a class="manual-goto is-sub" href="/admin/deals" target="_blank">진행 중인 특가 확인</a>
</div>

---

## 관련 매뉴얼

<div class="manual-goto-bar">
  <span class="manual-goto-label">함께 보면 좋은 문서</span>
  <a class="manual-goto is-sub" href="/manual/admin/page_builder">관리자 · 페이지 빌더</a>
  <a class="manual-goto is-sub" href="/manual/admin/banners">관리자 · 배너 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/best">관리자 · 베스트/랭킹</a>
  <a class="manual-goto is-sub" href="/manual/user/promotions">고객 · 혜택·프로모션</a>
</div>
