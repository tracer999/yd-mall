const pool = require('../config/db');

/*
 * 섹션 AJAX 부분 렌더 컨트롤러 (CT-3)
 *
 * 스토어프론트 섹션이 무새로고침으로 데이터만 갱신할 때 쓰는 JSON 엔드포인트.
 * 정렬/필터는 화이트리스트만 허용해 SQL 인젝션을 차단한다.
 */

const P_STATUS = "p.status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')";

/** 정렬 화이트리스트 — 사용자 입력을 직접 SQL에 넣지 않는다 */
const SORT_MAP = {
    views: 'p.view_count DESC, p.created_at DESC',
    sales: 'p.view_count DESC, p.created_at DESC', // 판매량 컬럼 도입 전까지 조회수로 대체
    newest: 'p.created_at DESC',
    discount: 'p.discount_rate DESC, p.created_at DESC',
};

const MAX_LIMIT = 20;

function visibilityClause(hasUser) {
    return hasUser ? "p.visibility IN ('PUBLIC','MEMBER_ONLY')" : "p.visibility = 'PUBLIC'";
}

/**
 * GET /sections/ranking?categoryId=&sort=&limit=
 * 카테고리별 랭킹 상품 목록 (ranking_tabs 탭 전환용)
 */
exports.getRanking = async (req, res) => {
    try {
        const categoryId = Number(req.query.categoryId) || null;
        const sort = SORT_MAP[req.query.sort] ? req.query.sort : 'views';
        const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), MAX_LIMIT);

        const where = [P_STATUS, visibilityClause(req.user)];
        const params = [];
        if (categoryId) {
            where.push('p.category_id = ?');
            params.push(categoryId);
        }

        const [products] = await pool.query(
            `SELECT p.id, p.name, p.slug, p.price, p.original_price, p.discount_rate,
                    p.main_image, p.stock, p.status, p.provider,
                    p.product_badge, p.distribution_badge
             FROM products p
             WHERE ${where.join(' AND ')}
             ORDER BY ${SORT_MAP[sort]}
             LIMIT ?`,
            [...params, limit]
        );

        res.json({ success: true, products });
    } catch (err) {
        console.error('[sections] getRanking 오류:', err.message);
        res.status(500).json({ success: false, message: '상품을 불러오지 못했습니다.', products: [] });
    }
};
