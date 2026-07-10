const pool = require('../../config/db');
const mallContext = require('../../middleware/mallContext');

/*
 * 몰 관리 (P5 관리자편 Phase 2) — `mall` 정의 테이블 CRUD
 *
 * 몰을 추가·수정·삭제하고 기본몰을 지정한다. 스토어프론트/관리자 해석기가
 * 이 테이블을 캐시하므로, 변경 후 mallContext.invalidate() 로 캐시를 비운다.
 *
 * 반드시 지켜야 할 불변식:
 *   - 기본몰(is_default=1)은 **정확히 하나**. 새로 지정하면 나머지를 내린다(트랜잭션).
 *   - **기본몰은 삭제·비활성 불가** — 해석기의 폴백 대상이라 없으면 몰 해석이 깨진다.
 *   - **데이터(카테고리·상품)가 있는 몰은 삭제 불가** — mall_id 참조에 FK 가 없어
 *     몰 행만 지우면 고아 데이터가 남는다. 먼저 데이터를 비워야 한다.
 */

const CODE_RE = /^[a-z0-9_-]{2,50}$/;

function normalizeCode(v) {
    return String(v || '').trim().toLowerCase();
}

/** 이 몰이 보유한 데이터 수(삭제 가드용) */
async function mallDataCounts(mallId) {
    const [[c]] = await pool.query('SELECT COUNT(*) n FROM categories WHERE mall_id = ?', [mallId]);
    const [[p]] = await pool.query('SELECT COUNT(*) n FROM products WHERE mall_id = ?', [mallId]);
    return { categories: c.n, products: p.n };
}

/** GET /admin/malls */
exports.getList = async (req, res) => {
    try {
        const [malls] = await pool.query('SELECT * FROM mall ORDER BY is_default DESC, id ASC');
        for (const m of malls) {
            m.counts = await mallDataCounts(m.id);
        }
        res.render('admin/malls/list', {
            layout: 'layouts/admin_layout',
            title: '몰 관리',
            malls,
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[mall] getList:', err.message);
        res.status(500).send('Server Error');
    }
};

/** GET /admin/malls/new · /admin/malls/:id */
async function renderForm(res, mall, extra = {}) {
    res.render('admin/malls/form', Object.assign({
        layout: 'layouts/admin_layout',
        title: mall.id ? '몰 수정' : '몰 등록',
        mall,
        error: null,
    }, extra));
}

exports.getNew = async (req, res) => {
    await renderForm(res, { id: null, code: '', name: '', domain: '', is_active: 1, is_default: 0 });
};

exports.getEdit = async (req, res) => {
    try {
        const [[mall]] = await pool.query('SELECT * FROM mall WHERE id = ?', [req.params.id]);
        if (!mall) return res.redirect('/admin/malls?error=' + encodeURIComponent('몰을 찾을 수 없습니다.'));
        await renderForm(res, mall);
    } catch (err) {
        console.error('[mall] getEdit:', err.message);
        res.status(500).send('Server Error');
    }
};

/** 기본몰 지정: 트랜잭션으로 나머지를 내리고 이 몰만 올린다. */
async function setDefault(conn, mallId) {
    await conn.query('UPDATE mall SET is_default = 0 WHERE id <> ?', [mallId]);
    await conn.query('UPDATE mall SET is_default = 1, is_active = 1 WHERE id = ?', [mallId]); // 기본몰은 항상 활성
}

/** POST /admin/malls — 생성 */
exports.postAdd = async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const code = normalizeCode(req.body.code);
        const name = String(req.body.name || '').trim();
        if (!CODE_RE.test(code)) return renderForm(res, { id: null, code, name, domain: req.body.domain, is_active: 1, is_default: 0 }, { error: '코드는 소문자·숫자·-·_ 2~50자여야 합니다.' });
        if (!name) return renderForm(res, { id: null, code, name, domain: req.body.domain, is_active: 1, is_default: 0 }, { error: '몰 이름을 입력하세요.' });

        const [[dup]] = await conn.query('SELECT id FROM mall WHERE code = ?', [code]);
        if (dup) return renderForm(res, { id: null, code, name, domain: req.body.domain, is_active: 1, is_default: 0 }, { error: `코드 '${code}' 는 이미 사용 중입니다.` });

        await conn.beginTransaction();
        const [r] = await conn.query(
            'INSERT INTO mall (code, name, domain, is_active, is_default) VALUES (?, ?, ?, ?, 0)',
            [code, name.slice(0, 100), String(req.body.domain || '').trim() || null, req.body.is_active ? 1 : 0]
        );
        if (req.body.is_default) await setDefault(conn, r.insertId);

        // 새 몰이 최소한 GNB 설정을 갖도록 navigation_config 를 만들어 둔다(빈 스토어 방지).
        await conn.query(`
            INSERT IGNORE INTO navigation_config (mall_id, header_layout_type, category_display_type, max_gnb_items, max_custom_items, category_max_depth, use_mega_menu, use_search_bar)
            VALUES (?, 'main_right_utility_v1', 'dropdown', 8, 3, 3, 0, 1)`, [r.insertId]);

        await conn.commit();
        mallContext.invalidate();
        res.redirect('/admin/malls?saved=1');
    } catch (err) {
        await conn.rollback();
        console.error('[mall] postAdd:', err.message);
        res.status(500).send('Server Error');
    } finally {
        conn.release();
    }
};

/** POST /admin/malls/:id — 수정 */
exports.postEdit = async (req, res) => {
    const id = Number(req.params.id);
    const conn = await pool.getConnection();
    try {
        const [[mall]] = await conn.query('SELECT * FROM mall WHERE id = ?', [id]);
        if (!mall) return res.redirect('/admin/malls?error=' + encodeURIComponent('몰을 찾을 수 없습니다.'));

        const code = normalizeCode(req.body.code);
        const name = String(req.body.name || '').trim();
        if (!CODE_RE.test(code) || !name) return renderForm(res, Object.assign({}, mall, { code, name }), { error: '코드/이름을 확인하세요.' });

        const [[dup]] = await conn.query('SELECT id FROM mall WHERE code = ? AND id <> ?', [code, id]);
        if (dup) return renderForm(res, Object.assign({}, mall, { code, name }), { error: `코드 '${code}' 는 다른 몰이 쓰고 있습니다.` });

        const wantDefault = !!req.body.is_default;
        let wantActive = req.body.is_active ? 1 : 0;

        // 기본몰은 비활성 불가(해석기 폴백 대상). 기본몰이거나 기본몰로 지정 중이면 활성 강제.
        if (mall.is_default && !wantActive && !wantDefault) {
            return renderForm(res, Object.assign({}, mall, { code, name }), { error: '기본몰은 비활성화할 수 없습니다. 다른 몰을 먼저 기본몰로 지정하세요.' });
        }
        if (wantDefault) wantActive = 1;

        await conn.beginTransaction();
        await conn.query('UPDATE mall SET code = ?, name = ?, domain = ?, is_active = ? WHERE id = ?',
            [code, name.slice(0, 100), String(req.body.domain || '').trim() || null, wantActive, id]);
        if (wantDefault && !mall.is_default) await setDefault(conn, id);
        await conn.commit();

        mallContext.invalidate();
        res.redirect('/admin/malls?saved=1');
    } catch (err) {
        await conn.rollback();
        console.error('[mall] postEdit:', err.message);
        res.status(500).send('Server Error');
    } finally {
        conn.release();
    }
};

/** POST /admin/malls/:id/delete */
exports.postDelete = async (req, res) => {
    const id = Number(req.params.id);
    try {
        const [[mall]] = await pool.query('SELECT * FROM mall WHERE id = ?', [id]);
        if (!mall) return res.redirect('/admin/malls');

        if (mall.is_default) {
            return res.redirect('/admin/malls?error=' + encodeURIComponent('기본몰은 삭제할 수 없습니다. 다른 몰을 기본몰로 지정한 뒤 삭제하세요.'));
        }
        const counts = await mallDataCounts(id);
        if (counts.categories > 0 || counts.products > 0) {
            return res.redirect('/admin/malls?error=' + encodeURIComponent(
                `이 몰에 카테고리 ${counts.categories}개·상품 ${counts.products}개가 있어 삭제할 수 없습니다. 먼저 데이터를 비우세요(예: 종합관은 scripts/seed_mall2_general.js --remove).`));
        }

        // 몰 소유의 설정 행은 함께 정리(FK 없음). 데이터(카테고리·상품)는 위에서 0 임을 보장.
        await pool.query('DELETE FROM navigation_config WHERE mall_id = ?', [id]);
        await pool.query('DELETE FROM mall_feature_menu WHERE mall_id = ?', [id]);
        await pool.query('DELETE FROM theme WHERE mall_id = ?', [id]);
        await pool.query('DELETE FROM mall WHERE id = ?', [id]);

        mallContext.invalidate();
        res.redirect('/admin/malls?saved=1');
    } catch (err) {
        console.error('[mall] postDelete:', err.message);
        res.status(500).send('Server Error');
    }
};
