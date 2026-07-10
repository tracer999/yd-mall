const pool = require('../../config/db');
const { sanitize } = require('../../services/display/htmlSanitizer');

/*
 * 고객센터 FAQ 관리 (운영/시스템 관리 > 고객센터 관리)
 *
 * `faq` / `faq_category` 테이블과 `/cs` 스토어프론트는 M8 에서 완료됐고 관리 UI 만 없었다.
 *
 * `faq.answer` 는 HTML 이다. `csController` 가 렌더 시 새니타이즈하지만,
 * 여기서도 **저장 시 새니타이즈**해 이중 방어한다(pageBuilderService.updateSection 과 같은 원칙).
 * 저장된 것이 곧 노출되는 것이어야 관리자가 결과를 예측할 수 있다.
 *
 * `faq_category.code` 는 고정 식별자다. 운영자는 분류명(name)만 바꾼다.
 */

const MALL_ID = 1;

async function loadCategories() {
    const [rows] = await pool.query(
        'SELECT id, code, name FROM faq_category WHERE mall_id = ? AND is_active = 1 ORDER BY sort_order, id', [MALL_ID]
    );
    return rows;
}

/** GET /admin/faqs */
exports.getList = async (req, res) => {
    try {
        const categoryId = Number.parseInt(req.query.category_id, 10);
        const where = ['f.mall_id = ?'];
        const params = [MALL_ID];
        if (Number.isFinite(categoryId)) { where.push('f.category_id = ?'); params.push(categoryId); }

        const [faqs] = await pool.query(`
            SELECT f.id, f.question, f.is_active, f.is_best, f.sort_order, f.view_count, f.updated_at,
                   c.name AS category_name
            FROM faq f
            LEFT JOIN faq_category c ON c.id = f.category_id
            WHERE ${where.join(' AND ')}
            ORDER BY c.sort_order, f.sort_order, f.id
        `, params);

        res.render('admin/faqs/list', {
            layout: 'layouts/admin_layout',
            title: '고객센터 관리',
            faqs,
            categories: await loadCategories(),
            selectedCategory: Number.isFinite(categoryId) ? categoryId : null,
            saved: req.query.saved === '1',
        });
    } catch (err) {
        console.error('[faq] getList:', err.message);
        res.status(500).send('Server Error');
    }
};

async function renderForm(res, faq) {
    res.render('admin/faqs/form', {
        layout: 'layouts/admin_layout',
        title: faq.id ? 'FAQ 수정' : 'FAQ 등록',
        faq,
        categories: await loadCategories(),
        tinymceKey: process.env.TINYMCE_KEY || '',
    });
}

/** GET /admin/faqs/new */
exports.getNew = async (req, res) => {
    try {
        await renderForm(res, { id: null, category_id: null, question: '', answer: '', is_active: 1, is_best: 0, sort_order: 0 });
    } catch (err) {
        console.error('[faq] getNew:', err.message);
        res.status(500).send('Server Error');
    }
};

/** GET /admin/faqs/:id */
exports.getEdit = async (req, res) => {
    try {
        const [[faq]] = await pool.query('SELECT * FROM faq WHERE id = ? AND mall_id = ?', [req.params.id, MALL_ID]);
        if (!faq) return res.redirect('/admin/faqs');
        await renderForm(res, faq);
    } catch (err) {
        console.error('[faq] getEdit:', err.message);
        res.status(500).send('Server Error');
    }
};

/** 폼 → 저장 가능한 값 */
function normalize(body) {
    const categoryId = Number.parseInt(body.category_id, 10);
    const sortOrder = Number.parseInt(body.sort_order, 10);
    return {
        category_id: Number.isFinite(categoryId) ? categoryId : null,
        question: String(body.question || '').trim().slice(0, 255),
        // 저장 시 새니타이즈 — 렌더 시 방어와 이중으로 건다.
        answer: sanitize(String(body.answer || '')),
        is_active: body.is_active ? 1 : 0,
        is_best: body.is_best ? 1 : 0,
        sort_order: Number.isFinite(sortOrder) ? Math.max(0, Math.min(sortOrder, 9999)) : 0,
    };
}

/** POST /admin/faqs */
exports.postCreate = async (req, res) => {
    try {
        const v = normalize(req.body);
        if (!v.question || !v.answer) return res.redirect('/admin/faqs/new');

        await pool.query(`
            INSERT INTO faq (mall_id, category_id, question, answer, is_active, is_best, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [MALL_ID, v.category_id, v.question, v.answer, v.is_active, v.is_best, v.sort_order]);

        res.redirect('/admin/faqs?saved=1');
    } catch (err) {
        console.error('[faq] postCreate:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/faqs/:id */
exports.postUpdate = async (req, res) => {
    try {
        const v = normalize(req.body);
        if (!v.question || !v.answer) return res.redirect(`/admin/faqs/${req.params.id}`);

        await pool.query(`
            UPDATE faq SET category_id = ?, question = ?, answer = ?, is_active = ?, is_best = ?, sort_order = ?
             WHERE id = ? AND mall_id = ?
        `, [v.category_id, v.question, v.answer, v.is_active, v.is_best, v.sort_order, req.params.id, MALL_ID]);

        res.redirect('/admin/faqs?saved=1');
    } catch (err) {
        console.error('[faq] postUpdate:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/faqs/:id/delete */
exports.postDelete = async (req, res) => {
    try {
        // FAQ 는 다른 테이블이 참조하지 않는다(조회수는 faq 행 자체에 있다).
        await pool.query('DELETE FROM faq WHERE id = ? AND mall_id = ?', [req.params.id, MALL_ID]);
        res.redirect('/admin/faqs?saved=1');
    } catch (err) {
        console.error('[faq] postDelete:', err.message);
        res.status(500).send('Server Error');
    }
};
