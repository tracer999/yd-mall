const registry = require('../../services/display/sectionRegistry');
const builder = require('../../services/display/pageBuilderService');

/*
 * 관리자 페이지 빌더 컨트롤러 (P2)
 *  좌: 섹션 목록(추가/삭제/복제/순서변경) · 중: PC/모바일 미리보기(draft) · 우: 선택 섹션 설정폼.
 *  스토어프론트 반영은 "발행"(page_revision 스냅샷) 시점에만 이뤄진다.
 *  CRUD API는 JSON을 반환하고, 편집 UI는 fetch 후 갱신한다(기존 displayController 패턴 준수).
 */

function parseConfig(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return {}; }
}

// 팔레트: 레지스트리 → 추가 가능한 섹션 타입 목록
function buildPalette() {
  return Object.entries(registry).map(([type, def]) => ({
    type, label: def.label, dataSource: def.dataSource || null
  }));
}

// 섹션 행에 레지스트리 메타(label/fields/dataSource) + 파싱된 config 를 덧입힌다
function decorateSection(s, groupNameById) {
  const def = registry[s.section_type] || { label: s.section_type, fields: [], dataSource: null };
  return Object.assign({}, s, {
    label: def.label,
    fields: def.fields || [],
    dataSource: def.dataSource || null,
    config: parseConfig(s.config_json),
    dataSourceName: s.data_source_id ? (groupNameById[s.data_source_id] || null) : null,
    isUnknownType: !registry[s.section_type]
  });
}

/*
 * 편집 대상 페이지를 정한다. ?page=<id> 가 있으면 그 페이지, 없으면 홈.
 *
 * ⚠️ 반드시 **몰 스코프로 검증**한다(builder.getPage 가 mall_id 를 함께 본다).
 *    안 하면 관리자가 ?page=<남의 몰 페이지> 로 다른 몰을 편집할 수 있다.
 *
 * 예전에는 홈만 편집할 수 있었다. 그래서 랜딩(/new)은 발행할 방법이 없었고,
 * 발행 스냅샷이 없는 페이지는 스토어프론트가 라이브 page_section 으로 폴백했다
 * = 빌더에서 고치는 순간 운영에 반영됐다. 이제 모든 SDUI 페이지를 편집·발행한다.
 */
async function resolvePage(req) {
  const mallId = req.adminMallId || 1;
  // GET 요청에는 req.body 가 아예 없을 수 있다(body parser 가 채우지 않는다) — 옵셔널 체이닝 필수.
  const requested = Number(req.query.page || (req.body && req.body.page_id)) || 0;
  if (requested) return await builder.getPage(requested, mallId);
  return await builder.getHomePage(mallId);
}

exports.getEditor = async (req, res) => {
  try {
    const mallId = req.adminMallId || 1;
    const pages = await builder.listPages(mallId);
    const page = await resolvePage(req);

    if (!page) {
      return res.status(404).render('admin/page-builder/editor', {
        layout: 'layouts/admin_layout',
        title: '페이지 빌더',
        subtitle: '편집할 페이지가 없습니다.',
        page: null, pages, sections: [], palette: buildPalette(), productGroups: [], revisions: []
      });
    }

    const [rawSections, productGroups, revisions] = await Promise.all([
      builder.getSections(page.id),
      builder.listProductGroups(),
      builder.listRevisions(page.id)
    ]);

    const groupNameById = {};
    for (const g of productGroups) groupNameById[g.id] = g.name;
    const sections = rawSections.map((s) => decorateSection(s, groupNameById));

    res.render('admin/page-builder/editor', {
      layout: 'layouts/admin_layout',
      title: '페이지 빌더',
      subtitle: '섹션을 추가·삭제·재정렬한 뒤 발행해야 스토어프론트에 반영됩니다.',
      page, pages, sections, palette: buildPalette(), productGroups, revisions
    });
  } catch (err) {
    console.error('[pageBuilder.getEditor]', err);
    res.status(500).send('페이지 빌더를 불러오지 못했습니다.');
  }
};

exports.postSectionAdd = async (req, res) => {
  try {
    const page = await resolvePage(req);
    if (!page) return res.status(404).json({ success: false, message: '페이지 없음' });
    const id = await builder.addSection(page.id, { section_type: req.body.section_type });
    res.json({ success: true, id });
  } catch (err) {
    console.error('[pageBuilder.postSectionAdd]', err);
    res.status(400).json({ success: false, message: err.message || '섹션 추가 실패' });
  }
};

exports.postSectionUpdate = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    const patch = {};
    if (b.title !== undefined) patch.title = String(b.title).trim();
    if (b.data_source_id !== undefined) patch.data_source_id = b.data_source_id;
    if (b.config !== undefined) patch.config_json = (b.config && typeof b.config === 'object') ? b.config : {};
    if (b.visible_start_at !== undefined) patch.visible_start_at = b.visible_start_at;
    if (b.visible_end_at !== undefined) patch.visible_end_at = b.visible_end_at;
    if (b.visible_on_pc !== undefined) patch.visible_on_pc = !!b.visible_on_pc;
    if (b.visible_on_mobile !== undefined) patch.visible_on_mobile = !!b.visible_on_mobile;
    if (b.is_active !== undefined) patch.is_active = !!b.is_active;

    await builder.updateSection(id, patch);
    res.json({ success: true });
  } catch (err) {
    console.error('[pageBuilder.postSectionUpdate]', err);
    res.status(400).json({ success: false, message: err.message || '섹션 저장 실패' });
  }
};

exports.postSectionDelete = async (req, res) => {
  try {
    await builder.deleteSection(Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error('[pageBuilder.postSectionDelete]', err);
    res.status(400).json({ success: false, message: '섹션 삭제 실패' });
  }
};

exports.postSectionDuplicate = async (req, res) => {
  try {
    const id = await builder.duplicateSection(Number(req.params.id));
    res.json({ success: true, id });
  } catch (err) {
    console.error('[pageBuilder.postSectionDuplicate]', err);
    res.status(400).json({ success: false, message: '섹션 복제 실패' });
  }
};

exports.postSectionReorder = async (req, res) => {
  try {
    const page = await resolvePage(req);
    const order = req.body.order;
    if (!page || !Array.isArray(order)) {
      return res.status(400).json({ success: false, message: '잘못된 요청' });
    }
    await builder.reorderSections(page.id, order.map(Number));
    res.json({ success: true });
  } catch (err) {
    console.error('[pageBuilder.postSectionReorder]', err);
    res.status(500).json({ success: false, message: '순서 변경 실패' });
  }
};

exports.postPublish = async (req, res) => {
  try {
    const page = await resolvePage(req);
    if (!page) return res.status(404).json({ success: false, message: '페이지 없음' });
    const by = (req.session.admin && req.session.admin.username) || null;
    const revisionNo = await builder.publish(page.id, by);
    res.json({ success: true, revisionNo });
  } catch (err) {
    console.error('[pageBuilder.postPublish]', err);
    res.status(500).json({ success: false, message: '발행 실패' });
  }
};

exports.postRollback = async (req, res) => {
  try {
    const page = await resolvePage(req);
    if (!page) return res.status(404).json({ success: false, message: '페이지 없음' });
    await builder.rollback(page.id, Number(req.params.revisionId));
    res.json({ success: true });
  } catch (err) {
    console.error('[pageBuilder.postRollback]', err);
    res.status(400).json({ success: false, message: err.message || '롤백 실패' });
  }
};
