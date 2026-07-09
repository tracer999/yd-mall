#!/usr/bin/env node
/**
 * M8 — 고객센터 FAQ 모듈 (멱등)
 *
 * 실행: node scripts/migrate_faq.js
 *
 * 생성:
 *   faq_category  FAQ 분류 (주문/결제, 배송, 취소·교환·반품 …)
 *   faq           FAQ 항목 (question / answer / view_count / is_best)
 *
 * 부수 효과:
 *   feature_menu.HEADER_CS.default_path 를 '/boards/notice' → '/cs' 로 승격
 *
 * 설계: docs/사이트개선/frontend_dev_plan.md §5.6
 */
require('../config/env');
const pool = require('../config/db');

const CATEGORIES = [
    { code: 'ORDER_PAY', name: '주문/결제', sort_order: 1 },
    { code: 'DELIVERY', name: '배송', sort_order: 2 },
    { code: 'CANCEL_RETURN', name: '취소/교환/반품', sort_order: 3 },
    { code: 'POINT', name: '적립금', sort_order: 4 },
    { code: 'MEMBER', name: '회원', sort_order: 5 },
    { code: 'ETC', name: '기타', sort_order: 6 },
];

/** 초기 FAQ (운영자가 관리자에서 수정/추가) */
const FAQS = [
    ['MEMBER', '회원가입은 어떻게 하나요?', '<p>상단 <strong>회원가입</strong> 버튼을 눌러 구글 또는 카카오 계정으로 간편하게 가입할 수 있습니다.</p>', 1],
    ['MEMBER', '아이디/비밀번호를 잊어버렸어요.', '<p>간편 로그인(구글·카카오)을 사용하므로 별도의 비밀번호가 없습니다. 가입 시 사용한 소셜 계정으로 로그인해 주세요.</p>', 1],
    ['ORDER_PAY', '주문은 어떻게 하나요?', '<p>상품 상세 페이지에서 <strong>장바구니 담기</strong> 또는 <strong>바로 구매</strong>를 눌러 주문할 수 있습니다.</p>', 1],
    ['ORDER_PAY', '어떤 결제 수단을 사용할 수 있나요?', '<p>신용/체크카드, 계좌이체, 간편결제를 지원합니다. 결제는 토스페이먼츠를 통해 안전하게 처리됩니다.</p>', 1],
    ['ORDER_PAY', '주문 내역은 어디서 확인하나요?', '<p><a href="/mypage/orders">마이쇼핑 &gt; 주문내역</a>에서 확인할 수 있습니다.</p>', 1],
    ['DELIVERY', '배송은 얼마나 걸리나요?', '<p>결제 완료 후 영업일 기준 1~3일 내 출고되며, 지역에 따라 1~2일 추가될 수 있습니다.</p>', 1],
    ['DELIVERY', '배송 조회는 어떻게 하나요?', '<p><a href="/mypage/orders">마이쇼핑 &gt; 주문내역</a>에서 운송장 번호로 조회할 수 있습니다.</p>', 1],
    ['CANCEL_RETURN', '주문을 취소하고 싶어요.', '<p>출고 전에는 마이쇼핑에서 직접 취소할 수 있습니다. 출고 후에는 고객센터로 문의해 주세요.</p>', 1],
    ['CANCEL_RETURN', '교환/반품 비용은 누가 부담하나요?', '<p>단순 변심은 고객 부담, 상품 하자·오배송은 판매자 부담입니다.</p>', 1],
    ['POINT', '적립금은 어떻게 쌓이나요?', '<p>구매 확정 시 결제 금액의 일정 비율이 적립됩니다. 적립률은 <a href="/mypage/points">마이쇼핑 &gt; 포인트</a>에서 확인하세요.</p>', 1],
    ['POINT', '적립금 사용 후 취소하면 어떻게 되나요?', '<p>주문 취소 시 사용한 적립금은 자동으로 환원됩니다.</p>', 0],
    ['ETC', '상품 문의는 어디에 하나요?', '<p><a href="/inquiries">1:1 문의</a> 또는 카카오톡 채널로 문의해 주세요.</p>', 0],
];

async function tableExists(conn, table) {
    const [r] = await conn.query(
        'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
        [table]
    );
    return r.length > 0;
}

async function createTables(conn) {
    console.log('\n[1] 테이블 생성');

    await conn.query(`
    CREATE TABLE IF NOT EXISTS \`faq_category\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`mall_id\` BIGINT NOT NULL DEFAULT 1,
      \`code\` VARCHAR(50) NOT NULL COMMENT '분류 코드(고정 식별자)',
      \`name\` VARCHAR(100) NOT NULL COMMENT '분류명(운영자 변경 가능)',
      \`sort_order\` INT NOT NULL DEFAULT 0,
      \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uk_faq_category_code\` (\`mall_id\`, \`code\`),
      KEY \`idx_faq_category_sort\` (\`mall_id\`, \`sort_order\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='FAQ 분류'`);
    console.log('  + faq_category');

    await conn.query(`
    CREATE TABLE IF NOT EXISTS \`faq\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`mall_id\` BIGINT NOT NULL DEFAULT 1,
      \`category_id\` BIGINT NULL,
      \`question\` VARCHAR(255) NOT NULL,
      \`answer\` TEXT NOT NULL COMMENT 'HTML. 저장/렌더 시 새니타이즈',
      \`is_best\` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=자주묻는질문 BEST 노출',
      \`view_count\` INT NOT NULL DEFAULT 0,
      \`sort_order\` INT NOT NULL DEFAULT 0,
      \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_faq_category\` (\`mall_id\`, \`category_id\`, \`sort_order\`),
      KEY \`idx_faq_best\` (\`mall_id\`, \`is_best\`, \`view_count\`),
      CONSTRAINT \`fk_faq_category\` FOREIGN KEY (\`category_id\`) REFERENCES \`faq_category\` (\`id\`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='FAQ'`);
    console.log('  + faq');
}

async function seed(conn) {
    console.log('\n[2] FAQ 분류 시드');
    const idByCode = {};
    for (const c of CATEGORIES) {
        await conn.query(
            `INSERT INTO faq_category (mall_id, code, name, sort_order)
             VALUES (1, ?, ?, ?)
             ON DUPLICATE KEY UPDATE name = VALUES(name), sort_order = VALUES(sort_order)`,
            [c.code, c.name, c.sort_order]
        );
        const [r] = await conn.query('SELECT id FROM faq_category WHERE mall_id = 1 AND code = ?', [c.code]);
        idByCode[c.code] = r[0].id;
    }
    console.log(`  · ${CATEGORIES.length}건 upsert`);

    console.log('\n[3] FAQ 항목 시드 (기존 항목이 있으면 건너뜀)');
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM faq WHERE mall_id = 1');
    if (n > 0) {
        console.log(`  = FAQ ${n}건이 이미 있어 시드를 건너뜁니다.`);
        return;
    }
    let i = 0;
    for (const [code, q, a, best] of FAQS) {
        await conn.query(
            'INSERT INTO faq (mall_id, category_id, question, answer, is_best, sort_order) VALUES (1, ?, ?, ?, ?, ?)',
            [idByCode[code], q, a, best, ++i]
        );
    }
    console.log(`  + ${FAQS.length}건 생성`);
}

async function promoteCsMenu(conn) {
    console.log('\n[4] HEADER_CS 표준 URL 승격');
    const [r] = await conn.query(
        "UPDATE feature_menu SET default_path = '/cs' WHERE feature_code = 'HEADER_CS'"
    );
    console.log(`  · feature_menu.HEADER_CS.default_path = '/cs' (${r.affectedRows}행)`);
}

(async () => {
    const conn = await pool.getConnection();
    try {
        await createTables(conn);
        await seed(conn);
        await promoteCsMenu(conn);
        console.log('\n✅ 마이그레이션 완료');
    } catch (err) {
        console.error('\n❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
})();
