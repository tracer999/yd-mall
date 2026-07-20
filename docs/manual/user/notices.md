# 공지사항

운영자가 올린 **공지를 고객이 읽는 화면**입니다. 주소는 `/notices` 이며, 로그인 없이 누구나 볼 수 있습니다.

이벤트 안내, 배송·결제 정책 변경, 휴무일, 점검 안내 등이 올라옵니다. **중요도가 높은 공지가 목록 맨 위**로 올라오고, 같은 중요도 안에서는 최신순으로 정렬됩니다.

공지사항은 **몰마다 따로** 저장됩니다. 고객이 지금 보고 있는 몰의 공지만 나오며, 다른 몰에 올린 공지는 섞이지 않습니다.

---

## 이 화면에 무엇이 보이나

- **목록**(`/notices`) — 제목 · 작성일 · 중요 표시
- **상세**(`/notices/:id`) — 제목 · 작성일 · 조회수 · 본문(글 · 이미지 · 링크)

공지를 열 때마다 **조회수가 1씩 올라갑니다.** 고객센터(`/cs`) 화면 아래에도 **최근 공지 5건**이 함께 표시됩니다.

---

## 이 화면은 관리자에서 이렇게 만들어집니다

| 고객 화면의 이 부분 | 관리자 어느 기능으로 만드나 | 비고 |
|---|---|---|
| 공지 제목 · 본문 | 공지사항 관리의 **등록 / 수정** | 본문에 이미지를 올려 넣을 수 있습니다 |
| 목록 **맨 위에 고정**되는 공지 | 공지사항 관리의 **중요도** | 중요도가 높을수록 위로 올라옵니다 |
| 공지가 보이는 몰 | 등록 당시 **편집 중이던 몰** | 몰을 잘못 고르면 그 몰에서만 보입니다 |
| 조회수 | 고객이 열 때마다 자동 증가 | 관리자가 직접 넣지 않습니다 |
| 고객센터 화면의 공지 5건 | 같은 공지사항 관리 데이터 | 별도로 등록하지 않습니다 |
| 공지사항 메뉴 노출 | 메뉴 관리 / 기능 메뉴 | |

<div class="manual-goto-bar">
  <span class="manual-goto-label">관리자에서 편집하기</span>
  <a class="manual-goto" href="/admin/notices" target="_blank">공지사항 관리</a>
  <a class="manual-goto is-sub" href="/admin/menus" target="_blank">메뉴 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/notices">공지사항 관리 매뉴얼</a>
</div>

> **공지사항은 몰 단위로 저장됩니다.** 관리자 화면 위의 **편집 중인 몰**이 A몰인데 B몰 고객에게 보여 줄 생각이었다면, 저장해도 B몰에는 나타나지 않습니다. 등록 전에 편집 몰을 반드시 확인하세요.

> **공지에는 예약 발행 기능이 없습니다.** 등록하는 즉시 고객에게 보입니다. 미리 써 두려면 발행일에 맞춰 직접 등록하세요.

---

## 안 보이거나 비어 있을 때

**"공지를 올렸는데 고객 화면에 없습니다"**
가장 흔한 원인은 **다른 몰에 등록한 경우**입니다. 공지사항 관리에서 편집 중인 몰을 바꿔 다시 확인하세요.

**"공지 순서가 원하는 대로 안 나옵니다"**
정렬은 **중요도 → 최신순** 고정입니다. 위로 올리고 싶은 공지는 중요도를 높이세요. 수동으로 순서를 끌어 옮기는 기능은 없습니다.

**"공지 본문의 서식이 깨져 보입니다"**
편집기에서 다른 곳의 내용을 그대로 붙여 넣으면 불필요한 서식이 함께 들어옵니다. 텍스트만 붙여 넣고 편집기에서 다시 꾸미는 편이 안전합니다.

**"고객 화면에 공지사항 메뉴가 없습니다"**
메뉴 관리에서 공지사항 메뉴가 꺼져 있습니다. 고객센터 화면을 통해서도 들어갈 수 있습니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">확인하러 가기</span>
  <a class="manual-goto is-sub" href="/admin/notices" target="_blank">편집 몰 · 중요도 확인</a>
  <a class="manual-goto is-sub" href="/admin/menus" target="_blank">메뉴 노출 확인</a>
</div>

---

## 관련 매뉴얼

<div class="manual-goto-bar">
  <span class="manual-goto-label">함께 보면 좋은 문서</span>
  <a class="manual-goto is-sub" href="/manual/user/cs">고객센터</a>
  <a class="manual-goto is-sub" href="/manual/admin/notices">공지사항 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/malls">몰 리스트 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/menus">메뉴 관리</a>
</div>
