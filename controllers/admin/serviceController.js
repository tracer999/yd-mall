const pool = require('../../config/db');

/*
 * 서비스 관리 (몰 빌더 서비스 제공자 전용 · super_admin)
 *
 *   /admin/service/porting   배포·포팅 관리   — 배포 안내 + 납품 고객(테넌트) 레지스트리 CRUD
 *   /admin/service/features  등급별 기능 설정 — 판매 등급(플랜)별 기능 entitlement 편집
 *
 * ⚠️ '등급별 기능 설정'은 **기능 자격(entitlement)** 이지 스토어프론트 '메뉴' 제어가 아니다.
 *    네이버 스토어 연동 / 도매(도매꾹·온채널) 연동 / AI 자동생성 / 서브몰 생성 가능 개수 등.
 *
 * ⚠️ 납품 고객 레지스트리는 현재 **레지스트리(명부)만** 이다. 서브몰 개수 등의 '강제'
 *    (몰 생성 차단)는 추후. 고객이 만든 개별 몰은 추적하지 않는다.
 */

function toArray(v) {
    if (v === undefined || v === null) return [];
    return Array.isArray(v) ? v : [v];
}

function toInt(v, fallback = 0) {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
}

function cleanStr(v, max) {
    const s = String(v == null ? '' : v).trim();
    return s.length > max ? s.slice(0, max) : s;
}

// ───────────────────────────── 등급별 기능 설정 (service_plan) ─────────────────────────────

/** GET /admin/service/features — 판매 등급별 기능 entitlement 편집 */
exports.getFeatures = async (req, res) => {
    try {
        const [plans] = await pool.query(`
            SELECT id, plan_code, name, description, max_submalls,
                   feat_naver_store, feat_wholesale, feat_ai_generation, sort_order, is_active,
                   (SELECT COUNT(*) FROM delivery_customer d WHERE d.plan_id = p.id) AS customer_count
            FROM service_plan p
            ORDER BY p.sort_order ASC, p.id ASC
        `);

        res.render('admin/service/features', {
            layout: 'layouts/admin_layout',
            title: '등급별 기능 설정',
            subtitle: '판매 등급(플랜)별로 연동·AI·서브몰 개수 등 사용 가능한 기능을 정의합니다.',
            plans,
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[service] getFeatures:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/service/features — 기존 등급들의 entitlement 일괄 저장 */
exports.postSaveFeatures = async (req, res) => {
    const ids = toArray(req.body.plan_id).map(String);
    const names = toArray(req.body.name);
    const maxSubmalls = toArray(req.body.max_submalls);
    const naver = new Set(toArray(req.body.feat_naver_store).map(String));
    const wholesale = new Set(toArray(req.body.feat_wholesale).map(String));
    const ai = new Set(toArray(req.body.feat_ai_generation).map(String));
    const active = new Set(toArray(req.body.is_active).map(String));

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        for (let i = 0; i < ids.length; i++) {
            const id = toInt(ids[i]);
            if (!id) continue;
            await conn.query(
                `UPDATE service_plan
                    SET name = ?, max_submalls = ?, feat_naver_store = ?, feat_wholesale = ?,
                        feat_ai_generation = ?, is_active = ?
                  WHERE id = ?`,
                [
                    cleanStr(names[i], 100) || `등급 ${id}`,
                    Math.max(0, toInt(maxSubmalls[i], 0)),
                    naver.has(ids[i]) ? 1 : 0,
                    wholesale.has(ids[i]) ? 1 : 0,
                    ai.has(ids[i]) ? 1 : 0,
                    active.has(ids[i]) ? 1 : 0,
                    id,
                ]);
        }
        await conn.commit();
        res.redirect('/admin/service/features?saved=1');
    } catch (err) {
        await conn.rollback();
        console.error('[service] postSaveFeatures:', err.message);
        res.status(500).send('Server Error');
    } finally {
        conn.release();
    }
};

/** POST /admin/service/features/add — 새 등급 추가 */
exports.postAddPlan = async (req, res) => {
    try {
        const code = cleanStr(req.body.plan_code, 50).toUpperCase().replace(/[^A-Z0-9_]/g, '');
        const name = cleanStr(req.body.name, 100);
        if (!code || !name) {
            return res.redirect('/admin/service/features?error=' + encodeURIComponent('코드와 등급명을 입력하세요.'));
        }
        const [[dup]] = await pool.query('SELECT id FROM service_plan WHERE plan_code = ? LIMIT 1', [code]);
        if (dup) {
            return res.redirect('/admin/service/features?error=' + encodeURIComponent('이미 있는 등급 코드입니다.'));
        }
        const [[{ maxOrder }]] = await pool.query('SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM service_plan');
        await pool.query(
            'INSERT INTO service_plan (plan_code, name, sort_order) VALUES (?, ?, ?)',
            [code, name, Number(maxOrder) + 10]);
        res.redirect('/admin/service/features?saved=1');
    } catch (err) {
        console.error('[service] postAddPlan:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/service/features/:id/delete — 등급 삭제 (배정 고객은 plan_id=NULL 로 풀림) */
exports.postDeletePlan = async (req, res) => {
    try {
        await pool.query('DELETE FROM service_plan WHERE id = ?', [toInt(req.params.id)]);
        res.redirect('/admin/service/features?saved=1');
    } catch (err) {
        console.error('[service] postDeletePlan:', err.message);
        res.status(500).send('Server Error');
    }
};

// ───────────────────────────── 배포·포팅 + 납품 고객 레지스트리 ─────────────────────────────

/** GET /admin/service/porting — 배포 안내 + 납품 고객 레지스트리 */
exports.getPorting = async (req, res) => {
    try {
        const [customers] = await pool.query(`
            SELECT c.id, c.name, c.contact_name, c.contact_email, c.contact_phone,
                   c.delivered_at, c.is_active, c.memo,
                   p.name AS plan_name, p.max_submalls
            FROM delivery_customer c
            LEFT JOIN service_plan p ON p.id = c.plan_id
            ORDER BY c.is_active DESC, c.created_at DESC, c.id DESC
        `);

        res.render('admin/service/porting', {
            layout: 'layouts/admin_layout',
            title: '배포·포팅 관리',
            subtitle: '납품(소스 포팅·배포)과 납품 고객을 관리하는 서비스 제공자 전용 화면입니다.',
            customers,
            saved: req.query.saved === '1',
        });
    } catch (err) {
        console.error('[service] getPorting:', err.message);
        res.status(500).send('Server Error');
    }
};

/** GET /admin/service/customers/new | /:id/edit — 납품 고객 등록/수정 폼 */
exports.getCustomerForm = async (req, res) => {
    try {
        const id = req.params.id ? toInt(req.params.id) : null;
        let customer = { id: null, name: '', contact_name: '', contact_email: '', contact_phone: '', plan_id: null, delivered_at: null, memo: '', is_active: 1 };
        if (id) {
            const [[row]] = await pool.query('SELECT * FROM delivery_customer WHERE id = ? LIMIT 1', [id]);
            if (!row) return res.redirect('/admin/service/porting');
            customer = row;
        }
        const [plans] = await pool.query('SELECT id, name, max_submalls FROM service_plan WHERE is_active = 1 ORDER BY sort_order, id');
        res.render('admin/service/customer_form', {
            layout: 'layouts/admin_layout',
            title: id ? '납품 고객 수정' : '납품 고객 등록',
            subtitle: '우리가 몰을 납품한 고객(테넌트) 정보와 배정 등급을 관리합니다.',
            customer,
            plans,
        });
    } catch (err) {
        console.error('[service] getCustomerForm:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/service/customers — 납품 고객 등록/수정 (hidden id 로 분기) */
exports.postSaveCustomer = async (req, res) => {
    try {
        const id = toInt(req.body.id);
        const name = cleanStr(req.body.name, 150);
        if (!name) return res.redirect('/admin/service/porting');

        const planId = toInt(req.body.plan_id) || null;
        const deliveredAt = cleanStr(req.body.delivered_at, 10) || null; // YYYY-MM-DD
        const fields = [
            name,
            cleanStr(req.body.contact_name, 100) || null,
            cleanStr(req.body.contact_email, 255) || null,
            cleanStr(req.body.contact_phone, 50) || null,
            planId,
            deliveredAt,
            cleanStr(req.body.memo, 500) || null,
            req.body.is_active ? 1 : 0,
        ];

        if (id) {
            await pool.query(
                `UPDATE delivery_customer
                    SET name = ?, contact_name = ?, contact_email = ?, contact_phone = ?,
                        plan_id = ?, delivered_at = ?, memo = ?, is_active = ?
                  WHERE id = ?`,
                [...fields, id]);
        } else {
            await pool.query(
                `INSERT INTO delivery_customer
                    (name, contact_name, contact_email, contact_phone, plan_id, delivered_at, memo, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                fields);
        }
        res.redirect('/admin/service/porting?saved=1');
    } catch (err) {
        console.error('[service] postSaveCustomer:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/service/customers/:id/delete — 납품 고객 삭제 */
exports.postDeleteCustomer = async (req, res) => {
    try {
        await pool.query('DELETE FROM delivery_customer WHERE id = ?', [toInt(req.params.id)]);
        res.redirect('/admin/service/porting?saved=1');
    } catch (err) {
        console.error('[service] postDeleteCustomer:', err.message);
        res.status(500).send('Server Error');
    }
};
