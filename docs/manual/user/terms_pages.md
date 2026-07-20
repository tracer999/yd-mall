# 약관 · 정책 · 회사소개 화면

쇼핑몰 하단(푸터)이나 회원가입·주문 화면의 링크로 연결되는 **읽기 전용 안내 화면**들입니다. 로그인 없이 누구나 볼 수 있습니다.

| 화면 | 주소 | 내용 |
|---|---|---|
| 이용약관 | `/terms` | 쇼핑몰 이용 시 적용되는 약관 전문 |
| 개인정보 처리방침 | `/privacy` | 개인정보 수집·이용·보관·파기 안내 |
| 회사 소개 | `/about` | 운영 회사 소개 |
| 이용안내 | `/guide` | 주문·결제 / 배송·물류 / 교환·반품 안내 |

여기서 주의할 점이 하나 있습니다. **`/terms`·`/privacy` 화면에 보이는 본문과, 회원가입 때 동의하는 약관 본문이 서로 다른 곳에서 옵니다.** 아래 표를 반드시 확인하세요.

---

## 이 화면은 관리자에서 이렇게 만들어집니다

| 고객 화면의 이 부분 | 관리자 어느 기능으로 만드나 | 비고 |
|---|---|---|
| `/terms` 의 이용약관 본문 | **사이트 설정**의 이용약관 항목 | 이 화면은 사이트 설정 값을 그대로 보여 줍니다 |
| `/privacy` 의 개인정보 처리방침 본문 | **사이트 설정**의 개인정보 처리방침 항목 | |
| **회원가입 · 재동의 화면**에 뜨는 약관 본문 | **약관/정책 관리**의 시행 중(활성) 버전 | 활성 버전이 없을 때만 사이트 설정 값으로 대체됩니다 |
| 약관이 바뀌었을 때 기존 회원에게 재동의를 받는 것 | 약관/정책 관리에서 **새 버전 생성 + 활성화** | 사이트 설정만 고치면 재동의가 발생하지 않습니다 |
| `/about` 의 회사 소개 본문 | 사이트 설정의 **회사 소개** | 비우면 기본 문구가 나옵니다 |
| 푸터의 회사명 · 대표자 · 사업자등록번호 · 통신판매업 신고번호 · 주소 · 연락처 | 사이트 설정의 사업자 정보 항목 | |
| `/guide` 의 카카오 상담 버튼 | 사이트 설정의 **카카오 채널 사용 + 채널 URL** | |
| 푸터에서 이 화면들로 가는 링크 | 메뉴 관리 / Header·Footer 설정 | |

<div class="manual-goto-bar">
  <span class="manual-goto-label">관리자에서 편집하기</span>
  <a class="manual-goto" href="/admin/policies" target="_blank">약관/정책 관리 (동의용 버전)</a>
  <a class="manual-goto" href="/admin/settings" target="_blank">사이트 설정 (표시용 본문 · 사업자 정보)</a>
  <a class="manual-goto is-sub" href="/admin/menus" target="_blank">메뉴 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/policies">약관/정책 관리 매뉴얼</a>
  <a class="manual-goto is-sub" href="/manual/admin/settings">사이트 설정 매뉴얼</a>
</div>

> **약관을 고쳐야 할 때는 두 곳을 함께 맞추세요.** 약관/정책 관리에서 새 버전을 활성화하면 **가입·재동의 화면**의 본문이 바뀌고, 사이트 설정을 고치면 **`/terms` 안내 화면**의 본문이 바뀝니다. 한쪽만 고치면 고객이 동의한 내용과 화면에 걸린 내용이 달라집니다.

> **새 약관 버전을 활성화하면 기존 회원 전원이 다음 로그인 때 재동의 화면을 봅니다.** 실제 내용이 바뀌었을 때만 새 버전을 만드세요.

---

## 안 보이거나 비어 있을 때

**"이용약관 화면이 비어 있거나 기본 문구만 나옵니다"**
사이트 설정의 이용약관 항목이 비어 있습니다. 약관/정책 관리에만 넣었다면 `/terms` 화면에는 반영되지 않습니다.

**"가입 화면에 '약관 내용이 등록되지 않았습니다'라고 나옵니다"**
약관/정책 관리에 **시행 중인 버전이 없습니다.** 이용약관과 개인정보 처리방침을 각각 하나씩 만들고 활성화하세요.

**"푸터의 사업자 정보가 비어 있습니다"**
사이트 설정의 회사명 · 대표자 · 사업자등록번호 · 통신판매업 신고번호 · 주소 항목을 채우세요.

**"회사 소개 화면이 기본 문구입니다"**
사이트 설정의 회사 소개 항목이 비어 있습니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">확인하러 가기</span>
  <a class="manual-goto is-sub" href="/admin/settings" target="_blank">사이트 설정 본문 확인</a>
  <a class="manual-goto is-sub" href="/admin/policies" target="_blank">약관 활성 여부 확인</a>
</div>

---

## 관련 매뉴얼

<div class="manual-goto-bar">
  <span class="manual-goto-label">함께 보면 좋은 문서</span>
  <a class="manual-goto is-sub" href="/manual/user/auth">로그인 · 회원가입</a>
  <a class="manual-goto is-sub" href="/manual/admin/policies">약관/정책 관리</a>
  <a class="manual-goto is-sub" href="/manual/admin/settings">사이트 설정</a>
  <a class="manual-goto is-sub" href="/manual/admin/header">Header 설정</a>
</div>
