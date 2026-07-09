const pool = require('../../config/db');
const emailService = require('../../services/emailService');

/**
 * 회원 검색 API (JSON) - 이메일, 이름, 연락처, 생년월일 통합 검색
 * 반환: 구글/카카오 프로필, 최근 주문 건수, 총 결제금액, 보유 포인트
 */
exports.searchApi = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q) {
            return res.json({ users: [] });
        }
        const like = `%${q}%`;
        const likeBirth = `%${q.replace(/-/g, '')}%`;
        const [users] = await pool.query(
            `SELECT u.id, u.email, u.name, u.phone, u.birthdate, u.google_id, u.kakao_id, u.picture, u.points_balance,
                    COALESCE(o.order_count, 0) AS order_count,
                    COALESCE(o.total_payment, 0) AS total_payment
             FROM users u
             LEFT JOIN (
                 SELECT user_id,
                        COUNT(*) AS order_count,
                        SUM(total_amount) AS total_payment
                 FROM orders
                 WHERE status = 'PAID' AND user_id IS NOT NULL
                 GROUP BY user_id
             ) o ON u.id = o.user_id
             WHERE u.email LIKE ? OR u.name LIKE ? OR u.phone LIKE ?
                OR DATE_FORMAT(u.birthdate, '%Y-%m-%d') LIKE ?
                OR DATE_FORMAT(u.birthdate, '%Y%m%d') LIKE ?
             ORDER BY u.created_at DESC
             LIMIT 50`,
            [like, like, like, like, likeBirth]
        );
        res.json({ users });
    } catch (err) {
        console.error(err);
        res.status(500).json({ users: [], error: err.message });
    }
};

exports.getList = async (req, res) => {
    try {
        const searchQuery = req.query.q ? req.query.q.trim() : '';
        const searchStatus = req.query.status || '';
        let sql = `
            SELECT
                u.*,
                terms.version AS terms_version,
                privacy.version AS privacy_version
            FROM users u
            LEFT JOIN policy_versions terms ON u.agreed_terms_id = terms.id
            LEFT JOIN policy_versions privacy ON u.agreed_privacy_id = privacy.id
            WHERE 1=1
        `;
        const params = [];
        if (searchQuery) {
            const like = `%${searchQuery}%`;
            sql += ' AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)';
            params.push(like, like, like);
        }
        if (searchStatus === 'active') {
            sql += ' AND u.is_active = 1';
        } else if (searchStatus === 'withdrawn') {
            sql += ' AND u.is_active = 0 AND u.withdrawn_at IS NOT NULL';
        }
        sql += ' ORDER BY u.created_at DESC';
        const [users] = await pool.query(sql, params);
        res.render('admin/users/list', {
            layout: 'layouts/admin_layout',
            title: '회원 관리',
            users,
            searchQuery,
            searchStatus
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.toggleActive = async (req, res) => {
    const id = req.params.id;
    try {
        await pool.query(
            'UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?',
            [id]
        );
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getDetail = async (req, res) => {
    const id = req.params.id;
    try {
        const [rows] = await pool.query(
            `SELECT 
                u.*, 
                terms.version AS terms_version,
                privacy.version AS privacy_version
            FROM users u
            LEFT JOIN policy_versions terms ON u.agreed_terms_id = terms.id
            LEFT JOIN policy_versions privacy ON u.agreed_privacy_id = privacy.id
            WHERE u.id = ?`,
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).send('User not found');
        }
        const user = rows[0];

        const [issuedCoupons] = await pool.query(
            `SELECT uc.id, uc.issued_at, uc.used_at, uc.issued_by, uc.order_id,
                    c.name AS coupon_name, c.code AS coupon_code, c.discount_amount,
                    o.order_number
             FROM user_coupons uc
             JOIN coupons c ON uc.coupon_id = c.id
             LEFT JOIN orders o ON uc.order_id = o.id
             WHERE uc.user_id = ?
             ORDER BY uc.issued_at DESC
             LIMIT 100`,
            [id]
        );

        const [pointTransactions] = await pool.query(
            `SELECT id, amount, transaction_type, order_id, description, created_at
             FROM point_transactions
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 100`,
            [id]
        );

        const [userOrders] = await pool.query(
            `SELECT id, order_number, status, total_amount, created_at, paid_at
             FROM orders
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 100`,
            [id]
        );
        const totalOrderAmount = userOrders
            .filter(o => o.status === 'PAID')
            .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

        res.render('admin/users/detail', {
            layout: 'layouts/admin_layout',
            title: '회원 상세 정보',
            user,
            issuedCoupons,
            pointTransactions,
            userOrders,
            totalOrderAmount
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.deleteUser = async (req, res) => {
    const id = req.params.id;
    try {
        await pool.query('DELETE FROM users WHERE id = ?', [id]);
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

