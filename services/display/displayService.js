const pool = require('../../config/db');
const registry = require('./sectionRegistry');
const productGroupService = require('./productGroupService');

/*
 * 홈 전시 렌더 엔진 (P1) + 발행/미리보기 분리 (P2)
 *  - 스토어프론트(getHomeSections): 최신 발행 스냅샷(page_revision) 기준. 스냅샷이 없으면
 *    라이브 page_section 폴백(P1 초기 상태 호환).
 *  - 미리보기(getDraftSections): 라이브 page_section(작업본) 기준.
 *  운영자가 관리자에서 섹션을 편집(page_section 수정) → 발행하면 스냅샷이 갱신되어
 *  스토어프론트에 반영된다(SDUI + draft/publish 분리).
 */

const P_STATUS = "p.status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')";
function visibilityClause(hasUser) {
  return hasUser ? "p.visibility IN ('PUBLIC','MEMBER_ONLY')" : "p.visibility = 'PUBLIC'";
}

function parseConfig(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return {}; }
}

async function loadHomeCategories(hasUser) {
  const vis = visibilityClause(hasUser);
  const [rows] = await pool.query(`
    SELECT c.id, c.name, COUNT(p.id) AS product_count
    FROM categories c
    JOIN products p ON p.category_id = c.id AND ${P_STATUS} AND ${vis}
    WHERE c.type = 'NORMAL'
    GROUP BY c.id, c.name
    HAVING product_count > 0
    ORDER BY c.display_order ASC
  `);
  return rows;
}

async function getHomePage() {
  const [rows] = await pool.query(
    "SELECT * FROM page WHERE page_type = 'home' AND mall_id = 1 AND status = 'published' ORDER BY id DESC LIMIT 1"
  );
  return rows[0] || null;
}

async function getLatestRevision(pageId) {
  const [rows] = await pool.query(
    "SELECT * FROM page_revision WHERE page_id = ? ORDER BY revision_no DESC LIMIT 1",
    [pageId]
  );
  return rows[0] || null;
}

async function getLiveSections(pageId, { includeInactive = false } = {}) {
  const activeClause = includeInactive
    ? ''
    : `AND is_active = 1
       AND (visible_start_at IS NULL OR visible_start_at <= NOW())
       AND (visible_end_at IS NULL OR visible_end_at >= NOW())`;
  const [rows] = await pool.query(`
    SELECT * FROM page_section
    WHERE page_id = ? ${activeClause}
    ORDER BY sort_order ASC, id ASC
  `, [pageId]);
  return rows;
}

// 스냅샷 배열(JSON) → 노출 필터 적용(발행 시점 저장분 중 현재 노출 조건 만족만)
function filterSnapshotRows(rows) {
  const now = Date.now();
  return (rows || [])
    .filter((s) => Number(s.is_active) !== 0)
    .filter((s) => !s.visible_start_at || new Date(s.visible_start_at).getTime() <= now)
    .filter((s) => !s.visible_end_at || new Date(s.visible_end_at).getTime() >= now)
    .sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));
}

/*
 * 섹션 행 목록 → 렌더 가능한 형태로 해석한다. (스토어프론트/미리보기 공통)
 * @param rows   page_section 행 배열(DB 또는 스냅샷)
 * @param shared { hasUser, heroData, kakaoUrl }
 * @returns [{ type, view, locals }]
 */
async function resolveSections(rows, shared = {}) {
  const sections = [];
  for (const s of rows) {
    const reg = registry[s.section_type];
    if (!reg) continue; // 미등록 섹션 타입은 스킵

    const cfg = parseConfig(s.config_json);
    const locals = Object.assign({}, cfg, { title: s.title });

    if (s.section_type === 'product_grid') {
      const group = await productGroupService.getById(s.data_source_id);
      const products = await productGroupService.resolve(group, {
        hasUser: shared.hasUser,
        limit: cfg.maxCount || 8
      });
      if (!products || products.length === 0) continue; // 빈 그리드 미노출(기존 동작)
      locals.products = products;
    } else if (s.section_type === 'hero') {
      Object.assign(locals, shared.heroData || {});
    } else if (s.section_type === 'category_showcase') {
      const categories = await loadHomeCategories(shared.hasUser);
      if (!categories || categories.length === 0) continue;
      locals.categories = categories;
    } else if (s.section_type === 'value_proposition') {
      locals.kakaoUrl = shared.kakaoUrl || '#';
    } else if (s.section_type === 'kakao_cta') {
      if (!shared.kakaoUrl || shared.kakaoUrl === '#') continue; // kakaoUrl 없으면 미노출(기존 동작)
      locals.kakaoUrl = shared.kakaoUrl;
    }

    sections.push({ type: s.section_type, view: reg.view, locals });
  }
  return sections;
}

/*
 * 스토어프론트: 발행 스냅샷 기준 홈 섹션. 스냅샷 미존재 시 라이브 page_section 폴백.
 * @returns [{ type, view, locals }] 또는 null(홈 페이지 미시드 → 컨트롤러 레거시 폴백)
 */
async function getHomeSections(shared = {}) {
  const page = await getHomePage();
  if (!page) return null;

  const revision = await getLatestRevision(page.id);
  let rows;
  if (revision) {
    const snap = parseConfig(revision.snapshot_json);
    rows = filterSnapshotRows(Array.isArray(snap) ? snap : snap.sections);
  } else {
    rows = await getLiveSections(page.id); // 최초 발행 전: 라이브 폴백(P1 호환)
  }
  return resolveSections(rows, shared);
}

/*
 * 미리보기: 라이브 page_section(작업본) 기준 홈 섹션.
 * @param pageId 대상 page id
 */
async function getDraftSections(pageId, shared = {}) {
  const rows = await getLiveSections(pageId);
  return resolveSections(rows, shared);
}

module.exports = {
  getHomeSections,
  getDraftSections,
  resolveSections,
  loadHomeCategories,
  getHomePage
};
