/*
 * 상품정보제공고시 입력 스키마 카탈로그.
 * 설계: docs/사이트개선/네이버_스마트스토어_연동.md §6
 *
 * 왜 이 모듈이 있나:
 *   고시정보는 상품군 40종마다 필수 필드가 다르다. 예전에는 관리자가 JSON 을 직접
 *   textarea 에 적어야 했는데 그건 운영자가 할 수 있는 입력이 아니다.
 *   여기서 상품군별 **필드 목록**을 돌려주면 화면은 그걸 순회해 일반 입력폼을 그리고,
 *   서버가 값들을 모아 JSON 으로 조립한다. 즉 JSON 은 사람이 아니라 코드가 만든다.
 *
 * 불확실성 격리:
 *   네이버 실응답 형태는 IP 화이트리스트 때문에 개발서버에서만 확인된다. 그래서
 *   "네이버 응답 → 우리 내부 shape" 변환을 `normalizeNaverSchema()` 한 곳에 가둔다.
 *   화면·매퍼는 우리 shape 만 본다. 응답이 예상과 달라도 고칠 곳은 여기 하나다.
 *
 * 내부 shape:
 *   { notice_type, key_name, label, fields: [{name, label, type, required, maxLength}] }
 *   type = 'text' | 'textarea' | 'boolean'
 */

const pool = require('../../../config/db');
const naverProducts = require('./naverProducts');

/**
 * 모든 상품군이 공유하는 5필드. 비우면 네이버가 "상품상세 참조"로 저장하므로
 * 카탈로그의 fields_json 에는 넣지 않고 화면에서 따로 묶어 보여 준다(§6.3).
 */
const COMMON_FIELDS = [
    { name: 'returnCostReason', label: '반품/교환 비용 부담 사유', type: 'text' },
    { name: 'noRefundReason', label: '반품/교환 불가 사유', type: 'text' },
    { name: 'qualityAssuranceStandard', label: '품질보증기준', type: 'text' },
    { name: 'compensationProcedure', label: '소비자 피해보상 절차', type: 'text' },
    { name: 'troubleShootingContents', label: '분쟁처리 기준', type: 'text' },
];

function parseFields(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
        try { return JSON.parse(v); } catch (e) { return []; }
    }
    return [];
}

/** select 용 상품군 목록(필드까지 포함 — 화면이 전환 시 재조회 없이 그린다). */
async function listTypes() {
    const [rows] = await pool.query(
        `SELECT notice_type, key_name, label, fields_json, source
           FROM naver_notice_schema
          ORDER BY display_order, label`
    );
    return rows.map((r) => ({
        notice_type: r.notice_type,
        key_name: r.key_name,
        label: r.label,
        source: r.source,
        fields: parseFields(r.fields_json),
    }));
}

/** 상품군 하나의 스키마. 없으면 null. */
async function getSchema(noticeType) {
    if (!noticeType) return null;
    const [rows] = await pool.query(
        'SELECT notice_type, key_name, label, fields_json, source FROM naver_notice_schema WHERE notice_type = ? LIMIT 1',
        [noticeType]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
        notice_type: r.notice_type,
        key_name: r.key_name,
        label: r.label,
        source: r.source,
        fields: parseFields(r.fields_json),
    };
}

/**
 * 폼에서 온 `notice[...]` 값을 저장용 객체로 정규화한다.
 * - 스키마에 없는 키는 버린다(폼 조작으로 엉뚱한 필드가 섞이는 것 방지).
 * - boolean 은 네이버가 진짜 bool 을 요구하므로 문자열 '1'/'0' 을 변환한다.
 * - 빈 문자열은 넣지 않는다(공통 5필드는 매퍼가 "상품상세 참조"로 채운다).
 */
function normalizeInput(schema, input = {}) {
    const out = {};
    const defs = [...(schema ? schema.fields : []), ...COMMON_FIELDS];
    for (const f of defs) {
        const raw = input[f.name];
        if (raw == null) continue;
        if (f.type === 'boolean') {
            if (raw === '') continue;
            out[f.name] = raw === '1' || raw === 1 || raw === true || raw === 'true';
            continue;
        }
        const s = String(raw).trim();
        if (s) out[f.name] = s;
    }
    return out;
}

/** 필수 필드 중 비어 있는 것의 라벨 목록. 화면 경고용(전송 전 차단은 매퍼가 한다). */
function missingRequired(schema, values = {}) {
    if (!schema) return [];
    return schema.fields
        .filter((f) => f.required && (values[f.name] == null || values[f.name] === ''))
        .map((f) => f.label);
}

// ---------------------------------------------------------------------------
// 네이버 수집 — 개발서버(허용 IP)에서만 200 이 온다.
// ---------------------------------------------------------------------------

/**
 * 네이버 `fieldType` → 화면 입력 위젯.
 * 실응답에서 확인된 값은 String · Boolean · LocalDate · YearMonth · Integer · Long 6종이다.
 * 긴 String 은 한 줄 input 으로 받기 어려워 textarea 로 넘긴다.
 */
function widgetOf(fieldType, maxLength) {
    switch (String(fieldType)) {
        case 'Boolean': return 'boolean';
        case 'LocalDate': return 'date';
        case 'YearMonth': return 'month';
        case 'Integer':
        case 'Long': return 'number';
        default: return Number(maxLength) >= 500 ? 'textarea' : 'text';
    }
}

/**
 * 네이버 응답 한 건 → 우리 내부 shape. **불확실성은 이 함수 하나에만 가둔다.**
 *
 * 실응답 (2026-07-21 실호출로 확인):
 *   { productInfoProvidedNoticeType, productInfoProvidedNoticeTypeName,
 *     productInfoProvidedNoticeContents: [
 *       { fieldType, fieldName, fieldDescription, fieldAddDescription?, fieldMaxLength? } ] }
 *
 * ⚠ **응답에 "필수 여부"가 없다.** 그래서 `required` 는 네이버에서 알 수 없고,
 *   시드(문서 근거)에 표시해 둔 것을 `syncFromNaver` 가 병합해 살린다.
 */
function normalizeNaverSchema(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const type = raw.productInfoProvidedNoticeType || raw.type || raw.code || raw.noticeType;
    if (!type) return null;

    const rawFields = raw.productInfoProvidedNoticeContents || raw.fields || raw.contents || [];
    const fields = (Array.isArray(rawFields) ? rawFields : []).map((f) => {
        const name = f.fieldName || f.name || f.key;
        const label = f.fieldDescription || f.description || f.label || name;
        const maxLength = Number(f.fieldMaxLength) || undefined;
        return {
            name,
            label,
            type: widgetOf(f.fieldType, maxLength),
            required: false,                       // 네이버가 알려주지 않는다 — 시드에서 병합.
            maxLength,
            hint: f.fieldAddDescription || undefined,
        };
    }).filter((f) => f.name);

    return {
        notice_type: type,
        // 페이로드 하위 객체 키(camelCase)는 응답에 없다 — 매퍼의 표를 쓴다.
        key_name: null,
        label: raw.productInfoProvidedNoticeTypeName || raw.name || type,
        fields,
    };
}

/**
 * 상품군 스키마를 네이버에서 수집해 카탈로그를 갱신한다.
 *
 * ★ `GET /v1/products-for-provided-notice` **한 번**이면 36종 전체의 필드 목록까지 다 온다.
 *   상품군마다 상세를 다시 부를 필요가 없다(초기 구현은 37회를 불렀다 — 낭비였다).
 *   호출이 1회뿐이라 §3.4 의 스로틀·백오프가 사실상 필요 없다.
 *
 * ⚠ 네이버 IP 화이트리스트 — 등록되지 않은 곳에서는 403 GW.IP_NOT_ALLOWED 로 실패한다.
 */
async function syncFromNaver(credential) {
    const { NOTICE_TYPE_TO_KEY } = require('./naverMapper');

    const listRes = await naverProducts.getProvidedNoticeTypes(credential);
    const list = Array.isArray(listRes)
        ? listRes
        : (listRes && (listRes.contents || listRes.data || listRes.list)) || [];

    // 시드에 표시해 둔 필수 여부를 살린다 — 네이버 응답에는 그 정보가 없다.
    const prev = await listTypes();
    const requiredMap = new Map(
        prev.map((t) => [t.notice_type, new Set(t.fields.filter((f) => f.required).map((f) => f.name))])
    );

    let updated = 0;
    const skipped = [];

    for (const item of list) {
        const norm = normalizeNaverSchema(item);
        if (!norm || !norm.fields.length) {
            skipped.push(`${(item && item.productInfoProvidedNoticeType) || '?'}(필드 없음)`);
            continue;
        }
        const type = norm.notice_type;

        const keyName = NOTICE_TYPE_TO_KEY[type];
        if (!keyName) { skipped.push(`${type}(페이로드 하위 키 미상)`); continue; }

        const req = requiredMap.get(type);
        if (req) norm.fields.forEach((f) => { if (req.has(f.name)) f.required = true; });

        await pool.query(
            `INSERT INTO naver_notice_schema
                 (notice_type, key_name, label, fields_json, source, fetched_at)
             VALUES (?, ?, ?, CAST(? AS JSON), 'NAVER', NOW())
             ON DUPLICATE KEY UPDATE
                 key_name = VALUES(key_name), label = VALUES(label),
                 fields_json = VALUES(fields_json), source = 'NAVER', fetched_at = NOW()`,
            [type, keyName, norm.label, JSON.stringify(norm.fields)]
        );
        updated += 1;
    }

    return { total: list.length, updated, skipped };
}

module.exports = {
    COMMON_FIELDS,
    listTypes,
    getSchema,
    normalizeInput,
    missingRequired,
    normalizeNaverSchema,
    syncFromNaver,
};
