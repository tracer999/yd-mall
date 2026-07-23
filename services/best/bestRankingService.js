const pool = require('../../config/db');
const dealSvc = require('../deal/dealService');
const { sellableStockSql } = require('../catalog/sellableStock');

/*
 * 베스트/랭킹 엔진
 *
 * 설계: docs/사이트개선/best_ranking_design_and_development.md
 *
 * 두 갈래로 나뉜다. 섞지 말 것.
 *
 *   calculate*()  배치가 부른다. 점수를 산출해 best_ranking(스냅샷)에 쓴다. 느리다.
 *   getRanking()  화면이 부른다. 스냅샷을 읽고 그 위에 핀(MD 픽)을 얹는다. 빠르다.
 *
 * 왜 핀을 스냅샷에 굽지 않는가:
 *   MD 가 상품을 밀면 **즉시** 보여야 한다. 스냅샷에 구우면 다음 배치까지 안 보인다.
 *   그래서 핀은 조회 시점에 병합한다(mergePins).
 *
 * 왜 점수를 저장하는가(파생하지 않는가):
 *   화면이 "07/13 13시 기준"을 말하려면 그 시점의 값이 고정돼 있어야 한다.
 *   매 요청 재계산하면 기준 시각이 거짓말이 되고, mall2(9,677건)에서 느리다.
 */

/** 기간 창 — 지금으로부터 거슬러 올라가는 시간(시간 단위) */
const PERIODS = {
    REALTIME: { label: '실시간', hours: 1 },
    DAILY: { label: '일간', hours: 24 },
    WEEKLY: { label: '주간', hours: 24 * 7 },
    MONTHLY: { label: '월간', hours: 24 * 30 },
};
const PERIOD_KEYS = Object.keys(PERIODS);
const DEFAULT_PERIOD = 'DAILY';

/** 매출로 인정하는 주문 상태. PENDING(미결제)·CANCELLED·REFUNDED 는 제외한다 */
const SALES_STATUSES = ['PAID', 'PREPARING', 'SHIPPED', 'DELIVERED'];

/** 전시 가능한 상품 상태 (리졸버의 P_STATUS 와 같은 규칙) */
const P_STATUS = "p.status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')";

function visibilityClause(hasUser) {
    return hasUser ? "p.visibility IN ('PUBLIC','MEMBER_ONLY')" : "p.visibility = 'PUBLIC'";
}

function normalizePeriod(period) {
    const k = String(period || '').toUpperCase();
    return PERIOD_KEYS.includes(k) ? k : DEFAULT_PERIOD;
}

// ---------------------------------------------------------------------------
// 그룹 → 대상 상품 필터
// ---------------------------------------------------------------------------

/**
 * 그룹이 가리키는 상품 집합을 WHERE 절로 만든다.
 * 반환: { sql, params } — sql 은 'AND ...' 로 시작하거나 빈 문자열
 *
 * CATEGORY 는 include_descendants=1 이면 하위 트리를 포함한다.
 * 최대 3뎁스라 재귀 CTE 없이 2단 IN 으로 충분하다(depthGuard 가 4뎁스를 막는다).
 */
async function groupFilter(group) {
    switch (group.group_type) {
        case 'ALL':
            return { sql: '', params: [] };

        case 'BRAND':
            if (!group.ref_id) return null;
            return { sql: ' AND p.brand_category_id = ?', params: [group.ref_id] };

        case 'CATEGORY': {
            if (!group.ref_id) return null;
            if (!group.include_descendants) {
                return { sql: ' AND p.category_id = ?', params: [group.ref_id] };
            }
            const [rows] = await pool.query(
                `SELECT id FROM categories
                  WHERE id = ?
                     OR parent_id = ?
                     OR parent_id IN (SELECT id FROM (SELECT id FROM categories WHERE parent_id = ?) t)`,
                [group.ref_id, group.ref_id, group.ref_id]
            );
            const ids = rows.map(r => r.id);
            if (!ids.length) return null;
            return { sql: ` AND p.category_id IN (${ids.map(() => '?').join(',')})`, params: ids };
        }

        // CUSTOM 은 2차. condition_json 스키마가 확정되기 전에는 산출하지 않는다
        // (빈 조건을 '전체'로 해석하면 운영자가 실수로 만든 그룹이 전체 랭킹이 된다).
        case 'CUSTOM':
        default:
            return null;
    }
}

// ---------------------------------------------------------------------------
// 산출 (배치)
// ---------------------------------------------------------------------------

async function getScoreConfig(mallId) {
    const [[row]] = await pool.query('SELECT * FROM best_score_config WHERE mall_id = ?', [mallId]);
    return row || { mall_id: mallId, weight_sales: 5, weight_like: 3, weight_view: 0, rank_limit: 100 };
}

/**
 * 그룹 × 기간의 순위를 산출한다(저장하지 않고 배열로 반환).
 *
 * 점수 = 판매수량×weight_sales + 좋아요×weight_like + 조회수×weight_view
 *
 * ⚠️ 동점(현재 데이터에서는 거의 전부 0점)은 **누적 조회수**로 가른다.
 *    조회 가중치가 0 이어도 정렬 tie-break 에는 쓴다 — 안 그러면 상품 id 순으로
 *    줄 세운 무의미한 랭킹이 나온다. 점수에는 여전히 0 을 기여한다.
 *
 * ⚠️ 조회수는 누적값(products.view_count)이라 기간 창이 적용되지 않는다.
 *    weight_view 를 0 보다 크게 올리면 일간 랭킹에 누적 조회수가 섞인다(스키마 주석 참고).
 */
async function calculateGroupPeriod(mallId, group, period, config) {
    const filter = await groupFilter(group);
    if (!filter) return [];

    const hours = PERIODS[period].hours;
    const limit = Math.max(1, Number(config.rank_limit) || 100);
    const ws = Number(config.weight_sales) || 0;
    const wl = Number(config.weight_like) || 0;
    const wv = Number(config.weight_view) || 0;

    const [rows] = await pool.query(
        `SELECT p.id AS product_id,
                p.view_count,
                COALESCE(s.qty, 0) AS sales_count,
                COALESCE(l.cnt, 0) AS like_count,
                (COALESCE(s.qty, 0) * ? + COALESCE(l.cnt, 0) * ? + p.view_count * ?) AS score
           FROM products p
           LEFT JOIN (
                SELECT oi.product_id, SUM(oi.quantity) AS qty
                  FROM order_items oi
                  JOIN orders o ON o.id = oi.order_id
                 WHERE o.status IN (${SALES_STATUSES.map(() => '?').join(',')})
                   AND COALESCE(o.paid_at, o.created_at) >= DATE_SUB(NOW(), INTERVAL ? HOUR)
                 GROUP BY oi.product_id
           ) s ON s.product_id = p.id
           LEFT JOIN (
                SELECT product_id, COUNT(*) AS cnt
                  FROM likes
                 WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
                 GROUP BY product_id
           ) l ON l.product_id = p.id
          WHERE p.mall_id = ? AND ${P_STATUS}${filter.sql}
          ORDER BY score DESC, p.view_count DESC, p.id DESC
          LIMIT ?`,
        [ws, wl, wv, ...SALES_STATUSES, hours, hours, mallId, ...filter.params, limit]
    );

    return rows.map((r, i) => ({
        product_id: r.product_id,
        rank_no: i + 1,
        score: Number(r.score) || 0,
        sales_count: Number(r.sales_count) || 0,
        like_count: Number(r.like_count) || 0,
        view_count: Number(r.view_count) || 0,
    }));
}

/**
 * 몰 × 기간 전체를 산출해 스냅샷에 기록한다.
 *
 * 트랜잭션 안에서 (그룹, 기간) 슬롯을 지우고 다시 넣는다. 부분 갱신이 아니라
 * 통째 교체다 — 그래야 그룹에서 빠진 상품의 옛 순위가 남지 않는다.
 * 직전 순위(prev_rank_no)는 지우기 전에 읽어둔다(급상승 표시용).
 */
async function calculateMall(mallId, period) {
    const p = normalizePeriod(period);
    const config = await getScoreConfig(mallId);

    const [ins] = await pool.query(
        "INSERT INTO best_ranking_run (mall_id, period, status) VALUES (?, ?, 'RUNNING')",
        [mallId, p]
    );
    const runId = ins.insertId;

    const conn = await pool.getConnection();
    let groupCount = 0;
    let rowCount = 0;
    try {
        const [groups] = await conn.query(
            'SELECT * FROM best_group WHERE mall_id = ? AND is_active = 1 ORDER BY sort_order, id',
            [mallId]
        );

        for (const group of groups) {
            const ranked = await calculateGroupPeriod(mallId, group, p, config);

            await conn.beginTransaction();
            try {
                // 직전 순위를 먼저 확보한다(지우고 나면 못 읽는다)
                const [prev] = await conn.query(
                    `SELECT product_id, rank_no FROM best_ranking
                      WHERE group_id = ? AND period = ? AND gender = 'ALL' AND age_band = 'ALL'`,
                    [group.id, p]
                );
                const prevMap = new Map(prev.map(r => [r.product_id, r.rank_no]));

                await conn.query(
                    `DELETE FROM best_ranking
                      WHERE group_id = ? AND period = ? AND gender = 'ALL' AND age_band = 'ALL'`,
                    [group.id, p]
                );

                if (ranked.length) {
                    const values = ranked.map(r => [
                        mallId, group.id, p, 'ALL', 'ALL',
                        r.product_id, r.rank_no, prevMap.has(r.product_id) ? prevMap.get(r.product_id) : null,
                        r.score, r.sales_count, r.like_count, r.view_count,
                    ]);
                    await conn.query(
                        `INSERT INTO best_ranking
                           (mall_id, group_id, period, gender, age_band,
                            product_id, rank_no, prev_rank_no,
                            score, sales_count, like_count, view_count, calculated_at)
                         VALUES ${values.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,NOW())').join(',')}`,
                        values.flat()
                    );
                    rowCount += ranked.length;
                }
                await conn.commit();
                groupCount += 1;
            } catch (e) {
                await conn.rollback();
                throw e;
            }
        }

        await pool.query(
            `UPDATE best_ranking_run
                SET status = 'SUCCESS', group_count = ?, row_count = ?, finished_at = NOW()
              WHERE id = ?`,
            [groupCount, rowCount, runId]
        );
        return { runId, groupCount, rowCount };
    } catch (e) {
        await pool.query(
            `UPDATE best_ranking_run
                SET status = 'FAILED', group_count = ?, row_count = ?, message = ?, finished_at = NOW()
              WHERE id = ?`,
            [groupCount, rowCount, String(e.message).slice(0, 500), runId]
        );
        throw e;
    } finally {
        conn.release();
    }
}

/** 몰의 모든 기간을 산출한다 */
async function calculateAllPeriods(mallId) {
    const out = {};
    for (const p of PERIOD_KEYS) {
        out[p] = await calculateMall(mallId, p);
    }
    return out;
}

// ---------------------------------------------------------------------------
// 조회 (화면)
// ---------------------------------------------------------------------------

/** 몰의 노출 탭 목록 */
async function getGroups(mallId) {
    const [rows] = await pool.query(
        `SELECT id, name, group_type, ref_id
           FROM best_group
          WHERE mall_id = ? AND is_active = 1
          ORDER BY sort_order, id`,
        [mallId]
    );
    return rows;
}

const PRODUCT_FIELDS = `
    p.id, p.name, p.slug, p.price, p.original_price, p.discount_rate,
    p.main_image, ${sellableStockSql('p')} AS stock, p.status, p.provider,
    p.product_badge, p.distribution_badge, p.view_count`;

/**
 * 자동 랭킹(스냅샷) 위에 핀(MD 픽)을 얹어 최종 순위를 만든다.
 *
 * 규칙
 *   1. 핀 상품이 자동 랭킹에도 있으면 자동 쪽을 **제거**한다(중복 노출 방지).
 *   2. pin_rank 가 있으면 그 자리에 꽂는다(1 = 1위). 같은 자리를 두 핀이 노리면 sort_order 가 앞서는 쪽.
 *   3. pin_rank 가 없는 핀은 맨 앞에 sort_order 순으로 붙인다.
 *   4. 결과를 1..N 으로 다시 번호 매긴다 — 화면의 순위 번호는 항상 연속이어야 한다.
 *      (스냅샷의 rank_no 는 자동 순위일 뿐, 최종 노출 순위가 아니다)
 *
 * ⚠️ 순위 변동(▲▼)은 **auto_rank_no** 로 계산해야 한다. 병합 후 rank_no 로 재면
 *    핀 하나가 끼어드는 순간 아래 상품이 전부 한 칸씩 밀려 **거짓 '하락'** 으로 표시된다.
 *    실제로는 자동 순위가 그대로인데도. 그래서 자동 순위를 따로 보존한다.
 */
function mergePins(autoRows, pinRows) {
    const pinnedIds = new Set(pinRows.map(r => r.id));
    const auto = autoRows
        .filter(r => !pinnedIds.has(r.id))
        .map(r => Object.assign({}, r, { auto_rank_no: r.rank_no }));

    const fixed = pinRows.filter(r => r.pin_rank > 0)
        .sort((a, b) => a.pin_rank - b.pin_rank || a.pin_sort - b.pin_sort);
    const floating = pinRows.filter(r => !(r.pin_rank > 0))
        .sort((a, b) => a.pin_sort - b.pin_sort);

    // 부동 핀 → 자동 랭킹 앞에
    const merged = [...floating, ...auto];

    // 고정 핀 → 지정한 자리에 삽입 (앞에서부터 넣어야 뒤 인덱스가 안 밀린다)
    for (const p of fixed) {
        const idx = Math.min(Math.max(p.pin_rank - 1, 0), merged.length);
        merged.splice(idx, 0, p);
    }

    return merged.map((r, i) => Object.assign({}, r, { rank_no: i + 1 }));
}

/**
 * 화면용 랭킹을 반환한다.
 *
 * @param {object} opts
 *   mallId, groupId, period, limit, hasUser
 *   gender·ageBand 는 받아두되 현재 배치가 ('ALL','ALL') 만 채운다.
 *   (users 에 성별이 없다 — 세그먼트는 구조만 선행)
 *
 * 반환: { products, calculatedAt, isEmpty }
 *   calculatedAt 이 null 이면 아직 배치가 한 번도 안 돈 것이다.
 */
async function getRanking({ mallId, groupId, period, limit = 100, hasUser = false, gender = 'ALL', ageBand = 'ALL' }) {
    const p = normalizePeriod(period);
    const vis = visibilityClause(hasUser);
    const cap = Math.max(1, Math.min(Number(limit) || 100, 200));

    const [autoRows] = await pool.query(
        `SELECT ${PRODUCT_FIELDS},
                b.rank_no, b.prev_rank_no, b.score, b.sales_count, b.like_count, b.calculated_at,
                0 AS is_pinned, NULL AS pin_rank, 0 AS pin_sort
           FROM best_ranking b
           JOIN products p ON p.id = b.product_id
          WHERE b.group_id = ? AND b.period = ? AND b.gender = ? AND b.age_band = ?
            AND ${P_STATUS} AND ${vis}
          ORDER BY b.rank_no
          LIMIT ?`,
        [groupId, p, gender, ageBand, cap]
    );

    // 핀은 기간과 무관하게 그룹 단위로 적용한다 — MD 픽은 "이 탭에서 밀 상품"이지
    // "이 기간에만 밀 상품"이 아니다. 기간별로 나누고 싶으면 best_pin 에 period 를 추가한다.
    const [pinRows] = await pool.query(
        `SELECT ${PRODUCT_FIELDS},
                NULL AS rank_no, NULL AS prev_rank_no, NULL AS score,
                NULL AS sales_count, NULL AS like_count, NULL AS calculated_at,
                1 AS is_pinned, bp.pin_rank AS pin_rank, bp.sort_order AS pin_sort
           FROM best_pin bp
           JOIN products p ON p.id = bp.product_id
          WHERE bp.group_id = ? AND bp.is_active = 1
            AND (bp.start_at IS NULL OR bp.start_at <= NOW())
            AND (bp.end_at   IS NULL OR bp.end_at   >= NOW())
            AND ${P_STATUS} AND ${vis}
          ORDER BY bp.sort_order, bp.id`,
        [groupId]
    );

    const calculatedAt = autoRows.length ? autoRows[0].calculated_at : null;
    const products = mergePins(autoRows, pinRows).slice(0, cap);
    // 랭킹은 스냅샷(정가)을 읽는다 — 표시 직전에 활성 특가로 덮는다.
    await dealSvc.applyDeals(products);

    return { products, calculatedAt, isEmpty: products.length === 0 };
}

/** 마지막 집계 이력 (관리자 화면용) */
async function getLastRuns(mallId) {
    const [rows] = await pool.query(
        `SELECT r.*
           FROM best_ranking_run r
           JOIN (
                SELECT period, MAX(id) AS id FROM best_ranking_run
                 WHERE mall_id = ? GROUP BY period
           ) t ON t.id = r.id
          ORDER BY FIELD(r.period, 'REALTIME','DAILY','WEEKLY','MONTHLY')`,
        [mallId]
    );
    return rows;
}

module.exports = {
    PERIODS,
    PERIOD_KEYS,
    DEFAULT_PERIOD,
    normalizePeriod,
    getGroups,
    getRanking,
    getScoreConfig,
    getLastRuns,
    calculateMall,
    calculateAllPeriods,
    calculateGroupPeriod,
};
