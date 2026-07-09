# 검색

## 1. 개요

- **URL:** `GET /search`
- **컨트롤러:** `controllers/productController.js` → `searchPage`
- **뷰:** `views/user/search.ejs`

쿼리 파라미터 `q`로 상품을 검색하고, 검색 로그를 저장합니다.

---

## 2. 쿼리 파라미터

| name | 타입 | 필수 | 설명 |
|------|------|------|------|
| q | string | - | 검색어. 앞뒤 공백 제거 후 2자 이상일 때만 DB 검색 수행 |

---

## 3. 처리 흐름

1. `req.query.q`를 읽어 trim한 값이 2자 미만이면 검색 없이 `products = []`, `total = 0`으로 뷰 렌더.
2. 2자 이상이면 `products` 테이블에서 다음 컬럼에 대해 `LIKE %q%` 검색: `name`, `slug`, `provider`, `description`, `ai_recommendation_content`. `created_at DESC` 정렬, LIMIT 50.
3. 조회 결과 건수를 `search_logs` 테이블에 INSERT (`user_id`: 로그인 시 req.user.id, 아니면 null, `keyword`, `result_count`). INSERT 실패 시 로그만 남기고 계속 진행.
4. 뷰에 `title`, `query`(원본 q), `products`, `total`, `currentUser` 전달.

---

## 4. 전달 변수

| 변수 | 설명 |
|------|------|
| title | '상품 검색' |
| query | req.query.q 원본 값 |
| products | 검색 결과 상품 배열 (최대 50건) |
| total | 결과 건수 |
| currentUser | req.user |

---

*Last Updated: 2026-02-08*
