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
 * 노출 대상(page_section.visible_on_pc / visible_on_mobile) → 렌더 게이트.
 *
 * 이 두 컬럼은 오래도록 **저장만 되고 렌더에는 쓰이지 않았다**. 그래서 빌더에서
 * "모바일만 노출"로 꺼도 PC 에 그대로 나왔다 = 빌더가 거짓말을 했다.
 * SSR 이라 UA 로 갈라 굽지 않고(캐시·프록시가 섞인다) CSS 로 감춘다.
 *
 * @returns 'all' | 'pc_only' | 'mobile_only' | 'none'
 */
function deviceGate(s) {
  const onPc = Number(s.visible_on_pc) !== 0;      // 컬럼 없으면(레거시 스냅샷) 노출로 본다
  const onMobile = Number(s.visible_on_mobile) !== 0;
  if (!onPc && !onMobile) return 'none';
  if (!onPc) return 'mobile_only';
  if (!onMobile) return 'pc_only';
  return 'all';
}

// 게이트 → 뷰가 감싸는 wrapper 클래스 (public/css/input.css 에 정의)
const GATE_CLASS = { pc_only: 'yd-only-pc', mobile_only: 'yd-only-mobile' };

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
 * @returns [{ type, view, locals, gateClass }]
 */
async function resolveSections(rows, shared = {}) {
  const sections = [];
  for (const s of rows) {
    const reg = registry[s.section_type];
    if (!reg) continue; // 미등록 섹션 타입은 스킵

    const gate = deviceGate(s);
    if (gate === 'none') continue; // PC·모바일 둘 다 끔 = 아무 데도 안 나온다

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

    sections.push({ type: s.section_type, view: reg.view, locals, gateClass: GATE_CLASS[gate] || '' });
  }
  return sections;
}

/*
 * 진단 — 이 섹션이 스토어프론트에 **실제로 나오는가**, 안 나온다면 왜인가.
 *
 * 페이지 빌더는 page_section 목록을 그대로 보여줬고, 렌더 엔진은 데이터가 없는 섹션을
 * 조용히 버렸다. 그래서 "빌더에는 있는데 화면에는 없다"가 상시로 났다(새 몰은 상품그룹·
 * 베스트그룹이 없어 절반이 증발했다). 빌더가 그 사실을 알아야 운영자에게 말해 줄 수 있다.
 *
 * resolveSections 와 **같은 판정을 같은 순서로** 돈다. 여기가 갈라지면 진단이 거짓말이 된다.
 *
 * @param rows page_section 원본 행(비활성·기간 밖 포함 — 빌더는 전부 보여주므로)
 * @returns Map<sectionId, { rendered: boolean, code: string|null }>
 */
async function diagnoseSections(rows, shared = {}) {
  const now = Date.now();
  const out = new Map();

  for (const s of rows) {
    const put = (code) => out.set(s.id, { rendered: !code, code: code || null });

    if (!registry[s.section_type]) { put('unregistered'); continue; }
    if (Number(s.is_active) === 0) { put('inactive'); continue; }
    if (s.visible_start_at && new Date(s.visible_start_at).getTime() > now) { put('scheduled'); continue; }
    if (s.visible_end_at && new Date(s.visible_end_at).getTime() < now) { put('expired'); continue; }
    if (deviceGate(s) === 'none') { put('device_off'); continue; }

    const resolver = resolvers[s.section_type];
    if (!resolver) { put(null); continue; } // 정적 섹션 — 데이터가 필요 없다

    const config = parseConfig(s.config_json);
    try {
      const locals = await resolver.resolve({
        section: s, shared, config, locals: Object.assign({}, config, { title: s.title })
      });
      put(locals ? null : 'empty');
    } catch (err) {
      console.error(`[diagnose] '${s.section_type}' 리졸버 실패:`, err.message);
      put('error');
    }
  }
  return out;
}

/*
 * 스토어프론트: 발행 스냅샷 기준 홈 섹션. 스냅샷 미존재 시 라이브 page_section 폴백.
 * @returns [{ type, view, locals }] 또는 null(홈 페이지 미시드 → 컨트롤러 레거시 폴백)
 */
async function getHomeSections(shared = {}) {
  const page = await getHomePage(shared.mallId || 1);
  if (!page) return null;
  return getPageSections(page, shared);
}

/*
 * 미리보기: 라이브 page_section(작업본) 기준 홈 섹션.
 * @param pageId 대상 page id
 */
async function getDraftSections(pageId, shared = {}) {
  const rows = await getLiveSections(pageId);
  return resolveSections(rows, shared);
}

/*
 * 관리자용 — 이 몰 홈이 스토어프론트에서 **실제로 그리는** 히어로 섹션 타입.
 * 프론트와 같은 소스(발행 스냅샷 우선 → 라이브 폴백)를 읽어 판정한다.
 * theme_hero 는 hero_variant 를 무시하고 hero_slide 를 렌더하므로, 관리자 화면이
 * 실제 노출과 어긋나지 않으려면 이 값으로 표시 모드를 정해야 한다.
 * @returns 'theme_hero' | 'hero' | null
 */
async function getHomeHeroType(mallId = 1) {
  const hero = await getHomeHeroSection(mallId);
  return hero ? hero.type : null;
}

/*
 * 관리자용 — 홈 히어로 섹션의 타입과 설정을 함께 돌려준다.
 *
 * theme_hero 는 config.layout(showcase|banner|editorial)이 곧 테마1/2/3 이고 데이터 소스도 그에 따라
 * 갈린다(리졸버 theme_hero.js). 관리자 화면이 타입만 보고 표시 모드를 정하면 테마2·3 인 몰까지
 * 상품 쇼케이스로 뭉개져, 실제 노출 중인 콘텐츠가 관리자에서 안 보인다.
 * @returns {{type:'theme_hero'|'hero', layout:string|null}|null}
 */
async function getHomeHeroSection(mallId = 1) {
  const page = await getHomePage(mallId);
  if (!page) return null;
  const revision = await getLatestRevision(page.id);
  let rows;
  if (revision) {
    const snap = parseConfig(revision.snapshot_json);
    rows = filterSnapshotRows(Array.isArray(snap) ? snap : snap.sections);
  } else {
    rows = await getLiveSections(page.id);
  }
  const hero = (rows || []).find((s) => s.section_type === 'theme_hero' || s.section_type === 'hero');
  if (!hero) return null;
  const cfg = parseConfig(hero.config_json);
  return { type: hero.section_type, layout: cfg.layout || null };
}

/*
 * slug 로 발행된 페이지를 찾는다. (홈 외 SDUI 랜딩 — 예: /new)
 * 없으면 null → 호출측이 레거시 화면으로 폴백한다.
 */
async function getPageBySlug(mallId, slug) {
  const [rows] = await pool.query(
    "SELECT * FROM page WHERE slug = ? AND mall_id = ? AND status = 'published' ORDER BY id DESC LIMIT 1",
    [slug, mallId || 1]
  );
  return rows[0] || null;
}

/*
 * 임의 페이지의 섹션을 스토어프론트 규칙(발행 스냅샷 우선 → 라이브 폴백)으로 해석한다.
 * getHomeSections 와 같은 규칙이며, 대상 페이지만 다르다.
 */
async function getPageSections(page, shared = {}) {
  if (!page) return null;

  const revision = await getLatestRevision(page.id);
  let rows;
  if (revision) {
    const snap = parseConfig(revision.snapshot_json);
    rows = filterSnapshotRows(Array.isArray(snap) ? snap : snap.sections);
  } else {
    rows = await getLiveSections(page.id); // 최초 발행 전: 라이브 폴백
  }
  return resolveSections(rows, shared);
}

module.exports = {
  getHomeSections,
  getDraftSections,
  resolveSections,
  diagnoseSections,
  getLiveSections,
  loadHomeCategories,
  getHomePage,
  getHomeHeroType,
  getHomeHeroSection,
  getPageBySlug,
  getPageSections
};
