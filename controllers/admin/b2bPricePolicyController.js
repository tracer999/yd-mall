/*
 * B2B 가격 정책 — 등급가 · 거래처 계약가 (설계 §4.2, §11.1).
 *
 * 가격 우선순위에서 2·3층을 담당한다. 아래 두 층은 상품 화면(/admin/products/b2b/:id)에서 관리한다.
 *
 *   1. 확정 견적가      견적 수락 시 고정        → 견적 관리
 *   2. 거래처 계약가    CUSTOMER_CONTRACT       ← 이 화면
 *   3. 등급가          TIER                     ← 이 화면
 *   4. 수량 구간가      b2b_volume_price         → 상품 B2B 판매 화면
 *   5. 기본 B2B가       product_b2b_setting      → 상품 B2B 판매 화면
 *
 * ⚠️ 우선순위는 **엄격하다**(더 싼 값을 고르는 게 아니다). 계약가가 잡히면 등급가·수량가는 보지 않는다.
 *    거래처와 개별 합의한 단가를 다른 층이 조용히 덮으면 마진 관리가 무너지기 때문이다.
 *    단, 어느 층이든 판매가보다 비싸면 적용되지 않는다.
 */

const pool = require('../../config/db');

const LAYOUT = 'layouts/admin_layout';

const TYPE_LABEL = { TIER: '등급가', CUSTOMER_CONTRACT: '거래처 계약가' };

/*
 * 품목 단가 저장.
 *
 * ⚠️ `ON DUPLICATE KEY UPDATE` 를 쓰면 안 된다. 유니크 키가 (price_policy_id, product_id, sku_id) 인데
 *    sku_id 가 NULL 이면 **MySQL 은 NULL 을 서로 다른 값으로 본다** — 중복 판정이 일어나지 않아
 *    같은 상품이 저장할 때마다 행으로 쌓이고, 리졸버는 그중 아무거나 집는다(가격이 오락가락한다).
 *    그래서 지우고 넣는다. 관리자 단건 조작이라 경합 위험은 없다.
 */
async function upsertItem(conn, policyId, productId, fixed, rate) {
    await conn.query(
        'DELETE FROM b2b_price_item WHERE price_policy_id = ? AND product_id = ? AND sku_id IS NULL',
        [policyId, productId]
    );
    await conn.query(
        'INSERT INTO b2b_price_item (price_policy_id, product_id, sku_id, fixed_price, discount_rate) VALUES (?,?,NULL,?,?)',
        [policyId, productId, fixed, rate]
    );
}

/** 목록 — 정책과 그 정책이 걸린 품목 수·적용 대상을 함께 보여준다. */
exports.getList = async (req, res, next) => {
    try {
        const type = ['TIER', 'CUSTOMER_CONTRACT'].includes(req.query.type) ? req.query.type : null;
        const where = type ? 'WHERE pp.policy_type = ?' : '';
        const params = type ? [type] : [];

        const [rows] = await pool.query(
            `SELECT pp.*, t.tier_name,
                    (SELECT COUNT(*) FROM b2b_price_item pi WHERE pi.price_policy_id = pp.id) AS item_count,
                    (SELECT COUNT(*) FROM business_profile bp WHERE bp.price_policy_id = pp.id) AS company_count
               FROM b2b_price_policy pp
               LEFT JOIN b2b_tier t ON t.id = pp.tier_id
               ${where}
              ORDER BY pp.policy_type, pp.priority DESC, pp.id DESC`,
            params
        );

        const [tiers] = await pool.query(
            'SELECT id, tier_code, tier_name FROM b2b_tier WHERE is_active = 1 ORDER BY rank_order ASC'
        );

        res.render('admin/b2b/price_policies', {
            layout: LAYOUT,
            title: '가격 정책',
            subtitle: '등급별·거래처별 전용 단가를 정합니다. 기본 전용가와 수량 구간가는 상품의 [B2B 판매] 화면에서 관리합니다.',
            rows, tiers, type: type || '', TYPE_LABEL,
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (err) { next(err); }
};

exports.postSave = async (req, res, next) => {
    const { id, name, policy_type, tier_id, priority, valid_from, valid_to, status } = req.body;
    try {
        const nm = (name || '').trim();
        const type = ['TIER', 'CUSTOMER_CONTRACT'].includes(policy_type) ? policy_type : null;
        if (!nm || !type) {
            return res.redirect('/admin/b2b/price-policies?error=' + encodeURIComponent('정책명과 유형을 입력하세요.'));
        }
        // 등급가는 대상 등급이 없으면 아무에게도 적용되지 않는다 — 저장 단계에서 막는다.
        if (type === 'TIER' && !tier_id) {
            return res.redirect('/admin/b2b/price-policies?error=' + encodeURIComponent('등급가 정책은 적용할 거래처 등급을 선택해야 합니다.'));
        }

        const args = [
            nm, type,
            type === 'TIER' ? Number(tier_id) : null,
            Number(priority) || 0,
            valid_from || null, valid_to || null,
            status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        ];

        if (id) {
            await pool.query(
                `UPDATE b2b_price_policy
                    SET name=?, policy_type=?, tier_id=?, priority=?, valid_from=?, valid_to=?, status=?
                  WHERE id=?`,
                [...args, id]
            );
            return res.redirect(`/admin/b2b/price-policies/${id}?message=` + encodeURIComponent('저장했습니다.'));
        }
        const [r] = await pool.query(
            `INSERT INTO b2b_price_policy (name, policy_type, tier_id, priority, valid_from, valid_to, status)
             VALUES (?,?,?,?,?,?,?)`, args
        );
        return res.redirect(`/admin/b2b/price-policies/${r.insertId}?message=` + encodeURIComponent('정책을 만들었습니다. 이제 상품별 단가를 등록하세요.'));
    } catch (err) { next(err); }
};

exports.postDelete = async (req, res, next) => {
    try {
        const { id } = req.body;
        // 거래처가 이 정책을 쓰고 있으면 지우지 않는다 — FK 가 없어 조용히 끊긴다.
        const [[used]] = await pool.query('SELECT COUNT(*) AS cnt FROM business_profile WHERE price_policy_id = ?', [id]);
        if (used.cnt > 0) {
            return res.redirect('/admin/b2b/price-policies?error='
                + encodeURIComponent(`이 정책을 쓰는 거래처가 ${used.cnt}곳 있습니다. 먼저 배정을 해제하세요.`));
        }
        await pool.query('DELETE FROM b2b_price_policy WHERE id = ?', [id]);   // 품목은 FK CASCADE
        return res.redirect('/admin/b2b/price-policies?message=' + encodeURIComponent('삭제했습니다.'));
    } catch (err) { next(err); }
};

/** 상세 — 품목 단가 관리 + 적용 거래처. */
exports.getDetail = async (req, res, next) => {
    try {
        const [[policy]] = await pool.query(
            `SELECT pp.*, t.tier_name FROM b2b_price_policy pp
               LEFT JOIN b2b_tier t ON t.id = pp.tier_id WHERE pp.id = ?`,
            [req.params.id]
        );
        if (!policy) return res.status(404).send('정책을 찾을 수 없습니다.');

        // 판매가를 함께 읽어 "정가 대비 얼마"를 화면에서 바로 보여준다.
        const [items] = await pool.query(
            `SELECT pi.*, p.name AS product_name, p.price AS list_price, p.product_code, p.mall_id,
                    p.main_image, p.thumbnail_image
               FROM b2b_price_item pi
               JOIN products p ON p.id = pi.product_id
              WHERE pi.price_policy_id = ?
              ORDER BY p.name ASC`,
            [req.params.id]
        );

        const [companies] = await pool.query(
            `SELECT bp.id, bp.company_name, bp.business_number, bp.status
               FROM business_profile bp WHERE bp.price_policy_id = ? ORDER BY bp.company_name`,
            [req.params.id]
        );

        // 계약가 정책에 배정할 수 있는 거래처(승인된 사업자)
        const [assignable] = await pool.query(
            `SELECT id, company_name, business_number, price_policy_id
               FROM business_profile WHERE status = 'APPROVED' ORDER BY company_name`
        );

        const [tiers] = await pool.query(
            'SELECT id, tier_code, tier_name FROM b2b_tier WHERE is_active = 1 ORDER BY rank_order ASC'
        );

        // CSV 결과는 한 번만 보여주고 지운다(리다이렉트 뒤 표시용).
        const csvResult = req.session.csvResult || null;
        if (csvResult) delete req.session.csvResult;

        res.render('admin/b2b/price_policy_detail', {
            layout: LAYOUT,
            title: '가격 정책 상세',
            subtitle: policy.name,
            policy, items, companies, assignable, tiers, TYPE_LABEL, csvResult,
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (err) { next(err); }
};

/** 품목 단가 추가·수정. 고정단가와 할인율은 **둘 중 하나만** 쓴다. */
exports.postItemSave = async (req, res, next) => {
    const policyId = Number(req.params.id);
    const { product_id, price_mode, fixed_price, discount_rate } = req.body;
    const back = (qs) => res.redirect(`/admin/b2b/price-policies/${policyId}${qs}`);
    try {
        const pid = Number(product_id);
        if (!pid) return back('?error=' + encodeURIComponent('상품을 선택하세요.'));

        const [[p]] = await pool.query('SELECT id, name, price FROM products WHERE id = ?', [pid]);
        if (!p) return back('?error=' + encodeURIComponent('상품을 찾을 수 없습니다.'));

        let fixed = null;
        let rate = null;
        if (price_mode === 'rate') {
            rate = Number(discount_rate);
            if (!(rate > 0 && rate < 100)) return back('?error=' + encodeURIComponent('할인율은 0보다 크고 100보다 작아야 합니다.'));
        } else {
            fixed = Number(fixed_price);
            if (!(fixed > 0)) return back('?error=' + encodeURIComponent('고정 단가를 입력하세요.'));
            // 판매가 이상이면 리졸버가 건너뛴다 — 저장 단계에서 알려 준다.
            if (fixed >= Number(p.price)) {
                return back('?error=' + encodeURIComponent(
                    `${p.name}: 단가(${fixed.toLocaleString()}원)가 판매가(${Number(p.price).toLocaleString()}원) 이상이라 적용되지 않습니다.`));
            }
        }

        await upsertItem(pool, policyId, pid, fixed, rate);
        return back('?message=' + encodeURIComponent('단가를 저장했습니다.'));
    } catch (err) { next(err); }
};

exports.postItemDelete = async (req, res, next) => {
    const policyId = Number(req.params.id);
    try {
        await pool.query('DELETE FROM b2b_price_item WHERE id = ? AND price_policy_id = ?', [req.body.item_id, policyId]);
        return res.redirect(`/admin/b2b/price-policies/${policyId}?message=` + encodeURIComponent('삭제했습니다.'));
    } catch (err) { next(err); }
};

/**
 * CSV 일괄 등록 (설계 §13 3단계 — 가격 CSV 일괄 등록).
 *
 * 형식: `상품코드 또는 상품ID, 고정단가` 또는 `상품코드, %할인율`
 *   AB-1001,77000
 *   AB-1002,30%
 * 헤더줄·빈줄·앞뒤 공백은 무시한다. 실패한 줄은 이유와 함께 돌려준다 —
 * 200줄 붙여넣고 "일부 실패" 만 보면 어디를 고쳐야 할지 알 수 없다.
 */
exports.postItemsCsv = async (req, res, next) => {
    const policyId = Number(req.params.id);
    try {
        const raw = String(req.body.csv || '').trim();
        if (!raw) return res.redirect(`/admin/b2b/price-policies/${policyId}?error=` + encodeURIComponent('붙여넣은 내용이 없습니다.'));

        const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        let okCount = 0;
        const failures = [];

        for (const [idx, line] of lines.entries()) {
            const cols = line.split(',').map((c) => c.trim());
            if (cols.length < 2) { failures.push(`${idx + 1}행: 열이 2개가 아닙니다 — "${line}"`); continue; }
            const [key, priceRaw] = cols;
            if (/^(상품|product)/i.test(key)) continue;   // 헤더줄

            const [[p]] = await pool.query(
                'SELECT id, name, price FROM products WHERE product_code = ? OR id = ? LIMIT 1',
                [key, /^\d+$/.test(key) ? Number(key) : 0]
            );
            if (!p) { failures.push(`${idx + 1}행: 상품을 찾을 수 없습니다 — "${key}"`); continue; }

            let fixed = null;
            let rate = null;
            if (priceRaw.endsWith('%')) {
                rate = Number(priceRaw.slice(0, -1));
                if (!(rate > 0 && rate < 100)) { failures.push(`${idx + 1}행: 할인율이 잘못됨 — "${priceRaw}"`); continue; }
            } else {
                fixed = Number(priceRaw.replace(/[^0-9]/g, ''));
                if (!(fixed > 0)) { failures.push(`${idx + 1}행: 단가가 잘못됨 — "${priceRaw}"`); continue; }
                if (fixed >= Number(p.price)) {
                    failures.push(`${idx + 1}행: ${p.name} 단가가 판매가(${Number(p.price).toLocaleString()}원) 이상`);
                    continue;
                }
            }

            await upsertItem(pool, policyId, p.id, fixed, rate);
            okCount += 1;
        }

        req.session.csvResult = { okCount, failures };
        return res.redirect(`/admin/b2b/price-policies/${policyId}?message=`
            + encodeURIComponent(`${okCount}건 등록${failures.length ? `, ${failures.length}건 실패` : ''}`));
    } catch (err) { next(err); }
};

/** 계약가 정책을 거래처에 배정·해제한다. */
exports.postAssign = async (req, res, next) => {
    const policyId = Number(req.params.id);
    const back = (qs) => res.redirect(`/admin/b2b/price-policies/${policyId}${qs}`);
    try {
        const { business_profile_id, action } = req.body;
        if (!business_profile_id) return back('?error=' + encodeURIComponent('거래처를 선택하세요.'));

        if (action === 'unassign') {
            await pool.query('UPDATE business_profile SET price_policy_id = NULL WHERE id = ? AND price_policy_id = ?',
                [business_profile_id, policyId]);
            return back('?message=' + encodeURIComponent('배정을 해제했습니다.'));
        }
        await pool.query('UPDATE business_profile SET price_policy_id = ? WHERE id = ?', [policyId, business_profile_id]);
        return back('?message=' + encodeURIComponent('거래처에 배정했습니다.'));
    } catch (err) { next(err); }
};

/** 품목 추가용 상품 검색 (JSON). 관리자가 보고 있는 몰 기준. */
exports.getProductSearch = async (req, res) => {
    const q = (req.query.q || '').trim();
    if (q.length < 1) return res.json({ products: [] });
    try {
        const [rows] = await pool.query(
            `SELECT p.id, p.name, p.product_code, p.price, p.main_image, p.thumbnail_image, p.status
               FROM products p
              WHERE (p.name LIKE ? OR p.product_code LIKE ?)
                AND p.mall_id = ?
              ORDER BY p.created_at DESC LIMIT 10`,
            [`%${q}%`, `%${q}%`, req.adminMallId || 1]
        );
        res.json({ products: rows });
    } catch (err) {
        res.status(500).json({ products: [] });
    }
};
