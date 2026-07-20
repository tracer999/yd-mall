# 고객센터

고객이 **궁금한 점을 스스로 해결하는 화면**입니다. 주소는 `/cs` 이며, 로그인 없이 볼 수 있습니다.

가운데에 **자주 묻는 질문(FAQ)** 이 아코디언으로 펼쳐지고, 아래에 **최근 공지 5건**이 붙습니다. 왼쪽에는 1:1 문의하기 · 1:1 문의내역 · 공지사항 전체보기 · FAQ 분류 목록 · 주문/배송 조회 · **대표번호**가 있는 세로 메뉴가 있습니다.

FAQ에서 답을 못 찾은 고객은 **1:1 문의**나 **카카오톡 상담 채널**로 넘어가게 되어 있습니다.

---

## 이 화면에 무엇이 보이나

- **FAQ 검색창** — 질문과 답변 본문을 함께 검색합니다
- **자주묻는 질문 BEST 10** — 클릭하면 답변이 펼쳐집니다 (펼칠 때마다 조회수가 올라갑니다)
- **분류별 FAQ** — 왼쪽 분류를 누르면 그 분류만 모아 봅니다. 분류마다 질문 개수가 함께 표시됩니다
- **공지사항 5건** + 전체보기 링크
- **대표번호** (등록돼 있을 때만)
- 화면 오른쪽 아래의 **카카오톡 상담 버튼** (채널을 운영할 때만)

---

## 이 화면은 관리자에서 이렇게 만들어집니다

| 고객 화면의 이 부분 | 관리자 어느 기능으로 만드나 | 비고 |
|---|---|---|
| FAQ 질문 · 답변 | 자주 묻는 질문 | 답변은 HTML 편집이 되지만 위험한 태그는 자동 제거됩니다 |
| **BEST 10**에 올라가는 순서 | 자주 묻는 질문의 **BEST 지정** → 그다음 조회수 → 정렬순서 | BEST로 지정한 것이 항상 앞에 옵니다 |
| 왼쪽의 **FAQ 분류 목록** | 자주 묻는 질문의 분류 관리 | 사용 안 하는 분류는 비활성으로 내리면 목록에서 빠집니다 |
| 분류 옆의 **질문 개수** | 그 분류에 속한 **활성** FAQ 수 | 자동 계산됩니다 |
| 공지사항 5건 | 공지사항 관리 | 중요도 높은 공지가 위로 올라옵니다 |
| **대표번호** | 사이트 설정의 **대표 전화번호** | 비우면 표시되지 않습니다 |
| 상담 운영시간 안내 | 사이트 설정의 **고객센터 운영시간** | |
| **카카오톡 상담 버튼** | 사이트 설정의 **카카오 채널 사용 + 채널 URL** | 체크와 URL 둘 다 있어야 버튼이 뜹니다 |
| 1:1 문의하기 / 문의내역 링크 | 문의 관리 (고객이 넣은 문의가 여기로 들어옵니다) | |

<div class="manual-goto-bar">
  <span class="manual-goto-label">관리자에서 편집하기</span>
  <a class="manual-goto" href="/admin/faqs" target="_blank">자주 묻는 질문</a>
  <a class="manual-goto" href="/admin/settings" target="_blank">사이트 설정 (연락처 · 카카오 채널)</a>
  <a class="manual-goto is-sub" href="/admin/notices" target="_blank">공지사항 관리</a>
  <a class="manual-goto is-sub" href="/admin/inquiries" target="_blank">문의 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/settings">사이트 설정 매뉴얼</a>
  <a class="manual-goto is-sub" href="/manual/admin/inquiries">문의 관리 매뉴얼</a>
</div>

> **FAQ 답변에 넣은 스크립트 태그는 저장할 때 자동으로 지워집니다.** 이미지·문단·표·링크 정도로 구성하세요.

---

## 안 보이거나 비어 있을 때

**"FAQ가 하나도 안 나옵니다"**
자주 묻는 질문에 등록된 항목이 없거나, 등록은 했는데 **비활성** 상태입니다. 활성으로 바꿔야 화면에 나옵니다.

**"BEST 10에 엉뚱한 질문이 올라옵니다"**
BEST로 지정한 항목이 없으면 **조회수 순**으로 채워집니다. 원하는 질문을 BEST로 지정하세요.

**"왼쪽 분류가 비어 있습니다"**
FAQ 분류가 만들어지지 않았거나 전부 비활성입니다.

**"대표번호가 안 보입니다"**
사이트 설정의 대표 전화번호가 비어 있습니다.

**"카카오톡 상담 버튼이 안 뜹니다"**
사이트 설정에서 **카카오 채널 사용 체크**를 켜고 **채널 URL**을 함께 넣어야 합니다. 하나만 해 두면 나타나지 않습니다.

**"공지사항 영역이 비어 있습니다"**
지금 보고 있는 **그 몰의** 공지가 없습니다. 공지사항은 몰마다 따로 저장되므로, 다른 몰에 올린 공지는 여기 나오지 않습니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">확인하러 가기</span>
  <a class="manual-goto is-sub" href="/admin/faqs" target="_blank">FAQ 활성 여부 확인</a>
  <a class="manual-goto is-sub" href="/admin/settings" target="_blank">연락처 · 채널 설정 확인</a>
  <a class="manual-goto is-sub" href="/admin/notices" target="_blank">공지 몰 확인</a>
</div>

---

## 관련 매뉴얼

<div class="manual-goto-bar">
  <span class="manual-goto-label">함께 보면 좋은 문서</span>
  <a class="manual-goto is-sub" href="/manual/user/inquiries">1:1 문의</a>
  <a class="manual-goto is-sub" href="/manual/user/notices">공지사항</a>
  <a class="manual-goto is-sub" href="/manual/admin/inquiries">문의 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/notices">공지사항 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/settings">사이트 설정</a>
</div>
