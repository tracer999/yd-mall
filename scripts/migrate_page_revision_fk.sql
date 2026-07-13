-- 발행 흐름 복구 — 근본 원인 차단
--
-- page_revision 에 FK 가 없었다. 그래서 page 3 이 지워질 때 그 리비전 3건이 남았고,
-- **모든 페이지의 발행 스냅샷이 0건**이 됐다. displayService 는 스냅샷이 없으면
-- 라이브 page_section 으로 폴백하므로, 페이지 빌더에서 섹션을 고치는 순간 운영에 반영됐다
-- ("발행"을 눌러야 반영되는 게 아니었다).
--
-- 고아는 이미 지웠다(migrate_cleanup_page_builder.sql). 이제 재발을 막는다.
--
-- ⚠️ 이 마이그레이션은 **코드 배포 뒤**에 실행할 것.
--    FK 자체는 무해하지만, 아래 초기 발행(2번)이 스토어프론트의 렌더 소스를
--    라이브 → 스냅샷으로 바꾸므로 새 코드가 먼저 나가 있어야 한다.

-- ---------------------------------------------------------------------------
-- 1) FK — 페이지가 지워지면 리비전도 함께 지워진다
-- ---------------------------------------------------------------------------
SET @has_fk := (
  SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE table_schema = DATABASE()
     AND table_name = 'page_revision'
     AND constraint_name = 'fk_page_revision_page'
);
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE page_revision
     ADD CONSTRAINT fk_page_revision_page
     FOREIGN KEY (page_id) REFERENCES page(id) ON DELETE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 2) 초기 발행 — 지금의 라이브 page_section 을 그대로 스냅샷으로 굳힌다
--
--    이 시점부터 스토어프론트는 **스냅샷**을 읽는다. 즉:
--      - 지금 화면은 하나도 안 바뀐다(현재 라이브 상태를 그대로 찍는 것이므로)
--      - 앞으로 페이지 빌더 편집은 **발행을 눌러야** 운영에 반영된다  ← 이게 목적
--
--    snapshot_json 은 pageBuilderService.pickSnapshot 과 **같은 컬럼 집합**이어야 한다
--    (id · section_type · position · title · sort_order · data_source_* · config_json ·
--     visible_* · is_active). 하나라도 빠지면 발행 후 그 속성이 사라진다.
-- ---------------------------------------------------------------------------
INSERT INTO page_revision (page_id, revision_no, snapshot_json, status, created_by, published_at)
SELECT p.id,
       COALESCE((SELECT MAX(r.revision_no) FROM page_revision r WHERE r.page_id = p.id), 0) + 1,
       (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                 'id',                s.id,
                 'section_type',      s.section_type,
                 'position',          s.position,
                 'title',             s.title,
                 'sort_order',        s.sort_order,
                 'data_source_type',  s.data_source_type,
                 'data_source_id',    s.data_source_id,
                 'config_json',       s.config_json,
                 'visible_start_at',  s.visible_start_at,
                 'visible_end_at',    s.visible_end_at,
                 'visible_on_pc',     s.visible_on_pc,
                 'visible_on_mobile', s.visible_on_mobile,
                 'is_active',         s.is_active
               ))
          FROM page_section s WHERE s.page_id = p.id),
       'published',
       'migration',
       NOW()
  FROM page p
 WHERE EXISTS (SELECT 1 FROM page_section s WHERE s.page_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM page_revision r WHERE r.page_id = p.id);

UPDATE page SET status = 'published', published_at = NOW()
 WHERE EXISTS (SELECT 1 FROM page_revision r WHERE r.page_id = page.id);

-- 확인 — 모든 페이지가 스냅샷을 갖고, 섹션 수가 라이브와 일치해야 한다
SELECT p.id, p.mall_id, p.page_type, p.slug, p.status,
       (SELECT COUNT(*) FROM page_section s WHERE s.page_id = p.id) AS live_sections,
       (SELECT MAX(r.revision_no) FROM page_revision r WHERE r.page_id = p.id) AS revision_no,
       (SELECT JSON_LENGTH(r.snapshot_json) FROM page_revision r
         WHERE r.page_id = p.id ORDER BY r.revision_no DESC LIMIT 1) AS snapshot_sections
  FROM page p ORDER BY p.id;
