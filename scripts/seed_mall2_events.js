#!/usr/bin/env node
/**
 * mall 2 (종합관) 이벤트 샘플 시드 — 목록 필터·참여 버튼 상태를 전부 확인할 수 있게 구성 (멱등)
 *
 * 실행:  node scripts/seed_mall2_events.js
 * 제거:  node scripts/seed_mall2_events.js --remove
 *
 * ⚠️ 개발 DB 와 운영 DB 가 같다. mall 2 는 `?mall=2` 세션 전환으로만 도달하며 기본 몰이 아니다.
 *
 * 커버하는 상태(고객 화면에서 각각 다르게 보인다):
 *   진행중 + 응모 + 선착순 여유   → [참여하기] 활성
 *   진행중 + 응모 + 선착순 마감   → [선착순 마감] 비활성   (참여자 3명을 실제로 넣어 만든다)
 *   진행중 + 응모 + 무제한        → [참여하기] 활성, 인원 표기 없음
 *   진행중 + 공지형               → 참여 영역 자체가 없음
 *   예정   + 응모                 → [곧 시작합니다] 비활성
 *   종료   + 응모                 → [종료된 이벤트입니다] 비활성, 카드가 흐려짐
 *
 * 참여형은 APPLY 만 동작한다(eventService.PARTICIPABLE_TYPES). 출석체크·쿠폰팩·구매인증은
 * 아직 열지 않았다 — docs/사이트개선/gnb_menu_design.md §8-1 의 E13~E15 참고.
 */
require('../config/env');
const pool = require('../config/db');

const MALL_ID = 2;
const isRemove = process.argv.includes('--remove');
const IMG = (slug) => `/images/placeholders/${slug}.svg`;

/* relOffsetDays: 지금 기준 며칠 뒤(음수면 며칠 전). 시드를 언제 돌려도 상태가 유지된다. */
const EVENTS = [
    {
        slug: 'g2-welcome-giveaway',
        title: '종합관 오픈 기념 경품 응모',
        summary: '응모만 해도 추첨을 통해 인기 상품을 드립니다',
        event_type: 'APPLY',
        thumbnail: IMG('acc'),
        startDays: -7, endDays: 21,
        issue_limit: 1000,
        winnerDays: 25,
        content: '<p>종합관 오픈을 기념해 경품 응모 이벤트를 진행합니다.</p><p>기간 내 응모하시면 추첨을 통해 인기 상품을 드립니다.</p>',
        notice: '1인 1회 응모 가능하며, 중복 응모는 자동으로 걸러집니다.',
        fillParticipants: 0,
    },
    {
        slug: 'g2-limited-first-come',
        title: '선착순 3명 한정 시크릿 응모',
        summary: '이미 마감된 이벤트입니다 (마감 화면 확인용)',
        event_type: 'APPLY',
        thumbnail: IMG('luxury'),
        startDays: -3, endDays: 14,
        issue_limit: 3,
        winnerDays: null,
        content: '<p>선착순 3명에게만 기회가 주어지는 시크릿 이벤트입니다.</p>',
        notice: '선착순 마감 시 참여할 수 없습니다.',
        fillParticipants: 3, // 실제 참여자 3명을 넣어 '마감' 상태를 만든다
    },
    {
        slug: 'g2-unlimited-apply',
        title: '전 회원 대상 리뷰 응모 이벤트',
        summary: '인원 제한 없이 누구나 참여할 수 있습니다',
        event_type: 'APPLY',
        thumbnail: IMG('beauty'),
        startDays: -10, endDays: 30,
        issue_limit: null, // 무제한
        winnerDays: 35,
        content: '<p>인원 제한 없는 응모 이벤트입니다. 참여만 하면 추첨 대상이 됩니다.</p>',
        notice: '당첨자는 개별 안내드립니다.',
        fillParticipants: 0,
    },
    {
        slug: 'g2-membership-benefit',
        title: '신규 회원 상시 혜택 안내',
        summary: '가입하면 바로 받는 쿠폰과 적립금',
        event_type: 'NOTICE', // 공지형 — 참여 버튼 없음
        thumbnail: IMG('food'),
        startDays: -30, endDays: null, // 상시
        issue_limit: null,
        winnerDays: null,
        content: '<p>신규 가입 시 즉시 쿠폰이 발급됩니다.</p><ul><li>가입 축하 쿠폰</li><li>첫 구매 적립금</li></ul>',
        notice: '혜택은 사전 고지 없이 변경될 수 있습니다.',
        fillParticipants: 0,
    },
    {
        slug: 'g2-upcoming-autumn',
        title: '가을맞이 대규모 응모전 (예정)',
        summary: '곧 시작합니다',
        event_type: 'APPLY',
        thumbnail: IMG('living'),
        startDays: 7, endDays: 37, // 아직 시작 전
        issue_limit: 500,
        winnerDays: 40,
        content: '<p>가을맞이 대규모 응모전이 곧 시작됩니다.</p>',
        notice: '시작 전에는 참여할 수 없습니다.',
        fillParticipants: 0,
    },
    {
        slug: 'g2-ended-spring',
        title: '봄맞이 감사 이벤트 (종료)',
        summary: '종료된 이벤트입니다',
        event_type: 'APPLY',
        thumbnail: IMG('women'),
        startDays: -60, endDays: -10, // 이미 종료
        issue_limit: 200,
        winnerDays: -5,
        content: '<p>참여해 주셔서 감사합니다. 당첨자는 개별 안내드렸습니다.</p>',
        notice: '종료된 이벤트입니다.',
        fillParticipants: 0,
    },
];

const SLUGS = EVENTS.map((e) => e.slug);

async function removeAll(conn) {
    const [r] = await conn.query(
        `DELETE FROM event WHERE mall_id = ? AND slug IN (${SLUGS.map(() => '?').join(',')})`,
        [MALL_ID, ...SLUGS]
    );
    // event_participant 는 ON DELETE CASCADE 로 함께 지워진다.
    console.log(`  - 이벤트 ${r.affectedRows}건 제거 (참여자는 CASCADE)`);
}

(async () => {
    const conn = await pool.getConnection();
    try {
        if (isRemove) {
            console.log(`mall ${MALL_ID} 이벤트 샘플 제거`);
            await removeAll(conn);
            console.log('\n✅ 완료');
            return;
        }

        console.log(`mall ${MALL_ID} (종합관) 이벤트 샘플 시드`);
        await removeAll(conn); // 멱등: 지우고 다시 넣는다

        // 마감 상태를 만들 때 쓸 실제 회원
        const [users] = await conn.query('SELECT id FROM users WHERE is_active = 1 ORDER BY id LIMIT 5');

        for (const e of EVENTS) {
            const [r] = await conn.query(
                `INSERT INTO event
                   (mall_id, title, slug, summary, content, notice, event_type,
                    thumbnail_url, status, start_at, end_at, winner_announce_at,
                    login_required, issue_limit, issued_count, list_visible)
                 VALUES (?,?,?,?,?,?,?,?, 'PUBLISHED',
                         DATE_ADD(NOW(), INTERVAL ? DAY),
                         ${e.endDays === null ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL ? DAY)'},
                         ${e.winnerDays === null ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL ? DAY)'},
                         1, ?, 0, 1)`,
                [
                    MALL_ID, e.title, e.slug, e.summary, e.content, e.notice, e.event_type,
                    e.thumbnail, e.startDays,
                    ...(e.endDays === null ? [] : [e.endDays]),
                    ...(e.winnerDays === null ? [] : [e.winnerDays]),
                    e.issue_limit,
                ]
            );
            const eventId = r.insertId;

            // '선착순 마감' 상태는 참여자를 실제로 넣어 만든다.
            // issued_count 만 올리면 참여자 테이블과 어긋나 관리자 화면이 불일치 경고를 띄운다.
            if (e.fillParticipants > 0) {
                const take = users.slice(0, e.fillParticipants);
                if (take.length < e.fillParticipants) {
                    console.log(`  ⚠️ ${e.slug}: 회원이 ${take.length}명뿐이라 마감 상태를 못 만듭니다`);
                }
                for (const u of take) {
                    await conn.query(
                        "INSERT INTO event_participant (event_id, user_id, status) VALUES (?, ?, 'APPLIED')",
                        [eventId, u.id]
                    );
                }
                await conn.query('UPDATE event SET issued_count = ? WHERE id = ?', [take.length, eventId]);
            }

            console.log(`  + ${e.slug.padEnd(24)} ${e.event_type.padEnd(7)} 참여 ${e.fillParticipants}/${e.issue_limit ?? '무제한'}`);
        }

        // --- 무결성 확인 ---
        const [rows] = await conn.query(
            `SELECT slug, event_type, issued_count, issue_limit,
                    CASE WHEN start_at > NOW() THEN '예정'
                         WHEN end_at IS NOT NULL AND end_at < NOW() THEN '종료'
                         ELSE '진행중' END AS phase,
                    (SELECT COUNT(*) FROM event_participant p WHERE p.event_id = event.id) AS participants
             FROM event WHERE mall_id = ? ORDER BY id`, [MALL_ID]);

        console.log('\n  상태 분포:');
        rows.forEach((r) => {
            const full = r.issue_limit !== null && r.issued_count >= r.issue_limit ? ' [마감]' : '';
            const mismatch = r.issued_count !== r.participants ? ` ⚠️ 카운터 불일치(${r.issued_count}≠${r.participants})` : '';
            console.log(`    ${r.phase.padEnd(4)} ${r.event_type.padEnd(7)} ${r.slug}${full}${mismatch}`);
        });

        const phases = new Set(rows.map((r) => r.phase));
        const bad = rows.filter((r) => r.issued_count !== r.participants);
        if (bad.length) throw new Error('issued_count 와 참여자수가 어긋납니다');
        if (!['진행중', '예정', '종료'].every((p) => phases.has(p))) throw new Error('세 가지 노출 상태가 모두 만들어지지 않았습니다');

        console.log(`\n  ✓ 이벤트 ${rows.length}건 / 진행중·예정·종료 모두 존재 / 카운터 정합`);
        console.log('  확인: http://localhost:3006/event?mall=2');
        console.log('\n✅ 완료');
    } catch (err) {
        console.error('\n❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
})();
