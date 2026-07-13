const pool = require('../../config/db');
const registry = require('../../services/display/sectionRegistry');
const builder = require('../../services/display/pageBuilderService');
const displayService = require('../../services/display/displayService');
const mainController = require('../mainController');

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
    type,
    label: def.label,
    description: def.description || '',
    dataSource: def.dataSource || null
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

/* ────────────────────────────────────────────────────────────────
 * 섹션 카탈로그 미리보기 — "추가하기 전에 뭔지 알 수 있게"
 *
 * 팔레트가 라벨만 보여주던 시절엔 '혜택 벤토'·'랭킹 탭'이 무엇인지 추가해 보기 전엔
 * 알 수 없었다. 그래서 각 섹션 타입을 **실제 몰 데이터로 라이브 렌더**해 카드에 띄운다.
 * 스크린샷을 떠 두지 않는 이유: 테마·상품이 바뀌면 스크린샷은 그 즉시 거짓말이 된다.
 * ──────────────────────────────────────────────────────────────── */

/** 레지스트리 fields 의 default 로 config 를 만든다(= 추가 직후의 실제 초기 상태). */
function defaultConfig(def) {
  const cfg = {};
  for (const f of def.fields || []) {
    if (f.default !== undefined && f.default !== null) cfg[f.key] = f.default;
  }
  return cfg;
}

/*
 * 운영자가 아직 아무것도 안 넣은 섹션(퀵메뉴·커스텀HTML·혜택벤토 프로모블록)은
 * 기본 config 로 렌더하면 통째로 스킵돼 빈 화면이 된다. 그러면 "어떻게 보이는지"를
 * 못 답한다 — 그게 이 화면의 존재 이유인데. 그래서 그런 타입만 예시 값을 채운다.
 * 예시가 쓰이면 뷰가 "예시 데이터" 배너를 띄운다(실데이터로 오해하지 않도록).
 */
const SAMPLE_CONFIG = {
  quick_menu: {
    items: [
      { icon: 'bi-lightning-charge', label: '오늘특가', url: '/deals' },
      { icon: 'bi-award', label: '베스트', url: '/best' },
      { icon: 'bi-stars', label: '신상품', url: '/new' },
      { icon: 'bi-ticket-perforated', label: '쿠폰', url: '/coupons', badge: 'N' }
    ]
  },
  custom_html: {
    html: '<div style="padding:32px;text-align:center;background:#f8fafc;">'
      + '<h2 style="font-size:20px;font-weight:700;">여기에 원하는 HTML 이 들어갑니다</h2>'
      + '<p style="margin-top:8px;color:#64748b;font-size:14px;">이미지·표·문구 등 자유롭게 작성할 수 있습니다.</p>'
      + '</div>'
  },
  benefit_bento: {
    promoBlocks: [
      { copy: '첫 구매 10% 쿠폰', color: '#4F46E5', url: '/coupons' },
      { copy: '3만원 이상 무료배송', color: '#059669', url: '/notice' }
    ]
  }
};

/** 데이터가 0건이라 섹션이 스킵됐을 때, 운영자가 무엇을 채워야 하는지 알려준다. */
const EMPTY_REASON = {
  hero: '배너 관리에 노출 중인 MAIN 배너가 없습니다.',
  product_grid: '이 몰에 상품이 담긴 상품 그룹이 없습니다. 상품 그룹을 먼저 만드세요.',
  product_carousel: '이 몰에 상품이 담긴 상품 그룹이 없습니다. 상품 그룹을 먼저 만드세요.',
  best_ranking: '랭킹을 계산할 판매·좋아요 데이터가 아직 없습니다.',
  ranking_tabs: '랭킹 그룹(탭)이 없습니다. 상품 랭킹 관리에서 그룹을 만드세요.',
  deal_carousel: '지금 진행 중인 특가가 없습니다. 특가가 시작되면 자동으로 나타납니다.',
  brand_carousel: '상품이 등록된 브랜드 카테고리가 없습니다.',
  category_showcase: '상품이 담긴 카테고리가 없습니다.',
  promotion_banner: '배너 관리에 그룹 키로 묶인 배너가 없습니다.',
  recent_product: '최근 본 상품은 방문자마다 다릅니다. 관리자에게는 비어 보이는 것이 정상입니다.',
  new_by_category: '최근 등록된 신상품이 없습니다.',
  new_by_brand: '최근 등록된 신상품이 없습니다.',
  new_brand_list: '최근 입점한 브랜드가 없습니다.'
};

/** dataSource 가 있는 섹션에 미리보기용 실데이터 소스를 하나 골라준다. */
async function pickDataSource(def, mallId) {
  if (def.dataSource !== 'product_group') return null;
  // 상품이 실제로 담긴 그룹을 고른다. 빈 그룹을 고르면 리졸버가 스킵해 미리보기가 빈다.
  const [rows] = await pool.query(`
    SELECT g.id
      FROM product_group g
      JOIN product_group_item i ON i.group_id = g.id
     WHERE g.is_active = 1 AND g.mall_id = ?
     GROUP BY g.id
     HAVING COUNT(i.product_id) > 0
     ORDER BY g.id ASC
     LIMIT 1
  `, [mallId]);
  if (rows.length) return rows[0].id;

  // 자동 그룹(조건형)은 아이템 행이 없을 수 있다 — 그때는 아무 활성 그룹이나.
  const [any] = await pool.query(
    'SELECT id FROM product_group WHERE is_active = 1 AND mall_id = ? ORDER BY id ASC LIMIT 1', [mallId]
  );
  return any.length ? any[0].id : null;
}

/** promotion_banner 는 config.groupKey 가 있어야 렌더된다 — 실제 존재하는 키를 하나 집어준다. */
async function pickBannerGroupKey() {
  const [rows] = await pool.query(`
    SELECT group_key FROM banners
     WHERE is_active = 1 AND group_key IS NOT NULL AND group_key <> ''
     GROUP BY group_key ORDER BY MIN(display_order) ASC, group_key ASC LIMIT 1
  `);
  return rows.length ? rows[0].group_key : null;
}

/** GET /admin/page-builder/section-preview?type=<section_type> — iframe 소스 */
exports.getSectionPreview = async (req, res) => {
  const type = String(req.query.type || '');
  const def = registry[type];
  if (!def) return res.status(404).send('알 수 없는 섹션 타입입니다.');

  try {
    const mallId = req.adminMallId || 1;
    // 리졸버·히어로가 편집 중인 몰로 스코프되도록 맞춘다(미리보기 전용, 요청 안에서만 유효).
    req.mallId = mallId;

    const sample = SAMPLE_CONFIG[type] || null;
    const config = Object.assign(defaultConfig(def), sample || {});
    if (type === 'promotion_banner' && !config.groupKey) {
      config.groupKey = await pickBannerGroupKey();
    }

    const row = {
      id: 0,
      section_type: type,
      title: def.label,
      config_json: JSON.stringify(config),
      data_source_id: await pickDataSource(def, mallId),
      is_active: 1,
      sort_order: 0
    };

    const { shared } = await mainController.buildHomeContext(req, res);
    const sections = await displayService.resolveSections([row], shared);

    res.render('admin/page-builder/section_preview', {
      layout: 'layouts/main_layout',
      isBare: true, // 헤더·푸터 없이 섹션만
      title: def.label,
      sections,
      isSample: Boolean(sample) && sections.length > 0,
      emptyReason: EMPTY_REASON[type] || '이 섹션을 채울 데이터가 아직 없습니다.'
    });
  } catch (err) {
    console.error('[pageBuilder.getSectionPreview]', type, err);
    res.status(500).send('섹션 미리보기를 그리지 못했습니다.');
  }
};
