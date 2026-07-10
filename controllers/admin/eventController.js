const pool = require('../../config/db');

/**
 * 이벤트 관리 (E3~E5)
 * 설계: docs/사이트개선/gnb_menu_design.md §2-7
 *
 * 규칙:
 *   - status 는 운영상태(DRAFT/PUBLISHED/HIDDEN)만 담는다. 예정/진행중/종료는 기간에서 파생.
 *   - 관리자 몰 스코프는 req.adminMallId (스토어프론트의 req.mallId 와 별개 세션 키).
 *   - 폼 POST + redirect (이 저장소 관리자 표준). page-builder 만 예외적으로 JSON.
 */

/*
 * 선택 가능한 참여 방식은 **실제로 동작하는 것만** 노출한다.
 * 운영자가 고를 수 있는데 아무 일도 일어나지 않으면 그게 더 나쁘다.
 *
 * 아직 못 여는 것들(스키마 컬럼 값으로는 존재):
 *   ATTENDANCE  — UNIQUE(event_id,user_id) 때문에 1인 1회만 참여된다. 일별 출석은
 *                 event_attendance(event_id,user_id,attend_date) 같은 별도 테이블이 필요하다.
 *   COUPON_PACK — event_coupon 테이블은 만들었지만 participate() 가 쿠폰을 지급하지 않는다.
 *                 couponController 의 issued_by='ADMIN' 지급 경로를 연결해야 한다.
 *   PURCHASE    — 주문 검증(order_items 대조)이 없다. 지금 열면 아무나 참여된다.
 */
const EVENT_TYPES = ['NOTICE', 'APPLY'];
const STATUSES = ['DRAFT', 'PUBLISHED', 'HIDDEN'];

const EVENT_TYPE_LABELS = {
    NOTICE: '공지형',
    APPLY: '응모',
    // 아래 3종은 폼에 노출하지 않는다. 목록에서 기존 행을 표시할 때만 쓰인다.
    COUPON_PACK: '쿠폰팩(준비중)',
    ATTENDANCE: '출석체크(준비중)',
    PURCHASE: '구매인증(준비중)',
};

/** 기간에서 노출 상태를 파생한다. 저장하지 않는다. */
function derivePhase(ev, now = new Date()) {
    const start = ev.start_at ? new Date(ev.start_at) : null;
    const end = ev.end_at ? new Date(ev.end_at) : null;
    if (start && now < start) return '예정';
    if (end && now > end) return '종료';
    return '진행중';
}

/** 빈 문자열을 NULL 로. datetime-local 입력은 'YYYY-MM-DDTHH:mm' 로 온다. */
const nullIfBlank = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : v);
const toDateTime = (v) => {
    const s = nullIfBlank(v);
    return s ? String(s).replace('T', ' ') + (String(s).length === 16 ? ':00' : '') : null;
};
const toInt = (v) => {
    const s = nullIfBlank(v);
    if (s === null) return null;
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
};

/** slug 는 URL 이 된다. 비면 title 에서 만든다. */
function normalizeSlug(raw, title) {
    let s = String(raw || '').trim().toLowerCase();
    if (!s) s = String(title || '').trim().toLowerCase();
    s = s.replace(/[^a-z0-9가-힣\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return s.slice(0, 200) || `event-${Date.now()}`;
}

exports.getList = async (req, res) => {
    try {
        const mallId = req.adminMallId || 1;
        const status = STATUSES.includes(req.query.status) ? req.query.status : '';
        const keyword = (req.query.keyword || '').trim();

        let sql = 'SELECT * FROM event WHERE mall_id = ?';
        const params = [mallId];
        if (status) {
            sql += ' AND status = ?';
            params.push(status);
        }
        if (keyword) {
            sql += ' AND (title LIKE ? OR slug LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`);
        }
        sql += ' ORDER BY start_at DESC, id DESC';

        const [events] = await pool.query(sql, params);
        events.forEach((e) => {
            e.phase = derivePhase(e);
            e.typeLabel = EVENT_TYPE_LABELS[e.event_type] || e.event_type;
        });

        res.render('admin/events/list', {
            layout: 'layouts/admin_layout',
            title: '이벤트 관리',
            events,
            currentStatus: status,
            keyword,
            saved: req.query.saved === '1',
        });
    } catch (err) {
        console.error('[admin/event] getList', err);
        res.status(500).send('Server Error');
    }
};

exports.getAdd = async (req, res) => {
    res.render('admin/events/form', {
        layout: 'layouts/admin_layout',
        title: '이벤트 등록',
        event: null,
        eventTypes: EVENT_TYPES,
        eventTypeLabels: EVENT_TYPE_LABELS,
        statuses: STATUSES,
        tinymceKey: process.env.TINYMCE_KEY || '',
    });
};

exports.getEdit = async (req, res) => {
    try {
        const mallId = req.adminMallId || 1;
        const [rows] = await pool.query('SELECT * FROM event WHERE id = ? AND mall_id = ?', [req.params.id, mallId]);
        if (!rows.length) return res.status(404).send('이벤트를 찾을 수 없습니다.');

        const [[{ participants }]] = await pool.query(
            'SELECT COUNT(*) AS participants FROM event_participant WHERE event_id = ?', [rows[0].id]
        );

        res.render('admin/events/form', {
            layout: 'layouts/admin_layout',
            title: '이벤트 수정',
            event: rows[0],
            participants,
            eventTypes: EVENT_TYPES,
            eventTypeLabels: EVENT_TYPE_LABELS,
            statuses: STATUSES,
            tinymceKey: process.env.TINYMCE_KEY || '',
            saved: req.query.saved === '1',
        });
    } catch (err) {
        console.error('[admin/event] getEdit', err);
        res.status(500).send('Server Error');
    }
};

/** 폼 → 컬럼 값. 화이트리스트로만 받는다. */
function readForm(body) {
    const eventType = EVENT_TYPES.includes(body.event_type) ? body.event_type : 'NOTICE';
    const status = STATUSES.includes(body.status) ? body.status : 'DRAFT';
    return {
        title: String(body.title || '').trim().slice(0, 200),
        slug: normalizeSlug(body.slug, body.title),
        summary: nullIfBlank(body.summary),
        content: nullIfBlank(body.content),
        notice: nullIfBlank(body.notice),
        event_type: eventType,
        thumbnail_url: nullIfBlank(body.thumbnail_url),
        pc_hero_url: nullIfBlank(body.pc_hero_url),
        mobile_hero_url: nullIfBlank(body.mobile_hero_url),
        status,
        start_at: toDateTime(body.start_at),
        end_at: toDateTime(body.end_at),
        winner_announce_at: toDateTime(body.winner_announce_at),
        login_required: body.login_required ? 1 : 0,
        issue_limit: toInt(body.issue_limit),
        list_visible: body.list_visible ? 1 : 0,
    };
}

exports.postAdd = async (req, res) => {
    try {
        const mallId = req.adminMallId || 1;
        const f = readForm(req.body);
        if (!f.title) return res.status(400).send('이벤트명은 필수입니다.');
        if (!f.start_at) return res.status(400).send('시작일시는 필수입니다.');

        const [r] = await pool.query(
            `INSERT INTO event (mall_id, title, slug, summary, content, notice, event_type,
                                thumbnail_url, pc_hero_url, mobile_hero_url, status,
                                start_at, end_at, winner_announce_at, login_required, issue_limit, list_visible)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [mallId, f.title, f.slug, f.summary, f.content, f.notice, f.event_type,
                f.thumbnail_url, f.pc_hero_url, f.mobile_hero_url, f.status,
                f.start_at, f.end_at, f.winner_announce_at, f.login_required, f.issue_limit, f.list_visible]
        );
        res.redirect(`/admin/events/edit/${r.insertId}?saved=1`);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).send('같은 슬러그의 이벤트가 이미 있습니다.');
        console.error('[admin/event] postAdd', err);
        res.status(500).send('Server Error');
    }
};

exports.postEdit = async (req, res) => {
    try {
        const mallId = req.adminMallId || 1;
        const f = readForm(req.body);
        if (!f.title) return res.status(400).send('이벤트명은 필수입니다.');
        if (!f.start_at) return res.status(400).send('시작일시는 필수입니다.');

        const [r] = await pool.query(
            `UPDATE event SET title=?, slug=?, summary=?, content=?, notice=?, event_type=?,
                    thumbnail_url=?, pc_hero_url=?, mobile_hero_url=?, status=?,
                    start_at=?, end_at=?, winner_announce_at=?, login_required=?, issue_limit=?, list_visible=?
             WHERE id = ? AND mall_id = ?`,
            [f.title, f.slug, f.summary, f.content, f.notice, f.event_type,
                f.thumbnail_url, f.pc_hero_url, f.mobile_hero_url, f.status,
                f.start_at, f.end_at, f.winner_announce_at, f.login_required, f.issue_limit, f.list_visible,
                req.params.id, mallId]
        );
        if (!r.affectedRows) return res.status(404).send('이벤트를 찾을 수 없습니다.');
        res.redirect(`/admin/events/edit/${req.params.id}?saved=1`);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).send('같은 슬러그의 이벤트가 이미 있습니다.');
        console.error('[admin/event] postEdit', err);
        res.status(500).send('Server Error');
    }
};

exports.postDelete = async (req, res) => {
    try {
        const mallId = req.adminMallId || 1;
        // event_participant / event_coupon 은 ON DELETE CASCADE 로 함께 지워진다.
        await pool.query('DELETE FROM event WHERE id = ? AND mall_id = ?', [req.body.id, mallId]);
        res.redirect('/admin/events');
    } catch (err) {
        console.error('[admin/event] postDelete', err);
        res.status(500).send('Server Error');
    }
};

exports.derivePhase = derivePhase;
