# 브랜드 허브 재설계 계획서

> **이 문서는 잔여 과제만 남긴 축약본입니다.** (정리: 2026-07-15)
> 완료 기능의 정본은 `docs/develop_guide/` (개발자) 와 `docs/manual/` (운영자) 입니다.

---

## 완료되어 이관된 항목

| 항목 | 이관된 문서 |
|---|---|
| `brand_profile` · `brand_stat` · `brand_category_stat` 테이블 | `docs/develop_guide/admin/brands.md` |
| 백필(초성 인덱스 · 영문명) | `docs/develop_guide/admin/brands.md` |
| 브랜드 타일 degrade(로고 없는 브랜드 처리) | `docs/develop_guide/user/products.md` |
| 브랜드 홈 `/brands` — 검색 · 이번주 혜택 슬라이더 · 인기 폴백 사다리 · 신규 브랜드 · 카테고리별 · 초성 색인 | `docs/develop_guide/user/products.md` · `docs/manual/user/brands.md` |
| 브랜드 상세관 5탭 | `docs/develop_guide/user/products.md` · `docs/manual/user/brands.md` |
| 관심 브랜드 찜 | `docs/develop_guide/user/products.md` · `docs/manual/user/brands.md` |
| 관리자 `/admin/brands` + 집계 재계산 | `docs/develop_guide/admin/brands.md` · `docs/manual/admin/brands.md` |
| `new_brand_list` SDUI 리졸버 | `docs/develop_guide/admin/brands.md` |
| sitemap 몰 필터 | `docs/develop_guide/admin/brands.md` |

---

## 잔여 과제

1. **브랜드 상세관 베스트탭용 `best_group` 자동 생성 배치 미구현.**
   현재는 수동 시드 10건뿐이고, 해당 브랜드의 `best_group` 이 없으면 판매순 폴백으로 내려간다.
2. **마이페이지 관심 브랜드 강화 미구현** — 계획했던 3블록(최근 신상품 / 사용 가능 쿠폰 / 진행 중 행사)이 없다.
3. **`/admin/brands/merge` 중복 브랜드 병합** — 계획상 2차.
4. **급상승 브랜드** — `brand_stat_daily` 테이블이 없어 미구현. 계획상 2차.
5. **`/admin/categories` 브랜드 탭 → `/admin/brands` 링크 없음.** 운영자가 브랜드 관리 화면으로 이동할 동선이 없다.
6. **`services/display/resolvers/brand_carousel.js` 가 아직 `brand_stat` 미전환** — 여전히 `categories LEFT JOIN products` COUNT 로 직접 집계한다.

---

## 알려진 결함

- **브랜드 찜이 `mall_id` 를 검증하지 않는다** — `controllers/likeController.js:53`. 타 몰 브랜드도 찜할 수 있다.
- **브랜드 집계에 cron 이 없다** — `/admin/brands` 의 "집계 재계산" 버튼이나 `scripts/recalc_brand_stat.js` 수동 실행에만 의존한다. 상품이 늘거나 빠져도 자동 반영되지 않는다.
- **`system_settings.new_brand_days` 설정값이 `/brands` 홈에 적용되지 않는다** — 신규 브랜드 판정이 180 으로 하드코딩돼 있어 설정이 무시된다.
