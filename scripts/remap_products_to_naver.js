/*
 * 네이버 기반 글로벌 카테고리 재구성 — Phase 2: 상품 재매핑 (파괴적)
 * 설계: docs/사이트개선/네이버_기반_글로벌_카테고리_재구성_설계.md §5 Phase 2 (B 공격적 편입)
 *
 * 소스 = origin='user' NORMAL 카테고리(승격 안 된 기존 것). 타겟 = origin='naver' 노드(우리 트리 안).
 * 판정 우선순위: PATH > NAME-UNIQUE > FUZZY-UNIQUE(자동) / MULTI·NONE(수동큐·보존).
 *   - 자동: products.category_id 를 소스→타겟으로 UPDATE + category_remap_log(to 채움)
 *   - FUZZY 자동은 오매칭 가능 → origin='user' 유지(승격 아님), 롤백 대상
 *   - MULTI/NONE: 상품 이동 안 함. to_category_id=NULL 로 로그 → 관리자 수동큐 대기
 *
 * 실행:
 *   set -a; . /etc/environment; set +a
 *   node scripts/remap_products_to_naver.js            # dry-run(기본)
 *   node scripts/remap_products_to_naver.js --commit   # 실제 이동
 */
const pool = require('../config/db');
const { normalizeName, scoreNames } = require('../services/catalog/taxonomyResolver');

const GLOBAL_MALL_ID = 0;
const FUZZY_THRESHOLD = 0.85;
const COMMIT = process.argv.includes('--commit');

function pathNormOf(id, byId) {
    const parts = [];
    let cur = id;
    let guard = 0;
    while (cur != null && guard++ < 10) {
        const r = byId.get(cur);
        if (!r) break;
        parts.unshift(normalizeName(r.name));
        cur = r.parent_id;
    }
    return parts.join('>');
}

async function main() {
    const [cats] = await pool.query(
        `SELECT id, name, parent_id, depth, origin, naver_category_id
           FROM categories WHERE mall_id = ? AND type = 'NORMAL'`,
        [GLOBAL_MALL_ID]
    );
    const byId = new Map(cats.map((c) => [c.id, c]));
    const naverNodes = cats.filter((c) => c.origin === 'naver');
    const userNodes = cats.filter((c) => c.origin === 'user');

    // 타겟 인덱스
    const naverByPath = new Map();   // normPath → [id]
    const naverByName = new Map();   // normName → [id]
    for (const n of naverNodes) {
        const p = pathNormOf(n.id, byId);
        if (!naverByPath.has(p)) naverByPath.set(p, []);
        naverByPath.get(p).push(n.id);
        const nm = normalizeName(n.name);
        if (!naverByName.has(nm)) naverByName.set(nm, []);
        naverByName.get(nm).push(n.id);
    }

    // 소스별 직속 상품수
    const [prodCounts] = await pool.query(
        `SELECT category_id, COUNT(*) c FROM products
          WHERE category_id IS NOT NULL GROUP BY category_id`
    );
    const prodByCat = new Map(prodCounts.map((r) => [r.category_id, r.c]));

    const buckets = { PATH: [], NAME: [], FUZZY: [], MULTI: [], NONE: [] };

    for (const u of userNodes) {
        const normPath = pathNormOf(u.id, byId);
        const normName = normalizeName(u.name);
        const pcount = prodByCat.get(u.id) || 0;

        // 1) PATH
        const pHit = naverByPath.get(normPath);
        if (pHit && pHit.length === 1) { buckets.PATH.push({ u, to: pHit[0], kind: 'PATH', score: 1, pcount }); continue; }

        // 2) NAME-UNIQUE
        const nHit = naverByName.get(normName);
        if (nHit && nHit.length === 1) { buckets.NAME.push({ u, to: nHit[0], kind: 'NAME', score: 1, pcount }); continue; }
        if (nHit && nHit.length > 1) { buckets.MULTI.push({ u, cands: nHit, kind: 'NAME-MULTI', pcount }); continue; }

        // 3) FUZZY (부분포함/유사도 ≥ 임계) — 임계 넘는 타겟 수집
        const fz = [];
        for (const n of naverNodes) {
            const s = scoreNames(u.name, n.name);
            if (s >= FUZZY_THRESHOLD) fz.push({ id: n.id, s });
        }
        if (fz.length === 1) { buckets.FUZZY.push({ u, to: fz[0].id, kind: 'FUZZY', score: fz[0].s, pcount }); continue; }
        if (fz.length > 1) { buckets.MULTI.push({ u, cands: fz.map((x) => x.id), kind: 'FUZZY-MULTI', pcount }); continue; }

        buckets.NONE.push({ u, pcount });
    }

    // 실행
    const conn = await pool.getConnection();
    let movedProducts = 0;
    try {
        await conn.beginTransaction();

        const autoMove = [...buckets.PATH, ...buckets.NAME, ...buckets.FUZZY];
        for (const m of autoMove) {
            if (m.u.id === m.to) continue; // 자기참조 방어
            if (COMMIT) {
                const [res] = await conn.query(
                    'UPDATE products SET category_id = ? WHERE category_id = ?',
                    [m.to, m.u.id]
                );
                m.moved = res.affectedRows || 0;
                await conn.query(
                    `INSERT INTO category_remap_log (phase, from_category_id, to_category_id, product_count, match_kind, score, note)
                     VALUES ('REMAP', ?, ?, ?, ?, ?, ?)`,
                    [m.u.id, m.to, m.moved, m.kind === 'PATH' ? 'PATH' : (m.kind === 'NAME' ? 'NAME' : 'FUZZY'),
                     m.score, `${m.u.name} → cat#${m.to} (${m.kind})`]
                );
            } else {
                m.moved = m.pcount;
            }
            movedProducts += m.moved;
        }

        // 수동큐/보존 로그 (to=NULL)
        if (COMMIT) {
            for (const m of buckets.MULTI) {
                await conn.query(
                    `INSERT INTO category_remap_log (phase, from_category_id, to_category_id, product_count, match_kind, note)
                     VALUES ('REMAP', ?, NULL, ?, 'MANUAL', ?)`,
                    [m.u.id, m.pcount, `${m.u.name} ${m.kind} 후보 ${m.cands.length}개 — 수동선택 대기`]
                );
            }
            for (const m of buckets.NONE) {
                await conn.query(
                    `INSERT INTO category_remap_log (phase, from_category_id, to_category_id, product_count, match_kind, note)
                     VALUES ('REMAP', ?, NULL, ?, 'NONE', ?)`,
                    [m.u.id, m.pcount, `${m.u.name} 무매칭 — 보존(origin=user)`]
                );
            }
            await conn.commit();
        } else {
            await conn.rollback();
        }
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }

    // 요약
    const sum = (arr) => arr.reduce((a, m) => a + (m.moved ?? m.pcount ?? 0), 0);
    console.log(`\n${COMMIT ? '[COMMIT]' : '[DRY-RUN]'} 상품 재매핑 판정 (소스 user 카테고리 ${userNodes.length}개)`);
    console.log(`  PATH   자동   : ${String(buckets.PATH.length).padStart(3)}개 카테고리 · 상품 ${sum(buckets.PATH)}`);
    console.log(`  NAME   자동   : ${String(buckets.NAME.length).padStart(3)}개 · 상품 ${sum(buckets.NAME)}`);
    console.log(`  FUZZY  자동   : ${String(buckets.FUZZY.length).padStart(3)}개 · 상품 ${sum(buckets.FUZZY)} (오매칭 가능·롤백대상)`);
    console.log(`  MULTI  수동큐 : ${String(buckets.MULTI.length).padStart(3)}개 · 상품 ${sum(buckets.MULTI)}`);
    console.log(`  NONE   보존   : ${String(buckets.NONE.length).padStart(3)}개 · 상품 ${sum(buckets.NONE)}`);
    console.log(`  → 자동 이동 상품 합계: ${movedProducts}`);
    if (!COMMIT) console.log('  실제 이동하려면 --commit');

    // FUZZY 자동편입 상세(오매칭 육안 점검용) — 상위 20
    if (buckets.FUZZY.length) {
        console.log('\n  [FUZZY 자동편입 상세 — 오매칭 점검]');
        for (const m of buckets.FUZZY.slice(0, 20)) {
            const t = byId.get(m.to);
            console.log(`    ${m.u.name}  →  ${t ? t.name : m.to} (score ${m.score.toFixed(2)}, 상품 ${m.pcount})`);
        }
    }
    await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
