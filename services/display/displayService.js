const pool = require('../../config/db');
const registry = require('./sectionRegistry');
const resolvers = require('./resolvers');
const { loadHomeCategories } = require('./resolvers/_shared');

/*
 * 홈 전시 렌더 엔진 (P1) + 발행/미리보기 분리 (P2)
 *  - 스토어프론트(getHomeSections): 최신 발행 스냅샷(page_revision) 기준. 스냅샷이 없으면
 *    라이브 page_section 폴백(P1 초기 상태 호환).
 *  - 미리보기(getDraftSections): 라이브 page_section(작업본) 기준.
 *  운영자가 관리자에서 섹션을 편집(page_section 수정) → 발행하면 스냅샷이 갱신되어
 *  스토어프론트에 반영된다(SDUI + draft/publish 분리).
 */

function parseConfig(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return {}; }
}

async function getHomePage(mallId = 1) {
  const [rows] = await pool.query(
    "SELECT * FROM page WHERE page_type = 'home' AND mall_id = ? AND status = 'published' ORDER BY id DESC LIMIT 1",
    [mallId]
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
 *
 * CT-0: section_type 별 분기를 resolvers/ 맵으로 위임한다.
 *   - 리졸버가 null 을 반환하면 해당 섹션은 스킵(빈 데이터 규약)
 *   - 리졸버가 없으면 config_json 만으로 렌더(정적 섹션)
 * 새 컴포넌트를 추가할 때 이 파일은 수정하지 않는다.
 *
 * @param rows   page_section 행 배열(DB 또는 스냅샷)
 * @param shared { hasUser, heroData, kakaoUrl }
 * @returns [{ type, view, locals }]
 */
async function resolveSections(rows, shared = {}) {
  const sections = [];
  for (const s of rows) {
    const reg = registry[s.section_type];
    if (!reg) continue; // 미등록 섹션 타입은 스킵

    const config = parseConfig(s.config_json);
    const baseLocals = Object.assign({}, config, { title: s.title });

    const resolver = resolvers[s.section_type];
    let locals = baseLocals;
    if (resolver) {
      try {
        locals = await resolver.resolve({ section: s, shared, config, locals: baseLocals });
      } catch (err) {
        // 한 섹션의 데이터 조회 실패가 홈 전체를 죽이지 않도록 격리한다.
        console.error(`[displayService] '${s.section_type}' 리졸버 실패:`, err.message);
        continue;
      }
    }
    if (!locals) continue; // 리졸버가 스킵을 지시

    sections.push({ type: s.section_type, view: reg.view, locals });
  }
  return sections;
}

/*
 * 스토어프론트: 발행 스냅샷 기준 홈 섹션. 스냅샷 미존재 시 라이브 page_section 폴백.
 * @returns [{ type, view, locals }] 또는 null(홈 페이지 미시드 → 컨트롤러 레거시 폴백)
 */
async function getHomeSections(shared = {}) {
  const page = await getHomePage(shared.mallId || 1);
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
