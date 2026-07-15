const pool = require('../../config/db');
const { getMalls } = require('../../middleware/mallContext');

/*
 * 문의 관리는 몰별로 "관리"하지 않고 몰별로 "조회"만 한다(요청 사항).
 * 목록 상단의 몰 필터(?mallId=<id>)로 해당 몰 문의만 골라 볼 수 있고, 기본은 전체 조회다.
 * 문의가 어느 몰에서 들어왔는지는 손님 등록 시 inquiries.mall_id 에 기록된다.
 */
exports.getList = async (req, res) => {
    try {
        const malls = [...(await getMalls()).byId.values()];
        const filterMallId = Number.parseInt(req.query.mallId, 10);
        const hasFilter = Number.isFinite(filterMallId);

        const [inquiries] = await pool.query(`
            SELECT i.*, u.name AS user_name, u.email AS user_email, m.name AS mall_name
            FROM inquiries i
            JOIN users u ON i.user_id = u.id
            LEFT JOIN mall m ON m.id = i.mall_id
            ${hasFilter ? 'WHERE i.mall_id = ?' : ''}
            ORDER BY i.created_at DESC
        `, hasFilter ? [filterMallId] : []);

        res.render('admin/inquiries/list', {
            title: '문의 관리',
            inquiries,
            malls,
            selectedMallId: hasFilter ? filterMallId : null,
            path: '/admin/inquiries',
            layout: 'layouts/admin_layout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getDetail = async (req, res) => {
    const id = req.params.id;
    try {
        const [rows] = await pool.query(`
            SELECT i.*, u.name AS user_name, u.email AS user_email, m.name AS mall_name
            FROM inquiries i
            JOIN users u ON i.user_id = u.id
            LEFT JOIN mall m ON m.id = i.mall_id
            WHERE i.id = ?
        `, [id]);

        if (rows.length === 0) return res.redirect('/admin/inquiries');

        res.render('admin/inquiries/detail', {
            title: '문의 상세',
            inquiry: rows[0],
            path: '/admin/inquiries',
            layout: 'layouts/admin_layout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postAnswer = async (req, res) => {
    const id = req.params.id;
    const { answer } = req.body;

    try {
        await pool.query('UPDATE inquiries SET answer = ?, is_answered = 1 WHERE id = ?', [answer, id]);
        res.redirect(`/admin/inquiries/${id}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
