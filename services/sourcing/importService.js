/*
 * 공급처 상품 가져오기 — 검색 · 중간 테이블 적재 · 조회.
 * 설계: docs/사이트개선/도매꾹_온채널_스마트스토어_연동_상세설계.md §6
 * 개발계획: docs/사이트개선/도매꾹_온채널_스마트스토어_연동_개발계획서.md Phase 2
 *
 * 흐름:
 *   [검색] 공급처 API 목록 조회 (저장 안 함)
 *     → [가져오기] 선택 건만 상세 조회 → supplier_product/supplier_variant 적재
 *     → [가져온 상품] 목록에서 확인 · 재수집 · 삭제
 *
 * ⚠ "가져오기 ≠ 상품 등록"이다. 여기는 공급처 원본 스냅샷까지만 담당한다.
 *   빌더 상품(편집 대상) 변환과 스마트스토어 등록은 Phase 3(builder_product)이다.
 *
 * 몰 스코프는 항상 mall_id(관리자 화면에서는 req.adminMallId). 몰 간 데이터 공유 없음.
 */

const pool = require('../../config/db');
const cred = require('./credential');
const { resolveCredentialChannel } = require('./adapters');
const domeggook = require('./supplier/domeggook');

// 한 번의 "가져오기"에서 처리할 최대 건수.
// 도매꾹 호출 간격이 350ms 라 50건이면 약 18초. 그 이상은 화면이 죽은 것처럼 보인다.
const MAX_IMPORT_BATCH = 50;

const SUPPLIER_LABEL = {
    DOMEGGOOK: '도매꾹',
    DOMEME: '도매매',
    ONCHANNEL: '온채널',
};

// 공급처 → 어댑터. 온채널은 L1(CSV·수동)이라 API 어댑터가 없다(설계서 §3.3).
function getAdapter(supplier) {
    if (supplier === 'DOMEGGOOK' || supplier === 'DOMEME') return domeggook;
    if (supplier === 'ONCHANNEL') {
        throw new Error('온채널은 API 연동이 아닌 수동·CSV(L1) 방식입니다 — 상품 가져오기를 지원하지 않습니다.');
    }
    throw new Error('알 수 없는 공급처: ' + supplier);
}

/** 공급처에 맞는 자격증명 로드(도매매는 도매꾹 키 공용). 없으면 안내 메시지와 함께 throw. */
async function resolveCredential(mallId, supplier) {
    const channel = resolveCredentialChannel(supplier);
    const c = await cred.getCredentialByChannel(mallId, channel);
    if (!c) {
        // "아직 설정하지 않음"은 서버 장애가 아니다. 호출부가 4xx 로 응답할 수 있게 코드를 붙인다
        // (그냥 던지면 전부 500 이 되어 모니터링에서 진짜 장애와 섞인다).
        const err = new Error(
            `${SUPPLIER_LABEL[supplier] || supplier} 자격증명이 없습니다 — [공급처/채널 연결]에서 Open API Key 를 등록하세요.`
        );
        err.code = 'NO_CREDENTIAL';
        throw err;
    }
    return c;
}

// ---------------------------------------------------------------------------
// 검색 (저장하지 않음)
// ---------------------------------------------------------------------------

/**
 * 공급처 상품 검색. 이미 가져온 상품은 alreadyImported 로 표시해 중복 클릭을 줄인다.
 * @returns {Promise<{items, total, page, totalPages, size}>}
 */
async function searchSupplier(mallId, opts = {}) {
    const supplier = opts.supplier || 'DOMEGGOOK';
    const adapter = getAdapter(supplier);
    const c = await resolveCredential(mallId, supplier);

    const res = await adapter.search(c, {
        supplier,
        keyword: opts.keyword,
        categoryCode: opts.categoryCode,
        page: opts.page,
        size: opts.size,
        sort: opts.sort,
    });

    // 이미 적재된 상품번호 표시
    const nos = res.items.map((i) => i.itemNo);
    let imported = new Set();
    if (nos.length) {
        const [rows] = await pool.query(
            `SELECT supplier_item_no FROM supplier_product
              WHERE mall_id = ? AND supplier = ? AND supplier_item_no IN (?)`,
            [mallId, supplier, nos]
        );
        imported = new Set(rows.map((r) => String(r.supplier_item_no)));
    }

    return {
        ...res,
        items: res.items.map((i) => ({ ...i, alreadyImported: imported.has(i.itemNo) })),
    };
}

// ---------------------------------------------------------------------------
// 적재
// ---------------------------------------------------------------------------

/** 정규화된 상품 1건을 트랜잭션으로 upsert 한다. 재실행하면 최신 스냅샷으로 덮어쓴다. */
async function upsertProduct(mallId, product, variants, actor) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // raw_json 에서 상세 HTML 은 뺀다 — detail_html 컬럼과 중복이라 행이 불필요하게 커진다.
        const rawLean = { ...product.raw };
        if (rawLean.desc) rawLean.desc = { ...rawLean.desc, contents: undefined };

        const [r] = await conn.query(
            `INSERT INTO supplier_product (
                mall_id, supplier, supplier_item_no,
                title, status_text, thumb_url, source_url,
                supply_price, currency, moq, unit_qty, inventory_qty,
                deli_method, deli_pay, deli_fee_type, deli_fee_table,
                deli_fee_jeju, deli_fee_islands, from_oversea,
                seller_id, seller_nick, seller_company,
                category_code, category_name, category_depth,
                country, manufacturer, model_name, weight_g, size_text,
                tax_type, info_duty_type, adult_only,
                resale_allowed, resale_msg,
                detail_html, notice_html, images_json,
                option_type, raw_json,
                import_status, last_error, imported_by, detail_fetched_at
             ) VALUES (?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?, ?,?,?, ?,?,?,?,?, ?,?,?, ?,?, ?,?,?, ?,?, 'DETAILED', NULL, ?, NOW())
             ON DUPLICATE KEY UPDATE
                title = VALUES(title), status_text = VALUES(status_text),
                thumb_url = VALUES(thumb_url), source_url = VALUES(source_url),
                supply_price = VALUES(supply_price), moq = VALUES(moq),
                unit_qty = VALUES(unit_qty), inventory_qty = VALUES(inventory_qty),
                deli_method = VALUES(deli_method), deli_pay = VALUES(deli_pay),
                deli_fee_type = VALUES(deli_fee_type), deli_fee_table = VALUES(deli_fee_table),
                deli_fee_jeju = VALUES(deli_fee_jeju), deli_fee_islands = VALUES(deli_fee_islands),
                from_oversea = VALUES(from_oversea),
                seller_id = VALUES(seller_id), seller_nick = VALUES(seller_nick),
                seller_company = VALUES(seller_company),
                category_code = VALUES(category_code), category_name = VALUES(category_name),
                category_depth = VALUES(category_depth),
                country = VALUES(country), manufacturer = VALUES(manufacturer),
                model_name = VALUES(model_name), weight_g = VALUES(weight_g),
                size_text = VALUES(size_text), tax_type = VALUES(tax_type),
                info_duty_type = VALUES(info_duty_type), adult_only = VALUES(adult_only),
                resale_allowed = VALUES(resale_allowed), resale_msg = VALUES(resale_msg),
                detail_html = VALUES(detail_html), notice_html = VALUES(notice_html),
                images_json = VALUES(images_json),
                option_type = VALUES(option_type), raw_json = VALUES(raw_json),
                import_status = 'DETAILED', last_error = NULL,
                detail_fetched_at = NOW()`,
            [
                mallId, product.supplier, product.supplierItemNo,
                product.title, product.statusText, product.thumbUrl, product.sourceUrl,
                product.supplyPrice, product.currency || 'KRW', product.moq, product.unitQty, product.inventoryQty,
                product.deliMethod, product.deliPay, product.deliFeeType, product.deliFeeTable,
                product.deliFeeJeju, product.deliFeeIslands, product.fromOversea,
                product.sellerId, product.sellerNick, product.sellerCompany,
                product.categoryCode, product.categoryName, product.categoryDepth,
                product.country, product.manufacturer, product.modelName, product.weightG, product.sizeText,
                product.taxType, product.infoDutyType, product.adultOnly,
                product.resaleAllowed, product.resaleMsg,
                product.detailHtml, product.noticeHtml, JSON.stringify(product.images || []),
                product.optionType, JSON.stringify(rawLean),
                actor || null,
            ]
        );

        // insertId 는 INSERT 일 때만 유효하다. UPDATE 였다면 다시 조회한다.
        let productId = r.insertId;
        if (!productId) {
            const [ex] = await conn.query(
                `SELECT id FROM supplier_product
                  WHERE mall_id = ? AND supplier = ? AND supplier_item_no = ? LIMIT 1`,
                [mallId, product.supplier, product.supplierItemNo]
            );
            if (!ex.length) throw new Error('적재 후 상품 행을 찾지 못했습니다.');
            productId = ex[0].id;
        }

        // 옵션은 전량 교체 — 공급처에서 사라진 옵션이 남으면 재고·주문이 어긋난다.
        await conn.query('DELETE FROM supplier_variant WHERE supplier_product_id = ?', [productId]);
        if (variants.length) {
            await conn.query(
                `INSERT INTO supplier_variant
                    (supplier_product_id, opt_code, opt_hash, opt_name, extra_price, qty, is_hidden, available, raw_json)
                 VALUES ?`,
                [variants.map((v) => [
                    productId, v.optCode, v.optHash, v.optName,
                    v.extraPrice || 0, v.qty, v.isHidden ? 1 : 0, v.available ? 1 : 0,
                    JSON.stringify(v.raw || {}),
                ])]
            );
        }

        await conn.commit();
        return productId;
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}

/** 상세 수집 실패를 행으로 남긴다(목록에서 실패 사유를 보이게 — 조용한 실패 금지). */
async function markFailed(mallId, supplier, itemNo, message, actor) {
    try {
        await pool.query(
            `INSERT INTO supplier_product (mall_id, supplier, supplier_item_no, title, import_status, last_error, imported_by)
             VALUES (?, ?, ?, ?, 'FAILED', ?, ?)
             ON DUPLICATE KEY UPDATE import_status = 'FAILED', last_error = VALUES(last_error)`,
            [mallId, supplier, String(itemNo), `(수집 실패) ${itemNo}`, String(message || '').slice(0, 500), actor || null]
        );
    } catch (e) {
        console.error('[sourcing/import] 실패 기록 실패:', e.message);
    }
}

/**
 * 선택 상품 가져오기 — 상세 조회 후 중간 테이블에 적재.
 * 한 건이 실패해도 나머지는 계속 진행하고, 실패는 결과에 담아 돌려준다.
 *
 * @returns {Promise<{requested, success, failed, results:Array, truncated:boolean}>}
 */
async function importItems(mallId, { supplier = 'DOMEGGOOK', itemNos = [], actor = null } = {}) {
    const adapter = getAdapter(supplier);
    const c = await resolveCredential(mallId, supplier);

    const uniq = [...new Set((itemNos || []).map((n) => String(n).trim()).filter(Boolean))];
    if (!uniq.length) throw new Error('가져올 상품을 선택하세요.');

    // 상한 초과분은 조용히 버리지 않고 잘렸다는 사실을 결과에 담는다.
    const targets = uniq.slice(0, MAX_IMPORT_BATCH);
    const truncated = uniq.length > MAX_IMPORT_BATCH;

    const results = [];
    let success = 0;
    let failed = 0;

    for (const itemNo of targets) {
        try {
            const { product, variants } = await adapter.detail(c, itemNo, supplier);
            const id = await upsertProduct(mallId, product, variants, actor);
            success++;
            results.push({
                itemNo, ok: true, id,
                title: product.title,
                variantCount: variants.length,
                resaleAllowed: product.resaleAllowed,
            });
        } catch (e) {
            failed++;
            await markFailed(mallId, supplier, itemNo, e.message, actor);
            results.push({ itemNo, ok: false, error: e.message });
        }
    }

    await logImport(mallId, {
        supplier, action: 'IMPORT',
        requested: targets.length, success, failed,
        message: truncated ? `요청 ${uniq.length}건 중 상한 ${MAX_IMPORT_BATCH}건만 처리` : null,
        actor,
    });

    return { requested: targets.length, success, failed, results, truncated, limit: MAX_IMPORT_BATCH };
}

/** 이미 적재된 상품 1건을 공급처에서 다시 수집(가격·재고 갱신). */
async function refreshItem(mallId, id, actor) {
    const [rows] = await pool.query(
        'SELECT supplier, supplier_item_no FROM supplier_product WHERE mall_id = ? AND id = ? LIMIT 1',
        [mallId, id]
    );
    if (!rows.length) throw new Error('상품을 찾을 수 없습니다.');
    const { supplier, supplier_item_no: itemNo } = rows[0];

    const res = await importItems(mallId, { supplier, itemNos: [itemNo], actor });
    if (res.failed) throw new Error(res.results[0].error || '재수집 실패');
    return res.results[0];
}

async function logImport(mallId, { supplier, action, keyword, categoryCode, requested, success, failed, message, actor }) {
    try {
        await pool.query(
            `INSERT INTO supplier_import_log
                (mall_id, supplier, action, keyword, category_code, requested_cnt, success_cnt, failed_cnt, message, actor)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [mallId, supplier, action, keyword || null, categoryCode || null,
             requested || 0, success || 0, failed || 0, message || null, actor || null]
        );
    } catch (e) {
        // 이력 실패가 본 기능을 막으면 안 된다.
        console.error('[sourcing/import] 이력 기록 실패:', e.message);
    }
}

// ---------------------------------------------------------------------------
// 조회 (가져온 상품 = 중간 테이블)
// ---------------------------------------------------------------------------

async function listStaging(mallId, { supplier, q, status, published, resale, page = 1, size = 20 } = {}) {
    const where = ['sp.mall_id = ?'];
    const params = [mallId];

    if (supplier) { where.push('sp.supplier = ?'); params.push(supplier); }
    if (status) { where.push('sp.import_status = ?'); params.push(status); }
    // 우리 몰 등록 여부 — Y=등록됨, N=미등록
    if (published === 'Y') where.push('sp.mall_product_id IS NOT NULL');
    else if (published === 'N') where.push('sp.mall_product_id IS NULL');
    /*
     * 재판매 여부 — 스마트스토어에 보낼 대상을 고를 때 금지 상품을 미리 걸러 내기 위한 필터.
     * resale_allowed 는 0=금지 / 1=가능 / NULL=미확인 이므로 "제외"는 0만 뺀다
     * (미확인을 함께 빼면 대부분의 상품이 목록에서 사라진다).
     */
    if (resale === 'OK') where.push('(sp.resale_allowed IS NULL OR sp.resale_allowed <> 0)');
    else if (resale === 'BLOCKED') where.push('sp.resale_allowed = 0');
    if (q) {
        where.push('(sp.title LIKE ? OR sp.supplier_item_no = ?)');
        params.push(`%${q}%`, String(q).trim());
    }
    const whereSql = where.join(' AND ');

    const pg = Math.max(Number(page) || 1, 1);
    const sz = Math.min(Math.max(Number(size) || 20, 1), 100);
    const offset = (pg - 1) * sz;

    const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM supplier_product sp WHERE ${whereSql}`,
        params
    );
    const [rows] = await pool.query(
        `SELECT sp.*,
                (SELECT COUNT(*) FROM supplier_variant v WHERE v.supplier_product_id = sp.id) AS variant_count
           FROM supplier_product sp
          WHERE ${whereSql}
          ORDER BY sp.imported_at DESC, sp.id DESC
          LIMIT ? OFFSET ?`,
        [...params, sz, offset]
    );

    return {
        rows, total, page: pg, size: sz,
        totalPages: Math.max(Math.ceil(total / sz), 1),
    };
}

async function getStaging(mallId, id) {
    const [rows] = await pool.query(
        'SELECT * FROM supplier_product WHERE mall_id = ? AND id = ? LIMIT 1',
        [mallId, id]
    );
    if (!rows.length) return null;
    const [variants] = await pool.query(
        'SELECT * FROM supplier_variant WHERE supplier_product_id = ? ORDER BY opt_code',
        [id]
    );
    return { product: rows[0], variants };
}

/** 중간 테이블에서 삭제(옵션은 FK CASCADE). 공급처 원본에는 영향 없다. */
async function deleteStaging(mallId, ids) {
    const list = (Array.isArray(ids) ? ids : [ids]).map(Number).filter(Boolean);
    if (!list.length) return 0;
    const [r] = await pool.query(
        'DELETE FROM supplier_product WHERE mall_id = ? AND id IN (?)',
        [mallId, list]
    );
    return r.affectedRows;
}

/** 상단 요약 카드용 집계. */
async function getStats(mallId) {
    const [[row]] = await pool.query(
        `SELECT COUNT(*) AS total,
                SUM(import_status = 'DETAILED') AS detailed,
                SUM(import_status = 'FAILED')   AS failed,
                SUM(resale_allowed = 0)         AS resale_blocked,
                SUM(mall_product_id IS NOT NULL) AS published,
                MAX(imported_at)                AS last_imported_at
           FROM supplier_product WHERE mall_id = ?`,
        [mallId]
    );
    const total = Number(row.total) || 0;
    const published = Number(row.published) || 0;
    return {
        total,
        detailed: Number(row.detailed) || 0,
        failed: Number(row.failed) || 0,
        resaleBlocked: Number(row.resale_blocked) || 0,
        published,
        unpublished: total - published,
        lastImportedAt: row.last_imported_at,
    };
}

module.exports = {
    MAX_IMPORT_BATCH,
    SUPPLIER_LABEL,
    getAdapter,
    resolveCredential,
    searchSupplier,
    importItems,
    refreshItem,
    listStaging,
    getStaging,
    deleteStaging,
    getStats,
    logImport,
};
