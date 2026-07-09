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

/**
 * 브랜드 찜하기 토글 (추가/삭제)
 * 브랜드는 categories.type = 'BRAND' 행이다.
 */
exports.toggleBrandLike = async (req, res) => {
    try {
        const userId = req.user.id;
        const brandId = Number(req.body.brandId);

        if (!brandId) {
            return res.status(400).json({ success: false, message: '브랜드 ID가 필요합니다.' });
        }

        // 실제 브랜드 카테고리인지 검증 (임의 category_id 주입 방지)
        const [brand] = await pool.query(
            "SELECT id FROM categories WHERE id = ? AND type = 'BRAND'",
            [brandId]
        );
        if (brand.length === 0) {
            return res.status(404).json({ success: false, message: '존재하지 않는 브랜드입니다.' });
        }

        const [existing] = await pool.query(
            'SELECT id FROM brand_likes WHERE user_id = ? AND category_id = ?',
            [userId, brandId]
        );

        if (existing.length > 0) {
            await pool.query('DELETE FROM brand_likes WHERE id = ?', [existing[0].id]);
            return res.json({ success: true, liked: false, message: '찜한 브랜드에서 삭제했습니다.' });
        }

        await pool.query(
            'INSERT INTO brand_likes (user_id, category_id) VALUES (?, ?)',
            [userId, brandId]
        );
        return res.json({ success: true, liked: true, message: '찜한 브랜드에 추가했습니다.' });
    } catch (err) {
        console.error('toggleBrandLike error:', err.message);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
};