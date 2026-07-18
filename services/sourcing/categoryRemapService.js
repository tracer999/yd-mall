/*
 * 카테고리 재매핑 수동큐·롤백 서비스 (Phase 4 관리자 화면 백엔드)
 * 설계: docs/사이트개선/네이버_기반_글로벌_카테고리_재구성_설계.md §5 Phase 2·9
 *
 * category_remap_log(phase='REMAP') 를 근거로:
 *   - 수동큐: to_category_id IS NULL AND reverted=0 (MANUAL 복수후보 / NONE 무매칭)
 *   - 롤백대상: match_kind='FUZZY' AND reverted=0 (오매칭 가능 자동편입)
 *
 * 롤백은 Phase 0 스냅샷(products_catmap_bak_20260719)을 진실의 원천으로 삼는다:
 *   "원래 from 이었고 지금 to 인 상품"만 from 으로 정확 복원(다른 소스 상품 오염 없음).
 */
const pool = require('../../config/db');

const SNAPSHOT = 'products_catmap_bak_20260719';

/** 관리자 화면 현황 — 롤백 대상(FUZZY) + 수동큐(MANUAL/NONE) + 요약. */
async function getStatus() {
    const [fuzzy] = await pool.query(
        `SELECT l.id, l.from_category_id, l.to_category_id, l.product_count, l.score, l.note,
                fc.name AS from_name, tc.name AS to_name
           FROM category_remap_log l
           LEFT JOIN categories fc ON fc.id = l.from_category_id
           LEFT JOIN categories tc ON tc.id = l.to_category_id
          WHERE l.phase='REMAP' AND l.match_kind='FUZZY' AND l.reverted=0
          ORDER BY l.product_count DESC, l.id`
    );
    const [queue] = await pool.query(
        `SELECT l.id, l.from_category_id, l.product_count, l.match_kind, l.note,
                fc.name AS from_name
           FROM category_remap_log l
           LEFT JOIN categories fc ON fc.id = l.from_category_id
          WHERE l.phase='REMAP' AND l.to_category_id IS NULL AND l.reverted=0
                AND l.match_kind IN ('MANUAL','NONE')
          ORDER BY l.product_count DESC, l.id`
    );
    const [[summary]] = await pool.query(
        `SELECT
           SUM(match_kind='FUZZY' AND reverted=0) AS fuzzy_open,
           SUM(match_kind='FUZZY' AND reverted=1) AS fuzzy_reverted,
           SUM(to_category_id IS NULL AND reverted=0 AND match_kind IN ('MANUAL','NONE')) AS queue_open
         FROM category_remap_log WHERE phase='REMAP'`
    );
    return { fuzzy, queue, summary: summary || {} };
}

/** 특정 REMAP 로그 1건을 스냅샷 기준으로 되돌린다(from→to 로 옮겼던 상품을 from 으로 복원). */
async function rollbackOne(logId) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[log]] = await conn.query(
            "SELECT id, from_category_id, to_category_id, reverted FROM category_remap_log WHERE id=? AND phase='REMAP' FOR UPDATE",
            [logId]
        );
        if (!log || log.reverted || log.from_category_id == null || log.to_category_id == null) {
            await conn.rollback();
            return { ok: false, reason: '롤백 불가(이미 처리됐거나 대상 없음)' };
        }
        const [res] = await conn.query(
            `UPDATE products p
                JOIN ${SNAPSHOT} b ON b.id = p.id
                SET p.category_id = ?
              WHERE b.category_id = ? AND p.category_id = ?`,
            [log.from_category_id, log.from_category_id, log.to_category_id]
        );
        await conn.query('UPDATE category_remap_log SET reverted=1, note=CONCAT(COALESCE(note,\'\'),\' [롤백]\') WHERE id=?', [logId]);
        await conn.query(
            "INSERT INTO category_remap_log (phase, from_category_id, to_category_id, product_count, match_kind, note) VALUES ('REMAP', ?, ?, ?, 'MANUAL', ?)",
            [log.to_category_id, log.from_category_id, res.affectedRows || 0, `롤백: cat#${log.to_category_id}→cat#${log.from_category_id}`]
        );
        await conn.commit();
        return { ok: true, moved: res.affectedRows || 0 };
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}

/** 열린 FUZZY 자동편입 전체를 되돌린다. */
async function rollbackAllFuzzy() {
    const [rows] = await pool.query(
        "SELECT id FROM category_remap_log WHERE phase='REMAP' AND match_kind='FUZZY' AND reverted=0"
    );
    let total = 0, moved = 0;
    for (const r of rows) {
        const res = await rollbackOne(r.id);
        if (res.ok) { total++; moved += res.moved; }
    }
    return { reverted: total, moved };
}

/** 수동큐 1건에 관리자가 고른 타겟 카테고리를 지정 — from 상품을 target 으로 이동. */
async function assign(logId, targetCategoryId) {
    const target = Number(targetCategoryId);
    if (!Number.isInteger(target) || target <= 0) return { ok: false, reason: '타겟 카테고리 id 오류' };
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[log]] = await conn.query(
            "SELECT id, from_category_id, reverted, to_category_id FROM category_remap_log WHERE id=? AND phase='REMAP' FOR UPDATE",
            [logId]
        );
        if (!log || log.reverted || log.to_category_id != null || log.from_category_id == null) {
            await conn.rollback();
            return { ok: false, reason: '지정 불가(이미 처리됨)' };
        }
        const [[t]] = await conn.query(
            "SELECT id FROM categories WHERE id=? AND mall_id=0 AND type='NORMAL'", [target]);
        if (!t) { await conn.rollback(); return { ok: false, reason: '타겟은 글로벌 NORMAL 카테고리여야 함' }; }

        const [res] = await conn.query(
            'UPDATE products SET category_id=? WHERE category_id=?', [target, log.from_category_id]);
        await conn.query(
            "UPDATE category_remap_log SET to_category_id=?, product_count=?, match_kind='MANUAL', note=CONCAT(COALESCE(note,''),' [수동지정]') WHERE id=?",
            [target, res.affectedRows || 0, logId]
        );
        await conn.commit();
        return { ok: true, moved: res.affectedRows || 0 };
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}

module.exports = { getStatus, rollbackOne, rollbackAllFuzzy, assign, SNAPSHOT };
