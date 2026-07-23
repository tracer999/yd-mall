/*
 * 네이버 스마트스토어 재고 연동 — **우리 몰 재고 → 네이버**(PUSH).
 * 설계: docs/사이트개선/네이버_스마트스토어_연동.md §14(2차 재고 동기화)
 *       docs/사이트개선/도매꾹_온채널_스마트스토어_연동_상세설계.md §12
 *
 * 방향이 헷갈리기 쉬운 곳이다. **재고의 소스 오브 트루스는 우리 몰**이고
 * (services/catalog/sellableStock.js — 판매가능재고 = SKU status='ON' AND stock_managed=1),
 * 네이버는 그 값을 받아 반영하는 쪽이다. 화면 이름이 "가져오기"라고 해서
 * 네이버 재고를 우리 DB 에 덮어쓰면 결제·주문 재고가 조용히 어긋난다.
 *   → 우리 → 네이버 = **전송(쓰기)**
 *   → 네이버 → 우리 = **조회(읽기 전용, 대사용)**. DB 에 쓰지 않는다.
 *
 * 1차는 **수동 버튼**이다(설계 §12.3). 배치·스케줄러는 2차이며 여기서 만들지 않는다.
 *
 * ★ 전송 경로가 **상품 유형에 따라 다르다** — 2026-07-23 실호출로 확정했다.
 *
 *   옵션상품 → PUT /v1/products/origin-products/{no}/option-stock
 *       { "optionInfo": { "useStockManagement": true, "optionCombinations": [...] },
 *         "stockQuantity": N, "productSalePrice": { "salePrice": 기준가 } }
 *       · `optionInfo` 는 필수다. 빼면 400 `optionInfo: 데이터를 입력해 주세요.`
 *       · `productSalePrice` 도 필수다. 빼면 400 `옵션가 수정 시 판매가를 필수 입력해 주세요.`
 *       · 등록 페이로드처럼 `originProduct` 로 감싸면 **같은 400** 이 난다(평평한 구조다).
 *       · 옵션별 재고가 실제로 반영되는 것까지 확인했다(브라운 100 → 95 → 100).
 *
 *   단일상품 → **option-stock 으로는 재고가 바뀌지 않는다.**
 *       빈 조합(`optionCombinations: []`)으로 보내면 **200 을 주고도 값이 그대로**다
 *       (100 → 77 요청 후 되읽으면 여전히 100). "200 성공 ≠ 반영" 의 전형이다.
 *       그래서 원상품 전체 수정으로 보낸다 — 되읽어 77 반영을 확인했다.
 *           GET  /v2/products/origin-products/{no}
 *             → originProduct.stockQuantity 만 교체 →
 *           PUT  /v2/products/origin-products/{no}
 *
 *   조립·분기는 buildStockRequest() / pushStock() 두 곳에만 있다.
 *
 * ⚠ 옵션상품은 **판매가가 함께 전송된다**(네이버가 요구). 재고만 보내는 것이 불가능하다.
 */

const pool = require('../../../config/db');
const cred = require('../credential');
const naverProducts = require('./naverProducts');
const { writeLog, CHANNEL } = require('./channelLog');
const { sellableCond } = require('../../catalog/sellableStock');

// 1회 전송 상한. 건당 1호출(2 RPS)이라 여유가 있지만 화면 타임아웃을 넘기지 않게 끊는다.
const PUSH_LIMIT = 30;

/** 이 몰의 네이버 자격증명. 없으면 명확히 실패시킨다(가짜 성공 금지). */
async function getNaverCredential(mallId) {
    const c = await cred.getCredentialByChannel(mallId, CHANNEL);
    if (!c) {
        throw new Error('네이버 스마트스토어 자격증명이 없습니다 — [공급처/채널 연결]에서 등록·검증하세요.');
    }
    return c;
}

function toInt(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : fallback;
}

// ---------------------------------------------------------------------------
// 대상 조회 (읽기 전용)
// ---------------------------------------------------------------------------

/**
 * 재고 전송 대상 — 네이버에 올라가 있는(원상품번호가 있는) 매핑 전부.
 *
 * 우리가 등록한 것(BUILDER)과 역수집한 것(CHANNEL_IMPORT)을 **둘 다** 포함한다.
 * 두 경우 모두 우리 몰에서 재고를 관리하므로 전송 대상이 같다.
 *
 * @param {{onlyDiff?:boolean, q?:string, limit?:number}} opts
 */
async function listTargets(mallId, opts = {}) {
    const params = [mallId, CHANNEL];
    let where = `m.mall_id = ? AND m.channel = ? AND m.origin_product_no IS NOT NULL`;

    const q = String(opts.q || '').trim();
    if (q) {
        where += ' AND (p.name LIKE ? OR m.origin_product_no LIKE ? OR m.channel_product_no LIKE ?)';
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const [rows] = await pool.query(
        `SELECT m.id AS mapping_id, m.product_id, m.origin_product_no, m.channel_product_no,
                m.status, m.sale_status, m.source_type, m.last_published_at,
                p.name, p.product_type, p.status AS product_status, p.price,
                (SELECT COALESCE(SUM(CASE WHEN ${sellableCond('_ss')} THEN _ss.stock ELSE 0 END), 0)
                   FROM product_sku _ss WHERE _ss.product_id = p.id) AS sellable_stock,
                (SELECT COUNT(*) FROM product_sku _sc WHERE _sc.product_id = p.id) AS sku_count,
                (SELECT COUNT(*) FROM channel_sku_mapping _cm
                   WHERE _cm.mapping_id = m.id AND _cm.naver_option_id IS NOT NULL) AS mapped_sku_count,
                (SELECT COUNT(*) FROM channel_sku_mapping _cs WHERE _cs.mapping_id = m.id) AS sent_row_count,
                (SELECT COALESCE(SUM(_cm2.last_sent_stock), 0)
                   FROM channel_sku_mapping _cm2 WHERE _cm2.mapping_id = m.id) AS last_sent_total
           FROM channel_product_mapping m
           JOIN products p ON p.id = m.product_id
          WHERE ${where}
          ORDER BY m.updated_at DESC, m.id DESC
          LIMIT ?`,
        [...params, Math.min(toInt(opts.limit, 200), 500)]
    );

    for (const r of rows) {
        r.sellable_stock = Number(r.sellable_stock) || 0;
        r.last_sent_total = Number(r.last_sent_total) || 0;
        /*
         * 비교 기준은 "한 번이라도 보낸 적이 있는가"(sent_row_count)다.
         * 옵션 매핑 수로 판단하면 **단일상품은 영원히 '확인 필요'** 로 남는다.
         */
        r.never_sent = Number(r.sent_row_count) === 0;
        r.diff = r.never_sent || r.sellable_stock !== r.last_sent_total;
    }

    return opts.onlyDiff ? rows.filter((r) => r.diff) : rows;
}

// ---------------------------------------------------------------------------
// 요청 조립 — **shape 변경은 여기만 고친다**
// ---------------------------------------------------------------------------

/**
 * 옵션상품용 전송 본문 조립. **shape 는 실호출로 확정됐다**(파일 헤더 참고).
 *
 * ⚠ useStockManagement=false 로 보내면 네이버가 수량을 9,999 로 덮는다 — 항상 true.
 * ⚠ **`productSalePrice` 는 필수다.** 빼면 400 `옵션가 수정 시 판매가를 필수 입력해 주세요.`
 *   옵션 `price` 가 판매가 대비 추가금액이라 기준가 없이는 해석할 수 없기 때문이다.
 *   → 즉 **옵션상품은 재고만 보낼 수 없고 판매가가 함께 나간다.** 우리 SKU 최저가가
 *   그대로 네이버 판매가가 되므로, 우리 몰에서 가격을 고치면 전송 시 네이버에도 반영된다.
 *
 * @param {{stockQuantity:number, combinations:Array, basePrice?:number}} ctx
 * @returns {object} 요청 본문
 */
function buildStockRequest(ctx) {
    const body = {
        optionInfo: {
            useStockManagement: true,
            optionCombinations: Array.isArray(ctx.combinations) ? ctx.combinations : [],
        },
        stockQuantity: toInt(ctx.stockQuantity, 0),
    };
    if (ctx.basePrice != null) body.productSalePrice = { salePrice: toInt(ctx.basePrice) };
    return body;
}

/**
 * 재고를 실제로 보낸다. **상품 유형에 따라 경로가 갈린다**(파일 헤더 참고).
 *
 * 단일상품은 원상품을 통째로 되읽어 재고만 갈아 끼운 뒤 되돌려 보낸다.
 * 우리가 만든 페이로드로 덮어쓰지 않는 이유는, 네이버에서 직접 등록·수정한 값
 * (상세HTML·고시·배송 등)을 우리 값으로 조용히 밀어 버리면 안 되기 때문이다.
 *
 * @returns {Promise<{res:object, body:object, path:string}>}
 */
async function pushStock(credential, originProductNo, plan) {
    if (plan.combinations && plan.combinations.length) {
        const body = buildStockRequest(plan);
        const res = await naverProducts.updateOptionStock(credential, originProductNo, body);
        return { res, body, path: 'option-stock' };
    }

    const full = await naverProducts.getOriginProduct(credential, originProductNo);
    if (!full || !full.originProduct) {
        throw new Error(`원상품 ${originProductNo} 조회 응답에 originProduct 가 없습니다 — 재고를 보낼 수 없습니다.`);
    }
    full.originProduct.stockQuantity = toInt(plan.stockQuantity, 0);
    const res = await naverProducts.updateOriginProduct(credential, originProductNo, full);
    return { res, body: { originProduct: { stockQuantity: full.originProduct.stockQuantity } }, path: 'origin-product' };
}

/**
 * 상품 1건의 전송 재고를 계산한다.
 *
 * 옵션상품 — channel_sku_mapping 으로 우리 SKU ↔ 네이버 옵션조합을 이어 조합 배열을 만든다.
 *            매핑이 없는 SKU 는 보낼 수 없다(네이버 옵션 ID 를 모른다) → 건너뛰고 집계한다.
 * 단일상품 — 판매가능재고 합만 보낸다.
 *
 * ⚠ 여기서 쓰는 재고는 **판매가능재고**다(sellableStock 의 정의). products.stock 은
 *   옵션상품에서 stale 하므로 쓰지 않는다.
 */
async function buildPushPlan(mallId, mapping) {
    const [skuRows] = await pool.query(
        `SELECT s.id, s.sku_code, s.price, s.stock, s.status, s.stock_managed,
                c.id AS csm_id, c.naver_option_id, c.last_sent_stock, c.last_sent_price
           FROM product_sku s
           LEFT JOIN channel_sku_mapping c ON c.sku_id = s.id AND c.mapping_id = ?
          WHERE s.product_id = ?
          ORDER BY s.display_order, s.id`,
        [mapping.mapping_id, mapping.product_id]
    );

    // 판매가능재고 정의 — status='ON' AND stock_managed=1 인 것만 센다.
    const sellableOf = (s) => (s.status === 'ON' && Number(s.stock_managed) === 1 ? toInt(s.stock, 0) : 0);
    const totalStock = skuRows.reduce((a, s) => a + sellableOf(s), 0);

    const mapped = skuRows.filter((s) => s.naver_option_id);
    const unmappedSellable = skuRows.filter((s) => !s.naver_option_id && s.status === 'ON').length;

    if (!mapped.length) {
        /*
         * 옵션 매핑이 없다 — 두 경우가 섞여 있고 의미가 다르다.
         *   단일상품 : 정상이다. 상품 단위 재고만 보내면 된다(경고할 것 없음).
         *   옵션상품 : 등록 때 sellerManagerCode 로 옵션을 되짚지 못한 경우다.
         *             옵션별 재고를 못 보내고 합계만 나가므로 화면에 경고해야 한다.
         */
        const isOptionProduct = mapping.product_type === 'OPTION';
        return {
            stockQuantity: totalStock,
            combinations: null,
            skuRows,
            mappedCount: 0,
            unmappedSellable: isOptionProduct ? unmappedSellable : 0,
        };
    }

    // 네이버 옵션 price 는 **판매가 대비 추가금액**이다. 기준가는 등록 때와 같은 규칙
    // (판매 가능한 SKU 중 최저가)으로 다시 낸다 — 여기서 어긋나면 옵션가가 뒤틀린다.
    const sellablePrices = skuRows.filter((s) => s.status === 'ON').map((s) => toInt(s.price));
    const basePrice = sellablePrices.length ? Math.min(...sellablePrices) : toInt(mapping.price);

    const combinations = mapped.map((s) => ({
        id: Number(s.naver_option_id),
        stockQuantity: sellableOf(s),
        price: Math.max(toInt(s.price) - basePrice, 0),
        // 우리 몰에서 끈 옵션은 네이버에서도 팔리면 안 된다.
        usable: s.status === 'ON',
    }));

    return {
        stockQuantity: combinations.reduce((a, c) => a + c.stockQuantity, 0),
        combinations,
        skuRows,
        mappedCount: mapped.length,
        unmappedSellable,
        basePrice,
    };
}

/**
 * 전송 후 channel_sku_mapping 에 "마지막으로 보낸 값"을 남긴다(중복 전송 방지·대사 근거).
 *
 * 단일상품(옵션 조합 없음)도 **반드시 기록한다.** 기록하지 않으면 비교 근거가 없어
 * 화면에서 영원히 "확인 필요"로 보이고 변경 없음 스킵도 동작하지 않는다.
 * 이때 naver_option_id 는 NULL 이며, 화면의 "옵션 매핑 수"는 그 값이 있는 행만 센다.
 */
async function markSent(mapping, plan) {
    if (plan.combinations && plan.combinations.length) {
        const byOptionId = new Map(plan.combinations.map((c) => [String(c.id), c]));
        for (const s of plan.skuRows) {
            if (!s.naver_option_id) continue;
            const c = byOptionId.get(String(Number(s.naver_option_id)));
            if (!c) continue;
            await pool.query(
                'UPDATE channel_sku_mapping SET last_sent_stock = ?, last_sent_price = ? WHERE id = ?',
                [c.stockQuantity, c.price, s.csm_id]
            );
        }
        return;
    }

    // 단일상품 — 대표 SKU 1건에 상품 단위 재고를 기록한다.
    const target = plan.skuRows.find((s) => s.status === 'ON') || plan.skuRows[0];
    if (!target) return;
    await pool.query(
        `INSERT INTO channel_sku_mapping (mapping_id, sku_id, naver_option_id, last_sent_stock, last_sent_price)
         VALUES (?, ?, NULL, ?, ?)
         ON DUPLICATE KEY UPDATE last_sent_stock = VALUES(last_sent_stock), last_sent_price = VALUES(last_sent_price)`,
        [mapping.mapping_id, target.id, plan.stockQuantity, toInt(target.price)]
    );
}

async function getMapping(mallId, productId) {
    const [rows] = await pool.query(
        `SELECT m.id AS mapping_id, m.product_id, m.origin_product_no, m.channel_product_no,
                m.status, m.source_type, p.name, p.price, p.product_type
           FROM channel_product_mapping m
           JOIN products p ON p.id = m.product_id
          WHERE m.mall_id = ? AND m.channel = ? AND m.product_id = ?
          LIMIT 1`,
        [mallId, CHANNEL, productId]
    );
    return rows[0] || null;
}

// ---------------------------------------------------------------------------
// 전송 (쓰기)
// ---------------------------------------------------------------------------

/**
 * 상품 1건의 재고를 네이버로 보낸다.
 *
 * @param {{actor?:string, credential?:object, force?:boolean}} opts
 *        force=true 면 변경이 없어도 보낸다(대사·복구용).
 */
async function pushOne(mallId, productId, opts = {}) {
    const startedAt = Date.now();
    const credential = opts.credential || await getNaverCredential(mallId);

    const mapping = await getMapping(mallId, productId);
    if (!mapping || !mapping.origin_product_no) {
        throw new Error('네이버에 등록된 상품이 아닙니다(원상품번호 없음).');
    }

    const plan = await buildPushPlan(mallId, mapping);

    // 변경이 없으면 호출하지 않는다 — 호출 한도는 유한하고, 같은 값을 다시 보낼 이유가 없다.
    if (!opts.force) {
        let unchanged = false;
        if (plan.combinations && plan.combinations.length) {
            unchanged = plan.skuRows
                .filter((s) => s.naver_option_id)
                .every((s) => {
                    const c = plan.combinations.find((x) => String(x.id) === String(Number(s.naver_option_id)));
                    return c && s.last_sent_stock != null && Number(s.last_sent_stock) === c.stockQuantity;
                });
        } else {
            // 단일상품 — markSent 가 남긴 기록행(naver_option_id IS NULL)과 비교한다.
            const sent = plan.skuRows.find((s) => s.csm_id && s.last_sent_stock != null);
            unchanged = !!sent && Number(sent.last_sent_stock) === plan.stockQuantity;
        }
        if (unchanged) {
            const err = new Error('재고가 마지막 전송과 같습니다 — 보내지 않았습니다.');
            err.unchanged = true;
            throw err;
        }
    }

    let body = null;
    try {
        const sent = await pushStock(credential, mapping.origin_product_no, plan);
        const res = sent.res;
        body = sent.body;
        await markSent(mapping, plan);
        await pool.query(
            'UPDATE channel_product_mapping SET last_error = NULL WHERE id = ?',
            [mapping.mapping_id]
        );
        await writeLog({
            mallId, productId, mappingId: mapping.mapping_id, action: 'STOCK', ok: true, httpStatus: 200,
            message: `재고 전송 성공 (원상품 ${mapping.origin_product_no}, 총 ${plan.stockQuantity}개`
                + `${plan.combinations ? `, 옵션 ${plan.combinations.length}건` : ', 단일상품'}`
                + `, 경로=${sent.path})`
                + (plan.unmappedSellable ? ` ⚠ 옵션 매핑이 없는 판매중 SKU ${plan.unmappedSellable}건은 전송하지 못했습니다.` : ''),
            request: body, response: res,
            durationMs: Date.now() - startedAt, actor: opts.actor,
        });
        return {
            productId,
            name: mapping.name,
            originProductNo: mapping.origin_product_no,
            stockQuantity: plan.stockQuantity,
            optionCount: plan.combinations ? plan.combinations.length : 0,
            unmappedSellable: plan.unmappedSellable,
        };
    } catch (e) {
        await pool.query(
            'UPDATE channel_product_mapping SET last_error = ? WHERE id = ?',
            [String(e.message).slice(0, 2000), mapping.mapping_id]
        );
        await writeLog({
            mallId, productId, mappingId: mapping.mapping_id, action: 'STOCK', ok: false,
            httpStatus: e.status || null,
            message: `재고 전송 실패: ${e.message}` + (e.traceId ? ` [trace=${e.traceId}]` : ''),
            request: body, response: e.body || null,
            durationMs: Date.now() - startedAt, actor: opts.actor,
        });
        throw e;
    }
}

/** 여러 건 전송 — 순차. 한 건 실패해도 나머지는 계속한다. */
async function pushMany(mallId, productIds, opts = {}) {
    const list = [...new Set((Array.isArray(productIds) ? productIds : [productIds])
        .map(Number).filter(Boolean))];
    if (!list.length) throw new Error('전송할 상품을 선택하세요.');

    const overLimit = list.length > PUSH_LIMIT;
    const targets = list.slice(0, PUSH_LIMIT);
    const credential = await getNaverCredential(mallId);

    const results = [];
    let success = 0, failed = 0, skipped = 0;

    for (const id of targets) {
        try {
            const r = await pushOne(mallId, id, { ...opts, credential });
            success++;
            results.push({ productId: id, ok: true, ...r });
        } catch (e) {
            if (e.unchanged) {
                skipped++;
                results.push({ productId: id, ok: false, skipped: true, error: e.message });
            } else {
                failed++;
                results.push({ productId: id, ok: false, error: e.message, traceId: e.traceId || null });
            }
        }
    }

    return { requested: list.length, processed: targets.length, overLimit, limit: PUSH_LIMIT, success, failed, skipped, results };
}

// ---------------------------------------------------------------------------
// 대사 (읽기 전용) — 네이버 현재 재고를 조회만 한다. 우리 DB 를 덮지 않는다.
// ---------------------------------------------------------------------------

/**
 * 네이버에 실제로 반영된 재고를 되읽어 우리 값과 비교한다.
 *
 * "200 성공 ≠ 반영 완료" 라서 전송 뒤 한 번은 확인해야 한다(§10 과 같은 이유).
 * 값을 우리 DB 에 쓰지 않는다 — 재고의 정본은 우리 몰이다.
 */
async function fetchChannelStock(mallId, productId, opts = {}) {
    const credential = opts.credential || await getNaverCredential(mallId);
    const mapping = await getMapping(mallId, productId);
    if (!mapping || !mapping.origin_product_no) throw new Error('네이버에 등록된 상품이 아닙니다.');

    const res = await naverProducts.getOriginProduct(credential, mapping.origin_product_no);
    const op = (res && res.originProduct) || res || {};
    const oi = (op.detailAttribute && op.detailAttribute.optionInfo) || {};
    const combos = Array.isArray(oi.optionCombinations) ? oi.optionCombinations : [];

    const plan = await buildPushPlan(mallId, mapping);

    await writeLog({
        mallId, productId, mappingId: mapping.mapping_id, action: 'FETCH', ok: true,
        message: `네이버 재고 조회: 상품 ${toInt(op.stockQuantity, 0)}개 / 옵션 ${combos.length}건`
            + ` (우리 판매가능재고 ${plan.stockQuantity}개)`,
        response: op, actor: opts.actor,
    });

    return {
        productId,
        name: mapping.name,
        originProductNo: mapping.origin_product_no,
        naverStock: toInt(op.stockQuantity, 0),
        naverStatus: op.statusType || null,
        ourStock: plan.stockQuantity,
        matched: toInt(op.stockQuantity, 0) === plan.stockQuantity,
        options: combos.map((c) => ({
            id: c.id != null ? String(c.id) : null,
            name: [c.optionName1, c.optionName2, c.optionName3].filter(Boolean).join(' / '),
            stock: toInt(c.stockQuantity, 0),
            usable: c.usable !== false,
        })),
    };
}

module.exports = {
    listTargets,
    pushOne,
    pushMany,
    fetchChannelStock,
    // 스펙 변경 시 고칠 지점
    buildStockRequest,
    pushStock,
    buildPushPlan,
    getNaverCredential,
    PUSH_LIMIT,
    CHANNEL,
};
