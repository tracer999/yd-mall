# 상품

## 1. 개요

- **컨트롤러:** `controllers/productController.js`
- **뷰:** `views/user/products/list.ejs`, `views/user/products/detail.ejs`

상품 목록(전체/카테고리별), 상세(ID·slug), 좋아요 토글을 제공합니다.

---

## 2. 상품 목록

### 2.1 URL

- `GET /products` — 전체 상품
- `GET /products/category/:categoryId` — 카테고리별 상품

### 2.2 쿼리 파라미터

| name | 설명 | 기본값 |
|------|------|--------|
| sort | new, best, price_asc, price_desc | new |

### 2.3 처리

- **상태:** `status IN ('ON','OFF','SOLD_OUT','COMING_SOON')` 인 상품만 노출.
- **카테고리:**  
  - `categoryId`가 있으면 categories에서 해당 카테고리 조회.  
  - type이 THEME이면 `theme_category_id = ?` 또는 `product_themes` N:M 조건으로 필터.  
  - NORMAL이면 `category_id = ?`로 필터.  
  - 해당 카테고리의 CATEGORY 타입 배너 1건을 `categoryBanner`로 조회.
- **정렬:** sort에 따라 view_count DESC / price ASC / price DESC / created_at DESC 적용.
- **전달 변수:** title(카테고리명 또는 '전체상품'), products, categories, currentCategory, currentSort, currentUser, categoryBanner.

---

## 3. 상품 상세 (ID)

- **URL:** `GET /products/view/:id`
- **동작:** 해당 id 상품 조회. slug가 있으면 301 리다이렉트 → `/products/:slug`. 조회수 +1, 서브 이미지·좋아요 여부·리뷰 조회. SEO 메타·OG·JSON-LD 구성 후 `user/products/detail` 렌더.
- **없을 때:** `/products`로 리다이렉트.

---

## 4. 상품 상세 (slug)

- **URL:** `GET /products/:slug`
- **동작:** slug로 products에서 id 조회 후 `getDetail`에 id를 넘겨 동일 로직 실행. slug 없으면 `/products`로 리다이렉트.

---

## 5. 좋아요 토글

- **URL:** `POST /products/like/:id`
- **인증:** 로그인 필수. 비로그인 시 401 JSON.
- **동작:** likes 테이블에 이미 있으면 DELETE(liked: false), 없으면 INSERT(liked: true). JSON 응답 `{ success, liked }`.

---

## 6. 상세 페이지 전달 변수

title, product, isLiked, reviews, currentUser, seo(title, description, url, image, type, siteName, jsonLd), kakaoJsKey, stockError(재고 부족 시 쿼리로 전달).

---

*Last Updated: 2026-02-08*
