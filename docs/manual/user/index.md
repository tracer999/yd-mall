# 쇼핑몰(고객) 화면 안내

이 문서는 **고객이 보는 쇼핑몰 화면**이 어떻게 생겼고, 그 화면이 **관리자에서 어떤 기능으로 만들어지는지**를 정리한 안내서입니다.

고객 조작법을 길게 설명하지 않습니다. 운영자가 "고객이 이 화면을 봤는데, 이걸 바꾸려면 관리자 어디로 가야 하나"를 바로 찾을 수 있게 하는 것이 목적입니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">바로 이동</span>
  <a class="manual-goto" href="/" target="_blank">쇼핑몰 화면 열기</a>
  <a class="manual-goto is-sub" href="/admin/menus" target="_blank">메뉴 관리</a>
  <a class="manual-goto is-sub" href="/admin/page-builder" target="_blank">페이지 빌더</a>
</div>

> **모든 고객 화면은 "지금 편집 중인 몰" 기준으로 만들어집니다.** 이 앱은 여러 몰을 한 인스턴스에서 운영하는 몰 빌더입니다. 관리자에서 무언가를 바꿨는데 고객 화면이 그대로라면, 가장 먼저 **편집 중인 몰이 맞는지** 확인하세요.

---

## 이 화면에 무엇이 보이나

고객이 어느 페이지에 있든 항상 따라다니는 공통 구조가 4개 있습니다.

| 영역 | 무엇이 있나 |
|---|---|
| **상단 헤더 · GNB** | 로고, 검색, 로그인 / 마이쇼핑 / 장바구니 / 고객센터, 그리고 카테고리와 기능 메뉴가 늘어선 가로 메뉴줄 |
| **우측 유틸 레일** (PC) | 화면 오른쪽에 세로로 붙는 작은 버튼줄 — 장바구니 · 찜 · 찜한 브랜드 · 최근 본 상품 · TOP |
| **모바일 하단바** | 화면 아래 고정 — 홈 · 카테고리 · 장바구니 · 마이 |
| **본문** | 페이지마다 다른 실제 내용 |

---

## 이 화면은 관리자에서 이렇게 만들어집니다

### 헤더 · GNB

GNB(가로 메뉴줄)에 올라오는 항목은 **세 곳에서** 옵니다.

| 고객 화면의 이 부분 | 관리자 어느 기능으로 만드나 | 비고 |
|---|---|---|
| 쇼핑특가 · 베스트/랭킹 · 신상품 · 추천 · 이벤트&혜택 · 기획전 · 브랜드 · 전문관 · 아울렛 · 쿠폰 · 멤버십 · 공동구매 · 쇼핑라이브 · 카테고리 | 메뉴 관리 | 켜고 끄기 · 이름 · 순서만 바꿉니다. 주소는 고정입니다 |
| 운영자가 직접 만든 자유 메뉴 | 커스텀 메뉴 | 기획전 · 카테고리 · 브랜드 · 외부 링크로 연결 |
| 카테고리 목록과 계층 | 카테고리 관리 | |
| GNB 에 몇 개까지 보일지, 카테고리를 몇 뎁스까지 펼칠지 | Header 설정 | |
| 로고 · 회사명 | 사이트 설정 | |
| 우측 세로 버튼줄 항목 | 메뉴 관리 (우측 레일 위치) | |
| 모바일 하단바 | **관리 화면 없음** — 코드 고정 | 홈·카테고리·장바구니·마이 4개 |

<div class="manual-goto-bar">
  <span class="manual-goto-label">헤더 편집하기</span>
  <a class="manual-goto" href="/admin/menus" target="_blank">메뉴 관리</a>
  <a class="manual-goto is-sub" href="/admin/custom-menus" target="_blank">커스텀 메뉴</a>
  <a class="manual-goto is-sub" href="/admin/header-settings" target="_blank">Header 설정</a>
  <a class="manual-goto is-sub" href="/admin/menu-preview" target="_blank">메뉴 미리보기</a>
</div>

### 화면 전체 대응표

**"고객 화면의 이것을 바꾸고 싶다"** 를 기준으로 찾는 표입니다.

| 고객 화면에서 보이는 것 | 관리자 어느 기능으로 만드나 |
|---|---|
| 로고 · 회사명 · 대표 색상 | 사이트 설정 · 디자인 스타일 |
| 홈 화면의 배너·상품줄 배치 | 페이지 빌더 |
| 홈 최상단 큰 배너 · 팝업 | 배너 관리 |
| 카테고리 목록과 순서 | 카테고리 관리 |
| 상품 이름 · 가격 · 이미지 · 설명 | 상품 관리 |
| 할인가로 표시되는 금액 | 쇼핑특가 관리 |
| 베스트/랭킹 순위와 탭 | 베스트/랭킹 관리 |
| 기획전 · 전문관 | 기획전·전문관 관리 |
| 이벤트 | 이벤트 관리 |
| 받는 쿠폰(쿠폰존) | 쿠폰 관리 |
| 브랜드관 | 카테고리 관리(브랜드) · 브랜드 관리 |
| 공지사항 · 자주 묻는 질문 | 공지사항 관리 · 자주 묻는 질문 |
| 약관 · 개인정보처리방침 | 약관/정책 관리 |
| 고객이 무엇을 검색했는지 | 검색 로그 |

---

## 고객 화면 목록

| 고객 화면 | 주소 | 문서 |
|---|---|---|
| 메인(홈) | `/` | [메인 화면](/manual/user/home) |
| 카테고리 · 상품 목록 | `/products`, `/products/category/{번호}` | [카테고리 메뉴](/manual/user/categories) |
| 상품 상세 | `/products/{주소이름}` | [상품 목록·상세](/manual/user/products) |
| 검색 | `/search` | [검색](/manual/user/search) |
| 브랜드관 | `/brands` | [브랜드관](/manual/user/brands) |
| 혜택·프로모션 메뉴 모음 | `/deals` `/best` `/new` `/recommend` `/exhibition` `/specialty` `/event` `/group-buy` `/outlet` `/live` `/coupon` `/membership` | [혜택·프로모션](/manual/user/promotions) |
| 커스텀 메뉴 | 운영자가 지정 | [커스텀 메뉴](/manual/user/custom_menu) |
| 장바구니 | `/cart` | [장바구니](/manual/user/cart) |
| 주문·결제 | `/checkout` | [주문·결제](/manual/user/checkout) |
| 마이쇼핑 | `/mypage` | [마이쇼핑](/manual/user/mypage) |
| 로그인·회원가입 | `/auth/login` | [로그인·가입](/manual/user/auth) |
| 고객센터 | `/cs` | [고객센터](/manual/user/cs) |
| 1:1 문의 | `/inquiries` | [1:1 문의](/manual/user/inquiries) |
| 공지사항 | `/notices` | [공지사항](/manual/user/notices) |
| 약관·정책 | 약관 페이지 | [약관 페이지](/manual/user/terms_pages) |

---

## 안 보이거나 비어 있을 때

**Q. 관리자에서 저장했는데 고객 화면이 그대로입니다.**
① 편집 중인 몰이 맞는지, ② 발행·노출 스위치를 켰는지, ③ 노출 기간이 오늘을 포함하는지 순서대로 확인하세요. 원인의 대부분이 이 셋입니다.

**Q. 메뉴를 켰는데 GNB 에 없습니다.**
이 쇼핑몰은 **내용이 비어 있는 메뉴를 자동으로 감춥니다.** 아울렛 · 공동구매 · 쇼핑라이브가 여기에 해당하며, 상품이나 방송이 하나도 없으면 메뉴 자체가 사라집니다. 고객에게 죽은 링크를 보여주지 않기 위한 동작입니다. 메뉴 미리보기 화면에서 숨김 사유를 확인할 수 있습니다.

**Q. 메뉴가 잘려서 몇 개만 나옵니다.**
GNB 에 올릴 수 있는 개수에 상한이 있습니다. Header 설정에서 조정하세요.

<div class="manual-goto-bar">
  <span class="manual-goto-label">확인하러 가기</span>
  <a class="manual-goto" href="/admin/menu-preview" target="_blank">메뉴 미리보기</a>
  <a class="manual-goto is-sub" href="/admin/header-settings" target="_blank">Header 설정</a>
  <a class="manual-goto is-sub" href="/admin/malls" target="_blank">몰 리스트 관리</a>
</div>

---

## 관련 매뉴얼

<div class="manual-goto-bar">
  <span class="manual-goto-label">함께 보면 좋은 문서</span>
  <a class="manual-goto is-sub" href="/manual/user/home">메인 화면</a>
  <a class="manual-goto is-sub" href="/manual/user/promotions">혜택·프로모션</a>
  <a class="manual-goto is-sub" href="/manual/admin/menus">관리자 · 메뉴 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/page_builder">관리자 · 페이지 빌더</a>
</div>
