/**
 * 종합관(mall 2) 판매 시작일 세팅 (docs/사이트개선/new_arrivals_dev_plan.md §4)
 *
 * mall 2 의 9,677건은 created_at 이 임포트 당일 하루에 몰려 있어 판매 시작일의 근거가 없다.
 * 그래서 마이그레이션이 NULL 로 남겼고, 여기서 운영 기준으로 채운다.
 *
 * 정책 (사용자 결정)
 *   - 신상품으로 노출할 상품은 50건. 기존 NEW 뱃지 200건 중 50건만 남기고 150건은 뱃지를 뗀다.
 *     → 뱃지(강제 노출)와 자동 판정(판매시작일 100일)이 같은 50건을 가리켜, 신상품이 정확히 50건이 된다.
 *   - 그 50건: 최근 0~89일 안에 분산 → 자동 판정에 걸린다.
 *   - 나머지 9,627건: 120~729일 전으로 분산 → 신상품엔 안 들어가되 판매시작일 정렬·통계는 정상 동작하고,
 *     나중에 노출 기간 설정을 늘려도 자연스럽게 편입된다.
 *
 * 날짜는 id 기반 결정론적 분산이라 여러 번 돌려도 같은 결과다(멱등).
 *
 * 실행: set -a; . /etc/environment; set +a; node scripts/seed_mall2_sale_start_date.js
 *   --dry  : 변경 없이 결과만 미리 본다
 */
require('../config/env');
const pool = require('../config/db');

const MALL_ID = 2;
const NEW_COUNT = 50;   // 신상품으로 남길 건수
const NEW_SPREAD = 90;  // 신상품 날짜 분산 폭(일). 노출 기간(100일)보다 작아야 한다.
const OLD_MIN = 120;    // 나머지 상품의 최소 경과일 — 100일 경계에서 넉넉히 떨어뜨린다
const OLD_SPREAD = 610; // 120~729일 전

const DRY = process.argv.includes('--dry');

/** NEW 뱃지만 제거한다(BEST 등 다른 뱃지는 보존). product_badge 는 SET 타입. */
const STRIP_NEW = `
    NULLIF(TRIM(BOTH ',' FROM REPLACE(CONCAT(',', product_badge, ','), ',NEW,', ',')), '')
`;

async function pickKeepIds() {
    // 기존 NEW 뱃지 상품 중 최근 등록분(id 큰 순) 50건을 신상품으로 유지한다.
    const [rows] = await pool.query(
        `SELECT id FROM products
          WHERE mall_id = ? AND FIND_IN_SET('NEW', product_badge)
            AND status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')
          ORDER BY id DESC
          LIMIT ?`,
        [MALL_ID, NEW_COUNT]
    );
    return rows.map(r => r.id);
}

async function run() {
    const keepIds = await pickKeepIds();
    if (keepIds.length < NEW_COUNT) {
        console.warn(`[warn] NEW 뱃지 상품이 ${keepIds.length}건뿐이라 그만큼만 신상품으로 둔다`);
    }
    console.log(`[info] 신상품으로 유지할 상품 ${keepIds.length}건 (id ${keepIds[keepIds.length - 1]} ~ ${keepIds[0]})`);

    if (DRY) {
        console.log('[dry] 변경 없음');
        return;
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 1) 유지 대상 외의 NEW 뱃지 제거
        const [r1] = await conn.query(
            `UPDATE products SET product_badge = ${STRIP_NEW}
              WHERE mall_id = ? AND FIND_IN_SET('NEW', product_badge) AND id NOT IN (?)`,
            [MALL_ID, keepIds]
        );
        console.log(`[ok] NEW 뱃지 제거 ${r1.affectedRows}건`);

        // 2) 유지 50건 → 최근 0~89일로 분산 (자동 판정에 걸린다)
        const [r2] = await conn.query(
            `UPDATE products
                SET sale_start_date = DATE_SUB(CURDATE(), INTERVAL (id % ?) DAY)
              WHERE mall_id = ? AND id IN (?)`,
            [NEW_SPREAD, MALL_ID, keepIds]
        );
        console.log(`[ok] 신상품 판매시작일 세팅 ${r2.affectedRows}건 (최근 0~${NEW_SPREAD - 1}일)`);

        // 3) 나머지 → 120~729일 전으로 분산 (신상품 아님)
        const [r3] = await conn.query(
            `UPDATE products
                SET sale_start_date = DATE_SUB(CURDATE(), INTERVAL (? + (id % ?)) DAY)
              WHERE mall_id = ? AND id NOT IN (?)`,
            [OLD_MIN, OLD_SPREAD, MALL_ID, keepIds]
        );
        console.log(`[ok] 나머지 판매시작일 세팅 ${r3.affectedRows}건 (${OLD_MIN}~${OLD_MIN + OLD_SPREAD - 1}일 전)`);

        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function verify() {
    const [[row]] = await pool.query(
        `SELECT
            COUNT(*) AS total,
            SUM(sale_start_date IS NULL) AS 미지정,
            SUM(FIND_IN_SET('NEW', product_badge) > 0) AS new_badge,
            SUM(sale_start_date <= CURDATE()
                AND sale_start_date >= DATE_SUB(CURDATE(), INTERVAL 100 DAY)) AS 기간내,
            SUM((sale_start_date <= CURDATE()
                 AND sale_start_date >= DATE_SUB(CURDATE(), INTERVAL 100 DAY))
                OR FIND_IN_SET('NEW', product_badge)) AS 신상품_최종
         FROM products
         WHERE mall_id = ? AND status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK') AND visibility = 'PUBLIC'`,
        [MALL_ID]
    );
    console.log('\n[검증] mall 2 (노출 가능 상품 기준)');
    console.table([row]);
}

(async () => {
    try {
        await run();
        await verify();
        console.log('\n완료.');
    } catch (err) {
        console.error('[fail]', err.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
