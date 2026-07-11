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
2. 2자 이상이면 `products`(+ 브랜드 카테고리 LEFT JOIN)에서 다음 컬럼에 대해 `LIKE %q%` 검색: `p.name`, `p.slug`, `p.provider`, `bc.name`(브랜드 카테고리명), `p.description`, `p.ai_recommendation_content`.
3. 필터:
   - **몰 스코프** `p.mall_id = req.mallId`(기본 1). 검색은 카테고리 필터가 없어 몰 필터가 필수입니다.
   - **상태** `p.status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')`.
   - **노출** 비로그인은 `visibility='PUBLIC'`, 로그인은 `PUBLIC` 또는 `MEMBER_ONLY`.
4. 정렬은 `FIELD(p.status,'ON','RESTOCK','COMING_SOON','SOLD_OUT','OFF')` → `p.created_at DESC`, LIMIT 50. 각 행에는 `review_count`(리뷰 수 상관 서브쿼리)와 `provider = COALESCE(bc.name, p.provider)`, `category_name`·`category_type` 이 함께 실립니다.
5. 조회 결과 건수를 `search_logs` 테이블에 INSERT (`user_id`: 로그인 시 req.user.id, 아니면 null, `keyword`, `result_count`). INSERT 실패 시 로그만 남기고 계속 진행.
6. 뷰에 `title`, `query`(원본 q), `products`, `total`, `currentUser`, `seo` 전달.

---

## 4. 전달 변수

| 변수 | 설명 |
|------|------|
| title | '상품 검색' |
| query | req.query.q 원본 값 |
| products | 검색 결과 상품 배열 (최대 50건) |
| total | 결과 건수 |
| currentUser | req.user |
| seo | 검색 페이지 SEO. `robots: 'noindex,follow'` 강제 |

---

*Last Updated: 2026-07-11*
