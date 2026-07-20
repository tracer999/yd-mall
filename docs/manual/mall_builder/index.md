# 몰 빌더 가이드 (퀵 스타트)

새 쇼핑몰 하나를 만드는 데 **꼭 필요한 작업만** 순서대로 담았습니다. 각 단계는 "무엇을 한다 → 어디서 한다 → 어떻게 확인한다" 세 줄이면 끝납니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">바로 이동</span>
  <a class="manual-goto" href="/admin/malls" target="_blank">몰 리스트 관리 열기</a>
  <a class="manual-goto is-sub" href="/admin/malls/new" target="_blank">몰 등록</a>
  <a class="manual-goto is-sub" href="/manual/admin">관리자 매뉴얼</a>
</div>

> **1단계만 해도 볼 수 있는 몰이 하나 완성됩니다.** 몰 등록 폼에서 테마를 고르고 **샘플 데이터 포함**을 켠 채 저장하면 디자인·헤더·메뉴·메인 화면·샘플 상품까지 자동으로 채워집니다. 2~3단계는 그 몰을 **내 것으로 바꾸는** 과정입니다.

---

## 전체 순서

| 단계 | 하는 일 | 화면 | 완료 판단 | 문서 |
|------|---------|------|-----------|------|
| 0 | 이 솔루션이 무엇인지 파악 | — | — | [솔루션 개요](overview) |
| **1** | 몰 등록 → 테마·메뉴 방식 선택 → 초기 골격 자동 생성 | `/admin/malls` | `/?mall=<코드>` 로 메인이 뜬다 | **[몰 만들기](create_mall)** |
| **2** | 색상·로고 → 모서리·글꼴 → 헤더 → 메인 히어로 | `/admin/site-settings` 외 | 고객 화면 색·로고가 내 것이다 | **[테마·디자인 다듬기](theme_design)** |
| **3** | 카테고리 → 상품 → 메뉴 → 홈 발행 | `/admin/categories` 외 | 상품이 스토어에 보인다 | **[몰 채우기](fill_content)** |
| 4 | 만든 몰을 지우고 다시 시작 | `/admin/malls` | 목록에서 몰이 사라진다 | [몰 지우고 다시 만들기](delete_rebuild) |

<div class="manual-goto-bar">
  <span class="manual-goto-label">단계별 화면</span>
  <a class="manual-goto" href="/admin/malls" target="_blank">1. 몰 리스트 관리</a>
  <a class="manual-goto is-sub" href="/admin/site-settings" target="_blank">2. 사이트 설정</a>
  <a class="manual-goto is-sub" href="/admin/categories" target="_blank">3. 카테고리 관리</a>
  <a class="manual-goto is-sub" href="/admin/products" target="_blank">3. 상품 관리</a>
  <a class="manual-goto is-sub" href="/admin/page-builder" target="_blank">3. 페이지 빌더</a>
</div>

---

## 시작 전에 반드시 알아야 할 한 가지 — "편집 중인 몰"

관리자에서 **상품·메뉴·테마·페이지 빌더**는 **지금 편집 중인 몰** 기준으로 저장됩니다. 여러 몰이 있다면 몰 리스트에서 **선택** 버튼을 누르거나 우측 상단 **몰 선택기**로 대상 몰을 먼저 바꾸세요.

> **카테고리·브랜드는 예외로 전 몰 공용**입니다. 어느 몰을 편집 중이든 같은 목록을 고칩니다.

몰을 만든 뒤의 실제 운영(주문·회원·프로모션 등)은 [관리자 매뉴얼](/manual/admin)에서 다룹니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">관련 매뉴얼</span>
  <a class="manual-goto" href="/manual/admin/malls">몰 리스트 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/theme">디자인 스타일</a>
  <a class="manual-goto is-sub" href="/manual/admin/page_builder">페이지 빌더</a>
</div>
