# 검색 로그 (Search Logs)

## 1. 개요

- **URL:** `GET /admin/search-logs`  
- **관련 테이블:** `search_logs`, `users`  
- **컨트롤러:** `controllers/admin/dashboardController.js` (getSearchLogs)  
- **뷰:** `views/admin/search_logs.ejs`  

사용자가 상품 검색 시 기록된 검색 로그를 조회합니다. 기간 필터와 페이지네이션을 지원합니다.

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/search-logs` | getSearchLogs | 검색 로그 목록 |

---

## 3. 검색 로그 목록 (GET /admin/search-logs)

### 3.1 쿼리 파라미터

| name | 타입 | 설명 |
|------|------|------|
| page | number | 페이지 번호 (기본값 1) |
| start_date | string | 조회 시작일 (YYYY-MM-DD) |
| end_date | string | 조회 종료일 (YYYY-MM-DD) |

### 3.2 데이터 처리

- **페이지네이션:** 50건/페이지 (`pageSize = 50`)
- **조건:** `start_date`, `end_date`가 있으면 `DATE(sl.created_at)` 기준으로 필터링
- **쿼리:** `search_logs` LEFT JOIN `users` (user_email, user_name)
- **정렬:** `created_at DESC`

### 3.3 뷰 전달 변수

| 변수 | 설명 |
|------|------|
| logs | 검색 로그 배열 (id, keyword, result_count, created_at, user_email, user_name) |
| pagination | { page, pageSize, totalCount, totalPages } |
| filters | { startDate, endDate } |
| title | '검색 로그' |

---

## 4. DB 스키마 (search_logs)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK | 검색 로그 ID |
| user_id | INT FK NULL | 검색한 사용자 ID (비회원이면 NULL) |
| keyword | VARCHAR(255) | 검색어 |
| result_count | INT | 검색 결과 상품 개수 |
| created_at | TIMESTAMP | 검색 일시 |

---

*Last Updated: 2026-02-07*
