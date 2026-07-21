/*
 * 네이버 리프 카테고리 → 고시 유형 매핑.
 * 설계: docs/사이트개선/네이버_스마트스토어_연동.md §6.5
 *
 * 왜 우리가 만들어야 하나:
 *   네이버는 **카테고리별 고시 유형을 알려주지 않는다.**
 *   `GET /v1/products-for-provided-notice?leafCategoryId=` 는 파라미터를 무시하고
 *   36종 전체를 그대로 돌려준다(2026-07-21 실호출 확인). 그래서 매핑은 우리 자산이다.
 *
 * 어떻게 만드나:
 *   리프가 4,999개라 사람이 하나씩 지정할 수 없다. 대신 `whole_category_name`
 *   (예: "식품>건강식품>홍삼>홍삼액")의 **상위 경로로 규칙을 걸어 일괄 배정**하고,
 *   틀린 것만 화면에서 개별 수정한다.
 *
 * ★ 사람이 고친 것(`notice_source='MANUAL'`)은 규칙 재적용에도 덮지 않는다.
 *   안 그러면 수집·재적용 때마다 손으로 고친 게 날아간다.
 */

const pool = require('../../../config/db');

/**
 * 경로 규칙. **위에서부터 먼저 맞는 것**이 이긴다(구체적인 것을 위에 둔다).
 * `test` 는 `whole_category_name` 전체에 대해 평가한다.
 *
 * 근거: 네이버 고시 상품군명과 카테고리 대분류명이 대체로 대응한다.
 * 확신이 없으면 규칙을 만들지 말고 비워 둔다 — 틀린 고시로 등록되는 것보다
 * "미지정"으로 남아 사람이 지정하는 편이 낫다.
 */
const RULES = [
    // --- 식품: 건강기능식품이 먼저다("식품>건강식품" 이 "식품" 규칙에 먹히면 안 된다) ---
    { type: 'DIET_FOOD', test: /^식품>건강식품/ },
    { type: 'FOOD', test: /^식품>(농산물|축산물|수산물|쌀|잡곡|과일|채소)/ },
    { type: 'GENERAL_FOOD', test: /^식품/ },

    // --- 패션 ---
    // ★ 대분류가 무엇이든 "옷"이면 의류 고시다(스포츠>등산의류, 유아>아동의류 등).
    //   대분류 규칙(SPORTS_EQUIPMENT 등)보다 **먼저** 걸러야 한다.
    { type: 'WEAR', test: /(의류|수영복|이너웨어|언더웨어)(>|$)/ },
    { type: 'SHOES', test: /^(패션잡화>)?(신발|구두)|>신발(>|$)/ },
    { type: 'BAG', test: /^패션잡화>가방|>가방(>|$)/ },
    { type: 'WEAR', test: /^패션의류/ },
    { type: 'JEWELLERY', test: /^패션잡화>(주얼리|시계)|귀금속|보석/ },
    { type: 'FASHION_ITEMS', test: /^패션잡화/ },

    // --- 화장품·생활 ---
    { type: 'COSMETIC', test: /^화장품\/미용/ },
    { type: 'BIOCHEMISTRY', test: /생활화학|세제|방향제|탈취제/ },
    { type: 'BIOCIDAL', test: /살균제|살충제|방충제/ },

    // --- 가구·주방 ---
    { type: 'KITCHEN_UTENSILS', test: /^생활\/건강>주방|주방용품/ },
    { type: 'SLEEPING_GEAR', test: /침구|커튼/ },
    { type: 'FURNITURE', test: /^가구\/인테리어/ },

    // --- 가전 ---
    { type: 'IMAGE_APPLIANCES', test: /^디지털\/가전>TV|영상가전/ },
    { type: 'SEASON_APPLIANCES', test: /계절가전|에어컨|온풍기/ },
    { type: 'OFFICE_APPLIANCES', test: /^디지털\/가전>(노트북|PC|컴퓨터|주변기기|프린터)/ },
    { type: 'OPTICS_APPLIANCES', test: /^디지털\/가전>카메라|캠코더/ },
    { type: 'CELLPHONE', test: /휴대폰|태블릿|스마트폰/ },
    { type: 'NAVIGATION', test: /내비게이션/ },
    { type: 'MICROELECTRONICS', test: /^디지털\/가전>(음향가전|MP3)/ },
    { type: 'HOME_APPLIANCES', test: /^디지털\/가전/ },

    // --- 생활/건강 하위 (미매칭이 가장 많이 몰리는 대분류라 따로 갈라 준다) ---
    { type: 'CAR_ARTICLES', test: /^생활\/건강>(자동차용품|자동차|계약금자동차)/ },
    { type: 'MEDICAL_APPLIANCES', test: /^생활\/건강>(건강측정용품|물리치료\/저주파용품|재활운동용품|당뇨관리용품|안마용품|눈건강용품|냉온\/찜질용품|좌욕\/좌훈용품)/ },
    { type: 'DIGITAL_CONTENTS', test: /^생활\/건강>(DVD|블루레이|음반)/ },
    // 문구·공구·반려동물·욕실 등 "그 밖의 재화"는 네이버도 ETC 로 받는다.
    { type: 'ETC', test: /^생활\/건강>/ },
    // 여행·레슨·서비스는 재화가 아니라 용역이다.
    { type: 'ETC_SERVICE', test: /^여가\/생활편의>/ },

    // --- 기타 품목군 ---
    { type: 'CAR_ARTICLES', test: /^자동차/ },
    { type: 'MEDICAL_APPLIANCES', test: /의료기기|의료용품/ },
    { type: 'KIDS', test: /^출산\/육아/ },
    { type: 'MUSICAL_INSTRUMENT', test: /악기/ },
    { type: 'SPORTS_EQUIPMENT', test: /^스포츠\/레저/ },
    { type: 'BOOKS', test: /^도서/ },
    { type: 'DIGITAL_CONTENTS', test: /^(생활\/건강>)?(음원|게임|e북|인터넷강의)/ },
    { type: 'GIFT_CARD', test: /상품권/ },
    { type: 'MOBILE_COUPON', test: /모바일쿠폰/ },
    { type: 'MOVIE_SHOW', test: /영화|공연/ },
];

/** 경로 하나에 대한 규칙 판정. 맞는 규칙이 없으면 null(=미지정으로 남긴다). */
function typeForPath(wholeCategoryName) {
    const path = String(wholeCategoryName || '');
    if (!path) return null;
    for (const r of RULES) {
        if (r.test.test(path)) return r.type;
    }
    return null;
}

/**
 * 규칙을 전체 리프에 적용한다(쓰기 없이 미리 세려면 dryRun).
 *
 * - 대상은 **리프만**. 네이버는 리프에만 상품을 등록한다.
 * - `notice_source='MANUAL'` 은 건너뛴다(사람이 고친 값 보호).
 */
async function applyRules({ dryRun = false } = {}) {
    const [rows] = await pool.query(
        `SELECT naver_category_id, whole_category_name, notice_type, notice_source
           FROM naver_category
          WHERE is_leaf = 1 AND is_active = 1`
    );

    let matched = 0;
    let unmatched = 0;
    let kept = 0;
    const updates = [];

    for (const r of rows) {
        if (r.notice_source === 'MANUAL') { kept += 1; continue; }
        const t = typeForPath(r.whole_category_name);
        if (!t) { unmatched += 1; continue; }
        matched += 1;
        if (r.notice_type !== t) updates.push([t, r.naver_category_id]);
    }

    if (!dryRun && updates.length) {
        for (let i = 0; i < updates.length; i += 500) {
            const chunk = updates.slice(i, i + 500);
            // CASE 문 한 방으로 묶으면 왕복이 줄어든다.
            const ids = chunk.map(([, id]) => id);
            const cases = chunk.map(() => 'WHEN ? THEN ?').join(' ');
            const params = [];
            chunk.forEach(([t, id]) => params.push(id, t));
            await pool.query(
                `UPDATE naver_category
                    SET notice_type = CASE naver_category_id ${cases} END,
                        notice_source = 'RULE'
                  WHERE naver_category_id IN (${ids.map(() => '?').join(',')})`,
                [...params, ...ids]
            );
        }
    }

    return { leafTotal: rows.length, matched, unmatched, manualKept: kept, changed: updates.length };
}

/** 리프 하나에 사람이 직접 지정. 규칙 재적용에도 보존된다. */
async function setManual(naverCategoryId, noticeType) {
    const id = String(naverCategoryId || '').trim();
    if (!id) throw new Error('네이버 카테고리를 선택하세요.');

    const type = String(noticeType || '').trim();
    if (type) {
        const [ok] = await pool.query(
            'SELECT notice_type FROM naver_notice_schema WHERE notice_type = ? LIMIT 1', [type]
        );
        if (!ok.length) throw new Error(`알 수 없는 고시 유형입니다: ${type}`);
    }

    const [r] = await pool.query(
        `UPDATE naver_category
            SET notice_type = ?, notice_source = ?
          WHERE naver_category_id = ?`,
        [type || null, type ? 'MANUAL' : 'RULE', id]
    );
    if (!r.affectedRows) throw new Error(`수집된 네이버 카테고리가 아닙니다: ${id}`);
    return { naverCategoryId: id, noticeType: type || null };
}

/** 적용 현황 — 화면 카드용. */
async function stats() {
    const [[r]] = await pool.query(
        `SELECT
            COUNT(*) AS leaf_total,
            SUM(notice_type IS NOT NULL) AS assigned,
            SUM(notice_source = 'MANUAL') AS manual_count
           FROM naver_category
          WHERE is_leaf = 1 AND is_active = 1`
    );
    return {
        leafTotal: Number(r.leaf_total || 0),
        assigned: Number(r.assigned || 0),
        unassigned: Number(r.leaf_total || 0) - Number(r.assigned || 0),
        manual: Number(r.manual_count || 0),
    };
}

/**
 * 상품 등록 시 쓸 고시 유형·기본값을 고른다.
 *
 * 우선순위: 리프 카테고리에 지정된 유형 → 없으면 몰 프로필의 유형(폴백).
 * 값은 그 유형의 몰 기본값(`mall_notice_default`)을 쓰고, 없으면 프로필의 값을 쓴다.
 *
 * @returns {Promise<{notice_type:string, notice:object}|null>} buildNotice 의 override
 */
async function resolveForProduct(mallId, naverCategoryId, profile) {
    let type = null;

    if (naverCategoryId) {
        const [rows] = await pool.query(
            'SELECT notice_type FROM naver_category WHERE naver_category_id = ? LIMIT 1',
            [String(naverCategoryId)]
        );
        if (rows.length && rows[0].notice_type) type = rows[0].notice_type;
    }
    if (!type) type = (profile && profile.notice_type) || null;
    if (!type) return null;

    const [vals] = await pool.query(
        'SELECT values_json FROM mall_notice_default WHERE mall_id = ? AND notice_type = ? LIMIT 1',
        [mallId, type]
    );
    let notice = null;
    if (vals.length) {
        notice = typeof vals[0].values_json === 'string'
            ? JSON.parse(vals[0].values_json) : vals[0].values_json;
    } else if (profile && profile.notice_type === type) {
        // 유형별 기본값이 아직 없으면 프로필 값을 그대로 쓴다(같은 유형일 때만).
        notice = profile.notice_defaults_json || null;
    }

    return { notice_type: type, notice: notice || {} };
}

/** 몰의 유형별 기본값 저장 — 값 조립은 서버가 한다(사용자는 JSON 을 보지 않는다). */
async function saveDefaults(mallId, noticeType, values) {
    if (!noticeType) throw new Error('고시 유형을 선택하세요.');
    await pool.query(
        `INSERT INTO mall_notice_default (mall_id, notice_type, values_json)
         VALUES (?, ?, CAST(? AS JSON))
         ON DUPLICATE KEY UPDATE values_json = VALUES(values_json)`,
        [mallId, noticeType, JSON.stringify(values || {})]
    );
}

/** 몰에 저장된 유형별 기본값 목록. */
async function listDefaults(mallId) {
    const [rows] = await pool.query(
        'SELECT notice_type, values_json FROM mall_notice_default WHERE mall_id = ?',
        [mallId]
    );
    return rows.map((r) => ({
        notice_type: r.notice_type,
        values: typeof r.values_json === 'string' ? JSON.parse(r.values_json) : r.values_json,
    }));
}

module.exports = {
    RULES, typeForPath, applyRules, setManual, stats,
    resolveForProduct, saveDefaults, listDefaults,
};
