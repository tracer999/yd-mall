# 1:1 문의

고객이 **쇼핑몰에 직접 질문을 보내는** 화면입니다. 주소는 `/inquiries` 이며, **로그인한 회원만** 사용할 수 있습니다.

문의는 **제목과 내용** 두 가지만 받는 단순한 형태입니다. 파일 첨부나 문의 유형 선택은 없습니다. 등록하면 관리자 **문의 관리**로 들어가고, 담당자가 답변을 달면 고객이 그 답변을 볼 수 있습니다.

고객은 **자기가 쓴 문의만** 조회할 수 있습니다. 다른 사람의 문의는 목록에도 상세에도 나오지 않습니다.

---

## 이 화면에 무엇이 보이나

- **문의 목록**(`/inquiries`) — 내가 쓴 문의가 최신순으로 나옵니다
- **문의 작성**(`/inquiries/write`) — 제목 / 내용
- **문의 상세**(`/inquiries/:id`) — 내가 쓴 내용과 담당자 답변

같은 문의 목록을 **마이페이지 > 1:1 문의**(`/mypage/activities`)에서도 볼 수 있고, 고객센터 왼쪽 메뉴의 **1:1 문의내역** 링크도 그쪽으로 연결됩니다.

문의는 **고객이 문의를 넣은 그 몰에 기록**됩니다. 여러 몰을 운영한다면 관리자에서 몰별로 나눠 볼 수 있습니다.

---

## 이 화면은 관리자에서 이렇게 만들어집니다

| 고객 화면의 이 부분 | 관리자 어느 기능으로 만드나 | 비고 |
|---|---|---|
| 고객이 등록한 문의가 도착하는 곳 | 문의 관리 | 목록 → 상세 → 답변 등록 순으로 처리합니다 |
| 문의 상세에 표시되는 **답변 내용** | 문의 관리의 **답변 등록** | 답변을 달기 전까지 고객 화면에는 답변란이 비어 있습니다 |
| 목록의 **답변완료 / 답변대기** 상태 | 답변 등록 여부에 따라 자동으로 바뀝니다 | 별도로 상태를 지정하는 곳은 없습니다 |
| 문의가 어느 몰 것인지 | 고객이 문의를 넣은 몰이 자동 기록됨 | 관리자에서 몰별 필터로 조회합니다 |
| 문의 메뉴가 고객 화면에 보이는지 | 메뉴 관리 / 기능 메뉴 | 메뉴를 끄면 진입 경로가 사라집니다 |

<div class="manual-goto-bar">
  <span class="manual-goto-label">관리자에서 편집하기</span>
  <a class="manual-goto" href="/admin/inquiries" target="_blank">문의 관리</a>
  <a class="manual-goto is-sub" href="/admin/menus" target="_blank">메뉴 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/inquiries">문의 관리 매뉴얼</a>
</div>

> **답변을 등록해도 고객에게 알림이 자동으로 가지 않습니다.** 고객이 직접 문의 화면에 들어와 확인해야 합니다. 급한 건은 문의에 적힌 연락처로 직접 연락하세요.

---

## 안 보이거나 비어 있을 때

**"1:1 문의를 눌렀더니 로그인 화면이 나옵니다"**
정상입니다. 문의는 회원 전용입니다.

**"관리자 문의 관리에 문의가 하나도 없습니다"**
① 실제로 들어온 문의가 없거나, ② **다른 몰**로 필터가 걸려 있습니다. 몰 필터를 확인하세요.

**"고객이 답변이 안 보인다고 합니다"**
문의 관리에서 그 문의에 답변을 **등록**했는지 확인하세요. 저장하지 않으면 고객 화면에는 아무것도 나타나지 않습니다.

**"고객 화면에 1:1 문의 메뉴가 없습니다"**
메뉴 관리에서 해당 메뉴가 꺼져 있습니다. 고객센터 화면에도 1:1 문의하기 버튼이 있으니 그쪽 경로도 함께 확인하세요.

<div class="manual-goto-bar">
  <span class="manual-goto-label">확인하러 가기</span>
  <a class="manual-goto is-sub" href="/admin/inquiries" target="_blank">문의 · 답변 확인</a>
  <a class="manual-goto is-sub" href="/admin/menus" target="_blank">메뉴 노출 확인</a>
</div>

---

## 관련 매뉴얼

<div class="manual-goto-bar">
  <span class="manual-goto-label">함께 보면 좋은 문서</span>
  <a class="manual-goto is-sub" href="/manual/user/cs">고객센터</a>
  <a class="manual-goto is-sub" href="/manual/user/mypage">마이페이지</a>
  <a class="manual-goto is-sub" href="/manual/admin/inquiries">문의 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/menus">메뉴 관리</a>
</div>
