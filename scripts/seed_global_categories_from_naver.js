/*
 * 네이버 기반 글로벌 카테고리 재구성 — Phase 1: 네이버 L1~L3 시드 (CLI 래퍼)
 * 설계: docs/사이트개선/네이버_기반_글로벌_카테고리_재구성_설계.md §5 Phase 1
 *
 * 실제 로직은 services/sourcing/categoryReflect.syncTreeFromNaver 에 있다
 * (Phase 4 지속 동기화와 공유). 이 스크립트는 초기 벌크 시드용 CLI 래퍼.
 * 멱등(이름 dedup) — 재실행하면 신규만 생성.
 *
 * 실행:
 *   set -a; . /etc/environment; set +a
 *   node scripts/seed_global_categories_from_naver.js            # dry-run(기본)
 *   node scripts/seed_global_categories_from_naver.js --commit   # 실제 반영
 */
const pool = require('../config/db');
const categoryReflect = require('../services/sourcing/categoryReflect');

const COMMIT = process.argv.includes('--commit');

async function main() {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const r = await categoryReflect.syncTreeFromNaver(conn, { commit: COMMIT });
        if (COMMIT) {
            await conn.commit();
        } else {
            await conn.rollback();
        }
        console.log(`네이버 L1~L3 대상: ${r.total}건`);
        console.log(`${COMMIT ? '[COMMIT]' : '[DRY-RUN]'} 생성 ${r.created} · 승격(user→naver) ${r.promoted} · 재사용 ${r.reused}`);
        if (!COMMIT) console.log('  → 실제 반영하려면 --commit');
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
    await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
