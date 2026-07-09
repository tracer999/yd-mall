const pool = require('../../../config/db');

/*
 * 리졸버 공용 쿼리/헬퍼 (CT-0)
 *
 * 리졸버 계약:
 *   async resolve(ctx) → locals | null
 *   ctx = { section, shared, config, locals }
 *     section : page_section 행 (또는 발행 스냅샷 행)
 *     shared  : 요청 단위 공유 컨텍스트 { hasUser, heroData, kakaoUrl, ... }
 *     config  : config_json 파싱 결과
 *     locals  : { ...config, title } 기본 로컬 (리졸버가 보강해서 반환)
 *   null 을 반환하면 해당 섹션은 렌더에서 스킵된다(빈 데이터 처리 규약).
 */

/** 전시 가능한 상품 상태 */
const P_STATUS = "p.status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')";

/** 비로그인 사용자에게는 PUBLIC 상품만 노출 */
function visibilityClause(hasUser) {
    return hasUser ? "p.visibility IN ('PUBLIC','MEMBER_ONLY')" : "p.visibility = 'PUBLIC'";
}

/** 홈 카테고리 탭용: 상품이 1건 이상 있는 NORMAL 카테고리 */
async function loadHomeCategories(hasUser) {
    const vis = visibilityClause(hasUser);
    const [rows] = await pool.query(`
    SELECT c.id, c.name, COUNT(p.id) AS product_count
    FROM categories c
    JOIN products p ON p.category_id = c.id AND ${P_STATUS} AND ${vis}
    WHERE c.type = 'NORMAL'
    GROUP BY c.id, c.name
    HAVING product_count > 0
    ORDER BY c.display_order ASC
  `);
    return rows;
}

module.exports = { P_STATUS, visibilityClause, loadHomeCategories };
