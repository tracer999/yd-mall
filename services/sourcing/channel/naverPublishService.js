/*
 * 우리 몰 상품 → 네이버 스마트스토어 등록 오케스트레이션.
 * 설계: docs/사이트개선/네이버_스마트스토어_연동.md
 *
 * 흐름: 상품 로드 → 자체 검증 → 이미지 업로드(캐시) → 페이로드 조립
 *       → POST /v2/products → 매핑·SKU매핑·로그 적재
 *
 * 설계 판단:
 *   - **벌크 등록 API 가 없다**(네이버 공식: 제공 계획도 없음). 단건 POST 반복이 유일하다.
 *     그래서 "대량 등록"은 서버가 순차 처리하는 것이지 한 번에 보내는 게 아니다.
 *   - 이미지 업로드가 **스토어 계정당 동시 1건** 강제라 파이프라인 전체가 사실상 직렬이다.
 *     동시성을 올리는 최적화는 불가능하다 — 시도하면 "이전 요청이 진행중입니다" 로 깨진다.
 *   - 한 건이 실패해도 나머지는 계속한다. 실패는 격리해 사유와 함께 남긴다.
 */

const pool = require('../../../config/db');
const crypto = require('crypto');
const cred = require('../credential');
const naverProducts = require('./naverProducts');
const naverImages = require('./naverImages');
const naverProfile = require('./naverProfile');
const mapper = require('./naverMapper');
const { sanitize } = require('../../display/htmlSanitizer');

/*
 * 1회 실행 상한. 건당 2~4초(이미지 업로드 포함, 2 RPS 제한)라 30건이면 최대 2분이다.
 * 관리자 화면의 요청 타임아웃을 넘기지 않도록 이 선에서 끊는다.
 */
const BATCH_LIMIT = 30;

const CHANNEL = 'NAVER_SMARTSTORE';
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://dev-mall.ydata.co.kr';

/** 상세 HTML 안의 로컬 이미지 경로를 뽑는다(네이버에 올려 치환하기 위해). */
function extractLocalImages(html) {
    const out = [];
    const re = /<img[^>]+src=["'](\/uploads\/[^"']+)["']/gi;
    let m;
    while ((m = re.exec(String(html || '')))) {
        if (!out.includes(m[1])) out.push(m[1]);
    }
    return out;
}

/**
 * 등록에 필요한 상품 데이터를 한 번에 읽는다.
 * 옵션 축 순서와 SKU 의 옵션값 순서를 맞추는 게 핵심 — 어긋나면 옵션이 뒤섞인다.
 */
async function loadProduct(mallId, productId) {
    const [pRows] = await pool.query(
        'SELECT * FROM products WHERE mall_id = ? AND id = ? LIMIT 1',
        [mallId, productId]
    );
    if (!pRows.length) throw new Error('상품을 찾을 수 없습니다.');
    const product = pRows[0];

    const [options] = await pool.query(
        'SELECT id, option_name, display_order FROM product_option WHERE product_id = ? ORDER BY display_order, id',
        [productId]
    );

    const [skuRows] = await pool.query(
        'SELECT * FROM product_sku WHERE product_id = ? ORDER BY display_order, id',
        [productId]
    );

    // SKU ↔ 옵션값. 축 순서대로 값을 배열에 담는다.
    const [sov] = await pool.query(
        `SELECT sov.sku_id, sov.product_option_id, pov.value_name
           FROM sku_option_value sov
           JOIN product_option_value pov ON pov.id = sov.product_option_value_id
          WHERE sov.sku_id IN (SELECT id FROM product_sku WHERE product_id = ?)`,
        [productId]
    );
    const axisIndex = new Map(options.map((o, i) => [Number(o.id), i]));
    const valuesBySku = new Map();
    for (const r of sov) {
        if (!valuesBySku.has(r.sku_id)) valuesBySku.set(r.sku_id, []);
        const idx = axisIndex.get(Number(r.product_option_id));
        if (idx != null) valuesBySku.get(r.sku_id)[idx] = r.value_name;
    }

    const skus = skuRows.map((s) => ({ ...s, optionValues: valuesBySku.get(s.id) || [] }));

    const [imgRows] = await pool.query(
        'SELECT image_url FROM product_images WHERE product_id = ? ORDER BY display_order, id',
        [productId]
    );

    return { product, options, skus, subImages: imgRows.map((r) => r.image_url) };
}

/** 이 몰의 네이버 자격증명. 없으면 명확히 실패시킨다(가짜 성공 금지). */
async function getNaverCredential(mallId) {
    const c = await cred.getCredentialByChannel(mallId, CHANNEL);
    if (!c) {
        throw new Error('네이버 스마트스토어 자격증명이 없습니다 — [공급처/채널 연결]에서 등록·검증하세요.');
    }
    return c;
}

async function writeLog(row) {
    try {
        await pool.query(
            `INSERT INTO channel_publish_log
                (mall_id, channel, product_id, mapping_id, action, ok, http_status, message,
                 request_json, response_json, duration_ms, actor)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                row.mallId, CHANNEL, row.productId || null, row.mappingId || null,
                row.action, row.ok ? 1 : 0, row.httpStatus || null,
                (row.message || '').slice(0, 4000),
                row.request ? JSON.stringify(row.request) : null,
                row.response ? JSON.stringify(row.response) : null,
                row.durationMs || null, row.actor || null,
            ]
        );
    } catch (e) {
        // 로그 실패가 등록 자체를 깨뜨리면 안 된다.
        console.error('[naver/publish] 로그 적재 실패:', e.message);
    }
}

/** 매핑 행을 가져오거나 만든다. */
async function upsertMapping(mallId, productId, patch = {}) {
    const [rows] = await pool.query(
        'SELECT * FROM channel_product_mapping WHERE mall_id = ? AND channel = ? AND product_id = ? LIMIT 1',
        [mallId, CHANNEL, productId]
    );
    if (!rows.length) {
        const [r] = await pool.query(
            `INSERT INTO channel_product_mapping (mall_id, channel, product_id, status, source_type)
             VALUES (?, ?, ?, ?, 'BUILDER')`,
            [mallId, CHANNEL, productId, patch.status || 'DRAFT']
        );
        return r.insertId;
    }
    return rows[0].id;
}

async function getMapping(mallId, productId) {
    const [rows] = await pool.query(
        'SELECT * FROM channel_product_mapping WHERE mall_id = ? AND channel = ? AND product_id = ? LIMIT 1',
        [mallId, CHANNEL, productId]
    );
    return rows[0] || null;
}

/** 등록 성공 후 SKU ↔ 네이버 옵션조합 매핑 저장(재고 동기화의 열쇠). */
async function saveSkuMappings(mappingId, skus, combinations) {
    if (!combinations || !combinations.length) return;
    // sellerManagerCode(=our sku_code)로 되짚는다. 네이버가 옵션 ID 를 안 주는 경우가 있어서다.
    const bySkuCode = new Map(skus.filter((s) => s.sku_code).map((s) => [String(s.sku_code), s]));
    const rows = [];
    for (const c of combinations) {
        const sku = bySkuCode.get(String(c.sellerManagerCode || ''));
        if (!sku) continue;
        rows.push([
            mappingId, sku.id,
            c.id != null ? String(c.id) : null,
            c.sellerManagerCode || null,
            c.optionName1 || null, c.optionName2 || null, c.optionName3 || null,
            c.stockQuantity != null ? Number(c.stockQuantity) : null,
            c.price != null ? Number(c.price) : null,
        ]);
    }
    if (!rows.length) return;
    await pool.query(
        `INSERT INTO channel_sku_mapping
            (mapping_id, sku_id, naver_option_id, option_manage_code,
             option_name1, option_name2, option_name3, last_sent_stock, last_sent_price)
         VALUES ${rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}
         ON DUPLICATE KEY UPDATE
            naver_option_id = VALUES(naver_option_id),
            option_manage_code = VALUES(option_manage_code),
            last_sent_stock = VALUES(last_sent_stock),
            last_sent_price = VALUES(last_sent_price)`,
        rows.flat()
    );
}

/**
 * 상품 1건을 네이버에 등록한다.
 *
 * @param {number} mallId
 * @param {number} productId
 * @param {{actor?:string, credential?:object, profile?:object}} opts
 *        credential/profile 은 대량 등록에서 재조회를 피하려고 주입받는다.
 * @returns {Promise<{productId:number, originProductNo:string, channelProductNo:string|null, name:string}>}
 */
async function publishOne(mallId, productId, opts = {}) {
    const startedAt = Date.now();
    const credential = opts.credential || await getNaverCredential(mallId);
    const profile = opts.profile || await naverProfile.getProfile(mallId);

    const existing = await getMapping(mallId, productId);
    if (existing && existing.status === 'PUBLISHED' && existing.origin_product_no) {
        const err = new Error(
            `이미 네이버에 등록된 상품입니다(원상품번호 ${existing.origin_product_no}). 중복 등록을 막았습니다.`
        );
        err.alreadyPublished = true;
        err.originProductNo = existing.origin_product_no;
        throw err;
    }

    const { product, options, skus, subImages } = await loadProduct(mallId, productId);

    // 1) 자체 검증 — 네이버에 보내기 전에 막는다(호출 한도 보호 + 원인 명확화).
    const missing = mapper.validateBeforePublish({ product, profile, skus });
    if (missing.length) {
        throw new Error(`등록에 필요한 값이 없습니다: ${missing.join(', ')}`);
    }

    const mappingId = await upsertMapping(mallId, productId);
    await pool.query(
        'UPDATE channel_product_mapping SET status = ?, last_error = NULL WHERE id = ?',
        ['PUBLISHING', mappingId]
    );

    try {
        // 2) 이미지 업로드 — 외부 URL 직접 입력은 네이버가 거부한다.
        const detailImages = extractLocalImages(product.description);
        const allPaths = [product.main_image, ...subImages, ...detailImages]
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i);

        const up = await naverImages.uploadImages(credential, mallId, allPaths);
        const urlByPath = new Map(allPaths.map((p, i) => [p, up.urls[i]]).filter(([, u]) => u));

        const repImageUrl = urlByPath.get(product.main_image);
        const optionalUrls = subImages.map((p) => urlByPath.get(p)).filter(Boolean);

        // 3) 페이로드 조립
        const payload = mapper.buildProductPayload({
            product: { ...product, description: sanitize(product.description || '') },
            options,
            skus,
            profile,
            repImageUrl,
            optionalUrls,
            imageUrlMap: urlByPath,
            siteOrigin: SITE_ORIGIN,
            override: existing && existing.override_json ? existing.override_json : null,
        });

        // 4) 등록
        const res = await naverProducts.createProduct(credential, payload);

        const combos = payload.originProduct.detailAttribute.optionInfo
            ? payload.originProduct.detailAttribute.optionInfo.optionCombinations
            : null;
        await saveSkuMappings(mappingId, skus, combos);

        const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
        await pool.query(
            `UPDATE channel_product_mapping
                SET origin_product_no = ?, channel_product_no = ?, channel_product_name = ?,
                    status = 'PUBLISHED', sale_status = 'SALE', payload_hash = ?,
                    last_published_at = NOW(), last_error = NULL
              WHERE id = ?`,
            [res.originProductNo, res.channelProductNo, product.name, hash, mappingId]
        );

        await writeLog({
            mallId, productId, mappingId, action: 'CREATE', ok: true,
            httpStatus: 200,
            message: `등록 성공 (원상품 ${res.originProductNo} / 채널 ${res.channelProductNo || '-'})`
                + (res.traceId ? ` trace=${res.traceId}` : ''),
            request: payload, response: res.raw,
            durationMs: Date.now() - startedAt, actor: opts.actor,
        });

        return {
            productId,
            name: product.name,
            originProductNo: res.originProductNo,
            channelProductNo: res.channelProductNo,
            imagesUploaded: up.uploaded,
            imagesCached: up.cached,
        };
    } catch (e) {
        await pool.query(
            'UPDATE channel_product_mapping SET status = ?, last_error = ? WHERE id = ?',
            ['FAILED', String(e.message).slice(0, 2000), mappingId]
        );
        await writeLog({
            mallId, productId, mappingId, action: 'CREATE', ok: false,
            httpStatus: e.status || null,
            // 네이버 문의 시 필수인 추적 ID 를 반드시 남긴다.
            message: String(e.message) + (e.traceId ? ` [trace=${e.traceId}]` : ''),
            response: e.body || null,
            durationMs: Date.now() - startedAt, actor: opts.actor,
        });
        throw e;
    }
}

/**
 * 여러 건 등록 — **순차 처리**한다.
 * 병렬로 돌리면 이미지 업로드가 계정 단위 동시 1건 제약에 걸려 오히려 전부 실패한다.
 */
async function publishMany(mallId, productIds, opts = {}) {
    const list = (Array.isArray(productIds) ? productIds : [productIds]).map(Number).filter(Boolean);
    if (!list.length) throw new Error('등록할 상품을 선택하세요.');

    const overLimit = list.length > BATCH_LIMIT;
    const targets = list.slice(0, BATCH_LIMIT);

    // 자격증명·프로필은 한 번만 읽어 건마다 재조회하지 않는다.
    const credential = await getNaverCredential(mallId);
    const profile = await naverProfile.getProfile(mallId);
    const profileMissing = naverProfile.validateProfile(profile);
    if (profileMissing.length) {
        throw new Error(`네이버 등록 기본값이 비어 있습니다: ${profileMissing.join(', ')} — [네이버 등록 설정]에서 먼저 채우세요.`);
    }

    const results = [];
    let success = 0, failed = 0, skipped = 0;

    for (const id of targets) {
        try {
            const r = await publishOne(mallId, id, { ...opts, credential, profile });
            success++;
            results.push({ productId: id, ok: true, ...r });
        } catch (e) {
            if (e.alreadyPublished) {
                skipped++;
                results.push({ productId: id, ok: false, skipped: true, error: e.message });
            } else {
                failed++;
                results.push({ productId: id, ok: false, error: e.message, traceId: e.traceId || null });
            }
        }
    }

    return {
        requested: list.length,
        processed: targets.length,
        overLimit,
        limit: BATCH_LIMIT,
        success, failed, skipped, results,
    };
}

/**
 * 등록 후 실제 상태 재확인.
 *
 * 네이버는 등록 요청에 200 을 주고 나서 **사후에** 카테고리를 강제 이동시키거나
 * 판매금지(PROHIBITION)로 바꿀 수 있다. 즉 "200 성공 ≠ 정상 판매중" 이다.
 * 그래서 등록 후 한 번은 실제 상태를 되읽어 매핑에 반영해야 한다.
 */
async function verifyPublished(mallId, productId) {
    const mapping = await getMapping(mallId, productId);
    if (!mapping || !mapping.origin_product_no) throw new Error('등록 매핑이 없습니다.');

    const credential = await getNaverCredential(mallId);
    const res = await naverProducts.getOriginProduct(credential, mapping.origin_product_no);
    const origin = (res && res.originProduct) || res || {};
    const statusType = origin.statusType || null;
    const leafCategoryId = origin.leafCategoryId != null ? String(origin.leafCategoryId) : null;

    // 판매 불가 상태로 바뀌었으면 매핑 상태도 내려야 화면이 사실을 보여 준다.
    const bad = ['PROHIBITION', 'REJECTION', 'UNADMISSION', 'SUSPENSION', 'CLOSE'];
    const nextStatus = bad.includes(statusType) ? 'SUSPENDED' : 'PUBLISHED';

    await pool.query(
        'UPDATE channel_product_mapping SET sale_status = ?, status = ? WHERE id = ?',
        [statusType, nextStatus, mapping.id]
    );

    const [pr] = await pool.query('SELECT naver_category_id FROM products WHERE id = ? LIMIT 1', [productId]);
    const requested = pr.length ? pr[0].naver_category_id : null;
    const categoryMoved = !!(leafCategoryId && requested && String(requested) !== leafCategoryId);

    await writeLog({
        mallId, productId, mappingId: mapping.id, action: 'FETCH', ok: true,
        message: `상태 확인: ${statusType}${categoryMoved ? ` / 카테고리 강제 이동 ${requested} → ${leafCategoryId}` : ''}`,
        response: origin, actor: 'verify',
    });

    return { statusType, leafCategoryId, categoryMoved, status: nextStatus };
}

module.exports = {
    publishOne,
    publishMany,
    verifyPublished,
    loadProduct,
    getMapping,
    getNaverCredential,
    extractLocalImages,
    BATCH_LIMIT,
    CHANNEL,
};
