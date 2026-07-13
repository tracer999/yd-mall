const pool = require('../../config/db');
const svc = require('../../services/exhibition/exhibitionService');
const { sanitize } = require('../../services/display/htmlSanitizer');

/*
 * 기획전 관리 (1차)
 *
 * 설계: docs/사이트개선/exhibition_design_and_development.md §4, §8-2
 *
 * 이 저장소 관리자 표준을 따른다 — 폼 POST + EJS + res.redirect.
 * JSON 을 돌려주는 것은 상품 검색(모달) 하나뿐이다.
 *
 * ── 몰 스코프 ──
 * 모든 쿼리에 `mall_id = req.adminMallId` 를 건다. 하위 테이블(section/product)은
 * mall_id 컬럼이 없으므로, 반드시 부모 exhibition 을 몰 스코프로 먼저 확인한 뒤 손댄다.
 * 그렇지 않으면 id 만 갈아끼운 요청으로 다른 몰의 기획전을 편집할 수 있다.
 *
 * ── 상태 ──
 * status 는 DRAFT/PUBLISHED/HIDDEN 만 저장한다. 예정·진행중·종료는 기간에서 파생된다(§7-1).
 */

const BASE = '/admin/exhibitions';

/** multer 가 처리할 이미지 필드 ↔ exhibition 컬럼 */
const IMAGE_FIELDS = [
    { field: 'list_thumbnail', column: 'list_thumbnail_url' },
    { field: 'pc_hero_image', column: 'pc_hero_image_url' },
    { field: 'mobile_hero_image', column: 'mobile_hero_image_url' },
    { field: 'og_image', column: 'og_image_url' },
];

const redirectWith = (res, path, key, msg) =>
    res.redirect(`${path}?${key}=${encodeURIComponent(msg)}`);

/** `datetime-local` 값 → MySQL datetime. 빈 값은 null. */
function toDateTime(raw) {
    const v = String(raw || '').trim();
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return v.replace('T', ' ').slice(0, 19) + (v.length === 16 ? ':00' : '');
}

/** MySQL datetime → `datetime-local` 입력값 */
function toLocalInput(v) {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 업로드된 파일 → `/uploads/...` 경로. 없으면 기존 값 유지, `*_clear` 체크 시 null. */
function resolveImage(req, field, currentValue) {
    const file = req.files && req.files[field] && req.files[field][0];
    if (file) return file.path.replace(/^public/, '').replace(/\\/g, '/');
    if (req.body[`${field}_clear`]) return null;
    return currentValue === undefined ? null : currentValue;
}

/** 이 몰의 기획전인지 확인하고 행을 돌려준다. 아니면 null. */
async function findOwned(mallId, id) {
    const [[row]] = await pool.query('SELECT * FROM exhibition WHERE id = ? AND mall_id = ?', [id, mallId]);
    return row || null;
}

/** 기본정보 폼 → 컬럼 값 */
function buildBasicFields(req, current = {}) {
    const b = req.body;
    return {
        title: String(b.title || '').trim().slice(0, 200),
        summary: String(b.summary || '').trim().slice(0, 500) || null,
        // 운영자 입력 HTML — 저장 시 새니타이즈(렌더 시 한 번 더 통과시킨다)
        description: sanitize(String(b.description || '')) || null,
        exhibition_type: svc.pick(svc.TYPES, b.exhibition_type, 'THEME'),
        // 브랜드 귀속 — 지정하면 그 브랜드의 브랜드관/브랜드 허브에 "브랜드 위크"로 노출된다.
        // 비워두면 편성 상품의 브랜드에 '기획전 참여'로만 잡힌다.
        brand_category_id: /^\d+$/.test(String(b.brand_category_id || '').trim())
            ? Number(b.brand_category_id) : null,
        status: svc.pick(svc.STATUSES, b.status, 'DRAFT'),
        start_at: toDateTime(b.start_at),
        end_at: toDateTime(b.end_at),
        list_visible: b.list_visible ? 1 : 0,
        search_visible: b.search_visible ? 1 : 0,
        share_enabled: b.share_enabled ? 1 : 0,
        detail_template_type: svc.pick(svc.TEMPLATES, b.detail_template_type, 'TAB_SHOP'),
        ended_access_policy: svc.pick(svc.ENDED_ACCESS_POLICIES, b.ended_access_policy, 'ALLOW'),
        ended_purchase_policy: svc.pick(svc.ENDED_PURCHASE_POLICIES, b.ended_purchase_policy, 'ALLOW'),
        display_config_json: JSON.stringify(Object.assign({}, svc.parseJson(current.display_config_json), {
            hide_sold_out: Boolean(b.hide_sold_out),
            notice: sanitize(String(b.notice || '')),
        })),
    };
}

/* ── 목록 ────────────────────────────────────────────── */

/** GET /admin/exhibitions */
exports.getList = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const q = String(req.query.q || '').trim();
        const status = svc.values(svc.STATUSES).includes(req.query.status) ? req.query.status : '';

        const where = ['e.mall_id = ?'];
        const params = [mallId];
        if (q) { where.push('(e.title LIKE ? OR e.slug LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
        if (status) { where.push('e.status = ?'); params.push(status); }

        const [rows] = await pool.query(`
            SELECT e.*,
                   (SELECT COUNT(*) FROM exhibition_product ep WHERE ep.exhibition_id = e.id) AS product_count,
                   (SELECT COUNT(*) FROM custom_menu cm
                     WHERE cm.link_type = 'EXHIBITION' AND cm.link_target = e.id AND cm.mall_id = e.mall_id) AS menu_count
              FROM exhibition e
             WHERE ${where.join(' AND ')}
             ORDER BY e.id DESC
        `, params);

        const now = new Date();
        res.render('admin/exhibitions/list', {
            layout: 'layouts/admin_layout',
            title: '기획전 관리',
            subtitle: '시즌·브랜드·테마별 상품 전시 랜딩을 만들고 관리합니다.',
            exhibitions: rows.map(r => svc.decorate(r, now)),
            statuses: svc.STATUSES,
            types: svc.TYPES,
            q,
            status,
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[exhibition] getList:', err.message);
        res.status(500).send('Server Error');
    }
};

/* ── 등록·수정 폼 ─────────────────────────────────────── */

async function renderForm(req, res, exhibition, extra = {}) {
    const isNew = !exhibition.id;
    const sections = isNew ? [] : await svc.getSections(exhibition.id, { activeOnly: false });

    let products = [];
    if (!isNew) {
        const [rows] = await pool.query(`
            SELECT ep.*, p.name, p.main_image, p.price, p.status AS product_status
              FROM exhibition_product ep
              JOIN products p ON p.id = ep.product_id
             WHERE ep.exhibition_id = ?
             ORDER BY ep.is_fixed DESC, ep.sort_order ASC, ep.id ASC
        `, [exhibition.id]);
        products = rows;
    }

    const config = svc.parseJson(exhibition.display_config_json);

    // 브랜드 귀속 자동완성의 초기 표시값 (id 만으로는 이름을 못 그린다)
    let ownedBrandName = null;
    if (exhibition.brand_category_id) {
        const [[b]] = await pool.query(
            "SELECT name FROM categories WHERE id = ? AND type = 'BRAND'", [exhibition.brand_category_id]
        );
        ownedBrandName = b?.name || null;
    }

    res.render('admin/exhibitions/edit', Object.assign({
        layout: 'layouts/admin_layout',
        ownedBrandName,
        title: isNew ? '기획전 등록' : '기획전 수정',
        subtitle: isNew ? null : exhibition.title,
        exhibition: Object.assign({}, exhibition, {
            start_at_input: toLocalInput(exhibition.start_at),
            end_at_input: toLocalInput(exhibition.end_at),
        }),
        config,
        sections,
        products,
        phase: isNew ? null : svc.derivePhase(exhibition),
        phaseLabels: svc.PHASE_LABELS,
        statuses: svc.STATUSES,
        types: svc.TYPES,
        templates: svc.TEMPLATES,
        sectionTypes: svc.SECTION_TYPES,
        endedAccessPolicies: svc.ENDED_ACCESS_POLICIES,
        endedPurchasePolicies: svc.ENDED_PURCHASE_POLICIES,
        saved: false,
        error: null,
    }, extra));
}

/** GET /admin/exhibitions/add */
exports.getAdd = async (req, res) => {
    try {
        await renderForm(req, res, {
            id: null, title: '', slug: '', summary: '', description: '',
            exhibition_type: 'THEME', status: 'DRAFT', brand_category_id: null,
            start_at: new Date(), end_at: null,
            list_visible: 1, search_visible: 1, share_enabled: 1,
            detail_template_type: 'TAB_SHOP',
            ended_access_policy: 'ALLOW', ended_purchase_policy: 'ALLOW',
            display_config_json: null, view_count: 0,
            list_thumbnail_url: null, pc_hero_image_url: null,
            mobile_hero_image_url: null, og_image_url: null,
        });
    } catch (err) {
        console.error('[exhibition] getAdd:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/exhibitions/add */
exports.postAdd = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const fields = buildBasicFields(req);
        if (!fields.title) return redirectWith(res, `${BASE}/add`, 'error', '기획전명을 입력하세요.');
        if (!fields.start_at) return redirectWith(res, `${BASE}/add`, 'error', '시작일을 입력하세요.');
        if (fields.end_at && fields.end_at < fields.start_at) {
            return redirectWith(res, `${BASE}/add`, 'error', '종료일이 시작일보다 빠릅니다.');
        }

        // slug 미입력 시 제목에서 만든다. (mall_id, slug) 유니크는 ensureUniqueSlug 가 지킨다.
        const slug = await svc.ensureUniqueSlug(mallId, req.body.slug || fields.title);

        const images = {};
        IMAGE_FIELDS.forEach(({ field, column }) => { images[column] = resolveImage(req, field, null); });

        const [r] = await pool.query(
            `INSERT INTO exhibition (mall_id, slug, ${Object.keys(fields).join(', ')}, ${Object.keys(images).join(', ')})
             VALUES (?, ?, ${Object.keys(fields).map(() => '?').join(', ')}, ${Object.keys(images).map(() => '?').join(', ')})`,
            [mallId, slug, ...Object.values(fields), ...Object.values(images)]
        );

        res.redirect(`${BASE}/${r.insertId}/edit?saved=1`);
    } catch (err) {
        console.error('[exhibition] postAdd:', err.message);
        redirectWith(res, `${BASE}/add`, 'error', '저장 중 오류가 발생했습니다.');
    }
};

/** GET /admin/exhibitions/:id/edit */
exports.getEdit = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const exhibition = await findOwned(mallId, req.params.id);
        if (!exhibition) return redirectWith(res, BASE, 'error', '기획전을 찾을 수 없습니다.');

        await renderForm(req, res, exhibition, {
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[exhibition] getEdit:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/exhibitions/:id/edit */
exports.postEdit = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const back = `${BASE}/${id}/edit`;
    try {
        const current = await findOwned(mallId, id);
        if (!current) return redirectWith(res, BASE, 'error', '기획전을 찾을 수 없습니다.');

        const fields = buildBasicFields(req, current);
        if (!fields.title) return redirectWith(res, back, 'error', '기획전명을 입력하세요.');
        if (!fields.start_at) return redirectWith(res, back, 'error', '시작일을 입력하세요.');
        if (fields.end_at && fields.end_at < fields.start_at) {
            return redirectWith(res, back, 'error', '종료일이 시작일보다 빠릅니다.');
        }

        const slug = await svc.ensureUniqueSlug(mallId, req.body.slug || fields.title, id);

        const images = {};
        IMAGE_FIELDS.forEach(({ field, column }) => { images[column] = resolveImage(req, field, current[column]); });

        const assigns = Object.keys(fields).concat(Object.keys(images)).map(k => `${k} = ?`);
        await pool.query(
            `UPDATE exhibition SET slug = ?, ${assigns.join(', ')} WHERE id = ? AND mall_id = ?`,
            [slug, ...Object.values(fields), ...Object.values(images), id, mallId]
        );

        res.redirect(`${back}?saved=1`);
    } catch (err) {
        console.error('[exhibition] postEdit:', err.message);
        redirectWith(res, back, 'error', '저장 중 오류가 발생했습니다.');
    }
};

/** POST /admin/exhibitions/:id/delete */
exports.postDelete = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    try {
        // custom_menu.link_target 에는 FK 가 없다. 지우면 메뉴가 죽은 링크를 든 채 남는다.
        const [[menu]] = await pool.query(
            "SELECT COUNT(*) AS c FROM custom_menu WHERE link_type = 'EXHIBITION' AND link_target = ? AND mall_id = ?",
            [id, mallId]
        );
        if (Number(menu.c) > 0) {
            return redirectWith(res, BASE, 'error',
                `커스텀 메뉴 ${menu.c}개가 이 기획전을 연결하고 있어 삭제할 수 없습니다. 먼저 메뉴 연결을 해제하세요.`);
        }

        // exhibition_section·exhibition_product 는 ON DELETE CASCADE 로 함께 지워진다.
        await pool.query('DELETE FROM exhibition WHERE id = ? AND mall_id = ?', [id, mallId]);
        res.redirect(`${BASE}?saved=1`);
    } catch (err) {
        console.error('[exhibition] postDelete:', err.message);
        redirectWith(res, BASE, 'error', '삭제 중 오류가 발생했습니다.');
    }
};

/* ── 섹션(내부 탭) 일괄 저장 ──────────────────────────── */

/**
 * POST /admin/exhibitions/:id/sections
 *
 * 폼은 섹션 배열을 보낸다: sections[i][id|section_name|section_code|section_type|...]
 * id 가 없으면 신규, `_delete` 가 켜지면 삭제.
 *
 * 삭제된 섹션을 참조하던 exhibition_product 는 FK ON DELETE CASCADE 로 **함께 사라진다**.
 * 상품 매핑까지 날아가므로 화면에서 경고한다.
 */
exports.postSaveSections = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const back = `${BASE}/${id}/edit`;

    const conn = await pool.getConnection();
    try {
        const exhibition = await findOwned(mallId, id);
        if (!exhibition) { conn.release(); return redirectWith(res, BASE, 'error', '기획전을 찾을 수 없습니다.'); }

        const raw = req.body.sections;
        const rows = raw ? (Array.isArray(raw) ? raw : Object.values(raw)) : [];

        await conn.beginTransaction();

        const seenCodes = new Set();
        for (let i = 0; i < rows.length; i++) {
            const s = rows[i] || {};
            const sectionId = Number.parseInt(s.id, 10);

            if (s._delete) {
                if (Number.isFinite(sectionId)) {
                    await conn.query('DELETE FROM exhibition_section WHERE id = ? AND exhibition_id = ?', [sectionId, id]);
                }
                continue;
            }

            const name = String(s.section_name || '').trim().slice(0, 100);
            if (!name) continue; // 빈 행은 무시

            let code = svc.normalizeSlug(s.section_code || name).slice(0, 100);
            if (!code) code = `section-${i + 1}`;
            if (code === 'all') code = 'all-section'; // '전체' 탭 예약어와 충돌 방지
            // (exhibition_id, section_code) 유니크 — 한 요청 안의 중복도 막는다
            while (seenCodes.has(code)) code = `${code}-${i + 1}`.slice(0, 100);
            seenCodes.add(code);

            const type = svc.pick(svc.SECTION_TYPES, s.section_type, 'PRODUCT_GRID');
            const config = JSON.stringify({ html: type === 'HTML' ? sanitize(String(s.html || '')) : '' });

            if (Number.isFinite(sectionId)) {
                await conn.query(`
                    UPDATE exhibition_section
                       SET section_name = ?, section_code = ?, section_type = ?,
                           sort_order = ?, is_tab = ?, is_active = ?, display_config_json = ?
                     WHERE id = ? AND exhibition_id = ?
                `, [name, code, type, i + 1, s.is_tab ? 1 : 0, s.is_active ? 1 : 0, config, sectionId, id]);
            } else {
                await conn.query(`
                    INSERT INTO exhibition_section
                        (exhibition_id, section_name, section_code, section_type, sort_order, is_tab, is_active, display_config_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [id, name, code, type, i + 1, s.is_tab ? 1 : 0, s.is_active ? 1 : 0, config]);
            }
        }

        await conn.commit();
        res.redirect(`${back}?saved=1`);
    } catch (err) {
        await conn.rollback();
        console.error('[exhibition] postSaveSections:', err.message);
        redirectWith(res, back, 'error', '섹션 저장 중 오류가 발생했습니다.');
    } finally {
        conn.release();
    }
};

/* ── 상품 매핑 ────────────────────────────────────────── */

/** 요청의 section_id 가 이 기획전의 섹션인지 확인한다. 빈 값이면 null(전체 탭). */
async function resolveSectionId(exhibitionId, raw) {
    const sectionId = Number.parseInt(raw, 10);
    if (!Number.isFinite(sectionId)) return null;
    const [[row]] = await pool.query(
        'SELECT id FROM exhibition_section WHERE id = ? AND exhibition_id = ?', [sectionId, exhibitionId]
    );
    return row ? sectionId : null;
}

/**
 * POST /admin/exhibitions/:id/products/add — 상품 담기
 *
 * uk_exh_product 는 (exhibition_id, section_id, product_id) 인데 section_id 가 NULL 이면
 * MySQL 유니크가 걸리지 않는다(NULL ≠ NULL). 섹션 미배정 중복은 여기서 막는다(§7-4 주석).
 */
exports.postAddProduct = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const back = `${BASE}/${id}/edit`;
    try {
        const exhibition = await findOwned(mallId, id);
        if (!exhibition) return redirectWith(res, BASE, 'error', '기획전을 찾을 수 없습니다.');

        const productId = Number.parseInt(req.body.product_id, 10);
        if (!Number.isFinite(productId)) return res.redirect(back);

        // 다른 몰 상품을 이 몰의 기획전에 담지 못하게 한다(요청 위조 차단).
        const [[prod]] = await pool.query('SELECT id FROM products WHERE id = ? AND mall_id = ?', [productId, mallId]);
        if (!prod) return redirectWith(res, back, 'error', '이 몰의 상품이 아닙니다.');

        const sectionId = await resolveSectionId(id, req.body.section_id);

        const [[dup]] = await pool.query(`
            SELECT id FROM exhibition_product
             WHERE exhibition_id = ? AND product_id = ?
               AND ${sectionId === null ? 'section_id IS NULL' : 'section_id = ?'}
        `, sectionId === null ? [id, productId] : [id, productId, sectionId]);
        if (dup) return redirectWith(res, back, 'error', '이미 담긴 상품입니다.');

        const [[maxRow]] = await pool.query(
            'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM exhibition_product WHERE exhibition_id = ?', [id]
        );
        await pool.query(
            'INSERT INTO exhibition_product (exhibition_id, section_id, product_id, sort_order) VALUES (?, ?, ?, ?)',
            [id, sectionId, productId, maxRow.next_order]
        );
        res.redirect(`${back}?saved=1`);
    } catch (err) {
        console.error('[exhibition] postAddProduct:', err.message);
        redirectWith(res, back, 'error', '상품 추가 중 오류가 발생했습니다.');
    }
};

/**
 * POST /admin/exhibitions/:id/products — 매핑 일괄 저장
 * 배지·MD코멘트·섹션 배정·순서·노출·구매 여부를 한 번에 갱신한다.
 */
exports.postSaveProducts = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const back = `${BASE}/${id}/edit`;

    const conn = await pool.getConnection();
    try {
        const exhibition = await findOwned(mallId, id);
        if (!exhibition) { conn.release(); return redirectWith(res, BASE, 'error', '기획전을 찾을 수 없습니다.'); }

        const raw = req.body.products;
        const rows = raw ? (Array.isArray(raw) ? raw : Object.values(raw)) : [];

        const [sectionRows] = await conn.query('SELECT id FROM exhibition_section WHERE exhibition_id = ?', [id]);
        const validSections = new Set(sectionRows.map(r => Number(r.id)));

        await conn.beginTransaction();
        for (let i = 0; i < rows.length; i++) {
            const p = rows[i] || {};
            const mappingId = Number.parseInt(p.mapping_id, 10);
            if (!Number.isFinite(mappingId)) continue;

            const sectionId = validSections.has(Number.parseInt(p.section_id, 10))
                ? Number.parseInt(p.section_id, 10)
                : null;

            await conn.query(`
                UPDATE exhibition_product
                   SET section_id = ?, sort_order = ?, is_fixed = ?, display_badge = ?,
                       display_comment = ?, visible = ?, purchase_enabled = ?
                 WHERE id = ? AND exhibition_id = ?
            `, [
                sectionId,
                Number.parseInt(p.sort_order, 10) || i + 1,
                p.is_fixed ? 1 : 0,
                String(p.display_badge || '').trim().slice(0, 50) || null,
                String(p.display_comment || '').trim().slice(0, 200) || null,
                p.visible ? 1 : 0,
                p.purchase_enabled ? 1 : 0,
                mappingId, id,
            ]);
        }
        await conn.commit();
        res.redirect(`${back}?saved=1`);
    } catch (err) {
        await conn.rollback();
        console.error('[exhibition] postSaveProducts:', err.message);
        // (exhibition_id, section_id, product_id) 유니크 위반 — 같은 상품을 같은 섹션에 두 번 배정
        const msg = err.code === 'ER_DUP_ENTRY'
            ? '같은 섹션에 같은 상품을 두 번 배정할 수 없습니다.'
            : '상품 저장 중 오류가 발생했습니다.';
        redirectWith(res, back, 'error', msg);
    } finally {
        conn.release();
    }
};

/** POST /admin/exhibitions/:id/products/:mappingId/delete */
exports.postRemoveProduct = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    try {
        const exhibition = await findOwned(mallId, id);
        if (!exhibition) return redirectWith(res, BASE, 'error', '기획전을 찾을 수 없습니다.');

        await pool.query('DELETE FROM exhibition_product WHERE id = ? AND exhibition_id = ?', [req.params.mappingId, id]);
        res.redirect(`${BASE}/${id}/edit?saved=1`);
    } catch (err) {
        console.error('[exhibition] postRemoveProduct:', err.message);
        redirectWith(res, `${BASE}/${id}/edit`, 'error', '상품 삭제 중 오류가 발생했습니다.');
    }
};

/**
 * GET /admin/exhibitions/product-search?q=&exhibitionId= — AJAX (상품 선택 모달)
 * productGroupController.getProductSearch 의 응답 형태를 따른다.
 */
exports.getProductSearch = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const q = String(req.query.q || '').trim();
        if (!q) return res.json({ products: [] });

        const [products] = await pool.query(`
            SELECT p.id, p.name, p.main_image, p.price, p.status, p.product_badge
              FROM products p
             WHERE p.mall_id = ? AND p.name LIKE ?
             ORDER BY p.created_at DESC
             LIMIT 20
        `, [mallId, `%${q}%`]);

        res.json({ products });
    } catch (err) {
        console.error('[exhibition] getProductSearch:', err.message);
        res.status(500).json({ products: [] });
    }
};
