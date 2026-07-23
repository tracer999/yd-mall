/*
 * 상품 CSV 일괄 등록 · 수정
 *
 * ── 무엇을 다루고 무엇을 안 다루는가
 * **판매에 필요한 값**만 다룬다 — 이름·가격·재고·상태·분류·간단 설명.
 * 이미지·상세설명(HTML)·옵션·SKU 는 표로 다룰 수 있는 형태가 아니라서 제외한다.
 * 그것들은 상품 등록 화면에서 하나씩 손봐야 하고, 이 기능의 목적은
 * "수백 건의 가격·재고를 한 번에 고치는 것"이지 상품 상세를 통째로 만드는 것이 아니다.
 *
 * ── 등록과 수정을 한 파일로 받는다
 * `상품코드`(product_code)가 이 몰에 이미 있으면 **수정**, 없으면 **등록**이다.
 * 상품코드를 비우면 언제나 신규 등록이다. 운영자가 "등록용 파일"과 "수정용 파일"을
 * 따로 만들 필요가 없다 — 내려받아 고쳐서 그대로 올리면 그게 수정이다.
 *
 * ── 빈 칸은 "바꾸지 않음"이다
 * 수정에서 빈 칸을 NULL 로 덮으면, 가격만 고치려고 올린 파일이 설명·분류를 전부 지운다.
 * 그래서 값이 있는 칸만 반영한다. 일부러 비우려면 화면에서 지워야 한다.
 */

const csv = require('../export/csv');
const skuService = require('./skuService');

/*
 * 가격·재고를 바꿨으면 대표 SKU 도 맞춘다.
 * 재고 판정은 SKU 를 보기 때문에(sellableStock), products 만 고치면 화면에는 새 재고가
 * 뜨는데 실제로는 팔리지 않거나 그 반대가 된다. 옵션상품은 skuService 가 알아서 건너뛴다.
 */
async function syncSku(pool, productId) {
    try {
        const [[p]] = await pool.query('SELECT price, stock FROM products WHERE id = ?', [productId]);
        if (p) await skuService.syncDefaultSkuFromProduct(productId, { price: p.price, stock: p.stock });
    } catch (e) {
        console.error('[productBulk] SKU 동기화 실패 product=' + productId + ':', e.message);
    }
}

const STATUS_VALUES = ['ON', 'OFF', 'SOLD_OUT', 'COMING_SOON', 'RESTOCK'];
const STATUS_LABELS = {
    판매중: 'ON', 판매중지: 'OFF', 품절: 'SOLD_OUT', 입고예정: 'COMING_SOON', 재입고: 'RESTOCK',
};
const VISIBILITY_LABELS = { 공개: 'PUBLIC', 숨김: 'HIDDEN', 회원전용: 'MEMBER_ONLY' };
const TAX_LABELS = { 과세: 'TAXABLE', 면세: 'TAX_FREE', 영세: 'ZERO_RATED' };

/** 내려받기·올리기가 공유하는 열 정의. 순서가 곧 양식의 열 순서다. */
const COLUMNS = [
    { key: 'product_code', label: '상품코드', aliases: ['상품코드', 'product_code'] },
    { key: 'name', label: '상품명', aliases: ['상품명', 'name'] },
    { key: 'category_name', label: '카테고리', aliases: ['카테고리', 'category'] },
    { key: 'brand_name', label: '브랜드', aliases: ['브랜드', 'brand'] },
    { key: 'price', label: '판매가', aliases: ['판매가', 'price'] },
    { key: 'original_price', label: '정가', aliases: ['정가', 'original_price'] },
    { key: 'purchase_price', label: '매입가', aliases: ['매입가', 'purchase_price'] },
    { key: 'stock', label: '재고', aliases: ['재고', 'stock'] },
    { key: 'status', label: '판매상태', aliases: ['판매상태', 'status'] },
    { key: 'visibility', label: '노출', aliases: ['노출', 'visibility'] },
    { key: 'tax_type', label: '과세', aliases: ['과세', 'tax_type'] },
    { key: 'provider', label: '제조사', aliases: ['제조사', 'provider'] },
    { key: 'short_description', label: '간단설명', aliases: ['간단설명', 'short_description'] },
];

/** 사람이 적은 값을 enum 으로 맞춘다. 한글 라벨과 영문 코드를 모두 받는다. */
function toEnum(raw, labels, valid) {
    const s = String(raw || '').trim();
    if (!s) return null;
    if (labels[s]) return labels[s];
    const upper = s.toUpperCase();
    return valid.includes(upper) ? upper : null;
}

/** 숫자 칸 — 콤마·원 표시를 걷어낸다. 빈 칸은 null(=바꾸지 않음). */
function toInt(raw) {
    const s = String(raw == null ? '' : raw).replace(/[,\s원]/g, '');
    if (s === '') return null;
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) ? n : NaN;   // NaN 은 "형식 오류" 신호
}

/**
 * 현재 몰의 상품을 CSV 행으로 뽑는다(내려받기 = 수정 양식).
 */
async function exportRows(pool, mallId) {
    const [rows] = await pool.query(`
        SELECT p.product_code, p.name, p.price, p.original_price, p.purchase_price,
               p.stock, p.status, p.visibility, p.tax_type, p.provider, p.short_description,
               c.name AS category_name, b.name AS brand_name
          FROM products p
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN categories b ON b.id = p.brand_category_id
         WHERE p.mall_id = ?
         ORDER BY p.id DESC
    `, [mallId]);

    const revStatus = Object.fromEntries(Object.entries(STATUS_LABELS).map(([k, v]) => [v, k]));
    const revVis = Object.fromEntries(Object.entries(VISIBILITY_LABELS).map(([k, v]) => [v, k]));
    const revTax = Object.fromEntries(Object.entries(TAX_LABELS).map(([k, v]) => [v, k]));

    return rows.map((r) => ({
        ...r,
        status: revStatus[r.status] || r.status,
        visibility: revVis[r.visibility] || r.visibility,
        tax_type: revTax[r.tax_type] || r.tax_type,
    }));
}

/** 내려받기용 열 스펙(csv.sendCsv 에 그대로 넘긴다). */
function csvColumns() {
    return COLUMNS.map((c) => ({ label: c.label, key: c.key }));
}

/**
 * CSV 텍스트를 읽어 등록·수정한다.
 *
 * @returns {{created:Array, updated:Array, failed:Array, total:number}}
 */
async function importCsv(pool, mallId, text) {
    const rows = csv.parseCsv(text);
    if (rows.length < 2) {
        return { error: '내용이 없습니다. 첫 줄은 제목 줄이고, 둘째 줄부터 상품이 있어야 합니다.' };
    }

    const aliases = Object.fromEntries(COLUMNS.map((c) => [c.key, c.aliases]));
    const idx = csv.mapHeader(rows[0], aliases);
    if (idx.name < 0) {
        return { error: '제목 줄에 <b>상품명</b> 칸이 없습니다. [양식 내려받기]로 받은 파일을 쓰면 확실합니다.' };
    }

    // 분류는 이름으로 받아 id 로 바꾼다 — 운영자에게 카테고리 id 를 적으라고 하지 않는다.
    const [cats] = await pool.query("SELECT id, name, type FROM categories WHERE type IN ('NORMAL','THEME','BRAND')");
    const catByName = new Map();
    const brandByName = new Map();
    for (const c of cats) {
        const key = String(c.name).trim();
        if (c.type === 'BRAND') { if (!brandByName.has(key)) brandByName.set(key, c.id); }
        else if (!catByName.has(key)) catByName.set(key, c.id);
    }

    const created = [];
    const updated = [];
    const failed = [];

    for (let i = 1; i < rows.length; i++) {
        const lineNo = i + 1;
        const get = (k) => csv.pick(rows[i], idx[k]);

        const name = get('name');
        const code = get('product_code');
        if (!name && !code) continue;                       // 빈 줄
        if (!name) { failed.push({ lineNo, code, reason: '상품명이 비어 있습니다' }); continue; }

        // 값 변환 — 형식이 틀린 칸이 하나라도 있으면 그 줄은 통째로 건너뛴다(반만 반영되는 것이 더 위험).
        const nums = {};
        let numError = null;
        for (const k of ['price', 'original_price', 'purchase_price', 'stock']) {
            const v = toInt(get(k));
            if (Number.isNaN(v)) { numError = k; break; }
            if (v !== null && v < 0) { numError = k; break; }
            nums[k] = v;
        }
        if (numError) {
            const label = COLUMNS.find((c) => c.key === numError).label;
            failed.push({ lineNo, code, name, reason: `'${label}' 은 0 이상의 숫자여야 합니다` });
            continue;
        }

        const status = get('status') ? toEnum(get('status'), STATUS_LABELS, STATUS_VALUES) : null;
        if (get('status') && !status) {
            failed.push({ lineNo, code, name, reason: `판매상태 '${get('status')}' 를 알 수 없습니다 (판매중·판매중지·품절·입고예정·재입고)` });
            continue;
        }
        const visibility = get('visibility') ? toEnum(get('visibility'), VISIBILITY_LABELS, ['PUBLIC', 'HIDDEN', 'MEMBER_ONLY']) : null;
        if (get('visibility') && !visibility) {
            failed.push({ lineNo, code, name, reason: `노출 '${get('visibility')}' 를 알 수 없습니다 (공개·숨김·회원전용)` });
            continue;
        }
        const taxType = get('tax_type') ? toEnum(get('tax_type'), TAX_LABELS, ['TAXABLE', 'TAX_FREE', 'ZERO_RATED']) : null;
        if (get('tax_type') && !taxType) {
            failed.push({ lineNo, code, name, reason: `과세 '${get('tax_type')}' 를 알 수 없습니다 (과세·면세·영세)` });
            continue;
        }

        let categoryId = null;
        if (get('category_name')) {
            categoryId = catByName.get(get('category_name')) || null;
            if (!categoryId) { failed.push({ lineNo, code, name, reason: `카테고리 '${get('category_name')}' 가 없습니다 — 카테고리 관리에서 먼저 만드세요` }); continue; }
        }
        let brandId = null;
        if (get('brand_name')) {
            brandId = brandByName.get(get('brand_name')) || null;
            if (!brandId) { failed.push({ lineNo, code, name, reason: `브랜드 '${get('brand_name')}' 가 없습니다 — 카테고리 관리에서 먼저 만드세요` }); continue; }
        }

        try {
            // 상품코드가 이 몰에 있으면 수정, 없으면 등록.
            let existing = null;
            if (code) {
                const [[row]] = await pool.query(
                    'SELECT id FROM products WHERE mall_id = ? AND product_code = ?', [mallId, code]);
                existing = row || null;
            }

            if (existing) {
                // 값이 들어온 칸만 바꾼다(빈 칸 = 바꾸지 않음).
                const sets = ['name = ?'];
                const params = [name.slice(0, 100)];
                const put = (col, val) => { if (val !== null && val !== undefined && val !== '') { sets.push(`${col} = ?`); params.push(val); } };
                put('price', nums.price);
                put('original_price', nums.original_price);
                put('purchase_price', nums.purchase_price);
                if (nums.stock !== null) { sets.push('stock = ?'); params.push(nums.stock); }  // 재고 0 은 유효한 값이다
                put('status', status);
                put('visibility', visibility);
                put('tax_type', taxType);
                put('provider', get('provider') ? get('provider').slice(0, 100) : null);
                put('short_description', get('short_description') || null);
                put('category_id', categoryId);
                put('brand_category_id', brandId);

                params.push(existing.id);
                await pool.query(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`, params);
                await syncSku(pool, existing.id);
                updated.push({ lineNo, code, name });
            } else {
                if (nums.price === null) { failed.push({ lineNo, code, name, reason: '새 상품은 판매가가 필요합니다' }); continue; }
                const [r] = await pool.query(
                    `INSERT INTO products
                        (mall_id, product_code, name, category_id, brand_category_id, price, original_price,
                         purchase_price, stock, status, visibility, tax_type, provider, short_description)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        mallId, code || null, name.slice(0, 100), categoryId, brandId,
                        nums.price, nums.original_price, nums.purchase_price,
                        nums.stock === null ? 0 : nums.stock,
                        status || 'ON', visibility || 'PUBLIC', taxType || 'TAXABLE',
                        get('provider') ? get('provider').slice(0, 100) : null,
                        get('short_description') || null,
                    ]
                );
                await syncSku(pool, r.insertId);
                created.push({ lineNo, code, name, id: r.insertId });
            }
        } catch (e) {
            failed.push({ lineNo, code, name, reason: '저장 중 오류: ' + e.message });
        }
    }

    return { created, updated, failed, total: created.length + updated.length + failed.length };
}

module.exports = { COLUMNS, csvColumns, exportRows, importCsv, STATUS_LABELS, VISIBILITY_LABELS, TAX_LABELS };
