# 솔루션 개요

이 프로그램은 **쇼핑몰 하나를 운영하기 위한 것이 아니라, 몰이 필요한 사용자에게 몰을 만들어 주는 "몰 빌더"** 입니다. 목표는 운영이 아니라 **몰을 쉽게 찍어내는 것**이라, 만들고 → 확인하고 → 지우고 → 다시 만드는 반복이 정상 흐름입니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">바로 이동</span>
  <a class="manual-goto" href="/admin/malls" target="_blank">몰 리스트 관리 열기</a>
  <a class="manual-goto is-sub" href="/manual/mall_builder/create_mall">몰 만들기부터 시작</a>
</div>

---

## 알아 둘 규칙 네 가지

| 규칙 | 뜻 |
|------|-----|
| **멀티몰** | 하나의 앱 안에 몰 여러 개를 정의합니다. 각 몰은 고유한 **코드**를 가집니다. |
| **접속 주소** | 스토어프론트는 `/?mall=<코드>` 로 엽니다. 기본몰은 `/` 로 바로 열립니다. |
| **몰마다 다른 것** | 상품·메뉴·테마·홈 화면·배너는 몰별로 따로 저장됩니다. |
| **전 몰 공용** | **카테고리·브랜드는 공용 마스터 한 벌**입니다. 다만 각 몰에는 그 몰에 상품이 있는 것만 노출되어 결과적으로 몰마다 다른 매장이 됩니다. |

> **기본몰(is_default)은 항상 하나 존재하며 삭제·비활성할 수 없습니다.** 몰을 특정하지 않았을 때의 폴백이기 때문입니다.

화면에 보이는 건강식품관·종합관 같은 몰도 운영 데이터가 아니라 **빌더가 만들어 낸 예시 몰**입니다.

<div class="manual-goto-bar">
  <span class="manual-goto-label">관련 매뉴얼</span>
  <a class="manual-goto" href="/manual/mall_builder/create_mall">1. 몰 만들기</a>
  <a class="manual-goto is-sub" href="/manual/admin/malls">몰 리스트 관리 (관리자)</a>
</div>
