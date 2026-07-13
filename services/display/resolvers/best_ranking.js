const pool = require('../../../config/db');
const bestRankingService = require('../../best/bestRankingService');

/*
 * best_ranking — 홈의 베스트 섹션을 **랭킹 엔진**에서 채운다.
 *
 * 예전 홈 베스트는 product_grid + product_group(manual) 이었다. 그래서 홈(수동)과
 * GNB /best(자동)가 서로 다른 상품을 보여줬다. 이제 둘 다 같은 스냅샷을 읽는다.
 *
 * config:
 *   groupId   best_group.id. 0 이거나 없으면 몰의 'ALL'(전체) 그룹을 자동으로 쓴다
 *             — 운영자가 홈 섹션마다 그룹 id 를 외우지 않아도 되게.
 *   period    REALTIME | DAILY | WEEKLY | MONTHLY (기본 DAILY)
 *   maxCount  표시 상품 수 (기본 8)
 *
 * 상품이 0건이면 null 을 반환해 섹션을 통째로 스킵한다(빈 그리드 미노출 규약).
 * 배치가 아직 안 돈 몰에서 홈이 빈 그리드로 깨지는 것을 막는다.
 */
async function resolve({ shared, config, locals }) {
    const mallId = shared.mallId || 1;

    let groupId = Number(config.groupId) || 0;
    if (!groupId) {
        const [[g]] = await pool.query(
            `SELECT id FROM best_group
              WHERE mall_id = ? AND is_active = 1 AND group_type = 'ALL'
              ORDER BY sort_order, id LIMIT 1`,
            [mallId]
        );
        if (!g) return null;
        groupId = g.id;
    }

    const { products } = await bestRankingService.getRanking({
        mallId,
        groupId,
        period: config.period || 'DAILY',
        hasUser: shared.hasUser,
        limit: Math.min(Number(config.maxCount) || 8, 60),
    });

    if (!products || products.length === 0) return null;

    locals.products = products;
    return locals;
}

module.exports = { resolve };
