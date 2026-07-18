/*
 * 네이버 표준 전면 정리 (사용자 지시: "모두 네이버로 매핑, 네이버 아닌 카테고리 일단 모두 제거")
 * 설계 연장: docs/사이트개선/네이버_기반_글로벌_카테고리_재구성_설계.md §5 Phase 2·3
 *
 * origin='user' 카테고리에 남은 상품을 네이버 노드로 최대한 이동하고,
 * 비워진 user 카테고리를 soft 비활성(is_active=0)한다. hard delete 아님(가역적, "일단").
 *
 * 타겟 결정 우선순위(각 user 카테고리별):
 *   1) NAME     정규화 이름이 네이버 노드와 유일 일치
 *   2) FUZZY    scoreNames ≥ 0.85 후보 중 최고점(동점이면 상위=depth 작은). MANUAL 해결
 *   3) ANCESTOR 최상위 조상(대분류) 이름 → 네이버 L1 매칭 → 그 L1. NONE의 최근접 조상
 *   4) 미분류    위 전부 실패한 진짜 잔여만(고객 숨김 안전망)
 *
 * 상품 이동 → 그 다음 빈 user 카테고리 soft 비활성(리프부터, 상품 보유 노드는 건드리지 않음).
 *
 * 실행:
 *   set -a; . /etc/environment; set +a
 *   node scripts/remap_all_to_naver_and_purge.js            # dry-run(분포만)
 *   node scripts/remap_all_to_naver_and_purge.js --commit   # 실제 이동+비활성
 */
const pool = require('../config/db');
const { normalizeName, scoreNames, getUncategorizedCategoryId } = require('../services/catalog/taxonomyResolver');

const GLOBAL_MALL_ID = 0;
const FUZZY = 0.85;
const COMMIT = process.argv.includes('--commit');

// user 대분류(depth1) → 네이버 L1 의미 매핑. 문자열 유사도로 안 잡히는 의미 대응을
// 수동 보정한다(스포츠/아웃도어→스포츠/레저 등). 여기 없는 대분류의 자손 잔여는 미분류.
//   좌: user 대분류 id, 우: 네이버 L1 id. (232 TV상품·66 테스트 등 애매한 건 의도적으로 제외 → 미분류)
const ANCESTOR_MAP = {
    219: 3309, 220: 3309, 221: 3309, 3300: 3309, // 여성/남성패션·언더웨어·양말 → 패션의류
    3282: 222, 3305: 222, 3283: 222,             // 지갑·여성신발·신발 → 패션잡화
    3284: 223,                                    // 골프 → 스포츠/레저
    224: 3310,                                    // 뷰티 → 화장품/미용
    229: 3313, 226: 3313,                         // 생활용품·주방용품 → 생활/건강
    227: 3312,                                    // 출산/유아동 → 출산/육아
    230: 3311,                                    // 가전 → 디지털/가전
    231: 3314,                                    // 렌탈/여행 → 여가/생활편의
    // 건강식품 계열 → 식품(225)
    1: 225, 39: 225, 4: 225, 15: 225, 14: 225, 17: 225, 16: 225, 3: 225, 2: 225, 18: 225,
    // TV상품(232) 자식 depth2 — 대분류(232)는 미분류로 두되 성격별 자식은 개별 매핑
    340: 222, 341: 223, 342: 3310, 344: 228, // 잡화/보석→패션잡화, 스포츠/아웃도어→스포츠/레저, 화장품/이미용→화장품/미용, 가구/침구→가구/인테리어
};

function topAncestor(cat, byId) {
    let cur = cat, guard = 0;
    while (cur.parent_id != null && byId.has(cur.parent_id) && guard++ < 10) cur = byId.get(cur.parent_id);
    return cur;
}

async function main() {
    const [cats] = await pool.query(
        "SELECT id, name, parent_id, depth, origin FROM categories WHERE mall_id=? AND type='NORMAL'",
        [GLOBAL_MALL_ID]
    );
    const byId = new Map(cats.map((c) => [c.id, c]));
    const naver = cats.filter((c) => c.origin === 'naver');
    const naverL1 = naver.filter((c) => c.depth === 1);
    const users = cats.filter((c) => c.origin === 'user');

    // 이름 인덱스(정확 유일 판정)
    const naverByName = new Map();
    for (const n of naver) {
        const k = normalizeName(n.name);
        if (!naverByName.has(k)) naverByName.set(k, []);
        naverByName.get(k).push(n.id);
    }

    // user 카테고리별 직속 상품수
    const [pc] = await pool.query(
        "SELECT category_id, COUNT(*) c FROM products WHERE category_id IS NOT NULL GROUP BY category_id");
    const prodByCat = new Map(pc.map((r) => [r.category_id, r.c]));

    function resolveTarget(u) {
        const norm = normalizeName(u.name);
        // 1) NAME 유일
        const nm = naverByName.get(norm);
        if (nm && nm.length === 1) return { to: nm[0], kind: 'NAME', score: 1 };
        // 2) FUZZY 최선
        let best = null;
        for (const n of naver) {
            const s = scoreNames(u.name, n.name);
            if (s >= FUZZY && (!best || s > best.s || (s === best.s && n.depth < byId.get(best.to).depth)))
                best = { to: n.id, s };
        }
        if (best) return { to: best.to, kind: 'FUZZY', score: best.s };
        // 3) ANCESTOR — u 부터 위로 올라가며 매핑된 가장 가까운 조상을 쓴다
        let cur = u, guard = 0;
        while (cur && guard++ < 10) {
            if (ANCESTOR_MAP[cur.id]) return { to: ANCESTOR_MAP[cur.id], kind: 'ANCESTOR', score: null };
            cur = cur.parent_id != null ? byId.get(cur.parent_id) : null;
        }
        // 매핑 조상 없으면 최상위 조상 이름 유사도로 폴백
        const top = topAncestor(u, byId);
        let al1 = null;
        for (const n of naverL1) {
            const s = scoreNames(top.name, n.name);
            if (s >= FUZZY && (!al1 || s > al1.s)) al1 = { to: n.id, s };
        }
        if (al1) return { to: al1.to, kind: 'ANCESTOR', score: al1.s };
        return null; // → 미분류
    }

    // 판정
    const moves = []; // {from, to, kind, score, pcount}
    const dist = { NAME: 0, FUZZY: 0, ANCESTOR: 0, 미분류: 0 };
    const prodDist = { NAME: 0, FUZZY: 0, ANCESTOR: 0, 미분류: 0 };
    let uncategorizedId = null;

    for (const u of users) {
        const pcount = prodByCat.get(u.id) || 0;
        if (pcount === 0) continue; // 상품 없는 user 카테고리는 이동 대상 아님(뒤에서 비활성)
        const t = resolveTarget(u);
        if (t) {
            moves.push({ from: u.id, to: t.to, kind: t.kind, score: t.score, pcount });
            dist[t.kind]++; prodDist[t.kind] += pcount;
        } else {
            moves.push({ from: u.id, to: '미분류', kind: '미분류', score: null, pcount });
            dist['미분류']++; prodDist['미분류'] += pcount;
        }
    }

    // 실행
    const conn = await pool.getConnection();
    let movedProducts = 0, deactivated = 0;
    try {
        await conn.beginTransaction();
        if (COMMIT) uncategorizedId = await getUncategorizedCategoryId({ mallId: GLOBAL_MALL_ID, conn });

        for (const m of moves) {
            const toId = m.to === '미분류' ? uncategorizedId : m.to;
            if (COMMIT) {
                const [res] = await conn.query('UPDATE products SET category_id=? WHERE category_id=?', [toId, m.from]);
                m.moved = res.affectedRows || 0;
                await conn.query(
                    "INSERT INTO category_remap_log (phase, from_category_id, to_category_id, product_count, match_kind, score, note) VALUES ('REMAP', ?, ?, ?, ?, ?, ?)",
                    [m.from, toId, m.moved, m.kind === 'NAME' ? 'NAME' : (m.kind === '미분류' ? 'NONE' : (m.kind === 'ANCESTOR' ? 'MANUAL' : 'FUZZY')),
                     m.score, `전면정리 ${m.kind}${m.kind === 'ANCESTOR' || m.kind === 'FUZZY' ? ' — 자동배치·검토필요' : ''}`]
                );
            } else { m.moved = m.pcount; }
            movedProducts += m.moved;
        }

        // 상품 다 빠진 user 카테고리 soft 비활성 — 리프부터, 상품 남은 것/자식 남은 것 제외
        if (COMMIT) {
            // 재조회: 지금 상품 없는 user 카테고리
            const [empty] = await conn.query(
                `SELECT c.id FROM categories c
                  WHERE c.mall_id=? AND c.type='NORMAL' AND c.origin='user' AND c.is_active=1
                    AND NOT EXISTS(SELECT 1 FROM products p WHERE p.category_id=c.id)
                    AND c.name<>'미분류'`,
                [GLOBAL_MALL_ID]
            );
            const ids = empty.map((r) => r.id);
            if (ids.length) {
                const [res] = await conn.query('UPDATE categories SET is_active=0 WHERE id IN (?)', [ids]);
                deactivated = res.affectedRows || 0;
            }
            await conn.query(
                "INSERT INTO category_remap_log (phase, match_kind, product_count, note) VALUES ('PRUNE','NONE',?,?)",
                [movedProducts, `전면정리: 상품 ${movedProducts} 이동, user 카테고리 ${deactivated} soft 비활성`]
            );
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

    // 리포트
    console.log(`\n${COMMIT ? '[COMMIT]' : '[DRY-RUN]'} 네이버 표준 전면 정리`);
    console.log('  상품 이동 분포 (카테고리수 · 상품수):');
    console.log(`    NAME(정확)      : ${dist.NAME}개 · ${prodDist.NAME}`);
    console.log(`    FUZZY(유사)     : ${dist.FUZZY}개 · ${prodDist.FUZZY}   [자동배치·검토필요]`);
    console.log(`    ANCESTOR(조상)  : ${dist.ANCESTOR}개 · ${prodDist.ANCESTOR}   [최근접 대분류·검토필요]`);
    console.log(`    미분류(잔여)    : ${dist['미분류']}개 · ${prodDist['미분류']}   [고객 숨김]`);
    const naverTotal = prodDist.NAME + prodDist.FUZZY + prodDist.ANCESTOR;
    console.log(`  → 네이버로 매핑: 상품 ${naverTotal} · 미분류 잔여: ${prodDist['미분류']}`);
    console.log(`  → 이동 상품 합계: ${movedProducts}${COMMIT ? `, user 카테고리 soft 비활성: ${deactivated}` : ''}`);
    if (!COMMIT) console.log('  실제 반영: --commit');

    // 미분류 잔여 상세(있으면 육안 점검)
    const residue = moves.filter((m) => m.kind === '미분류');
    if (residue.length) {
        console.log(`\n  [미분류 잔여 카테고리 ${residue.length}개]`);
        for (const m of residue.slice(0, 25)) console.log(`    ${byId.get(m.from).name} (상품 ${m.pcount})`);
        if (residue.length > 25) console.log(`    … 외 ${residue.length - 25}개`);
    }
    await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
