/*
 * 카테고리·브랜드 글로벌화 — Phase A (매핑표 생성, 파괴 없음)
 * 설계: docs/사이트개선/카테고리_브랜드_글로벌화_설계.md §4 Phase A
 *
 * 하는 일:
 *   - NORMAL 은 계층 경로(대>중>소), BRAND 는 이름 기준으로 몰 간 중복을 병합할 매핑을 계산.
 *   - old category_id → global(대표) category_id 매핑을 `category_global_map` 에 저장.
 *   - **categories/products 는 건드리지 않는다.** (Phase B 에서 별도 승인 후 재지정)
 *
 * 안전: 신규 매핑 테이블 INSERT 만. 기존 데이터 변경/삭제 없음.
 * 실행: set -a; . /etc/environment; set +a; node scripts/migrations/category_global_phase_a.js
 */
const bootstrap = require('../_bootstrap');
const pool = require('../../config/db');

const TYPES = ['NORMAL', 'BRAND'];

async function main() {
    await bootstrap();

    await pool.query(`CREATE TABLE IF NOT EXISTS category_global_map (
        old_id INT NOT NULL PRIMARY KEY,
        global_id INT NOT NULL,
        type VARCHAR(10) NOT NULL,
        merge_key VARCHAR(600) NOT NULL,
        old_mall_id BIGINT NOT NULL,
        is_representative TINYINT(1) NOT NULL DEFAULT 0,
        KEY idx_global (global_id),
        KEY idx_key (type, merge_key(191))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='글로벌화 Phase A: old→global 카테고리 매핑'`);

    const [cats] = await pool.query(
        "SELECT id, mall_id, name, parent_id, depth, type FROM categories WHERE type IN ('NORMAL','BRAND')"
    );
    const byId = new Map(cats.map((c) => [c.id, c]));

    // NORMAL 경로 계산(같은 몰 내 parent 체인) — 이름을 '>' 로 연결
    function pathOf(cat) {
        const parts = [];
        let cur = cat;
        const seen = new Set();
        while (cur && !seen.has(cur.id)) {
            seen.add(cur.id);
            parts.unshift(String(cur.name).trim());
            cur = cur.parent_id ? byId.get(cur.parent_id) : null;
        }
        return parts.join(' > ');
    }

    // 병합 키: NORMAL=경로, BRAND=이름(trim)
    function mergeKey(cat) {
        return cat.type === 'BRAND' ? String(cat.name).trim() : pathOf(cat);
    }

    // (type, key) 그룹 → 대표(min id)
    const groups = new Map();
    for (const c of cats) {
        const k = c.type + '::' + mergeKey(c);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(c);
    }

    const rows = [];
    let mergedAway = 0;
    const mergeSamples = [];
    for (const [k, arr] of groups) {
        arr.sort((a, b) => a.id - b.id);
        const rep = arr[0];
        for (const c of arr) {
            rows.push([c.id, rep.id, c.type, mergeKey(c).slice(0, 600), c.mall_id, c.id === rep.id ? 1 : 0]);
            if (c.id !== rep.id) {
                mergedAway++;
                if (mergeSamples.length < 12) mergeSamples.push(`${c.type} "${mergeKey(c)}" : ${c.id}(mall${c.mall_id}) → ${rep.id}(mall${rep.mall_id})`);
            }
        }
    }

    // 기존 매핑 비우고 재적재(재실행 안전)
    await pool.query('DELETE FROM category_global_map');
    for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        await pool.query(
            'INSERT INTO category_global_map (old_id, global_id, type, merge_key, old_mall_id, is_representative) VALUES ?',
            [chunk]
        );
    }

    // 리포트
    const total = cats.length;
    const globalCount = groups.size;
    const normalGroups = [...groups.keys()].filter((k) => k.startsWith('NORMAL::')).length;
    const brandGroups = [...groups.keys()].filter((k) => k.startsWith('BRAND::')).length;

    console.log('=== Phase A 매핑 완료 (파괴 없음) ===');
    console.log(`원본 카테고리(NORMAL+BRAND): ${total}`);
    console.log(`글로벌(병합 후) 개수: ${globalCount}  (NORMAL ${normalGroups} + BRAND ${brandGroups})`);
    console.log(`병합으로 흡수될 중복: ${mergedAway}`);
    console.log('\n병합 예시:');
    mergeSamples.forEach((s) => console.log('  ' + s));

    // 검증: 모든 카테고리가 매핑됐나 / 대표는 자기자신 매핑
    const [[chk]] = await pool.query('SELECT COUNT(*) c FROM category_global_map');
    const [[rep]] = await pool.query('SELECT COUNT(*) c FROM category_global_map WHERE is_representative=1');
    console.log(`\n검증: 매핑행 ${chk.c}/${total} (일치 ${chk.c === total ? 'OK' : 'FAIL'}), 대표 ${rep.c}=${globalCount} (${rep.c === globalCount ? 'OK' : 'FAIL'})`);

    // 상품이 참조하는 카테고리가 전부 매핑에 있는지(Phase B 안전성)
    const [[orphan]] = await pool.query(`
        SELECT COUNT(*) c FROM (
          SELECT category_id AS cid FROM products WHERE category_id IS NOT NULL
          UNION SELECT brand_category_id FROM products WHERE brand_category_id IS NOT NULL
        ) t LEFT JOIN category_global_map m ON m.old_id = t.cid
        WHERE m.old_id IS NULL AND t.cid IN (SELECT id FROM categories WHERE type IN ('NORMAL','BRAND'))`);
    console.log(`상품 참조 카테고리 중 매핑 누락(0이어야): ${orphan.c}`);

    await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
