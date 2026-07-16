/*
 * 표준 옵션 사전 시드 — option_definition + option_value_definition
 * 설계 §5.1·§10. 몰별로 멱등 시드(INSERT IGNORE / 존재 시 값만 보충).
 *
 * 실행: set -a; . /etc/environment; set +a; node scripts/seed_option_dictionary.js
 */
const bootstrap = require('./_bootstrap');
const pool = require('../config/db');

const DICT = [
    { code: 'COLOR', name: '색상', values: ['블랙', '화이트', '그레이', '네이비', '베이지'] },
    { code: 'SIZE', name: '사이즈', values: ['S', 'M', 'L', 'XL'] },
    { code: 'CAPACITY', name: '용량', values: ['100ml', '300ml', '500ml', '1L'] },
    { code: 'QUANTITY', name: '수량', values: ['1개', '2개', '3개', '5개'] },
    { code: 'SCENT', name: '향', values: ['무향', '플로럴', '시트러스'] },
    { code: 'FLAVOR', name: '맛', values: ['오리지널', '딸기', '초코'] },
    { code: 'MATERIAL', name: '재질', values: ['면', '폴리', '가죽'] },
    { code: 'TYPE', name: '타입', values: ['기본', '프리미엄'] },
];

function valueCode(displayName, i) {
    // 값 코드는 표시명 기반 slug(영숫자 아니면 순번). 유니크는 (option_definition_id, value_code).
    const slug = String(displayName).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return slug || `V${i + 1}`;
}

(async () => {
    await bootstrap();
    const [malls] = await pool.query('SELECT id FROM mall');
    let optCount = 0, valCount = 0;
    for (const m of malls) {
        for (let di = 0; di < DICT.length; di++) {
            const d = DICT[di];
            await pool.query(
                `INSERT IGNORE INTO option_definition (mall_id, option_code, option_name, input_type, is_active, display_order)
                 VALUES (?, ?, ?, 'SELECT', 1, ?)`,
                [m.id, d.code, d.name, di]
            );
            const [[od]] = await pool.query(
                'SELECT id FROM option_definition WHERE mall_id = ? AND option_code = ?', [m.id, d.code]
            );
            optCount++;
            for (let vi = 0; vi < d.values.length; vi++) {
                const [r] = await pool.query(
                    `INSERT IGNORE INTO option_value_definition (option_definition_id, value_code, display_name, display_order)
                     VALUES (?, ?, ?, ?)`,
                    [od.id, valueCode(d.values[vi], vi), d.values[vi], vi]
                );
                if (r.affectedRows) valCount++;
            }
        }
    }
    console.log(`시드 완료: 몰 ${malls.length}개, 옵션정의 ${optCount}건 처리, 신규 옵션값 ${valCount}건`);
    await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
