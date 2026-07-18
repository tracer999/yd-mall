/*
 * 네이버 → 우리 글로벌 카테고리 반영 (Phase 1 시드 + Phase 4 지속 동기화 공유 엔진)
 * 설계: docs/사이트개선/네이버_기반_글로벌_카테고리_재구성_설계.md §5 Phase 1·4
 *
 * naver_category(is_active=1, level≤3) 를 글로벌 categories(mall_id=0, NORMAL) 에 반영한다.
 *   - 같은 부모 아래 정규화 이름 완전일치 노드가 있으면 재사용 + origin='naver' 승격(dedup)
 *   - 없으면 생성. 각 네이버 노드 ↔ 우리 노드 1:1, naver_category_id 기록.
 * 멱등(이름 dedup). 초기 벌크 시드와 증분 동기화 모두 이 함수 하나로 처리한다.
 *
 * 지속 동기화(reflect)는 여기에 "비활성 정리"를 더한다:
 *   - naver_category.is_active=0 이 된 노드에 대응하는 우리 naver 노드가
 *     §4 체크리스트로 완전 미사용 & 자식없음이면 제거(soft-drop). 아니면 보존.
 *   - origin='user' 는 절대 건드리지 않는다.
 */
const pool = require('../../config/db');
const { normalizeName } = require('../catalog/taxonomyResolver');

const GLOBAL_MALL_ID = 0;

/**
 * 네이버 L1~L3 트리를 categories 에 반영(멱등). 트랜잭션은 호출자가 관리.
 * @param {object} conn  트랜잭션 커넥션(필수 — 원자성)
 * @param {{commit?:boolean}} [opts] commit=false 면 카운트만(쓰기 안 함)
 * @returns {Promise<{created:number, promoted:number, reused:number, total:number}>}
 */
async function syncTreeFromNaver(conn, { commit = true } = {}) {
    const [naverNodes] = await conn.query(
        `SELECT naver_category_id, name, whole_category_name, category_level
           FROM naver_category
          WHERE is_active = 1 AND category_level <= 3
          ORDER BY category_level, naver_category_id`
    );
    const [existing] = await conn.query(
        `SELECT id, name, parent_id, origin, naver_category_id
           FROM categories WHERE mall_id = ? AND type = 'NORMAL'`,
        [GLOBAL_MALL_ID]
    );

    const keyOf = (parentId) => (parentId == null ? 'ROOT' : String(parentId));
    const childIndex = new Map();
    for (const r of existing) {
        const k = keyOf(r.parent_id);
        if (!childIndex.has(k)) childIndex.set(k, new Map());
        childIndex.get(k).set(normalizeName(r.name), r);
    }
    const [ordRows] = await conn.query(
        `SELECT COALESCE(parent_id, 0) pk, COALESCE(MAX(display_order), -1) + 1 nxt
           FROM categories WHERE mall_id = ? AND type = 'NORMAL' GROUP BY parent_id`,
        [GLOBAL_MALL_ID]
    );
    const nextOrder = new Map(ordRows.map((r) => [String(r.pk), r.nxt]));
    const bumpOrder = (parentId) => {
        const pk = String(parentId == null ? 0 : parentId);
        const v = nextOrder.has(pk) ? nextOrder.get(pk) : 0;
        nextOrder.set(pk, v + 1);
        return v;
    };

    const wholeToOurId = new Map();
    let created = 0, promoted = 0, reused = 0;

    for (const nn of naverNodes) {
        const segs = String(nn.whole_category_name).split('>').map((s) => s.trim()).filter(Boolean);
        if (!segs.length) continue;
        const name = segs[segs.length - 1].slice(0, 50);
        const parentWhole = segs.slice(0, -1).join('>');
        const parentId = parentWhole ? (wholeToOurId.get(parentWhole) ?? null) : null;
        if (parentWhole && parentId == null) continue; // 부모 미발견(정렬상 없어야 함)
        const depth = segs.length;
        const norm = normalizeName(name);
        const pk = keyOf(parentId);
        const group = childIndex.get(pk) || new Map();

        let ourId;
        const hit = group.get(norm);
        if (hit) {
            ourId = hit.id;
            if (hit.origin !== 'naver' || hit.naver_category_id !== nn.naver_category_id) {
                if (commit) {
                    await conn.query('UPDATE categories SET origin=?, naver_category_id=? WHERE id=?',
                        ['naver', nn.naver_category_id, ourId]);
                }
                if (hit.origin !== 'naver') promoted++; else reused++;
                hit.origin = 'naver'; hit.naver_category_id = nn.naver_category_id;
            } else { reused++; }
        } else {
            const ord = bumpOrder(parentId);
            if (commit) {
                const [res] = await conn.query(
                    `INSERT INTO categories
                        (mall_id, name, display_order, parent_id, depth, is_active, pc_visible, mobile_visible, type, origin, naver_category_id)
                     VALUES (?, ?, ?, ?, ?, 1, 1, 1, 'NORMAL', 'naver', ?)`,
                    [GLOBAL_MALL_ID, name, ord, parentId, depth, nn.naver_category_id]
                );
                ourId = res.insertId;
            } else { ourId = -(created + 1); }
            created++;
            const rec = { id: ourId, name, parent_id: parentId, origin: 'naver', naver_category_id: nn.naver_category_id };
            if (!childIndex.has(pk)) childIndex.set(pk, new Map());
            childIndex.get(pk).set(norm, rec);
        }
        wholeToOurId.set(nn.whole_category_name, ourId);
    }
    return { created, promoted, reused, total: naverNodes.length };
}

/**
 * 네이버에서 비활성(is_active=0)된 노드에 대응하는 우리 naver 노드 중
 * FK 미참조 & 자식없음인 것을 **soft 비활성(is_active=0)** 한다(hard delete 아님).
 *
 * ⚠ 이 함수는 24h 크론(naverTaxonomySync)에서 **무인 실행**된다. 그래서:
 *   - hard delete 하지 않는다 → 오판정해도 복구는 is_active=1 한 번.
 *   - 참조 판별은 FK 3종(products/banners/category_option)만 본다. JSON 참조
 *     (coupon/custom_menu/product_group/mall_category_visibility)는 여기서 보지 않지만,
 *     soft 라서 실삭제 위험이 없다. **hard 제거는 관리자 prune 스크립트**
 *     (scripts/prune_unused_categories.js — §4 전체 체크리스트)가 담당한다.
 *   - origin='user' 는 절대 건드리지 않는다.
 * @param {object} conn 트랜잭션 커넥션
 * @param {{commit?:boolean}} [opts]
 * @returns {Promise<{removed:number, ids:number[]}>} removed = soft 비활성한 수
 */
async function pruneDeactivated(conn, { commit = true } = {}) {
    // 비활성 네이버 id 에 매핑된 우리 naver 노드(아직 활성인 것만)
    const [nodes] = await conn.query(
        // categories.naver_category_id(general_ci) ↔ naver_category(unicode_ci) collation 불일치 →
        // JOIN 키에 collation 명시(둘 다 ASCII 숫자 ID 라 결과 동일).
        `SELECT c.id, c.parent_id, c.naver_category_id
           FROM categories c
           JOIN naver_category n
             ON n.naver_category_id = c.naver_category_id COLLATE utf8mb4_unicode_ci
          WHERE c.mall_id = ? AND c.type = 'NORMAL' AND c.origin = 'naver'
            AND c.is_active = 1 AND n.is_active = 0`,
        [GLOBAL_MALL_ID]
    );
    if (!nodes.length) return { removed: 0, ids: [] };

    const [childRows] = await conn.query(
        "SELECT DISTINCT parent_id id FROM categories WHERE parent_id IS NOT NULL");
    const hasChild = new Set(childRows.map((r) => r.id));

    const targets = [];
    for (const nd of nodes) {
        if (hasChild.has(nd.id)) continue; // 자식 보유 → 보존
        const [[used]] = await conn.query(
            `SELECT
               (SELECT COUNT(*) FROM products WHERE category_id=?) +
               (SELECT COUNT(*) FROM banners WHERE category_id=?) +
               (SELECT COUNT(*) FROM category_option WHERE category_id=?) AS n`,
            [nd.id, nd.id, nd.id]
        );
        if (used.n > 0) continue; // FK 참조 중 → 보존
        targets.push(nd.id);
    }
    if (commit && targets.length) {
        await conn.query('UPDATE categories SET is_active=0 WHERE id IN (?)', [targets]);
    }
    return { removed: targets.length, ids: targets };
}

/**
 * 지속 동기화 1회 — naverTaxonomySync.syncCategories 성공 이후 훅으로 호출.
 * 신규 반영 + 비활성 정리 + category_remap_log(SYNC) 기록. 자체 트랜잭션.
 * @param {{commit?:boolean}} [opts]
 */
async function reflect({ commit = true } = {}) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const s = await syncTreeFromNaver(conn, { commit });
        const p = await pruneDeactivated(conn, { commit });
        if (commit) {
            await conn.query(
                `INSERT INTO category_remap_log (phase, match_kind, note)
                 VALUES ('SYNC', 'PATH', ?)`,
                [`동기화: 신규 ${s.created}, 승격 ${s.promoted}, 비활성정리 ${p.removed}`]
            );
            await conn.commit();
        } else {
            await conn.rollback();
        }
        return { ...s, removed: p.removed };
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}

module.exports = { syncTreeFromNaver, pruneDeactivated, reflect };
