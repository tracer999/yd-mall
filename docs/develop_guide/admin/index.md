# Admin 시스템 인수인계 문서 목록

관리자 시스템(`/admin`)의 기능 및 기술 명세 문서입니다. 인수인계 시 각 메뉴별 상세 문서를 참고하세요.

---

## 전체 라우트 요약

| 구분 | URL | 메서드 | 설명 | 문서 |
|------|-----|--------|------|------|
| **인증** | `/admin/login` | GET | 로그인 폼 | [auth.md](./auth.md) |
| | `/admin/login` | POST | 로그인 처리 | [auth.md](./auth.md) |
| | `/admin/logout` | GET | 로그아웃 | [auth.md](./auth.md) |
| **대시보드** | `/admin` | GET | 대시보드 | [dashboard.md](./dashboard.md) |
| | `/admin/search-logs` | GET | 검색 로그 목록 | [search_logs.md](./search_logs.md) |
| **카테고리** | `/admin/categories` | GET | 카테고리 목록 | [categories.md](./categories.md) |
| | `/admin/categories/add` | POST | 카테고리 추가 | [categories.md](./categories.md) |
| | `/admin/categories/edit` | POST | 카테고리 수정 | [categories.md](./categories.md) |
| | `/admin/categories/delete` | POST | 카테고리 삭제 | [categories.md](./categories.md) |
| **상품** | `/admin/products` | GET | 상품 목록 | [products.md](./products.md) |
| | `/admin/products/add` | GET | 상품 등록 폼 | [products.md](./products.md) |
| | `/admin/products/add` | POST | 상품 등록 처리 | [products.md](./products.md) |
| | `/admin/products/detail/:id` | GET | 상품 상세 조회 | [products.md](./products.md) |
| | `/admin/products/edit/:id` | GET | 상품 수정 폼 | [products.md](./products.md) |
| | `/admin/products/edit` | POST | 상품 수정 처리 | [products.md](./products.md) |
| | `/admin/products/delete` | POST | 상품 삭제 | [products.md](./products.md) |
| | `/admin/products/product-image-upload` | POST | 이미지 업로드 (TinyMCE/드래그용) | [products.md](./products.md) |
| | `/admin/products/generate-ai-recommendation` | POST | AI 추천 문구 생성 | [products.md](./products.md) |
| | `/admin/products/status/update` | POST | 판매 상태 일괄 변경 | [products.md](./products.md) |
| | `/admin/products/seo/view/:id` | GET | 상품 SEO 미리보기 | [products.md](./products.md) |
| **배너** | `/admin/banners` | GET | 배너 목록 | [banners.md](./banners.md) |
| | `/admin/banners/add` | GET | 배너 등록 폼 | [banners.md](./banners.md) |
| | `/admin/banners/add` | POST | 배너 등록 처리 | [banners.md](./banners.md) |
| | `/admin/banners/edit/:id` | GET | 배너 수정 폼 | [banners.md](./banners.md) |
| | `/admin/banners/edit/:id` | POST | 배너 수정 처리 | [banners.md](./banners.md) |
| | `/admin/banners/delete` | POST | 배너 삭제 | [banners.md](./banners.md) |
| **회원** | `/admin/users` | GET | 회원 목록 | [users.md](./users.md) |
| | `/admin/users/:id` | GET | 회원 상세 | [users.md](./users.md) |
| | `/admin/users/toggle-active/:id` | POST | 회원 활성/비활성 토글 | [users.md](./users.md) |
| | `/admin/users/delete/:id` | POST | 회원 삭제 | [users.md](./users.md) |
| **판매/주문** | `/admin/sales` | GET | 주문 목록 | [sales.md](./sales.md) |
| | `/admin/sales/:id` | GET | 주문 상세 | [sales.md](./sales.md) |
| | `/admin/sales/status` | POST | 주문 상태 변경 | [sales.md](./sales.md) |
| **배송** | `/admin/shipping` | GET | 배송 대상 목록 | [shipping.md](./shipping.md) |
| | `/admin/shipping/tracking` | POST | 송장 입력 | [shipping.md](./shipping.md) |
| **방문자** | `/admin/visitors/stats` | GET | 방문자 통계 | [visitors.md](./visitors.md) |
| **설정** | `/admin/settings` | GET | 사이트 설정 폼 | [settings.md](./settings.md) |
| | `/admin/settings` | POST | 회사 정보 저장 | [settings.md](./settings.md) |
| | `/admin/settings/system` | POST | 시스템 설정 저장 | [settings.md](./settings.md) |
| **운영자** | `/admin/operators` | GET | 운영자 목록 | [operators.md](./operators.md) |
| | `/admin/operators/form` | GET | 운영자 등록/수정 폼 | [operators.md](./operators.md) |
| | `/admin/operators/add` | POST | 운영자 등록 | [operators.md](./operators.md) |
| | `/admin/operators/edit` | POST | 운영자 수정 | [operators.md](./operators.md) |
| | `/admin/operators/delete` | POST | 운영자 삭제 | [operators.md](./operators.md) |
| **약관/정책** | `/admin/policies` | GET | 약관 버전 목록 | [policies.md](./policies.md) |
| | `/admin/policies/create` | GET | 새 약관 등록 폼 | [policies.md](./policies.md) |
| | `/admin/policies/create` | POST | 새 약관 등록 | [policies.md](./policies.md) |
| | `/admin/policies/:id` | GET | 약관 상세 보기 | [policies.md](./policies.md) |
| | `/admin/policies/:id/edit` | GET | 약관 수정 폼 | [policies.md](./policies.md) |
| | `/admin/policies/:id/edit` | POST | 약관 수정 처리 | [policies.md](./policies.md) |
| | `/admin/policies/:id/active` | POST | 해당 버전 활성화 | [policies.md](./policies.md) |
| **문의** | `/admin/inquiries` | GET | 문의 목록 | [inquiries.md](./inquiries.md) |
| | `/admin/inquiries/:id` | GET | 문의 상세 | [inquiries.md](./inquiries.md) |
| | `/admin/inquiries/:id/answer` | POST | 문의 답변 등록 | [inquiries.md](./inquiries.md) |
| **메뉴** | `/admin/menus` | GET | 관리자 메뉴 설정 | [menus.md](./menus.md) |
| | `/admin/menus/save` | POST | 메뉴 설정 저장 | [menus.md](./menus.md) |
| **업로드 (내부 API)** | `/admin/uploads/tinymce` | POST | TinyMCE 이미지 업로드 | [products.md](./products.md) |

---

## 목차 (상세 문서)

1. [시스템 개요 및 아키텍처](./overview.md)  
   인증 흐름, 미들웨어, 공통 로직, 라우트 구조

2. [관리자 로그인/로그아웃](./auth.md)  
   로그인 폼, 세션 저장, 로그아웃

3. [대시보드](./dashboard.md)  
   통계 카드, 최근 가입 회원, 검색 통계, 데이터 소스

4. [검색 로그](./search_logs.md)  
   검색 로그 목록, 기간 필터, 페이지네이션

5. [카테고리 관리](./categories.md)  
   카테고리 CRUD, 노출 순서

6. [상품 관리](./products.md)  
   상품 등록/수정/삭제, 이미지, 가격·재고·TinyMCE, AI 추천, SEO 미리보기

7. [배너 관리](./banners.md)  
   메인/카테고리/팝업 배너, 등록·수정·삭제, 기간 설정, 이미지 업로드

8. [회원 관리](./users.md)  
   회원 목록·상세, 활성/비활성 토글, 삭제

9. [주문 및 매출 관리](./sales.md)  
   주문 목록/상세, 주문 상태 변경

10. [배송 관리](./shipping.md)  
    배송 대상 목록, 송장 입력, 주문 상태 연동

11. [방문자 통계](./visitors.md)  
    기간별 방문자 집계, KST 변환, Chart.js

12. [사이트 설정](./settings.md)  
    회사 정보, 시스템 설정(TinyMCE, OpenAI, OAuth 등), 로고, 연락처

13. [운영자 관리](./operators.md)  
    운영자 계정 CRUD, 권한(role), bcrypt

14. [약관 및 정책 관리](./policies.md)  
    이용약관/개인정보 버전 관리, 상세·수정·활성화, site_settings 동기화

15. [문의 관리](./inquiries.md)  
    문의 목록/상세, 답변 등록

16. [관리자 메뉴](./menus.md)  
    admin_menus DB 기반 메뉴 순서·표시·권한 설정

---

*Last Updated: 2026-02-07*
