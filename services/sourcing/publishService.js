/*
 * 가져온 공급처 상품 → **우리 몰 상품**(products) 등록.
 *
 * ⚠ 스마트스토어 등록이 아니다. 우리 몰에서 직접 파는 상품을 만드는 경로다.
 *   (네이버 채널 등록은 별도 — channel_product_mapping / Phase 3)
 *
 * 매핑 개요
 *   supplier_product            → products
 *   supplier_product.supply_price → products.purchase_price (매입가)
 *   공급가 × (1 + 마진율)        → products.price          (판매가)
 *   supplier_variant[]          → product_option / product_option_value
 *                                 / product_sku / sku_option_value
 *   thumb_url + images_json     → 내려받아 /uploads/products/... → products.main_image, product_images
 *
 * 지켜야 할 기존 규칙(services/catalog 조사 결과)
 *   - 옵션상품은 대표 SKU(is_default=1)를 두지 않는다. product_type='OPTION'.
 *     단일상품만 is_default=1 SKU 를 1개 만든다(없으면 주문 시 SKU 해석 실패).
 *   - products.slug 는 전역 유니크(slugService 공용).
 *   - 이미지는 외부 URL 을 그대로 박지 않고 urlIngest 로 내려받는다(핫링크 차단·링크 변경 대비).
 *   - products.description 은 앱이 새니타이즈하지 않으므로 **여기서** 정제해 넣는다.
 *
 * 상품 등록 컨트롤러(postAdd)에는 트랜잭션이 없지만, 여기서는 직접 건다.
 * 부분 삽입(상품만 만들어지고 SKU/이미지 누락)은 재고·주문을 깨뜨리기 때문이다.
 */

const pool = require('../../config/db');
const { generateUniqueSlugFromName } = require('../catalog/slugService');
const { sanitize } = require('../display/htmlSanitizer');
const urlIngest = require('../media/urlIngest');

// products.name 은 varchar(100) 인데 공급처 제목은 그보다 길 수 있다.
const MAX_NAME_LEN = 100;
// 상세 이미지는 상품당 이만큼만 가져온다(등록 시간·디스크 보호).
const MAX_DETAIL_IMAGES = 10;
// 도매꾹 CDN 이 referer 를 확인하는 경우가 있어 붙여 준다.
const REFERER = 'https://domeggook.com/';
// 금액 컬럼(products.price 등)은 INT 라 21.4억이 한계이고, sql_mode 가 비엄격이라
// 초과값이 에러 없이 잘려 들어간다. 실사용 최고가는 2,500만원대이므로 1억을 상한으로 둔다.
// 설계: docs/사이트개선/카테고리_브랜드_상품필터_설계.md §1.5 D-2
const MAX_PRICE = 100000000;

/** 원 단위 노이즈를 없애기 위해 10원 단위로 반올림한다. */
function roundPrice(v) {
    const n = Number(v) || 0;
    return Math.max(Math.round(n / 10) * 10, 0);
}

/** 공급가 + 마진율(%) → 판매가 */
function sellPrice(supplyPrice, marginRate) {
    const base = Number(supplyPrice) || 0;
    const m = Number(marginRate) || 0;
    return roundPrice(base * (1 + m / 100));
}

/** 몰의 기본 마진율(mall_channel_setting.default_margin_rate). 없으면 null. */
async function getDefaultMarginRate(mallId) {
    const [rows] = await pool.query(
        'SELECT default_margin_rate FROM mall_channel_setting WHERE mall_id = ? LIMIT 1',
        [mallId]
    );
    if (!rows.length || rows[0].default_margin_rate == null) return null;
    return Number(rows[0].default_margin_rate);
}

/**
 * 이미지 수집. 실패한 장은 건너뛴다(등록 자체를 막지 않는다).
 * @returns {Promise<{main:string|null, subs:string[], failed:number}>}
 */
async function ingestImages(product) {
    let images = product.images_json || [];
    if (typeof images === 'string') {
        try { images = JSON.parse(images); } catch (e) { images = []; }
    }
    if (!Array.isArray(images)) images = [];

    let main = null;
    let failed = 0;

    if (product.thumb_url) {
        try {
            main = await urlIngest.ingestImageFromUrl(product.thumb_url, { dest: 'products', referer: REFERER });
        } catch (e) {
            failed++;
            console.error('[sourcing/publish] 대표이미지 저장 실패:', e.message);
        }
    }

    const subs = [];
    for (const url of images.slice(0, MAX_DETAIL_IMAGES)) {
        try {
            subs.push(await urlIngest.ingestImageFromUrl(url, { dest: 'products', referer: REFERER }));
        } catch (e) {
            failed++;
            console.error('[sourcing/publish] 상세이미지 저장 실패:', url, e.message);
        }
    }

    // 대표이미지를 못 받았으면 상세 첫 장으로 대신한다(상품 목록이 빈 칸이 되는 걸 막는다).
    if (!main && subs.length) main = subs[0];

    return { main, subs, failed };
}

/**
 * 옵션 축 구성. 도매꾹 옵션명은 '그레이/M' 처럼 슬래시로 축이 구분된다.
 * 축 개수가 행마다 다르면(비정형) 축을 나누지 않고 '옵션' 단일 축으로 처리한다.
 */
function buildOptionAxes(variants) {
    const split = variants.map((v) => String(v.opt_name || '').split('/').map((s) => s.trim()));
    const width = split[0] ? split[0].length : 0;
    const uniform = width > 1 && split.every((parts) => parts.length === width);

    if (!uniform) {
        return {
            axisNames: ['옵션'],
            rows: variants.map((v, i) => ({ variant: v, values: [String(v.opt_name || `옵션${i + 1}`)] })),
        };
    }

    // 축 이름은 공급처가 주지 않으므로 순번으로 만든다(옵션1/옵션2…).
    const axisNames = Array.from({ length: width }, (_, i) => `옵션${i + 1}`);
    return {
        axisNames,
        rows: variants.map((v, i) => ({ variant: v, values: split[i] })),
    };
}

/**
 * 공급처 상품 1건을 우리 몰 상품으로 등록한다.
 *
 * @param {number} mallId
 * @param {number} supplierProductId
 * @param {{categoryId:number, marginRate:number, status?:string, visibility?:string, actor?:string}} opts
 * @returns {Promise<{productId:number, name:string, price:number, skuCount:number, imageCount:number, imageFailed:number}>}
 */
async function publishToMall(mallId, supplierProductId, opts = {}) {
    const [spRows] = await pool.query(
        'SELECT * FROM supplier_product WHERE mall_id = ? AND id = ? LIMIT 1',
        [mallId, supplierProductId]
    );
    if (!spRows.length) throw new Error('가져온 상품을 찾을 수 없습니다.');
    const sp = spRows[0];

    if (sp.import_status !== 'DETAILED') {
        throw new Error('상세 수집이 완료된 상품만 등록할 수 있습니다. (현재: ' + sp.import_status + ')');
    }
    if (sp.mall_product_id) {
        // 재등록 방지 — 화면에서도 막지만 최종 방어선은 여기다(직접 POST 도 통과시키지 않는다).
        const err = new Error(`이미 우리 몰 상품으로 등록된 상품입니다(상품번호 ${sp.mall_product_id}). 중복 등록을 막았습니다.`);
        err.alreadyPublished = true;
        err.mallProductId = sp.mall_product_id;
        throw err;
    }

    const categoryId = Number(opts.categoryId) || null;
    if (!categoryId) throw new Error('우리 몰 카테고리를 선택하세요.');

    let marginRate = opts.marginRate;
    if (marginRate == null || marginRate === '') marginRate = await getDefaultMarginRate(mallId);
    if (marginRate == null) {
        throw new Error('마진율이 없습니다 — [공급처/채널 연결] 화면에서 기본 목표 마진율을 설정하거나 등록 시 직접 입력하세요.');
    }
    marginRate = Number(marginRate);
    if (!Number.isFinite(marginRate) || marginRate < 0) throw new Error('마진율이 올바르지 않습니다.');

    const [variants] = await pool.query(
        'SELECT * FROM supplier_variant WHERE supplier_product_id = ? ORDER BY opt_code',
        [supplierProductId]
    );
    // 숨김·판매불가 옵션은 우리 몰에 만들지 않는다(팔 수 없는 SKU 를 만들면 재고만 꼬인다).
    const usable = variants.filter((v) => !v.is_hidden && v.available);
    const isOption = usable.length > 0;

    const name = String(sp.title || '').slice(0, MAX_NAME_LEN);
    const purchasePrice = Math.round(Number(sp.supply_price) || 0);
    const price = sellPrice(purchasePrice, marginRate);
    // 공급처가 준 가격이 비정상이면 여기서 멈춘다. 통과시키면 DB 가 조용히 잘라
    // 21억짜리 상품이 몰에 노출된다(과거 사고 사례).
    if (purchasePrice > MAX_PRICE || price > MAX_PRICE) {
        throw new Error(
            `공급가가 비정상입니다(공급가 ${purchasePrice.toLocaleString()}원 / 판매가 ${price.toLocaleString()}원). ` +
            '공급처 원본 가격을 확인한 뒤 [상세 다시 가져오기] 로 갱신하세요.'
        );
    }
    const description = sanitize(sp.detail_html || '');
    const slug = await generateUniqueSlugFromName(name, null, null);
    /*
     * 가져온 상품은 검수 전이다(가격은 마진율만 곱한 자동 산정값, 상세 HTML 은 공급처 원문,
     * 이미지는 일부 실패할 수 있다). 그래서 **상품 마스터에서** 판매중지 + 비노출로 만든다.
     * SKU 는 건드리지 않는다 — SKU 의 on/off 는 옵션 셀렉트 박스 노출 설정이고,
     * 여기서 내려 두면 나중에 판매를 켤 때 고를 수 있는 옵션이 하나도 없다.
     */
    const status = ['ON', 'OFF', 'SOLD_OUT', 'COMING_SOON', 'RESTOCK'].includes(opts.status) ? opts.status : 'OFF';
    const visibility = ['PUBLIC', 'HIDDEN', 'MEMBER_ONLY'].includes(opts.visibility) ? opts.visibility : 'HIDDEN';

    // 이미지 수집은 외부 I/O 라 트랜잭션 밖에서 먼저 끝낸다(락 유지 시간 최소화).
    const img = await ingestImages(sp);

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [pr] = await conn.query(
            `INSERT INTO products
                (mall_id, category_id, product_type, name, product_code, provider,
                 description, main_image, thumbnail_image,
                 purchase_price, price, stock, status, visibility, slug)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                mallId, categoryId, isOption ? 'OPTION' : 'SINGLE',
                name,
                sp.supplier_item_no ? String(sp.supplier_item_no).slice(0, 100) : null,
                sp.seller_nick ? String(sp.seller_nick).slice(0, 100) : null,
                description, img.main, img.main,
                purchasePrice, price,
                isOption ? 0 : (Number(sp.inventory_qty) || 0),
                status, visibility, slug,
            ]
        );
        const productId = pr.insertId;

        let skuCount = 0;

        if (!isOption) {
            // 단일상품 — 대표 SKU 가 반드시 있어야 주문 시 재고 검증이 동작한다.
            await conn.query(
                `INSERT INTO product_sku
                    (mall_id, product_id, sku_code, supplier_code, purchase_price, price, stock, stock_managed, status, is_default)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1)`,
                [
                    mallId, productId,
                    sp.supplier_item_no ? String(sp.supplier_item_no).slice(0, 100) : null,
                    sp.supplier_item_no ? String(sp.supplier_item_no).slice(0, 100) : null,
                    purchasePrice, price, Number(sp.inventory_qty) || 0,
                    'ON', // 상품 마스터가 판매중지·비노출을 맡는다. SKU 는 항상 판매로 만든다.
                ]
            );
            skuCount = 1;
        } else {
            // 옵션상품 — 대표 SKU 를 만들지 않는다(optionService 규칙과 동일하게 맞춘다).
            const { axisNames, rows } = buildOptionAxes(usable);

            // 1) 옵션 축
            const optionIds = [];
            for (let i = 0; i < axisNames.length; i++) {
                const [or_] = await conn.query(
                    'INSERT INTO product_option (product_id, option_name, display_order) VALUES (?, ?, ?)',
                    [productId, String(axisNames[i]).slice(0, 50), i]
                );
                optionIds.push(or_.insertId);
            }

            // 2) 축별 값(중복 제거)
            const valueIdMap = axisNames.map(() => new Map());
            for (let i = 0; i < axisNames.length; i++) {
                const seen = [];
                for (const row of rows) {
                    const v = String(row.values[i] == null ? '' : row.values[i]).slice(0, 100);
                    if (!seen.includes(v)) seen.push(v);
                }
                for (let k = 0; k < seen.length; k++) {
                    const [vr] = await conn.query(
                        'INSERT INTO product_option_value (product_option_id, value_name, display_order) VALUES (?, ?, ?)',
                        [optionIds[i], seen[k], k]
                    );
                    valueIdMap[i].set(seen[k], vr.insertId);
                }
            }

            // 3) SKU + 조합 매핑
            for (let r = 0; r < rows.length; r++) {
                const { variant, values } = rows[r];
                const skuPurchase = Math.round(purchasePrice + (Number(variant.extra_price) || 0));
                const [sr] = await conn.query(
                    `INSERT INTO product_sku
                        (mall_id, product_id, sku_code, supplier_code, purchase_price, price, stock, stock_managed, status, is_default, display_order)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?)`,
                    [
                        mallId, productId,
                        `${sp.supplier_item_no}-${variant.opt_code}`.slice(0, 100),
                        variant.opt_hash ? String(variant.opt_hash).slice(0, 100) : null,
                        skuPurchase,
                        sellPrice(skuPurchase, marginRate),
                        Number(variant.qty) || 0,
                        'ON', // 상품 마스터가 판매중지·비노출을 맡는다. SKU 는 항상 판매로 만든다.
                        r,
                    ]
                );
                for (let i = 0; i < axisNames.length; i++) {
                    const vname = String(values[i] == null ? '' : values[i]).slice(0, 100);
                    await conn.query(
                        'INSERT INTO sku_option_value (sku_id, product_option_id, product_option_value_id) VALUES (?, ?, ?)',
                        [sr.insertId, optionIds[i], valueIdMap[i].get(vname)]
                    );
                }
                skuCount++;
            }
        }

        // 4) 서브 이미지
        for (let i = 0; i < img.subs.length; i++) {
            await conn.query(
                'INSERT INTO product_images (product_id, image_url, display_order) VALUES (?, ?, ?)',
                [productId, img.subs[i], i]
            );
        }

        // 5) 역참조 — 중복 등록 방지 + 이후 가격·재고 갱신의 연결고리
        await conn.query(
            `UPDATE supplier_product
                SET mall_product_id = ?, published_at = NOW(), published_by = ?
              WHERE mall_id = ? AND id = ?`,
            [productId, opts.actor || null, mallId, supplierProductId]
        );

        await conn.commit();
        return {
            productId, name, price, skuCount,
            imageCount: img.subs.length + (img.main ? 1 : 0),
            imageFailed: img.failed,
            isOption,
        };
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}

/** 여러 건 등록 — 한 건 실패해도 나머지는 계속한다. */
async function publishMany(mallId, ids, opts = {}) {
    const list = (Array.isArray(ids) ? ids : [ids]).map(Number).filter(Boolean);
    if (!list.length) throw new Error('등록할 상품을 선택하세요.');

    const results = [];
    let success = 0;
    let failed = 0;
    let skipped = 0; // 이미 등록된 건 — 오류가 아니라 '건너뜀' 으로 센다.

    for (const id of list) {
        try {
            const r = await publishToMall(mallId, id, opts);
            success++;
            results.push({ id, ok: true, ...r });
        } catch (e) {
            if (e.alreadyPublished) {
                skipped++;
                results.push({ id, ok: false, skipped: true, mallProductId: e.mallProductId, error: e.message });
            } else {
                failed++;
                results.push({ id, ok: false, error: e.message });
            }
        }
    }
    return { requested: list.length, success, failed, skipped, results };
}

/** 등록 폼에 쓸 우리 몰 카테고리 목록(NORMAL). 카테고리는 mall_id=0 전역 공용 + 몰 전용분. */
async function listMallCategories(mallId) {
    const [rows] = await pool.query(
        `SELECT id, name, parent_id, depth, mall_id
           FROM categories
          WHERE type = 'NORMAL' AND mall_id IN (0, ?)
          ORDER BY depth, name`,
        [mallId]
    );
    return rows;
}

/**
 * 카테고리를 3단 계단식 선택기용 트리로 만든다.
 *
 * 평면 목록으로 두면 2,300개가 넘는 옵션이 한 셀렉트에 들어가 사실상 못 고른다.
 * 대분류(15) → 중분류(242) → 소분류(2,094) 로 나눠야 쓸 수 있다.
 *
 * 전송량을 줄이려 짧은 키를 쓴다: i=id, n=name, k=children
 */
async function getMallCategoryTree(mallId) {
    const rows = await listMallCategories(mallId);

    const byId = new Map();
    for (const r of rows) byId.set(Number(r.id), { i: Number(r.id), n: r.name, k: [] });

    const roots = [];
    for (const r of rows) {
        const node = byId.get(Number(r.id));
        const parent = r.parent_id != null ? byId.get(Number(r.parent_id)) : null;
        // 부모가 조회 범위 밖이면(다른 몰 전용 등) 최상위로 올린다 — 트리에서 사라지면 못 고른다.
        if (parent) parent.k.push(node);
        else roots.push(node);
    }

    const sortRec = (list) => {
        list.sort((a, b) => a.n.localeCompare(b.n, 'ko'));
        for (const n of list) {
            if (n.k.length) sortRec(n.k);
            else delete n.k; // 잎은 children 키를 빼서 크기를 줄인다
        }
    };
    sortRec(roots);
    return roots;
}

/** 카테고리 id → 이름 경로(['패션잡화','지갑']). 화면 표시용. */
function findCategoryPath(tree, id, trail = []) {
    for (const node of tree || []) {
        const next = [...trail, node.n];
        if (node.i === Number(id)) return next;
        if (node.k) {
            const found = findCategoryPath(node.k, id, next);
            if (found) return found;
        }
    }
    return null;
}

module.exports = {
    publishToMall,
    publishMany,
    listMallCategories,
    getMallCategoryTree,
    findCategoryPath,
    getDefaultMarginRate,
    sellPrice,
    roundPrice,
    buildOptionAxes,
};
