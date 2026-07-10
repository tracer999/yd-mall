const pool = require('../../config/db');

/**
 * 이벤트 조회 서비스
 * 설계: docs/사이트개선/gnb_menu_design.md §2-7
 *
 * 핵심 규칙: `status` 는 운영상태(DRAFT/PUBLISHED/HIDDEN)만 담는다.
 * 예정/진행중/종료는 **저장하지 않고** start_at·end_at 에서 파생한다.
 * (기간과 상태를 이중 관리하면 반드시 어긋난다)
 */

/** 고객에게 보일 수 있는 최소 조건. 목록·상세 공통. */
const VISIBLE = "status = 'PUBLISHED'";

const PHASES = { UPCOMING: 'upcoming', ONGOING: 'ongoing', ENDED: 'ended' };

/** 기간 → 노출 상태. DB 에 컬럼이 없다. */
function derivePhase(ev, now = new Date()) {
    const start = ev.start_at ? new Date(ev.start_at) : null;
    const end = ev.end_at ? new Date(ev.end_at) : null;
    if (start && now < start) return PHASES.UPCOMING;
    if (end && now > end) return PHASES.ENDED;
    return PHASES.ONGOING;
}

const PHASE_LABELS = { upcoming: '예정', ongoing: '진행중', ended: '종료' };

/** 상태 필터를 SQL 조건으로. 'all' 이면 조건 없음. */
function phaseClause(phase) {
    if (phase === PHASES.UPCOMING) return 'AND start_at > NOW()';
    if (phase === PHASES.ONGOING) return 'AND start_at <= NOW() AND (end_at IS NULL OR end_at >= NOW())';
    if (phase === PHASES.ENDED) return 'AND end_at IS NOT NULL AND end_at < NOW()';
    return '';
}

function decorate(ev) {
    ev.phase = derivePhase(ev);
    ev.phaseLabel = PHASE_LABELS[ev.phase];
    ev.isOngoing = ev.phase === PHASES.ONGOING;
    ev.isFull = ev.issue_limit !== null && ev.issued_count >= ev.issue_limit;
    ev.remaining = ev.issue_limit !== null ? Math.max(0, ev.issue_limit - ev.issued_count) : null;
    // 공지형은 참여 버튼 자체가 없다.
    ev.participable = ev.event_type !== 'NOTICE';
    return ev;
}

/** 발행된 이벤트가 1건이라도 있는가 (0건 폴백 판정용). */
async function hasAny(mallId) {
    const [[r]] = await pool.query(
        `SELECT COUNT(*) AS n FROM event WHERE mall_id = ? AND ${VISIBLE} AND list_visible = 1`,
        [mallId]
    );
    return r.n > 0;
}

/** GET /event 목록. phase 는 'all'|'upcoming'|'ongoing'|'ended'. */
async function list(mallId, { phase = 'all' } = {}) {
    const [rows] = await pool.query(
        `SELECT * FROM event
         WHERE mall_id = ? AND ${VISIBLE} AND list_visible = 1
         ${phaseClause(phase)}
         ORDER BY
           CASE WHEN start_at <= NOW() AND (end_at IS NULL OR end_at >= NOW()) THEN 0
                WHEN start_at > NOW() THEN 1
                ELSE 2 END,
           start_at DESC, id DESC`,
        [mallId]
    );
    return rows.map(decorate);
}

/** GET /event/:slug 상세. slug 는 몰 스코프 유니크라 mall_id 가 필요하다. */
async function findBySlug(mallId, slug) {
    const [rows] = await pool.query(
        `SELECT * FROM event WHERE mall_id = ? AND slug = ? AND ${VISIBLE} LIMIT 1`,
        [mallId, slug]
    );
    return rows.length ? decorate(rows[0]) : null;
}

async function findById(mallId, id) {
    const [rows] = await pool.query(
        `SELECT * FROM event WHERE mall_id = ? AND id = ? AND ${VISIBLE} LIMIT 1`,
        [mallId, id]
    );
    return rows.length ? decorate(rows[0]) : null;
}

/** 로그인 사용자가 이미 참여했는가. */
async function hasParticipated(eventId, userId) {
    if (!userId) return false;
    const [[r]] = await pool.query(
        'SELECT COUNT(*) AS n FROM event_participant WHERE event_id = ? AND user_id = ?',
        [eventId, userId]
    );
    return r.n > 0;
}

async function incrementView(id) {
    await pool.query('UPDATE event SET view_count = view_count + 1 WHERE id = ?', [id]);
}

/**
 * 참여 처리 (E11). 경쟁 조건을 DB 로 막는다.
 *
 * 애플리케이션에서 COUNT 후 INSERT 하면 동시 요청에 선착순이 초과 발급된다.
 * 조건부 UPDATE 의 affectedRows 로 슬롯을 먼저 확보하고, 그 다음에 참여자를 넣는다.
 * 중복 참여는 UNIQUE(event_id,user_id) 가 막는다.
 *
 * @returns {'ok'|'full'|'closed'|'duplicate'}
 */
async function participate(mallId, eventId, userId) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 슬롯 확보 — 기간·수량을 SQL 한 문장으로 검사한다.
        const [r] = await conn.query(
            `UPDATE event
                SET issued_count = issued_count + 1
              WHERE id = ? AND mall_id = ? AND status = 'PUBLISHED'
                AND event_type <> 'NOTICE'
                AND start_at <= NOW()
                AND (end_at IS NULL OR end_at >= NOW())
                AND (issue_limit IS NULL OR issued_count < issue_limit)`,
            [eventId, mallId]
        );
        if (!r.affectedRows) {
            await conn.rollback();
            // 기간 문제인지 수량 문제인지 구분해서 알려준다.
            const [[ev]] = await conn.query('SELECT issue_limit, issued_count FROM event WHERE id = ?', [eventId]);
            const full = ev && ev.issue_limit !== null && ev.issued_count >= ev.issue_limit;
            return full ? 'full' : 'closed';
        }

        try {
            await conn.query(
                "INSERT INTO event_participant (event_id, user_id, status) VALUES (?, ?, 'APPLIED')",
                [eventId, userId]
            );
        } catch (err) {
            await conn.rollback();
            if (err.code === 'ER_DUP_ENTRY') return 'duplicate';
            throw err;
        }

        await conn.commit();
        return 'ok';
    } catch (err) {
        try { await conn.rollback(); } catch (_) { /* already rolled back */ }
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = {
    PHASES, PHASE_LABELS,
    derivePhase, hasAny, list, findBySlug, findById,
    hasParticipated, incrementView, participate,
};
