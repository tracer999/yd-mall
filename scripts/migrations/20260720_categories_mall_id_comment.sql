-- categories.mall_id 컬럼 코멘트 정정 (구조 변경 없음 — 코멘트만)
--
-- 배경: 이름이 "mall_id" 라 몰 스코핑 컬럼으로 오해되기 쉬우나,
--       실제 스토어프론트 몰 스코핑은 products.mall_id 역산(services/catalog/categoryScope.js)이 담당한다.
--       이 컬럼은 "소유 몰"에 가깝다 — NORMAL·BRAND 는 글로벌화되어 전부 0,
--       THEME·OUTLET 만 편집 몰 id 를 가진다(controllers/admin/categoryController.js:271).
--
-- 적용일: 2026-07-20 (DB 반영 완료)

ALTER TABLE categories
    MODIFY COLUMN mall_id BIGINT NOT NULL DEFAULT 1
    COMMENT '소유 몰. 0=전 몰 공용(NORMAL/BRAND). THEME/OUTLET 만 몰별';
