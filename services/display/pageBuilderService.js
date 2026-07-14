const pool = require('../../config/db');
const registry = require('./sectionRegistry');

/*
 * 페이지 빌더 서비스 (P2)
 *  page_section CRUD + 순서변경 + 발행(page_revision 스냅샷) + 롤백.
 *  - 편집은 page_section(작업본)을 직접 수정한다.
 *  - 발행은 현재 page_section 전체를 page_revision.snapshot_json 으로 스냅샷한다.
 *  - 스토어프론트는 최신 스냅샷을 렌더하므로, 발행 전 편집은 미리보기에만 반영된다.
 */

const SNAPSHOT_COLS = [
  'id', 'section_type', 'position', 'title', 'sort_order',
  'data_source_type', 'data_source_id', 'config_json',
  'visible_start_at', 'visible_end_at', 'visible_on_pc', 'visible_on_mobile', 'is_active'
];

function isValidType(type) {
  return Object.prototype.hasOwnProperty.call(registry, type);
}

async function getHomePage(mallId = 1) {
  const [rows] = await pool.query(
    "SELECT * FROM page WHERE page_type = 'home' AND mall_id = ? ORDER BY id DESC LIMIT 1",
    [mallId]
  );
  return rows[0] || null;
}

/**
 * 몰이 가진 SDUI 페이지 목록 (홈 + 랜딩).
 * 빌더가 홈만 편집하던 시절에는 필요 없었다. 이제 랜딩(/new 등)도 편집·발행해야 한다 —
 * 편집할 수 없는 페이지를 발행해 두면 스냅샷에 갇혀 되돌릴 방법이 없다.
 */
async function listPages(mallId = 1) {
  const [rows] = await pool.query(
    `SELECT p.*,
            (SELECT COUNT(*) FROM page_section s WHERE s.page_id = p.id) AS section_count,
            (SELECT MAX(r.revision_no) FROM page_revision r WHERE r.page_id = p.id) AS published_no
       FROM page p
      WHERE p.mall_id = ?
      ORDER BY (p.page_type = 'home') DESC, p.id`,
    [mallId]
  );
  return rows;
}

/**
 * 페이지 하나 — **반드시 몰 스코프로 검증한다.**
 * 안 하면 관리자가 ?page=<남의 몰 페이지 id> 로 다른 몰을 편집할 수 있다.
 */
async function getPage(pageId, mallId = 1) {
  const [rows] = await pool.query(
    'SELECT * FROM page WHERE id = ? AND mall_id = ?',
    [Number(pageId) || 0, mallId]
  );
  return rows[0] || null;
}

async function getSections(pageId) {
  const [rows] = await pool.query(
    'SELECT * FROM page_section WHERE page_id = ? ORDER BY sort_order ASC, id ASC',
    [pageId]
  );
  return rows;
}

async function getSection(id) {
  const [rows] = await pool.query('SELECT * FROM page_section WHERE id = ?', [id]);
  return rows[0] || null;
}

// 새 섹션을 목록 맨 끝(max sort_order + 1)에 추가
async function addSection(pageId, { section_type }) {
  if (!isValidType(section_type)) {
    throw new Error('알 수 없는 섹션 타입입니다.');
  }
  const reg = registry[section_type];
  const [[maxRow]] = await pool.query(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM page_section WHERE page_id = ?',
    [pageId]
  );
  const [result] = await pool.query(
    `INSERT INTO page_section (page_id, section_type, title, sort_order, data_source_type, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [pageId, section_type, reg.label, maxRow.next_order, reg.dataSource || null]
  );
  return result.insertId;
}

// 섹션 설정 갱신(제목/데이터소스/config/노출조건)
/**
 * 섹션 타입별 config_json 정제. 현재는 custom_html 의 HTML 만 새니타이즈한다.
 * @returns 정제된 config 객체(또는 null)
 */
function sanitizeSectionConfig(sectionType, config) {
  if (config == null) return null;
  if (sectionType !== 'custom_html') return config;

  const { sanitize } = require('./htmlSanitizer');
  return Object.assign({}, config, { html: sanitize(config.html) });
}

/*
 * 섹션에 물릴 상품 그룹이 **이 섹션이 속한 몰의 것인지** 검증한다.
 *
 * 드롭다운을 몰 스코프로 좁혀도 서버는 그것을 신뢰하면 안 된다. 남의 몰 그룹을 물리면
 * productGroupService 가 그룹의 mall_id 로 상품을 뽑으므로 **다른 몰 상품이 이 몰 홈에 뜬다**.
 */
async function assertGroupInSameMall(sectionId, groupId) {
  const [[row]] = await pool.query(`
    SELECT g.id
      FROM page_section s
      JOIN page p ON p.id = s.page_id
      JOIN product_group g ON g.id = ? AND g.mall_id = p.mall_id
     WHERE s.id = ?`,
    [groupId, sectionId]);
  if (!row) throw new Error('이 몰의 상품 그룹이 아닙니다.');
}

async function updateSection(id, patch) {
  const section = await getSection(id);
  if (!section) throw new Error('섹션을 찾을 수 없습니다.');

  const fields = [];
  const params = [];
  const set = (col, val) => { fields.push(`${col} = ?`); params.push(val); };

  if (patch.title !== undefined) set('title', patch.title || null);
  if (patch.data_source_id !== undefined) {
    const groupId = patch.data_source_id === '' || patch.data_source_id == null
      ? null : Number(patch.data_source_id);
    if (groupId) await assertGroupInSameMall(id, groupId);
    set('data_source_id', groupId);
    // 리졸버는 data_source_id 만 보지만, 비어 있던 타입 컬럼이 스냅샷·진단을 헷갈리게 한다.
    set('data_source_type', groupId ? 'product_group' : null);
  }
  if (patch.config_json !== undefined) {
    // custom_html 은 저장 시점에도 새니타이즈한다(렌더 시 리졸버의 새니타이즈와 이중 방어).
    // 관리자 입력이라도 저장형 XSS 를 신뢰하지 않는다.
    const cfg = sanitizeSectionConfig(section.section_type, patch.config_json);
    set('config_json', cfg == null ? null : JSON.stringify(cfg));
  }
  if (patch.visible_start_at !== undefined) set('visible_start_at', patch.visible_start_at || null);
  if (patch.visible_end_at !== undefined) set('visible_end_at', patch.visible_end_at || null);
  if (patch.visible_on_pc !== undefined) set('visible_on_pc', patch.visible_on_pc ? 1 : 0);
  if (patch.visible_on_mobile !== undefined) set('visible_on_mobile', patch.visible_on_mobile ? 1 : 0);
  if (patch.is_active !== undefined) set('is_active', patch.is_active ? 1 : 0);

  if (!fields.length) return;
  params.push(id);
  await pool.query(`UPDATE page_section SET ${fields.join(', ')} WHERE id = ?`, params);
}

async function deleteSection(id) {
  await pool.query('DELETE FROM page_section WHERE id = ?', [id]);
}

// 섹션 복제(같은 페이지, 맨 끝 순서, 제목에 "(복사)" 부기)
async function duplicateSection(id) {
  const s = await getSection(id);
  if (!s) throw new Error('섹션을 찾을 수 없습니다.');
  const [[maxRow]] = await pool.query(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM page_section WHERE page_id = ?',
    [s.page_id]
  );
  const cfg = s.config_json == null ? null
    : (typeof s.config_json === 'object' ? JSON.stringify(s.config_json) : s.config_json);
  const [result] = await pool.query(
    `INSERT INTO page_section
       (page_id, section_type, position, title, sort_order, data_source_type, data_source_id,
        config_json, visible_start_at, visible_end_at, visible_on_pc, visible_on_mobile, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.page_id, s.section_type, s.position, (s.title || '') + ' (복사)', maxRow.next_order,
     s.data_source_type, s.data_source_id, cfg,
     s.visible_start_at, s.visible_end_at, s.visible_on_pc, s.visible_on_mobile, s.is_active]
  );
  return result.insertId;
}

// 순서 재정렬: orderedIds 배열 순으로 sort_order = 1..N (해당 page 소속만)
async function reorderSections(pageId, orderedIds) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (let i = 0; i < orderedIds.length; i++) {
      await conn.query(
        'UPDATE page_section SET sort_order = ? WHERE id = ? AND page_id = ?',
        [i + 1, orderedIds[i], pageId]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

function pickSnapshot(rows) {
  return rows.map((r) => {
    const o = {};
    for (const c of SNAPSHOT_COLS) {
      o[c] = c === 'config_json'
        ? (r[c] == null ? null : (typeof r[c] === 'object' ? r[c] : (() => { try { return JSON.parse(r[c]); } catch (e) { return null; } })()))
        : r[c];
    }
    return o;
  });
}

// 발행: 현재 page_section 스냅샷을 page_revision 에 저장(revision_no 증가) + page 상태 published
async function publish(pageId, createdBy) {
  const rows = await getSections(pageId);
  const snapshot = pickSnapshot(rows);
  const [[maxRow]] = await pool.query(
    'SELECT COALESCE(MAX(revision_no), 0) + 1 AS next_no FROM page_revision WHERE page_id = ?',
    [pageId]
  );
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO page_revision (page_id, revision_no, snapshot_json, status, created_by, published_at)
       VALUES (?, ?, ?, 'published', ?, NOW())`,
      [pageId, maxRow.next_no, JSON.stringify(snapshot), createdBy || null]
    );
    await conn.query(
      "UPDATE page SET status = 'published', published_at = NOW() WHERE id = ?",
      [pageId]
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return maxRow.next_no;
}

/*
 * 발행 이후에 작업본이 바뀌었는가(= 지금 화면과 스토어프론트가 다른가).
 *
 * 빌더의 "미발행 변경사항" 배지는 클라이언트가 편집할 때만 켜졌다. 새로고침하거나 다음 날
 * 다시 들어오면 배지가 사라져, 발행을 잊은 변경분을 **아무도 모른 채** 남겨 두게 된다.
 * (실제로 홈 page 1 이 그 상태였다 — 마지막 편집이 마지막 발행보다 뒤였다)
 *
 * 타임스탬프 비교로는 **삭제**를 못 잡는다(지운 행의 updated_at 은 남지 않는다). 그래서 발행할
 * 때와 똑같이 스냅샷을 떠서 최신 리비전과 통째로 비교한다 — 추가·삭제·순서·설정 전부 잡힌다.
 */
/*
 * 비교용 정규화. 그냥 JSON.stringify 로 맞대면 **항상 다르다**고 나온다:
 *   - MySQL JSON 컬럼은 객체 키를 제 맘대로 재정렬해 저장한다(길이순 → 사전순)
 *   - DATETIME 은 라이브에서 Date, 스냅샷에서 ISO 문자열로 온다
 * 키를 정렬하고 값을 문자열로 눕혀 같은 내용이면 같은 문자열이 되게 한다.
 */
function canonical(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(canonical);
  if (typeof v === 'object') {
    return Object.keys(v).sort().reduce((o, k) => { o[k] = canonical(v[k]); return o; }, {});
  }
  return typeof v === 'number' ? String(v) : v; // 1 과 "1" 을 같게 본다(JSON 왕복에서 갈린다)
}

async function isDirty(pageId) {
  const [[rev]] = await pool.query(
    'SELECT snapshot_json FROM page_revision WHERE page_id = ? ORDER BY revision_no DESC LIMIT 1',
    [pageId]);
  if (!rev) return true; // 한 번도 발행 안 함 → 라이브 폴백 상태

  const live = pickSnapshot(await getSections(pageId));
  const raw = typeof rev.snapshot_json === 'object'
    ? rev.snapshot_json : JSON.parse(rev.snapshot_json || '[]');
  const published = Array.isArray(raw) ? raw : (raw.sections || []);

  return JSON.stringify(canonical(live)) !== JSON.stringify(canonical(published));
}

async function listRevisions(pageId, limit = 20) {
  const [rows] = await pool.query(
    `SELECT id, revision_no, status, created_by, created_at, published_at
     FROM page_revision WHERE page_id = ? ORDER BY revision_no DESC LIMIT ?`,
    [pageId, limit]
  );
  return rows;
}

// 롤백: 선택 리비전 스냅샷으로 page_section 작업본을 교체(기존 삭제 후 재삽입)
async function rollback(pageId, revisionId) {
  const [revRows] = await pool.query(
    'SELECT * FROM page_revision WHERE id = ? AND page_id = ?',
    [revisionId, pageId]
  );
  const rev = revRows[0];
  if (!rev) throw new Error('리비전을 찾을 수 없습니다.');
  const snap = typeof rev.snapshot_json === 'object' ? rev.snapshot_json : JSON.parse(rev.snapshot_json);
  const rows = Array.isArray(snap) ? snap : (snap.sections || []);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM page_section WHERE page_id = ?', [pageId]);
    for (const s of rows) {
      await conn.query(
        `INSERT INTO page_section
           (page_id, section_type, position, title, sort_order, data_source_type, data_source_id,
            config_json, visible_start_at, visible_end_at, visible_on_pc, visible_on_mobile, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [pageId, s.section_type, s.position || 'main_content', s.title || null, s.sort_order || 0,
         s.data_source_type || null, s.data_source_id || null,
         s.config_json == null ? null : JSON.stringify(s.config_json),
         s.visible_start_at || null, s.visible_end_at || null,
         s.visible_on_pc == null ? 1 : s.visible_on_pc,
         s.visible_on_mobile == null ? 1 : s.visible_on_mobile,
         s.is_active == null ? 1 : s.is_active]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/*
 * 데이터소스 드롭다운용 목록.
 *
 * ⚠️ 반드시 몰 스코프다. 예전에는 전 몰의 그룹을 다 내려줘서, 소형몰 빌더에서 종합관 그룹을
 * 고를 수 있었다. 골라도 productGroupService 가 그룹의 mall_id 로 상품을 조회하므로 화면에는
 * **남의 몰 상품**이 뜬다(또는 0건이라 섹션이 통째로 사라진다).
 */
async function listProductGroups(mallId = 1) {
  const [rows] = await pool.query(
    'SELECT id, name, group_type FROM product_group WHERE is_active = 1 AND mall_id = ? ORDER BY id ASC',
    [mallId]
  );
  return rows;
}

module.exports = {
  getHomePage,
  listPages,
  getPage,
  getSections,
  getSection,
  addSection,
  updateSection,
  deleteSection,
  duplicateSection,
  reorderSections,
  publish,
  isDirty,
  listRevisions,
  rollback,
  listProductGroups
};
