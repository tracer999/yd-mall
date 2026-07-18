/*
 * 네이버 기반 글로벌 카테고리 재구성 — Phase 3: 미사용 카테고리 정리 (파괴적)
 * 설계: docs/사이트개선/네이버_기반_글로벌_카테고리_재구성_설계.md §4, §5 Phase 3
 *
 * "완전히 비고(§4 체크리스트 1~8 전부 미참조) + 자식 없음(리프)" 노드만 제거 후보.
 *   - origin='naver' 뼈대는 상품이 없어도 보존(신규 등록 매칭 타겟) → 제거 대상 아님.
 *   - origin='user' 노드 중 완전 미사용 & 자식없음 = 제거 후보.
 *   - ⚠ 단 category_remap_log(REMAP)에서 FUZZY/NAME 으로 상품이 빠져나간 from 노드는
 *      **롤백 가능성**이 있으므로 제거 제외(관리자 검토·롤백 확정 전까지 보존).
 *
 * ⚠ 실행 순서: FUZZY 오매칭 롤백/수동큐 확정(Phase 4 관리자 화면) 이후에 --commit 할 것.
 *   그 전에는 dry-run 으로 후보만 확인한다.
 *
 * 실행:
 *   set -a; . /etc/environment; set +a
 *   node scripts/prune_unused_categories.js            # dry-run(기본) — 후보 식별만
 *   node scripts/prune_unused_categories.js --commit   # 실제 제거(관리자 검토 후)
 */
const pool = require('../config/db');
const { UNCATEGORIZED_NAME } = require('../services/catalog/taxonomyResolver');

const GLOBAL_MALL_ID = 0;
const COMMIT = process.argv.includes('--commit');

/** §4 체크리스트로 "참조 중"인 category_id 집합을 모은다(NORMAL). */
async function referencedIdSet() {
    const set = new Set();
    const add = (rows, col = 'id') => { for (const r of rows) if (r[col] != null) set.add(Number(r[col])); };

    // 1) products.category_id  2) banners.category_id  3) category_option.category_id
    add((await pool.query('SELECT DISTINCT category_id id FROM products WHERE category_id IS NOT NULL'))[0]);
    add((await pool.query('SELECT DISTINCT category_id id FROM banners WHERE category_id IS NOT NULL'))[0]);
    add((await pool.query('SELECT DISTINCT category_id id FROM category_option WHERE category_id IS NOT NULL'))[0]);

    // 4) custom_menu link_type='CATEGORY' link_target
    try {
        add((await pool.query(
            "SELECT DISTINCT link_target id FROM custom_menu WHERE link_type='CATEGORY' AND link_target IS NOT NULL"))[0]);
    } catch (e) { warnMissing('custom_menu', e); }

    // 5) product_group.filter_condition_json.category_id (JSON)
    try {
        const [rows] = await pool.query('SELECT filter_condition_json FROM product_group WHERE filter_condition_json IS NOT NULL');
        for (const r of rows) {
            const cid = pickJson(r.filter_condition_json, ['category_id', 'categoryId']);
            if (cid != null) set.add(Number(cid));
        }
    } catch (e) { warnMissing('product_group', e); }

    // 6) coupons.scope_json include/exclude.categoryIds (JSON 배열)
    try {
        const [rows] = await pool.query('SELECT scope_json FROM coupons WHERE scope_json IS NOT NULL');
        for (const r of rows) {
            const j = parseJson(r.scope_json);
            for (const path of [['include', 'categoryIds'], ['exclude', 'categoryIds']]) {
                const arr = j && j[path[0]] && j[path[0]][path[1]];
                if (Array.isArray(arr)) arr.forEach((x) => set.add(Number(x)));
            }
        }
    } catch (e) { warnMissing('coupons', e); }

    // 7) mall_category_visibility.category_id
    try {
        add((await pool.query('SELECT DISTINCT category_id id FROM mall_category_visibility'))[0]);
    } catch (e) { warnMissing('mall_category_visibility', e); }

    return set;
}

function parseJson(v) { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } }
function pickJson(v, keys) { const j = parseJson(v); if (!j) return null; for (const k of keys) if (j[k] != null) return j[k]; return null; }
function warnMissing(t, e) { if (e.code !== 'ER_NO_SUCH_TABLE') console.warn(`  ⚠ ${t}: ${e.message}`); }

async function main() {
    const [cats] = await pool.query(
        "SELECT id, name, parent_id, depth, origin FROM categories WHERE mall_id=? AND type='NORMAL'",
        [GLOBAL_MALL_ID]
    );
    const hasChild = new Set(cats.map((c) => c.parent_id).filter((x) => x != null));
    const referenced = await referencedIdSet();

    // FUZZY/NAME 로 상품이 빠져나간 from 노드(롤백 대비 제외)
    const [remapFrom] = await pool.query(
        "SELECT DISTINCT from_category_id id FROM category_remap_log WHERE phase='REMAP' AND match_kind IN ('FUZZY','NAME','PATH') AND reverted=0 AND from_category_id IS NOT NULL"
    );
    const rollbackable = new Set(remapFrom.map((r) => Number(r.id)));

    const candidates = [];
    const kept = { naver: 0, referenced: 0, hasChild: 0, rollbackable: 0, safety: 0 };
    for (const c of cats) {
        if (c.origin === 'naver') { kept.naver++; continue; }        // 뼈대 보존
        if (c.name === UNCATEGORIZED_NAME) { kept.safety++; continue; } // "미분류" 폴백 안전망 — 상품 없어도 보존
        if (referenced.has(c.id)) { kept.referenced++; continue; }   // §4 참조 중
        if (hasChild.has(c.id)) { kept.hasChild++; continue; }       // 자식 있음(리프 아님)
        if (rollbackable.has(c.id)) { kept.rollbackable++; continue; } // 롤백 가능성
        candidates.push(c);
    }

    console.log(`\n${COMMIT ? '[COMMIT]' : '[DRY-RUN]'} 미사용 정리 (user NORMAL 대상)`);
    console.log(`  보존: naver뼈대 ${kept.naver} · 미분류안전망 ${kept.safety} · 참조중 ${kept.referenced} · 자식보유 ${kept.hasChild} · 롤백대비 ${kept.rollbackable}`);
    console.log(`  제거 후보(완전 미사용 리프): ${candidates.length}개`);
    for (const c of candidates.slice(0, 40)) console.log(`    #${c.id} d${c.depth} ${c.name}`);
    if (candidates.length > 40) console.log(`    … 외 ${candidates.length - 40}개`);

    if (COMMIT && candidates.length) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const ids = candidates.map((c) => c.id);
            // 리프부터: 후보는 이미 자식 없음. 안전하게 IN 삭제.
            await conn.query('DELETE FROM categories WHERE id IN (?)', [ids]);
            await conn.query(
                "INSERT INTO category_remap_log (phase, match_kind, product_count, note) VALUES ('PRUNE','NONE',0,?)",
                [`미사용 리프 ${ids.length}개 제거: ${candidates.slice(0, 20).map((c) => c.name).join(', ')}${ids.length > 20 ? ' …' : ''}`]
            );
            await conn.commit();
            console.log(`  → ${ids.length}개 제거 완료`);
        } catch (e) { await (await pool.getConnection()).rollback?.(); throw e; }
        finally { conn.release(); }
    } else if (!COMMIT) {
        console.log('  ⚠ 실제 제거는 FUZZY 롤백·수동큐 확정(Phase 4) 후 --commit');
    }
    await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
