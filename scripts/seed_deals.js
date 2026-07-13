#!/usr/bin/env node
/**
 * 쇼핑특가 시연 데이터 시드 (멱등)
 *
 * 실행: node scripts/seed_deals.js
 *
 * 특가 모듈의 **모든 기능이 화면에서 보이도록** 구성한다.
 *   · 상시 특가(기간만)          → 오늘의 특가 · 시즌특가
 *   · 타임특가(기간 + 매일 시간창) → 타임특가 (넓은 창이라 대부분 시간대에 열려 있다)
 *   · 요일 지정                   → 주말특가 (금·토·일에만 열린다)
 *   · '오늘 열릴 특가' 예고 배너   → 심야특가 (22:00 오픈 — 그 전에는 예고로만 뜬다)
 *   · 선착순 수량                 → 타임특가에 한정 수량 + 소진 임박(95%) 케이스 포함
 *   · 중복 특가 우선순위          → priority 로 갈린다
 *
 * ⚠️ 멱등하게 만들려고 **기존 deal 을 전부 지우고 다시 만든다.**
 *    시연/개발 환경 전용이다. 운영에서 관리자가 만든 특가가 있으면 함께 사라진다.
 *
 * 기간은 넉넉히(60일) 잡는다 — 시연 도중 특가가 만료돼 화면이 비는 일이 없도록.
 */
require('../config/env');
const pool = require('../config/db');

const MALL_ID = 1;

/** 특가 카테고리 (code 로 upsert) */
const CATEGORIES = [
    { code: 'TODAY',   name: '오늘의 특가', schedule: 'PERIOD', badge: '오늘특가', color: 'rose',    sort: 1,
      desc: '오늘 하루만 진행되는 한정 특가' },
    { code: 'TIME',    name: '타임특가',   schedule: 'TIME',   badge: '타임특가', color: 'amber',   sort: 2,
      desc: '정해진 시간에만 열리는 선착순 특가' },
    { code: 'WEEKEND', name: '주말특가',   schedule: 'TIME',   badge: '주말특가', color: 'violet',  sort: 3,
      desc: '금·토·일에만 만나는 주말 한정 특가' },
    { code: 'NIGHT',   name: '심야특가',   schedule: 'TIME',   badge: '심야특가', color: 'slate',   sort: 4,
      desc: '밤 10시에 열리는 심야 한정 특가' },
    { code: 'SEASON',  name: '시즌특가',   schedule: 'PERIOD', badge: '시즌특가', color: 'emerald', sort: 5,
      desc: '시즌 단위로 진행되는 장기 기획 특가' },
];

/**
 * 특가 캠페인.
 *  discount : 정가 대비 할인율. deal_price 는 100원 단위로 절사한다.
 *  qty      : [한정수량, 이미 팔린 수량] — 선착순 게이지가 보이게. null 이면 무제한.
 *  days     : 시작일로부터 며칠간
 *  daily    : [시작시각, 종료시각] — 타임특가. 없으면 기간 내 상시.
 *  weekdays : '5,6,7' (1=월 … 7=일). 없으면 매일.
 */
const DEALS = [
    {
        category: 'TODAY', title: '오늘의 특가', subtitle: '오늘 자정까지! 하루 한정 특가',
        days: 60, priority: 10, sort: 1,
        items: [
            { discount: 0.30 }, { discount: 0.35 }, { discount: 0.30 },
            { discount: 0.40 }, { discount: 0.32 }, { discount: 0.28 },
        ],
    },
    {
        category: 'TIME', title: '타임특가', subtitle: '매일 오전 9시 ~ 밤 11시! 선착순 한정 수량',
        days: 60, priority: 20, sort: 2, daily: ['09:00:00', '23:00:00'],
        items: [
            { discount: 0.45, qty: [20, 7] },
            { discount: 0.40, qty: [10, 3] },
            { discount: 0.50, qty: [30, 21] },
            { discount: 0.55, qty: [20, 19] },   // 소진 임박(95%) — 게이지가 거의 찬다
        ],
    },
    {
        category: 'WEEKEND', title: '주말특가', subtitle: '금·토·일에만 열립니다',
        days: 60, priority: 15, sort: 3, weekdays: '5,6,7',
        items: [
            { discount: 0.35 }, { discount: 0.38 }, { discount: 0.33 }, { discount: 0.36 },
        ],
    },
    {
        category: 'NIGHT', title: '심야특가', subtitle: '밤 10시 오픈! 자정 전까지만',
        days: 60, priority: 25, sort: 4, daily: ['22:00:00', '23:59:00'],
        items: [
            { discount: 0.50, qty: [15, 4] }, { discount: 0.48 }, { discount: 0.52, qty: [10, 8] },
        ],
    },
    {
        category: 'SEASON', title: '여름 시즌특가', subtitle: '한 달간 진행되는 시즌 기획 특가',
        days: 60, priority: 5, sort: 5,
        items: [
            { discount: 0.20 }, { discount: 0.22 }, { discount: 0.18 },
            { discount: 0.25 }, { discount: 0.20 }, { discount: 0.23 },
        ],
    },
];

/** 특가가: 정가 대비 할인 후 100원 단위 절사. 정가보다 반드시 싸야 활성된다. */
function dealPrice(price, discount) {
    const p = Math.floor((price * (1 - discount)) / 100) * 100;
    return Math.max(100, Math.min(p, price - 100));
}

(async () => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 1) 카테고리 upsert
        for (const c of CATEGORIES) {
            await conn.query(
                `INSERT INTO deal_category
                    (mall_id, code, name, description, schedule_type, badge_text, badge_color, sort_order, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE
                    name = VALUES(name), description = VALUES(description),
                    schedule_type = VALUES(schedule_type), badge_text = VALUES(badge_text),
                    badge_color = VALUES(badge_color), sort_order = VALUES(sort_order), is_active = 1`,
                [MALL_ID, c.code, c.name, c.desc, c.schedule, c.badge, c.color, c.sort]
            );
        }
        const [cats] = await conn.query('SELECT id, code FROM deal_category WHERE mall_id = ?', [MALL_ID]);
        const catId = Object.fromEntries(cats.map((c) => [c.code, c.id]));

        // 2) 기존 특가 전부 제거 (deal_item 은 CASCADE)
        const [del] = await conn.query('DELETE FROM deal WHERE mall_id = ?', [MALL_ID]);
        console.log(`기존 특가 ${del.affectedRows}건 삭제`);

        // 3) 상품 풀 — 캠페인끼리 겹치지 않게 순서대로 나눠 쓴다.
        const needed = DEALS.reduce((n, d) => n + d.items.length, 0);
        const [pool_] = await conn.query(
            `SELECT id, name, price FROM products
              WHERE mall_id = ? AND status = 'ON' AND visibility = 'PUBLIC'
                AND price >= 8000 AND stock >= 10
              ORDER BY id LIMIT ?`,
            [MALL_ID, needed]
        );
        if (pool_.length < needed) {
            throw new Error(`상품이 부족하다: ${pool_.length}/${needed}`);
        }

        // 4) 특가 생성
        let cursor = 0;
        for (const d of DEALS) {
            const [dr] = await conn.query(
                `INSERT INTO deal (mall_id, deal_category_id, title, subtitle, starts_at, ends_at,
                                   daily_start_time, daily_end_time, weekdays, priority, sort_order, is_active)
                 VALUES (?, ?, ?, ?, DATE(NOW()), DATE_ADD(DATE(NOW()), INTERVAL ? DAY), ?, ?, ?, ?, ?, 1)`,
                [MALL_ID, catId[d.category], d.title, d.subtitle, d.days,
                 d.daily ? d.daily[0] : null, d.daily ? d.daily[1] : null,
                 d.weekdays || null, d.priority, d.sort]
            );

            const rows = d.items.map((it, i) => {
                const p = pool_[cursor++];
                const [limit, sold] = it.qty || [null, 0];
                return [dr.insertId, p.id, dealPrice(p.price, it.discount), limit, sold, i + 1];
            });
            await conn.query(
                `INSERT INTO deal_item (deal_id, product_id, deal_price, qty_limit, sold_qty, sort_order)
                 VALUES ?`,
                [rows]
            );

            const when = d.daily ? `매일 ${d.daily[0].slice(0, 5)}~${d.daily[1].slice(0, 5)}` : '기간 내 상시';
            const wd = d.weekdays ? ` / 요일 ${d.weekdays}` : '';
            console.log(`  ${d.title.padEnd(12)} 상품 ${String(rows.length).padStart(2)}개  ${when}${wd}`);
        }

        await conn.commit();
        console.log('\n시드 완료.');
    } catch (e) {
        await conn.rollback();
        console.error('실패 — 롤백함:', e.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
})();
