# 대시보드 (Dashboard)

## 1. 개요

- **URL:** `GET /admin`  
- **컨트롤러:** `controllers/admin/dashboardController.js`  
- **뷰:** `views/admin/dashboard.ejs` (레이아웃: `layouts/admin_layout`)  
- **관련 테이블:** `users`, `products`, `inquiries`, `visitor_logs`, `search_logs`

관리자 로그인 후 가장 먼저 보이는 요약 페이지입니다.

---

## 2. UI 구성 및 데이터 소스

### 2.1 통계 카드 (상단 4개)

| 카드 | 데이터 소스 | SQL (개념) |
|------|-------------|------------|
| 회원 수 | `users` | `SELECT COUNT(*) FROM users` |
| 총 상품 | `products` | `SELECT COUNT(*) FROM products` |
| 새 문의 | 미답변 문의 건수 | `SELECT COUNT(*) FROM inquiries WHERE is_answered = 0` |
| 오늘 방문 | 당일 방문자 수 (IP 기준) | `SELECT COUNT(DISTINCT ip_address) FROM visitor_logs WHERE visited_date = CURRENT_DATE` |

- **오늘 방문:** 서버 날짜 기준 `visited_date`가 오늘인 로그만 사용하며, IP 중복 제거 후 건수 표시  
- **뷰 전달 변수:** `stats.userCount`, `stats.productCount`, `stats.inquiryCount`, `stats.visitorCount`

### 2.2 최근 가입 회원 목록

- **데이터:** `users` 테이블에서 `ORDER BY created_at DESC LIMIT 5`  
- **표시 항목:** 이름(`name`), 이메일(`email`), 가입일(`created_at`)  
- **뷰 전달 변수:** `recentUsers` (배열)

### 2.3 검색 통계

- **쿼리 파라미터:** `search_range` (기본 `30d`) — `24h`, `7d`, `30d`  
- **인기 검색어 (topSearchKeywords):**  
  - `search_logs`에서 기간 내 검색어별 집계 (keyword, search_count, last_searched_at, zero_result_count)  
  - `ORDER BY search_count DESC, last_searched_at DESC LIMIT 10`  
- **검색 결과 없음 키워드 (zeroResultKeywords):**  
  - `result_count = 0`인 검색만 집계, `ORDER BY last_searched_at DESC LIMIT 10`  
- **뷰 전달 변수:**  
  - `topSearchKeywords`, `zeroResultKeywords`  
  - `searchStatsRange`: `{ value, label }` (예: `{ value: '30d', label: '최근 30일' }`)

---

## 3. 컨트롤러 로직 요약

1. `search_range` 쿼리 파라미터에 따라 rangeFilter, searchRangeLabel 설정 (24h/7d/30d)  
2. 4개의 COUNT 쿼리 실행 (users, products, inquiries 미답변, visitor_logs 오늘)  
3. 최근 가입 회원 5명 조회  
4. search_logs 기반 topSearchKeywords, zeroResultKeywords 조회  
5. `res.render('admin/dashboard', { layout, title, stats, recentUsers, topSearchKeywords, zeroResultKeywords, searchStatsRange })`  
6. 예외 시 `res.status(500).send('Server Error')`

---

## 4. 관련 링크

- 검색 로그 상세 목록: [search_logs.md](./search_logs.md) (`GET /admin/search-logs`)

---

*Last Updated: 2026-02-07*
