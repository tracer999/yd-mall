# 신상품 · 신규 입점 브랜드 재설계 개발 계획서

> **이 문서는 잔여 과제만 남긴 축약본입니다.** (정리: 2026-07-15)
> 완료 기능의 정본은 `docs/develop_guide/` (개발자) 와 `docs/manual/` (운영자) 입니다.

---

## 완료되어 이관된 항목

| 항목 | 이관된 문서 |
|---|---|
| `products.sale_start_date` · `categories.onboarded_at` 컬럼 | `docs/develop_guide/admin/products.md` |
| `new_product_days` · `new_brand_days` 설정 | `docs/develop_guide/admin/products.md` · `docs/manual/admin/products.md` |
| 신상품 판정 모듈 `services/catalog/newArrival.js` | `docs/develop_guide/user/products.md` |
| 소비처 전부(productController · sitemap RSS · productGroupService · product_card) | `docs/develop_guide/user/products.md` |
| 관리자 상품 폼 · 목록 · 일괄 지정 | `docs/develop_guide/admin/products.md` · `docs/manual/admin/products.md` |
| `/new` SDUI 랜딩 6섹션 + 리졸버 3종 | `docs/develop_guide/user/products.md` · `docs/manual/user/products.md` |
| THEME 축 폐기(코드 레벨) | `docs/develop_guide/user/products.md` |

---

## 잔여 과제

1. **관리자 브랜드 탭의 "입점일 최신순" 정렬 옵션 미구현.**
   대신 `/admin/brands` 목록이 정렬을 제공하므로 우선순위는 낮다.

---

## 알려진 결함

- **THEME 카테고리 id=5 · 6 이 DB 에서 여전히 `is_active=1`** — 계획의 비활성화 처리가 미이행이다. 코드가 `/best` · `/new` 로 리다이렉트하므로 고객 노출 경로는 막혀 있으나 데이터는 남아 있다.
- **브랜드 찜이 `mall_id` 를 검증하지 않는다** (`controllers/likeController.js`) — 상세는 `brand_hub_dev_plan.md` 참고.

---

## 정정하여 기록

원문은 "몰2는 `sale_start_date` 를 NULL 로 유지 → 몰2 신상품 0건" 이라고 적었으나,
**실제 DB 는 전 몰 전 상품에 `sale_start_date` 가 채워져 있다.**
현재 신상품 집계: **몰1 127건 / 몰2 50건 / 몰6 2건.**
