/*
 * 관리자 리뷰 관리
 *
 * 할 수 있는 일은 둘이다 — **숨기기(노출 on/off)** 와 **삭제**.
 * 관리자가 리뷰 내용을 고치는 기능은 두지 않는다. 고객이 쓴 글을 판매자가 바꾸면
 * 그건 더 이상 후기가 아니다. 부적절한 글은 숨기거나 지운다.
 *
 * **숨기기를 기본 수단으로 삼는다.** 삭제하면 그 주문 품목으로 다시 쓸 수 있게 되고
 * 적립이 한 번 더 나갈 수 있다(리뷰 행이 사라지면 중복 검사에 걸리지 않는다).
 * 숨기면 기록이 남아 그런 일이 없다.
 */

const pool = require('../../config/db');

const PER_PAGE = 50;

exports.getList = async (req, res, next) => {
    try {
        const mallId = req.adminMallId || 1;
        const keyword = String(req.query.q || '').trim();
        const visible = ['1', '0'].includes(req.query.visible) ? req.query.visible : '';
        const rating = ['1', '2', '3', '4', '5'].includes(req.query.rating) ? req.query.rating : '';
        const onlyPhoto = req.query.photo === '1';

        const where = ['(r.mall_id = ? OR r.mall_id IS NULL)'];
        const params = [mallId];
        if (visible !== '') { where.push('r.is_visible = ?'); params.push(Number(visible)); }
        if (rating) { where.push('r.rating = ?'); params.push(Number(rating)); }
        if (onlyPhoto) where.push('r.image_url IS NOT NULL');
        if (keyword) {
            where.push('(r.content LIKE ? OR p.name LIKE ? OR u.name LIKE ? OR u.email LIKE ?)');
            const like = `%${keyword}%`;
            params.push(like, like, like, like);
        }
        const whereSql = `WHERE ${where.join(' AND ')}`;

        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const [[{ total }]] = await pool.query(`
            SELECT COUNT(*) AS total FROM reviews r
              LEFT JOIN products p ON p.id = r.product_id
              LEFT JOIN users u ON u.id = r.user_id
            ${whereSql}`, params);
        const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
        const currentPage = Math.min(page, totalPages);

        const [reviews] = await pool.query(`
            SELECT r.*, p.name AS product_name, p.slug, p.thumbnail_image,
                   u.name AS user_name, u.email AS user_email,
                   o.order_number
              FROM reviews r
              LEFT JOIN products p ON p.id = r.product_id
              LEFT JOIN users u ON u.id = r.user_id
              LEFT JOIN orders o ON o.id = r.order_id
            ${whereSql}
             ORDER BY r.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, PER_PAGE, (currentPage - 1) * PER_PAGE]);

        // 요약 — 몇 건이 숨겨져 있고 별점 평균이 얼마인지
        const [[summary]] = await pool.query(`
            SELECT COUNT(*) AS total,
                   COALESCE(SUM(is_visible = 0), 0) AS hidden,
                   COALESCE(SUM(image_url IS NOT NULL), 0) AS photo,
                   COALESCE(ROUND(AVG(rating), 2), 0) AS avg_rating,
                   COALESCE(SUM(point_awarded), 0) AS point_total
              FROM reviews r WHERE (r.mall_id = ? OR r.mall_id IS NULL)`, [mallId]);

        res.render('admin/reviews/list', {
            layout: 'layouts/admin_layout',
            title: '리뷰 관리',
            reviews, summary,
            filters: { q: keyword, visible, rating, photo: onlyPhoto ? '1' : '' },
            page: currentPage, totalPages, totalCount: total,
            message: req.query.message || null,
        });
    } catch (err) {
        next(err);
    }
};

/** 노출 on/off — 부적절한 리뷰를 다루는 기본 수단. */
exports.postToggleVisible = async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const [r] = await pool.query('UPDATE reviews SET is_visible = 1 - is_visible WHERE id = ?', [id]);
        const [[row]] = await pool.query('SELECT is_visible FROM reviews WHERE id = ?', [id]);
        const msg = !r.affectedRows ? '리뷰를 찾을 수 없습니다.'
            : (row && row.is_visible ? '리뷰를 다시 노출했습니다.' : '리뷰를 숨겼습니다. 고객 화면에 보이지 않습니다.');
        res.redirect('/admin/reviews?message=' + encodeURIComponent(msg) + backQuery(req));
    } catch (err) {
        next(err);
    }
};

exports.postDelete = async (req, res, next) => {
    try {
        await pool.query('DELETE FROM reviews WHERE id = ?', [Number(req.params.id)]);
        res.redirect('/admin/reviews?message=' +
            encodeURIComponent('리뷰를 삭제했습니다. 지급된 적립금은 회수되지 않습니다.') + backQuery(req));
    } catch (err) {
        next(err);
    }
};

/** 처리 후 보던 목록으로 돌아가기 위해 필터를 되돌려 붙인다. */
function backQuery(req) {
    const p = [];
    for (const k of ['q', 'visible', 'rating', 'photo', 'page']) {
        if (req.body[k]) p.push(`${k}=${encodeURIComponent(req.body[k])}`);
    }
    return p.length ? '&' + p.join('&') : '';
}
