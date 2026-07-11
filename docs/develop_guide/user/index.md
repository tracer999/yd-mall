# User 시스템 인수인계 문서 목록

사용자 영역(루트 `/`, 레이아웃 `main_layout`)의 기능 및 기술 명세 문서입니다. 인수인계 시 각 메뉴별 상세 문서를 참고하세요.

---

## 전체 라우트 요약

| 구분 | URL | 메서드 | 설명 | 문서 |
|------|-----|--------|------|------|
| **홈** | `/` | GET | 메인 홈 | [home.md](./home.md) |
| **검색** | `/search` | GET | 상품 검색 | [search.md](./search.md) |
| **기타** | `/design-guide/user` | GET | 사용자 디자인 가이드 예시 | (개발용) |
| **약관/정책** | `/terms` | GET | 이용약관 | [terms_pages.md](./terms_pages.md) |
| | `/privacy` | GET | 개인정보 처리방침 | [terms_pages.md](./terms_pages.md) |
| | `/about` | GET | 회사 소개 | [terms_pages.md](./terms_pages.md) |
| **상품** | `/products` | GET | 상품 목록 | [products.md](./products.md) |
| | `/products/category/:categoryId` | GET | 카테고리별 상품 목록 | [products.md](./products.md) |
| | `/products/view/:id` | GET | 상품 상세 (ID) | [products.md](./products.md) |
| | `/products/:slug` | GET | 상품 상세 (slug, SEO) | [products.md](./products.md) |
| | `/products/like/:id` | POST | 좋아요 토글 (AJAX) | [products.md](./products.md) |
| **공지** | `/notices` | GET | 공지사항 목록 | [notices.md](./notices.md) |
| | `/notices/:id` | GET | 공지사항 상세 | [notices.md](./notices.md) |
| **문의** | `/inquiries` | GET | 1:1 문의 목록 | [inquiries.md](./inquiries.md) |
| | `/inquiries/write` | GET | 문의 작성 폼 | [inquiries.md](./inquiries.md) |
| | `/inquiries/write` | POST | 문의 등록 | [inquiries.md](./inquiries.md) |
| | `/inquiries/:id` | GET | 문의 상세 | [inquiries.md](./inquiries.md) |
| **인증** | `/auth/login` | GET | 로그인 | [auth.md](./auth.md) |
| | `/auth/signup` | GET | 회원가입 | [auth.md](./auth.md) |
| | `/auth/google` | GET | Google OAuth | [auth.md](./auth.md) |
| | `/auth/google/callback` | GET | Google 콜백 | [auth.md](./auth.md) |
| | `/auth/kakao` | GET | Kakao OAuth | [auth.md](./auth.md) |
| | `/auth/kakao/callback` | GET | Kakao 콜백 | [auth.md](./auth.md) |
| | `/auth/signup-finish` | GET | 추가 정보 입력 폼 | [auth.md](./auth.md) |
| | `/auth/signup-finish` | POST | 추가 정보 저장 | [auth.md](./auth.md) |
| | `/auth/signup-success` | GET | 가입 완료 | [auth.md](./auth.md) |
| | `/auth/terms-update` | GET | 약관 재동의 폼 | [auth.md](./auth.md) |
| | `/auth/terms-update` | POST | 약관 재동의 처리 | [auth.md](./auth.md) |
| | `/auth/logout` | GET | 로그아웃 | [auth.md](./auth.md) |
| **장바구니** | `/cart` | GET | 장바구니 목록 | [cart.md](./cart.md) |
| | `/cart/add` | POST | 장바구니 추가 | [cart.md](./cart.md) |
| | `/cart/remove/:id` | POST | 장바구니 항목 삭제 | [cart.md](./cart.md) |
| | `/cart/update/:id` | POST | 수량 변경 | [cart.md](./cart.md) |
| | `/cart/checkout` | POST | 전체 구매(체크아웃 이동) | [cart.md](./cart.md) |
| | `/cart/complete` | GET | 장바구니 주문 완료 | [cart.md](./cart.md) |
| **주문/결제** | `/checkout/choose` | GET | 구매 방법 선택 | [checkout.md](./checkout.md) |
| | `/checkout` | GET | 주문/결제 폼 | [checkout.md](./checkout.md) |
| | `/checkout` | POST | 주문 생성 | [checkout.md](./checkout.md) |
| | `/checkout/apply-coupon-code` | POST | 쿠폰 코드 적용 | [checkout.md](./checkout.md) |
| | `/checkout/pay/:orderId` | GET | 결제창 | [checkout.md](./checkout.md) |
| | `/checkout/success` | GET | 결제 성공 콜백 | [checkout.md](./checkout.md) |
| | `/checkout/fail` | GET | 결제 실패 | [checkout.md](./checkout.md) |
| | `/checkout/complete` | GET | 주문 완료 | [checkout.md](./checkout.md) |

---

## 목차 (상세 문서)

1. [시스템 개요 및 아키텍처](./overview.md)  
   라우트 구조, 미들웨어, 컨트롤러·뷰 매핑

2. [사용자 레이아웃 (main_layout)](./layout.md)  
   공통 레이아웃, 헤더/푸터, 브랜드 테마, 공통 변수

3. [홈](./home.md)  
   메인 배너, 카테고리별 상품, 신규/베스트 상품

4. [검색](./search.md)  
   상품 검색, 검색 로그

5. [상품](./products.md)  
   상품 목록·상세, 카테고리, slug, 좋아요

6. [약관/정책/소개](./terms_pages.md)  
   이용약관, 개인정보 처리방침, 회사 소개

7. [공지사항](./notices.md)  
   공지 목록·상세

8. [1:1 문의](./inquiries.md)  
   문의 목록·작성·상세

9. [인증](./auth.md)  
   로그인, 회원가입, OAuth(Google/Kakao), 약관 재동의, 로그아웃

10. [장바구니](./cart.md)  
    장바구니 CRUD, 주문 완료

11. [주문/결제](./checkout.md)  
    구매 방법 선택, 주문 폼, 결제, 성공/실패/완료

---

*Last Updated: 2026-02-08*
