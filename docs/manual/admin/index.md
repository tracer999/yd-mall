# 관리자 사이트 운영 매뉴얼

이 매뉴얼은 **몰을 만든 뒤에 해야 하는 작업**을 **관리자 사이드바 메뉴 순서 그대로** 설명합니다. 개발 용어 없이, 각 메뉴가 무엇인지·어떻게 사용하는지를 안내합니다.

> **아직 몰을 만들지 않았다면** 먼저 [몰 빌더 가이드](/manual/mall_builder)를 보세요. 몰 등록 → 테마 선택까지가 그쪽 안내입니다. 이 매뉴얼은 **그 다음**부터입니다.

---

## 관리자 사이트 접속 방법

1. 웹 브라우저(Chrome, Edge, Safari 등)를 엽니다.
2. 쇼핑몰 주소 뒤에 **`/admin`** 을 붙여 접속합니다.
   - 예: 쇼핑몰이 `https://myshop.com` 이라면 → `https://myshop.com/admin`
3. **로그인** 화면이 나오면 관리자 아이디와 비밀번호를 입력한 뒤 로그인합니다.
4. 로그인에 성공하면 **대시보드**(요약 화면)로 이동합니다.

처음 설치 후에는 관리자 계정이 자동으로 만들어져 있을 수 있습니다. 비밀번호는 보안을 위해 반드시 변경해서 사용하세요.

---

## 관리자 화면 구성

- **왼쪽 메뉴(사이드바):** 기능들이 **12개 그룹**으로 묶여 있습니다. 그룹을 펼치면 하위 메뉴가 나옵니다.
- **상단:** 로고·사이트명, **편집 중인 몰 선택**, 로그아웃 등이 있습니다.
- **가운데 넓은 영역:** 선택한 메뉴의 내용(목록, 등록/수정 폼 등)이 표시됩니다.

메뉴 항목은 **권한**에 따라 보이는 것이 다를 수 있습니다. 최고 관리자만 보이는 메뉴도 있습니다. 볼 수 있는 하위 메뉴가 하나도 없으면 그룹 자체가 보이지 않습니다.

> ### ⚠️ 무엇을 하든 먼저 "편집 중인 몰"을 확인하세요
>
> 이 시스템은 여러 개의 쇼핑몰을 함께 운영합니다. 상품·메뉴·테마·배너·홈 화면은 **몰마다 따로** 저장되므로, 설정을 바꾸기 전에 상단에서 **지금 편집 중인 몰이 맞는지** 확인하세요. 가장 흔한 실수가 **엉뚱한 몰을 고쳐 놓는 것**입니다. 자세한 내용은 [몰 리스트 관리](/manual/admin/malls)를 보세요.
>
> 다만 **카테고리 · 브랜드 · 포인트 · 운영자 계정은 전 몰이 공유하는 전역 데이터**입니다. 한 몰에서 바꾸면 모든 몰에 함께 적용됩니다. (카테고리·브랜드는 각 몰에 상품이 있는 것만 노출되고 몰별 숨김만 개별 조절됩니다 — [카테고리 관리](/manual/admin/categories) 참고.)

---

## 몰을 만든 직후 해야 할 일 (권장 순서)

1. **[사이트 설정](/manual/admin/settings)** — 회사 정보·연락처·로고·색상을 내 몰에 맞게 바꿉니다.
2. **[약관/정책 관리](/manual/admin/policies)** — 이용약관·개인정보처리방침을 넣습니다.
3. **[디자인 스타일](/manual/admin/theme)** · **[Header 설정](/manual/admin/header)** — 디자인과 헤더를 다듬습니다.
4. **[카테고리 관리](/manual/admin/categories)** → **[상품 관리](/manual/admin/products)** — 실제 팔 것을 채웁니다.
5. **[배송비 정책](/manual/admin/shipping)** — 배송비를 정합니다. (안 하면 기본값으로 동작합니다.)
6. **[페이지 빌더](/manual/admin/page_builder)** — 홈 화면을 구성하고 **발행**합니다.
7. **[메뉴 관리](/manual/admin/menus)** — 고객에게 보여 줄 상단 메뉴를 켭니다.
8. **[운영자 관리](/manual/admin/operators)** — 함께 운영할 담당자 계정을 추가합니다.
9. 그 뒤로 **[쿠폰](/manual/admin/coupons)**, **[쇼핑특가](/manual/admin/deals)**, **[기획전](/manual/admin/exhibitions)** 등 프로모션을 운영합니다.

> **자주 겪는 일:** 메뉴를 켰는데 고객 화면에 안 보이는 경우가 있습니다. 대부분 **보여 줄 내용이 부족해서 자동으로 숨겨졌거나**, **상단 메뉴 최대 개수에 걸려 잘린 것**입니다. 원인과 확인 방법은 [메뉴 관리](/manual/admin/menus)를 참고하세요.

---

## 메뉴 한눈에 보기

아래 순서는 **실제 관리자 사이드바 순서**와 같습니다.

### 1. 쇼핑몰 관리
| 메뉴 | 설명 | 문서 |
|------|------|------|
| 몰 리스트 관리 | 몰 만들기·선택(전환)·삭제, 테마 프리셋 재적용 | [malls.md](/manual/admin/malls) |
| 사이트 설정 | 회사 정보, **색상·로고**, 결제·로그인 연동 | [settings.md](/manual/admin/settings) |
| 약관/정책 관리 | 이용약관·개인정보처리방침 버전 관리 | [policies.md](/manual/admin/policies) |
| Header 설정 | 헤더 레이아웃, 상단 메뉴 개수 | [header.md](/manual/admin/header) |
| 디자인 스타일 | **모서리·글꼴·간격** (색상 아님) | [theme.md](/manual/admin/theme) |
| 대시보드 | 회원 수·상품 수·문의·방문자 요약 | [dashboard.md](/manual/admin/dashboard) |

### 2. 외부몰 연동
| 메뉴 | 설명 | 문서 |
|------|------|------|
| 공급처/채널 연결 · 상품 가져오기 · 스마트스토어 등록 · 네이버 리소스 관리 등 | 외부 공급처에서 상품을 가져와 네이버 스마트스토어에 등록 | [sourcing.md](/manual/admin/sourcing) |

> ⚠️ 이 그룹은 **7개 화면 중 4개만 실제로 동작**합니다(공급처/채널 연결, 상품 가져오기, 가져온 상품, 네이버 리소스 관리). 나머지는 준비 중 안내만 나옵니다. 상태 표는 문서를 보세요.

### 3. 메뉴/카테고리 관리
| 메뉴 | 설명 | 문서 |
|------|------|------|
| 카테고리 | 상품 분류(최대 3단계) 추가·수정·삭제 | [categories.md](/manual/admin/categories) |
| 일반 메뉴 관리 | 고객 화면 상단 메뉴 켜기/끄기·이름·순서 | [menus.md](/manual/admin/menus) |
| 브랜드 관리 | 브랜드 소개·로고·집계 재계산 | [brands.md](/manual/admin/brands) |
| 시스템 메뉴 설정 | 헤더 유틸(검색·로그인·장바구니)·우측 레일 | [menus.md](/manual/admin/menus) |
| 커스텀 메뉴 관리 | 직접 만드는 메뉴 | [menus.md](/manual/admin/menus) |
| 메뉴 미리보기 | 고객 화면에 메뉴가 어떻게 보이는지 확인 | [menus.md](/manual/admin/menus) |

### 4. 페이지/전시 관리
| 메뉴 | 설명 | 문서 |
|------|------|------|
| 페이지 빌더 | 홈 화면을 섹션으로 조립·**발행** | [page_builder.md](/manual/admin/page_builder) |
| 배너 관리 | 메인 슬라이더(히어로)·톱바·카테고리·팝업 배너 | [banners.md](/manual/admin/banners) |
| 기획전 관리 | 기획전·전문관 등록 | [exhibitions.md](/manual/admin/exhibitions) |
| 공동구매 관리 | 기간·전용가 조건부 판매 | [group_buys.md](/manual/admin/group_buys) |
| 쇼핑라이브 관리 | 영상 방송 + 상품 판매 | [lives.md](/manual/admin/lives) |

### 5. 상품 관리
| 메뉴 | 설명 | 문서 |
|------|------|------|
| 상품 관리 | 상품 등록·수정·삭제, 가격·재고·이미지·옵션(SKU) | [products.md](/manual/admin/products) |
| 세트·기획상품 | 묶음·세트·선물세트·선택형세트 등 복합 상품 구성 | [derived-products.md](/manual/admin/derived-products) |
| 상품 그룹 관리 | 홈 섹션에 쓰이는 상품 묶음 | [page_builder.md](/manual/admin/page_builder) |
| 베스트/랭킹 관리 | 자동 순위 + MD 픽(수동 고정) | [best.md](/manual/admin/best) |
| 쇼핑특가 관리 · 특가 카테고리 | 기간·시간 한정 할인 (**결제 금액이 바뀜**) | [deals.md](/manual/admin/deals) |
| 상품 추천관리 | 추천 메뉴의 추천 그룹 | [recommend.md](/manual/admin/recommend) |
| 아울렛 관리 · 아울렛 카테고리 | 상시 할인 채널(이월·임박·리퍼브) | [outlet.md](/manual/admin/outlet) |

### 6. 프로모션 관리
| 메뉴 | 설명 | 문서 |
|------|------|------|
| 쿠폰 관리 | 쿠폰 발행·지급·사용 내역 | [coupons.md](/manual/admin/coupons) |
| 포인트 관리 | 포인트 지급·차감 (**몰 공용**) | [points.md](/manual/admin/points) |
| 이벤트 관리 | 응모형 이벤트 | [events.md](/manual/admin/events) |

### 7. 멤버십 관리
| 메뉴 | 설명 | 문서 |
|------|------|------|
| 멤버십 대시보드 | 등급 분포·평가 현황 요약 | [membership.md](/manual/admin/membership) |
| 등급 관리 | 등급·혜택(할인·적립·무료배송) 설정 | [membership.md](/manual/admin/membership) |
| 등급 평가 정책 | 승급 기준·기간·주기, 시뮬레이션·평가 실행 | [membership.md](/manual/admin/membership) |
| 회원 등급 현황 | 회원별 등급 조회·수동 변경·고정 | [membership.md](/manual/admin/membership) |
| 등급 변경·평가 이력 | 변경/평가 실행 기록 | [membership.md](/manual/admin/membership) |

### 8. B2B 관리
| 메뉴 | 설명 | 문서 |
|------|------|------|
| 기업회원 승인 | 사업자 신청 검토·승인·반려 (사업자등록증 대조) | [b2b.md](/manual/admin/b2b) |
| 거래처 등급 | 일반/우수/도매 등 거래처 분류 | [b2b.md](/manual/admin/b2b) |
| B2B 주문 | 기업 주문 승인·입금확인·세금계산서 (**결제 없이 접수**) | [b2b.md](/manual/admin/b2b) |
| 견적 관리 | 대량 주문 단가 협상·견적서 발행·주문 전환 | [b2b.md](/manual/admin/b2b) |
| 가격 정책 | 등급별·거래처별 전용 단가 (CSV 일괄 등록) | [b2b.md](/manual/admin/b2b) |
| B2B 설정 | 입금 기한·계좌 안내·세액 표기 등 공통 설정 | [b2b.md](/manual/admin/b2b) |

> 상품 하나하나의 **기업 전용가·최소 주문수량**은 이 그룹이 아니라 **상품 관리 > [B2B 판매]** 에서 넣습니다.
>
> ⚠️ 기업 주문을 **승인하면 입금 전이라도 재고가 빠집니다.** 미입금 주문은 B2B 주문 화면에서 회수해야 합니다.

### 9. 주문/회원 관리
| 메뉴 | 설명 | 문서 |
|------|------|------|
| 판매 관리 | 주문 목록·상세·상태 변경 | [sales.md](/manual/admin/sales) |
| 배송 관리 · 배송비 정책 | 송장 입력, 배송 완료 처리, 배송비 기준 | [shipping.md](/manual/admin/shipping) |
| 클레임 관리 | 취소·반품 승인/거절, 환불 | [claims.md](/manual/admin/claims) |
| 회원 관리 | 회원 목록·상세·비활성화 | [users.md](/manual/admin/users) |

### 10. 고객지원 관리
| 메뉴 | 설명 | 문서 |
|------|------|------|
| 문의 관리 | 고객 1:1 문의 답변 | [inquiries.md](/manual/admin/inquiries) |
| 고객센터 관리 | 자주 묻는 질문(FAQ) 관리 | [inquiries.md](/manual/admin/inquiries) |
| 공지사항 관리 | 공지 등록·수정 (몰마다 따로) | [notices.md](/manual/admin/notices) |

### 11. 시스템 관리
| 메뉴 | 설명 | 문서 |
|------|------|------|
| 운영자 관리 | 관리자 계정 추가·수정·삭제 | [operators.md](/manual/admin/operators) |
| 관리자 메뉴 관리 | **관리자 사이드바** 순서·권한 (고객 메뉴 아님) | [menus.md](/manual/admin/menus) |
| 시스템 설정 | 신상품 노출 기간 등 세부 설정 | [settings.md](/manual/admin/settings) |

### 12. 서비스 관리 (최고 관리자 전용)
| 메뉴 | 설명 | 문서 |
|------|------|------|
| 배포·포팅 관리 | 납품 고객 명부 | [service.md](/manual/admin/service) |
| 등급별 기능 설정 | 판매 등급별 기능 한도 | [service.md](/manual/admin/service) |

### 통계 (사이드바에는 없고 대시보드에서 확인)
| 메뉴 | 설명 | 문서 |
|------|------|------|
| 방문자 통계 | 기간별 방문자 수·추이 | [visitors.md](/manual/admin/visitors) |
| 검색 로그 | 고객이 검색한 단어 | [search_logs.md](/manual/admin/search_logs) |
| GA4 연동 | 구글 애널리틱스 | [ga4.md](/manual/admin/ga4) |
