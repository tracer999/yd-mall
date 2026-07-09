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

async function getHomePage() {
  const [rows] = await pool.query(
    "SELECT * FROM page WHERE page_type = 'home' AND mall_id = 1 ORDER BY id DESC LIMIT 1"
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
async function updateSection(id, patch) {
  const section = await getSection(id);
  if (!section) throw new Error('섹션을 찾을 수 없습니다.');

  const fields = [];
  const params = [];
  const set = (col, val) => { fields.push(`${col} = ?`); params.push(val); };

  if (patch.title !== undefined) set('title', patch.title || null);
  if (patch.data_source_id !== undefined) {
    set('data_source_id', patch.data_source_id === '' || patch.data_source_id == null ? null : Number(patch.data_source_id));
  }
  if (patch.config_json !== undefined) {
    set('config_json', patch.config_json == null ? null : JSON.stringify(patch.config_json));
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

// 데이터소스 드롭다운용 목록
async function listProductGroups() {
  const [rows] = await pool.query(
    'SELECT id, name, group_type FROM product_group WHERE is_active = 1 ORDER BY id ASC'
  );
  return rows;
}

module.exports = {
  getHomePage,
  getSections,
  getSection,
  addSection,
  updateSection,
  deleteSection,
  duplicateSection,
  reorderSections,
  publish,
  listRevisions,
  rollback,
  listProductGroups
};
