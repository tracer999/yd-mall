const pool = require('../../config/db');

/*
 * 계층 뎁스 강제 유틸 (M4)
 *
 * 계층은 parent_id 자기참조(구조상 무제한)로 저장하되, 최대 뎁스는 앱 레이어에서 강제한다.
 * MySQL CHECK 로는 "부모.depth + 1" 같은 동적 검증이 불가능하기 때문이다.
 *
 *   카테고리(categories)  최대 3뎁스  ← navigation_config.category_max_depth
 *
 * depth 는 캐시 컬럼으로 물리 저장한다(조회 성능·검증 단순화).
 * 부모를 옮기면 자신 + 모든 후손의 depth 를 재계산해야 한다.
 *
 * 설계: docs/사이트개선/frontend_dev_plan.md §5.4
 */

/** 허용 테이블 화이트리스트 — 식별자를 쿼리에 넣기 전 반드시 통과시킨다(SQL 인젝션 방지) */
const ALLOWED_TABLES = Object.freeze({
    categories: { idCol: 'id', parentCol: 'parent_id', depthCol: 'depth' },
});

class DepthLimitError extends Error {
    constructor(maxDepth) {
        super(`카테고리는 최대 ${maxDepth}단계까지만 만들 수 있습니다.`);
        this.name = 'DepthLimitError';
        this.statusCode = 400;
        this.maxDepth = maxDepth;
    }
}

function tableMeta(table) {
    const meta = ALLOWED_TABLES[table];
    if (!meta) throw new Error(`depthGuard: 허용되지 않은 테이블 '${table}'`);
    return meta;
}

/** navigation_config 에서 카테고리 최대 뎁스를 읽는다(없으면 3). */
async function getCategoryMaxDepth(mallId = 1) {
    const [rows] = await pool.query(
        'SELECT category_max_depth FROM navigation_config WHERE mall_id = ? LIMIT 1',
        [mallId]
    );
    const v = rows[0] && Number(rows[0].category_max_depth);
    return v > 0 ? v : 3;
}

/**
 * 부모 아래에 자식을 만들 수 있는지 검사하고, 만들어질 자식의 depth 를 돌려준다.
 * parentId 가 없으면(최상위) depth = 1.
 *
 * @throws {DepthLimitError} 부모.depth + 1 > maxDepth
 * @returns {Promise<number>} 자식이 가질 depth
 */
async function assertDepthAllowed({ table = 'categories', parentId = null, maxDepth, conn = pool }) {
    const { idCol, depthCol } = tableMeta(table);
    const limit = maxDepth || await getCategoryMaxDepth();

    if (!parentId) return 1; // 최상위

    const [rows] = await conn.query(
        `SELECT \`${depthCol}\` AS depth FROM \`${table}\` WHERE \`${idCol}\` = ?`,
        [parentId]
    );
    if (rows.length === 0) {
        const err = new Error('상위 항목을 찾을 수 없습니다.');
        err.statusCode = 400;
        throw err;
    }

    const childDepth = Number(rows[0].depth) + 1;
    if (childDepth > limit) throw new DepthLimitError(limit);
    return childDepth;
}

/**
 * 부모 선택지로 보여줄 수 있는 노드(= 자식을 하나 더 받을 수 있는 노드)의 최대 depth.
 * maxDepth=3 이면 depth <= 2 인 노드만 부모가 될 수 있다.
 */
async function maxParentDepth(maxDepth) {
    const limit = maxDepth || await getCategoryMaxDepth();
    return limit - 1;
}

/**
 * nodeId 자신과 모든 후손의 depth 를 재계산해 갱신한다(BFS).
 * 부모를 다른 노드로 옮긴 직후에 호출한다.
 *
 * @returns {Promise<number>} 갱신된 행 수
 * @throws {DepthLimitError} 재계산 결과 서브트리가 최대 뎁스를 넘으면
 */
async function recalcSubtreeDepth({ table = 'categories', nodeId, maxDepth, conn = pool }) {
    const { idCol, parentCol, depthCol } = tableMeta(table);
    const limit = maxDepth || await getCategoryMaxDepth();

    // 시작 노드의 새 depth = 부모.depth + 1 (부모 없으면 1)
    const [selfRows] = await conn.query(
        `SELECT \`${parentCol}\` AS parentId FROM \`${table}\` WHERE \`${idCol}\` = ?`,
        [nodeId]
    );
    if (selfRows.length === 0) throw new Error('대상 노드를 찾을 수 없습니다.');

    const startDepth = await assertDepthAllowed({
        table, parentId: selfRows[0].parentId, maxDepth: limit, conn,
    });

    let updated = 0;
    let level = [{ id: nodeId, depth: startDepth }];

    while (level.length > 0) {
        for (const node of level) {
            if (node.depth > limit) throw new DepthLimitError(limit);
            await conn.query(
                `UPDATE \`${table}\` SET \`${depthCol}\` = ? WHERE \`${idCol}\` = ?`,
                [node.depth, node.id]
            );
            updated++;
        }

        const ids = level.map(n => n.id);
        const depthById = new Map(level.map(n => [n.id, n.depth]));
        const [children] = await conn.query(
            `SELECT \`${idCol}\` AS id, \`${parentCol}\` AS parentId
             FROM \`${table}\` WHERE \`${parentCol}\` IN (?)`,
            [ids]
        );
        level = children.map(c => ({ id: c.id, depth: depthById.get(c.parentId) + 1 }));
    }

    return updated;
}

module.exports = {
    assertDepthAllowed,
    recalcSubtreeDepth,
    getCategoryMaxDepth,
    maxParentDepth,
    DepthLimitError,
};
