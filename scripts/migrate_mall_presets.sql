-- 몰 빌더 P1 — 헤더·GNB 스킨 축 추가
-- 설계: docs/사이트개선/mall_builder_plan.md §3.1
--
-- 헤더·GNB 스킨은 **몰마다** 고른다(기본형 / 드로어형). 몰의 규모(상품 수)와는 무관하다.
-- 스킨의 소스 오브 트루스는 navigation_config 다:
--   header_layout_type  main_right_utility_v1(기본형) | compact_drawer_v1(드로어형)
--   nav_mode            split(카테고리 버튼 + 평면 GNB) | unified(카테고리가 메뉴 목록으로 승격)
-- 둘은 항상 짝으로 저장된다(headerSettingsController.navModeOf).
-- mall.preset_key 는 "마지막에 적용한 프리셋"을 기억할 뿐이다(services/mall/presets.js).
--
-- 기본값이 현행 동작과 같으므로 기존 몰(health, general)은 아무것도 바뀌지 않는다.
--
-- 멱등하지 않다(ADD COLUMN 재실행 시 에러). 이미 적용됐는지 먼저 확인할 것:
--   SHOW COLUMNS FROM navigation_config LIKE 'nav_mode';

ALTER TABLE mall
  ADD COLUMN preset_key VARCHAR(50) NULL AFTER name;

-- GNB 조립 알고리즘. 'split' = 카테고리 버튼 + 평면 메뉴(기본형, 현행)
--                    'unified' = 카테고리 1뎁스가 메뉴 목록으로 올라가고 하위 뎁스는 아코디언(드로어형)
ALTER TABLE navigation_config
  ADD COLUMN nav_mode VARCHAR(20) NOT NULL DEFAULT 'split' AFTER header_layout_type;
