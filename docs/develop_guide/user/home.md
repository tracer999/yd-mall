# 홈 (메인)

## 1. 개요

- **URL:** `GET /`
- **컨트롤러:** `controllers/mainController.js` → `getHome`
- **뷰:** `views/user/index.ejs`

메인 페이지에서 메인 배너, 카테고리별 섹션(배너+상품), 신규 상품, 베스트 상품을 노출합니다.

---

## 2. 전달 데이터

| 변수 | 타입 | 설명 |
|------|------|------|
| title | string | '홈' |
| banners | Array | 메인 상단 배너 목록 (MAIN 타입, 활성, display_order 순, 화면에는 최대 6개 노출) |
| newProducts | Array | 신규 상품 최대 12건 (created_at DESC) |
| bestProducts | Array | 베스트 상품 최대 12건 (view_count DESC) |
| categoriesWithProducts | Array | 일반 카테고리별로 상품 12건 + 카테고리 배너. 상품이 1건 이상인 카테고리만 포함 |

---

## 3. 데이터 소스

1. **메인 배너:** `banners` 테이블, `is_active = 1`, `banner_type = 'MAIN'`, `display_order ASC, id ASC`
2. **카테고리별 배너:** `banners` 테이블, `banner_type = 'CATEGORY'`, `display_order ASC` → category_id로 맵핑하여 각 카테고리 섹션에 사용
3. **일반 카테고리:** `categories` 테이블, `type = 'NORMAL'`, `display_order ASC`
4. **카테고리별 상품:** 각 NORMAL 카테고리마다 `products`에서 `category_id` 일치, `status IN ('ON','OFF','SOLD_OUT','COMING_SOON')`, `created_at DESC` LIMIT 12. 할인액 `discount_amount = original_price - price` 포함
5. **신규 상품:** 동일 status 조건, `created_at DESC` LIMIT 12
6. **베스트 상품:** 동일 status 조건, `view_count DESC` LIMIT 12

---

## 4. 에러 처리

- 쿼리 또는 처리 중 예외 시 `res.status(500).send('Server Error')` 반환.

---

*Last Updated: 2026-02-08*
