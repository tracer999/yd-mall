const pool = require('../../config/db');

const COUPON_TYPES = ['NEW_SIGNUP', 'EVENT', 'SEASON', 'SPECIAL'];
const ISSUED_BY = ['AUTO', 'ADMIN', 'CODE'];

exports.getList = async (req, res) => {
    try {
        const [coupons] = await pool.query(`
            SELECT c.*,
                (SELECT COUNT(*) FROM user_coupons uc WHERE uc.coupon_id = c.id) AS issued_count,
                (SELECT COUNT(*) FROM user_coupons uc WHERE uc.coupon_id = c.id AND uc.used_at IS NULL) AS unused_count,
                (SELECT COUNT(*) FROM user_coupons uc WHERE uc.coupon_id = c.id AND uc.used_at IS NOT NULL) AS used_count
            FROM coupons c
            ORDER BY c.created_at DESC
        `);
        res.render('admin/coupons/list', {
            layout: 'layouts/admin_layout',
            title: '쿠폰 관리',
            coupons
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getCreate = async (req, res) => {
    try {
        res.render('admin/coupons/form', {
            layout: 'layouts/admin_layout',
            title: '쿠폰 등록',
            coupon: null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postCreate = async (req, res) => {
    const {
        name,
        code,
        coupon_type,
        discount_amount,
        min_order_amount,
        valid_from,
        valid_to,
        max_total_uses,
        is_active
    } = req.body;

    const type = COUPON_TYPES.includes(coupon_type) ? coupon_type : 'EVENT';
    const codeVal = (coupon_type === 'SPECIAL' && code) ? String(code).trim() : null;

    const now = new Date();
    const defaultFrom = valid_from || now.toISOString().slice(0, 16);
    const defaultTo = valid_to || (() => {
        const y = new Date(now);
        y.setFullYear(y.getFullYear() + 1);
        return y.toISOString().slice(0, 16);
    })();

    try {
        await pool.query(
            `INSERT INTO coupons (name, code, coupon_type, discount_amount, min_order_amount, valid_from, valid_to, max_total_uses, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                codeVal || null,
                type,
                Number(discount_amount) || 0,
                Number(min_order_amount) || 0,
                defaultFrom.replace('T', ' ') + ':00',
                defaultTo.replace('T', ' ') + ':00',
                max_total_uses ? Number(max_total_uses) : null,
                is_active ? 1 : 0
            ]
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
        const [rows] = await pool.query('SELECT * FROM coupons WHERE id = ?', [id]);
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

        res.render('admin/coupons/detail', {
            layout: 'layouts/admin_layout',
            title: '쿠폰 상세 - ' + coupon.name,
            coupon,
            recipients
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getEdit = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query('SELECT * FROM coupons WHERE id = ?', [id]);
        if (rows.length === 0) return res.redirect('/admin/coupons');

        res.render('admin/coupons/form', {
            layout: 'layouts/admin_layout',
            title: '쿠폰 수정',
            coupon: rows[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postEdit = async (req, res) => {
    const { id } = req.params;
    const {
        name,
        code,
        coupon_type,
        discount_amount,
        min_order_amount,
        valid_from,
        valid_to,
        max_total_uses,
        is_active
    } = req.body;

    const type = COUPON_TYPES.includes(coupon_type) ? coupon_type : 'EVENT';
    const codeVal = (coupon_type === 'SPECIAL' && code) ? String(code).trim() : null;

    const now = new Date();
    const defaultFrom = valid_from || now.toISOString().slice(0, 16);
    const defaultTo = valid_to || (() => {
        const y = new Date(now);
        y.setFullYear(y.getFullYear() + 1);
        return y.toISOString().slice(0, 16);
    })();

    try {
        await pool.query(
            `UPDATE coupons SET name=?, code=?, coupon_type=?, discount_amount=?, min_order_amount=?,
             valid_from=?, valid_to=?, max_total_uses=?, is_active=?
             WHERE id=?`,
            [
                name,
                codeVal || null,
                type,
                Number(discount_amount) || 0,
                Number(min_order_amount) || 0,
                defaultFrom.replace('T', ' ') + ':00',
                defaultTo.replace('T', ' ') + ':00',
                max_total_uses ? Number(max_total_uses) : null,
                is_active ? 1 : 0,
                id
            ]
        );
        res.redirect('/admin/coupons');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getIssue = async (req, res) => {
    try {
        const success = req.query.success;
        const error = req.query.error;
        const issueResult = req.session.couponIssueResult || null;
        if (req.session.couponIssueResult) {
            delete req.session.couponIssueResult;
            req.session.save(() => {});
        }
        const [coupons] = await pool.query(
            "SELECT id, name, code, coupon_type, discount_amount, valid_from, valid_to FROM coupons WHERE is_active = 1 AND valid_to >= NOW() ORDER BY name"
        );
        res.render('admin/coupons/issue', {
            layout: 'layouts/admin_layout',
            title: '쿠폰 지급',
            coupons,
            success,
            error,
            issueResult
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postIssue = async (req, res) => {
    const { issue_type, coupon_id, user_id, user_ids, coupon_code } = req.body;

    if (!coupon_id) {
        return res.redirect('/admin/coupons/issue?error=쿠폰을 선택하세요');
    }

    try {
        const [couponRows] = await pool.query('SELECT * FROM coupons WHERE id = ? AND is_active = 1', [coupon_id]);
        if (couponRows.length === 0) {
            return res.redirect('/admin/coupons/issue?error=유효한 쿠폰이 아닙니다');
        }
        const coupon = couponRows[0];

        const now = new Date();
        const validFrom = coupon.valid_from ? new Date(coupon.valid_from) : null;
        const validTo = coupon.valid_to ? new Date(coupon.valid_to) : null;
        if (validTo && validTo < now) {
            return res.redirect('/admin/coupons/issue?error=만료된 쿠폰입니다');
        }

        let targetUserIds = [];

        if (issue_type === 'all') {
            const [allUsers] = await pool.query('SELECT id FROM users');
            targetUserIds = allUsers.map(u => u.id);
        } else if (issue_type === 'user') {
            const ids = Array.isArray(user_ids) ? user_ids : (user_id ? [user_id] : []);
            targetUserIds = ids.map(id => Number(id)).filter(Boolean);
        }

        if (targetUserIds.length === 0) {
            return res.redirect('/admin/coupons/issue?error=지급 대상 회원이 없습니다');
        }

        const [usersRows] = await pool.query(
            'SELECT id, name, email, phone FROM users WHERE id IN (?)',
            [targetUserIds]
        );
        const userMap = {};
        usersRows.forEach(u => { userMap[u.id] = u; });

        const issuedList = [];
        const failedList = [];
        let usageCount = 0;

        const [usageRows] = await pool.query('SELECT COUNT(*) as c FROM user_coupons WHERE coupon_id = ?', [coupon_id]);
        usageCount = usageRows[0].c;

        for (const uid of targetUserIds) {
            const [existing] = await pool.query(
                'SELECT id FROM user_coupons WHERE user_id = ? AND coupon_id = ? AND used_at IS NULL',
                [uid, coupon_id]
            );
            if (existing.length > 0) {
                failedList.push({ id: uid, reason: '이미 보유', user: userMap[uid] });
                continue;
            }
            if (coupon.max_total_uses != null && usageCount >= coupon.max_total_uses) {
                failedList.push({ id: uid, reason: '쿠폰 한도 소진', user: userMap[uid] });
                continue;
            }

            await pool.query(
                'INSERT INTO user_coupons (user_id, coupon_id, issued_by) VALUES (?, ?, ?)',
                [uid, coupon_id, 'ADMIN']
            );
            usageCount++;
            issuedList.push({ id: uid, user: userMap[uid] });
        }

        const result = {
            couponName: coupon.name,
            issued: issuedList,
            failed: failedList
        };
        req.session.couponIssueResult = result;
        req.session.save((err) => {
            if (err) console.error(err);
            res.redirect('/admin/coupons/issue');
        });
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

        if (user_id) {
            sql += ' AND uc.user_id = ?';
            params.push(user_id);
        }
        if (coupon_id) {
            sql += ' AND uc.coupon_id = ?';
            params.push(coupon_id);
        }
        if (from) {
            sql += ' AND uc.issued_at >= ?';
            params.push(from + ' 00:00:00');
        }
        if (to) {
            sql += ' AND uc.issued_at <= ?';
            params.push(to + ' 23:59:59');
        }

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
            filters: { user_id, coupon_id, from, to }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
