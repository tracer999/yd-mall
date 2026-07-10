const pool = require('../../config/db');
const { issueCoupon } = require('../../services/coupon/couponIssueService');
const { benefitLabel } = require('../../services/coupon/discountCalculator');

/*
 * 관리자 쿠폰 (쿠폰 문서 §8)
 *
 * ── 축을 세 개로 나눴다 (§4-2)
 *      coupon_type    목적 라벨   NEW_SIGNUP · EVENT · SEASON · SPECIAL   (동작 분기 없음)
 *      issue_method   발급 방식   AUTO_SIGNUP · ADMIN · CODE · DOWNLOAD   (동작을 바꾼다)
 *      benefit_type   혜택 유형   2차
 *    옛 코드는 `coupon_type` 하나가 목적과 발급 방식을 겸했다. "이벤트 목적의 다운로드 쿠폰"을
 *    표현할 수 없었다.
 *
 * ── `status` 가 정본, `is_active` 는 하위호환 미러다 (§5-2)
 *    운영이 아직 옛 코드를 돌리는 동안 `is_active` 를 읽는다. 쓰기 시 둘을 함께 갱신한다.
 *
 * ── 쿠폰은 삭제하지 않고 종료(ENDED)한다 (C7)
 *    FK 가 ON DELETE CASCADE 라, 삭제를 붙이는 순간 회원 보유 쿠폰과 사용 이력이 함께 사라진다.
 */

const COUPON_TYPES = ['NEW_SIGNUP', 'EVENT', 'SEASON', 'SPECIAL'];
const ISSUE_METHODS = ['AUTO_SIGNUP', 'ADMIN', 'CODE', 'DOWNLOAD'];
const STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED'];
const BENEFIT_TYPES = ['FIXED', 'PERCENT', 'SHIPPING_FREE', 'SHIPPING_FIXED'];

/** ACTIVE 만 살아 있는 쿠폰이다. is_active 는 여기서 파생한다. */
const isActiveMirror = (status) => (status === 'ACTIVE' ? 1 : 0);

function toIntOrNull(v) {
    const s = String(v ?? '').trim();
    if (s === '') return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
}

const nullIfBlank = (v) => {
    const s = String(v ?? '').trim();
    return s === '' ? null : s;
};

/** `datetime-local` 값을 MySQL DATETIME 으로. 빈 값은 NULL. */
function toDateTime(v) {
    const s = String(v ?? '').trim();
    if (!s) return null;
    return s.replace('T', ' ').length === 16 ? s.replace('T', ' ') + ':00' : s.replace('T', ' ');
}

/** JSON 문자열을 검증한다. 깨진 JSON 은 저장하지 않는다 — 런타임에 조용히 "범위 없음"이 된다. */
function parseScopeJson(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return { ok: true, value: null };
    try {
        const parsed = JSON.parse(s);
        if (typeof parsed !== 'object' || parsed === null) return { ok: false };
        return { ok: true, value: JSON.stringify(parsed) };
    } catch {
        return { ok: false };
    }
}

/**
 * 폼 → 저장값. 발급 방식·혜택 유형에 따라 무의미한 필드를 NULL 로 지운다.
 * @returns {{error:string}|{value:object}}
 */
function normalizeForm(body) {
    const couponType = COUPON_TYPES.includes(body.coupon_type) ? body.coupon_type : 'EVENT';
    const issueMethod = ISSUE_METHODS.includes(body.issue_method) ? body.issue_method : 'ADMIN';
    const status = STATUSES.includes(body.status) ? body.status : 'DRAFT';
    const benefitType = BENEFIT_TYPES.includes(body.benefit_type) ? body.benefit_type : 'FIXED';

    const discountRate = benefitType === 'PERCENT' ? toIntOrNull(body.discount_rate) : null;
    const maxDiscount = benefitType === 'PERCENT' ? toIntOrNull(body.max_discount_amount) : null;

    // 정률 쿠폰에 상한이 없으면 고액 주문에서 할인이 무한정 커진다 (§5-3).
    if (benefitType === 'PERCENT') {
        if (!discountRate || discountRate <= 0 || discountRate > 100) return { error: '할인율은 1~100 사이여야 합니다' };
        if (!maxDiscount || maxDiscount <= 0) return { error: '정률 쿠폰에는 최대 할인액이 필요합니다' };
    }

    const scope = parseScopeJson(body.scope_json);
    if (!scope.ok) return { error: '적용 범위 JSON 형식이 올바르지 않습니다' };

    const now = new Date();
    const defaultTo = new Date(now);
    defaultTo.setFullYear(defaultTo.getFullYear() + 1);

    return {
        value: {
            name: String(body.name || '').trim(),
            thumbnail_url: nullIfBlank(body.thumbnail_url),                      // 쿠폰존 카드 썸네일
            summary: nullIfBlank(body.summary),                                 // 리스트 한 줄 소개
            detail_content: nullIfBlank(body.detail_content),                   // 상세 본문(HTML)
            notice: nullIfBlank(body.notice),                                   // 유의사항(HTML)
            mall_id: toIntOrNull(body.mall_id),                                  // NULL = 전 몰 공용
            coupon_type: couponType,
            issue_method: issueMethod,
            benefit_type: benefitType,
            status,
            // 코드는 CODE 방식일 때만 의미가 있다
            code: issueMethod === 'CODE' && body.code ? String(body.code).trim() : null,
            // SHIPPING_FREE 는 배송비 전액이므로 금액이 없다
            discount_amount: benefitType === 'PERCENT' || benefitType === 'SHIPPING_FREE'
                ? 0 : (toIntOrNull(body.discount_amount) || 0),
            discount_rate: discountRate,
            max_discount_amount: maxDiscount,
            scope_json: scope.value,
            min_order_amount: toIntOrNull(body.min_order_amount) || 0,
            valid_from: toDateTime(body.valid_from) || now.toISOString().slice(0, 19).replace('T', ' '),
            valid_to: toDateTime(body.valid_to) || defaultTo.toISOString().slice(0, 19).replace('T', ' '),
            valid_days: toIntOrNull(body.valid_days),
            max_total_uses: toIntOrNull(body.max_total_uses),                    // 사용 한도
            // 수령 기간·선착순 수량은 다운로드 전용
            download_start_at: issueMethod === 'DOWNLOAD' ? toDateTime(body.download_start_at) : null,
            download_end_at: issueMethod === 'DOWNLOAD' ? toDateTime(body.download_end_at) : null,
            issue_limit: toIntOrNull(body.issue_limit),                          // 수령 한도
        },
    };
}

exports.getList = async (req, res) => {
    try {
        const { status, issue_method, keyword } = req.query;
        const where = ['1=1'];
        const params = [];
        if (STATUSES.includes(status)) { where.push('c.status = ?'); params.push(status); }
        if (ISSUE_METHODS.includes(issue_method)) { where.push('c.issue_method = ?'); params.push(issue_method); }
        if (keyword) { where.push('(c.name LIKE ? OR c.code LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }

        const [coupons] = await pool.query(`
            SELECT c.*, m.name AS mall_name,
                (SELECT COUNT(*) FROM user_coupons uc WHERE uc.coupon_id = c.id) AS issued_total,
                (SELECT COUNT(*) FROM user_coupons uc WHERE uc.coupon_id = c.id AND uc.used_at IS NULL) AS unused_count,
                (SELECT COUNT(*) FROM user_coupons uc WHERE uc.coupon_id = c.id AND uc.used_at IS NOT NULL) AS used_count
            FROM coupons c
            LEFT JOIN mall m ON m.id = c.mall_id
            WHERE ${where.join(' AND ')}
            ORDER BY c.created_at DESC
        `, params);

        res.render('admin/coupons/list', {
            layout: 'layouts/admin_layout',
            title: '쿠폰 관리',
            coupons,
            benefitLabel,   // 혜택 문구는 계산기 한 곳이 만든다. 뷰에서 다시 조립하지 않는다
            filters: { status: status || '', issue_method: issue_method || '', keyword: keyword || '' },
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

async function renderForm(req, res, title, coupon) {
    const [malls] = await pool.query('SELECT id, name FROM mall WHERE is_active = 1 ORDER BY id');
    res.render('admin/coupons/form', {
        layout: 'layouts/admin_layout',
        title,
        coupon,
        malls,
        tinymceKey: process.env.TINYMCE_KEY || '',
        error: req.query.error || null,
    });
}

/**
 * 적용 대상 picker 자동완성 — 카테고리(NORMAL)·브랜드(BRAND)를 이름으로 검색한다.
 * 브랜드는 별도 테이블이 아니라 categories.type='BRAND' 다(1379행이라 드롭다운 불가).
 */
exports.searchTargets = async (req, res) => {
    try {
        const type = req.query.type === 'BRAND' ? 'BRAND' : 'NORMAL';
        const q = String(req.query.q || '').trim();
        if (!q) return res.json([]);
        const [rows] = await pool.query(
            'SELECT id, name FROM categories WHERE type = ? AND name LIKE ? ORDER BY name LIMIT 20',
            [type, `%${q}%`]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'search failed' });
    }
};

/** picker 프리필용 — id 목록을 이름과 함께 돌려준다. */
exports.resolveTargets = async (req, res) => {
    try {
        const ids = String(req.query.ids || '').split(',').map((s) => parseInt(s, 10)).filter(Boolean);
        if (!ids.length) return res.json([]);
        const [rows] = await pool.query('SELECT id, name, type FROM categories WHERE id IN (?)', [ids]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'resolve failed' });
    }
};

exports.getCreate = async (req, res) => {
    try {
        await renderForm(req, res, '쿠폰 등록', null);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postCreate = async (req, res) => {
    const parsed = normalizeForm(req.body);
    if (parsed.error) return res.redirect('/admin/coupons/create?error=' + encodeURIComponent(parsed.error));
    const f = parsed.value;
    try {
        await pool.query(
            `INSERT INTO coupons (name, thumbnail_url, summary, detail_content, notice,
                                  mall_id, code, coupon_type, issue_method, benefit_type,
                                  discount_amount, discount_rate, max_discount_amount, scope_json, min_order_amount,
                                  valid_from, valid_to, valid_days, max_total_uses, is_active, status,
                                  download_start_at, download_end_at, issue_limit)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [f.name, f.thumbnail_url, f.summary, f.detail_content, f.notice,
             f.mall_id, f.code, f.coupon_type, f.issue_method, f.benefit_type,
             f.discount_amount, f.discount_rate, f.max_discount_amount, f.scope_json, f.min_order_amount,
             f.valid_from, f.valid_to, f.valid_days, f.max_total_uses, isActiveMirror(f.status), f.status,
             f.download_start_at, f.download_end_at, f.issue_limit]
        );
        res.redirect('/admin/coupons');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query(
            'SELECT c.*, m.name AS mall_name FROM coupons c LEFT JOIN mall m ON m.id = c.mall_id WHERE c.id = ?',
            [id]
        );
        if (rows.length === 0) return res.redirect('/admin/coupons');

        const coupon = rows[0];
        const [recipients] = await pool.query(
            `SELECT uc.*, u.name AS user_name, u.email, o.order_number
             FROM user_coupons uc
             JOIN users u ON uc.user_id = u.id
             LEFT JOIN orders o ON uc.order_id = o.id
             WHERE uc.coupon_id = ?
             ORDER BY uc.issued_at DESC`,
            [id]
        );

        // 총 할인액 — 이 쿠폰이 실제로 깎아준 금액 (§8-4)
        const [[stat]] = await pool.query(
            `SELECT COALESCE(SUM(o.coupon_discount), 0) AS total_discount
               FROM user_coupons uc JOIN orders o ON o.id = uc.order_id
              WHERE uc.coupon_id = ? AND uc.used_at IS NOT NULL`,
            [id]
        );

        const issuedTotal = recipients.length;
        const usedCount = recipients.filter((r) => r.used_at).length;

        res.render('admin/coupons/detail', {
            layout: 'layouts/admin_layout',
            title: '쿠폰 상세 - ' + coupon.name,
            coupon,
            benefitLabel,
            recipients,
            stats: {
                issuedTotal,
                usedCount,
                totalDiscount: Number(stat.total_discount) || 0,
                claimRate: coupon.issue_limit ? Math.round((coupon.issued_count / coupon.issue_limit) * 1000) / 10 : null,
                useRate: issuedTotal ? Math.round((usedCount / issuedTotal) * 1000) / 10 : 0,
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getEdit = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM coupons WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.redirect('/admin/coupons');
        await renderForm(req, res, '쿠폰 수정', rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postEdit = async (req, res) => {
    const { id } = req.params;
    const parsed = normalizeForm(req.body);
    if (parsed.error) return res.redirect(`/admin/coupons/edit/${id}?error=` + encodeURIComponent(parsed.error));
    const f = parsed.value;
    try {
        await pool.query(
            `UPDATE coupons SET name=?, thumbnail_url=?, summary=?, detail_content=?, notice=?,
                    mall_id=?, code=?, coupon_type=?, issue_method=?, benefit_type=?,
                    discount_amount=?, discount_rate=?, max_discount_amount=?, scope_json=?, min_order_amount=?,
                    valid_from=?, valid_to=?, valid_days=?, max_total_uses=?,
                    is_active=?, status=?, download_start_at=?, download_end_at=?, issue_limit=?
             WHERE id=?`,
            [f.name, f.thumbnail_url, f.summary, f.detail_content, f.notice,
             f.mall_id, f.code, f.coupon_type, f.issue_method, f.benefit_type,
             f.discount_amount, f.discount_rate, f.max_discount_amount, f.scope_json, f.min_order_amount,
             f.valid_from, f.valid_to, f.valid_days, f.max_total_uses, isActiveMirror(f.status), f.status,
             f.download_start_at, f.download_end_at, f.issue_limit, id]
        );
        res.redirect('/admin/coupons');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

/** 삭제 대신 종료 (C7). 발급된 쿠폰과 사용 이력은 남는다. */
exports.postEnd = async (req, res) => {
    try {
        await pool.query("UPDATE coupons SET status = 'ENDED', is_active = 0 WHERE id = ?", [req.params.id]);
        res.redirect('/admin/coupons');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getIssue = async (req, res) => {
    try {
        const issueResult = req.session.couponIssueResult || null;
        if (req.session.couponIssueResult) {
            delete req.session.couponIssueResult;
            req.session.save(() => {});
        }
        const [coupons] = await pool.query(
            `SELECT id, name, code, coupon_type, issue_method, discount_amount, valid_from, valid_to,
                    issue_limit, issued_count
               FROM coupons WHERE status = 'ACTIVE' AND valid_to >= NOW() ORDER BY name`
        );
        res.render('admin/coupons/issue', {
            layout: 'layouts/admin_layout',
            title: '쿠폰 지급',
            coupons,
            success: req.query.success,
            error: req.query.error,
            issueResult,
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

const ISSUE_FAIL_LABEL = {
    already_held: '이미 보유',
    issue_limit: '발급 한도 소진',
    inactive: '활성 상태가 아님',
    expired: '만료된 쿠폰',
};

exports.postIssue = async (req, res) => {
    const { issue_type, coupon_id, user_id, user_ids } = req.body;

    if (!coupon_id) {
        return res.redirect('/admin/coupons/issue?error=쿠폰을 선택하세요');
    }

    try {
        const [couponRows] = await pool.query("SELECT * FROM coupons WHERE id = ? AND status = 'ACTIVE'", [coupon_id]);
        if (couponRows.length === 0) {
            return res.redirect('/admin/coupons/issue?error=유효한 쿠폰이 아닙니다');
        }
        const coupon = couponRows[0];
        if (coupon.valid_to && new Date(coupon.valid_to) < new Date()) {
            return res.redirect('/admin/coupons/issue?error=만료된 쿠폰입니다');
        }

        let targetUserIds = [];
        if (issue_type === 'all') {
            const [allUsers] = await pool.query('SELECT id FROM users');
            targetUserIds = allUsers.map((u) => u.id);
        } else if (issue_type === 'user') {
            const ids = Array.isArray(user_ids) ? user_ids : (user_id ? [user_id] : []);
            targetUserIds = ids.map((v) => Number(v)).filter(Boolean);
        }
        if (targetUserIds.length === 0) {
            return res.redirect('/admin/coupons/issue?error=지급 대상 회원이 없습니다');
        }

        const [usersRows] = await pool.query('SELECT id, name, email, phone FROM users WHERE id IN (?)', [targetUserIds]);
        const userMap = Object.fromEntries(usersRows.map((u) => [u.id, u]));

        const issuedList = [];
        const failedList = [];

        // 회원마다 트랜잭션 하나. 한 명이 실패해도 나머지 지급은 진행된다.
        for (const uid of targetUserIds) {
            const conn = await pool.getConnection();
            try {
                await conn.beginTransaction();
                // issued_count 를 갱신하므로 최신 행을 다시 읽는다.
                const [[fresh]] = await conn.query('SELECT * FROM coupons WHERE id = ? FOR UPDATE', [coupon.id]);
                const result = await issueCoupon(conn, { userId: uid, coupon: fresh, issuedBy: 'ADMIN' });
                await conn.commit();

                if (result.ok) issuedList.push({ id: uid, user: userMap[uid] });
                else failedList.push({ id: uid, reason: ISSUE_FAIL_LABEL[result.reason] || result.reason, user: userMap[uid] });
            } catch (e) {
                await conn.rollback();
                failedList.push({ id: uid, reason: '오류', user: userMap[uid] });
                console.error('[Coupon] issue error:', e);
            } finally {
                conn.release();
            }
        }

        req.session.couponIssueResult = { couponName: coupon.name, issued: issuedList, failed: failedList };
        req.session.save(() => res.redirect('/admin/coupons/issue'));
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getUsage = async (req, res) => {
    try {
        const { user_id, coupon_id, from, to } = req.query;

        let sql = `
            SELECT uc.*, u.email, u.name AS user_name, u.picture AS user_picture, u.google_id AS user_google_id, u.kakao_id AS user_kakao_id, u.phone AS user_phone,
                   c.name AS coupon_name, c.discount_amount, o.order_number, o.id AS order_id
            FROM user_coupons uc
            JOIN users u ON uc.user_id = u.id
            JOIN coupons c ON uc.coupon_id = c.id
            LEFT JOIN orders o ON uc.order_id = o.id
            WHERE 1=1
        `;
        const params = [];

        if (user_id) { sql += ' AND uc.user_id = ?'; params.push(user_id); }
        if (coupon_id) { sql += ' AND uc.coupon_id = ?'; params.push(coupon_id); }
        if (from) { sql += ' AND uc.issued_at >= ?'; params.push(from + ' 00:00:00'); }
        if (to) { sql += ' AND uc.issued_at <= ?'; params.push(to + ' 23:59:59'); }

        sql += ' ORDER BY uc.issued_at DESC LIMIT 500';

        const [usages] = await pool.query(sql, params);
        const [coupons] = await pool.query('SELECT id, name FROM coupons ORDER BY name');
        const [users] = await pool.query('SELECT id, email, name FROM users ORDER BY created_at DESC LIMIT 200');

        res.render('admin/coupons/usage', {
            layout: 'layouts/admin_layout',
            title: '쿠폰 사용 내역',
            usages,
            coupons,
            users,
            filters: { user_id, coupon_id, from, to },
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
