const pool = require('../../config/db');

/*
 * 특가 카테고리 관리 (쇼핑특가 §7)
 * 설계: docs/사이트개선/shopping_deal_design.md §3.1
 *
 * ── schedule_type 은 활성 판정에 관여하지 않는다 ──
 *   dealService 의 활성 판정은 `deal` 행의 실제 컬럼(daily_start_time/weekdays/…)만 본다.
 *   여기 schedule_type 은 **관리자 폼 UX 용 힌트**다 — TIME 이면 특가 등록 폼이 시간창·요일
 *   입력을 노출하고 필수화한다. 판정 근거를 데이터 한 곳으로만 두어 단순하게 유지한다.
 *
 * ── 삭제보다 비활성 ──
 *   `deal.deal_category_id` 는 ON DELETE RESTRICT 다. 참조 중이면 DB 가 막지만,
 *   에러 코드로 알아채기 전에 미리 세어 사람이 읽을 수 있는 메시지로 막는다.
 *   운영 중 정리는 삭제 대신 `is_active = 0` 토글을 쓴다(쿠폰의 "삭제 대신 종료" 관행).
 */

const BASE = '/admin/deal-categories';

const SCHEDULE_TYPES = [
    { value: 'PERIOD', label: '기간 특가', hint: '시작~종료 기간 내내 상시 적용 (오늘의 특가·시즌특가)' },
    { value: 'TIME', label: '타임 특가', hint: '기간 중 매일 특정 시간대에만 적용 (시간창·요일 필수)' },
];

/** dealService.toDealInfo 의 기본값이 'rose' 다. 여기 목록과 뷰의 뱃지 색이 같은 키를 쓴다. */
const BADGE_COLORS = ['rose', 'amber', 'emerald', 'sky', 'indigo', 'violet', 'slate'];

const redirectWith = (res, path, key, msg) =>
    res.redirect(`${path}?${key}=` + encodeURIComponent(msg));

const nullIfBlank = (v) => {
    const s = String(v ?? '').trim();
    return s === '' ? null : s;
};

/** 코드는 대문자 영문/숫자/언더스코어만. 그 외 문자는 `_` 로 접는다. */
function normalizeCode(raw) {
    return String(raw ?? '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);
}

const normalizeScheduleType = (v) =>
    SCHEDULE_TYPES.some((s) => s.value === v) ? String(v) : 'PERIOD';

const normalizeBadgeColor = (v) =>
    BADGE_COLORS.includes(String(v)) ? String(v) : null;

/** 폼 → 저장값. @returns {{error:string}|{value:object}} */
function normalizeForm(body) {
    const code = normalizeCode(body.code);
    if (!code) return { error: '코드를 입력하세요. (영문 대문자·숫자·언더스코어)' };

    const name = String(body.name ?? '').trim();
    if (!name) return { error: '카테고리명을 입력하세요.' };

    const sortOrder = Number.parseInt(body.sort_order, 10);

    return {
        value: {
            code,
            name: name.slice(0, 60),
            description: nullIfBlank(body.description) ? String(body.description).trim().slice(0, 200) : null,
            schedule_type: normalizeScheduleType(body.schedule_type),
            badge_text: nullIfBlank(body.badge_text) ? String(body.badge_text).trim().slice(0, 20) : null,
            badge_color: normalizeBadgeColor(body.badge_color),
            sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
            is_active: body.is_active ? 1 : 0,
        },
    };
}

async function findOwned(mallId, id) {
    const [[row]] = await pool.query(
        'SELECT * FROM deal_category WHERE id = ? AND mall_id = ?', [id, mallId]
    );
    return row || null;
}

/** 이 카테고리를 쓰는 특가 수 (삭제 가드) */
async function countDeals(categoryId) {
    const [[row]] = await pool.query(
        'SELECT COUNT(*) AS c FROM deal WHERE deal_category_id = ?', [categoryId]
    );
    return Number(row.c) || 0;
}

/** GET /admin/deal-categories */
exports.getList = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const [categories] = await pool.query(`
            SELECT dc.*,
                   (SELECT COUNT(*) FROM deal d WHERE d.deal_category_id = dc.id) AS deal_count,
                   (SELECT COUNT(*) FROM deal d
                     WHERE d.deal_category_id = dc.id AND d.is_active = 1
                       AND NOW() BETWEEN d.starts_at AND d.ends_at) AS running_count
              FROM deal_category dc
             WHERE dc.mall_id = ?
             ORDER BY dc.sort_order ASC, dc.id ASC
        `, [mallId]);

        res.render('admin/deal-categories/list', {
            layout: 'layouts/admin_layout',
            title: '특가 카테고리',
            categories,
            scheduleTypes: SCHEDULE_TYPES,
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[dealCategory] getList:', err.message);
        res.status(500).send('Server Error');
    }
};

function renderForm(res, category, extra = {}) {
    res.render('admin/deal-categories/form', Object.assign({
        layout: 'layouts/admin_layout',
        title: category.id ? '특가 카테고리 수정' : '특가 카테고리 등록',
        category,
        scheduleTypes: SCHEDULE_TYPES,
        badgeColors: BADGE_COLORS,
        dealCount: 0,
        saved: false,
        error: null,
    }, extra));
}

/** GET /admin/deal-categories/new */
exports.getNew = (req, res) => {
    renderForm(res, {
        id: null, code: '', name: '', description: '', schedule_type: 'PERIOD',
        badge_text: '', badge_color: 'rose', sort_order: 0, is_active: 1,
    });
};

/** GET /admin/deal-categories/:id */
exports.getEdit = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const category = await findOwned(mallId, req.params.id);
        if (!category) return redirectWith(res, BASE, 'error', '카테고리를 찾을 수 없습니다.');

        renderForm(res, category, {
            dealCount: await countDeals(category.id),
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[dealCategory] getEdit:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/deal-categories — 생성 */
exports.postCreate = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const out = normalizeForm(req.body);
        if (out.error) return redirectWith(res, `${BASE}/new`, 'error', out.error);
        const v = out.value;

        const [r] = await pool.query(`
            INSERT INTO deal_category
                (mall_id, code, name, description, schedule_type, badge_text, badge_color, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            mallId, v.code, v.name, v.description, v.schedule_type,
            v.badge_text, v.badge_color, v.sort_order, v.is_active,
        ]);

        res.redirect(`${BASE}/${r.insertId}?saved=1`);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return redirectWith(res, `${BASE}/new`, 'error', '이미 사용 중인 코드입니다.');
        }
        console.error('[dealCategory] postCreate:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/deal-categories/:id — 수정 */
exports.postUpdate = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const back = `${BASE}/${id}`;
    try {
        const category = await findOwned(mallId, id);
        if (!category) return redirectWith(res, BASE, 'error', '카테고리를 찾을 수 없습니다.');

        const out = normalizeForm(req.body);
        if (out.error) return redirectWith(res, back, 'error', out.error);
        const v = out.value;

        await pool.query(`
            UPDATE deal_category
               SET code = ?, name = ?, description = ?, schedule_type = ?,
                   badge_text = ?, badge_color = ?, sort_order = ?, is_active = ?
             WHERE id = ? AND mall_id = ?
        `, [
            v.code, v.name, v.description, v.schedule_type,
            v.badge_text, v.badge_color, v.sort_order, v.is_active,
            id, mallId,
        ]);

        res.redirect(`${back}?saved=1`);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return redirectWith(res, `${BASE}/${req.params.id}`, 'error', '이미 사용 중인 코드입니다.');
        }
        console.error('[dealCategory] postUpdate:', err.message);
        res.status(500).send('Server Error');
    }
};

/**
 * POST /admin/deal-categories/:id/toggle — 사용 on/off
 * 카테고리를 끄면 dealService 의 `dc.is_active = 1` 조건에서 탈락해 그 카테고리의
 * 특가가 전부 즉시 꺼진다(= 삭제 대신 쓰는 안전한 종료 수단).
 */
exports.postToggle = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const category = await findOwned(mallId, req.params.id);
        if (!category) return redirectWith(res, BASE, 'error', '카테고리를 찾을 수 없습니다.');

        await pool.query(
            'UPDATE deal_category SET is_active = ? WHERE id = ? AND mall_id = ?',
            [category.is_active ? 0 : 1, category.id, mallId]
        );
        res.redirect(`${BASE}?saved=1`);
    } catch (err) {
        console.error('[dealCategory] postToggle:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/deal-categories/:id/delete */
exports.postDelete = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    try {
        const category = await findOwned(mallId, id);
        if (!category) return redirectWith(res, BASE, 'error', '카테고리를 찾을 수 없습니다.');

        // FK 가 ON DELETE RESTRICT 라 DB 도 막지만, 먼저 세어 사람이 읽을 메시지로 돌려준다.
        const n = await countDeals(id);
        if (n > 0) {
            return redirectWith(res, BASE, 'error',
                `사용 중인 특가가 ${n}건 있습니다. 특가를 먼저 옮기거나 지운 뒤 삭제하세요. (삭제 대신 "사용" 을 끄면 즉시 노출이 중단됩니다.)`);
        }

        await pool.query('DELETE FROM deal_category WHERE id = ? AND mall_id = ?', [id, mallId]);
        res.redirect(`${BASE}?saved=1`);
    } catch (err) {
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
            return redirectWith(res, BASE, 'error', '사용 중인 특가가 있어 삭제할 수 없습니다.');
        }
        console.error('[dealCategory] postDelete:', err.message);
        res.status(500).send('Server Error');
    }
};

exports.SCHEDULE_TYPES = SCHEDULE_TYPES;
