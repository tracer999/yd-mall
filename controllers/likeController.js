const pool = require('../config/db');

/**
 * 찜하기 토글 (추가/삭제)
 */
exports.toggleLike = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { productId } = req.body;

        if (!productId) {
            return res.status(400).json({ success: false, message: '상품 ID가 필요합니다.' });
        }

        // 찜 목록에 이미 있는지 확인
        const [existing] = await pool.query(
            'SELECT id FROM likes WHERE user_id = ? AND product_id = ?',
            [userId, productId]
        );

        if (existing.length > 0) {
            // 있으면 삭제 (찜 해제)
            await pool.query('DELETE FROM likes WHERE id = ?', [existing[0].id]);
            res.json({ success: true, liked: false, message: '관심 상품에서 삭제했습니다.' });
        } else {
            // 없으면 추가 (찜하기)
            await pool.query(
                'INSERT INTO likes (user_id, product_id) VALUES (?, ?)',
                [userId, productId]
            );
            res.json({ success: true, liked: true, message: '관심 상품에 추가했습니다.' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
};