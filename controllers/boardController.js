const pool = require('../config/db');

async function getNoticeColumnInfo() {
    const [columns] = await pool.query('SHOW COLUMNS FROM notices');
    const names = new Set(columns.map((c) => c.Field));
    return {
        hasType: names.has('type'),
        hasIsDeleted: names.has('is_deleted'),
        hasMallId: names.has('mall_id')
    };
}

exports.getList = async (req, res, next) => {
    try {
        const { type } = req.params; // 'notice' or 'guide'
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const offset = (page - 1) * limit;

        // URL 파라미터를 DB 타입 및 제목으로 매핑
        let dbType = 'NOTICE';
        let pageTitle = '공지사항';
        
        if (type === 'guide') {
            dbType = 'GUIDE';
            pageTitle = '상품안내';
        } else if (type !== 'notice') {
            return res.status(404).render('user/404', { title: '페이지를 찾을 수 없습니다' });
        }

        const { hasType, hasIsDeleted, hasMallId } = await getNoticeColumnInfo();
        const where = [];
        const params = [];

        // 공지는 몰마다 따로다 — 보고 있는 몰의 것만 싣는다.
        if (hasMallId) {
            where.push('mall_id = ?');
            params.push(req.mallId || 1);
        }
        if (hasType) {
            where.push('type = ?');
            params.push(dbType);
        }
        if (hasIsDeleted) {
            where.push('is_deleted = 0');
        }

        const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

        // 게시물 수 조회
        const [[{ count }]] = await pool.query(
            `SELECT COUNT(*) as count FROM notices ${whereClause}`,
            params
        );
        const totalPages = Math.ceil(count / limit);

        // 목록 조회
        const listParams = [...params, limit, offset];
        const [posts] = await pool.query(
            `SELECT id, title, view_count, created_at, importance 
             FROM notices 
             ${whereClause}
             ORDER BY importance DESC, created_at DESC 
             LIMIT ? OFFSET ?`,
            listParams
        );

        res.render('user/boards/list', {
            title: pageTitle,
            posts,
            currentPage: page,
            totalPages,
            type,
            user: req.user // 뷰에서 로그인 여부 확인용
        });
    } catch (err) {
        next(err);
    }
};

exports.getDetail = async (req, res, next) => {
    try {
        const { type, id } = req.params;
        const { hasType, hasIsDeleted, hasMallId } = await getNoticeColumnInfo();
        const dbType = type === 'guide' ? 'GUIDE' : 'NOTICE';
        const mallId = req.mallId || 1;

        const where = ['id = ?'];
        const params = [id];
        // 공지는 몰마다 따로다 — 다른 몰의 글은 조회수도 올리지 않고 404 로 보낸다.
        if (hasMallId) {
            where.push('mall_id = ?');
            params.push(mallId);
        }
        if (hasType) {
            where.push('type = ?');
            params.push(dbType);
        }
        if (hasIsDeleted) {
            where.push('is_deleted = 0');
        }

        await pool.query(
            `UPDATE notices SET view_count = view_count + 1 WHERE ${where.join(' AND ')}`,
            params
        );

        const [[post]] = await pool.query(`SELECT * FROM notices WHERE ${where.join(' AND ')}`, params);
        if (!post) return res.status(404).render('user/404', { title: '게시물을 찾을 수 없습니다' });

        res.render('user/boards/detail', {
            title: type === 'guide' ? '상품안내' : '공지사항',
            post,
            type
        });
    } catch (err) {
        next(err);
    }
};
