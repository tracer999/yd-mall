const pool = require('../../config/db');

const TX_TYPES = ['PURCHASE_ACCUMULATE', 'PURCHASE_USE', 'ADMIN_GRANT', 'ADMIN_DEDUCT'];

exports.getList = async (req, res) => {
    try {
        const { q, transaction_type, from, to, success, error } = req.query;

        let sql = `
            SELECT pt.*, u.email, u.name AS user_name, u.phone, u.picture, u.google_id, u.kakao_id, u.points_balance
            FROM point_transactions pt
            JOIN users u ON pt.user_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (q && String(q).trim()) {
            const qTrim = String(q).trim();
            const like = `%${qTrim}%`;
            const likeBirth = `%${qTrim.replace(/-/g, '')}%`;
            sql += ` AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?
                OR DATE_FORMAT(u.birthdate, '%Y-%m-%d') LIKE ?
                OR DATE_FORMAT(u.birthdate, '%Y%m%d') LIKE ?)`;
            params.push(like, like, like, like, likeBirth);
        }
        if (transaction_type) {
            sql += ' AND pt.transaction_type = ?';
            params.push(transaction_type);
        }
        if (from) {
            sql += ' AND pt.created_at >= ?';
            params.push(from + ' 00:00:00');
        }
        if (to) {
            sql += ' AND pt.created_at <= ?';
            params.push(to + ' 23:59:59');
        }

        sql += ' ORDER BY pt.created_at DESC LIMIT 500';

        const [transactions] = await pool.query(sql, params);

        res.render('admin/points/list', {
            layout: 'layouts/admin_layout',
            title: '포인트 관리',
            transactions,
            filters: { q: q || '', transaction_type, from, to },
            success,
            error
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getGrant = async (req, res) => {
    try {
        const success = req.query.success;
        const error = req.query.error;
        const grantResult = req.session.pointGrantResult || null;
        if (req.session.pointGrantResult) {
            delete req.session.pointGrantResult;
            req.session.save(() => {});
        }
        res.render('admin/points/grant', {
            layout: 'layouts/admin_layout',
            title: '포인트 지급',
            success,
            error,
            grantResult
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postGrant = async (req, res) => {
    const { user_ids, amount, description } = req.body;
    const amt = Math.abs(Number(amount) || 0);
    const ids = Array.isArray(user_ids) ? user_ids : (user_ids ? [user_ids] : []);
    const targetUserIds = ids.map(id => Number(id)).filter(Boolean);

    if (targetUserIds.length === 0 || amt <= 0) {
        return res.redirect('/admin/points/grant?error=회원과 지급 포인트를 확인하세요');
    }

    try {
        const [usersRows] = await pool.query(
            'SELECT id, name, email, phone FROM users WHERE id IN (?)',
            [targetUserIds]
        );
        const userMap = {};
        usersRows.forEach(u => { userMap[u.id] = u; });

        const grantedList = [];
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            for (const uid of targetUserIds) {
                await connection.query(
                    'INSERT INTO point_transactions (user_id, amount, transaction_type, description) VALUES (?, ?, ?, ?)',
                    [uid, amt, 'ADMIN_GRANT', description || '관리자 지급']
                );
                await connection.query('UPDATE users SET points_balance = points_balance + ? WHERE id = ?', [amt, uid]);
                grantedList.push({ id: uid, amount: amt, user: userMap[uid] });
            }
            await connection.commit();
        } catch (e) {
            await connection.rollback();
            throw e;
        } finally {
            connection.release();
        }

        req.session.pointGrantResult = { granted: grantedList };
        req.session.save((err) => {
            if (err) console.error(err);
            res.redirect('/admin/points/grant');
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getDeduct = async (req, res) => {
    try {
        const error = req.query.error;
        const [users] = await pool.query('SELECT id, email, name, points_balance FROM users ORDER BY created_at DESC LIMIT 300');
        res.render('admin/points/deduct', {
            layout: 'layouts/admin_layout',
            title: '포인트 차감',
            users,
            error
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postDeduct = async (req, res) => {
    const { user_id, amount, description } = req.body;
    const amt = Math.abs(Number(amount) || 0);
    if (!user_id || amt <= 0) {
        return res.redirect('/admin/points/deduct?error=회원과 차감 포인트를 확인하세요');
    }

    try {
        const [[user]] = await pool.query('SELECT points_balance FROM users WHERE id = ?', [user_id]);
        if (!user || user.points_balance < amt) {
            return res.redirect('/admin/points/deduct?error=보유 포인트가 부족합니다');
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query(
                'INSERT INTO point_transactions (user_id, amount, transaction_type, description) VALUES (?, ?, ?, ?)',
                [user_id, -amt, 'ADMIN_DEDUCT', description || '관리자 차감']
            );
            await connection.query('UPDATE users SET points_balance = points_balance - ? WHERE id = ?', [amt, user_id]);
            await connection.commit();
            res.redirect('/admin/points?success=포인트가 차감되었습니다');
        } catch (e) {
            await connection.rollback();
            throw e;
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
