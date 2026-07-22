const pool = require('../../config/db');
const taxonomyResolver = require('./taxonomyResolver');
const { GLOBAL_CATEGORY_MALL_ID } = require('./categoryScope');

/*
 * 카테고리·브랜드 일괄 매핑 (상품 관리 목록의 [카테고리 매핑처리] / [브랜드 매핑처리])
 *
 * 임포트로 들어온 상품은 카테고리·브랜드가 비어 있는 경우가 많다. 그 상태로는
 * 고객 GNB·브랜드관에서 사라지므로 운영이 화면에서 직접 채워야 하는데, 수천 건을
 * 한 건씩 수정하는 것은 현실적이지 않다. 그래서 "선택한 상품"에 대해 근거 필드로
 * 자동 매핑한다.
 *
 *   브랜드  = 판매사(products.provider). 기존 브랜드에 매칭되지 않으면 **신규 생성**한다
 *            (브랜드는 이름이 곧 정체성이라 자동 생성해도 의미가 흐려지지 않는다).
 *   카테고리 = **기존 카테고리에만** 매핑한다. 자동 생성하지 않는다 — 카테고리는 계층·
 *            노출·필터(facet)가 얽혀 있어 자동 생성분이 쌓이면 트리가 망가진다.
 *            매핑 근거가 없으면 실패로 보고하고 "카테고리 관리에서 매핑" 을 안내한다.
 *
 * 두 함수 모두 이미 값이 있는 상품은 건드리지 않는다(skipped). 즉 "미설정 필터로 거른 뒤
 * 전체 선택 → 매핑" 이 정상 흐름이지만, 섞여 선택돼도 기존 값을 덮어쓰지 않는다.
 */

/** 한 번에 처리할 상품 수 상한. 브랜드 신규 생성이 섞이면 건당 쿼리가 여러 번 나가므로
 *  요청 하나가 커넥션 풀을 오래 붙잡지 않도록 자른다. */
const MAX_BULK = 500;

/** 자동 매핑 후보에서 제외할 카테고리 이름 — 폴백 바구니라 매핑 대상이 아니다. */
const EXCLUDED_CATEGORY_NAMES = new Set([taxonomyResolver.UNCATEGORIZED_NAME]);

/** 요청으로 들어온 id 배열을 정수 배열로 정규화(중복·잘못된 값 제거). */
function normalizeIds(raw) {
    const list = Array.isArray(raw) ? raw : (raw == null || raw === '' ? [] : [raw]);
    const seen = new Set();
    for (const v of list) {
        const n = Number(v);
        if (Number.isInteger(n) && n > 0) seen.add(n);
    }
    return [...seen];
}

/** 선택된 상품 중 이 몰의 기본상품만 읽는다(크로스몰 조작 차단). */
async function loadProducts(mallId, ids) {
    const [rows] = await pool.query(
        `SELECT id, name, provider, category_id, brand_category_id, naver_category_id
           FROM products
          WHERE id IN (?) AND mall_id = ? AND product_type IN ('SINGLE','OPTION')`,
        [ids, mallId]
    );
    return rows;
}

/**
 * 브랜드 일괄 매핑 — 판매사(provider) 를 브랜드로 삼는다. 없으면 신규 생성.
 *
 * @param {{mallId:number, productIds:Array<number|string>}} o
 * @returns {Promise<{total:number, mapped:Array, created:string[], skipped:number, failed:Array, truncated:boolean}>}
 */
async function mapBrands({ mallId, productIds }) {
    const all = normalizeIds(productIds);
    const ids = all.slice(0, MAX_BULK);
    const result = { total: all.length, mapped: [], created: [], skipped: 0, failed: [], truncated: all.length > ids.length };
    if (!ids.length) return result;

    const products = await loadProducts(mallId, ids);
    // 같은 판매사가 수백 건 반복되므로 유사매칭 결과를 캐시한다(전수 스캔 쿼리를 아낀다).
    const cache = new Map();

    for (const p of products) {
        if (p.brand_category_id) { result.skipped++; continue; }

        const provider = String(p.provider || '').trim();
        if (!provider) {
            result.failed.push({ id: p.id, name: p.name, reason: '판매사(브랜드)가 비어 있어 매핑 근거가 없습니다. 상품 수정에서 판매사를 입력하세요.' });
            continue;
        }

        const key = taxonomyResolver.normalizeName(provider);
        let hit = cache.get(key);
        if (!hit) {
            hit = await taxonomyResolver.resolveOrCreateBrand({ mallId, name: provider });
            cache.set(key, hit);
            if (hit && hit.id && hit.created) result.created.push(hit.name);
        }
        if (!hit || !hit.id) {
            result.failed.push({ id: p.id, name: p.name, reason: `브랜드 「${provider}」 를 만들지 못했습니다.` });
            continue;
        }

        await pool.query('UPDATE products SET brand_category_id = ? WHERE id = ? AND mall_id = ?', [hit.id, p.id, mallId]);
        result.mapped.push({ id: p.id, name: p.name, target: hit.name, via: hit.created ? 'created' : 'match' });
    }
    return result;
}

/** 기존 NORMAL 카테고리 목록 + 정규화 이름 인덱스. 자동 생성이 없으므로 후보는 이게 전부다. */
async function loadCategoryIndex() {
    const [rows] = await pool.query(
        `SELECT id, name, depth FROM categories
          WHERE type = 'NORMAL' AND mall_id = ? AND is_active = 1`,
        [GLOBAL_CATEGORY_MALL_ID]
    );
    const list = [];
    const byNorm = new Map();
    for (const r of rows) {
        if (EXCLUDED_CATEGORY_NAMES.has(r.name)) continue;
        const norm = taxonomyResolver.normalizeName(r.name);
        if (norm.length < 2) continue;   // 1글자 이름은 상품명 어디에나 걸려 오매핑을 만든다
        list.push({ ...r, norm });
        // 동명이인은 더 깊은(구체적인) 노드를 남긴다.
        const prev = byNorm.get(norm);
        if (!prev || (r.depth || 1) > (prev.depth || 1)) byNorm.set(norm, r);
    }
    return { list, byNorm };
}

/** 네이버 카테고리 전체경로("대>중>소>세")의 리프부터 거슬러 올라가며 기존 카테고리와 이름이 일치하는 노드를 찾는다. */
async function matchByNaverPath(naverCategoryId, byNorm) {
    const [rows] = await pool.query(
        'SELECT whole_category_name FROM naver_category WHERE naver_category_id = ? LIMIT 1',
        [String(naverCategoryId)]
    );
    if (!rows.length) return null;
    const segs = String(rows[0].whole_category_name || '').split('>').map((s) => s.trim()).filter(Boolean);
    for (let i = segs.length - 1; i >= 0; i--) {
        const hit = byNorm.get(taxonomyResolver.normalizeName(segs[i]));
        if (hit) return hit;
    }
    return null;
}

/** 상품명에 포함된 기존 카테고리 이름 중 가장 긴 것. ("유기농 홍삼정 스틱" → "홍삼정") */
function matchByProductName(productName, list) {
    const target = taxonomyResolver.normalizeName(productName);
    if (target.length < 2) return null;
    let best = null;
    for (const c of list) {
        if (!target.includes(c.norm)) continue;
        if (!best || c.norm.length > best.norm.length || (c.norm.length === best.norm.length && (c.depth || 1) > (best.depth || 1))) best = c;
    }
    return best;
}

/**
 * 카테고리 일괄 매핑 — **기존 카테고리에만** 붙인다(신규 생성 없음).
 *
 * 판정 순서
 *   1) 네이버 카테고리 ID → 카테고리 관리에서 매핑해 둔 우리 노드(categories.naver_category_id)
 *   2) 네이버 전체경로의 이름이 기존 카테고리와 일치하는 가장 깊은 노드
 *   3) 상품명에 포함된 기존 카테고리 이름(가장 긴 것)
 *   실패 → 카테고리 관리에서 매핑하도록 안내한다.
 *
 * @param {{mallId:number, productIds:Array<number|string>}} o
 * @returns {Promise<{total:number, mapped:Array, skipped:number, failed:Array, truncated:boolean}>}
 */
async function mapCategories({ mallId, productIds }) {
    const all = normalizeIds(productIds);
    const ids = all.slice(0, MAX_BULK);
    const result = { total: all.length, mapped: [], skipped: 0, failed: [], truncated: all.length > ids.length };
    if (!ids.length) return result;

    const [products, index] = await Promise.all([loadProducts(mallId, ids), loadCategoryIndex()]);

    for (const p of products) {
        if (p.category_id) { result.skipped++; continue; }

        let hit = null;
        let via = null;

        if (p.naver_category_id) {
            const direct = await taxonomyResolver.resolveByNaverCategoryId({ naverCategoryId: p.naver_category_id });
            if (direct && direct.id) { hit = direct; via = 'naver'; }
            if (!hit) {
                const byPath = await matchByNaverPath(p.naver_category_id, index.byNorm);
                if (byPath) { hit = byPath; via = 'naver-path'; }
            }
        }
        if (!hit) {
            const byName = matchByProductName(p.name, index.list);
            if (byName) { hit = byName; via = 'name'; }
        }

        if (!hit) {
            result.failed.push({
                id: p.id,
                name: p.name,
                reason: p.naver_category_id
                    ? `네이버 카테고리(${p.naver_category_id})에 대응하는 카테고리가 없습니다. 카테고리 관리 > 해당 카테고리 상세에서 네이버 카테고리를 매핑한 뒤 다시 실행하세요.`
                    : '매핑할 만한 기존 카테고리를 찾지 못했습니다. 카테고리 관리에서 카테고리를 만들고 매핑하거나, 상품 수정에서 직접 지정하세요.',
            });
            continue;
        }

        await pool.query('UPDATE products SET category_id = ? WHERE id = ? AND mall_id = ?', [hit.id, p.id, mallId]);
        result.mapped.push({ id: p.id, name: p.name, target: hit.name, via });
    }
    return result;
}

module.exports = {
    mapBrands,
    mapCategories,
    MAX_BULK,
    // 테스트용
    normalizeIds,
    matchByProductName,
};
