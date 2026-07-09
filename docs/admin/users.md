# 회원 관리 (Users)

## 1. 개요

- **Base URL:** `/admin/users`  
- **관련 테이블:** `users`, `policy_versions` (조인)  
- **컨트롤러:** `controllers/admin/userController.js`  
- **뷰:** `views/admin/users/list.ejs`, `detail.ejs`

회원 목록·상세 조회, 활성/비활성 토글, 회원 삭제를 제공합니다.

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/users` | getList | 회원 목록 (검색 가능) |
| GET | `/admin/users/:id` | getDetail | 회원 상세 |
| POST | `/admin/users/toggle-active/:id` | toggleActive | 활성/비활성 토글 |
| POST | `/admin/users/delete/:id` | deleteUser | 회원 삭제 |

---

## 3. 목록 조회 (GET /admin/users)

- **쿼리 파라미터:** `q` (검색어, 이름/이메일/전화번호 LIKE)
- **쿼리:** `users` LEFT JOIN `policy_versions` (agreed_terms_id, agreed_privacy_id → terms_version, privacy_version), `ORDER BY created_at DESC`  
- **표시:** 이름, 이메일, 가입일, 로그인 정보, 약관 동의 버전 등  
- **뷰 전달:** `users`, `searchQuery`, `title: '회원 관리'`

---

## 4. 회원 상세 (GET /admin/users/:id)

- **쿼리:** users LEFT JOIN policy_versions (이용약관/개인정보 동의 버전)
- **없을 때:** 404
- **뷰 전달:** `user`, `title: '회원 상세 정보'`

---

## 5. 활성/비활성 토글 (POST /admin/users/toggle-active/:id)

- **동작:** `UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?`  
- **성공 시:** `/admin/users` 리다이렉트

---

## 6. 회원 삭제 (POST /admin/users/delete/:id)

- **동작:** `DELETE FROM users WHERE id = ?`  
- **성공 시:** `/admin/users` 리다이렉트

---

## 7. DB 스키마 (users, 참고)

| 컬럼 | 설명 |
|------|------|
| id | 사용자 ID |
| google_id, kakao_id | OAuth 식별자 |
| email | 이메일 (고유) |
| name | 이름 |
| phone | 전화번호 |
| picture | 프로필 이미지 URL |
| is_active | 활성 여부 (0/1) |
| marketing_agreed | 마케팅 수신 동의 |
| agreed_terms_id, agreed_privacy_id | 동의한 약관/개인정보 버전 FK |
| created_at, last_login | 가입일, 마지막 로그인 |

---

*Last Updated: 2026-02-07*
