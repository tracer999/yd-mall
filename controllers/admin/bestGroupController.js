const pool = require('../../config/db');
const bestRankingService = require('../../services/best/bestRankingService');

/*
 * 베스트/랭킹 관리
 *
 * 화면은 셋이다.
 *   1. 그룹(탭) 목록  — 고객 /best 의 탭이 된다. 전체·카테고리·브랜드
 *   2. 가중치 설정    — 판매 5 / 좋아요 3 / 조회 0 (몰별)
 *   3. 그룹 상세      — MD 픽(핀) 관리 + 자동 랭킹 미리보기
 *
 * ⚠️ 자동 랭킹은 여기서 편집하지 않는다. 배치가 만든 결과다.
 *    운영자가 순위를 바꾸고 싶으면 **핀**을 쓴다. 스냅샷을 직접 고치면 다음 배치에 날아간다.
 *
 * 몰 스코프는 req.adminMallId (스토어프론트의 req.mallId 와 **다른 세션 키**. 혼용 금지).
 */

const GROUP_TYPES = [
    { value: 'ALL', label: '전체 (몰 전체 상품)' },
    { value: 'CATEGORY', label: '카테고리' },
    { value: 'BRAND', label: '브랜드' },
];

/** GET /admin/best-groups — 그룹 목록 + 가중치 + 집계 이력 */
async function getList(req, res, next) {
    try {
        const mallId = req.adminMallId || 1;

        const [groups] = await pool.query(
            `SELECT g.*,
                    c.name AS ref_name,
                    (SELECT COUNT(*) FROM best_pin bp
                      WHERE bp.group_id = g.id AND bp.is_active = 1) AS pin_count,
                    (SELECT COUNT(*) FROM best_ranking br
                      WHERE br.group_id = g.id AND br.period = 'DAILY') AS ranked_count
               FROM best_group g
               LEFT JOIN categories c ON c.id = g.ref_id
              WHERE g.mall_id = ?
              ORDER BY g.sort_order, g.id`,
            [mallId]
        );

        const config = await bestRankingService.getScoreConfig(mallId);
        const runs = await bestRankingService.getLastRuns(mallId);

        // 집계 스케줄 — 서버 crontab 은 5분마다 best_ranking_cron.sh 를 부를 뿐이고,
        // 무엇을 언제 돌릴지는 이 표가 정한다. 주기를 바꾸러 서버에 들어갈 필요가 없다.
        const [schedules] = await pool.query(
            `SELECT period, enabled, interval_minutes FROM best_ranking_schedule
              ORDER BY FIELD(period, 'REALTIME','DAILY','WEEKLY','MONTHLY')`
        );

        // 탭 추가 폼의 선택지. 이미 그룹이 있는 카테고리·브랜드는 제외한다(중복 탭 방지).
        const [categories] = await pool.query(
            `SELECT c.id, c.name, c.depth
               FROM categories c
              WHERE c.mall_id = ? AND c.type = 'NORMAL'
                AND NOT EXISTS (SELECT 1 FROM best_group g WHERE g.ref_id = c.id AND g.group_type = 'CATEGORY')
              ORDER BY c.depth, c.display_order, c.name`,
            [mallId]
        );
        const [brands] = await pool.query(
            `SELECT c.id, c.name
               FROM categories c
              WHERE c.mall_id = ? AND c.type = 'BRAND'
                AND NOT EXISTS (SELECT 1 FROM best_group g WHERE g.ref_id = c.id AND g.group_type = 'BRAND')
              ORDER BY c.name`,
            [mallId]
        );

        res.render('admin/best_groups/list', {
            layout: 'layouts/admin_layout',
            title: '베스트/랭킹 관리',
            subtitle: '고객 베스트/랭킹 화면의 탭·점수 기준·집계 스케줄을 관리합니다.',
            groups,
            config,
            runs,
            schedules,
            categories,
            brands,
            periods: bestRankingService.PERIODS,
            groupTypes: GROUP_TYPES,
            success: req.query.success || null,
            error: req.query.error || null,
        });
    } catch (e) {
        next(e);
    }
}

/** POST /admin/best-groups — 그룹 추가 */
async function postCreate(req, res, next) {
    try {
        const mallId = req.adminMallId || 1;
        const { name, group_type, ref_id, include_descendants, sort_order } = req.body;

        const type = GROUP_TYPES.some(t => t.value === group_type) ? group_type : 'CATEGORY';
        const ref = type === 'ALL' ? null : Number(ref_id) || null;

        if (type !== 'ALL' && !ref) {
            return res.redirect('/admin/best-groups?error=' + encodeURIComponent('카테고리 또는 브랜드를 선택하세요.'));
        }
        if (!String(name || '').trim()) {
            return res.redirect('/admin/best-groups?error=' + encodeURIComponent('탭 이름을 입력하세요.'));
        }

        await pool.query(
            `INSERT INTO best_group (mall_id, name, group_type, ref_id, include_descendants, sort_order, is_active)
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [mallId, String(name).trim(), type, ref,
                include_descendants ? 1 : 0, Number(sort_order) || 0]
        );

        res.redirect('/admin/best-groups?success=' + encodeURIComponent('탭을 추가했습니다. 집계를 실행해야 랭킹이 채워집니다.'));
    } catch (e) {
        next(e);
    }
}

/** POST /admin/best-groups/:id — 그룹 수정 */
async function postUpdate(req, res, next) {
    try {
        const mallId = req.adminMallId || 1;
        const { name, sort_order, is_active, include_descendants } = req.body;

        await pool.query(
            `UPDATE best_group
                SET name = ?, sort_order = ?, is_active = ?, include_descendants = ?
              WHERE id = ? AND mall_id = ?`,
            [String(name || '').trim(), Number(sort_order) || 0,
                is_active ? 1 : 0, include_descendants ? 1 : 0,
                req.params.id, mallId]
        );

        res.redirect('/admin/best-groups?success=' + encodeURIComponent('저장했습니다.'));
    } catch (e) {
        next(e);
    }
}

/**
 * POST /admin/best-groups/:id/delete
 * best_ranking · best_pin 은 FK CASCADE 로 함께 지워진다.
 */
async function postDelete(req, res, next) {
    try {
        const mallId = req.adminMallId || 1;
        await pool.query('DELETE FROM best_group WHERE id = ? AND mall_id = ?', [req.params.id, mallId]);
        res.redirect('/admin/best-groups?success=' + encodeURIComponent('탭을 삭제했습니다.'));
    } catch (e) {
        next(e);
    }
}

/** POST /admin/best-groups/config — 가중치 저장 */
async function postConfig(req, res, next) {
    try {
        const mallId = req.adminMallId || 1;
        const { weight_sales, weight_like, weight_view, rank_limit } = req.body;

        await pool.query(
            `INSERT INTO best_score_config (mall_id, weight_sales, weight_like, weight_view, rank_limit)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                weight_sales = VALUES(weight_sales),
                weight_like  = VALUES(weight_like),
                weight_view  = VALUES(weight_view),
                rank_limit   = VALUES(rank_limit)`,
            [mallId,
                Math.max(0, Number(weight_sales) || 0),
                Math.max(0, Number(weight_like) || 0),
                Math.max(0, Number(weight_view) || 0),
                Math.min(Math.max(1, Number(rank_limit) || 100), 200)]
        );

        res.redirect('/admin/best-groups?success=' + encodeURIComponent('가중치를 저장했습니다. 집계를 다시 실행해야 순위에 반영됩니다.'));
    } catch (e) {
        next(e);
    }
}

/**
 * POST /admin/best-groups/schedule — 집계 스케줄 저장
 *
 * 서버 crontab 은 건드리지 않는다. 5분마다 도는 best_ranking_cron.sh 가 이 표를 읽어
 * "주기가 된 기간"만 실행한다(--scheduled). 크론 라인은 한 줄이고 영원히 안 바뀐다.
 *
 * ⚠️ 스케줄은 **몰 공통**이다(best_ranking_schedule 에 mall_id 가 없다).
 *    배치가 전 몰을 함께 돌기 때문이다. 몰별로 주기를 다르게 하려면 컬럼을 추가해야 한다.
 */
async function postSchedule(req, res, next) {
    try {
        const periods = bestRankingService.PERIOD_KEYS;
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            for (const p of periods) {
                const enabled = req.body[`enabled_${p}`] ? 1 : 0;
                // 5분 미만은 무의미하다 — 크론이 5분마다 깨어난다. 1일 상한.
                const mins = Math.min(Math.max(Number(req.body[`interval_${p}`]) || 60, 5), 1440);
                await conn.query(
                    `INSERT INTO best_ranking_schedule (period, enabled, interval_minutes)
                     VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE enabled = VALUES(enabled),
                                             interval_minutes = VALUES(interval_minutes)`,
                    [p, enabled, mins]
                );
            }
            await conn.commit();
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }

        res.redirect('/admin/best-groups?success=' + encodeURIComponent('집계 스케줄을 저장했습니다.'));
    } catch (e) {
        next(e);
    }
}

/**
 * POST /admin/best-groups/calculate — 지금 집계
 *
 * 몰 전체 × 전 기간을 다시 산출한다. mall2(9,677건 × 15그룹 × 4기간)에서 4초쯤 걸린다.
 * 요청을 붙잡고 기다린다 — 운영자가 결과를 바로 봐야 하고, 백그라운드로 돌리면
 * "끝났는지" 물어볼 화면이 또 필요하다(best_ranking_run 이 그 역할을 하지만 UI 는 2차).
 */
async function postCalculate(req, res, next) {
    try {
        const mallId = req.adminMallId || 1;
        const result = await bestRankingService.calculateAllPeriods(mallId);
        const rows = Object.values(result).reduce((s, r) => s + r.rowCount, 0);
        res.redirect('/admin/best-groups?success=' +
            encodeURIComponent(`집계 완료 — 순위 ${rows.toLocaleString()}건을 갱신했습니다.`));
    } catch (e) {
        res.redirect('/admin/best-groups?error=' + encodeURIComponent('집계 실패: ' + e.message));
    }
}

// ---------------------------------------------------------------------------
// 그룹 상세 — MD 픽(핀) 관리
// ---------------------------------------------------------------------------

/** GET /admin/best-groups/:id */
async function getDetail(req, res, next) {
    try {
        const mallId = req.adminMallId || 1;
        const [[group]] = await pool.query(
            `SELECT g.*, c.name AS ref_name
               FROM best_group g
               LEFT JOIN categories c ON c.id = g.ref_id
              WHERE g.id = ? AND g.mall_id = ?`,
            [req.params.id, mallId]
        );
        if (!group) return res.status(404).send('Not Found');

        const [pins] = await pool.query(
            `SELECT bp.*, p.name AS product_name, p.main_image, p.price, p.status AS product_status
               FROM best_pin bp
               JOIN products p ON p.id = bp.product_id
              WHERE bp.group_id = ?
              ORDER BY bp.sort_order, bp.id`,
            [group.id]
        );

        const period = bestRankingService.normalizePeriod(req.query.period);

        // 관리자에게는 실제 고객 화면과 같은 결과(핀 병합 후)를 보여준다.
        // hasUser: true — 관리자는 MEMBER_ONLY 상품까지 봐야 한다.
        const { products, calculatedAt } = await bestRankingService.getRanking({
            mallId, groupId: group.id, period, hasUser: true, limit: 100,
        });

        res.render('admin/best_groups/detail', {
            layout: 'layouts/admin_layout',
            title: `베스트/랭킹 — ${group.name}`,
            subtitle: 'MD 픽(수동 고정)을 관리하고 고객 화면과 같은 순위를 미리 봅니다.',
            group,
            pins,
            preview: products,
            calculatedAt,
            period,
            periods: bestRankingService.PERIODS,
            success: req.query.success || null,
            error: req.query.error || null,
        });
    } catch (e) {
        next(e);
    }
}

/** GET /admin/best-groups/:id/product-search?q= — 핀 추가용 상품 검색 */
async function getProductSearch(req, res, next) {
    try {
        const mallId = req.adminMallId || 1;
        const q = String(req.query.q || '').trim();
        if (!q) return res.json({ products: [] });

        const [rows] = await pool.query(
            `SELECT id, name, main_image, price, status
               FROM products
              WHERE mall_id = ? AND (name LIKE ? OR product_code LIKE ?)
              ORDER BY id DESC
              LIMIT 20`,
            [mallId, `%${q}%`, `%${q}%`]
        );
        res.json({ products: rows });
    } catch (e) {
        next(e);
    }
}

/** POST /admin/best-groups/:id/pins — 핀 추가 */
async function postAddPin(req, res, next) {
    try {
        const mallId = req.adminMallId || 1;
        const groupId = req.params.id;
        const { product_id, pin_rank, start_at, end_at, memo } = req.body;

        const pid = Number(product_id);
        if (!pid) return res.redirect(`/admin/best-groups/${groupId}?error=` + encodeURIComponent('상품을 선택하세요.'));

        // 다른 몰의 상품을 이 몰의 탭에 꽂지 못하게 막는다.
        const [[p]] = await pool.query('SELECT id FROM products WHERE id = ? AND mall_id = ?', [pid, mallId]);
        if (!p) return res.redirect(`/admin/best-groups/${groupId}?error=` + encodeURIComponent('이 몰의 상품이 아닙니다.'));

        // 다른 몰의 그룹에 핀을 주입하지 못하게 막는다(group_id 는 URL 파라미터).
        const [[g]] = await pool.query('SELECT id FROM best_group WHERE id = ? AND mall_id = ?', [groupId, mallId]);
        if (!g) return res.redirect(`/admin/best-groups/${groupId}?error=` + encodeURIComponent('이 몰의 그룹이 아닙니다.'));

        const [[mx]] = await pool.query(
            'SELECT COALESCE(MAX(sort_order), 0) AS m FROM best_pin WHERE group_id = ?', [groupId]
        );

        await pool.query(
            `INSERT INTO best_pin (mall_id, group_id, product_id, pin_rank, sort_order, start_at, end_at, memo, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE
                pin_rank = VALUES(pin_rank), start_at = VALUES(start_at),
                end_at = VALUES(end_at), memo = VALUES(memo), is_active = 1`,
            [mallId, groupId, pid,
                Number(pin_rank) > 0 ? Number(pin_rank) : null,
                mx.m + 1,
                start_at || null, end_at || null,
                String(memo || '').slice(0, 200) || null]
        );

        res.redirect(`/admin/best-groups/${groupId}?success=` + encodeURIComponent('상품을 고정했습니다. 고객 화면에 즉시 반영됩니다.'));
    } catch (e) {
        next(e);
    }
}

/** POST /admin/best-groups/:id/pins/:pinId — 핀 수정 */
async function postUpdatePin(req, res, next) {
    try {
        const mallId = req.adminMallId || 1;
        const { pin_rank, sort_order, is_active, start_at, end_at, memo } = req.body;

        await pool.query(
            `UPDATE best_pin
                SET pin_rank = ?, sort_order = ?, is_active = ?, start_at = ?, end_at = ?, memo = ?
              WHERE id = ? AND group_id = ? AND mall_id = ?`,
            [Number(pin_rank) > 0 ? Number(pin_rank) : null,
                Number(sort_order) || 0,
                is_active ? 1 : 0,
                start_at || null, end_at || null,
                String(memo || '').slice(0, 200) || null,
                req.params.pinId, req.params.id, mallId]
        );

        res.redirect(`/admin/best-groups/${req.params.id}?success=` + encodeURIComponent('저장했습니다.'));
    } catch (e) {
        next(e);
    }
}

/** POST /admin/best-groups/:id/pins/:pinId/delete — 핀 해제 */
async function postDeletePin(req, res, next) {
    try {
        const mallId = req.adminMallId || 1;
        await pool.query(
            'DELETE FROM best_pin WHERE id = ? AND group_id = ? AND mall_id = ?',
            [req.params.pinId, req.params.id, mallId]
        );
        res.redirect(`/admin/best-groups/${req.params.id}?success=` + encodeURIComponent('고정을 해제했습니다.'));
    } catch (e) {
        next(e);
    }
}

module.exports = {
    GROUP_TYPES,
    getList,
    postCreate,
    postUpdate,
    postDelete,
    postConfig,
    postSchedule,
    postCalculate,
    getDetail,
    getProductSearch,
    postAddPin,
    postUpdatePin,
    postDeletePin,
};
