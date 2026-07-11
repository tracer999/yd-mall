# 운영 및 기타 관리 (Operation & Others) — 개요

상품·주문·배송 외에 쇼핑몰 운영에 필요한 부가 기능들의 **개요**입니다. 각 항목별 상세는 아래 문서를 참고하세요.

---

## 1. 카테고리 관리

- **URL:** `/admin/categories`  
- **기능:** 카테고리명, 노출 순서(display_order) CRUD  
- **상세 문서:** [categories.md](./categories.md)

---

## 2. 배너 관리

- **URL:** `/admin/banners`  
- **기능:** 메인 배너 / 카테고리 배너 / 팝업 배너 등록·수정·삭제, 이미지 업로드, 게시 기간(start_date, end_date), 노출 순서  
- **상세 문서:** [banners.md](./banners.md)

---

## 3. 회원 관리

- **URL:** `/admin/users`  
- **기능:** 회원 목록·상세 조회, 활성/비활성 토글, 회원 삭제  
- **상세 문서:** [users.md](./users.md)

---

## 4. 사이트 설정

- **URL:** `/admin/settings`  
- **탭 구조:** `?tab=company`(회사 정보), `?tab=system`(시스템 설정)  
- **회사 정보:** 회사명, 로고, 사업자번호, 주소, 연락처, 슬로건, SNS 링크 등 site_settings(id=1) 관리  
- **시스템 설정:** TinyMCE API Key, OpenAI API Key, 도메인, OAuth(Google/Kakao) 설정 등 system_settings 테이블 관리  
- **상세 문서:** [settings.md](./settings.md)

---

## 5. 운영자 관리

- **URL:** `/admin/operators`  
- **접근:** super_admin 또는 admin 역할만 가능 (requireSuperAdmin)  
- **기능:** 관리자 계정 등록·수정·삭제, 비밀번호 bcrypt, 역할(role)  
- **상세 문서:** [operators.md](./operators.md)

---

## 6. 약관 및 정책 관리

- **URL:** `/admin/policies`  
- **기능:** 이용약관(TERMS)·개인정보처리방침(PRIVACY) 버전 관리, 상세 보기·수정·활성화, site_settings 동기화  
- **상세 문서:** [policies.md](./policies.md)

---

## 7. 문의 관리

- **URL:** `/admin/inquiries`  
- **기능:** 사용자 1:1 문의 목록·상세 조회, 답변 등록 (is_answered, answered_at 갱신)  
- **상세 문서:** [inquiries.md](./inquiries.md)

---

## 8. 검색 로그

- **URL:** `/admin/search-logs`  
- **기능:** 사용자 검색 로그 목록 조회, 기간 필터(start_date, end_date), 페이지네이션  
- **상세 문서:** [search_logs.md](./search_logs.md)

---

## 9. 관리자 메뉴

- **URL:** `/admin/menus`  
- **기능:** admin_menus 테이블 기반 관리자 사이드바 메뉴 순서·표시·권한(visible_roles) 설정  
- **상세 문서:** [menus.md](./menus.md)

---

*Last Updated: 2026-02-07*
