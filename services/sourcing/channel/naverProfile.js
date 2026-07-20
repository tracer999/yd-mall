/*
 * 몰별 네이버 등록 프로필 — 판매자 레벨 필수값 저장/로드.
 * 설계: docs/사이트개선/네이버_스마트스토어_연동.md
 *
 * 왜 필요한가:
 *   네이버 상품등록은 상품 한 건을 올릴 때도 A/S 전화·안내, 원산지, 반품·교환 배송비,
 *   출고지·반품지 주소록 번호를 **매 요청 함께** 보내야 한다. 이 값들은 우리 몰 products
 *   에 없는 개념이라 몰마다 한 벌 저장해 두고 등록 시 주입한다.
 *
 * 누락된 값은 등록 직전에 **미리 걸러낸다**(§검증). 네이버에 보내고 나서 실패로 알게 되면
 * 호출 한도만 낭비하고, 무엇이 빠졌는지도 응답마다 다르게 나와 추적이 어렵다.
 */

const pool = require('../../../config/db');

/** 이 값이 없으면 상품 등록 자체가 불가능한 항목. 화면·서비스가 같은 목록을 본다. */
const REQUIRED_FIELDS = [
    { key: 'as_telephone', label: 'A/S 전화번호' },
    { key: 'as_guide_content', label: 'A/S 안내' },
    { key: 'origin_area_code', label: '원산지 코드' },
    { key: 'return_delivery_fee', label: '반품 배송비' },
    { key: 'exchange_delivery_fee', label: '교환 배송비' },
];

const DEFAULTS = {
    delivery_fee_type: 'PAID',
    minor_purchasable: 1,
    naver_shopping_registration: 1,
    channel_display_status: 'ON',
};

/**
 * 몰의 프로필을 읽는다. 행이 없으면 기본값 + 몰 배송정책에서 유추한 값을 돌려준다
 * (행을 만들지는 않는다 — 저장 시점에 만든다).
 */
async function getProfile(mallId) {
    const [rows] = await pool.query(
        'SELECT * FROM naver_publish_profile WHERE mall_id = ? LIMIT 1',
        [mallId]
    );
    if (rows.length) {
        const r = rows[0];
        // JSON 컬럼은 드라이버가 객체로 주기도, 문자열로 주기도 한다.
        if (typeof r.notice_defaults_json === 'string') {
            try { r.notice_defaults_json = JSON.parse(r.notice_defaults_json); } catch (e) { r.notice_defaults_json = null; }
        }
        return r;
    }

    // 미설정 몰 — 배송비만이라도 몰 배송정책에서 끌어와 입력 부담을 줄인다.
    const [sp] = await pool.query(
        'SELECT base_fee, free_threshold FROM shipping_policy WHERE mall_id = ? LIMIT 1',
        [mallId]
    );
    return {
        mall_id: mallId,
        ...DEFAULTS,
        delivery_fee: sp.length ? sp[0].base_fee : null,
        free_threshold: sp.length ? sp[0].free_threshold : null,
        return_delivery_fee: null,
        exchange_delivery_fee: null,
        as_telephone: null,
        as_guide_content: null,
        origin_area_code: null,
        origin_area_content: null,
        release_address_no: null,
        refund_address_no: null,
        delivery_company: null,
        notice_type: null,
        notice_defaults_json: null,
        _missing: true,
    };
}

function intOrNull(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
}

function strOrNull(v, max) {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    return max ? s.slice(0, max) : s;
}

/** 프로필 저장(업서트). 화면 폼에서 온 문자열을 여기서 정규화한다. */
async function saveProfile(mallId, input = {}) {
    let notice = input.notice_defaults_json;
    if (typeof notice === 'string') {
        const t = notice.trim();
        if (!t) notice = null;
        else {
            try { notice = JSON.parse(t); } catch (e) {
                throw new Error('고시정보 기본값이 올바른 JSON 이 아닙니다.');
            }
        }
    }

    const row = {
        mall_id: mallId,
        release_address_no: strOrNull(input.release_address_no, 32),
        refund_address_no: strOrNull(input.refund_address_no, 32),
        delivery_fee_type: strOrNull(input.delivery_fee_type, 32) || DEFAULTS.delivery_fee_type,
        delivery_fee: intOrNull(input.delivery_fee),
        free_threshold: intOrNull(input.free_threshold),
        return_delivery_fee: intOrNull(input.return_delivery_fee),
        exchange_delivery_fee: intOrNull(input.exchange_delivery_fee),
        delivery_company: strOrNull(input.delivery_company, 32),
        as_telephone: strOrNull(input.as_telephone, 50),
        as_guide_content: strOrNull(input.as_guide_content, 500),
        origin_area_code: strOrNull(input.origin_area_code, 32),
        origin_area_content: strOrNull(input.origin_area_content, 100),
        minor_purchasable: input.minor_purchasable === '0' || input.minor_purchasable === 0 ? 0 : 1,
        naver_shopping_registration:
            input.naver_shopping_registration === '0' || input.naver_shopping_registration === 0 ? 0 : 1,
        channel_display_status: strOrNull(input.channel_display_status, 32) || DEFAULTS.channel_display_status,
        notice_type: strOrNull(input.notice_type, 64),
        notice_defaults_json: notice ? JSON.stringify(notice) : null,
    };

    const cols = Object.keys(row);
    const updates = cols.filter((c) => c !== 'mall_id').map((c) => `${c} = VALUES(${c})`);
    await pool.query(
        `INSERT INTO naver_publish_profile (${cols.join(', ')})
         VALUES (${cols.map(() => '?').join(', ')})
         ON DUPLICATE KEY UPDATE ${updates.join(', ')}`,
        cols.map((c) => row[c])
    );
    return getProfile(mallId);
}

/**
 * 등록 가능한 상태인지 검사. 부족한 항목의 **라벨** 목록을 돌려준다.
 * 빈 배열이면 통과.
 */
function validateProfile(profile) {
    const missing = [];
    for (const f of REQUIRED_FIELDS) {
        const v = profile ? profile[f.key] : null;
        if (v == null || v === '') missing.push(f.label);
    }
    return missing;
}

module.exports = { getProfile, saveProfile, validateProfile, REQUIRED_FIELDS, DEFAULTS };
