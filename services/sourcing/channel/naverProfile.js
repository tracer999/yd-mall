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
const noticeSchema = require('./naverNoticeSchema');

/** 이 값이 없으면 상품 등록 자체가 불가능한 항목. 화면·서비스가 같은 목록을 본다. */
const REQUIRED_FIELDS = [
    { key: 'as_telephone', label: 'A/S 전화번호' },
    { key: 'as_guide_content', label: 'A/S 안내' },
    { key: 'origin_area_code', label: '원산지 코드' },
    { key: 'return_delivery_fee', label: '반품 배송비' },
    { key: 'exchange_delivery_fee', label: '교환 배송비' },
];

/**
 * 네이버 택배사 코드 — 상품에 표기되는 **기본 배송정보**용이다.
 * 실제 출고 시 송장에 쓰는 택배사는 주문별로 따로 지정하며 이 값과 달라도 된다.
 * 국내 배송에 실제로 쓰이는 것만 추린다(전체 목록을 그대로 노출하면 고르기 어렵다).
 */
const DELIVERY_COMPANIES = [
    { code: 'CJGLS', name: 'CJ대한통운' },
    { code: 'HANJIN', name: '한진택배' },
    { code: 'HYUNDAI', name: '롯데택배' },
    { code: 'EPOST', name: '우체국택배' },
    { code: 'LOGEN', name: '로젠택배' },
    { code: 'KGB', name: '로지스밸리(KGB)' },
    { code: 'CVSNET', name: 'GS Postbox 택배' },
    { code: 'KDEXP', name: '경동택배' },
    { code: 'DAESIN', name: '대신택배' },
    { code: 'CHUNIL', name: '천일택배' },
    { code: 'ILYANG', name: '일양로지스' },
    { code: 'KUNYOUNG', name: '건영택배' },
];

const DEFAULTS = {
    delivery_fee_type: 'PAID',
    minor_purchasable: 1,
    naver_shopping_registration: 1,
    channel_display_status: 'ON',
};

/**
 * 몰의 다른 설정에서 끌어올 수 있는 값. 관리자가 같은 내용을 두 번 적지 않게 한다.
 *
 * ★ "행이 없을 때만" 적용하면 안 된다. 프로필을 한 번이라도 저장하면 빈 칸이 NULL 로
 *   굳어 자동 채움이 영영 멈춘다. 그래서 **저장된 행에도 빈 필드에는 항상 적용**한다.
 *   (사용자가 값을 적으면 그 값이 이긴다 — 덮어쓰지 않는다.)
 *
 * 자동 채움의 경계: 여기 있는 것만 자동이다. 원산지 코드·출고지/반품지 주소록 번호는
 * 우리 몰에 대응 개념이 없고 조회 API 도 아직 미확인이라(§12 #2·#6) **자동으로 지어내지 않는다.**
 */
async function inheritedDefaults(mallId) {
    const [[ss], [sp]] = await Promise.all([
        pool.query(
            'SELECT contact_phone, cs_hours FROM site_settings WHERE mall_id = ? LIMIT 1',
            [mallId]
        ),
        pool.query(
            'SELECT base_fee, free_threshold FROM shipping_policy WHERE mall_id = ? LIMIT 1',
            [mallId]
        ),
    ]);
    const site = ss[0] || {};
    const ship = sp[0] || {};

    return {
        as_telephone: site.contact_phone || null,
        // 개행이 섞인 운영시간을 한 줄 안내로 다듬는다.
        as_guide_content: site.cs_hours
            ? String(site.cs_hours).replace(/\s*\\n\s*|\s*\n\s*/g, ' / ').trim()
            : null,
        delivery_fee: ship.base_fee == null ? null : ship.base_fee,
        free_threshold: ship.free_threshold == null ? null : ship.free_threshold,
    };
}

/** 자동 채움이 실제로 쓰인 필드명 — 화면에서 "사이트 설정에서 가져옴" 배지를 띄운다. */
function applyInherited(profile, inherited) {
    const filled = [];
    for (const [k, v] of Object.entries(inherited)) {
        if (v == null || v === '') continue;
        if (profile[k] == null || profile[k] === '') {
            profile[k] = v;
            filled.push(k);
        }
    }
    profile._inherited = filled;
    return profile;
}

/**
 * 몰의 프로필을 읽는다. 행이 없으면 기본값을 돌려준다(행을 만들지는 않는다 — 저장 시점에 만든다).
 * 행이 있든 없든 빈 필드는 몰 사이트설정·배송정책에서 채워 준다.
 */
async function getProfile(mallId) {
    const [rows] = await pool.query(
        'SELECT * FROM naver_publish_profile WHERE mall_id = ? LIMIT 1',
        [mallId]
    );
    const inherited = await inheritedDefaults(mallId);

    if (rows.length) {
        const r = rows[0];
        // JSON 컬럼은 드라이버가 객체로 주기도, 문자열로 주기도 한다.
        if (typeof r.notice_defaults_json === 'string') {
            try { r.notice_defaults_json = JSON.parse(r.notice_defaults_json); } catch (e) { r.notice_defaults_json = null; }
        }
        return applyInherited(r, inherited);
    }

    return applyInherited({
        mall_id: mallId,
        ...DEFAULTS,
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
    }, inherited);
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

/**
 * 프로필 저장(업서트). 화면 폼에서 온 문자열을 여기서 정규화한다.
 *
 * 고시정보는 관리자가 JSON 을 적는 게 아니라 **상품군 스키마로 그려진 일반 입력폼**
 * (`notice[필드명]`)으로 들어온다. JSON 조립은 여기서 코드가 한다.
 */
async function saveProfile(mallId, input = {}) {
    const noticeType = strOrNull(input.notice_type, 64);
    const schema = await noticeSchema.getSchema(noticeType);
    // 스키마에 정의된 필드만 남긴다 — 폼 조작으로 엉뚱한 키가 섞이지 않게.
    const noticeValues = noticeSchema.normalizeInput(schema, input.notice || {});
    const notice = Object.keys(noticeValues).length ? noticeValues : null;

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
        notice_type: noticeType,
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

module.exports = {
    getProfile, saveProfile, validateProfile,
    REQUIRED_FIELDS, DEFAULTS, DELIVERY_COMPANIES,
};
