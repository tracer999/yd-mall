-- 추천 · 전문관 — 신규 GNB 기능 메뉴 2종 등록
-- 설계: docs/사이트개선/recommend_specialty_design_and_development.md
--
-- 개발 DB = 운영 DB 다. 그래서 module_ready = 0 으로 넣는다.
--   navigationService 의 렌더 조건이 `is_enabled AND module_ready` 이므로
--   라우트가 배포되기 전에는 GNB 에 뜨지 않는다(404 링크 방지).
--   배포 확인 후 아래 §활성화 SQL 을 수동 실행한다.
--
-- 스키마 변경(DDL)은 없다. 전문관은 exhibition 테이블을 재사용하며
-- exhibition_type 이 varchar(50) 이라 'SPECIALTY' 값 추가에 ALTER 가 필요 없다.
--
-- 여러 번 실행해도 안전하다(idempotent).

-- ─────────────────────────────────────────────────────────
-- 1. 전역 카탈로그 (feature_menu)
-- ─────────────────────────────────────────────────────────
INSERT INTO feature_menu
    (feature_code, default_name, default_path, position, required_module, module_ready,
     is_system, is_required, default_sort_order, description)
VALUES
    ('RECOMMEND', '추천',   '/recommend', 'gnb', 'recommend', 0, 0, 0, 4,
     '개인화·MD 큐레이션 기반 상품 추천'),
    ('SPECIALTY', '전문관', '/specialty', 'gnb', 'specialty', 0, 0, 0, 7,
     '상시 운영되는 테마별 전문 매장(기획전 모듈 재사용)')
ON DUPLICATE KEY UPDATE
    default_name       = VALUES(default_name),
    default_path       = VALUES(default_path),
    position           = VALUES(position),
    required_module    = VALUES(required_module),
    default_sort_order = VALUES(default_sort_order),
    description        = VALUES(description);
-- ⚠️ module_ready 는 의도적으로 갱신하지 않는다. 재실행이 활성화를 되돌리면 안 된다.

-- ─────────────────────────────────────────────────────────
-- 2. 몰별 노출 설정 (mall_feature_menu) — 몰 1·2
--    is_enabled = 1 이지만 module_ready = 0 이라 아직 GNB 에 뜨지 않는다.
--
--    sort_order 는 기존 메뉴와 **일부러 겹치게** 둔다. 남의 순서를 바꾸면 운영 GNB 가 바뀐다.
--    동점은 navigationService 가 f.default_sort_order 로 푼다
--    (ORDER BY f.position, m.sort_order, f.default_sort_order).
--
--      RECOMMEND  sort_order=4, default=4  vs  EXHIBITION sort_order=4, default=6
--        → 추천이 기획전보다 앞. 결과: … 베스트(3) · **추천** · 기획전 …
--      SPECIALTY  sort_order=7, default=7  vs  NEW_PRODUCT sort_order=7, default=4
--        → 신상품이 앞. 결과: … 브랜드(6) · 신상품(7) · **전문관** · 랭킹 …
-- ─────────────────────────────────────────────────────────
--
-- ⚠️ 두 가지 함정을 함께 피한 형태다.
--   1) INSERT ... SELECT 에서는 VALUES(col) 을 쓸 수 없다(MySQL 8) → SELECT 쪽 별칭을 참조한다.
--   2) `CROSS JOIN (...) v ON DUPLICATE KEY UPDATE` 는 ON 이 **조인 조건**으로 파싱돼 1064 가 난다
--      → SELECT 전체를 파생 테이블(t)로 한 번 더 감싼다.
INSERT INTO mall_feature_menu (mall_id, feature_code, sort_order, is_enabled)
SELECT t.mall_id, t.feature_code, t.sort_order, t.is_enabled
  FROM (
        SELECT m.id AS mall_id, v.feature_code, v.sort_order, 1 AS is_enabled
          FROM mall m
          CROSS JOIN (
                SELECT 'RECOMMEND' AS feature_code, 4 AS sort_order
          UNION SELECT 'SPECIALTY',                 7
          ) v
  ) t
ON DUPLICATE KEY UPDATE sort_order = t.sort_order;


-- ═════════════════════════════════════════════════════════
-- 활성화 SQL — 코드 배포를 확인한 **뒤에** 수동 실행할 것
-- ═════════════════════════════════════════════════════════
--
-- UPDATE feature_menu SET module_ready = 1 WHERE feature_code IN ('RECOMMEND','SPECIALTY');
--
-- ⚠️ GNB 슬롯이 이미 꽉 찼다: navigation_config.max_gnb_items = 12 인데
--    현재 활성 기능 메뉴가 정확히 12개다(카테고리 제외). 그냥 켜면 뒤 2개가 잘려 사라진다.
--    아래 중 하나를 함께 실행해야 한다. 운영 GNB 가 바뀌는 변경이므로 승인 후에.
--
--    (A) 쿠폰·멤버십을 GNB 에서 내린다 (마이페이지에 동선이 이미 있다)
--        UPDATE mall_feature_menu SET is_enabled = 0
--         WHERE feature_code IN ('COUPON','MEMBERSHIP');
--
--    (B) 슬롯을 늘린다
--        UPDATE navigation_config SET max_gnb_items = 14;
--
--    참고: 랭킹(RANKING)은 베스트에 흡수돼 /ranking 이 준비중 랜딩으로 남은 죽은 메뉴다.
--          이것부터 내리면 슬롯이 하나 빈다.
--          UPDATE mall_feature_menu SET is_enabled = 0 WHERE feature_code = 'RANKING';
