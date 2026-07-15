const pool = require('../../config/db');
const depthGuard = require('../tree/depthGuard');
const { toChosung, toInitial } = require('../../shared/hangul');

/*
 * 카테고리·브랜드 자동 선별/생성 엔진 (Standard 트랙 — AI 불필요)
 *
 * 설계: docs/사이트개선/product_easy_registration_design_and_development.md §2
 *
 * 상품 등록 시 브랜드/카테고리를 "자유 텍스트"로만 받아도, 이 서비스가
 *   ① 정규화 → ② 유사 항목 검색 → ③ 임계값 이상이면 기존에 매핑, 아니면 신규 생성
 * 한다. 브랜드와 카테고리는 같은 categories 테이블(type 분기)이라 로직을 공유한다.
 *
 * AI(Premium)는 "근거 텍스트를 만들어 내는 입력층"에만 얹히며, 여기(처리층)는
 * 등급과 무관하게 한 벌이다. 즉 이 파일은 AI 없이 100% 동작한다.
 *
 * 무결성: 신규 생성은 반드시 depthGuard 를 경유한다(카테고리 생성 정본
 * categoryController.postAdd 와 동일한 가드). 여기서는 항상 최상위(parent_id=NULL,
 * depth=1)로 만든다 — 자동 생성 항목을 임의 계층에 끼워 넣지 않는다.
 */

const DEFAULT_THRESHOLD = 0.85;

/** 자동 분류 폴백 바구니 이름. 근거 텍스트가 전혀 없어 매핑/생성할 수 없는 상품이
 *  category_id=null 로 남아 목록·검색에서 사라지는 것을 막는 안전망(§4·§B-1).
 *  고객 GNB 에는 숨기고(pc/mobile_visible=0) 관리자 목록에만 노출한다. */
const UNCATEGORIZED_NAME = '미분류';

/** 유사도 임계값 — 이 값 이상이면 "같은 것"으로 보고 기존에 매핑, 미만이면 신규 생성.
 *  몰별 조정은 system_settings → process.env.TAXONOMY_MATCH_THRESHOLD 로 오버라이드. */
function matchThreshold() {
    const v = Number(process.env.TAXONOMY_MATCH_THRESHOLD);
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : DEFAULT_THRESHOLD;
}

/** 매칭용 정규화 — 대소문자·공백·괄호·구분기호를 걷어낸 비교 키. */
function normalizeName(s) {
    return String(s == null ? '' : s)
        .toLowerCase()
        .replace(/[\s()[\]{}·・_\-/\\.,'"`~!@#$%^&*+=|:;?<>]+/g, '')
        .trim();
}

/** 두 문자열의 편집거리(오타 흡수용). */
function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        prev = cur;
    }
    return prev[b.length];
}

/** 편집거리 → 0~1 유사도. */
function editRatio(a, b) {
    if (!a && !b) return 1;
    const maxLen = Math.max(a.length, b.length) || 1;
    return 1 - levenshtein(a, b) / maxLen;
}

/**
 * 후보 이름 하나와의 유사도 점수(0~1).
 *   1.00 정규화 후 완전일치
 *   0.85 한쪽이 다른 쪽을 포함(예: "나이키" ⊂ "나이키코리아")
 *   0.80 초성 완전일치 (LG / 엘지 류 X, 한글 오타/띄어쓰기 흡수용)
 *   0.70 초성 포함
 *   그 외 편집거리 비율
 */
function scoreNames(query, candidate) {
    const q = normalizeName(query);
    const c = normalizeName(candidate);
    if (!q || !c) return 0;
    if (q === c) return 1;
    if (q.length >= 2 && c.length >= 2 && (q.includes(c) || c.includes(q))) return 0.85;

    const qc = toChosung(query).toLowerCase();
    const cc = toChosung(candidate).toLowerCase();
    if (qc && cc) {
        if (qc === cc) return 0.8;
        if (qc.length >= 2 && cc.length >= 2 && (qc.includes(cc) || cc.includes(qc))) return 0.7;
    }
    return editRatio(q, c);
}

/** 여러 별칭(name, name_en, alias CSV) 중 최고 점수. */
function bestScoreAgainst(query, names) {
    let best = 0;
    for (const n of names) {
        if (!n) continue;
        const s = scoreNames(query, n);
        if (s > best) best = s;
    }
    return best;
}

/** 신규 카테고리/브랜드를 가드 경유해 최상위로 생성한다.
 *  pcVisible/mobileVisible 기본 1(노출). "미분류" 폴백만 0(고객 숨김)으로 만든다. */
async function createCategory({ mallId, name, type, conn = pool, pcVisible = 1, mobileVisible = 1 }) {
    // parentId=null → depth 1 (assertDepthAllowed 가 DB 조회 없이 1 반환)
    const depth = await depthGuard.assertDepthAllowed({ parentId: null, conn });

    const [[{ next_order }]] = await conn.query(
        'SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM categories WHERE type = ? AND mall_id = ?',
        [type, mallId]
    );

    const [result] = await conn.query(
        `INSERT INTO categories (mall_id, name, display_order, type, parent_id, depth, is_active, pc_visible, mobile_visible)
         VALUES (?, ?, ?, ?, NULL, ?, 1, ?, ?)`,
        [mallId, name, next_order, type, depth, pcVisible ? 1 : 0, mobileVisible ? 1 : 0]
    );
    const id = result.insertId;

    // 브랜드는 brand_profile 스텁을 함께 만들어 둔다 — 초성/영문 인덱스가 채워지면
    // 다음 유사매칭이 더 정확해지는 선순환. (편집 화면 진입 전이라도 검색·색인 가능)
    if (type === 'BRAND') {
        await conn.query(
            `INSERT IGNORE INTO brand_profile (category_id, mall_id, initial, initial_chosung)
             VALUES (?, ?, ?, ?)`,
            [id, mallId, toInitial(name), toChosung(name)]
        );
    }

    // Shopify 컬렉션 동기화(백그라운드) — 비활성 시 categorySync 가 스킵한다.
    try {
        const { syncCategoryById } = require('../shopify/categorySync');
        syncCategoryById(id).catch(() => {});
    } catch (_) { /* 모듈 미가용 시 무시 */ }

    return { id, name, created: true, score: 0 };
}

/**
 * 카테고리(type='NORMAL' 기본) 자동 선별/생성.
 *
 * @param {object}  o
 * @param {number}  o.mallId
 * @param {string}  o.name           브랜드/카테고리 후보 텍스트(자유 입력)
 * @param {string} [o.type='NORMAL'] 'NORMAL' | 'BRAND'
 * @param {boolean}[o.create=true]   false 면 매칭만(생성 안 함)
 * @param {object} [o.conn]          트랜잭션 커넥션(선택)
 * @returns {Promise<{id:number|null, name:string, created:boolean, score:number}|null>}
 *          name 이 비면 null. create=false 이고 매칭 실패면 {id:null,...}.
 */
async function resolveOrCreateCategory({ mallId, name, type = 'NORMAL', create = true, conn = pool }) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return null;

    const rows = type === 'BRAND'
        ? (await conn.query(
            `SELECT c.id, c.name, bp.name_en, bp.alias
               FROM categories c
               LEFT JOIN brand_profile bp ON bp.category_id = c.id
              WHERE c.type = 'BRAND' AND c.mall_id = ?`, [mallId]))[0]
        : (await conn.query(
            'SELECT id, name FROM categories WHERE type = ? AND mall_id = ?', [type, mallId]))[0];

    let best = { id: null, name: '', score: 0 };
    for (const r of rows) {
        const names = [r.name, r.name_en, ...String(r.alias || '').split(',')];
        const s = bestScoreAgainst(trimmed, names);
        if (s > best.score) best = { id: r.id, name: r.name, score: s };
    }

    if (best.id && best.score >= matchThreshold()) {
        return { id: best.id, name: best.name, created: false, score: best.score };
    }

    if (!create) return { id: null, name: trimmed, created: false, score: best.score };
    return await createCategory({ mallId, name: trimmed, type, conn });
}

/** 브랜드(type='BRAND') 자동 선별/생성 — resolveOrCreateCategory 의 브랜드 특화 래퍼. */
function resolveOrCreateBrand({ mallId, name, create = true, conn = pool }) {
    return resolveOrCreateCategory({ mallId, name, type: 'BRAND', create, conn });
}

/**
 * 이 몰의 "미분류" 카테고리 id 를 돌려준다. 없으면 만든다(멱등).
 *
 * 몰 프로비저닝 시 시드로도, 상품 등록 폴백으로도 쓰인다 — 어느 쪽이 먼저 부르든
 * 이름으로 찾아 재사용하므로 한 몰에 하나만 생긴다. 고객 GNB 에는 숨기고
 * (pc/mobile_visible=0) 관리자 목록에는 노출된다(관리자 getList 는 visible 필터 없음).
 *
 * @param {{ mallId:number, conn?:object }} o
 * @returns {Promise<number>} 미분류 카테고리 id
 */
async function getUncategorizedCategoryId({ mallId, conn = pool }) {
    const [[existing]] = await conn.query(
        "SELECT id FROM categories WHERE mall_id = ? AND type = 'NORMAL' AND name = ? LIMIT 1",
        [mallId, UNCATEGORIZED_NAME]
    );
    if (existing) return existing.id;

    const { id } = await createCategory({
        mallId, name: UNCATEGORIZED_NAME, type: 'NORMAL', conn,
        pcVisible: 0, mobileVisible: 0,
    });
    return id;
}

module.exports = {
    resolveOrCreateCategory,
    resolveOrCreateBrand,
    createCategory,
    getUncategorizedCategoryId,
    UNCATEGORIZED_NAME,
    // 테스트/조정용 export
    scoreNames,
    normalizeName,
    matchThreshold,
};
