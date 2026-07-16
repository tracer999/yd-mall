const pool = require('../../config/db');

function decodeHtmlEntities(value) {
    if (!value || typeof value !== 'string') return value;

    const decodeOnce = (input) => {
        let out = input
            .replace(/&(#x[0-9a-fA-F]+|#\d+);/g, (m, code) => {
                if (code.startsWith('#x') || code.startsWith('#X')) {
                    const num = parseInt(code.slice(2), 16);
                    return Number.isFinite(num) ? String.fromCharCode(num) : m;
                }
                const num = parseInt(code.slice(1), 10);
                return Number.isFinite(num) ? String.fromCharCode(num) : m;
            })
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, '&');
        return out;
    };

    let prev = null;
    let cur = value;
    for (let i = 0; i < 3 && cur !== prev; i++) {
        prev = cur;
        cur = decodeOnce(cur);
    }
    return cur;
}

exports.getList = async (req, res) => {
    try {
        const MALL_ID = req.adminMallId || 1;
        const type = req.query.type;
        const where = ['mall_id = ?'];
        const queryParams = [MALL_ID];

        if (type && (type === 'NOTICE' || type === 'GUIDE')) {
            where.push('type = ?');
            queryParams.push(type);
        }

        const query = `SELECT * FROM notices WHERE ${where.join(' AND ')} ORDER BY importance DESC, created_at DESC`;

        const [notices] = await pool.query(query, queryParams);

        res.render('admin/notices/list', {
            layout: 'layouts/admin_layout',
            title: '게시판 관리',
            notices,
            currentType: type || 'ALL'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getCreate = (req, res) => {
    res.render('admin/notices/form', {
        layout: 'layouts/admin_layout',
        title: '공지사항 등록',
        notice: null,
        tinymceKey: process.env.TINYMCE_KEY
    });
};

exports.postCreate = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    const { title, content, importance, type } = req.body;
    const normalizedContent = decodeHtmlEntities(content);

    try {
        if (importance) {
            // 상단 고정 개수 제한 (3개) — 몰마다 따로 센다.
            const [[{ count }]] = await pool.query(
                'SELECT COUNT(*) as count FROM notices WHERE mall_id = ? AND importance = 1',
                [MALL_ID]
            );
            if (count >= 3) {
                return res.send('<script>alert("상단 고정은 최대 3개까지만 가능합니다.");history.back();</script>');
            }
        }

        await pool.query(
            'INSERT INTO notices (mall_id, title, content, importance, type) VALUES (?, ?, ?, ?, ?)',
            [MALL_ID, title, normalizedContent, importance ? 1 : 0, type || 'NOTICE']
        );
        res.redirect('/admin/notices');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getDetail = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    const { id } = req.params;

    try {
        // mall_id 를 함께 걸어 다른 몰의 공지는 열리지 않게 한다.
        const [rows] = await pool.query('SELECT * FROM notices WHERE id = ? AND mall_id = ?', [id, MALL_ID]);
        if (rows.length === 0) return res.redirect('/admin/notices');

        const notice = rows[0];
        notice.content = decodeHtmlEntities(notice.content);

        res.render('admin/notices/detail', {
            layout: 'layouts/admin_layout',
            title: '공지사항 상세',
            notice
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getEdit = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    const { id } = req.params;

    try {
        const [rows] = await pool.query('SELECT * FROM notices WHERE id = ? AND mall_id = ?', [id, MALL_ID]);
        if (rows.length === 0) return res.redirect('/admin/notices');

        const notice = rows[0];
        notice.content = decodeHtmlEntities(notice.content);

        res.render('admin/notices/form', {
            layout: 'layouts/admin_layout',
            title: '공지사항 수정',
            notice,
            tinymceKey: process.env.TINYMCE_KEY
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postEdit = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    const { id } = req.params;
    const { title, content, importance, type } = req.body;
    const normalizedContent = decodeHtmlEntities(content);

    try {
        if (importance) {
            // 상단 고정 개수 제한 (3개) — 몰마다 따로 세고, 현재 글은 제외한다.
            const [[{ count }]] = await pool.query(
                'SELECT COUNT(*) as count FROM notices WHERE mall_id = ? AND importance = 1 AND id != ?',
                [MALL_ID, id]
            );
            if (count >= 3) {
                return res.send('<script>alert("상단 고정은 최대 3개까지만 가능합니다.");history.back();</script>');
            }
        }

        await pool.query(
            'UPDATE notices SET title = ?, content = ?, importance = ?, type = ? WHERE id = ? AND mall_id = ?',
            [title, normalizedContent, importance ? 1 : 0, type || 'NOTICE', id, MALL_ID]
        );
        res.redirect('/admin/notices');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postDelete = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    const { id } = req.body;

    try {
        await pool.query('DELETE FROM notices WHERE id = ? AND mall_id = ?', [id, MALL_ID]);
        res.redirect('/admin/notices');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postUploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
        }
        return res.json({ location: '/uploads/products/' + req.file.filename });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: '이미지 업로드 중 오류가 발생했습니다.' });
    }
};
