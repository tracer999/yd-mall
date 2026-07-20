# 2. 테마·디자인 다듬기

몰을 만들면 디자인이 이미 적용되어 있습니다. 여기서는 그것을 **내 몰 것으로 바꾸는 최소 작업**만 합니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">바로 이동</span>
  <a class="manual-goto" href="/admin/site-settings" target="_blank">사이트 설정</a>
  <a class="manual-goto is-sub" href="/admin/theme-settings" target="_blank">디자인 스타일</a>
  <a class="manual-goto is-sub" href="/admin/header-settings" target="_blank">Header 설정</a>
  <a class="manual-goto is-sub" href="/admin/banners/hero-slides" target="_blank">배너 &gt; 메인 슬라이더</a>
</div>

> **네 화면 모두 몰마다 따로 저장됩니다.** 손대기 전에 우측 상단에서 **편집 중인 몰**을 반드시 확인하세요.

---

## 어디서 무엇을 바꾸나

| 바꾸고 싶은 것 | 가야 할 화면 |
|---------------|-------------|
| **색상 · 로고 · 상호** | 사이트 설정 (`/admin/site-settings`) |
| **모서리 · 글꼴 · 간격** | 디자인 스타일 (`/admin/theme-settings`) |
| **헤더 레이아웃 · GNB 최대 노출 수** | Header 설정 (`/admin/header-settings`) |
| **메인 최상단 큰 이미지** | 배너 관리 → 메인 슬라이더 (`/admin/banners/hero-slides`) |
| **테마 1·2·3 자체 · 메뉴 구성 방식** | 페이지 빌더 → 테마 설정 탭 (`/admin/page-builder?tab=theme`) |

> **디자인 스타일에는 색상이 없습니다.** 색상·로고는 **사이트 설정**입니다. 가장 많이 헤매는 부분입니다.

## 순서대로 하기

1. **사이트 설정** — 상호·로고·브랜드 색상 입력. 납품 시 가장 먼저 바뀌어야 할 값입니다.
   *(테마를 다시 적용해도 사이트 설정은 덮어쓰지 않습니다. 운영자 자산이라 보존됩니다.)*
2. **디자인 스타일** — 모서리 둥글기·글꼴·간격 조정. 비워 두면 기본값으로 되돌아갑니다.
3. **Header 설정** — 헤더 레이아웃과 **GNB 최대 노출 수** 확인.
4. **배너 관리 → 메인 슬라이더** — 메인 최상단 히어로 이미지 등록.

**완료 판단:** `/?mall=<코드>` 를 열었을 때 로고·색상·최상단 이미지가 내 몰의 것으로 보이면 끝입니다.

## 자주 막히는 두 가지

> **"메인 상단에 큰 이미지가 안 보여요"** — 슬라이드가 하나도 없으면 히어로 영역이 통째로 사라집니다(빈 칸 방지). 배너 관리 → **메인 슬라이더** 탭에서 슬라이드를 등록하세요.

> **"메뉴를 켰는데 상단에 안 보여요"** — Header 설정의 **GNB 최대 노출 수**에 걸려 뒤에서 잘린 것일 수 있습니다.

> ⚠️ **테마를 다시 적용하면** 위에서 다듬은 모서리·글꼴·간격이 그 테마 기본값으로 초기화됩니다. 세부 조정은 테마 재적용을 끝낸 뒤에 하세요.

<div class="manual-goto-bar">
  <span class="manual-goto-label">관련 매뉴얼</span>
  <a class="manual-goto" href="/manual/mall_builder/fill_content">3. 몰 채우기</a>
  <a class="manual-goto is-sub" href="/manual/admin/settings">사이트 설정</a>
  <a class="manual-goto is-sub" href="/manual/admin/theme">디자인 스타일</a>
  <a class="manual-goto is-sub" href="/manual/admin/header">Header 설정</a>
  <a class="manual-goto is-sub" href="/manual/admin/banners">배너 관리</a>
</div>
