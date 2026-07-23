/*
 * 스토어 상품 가져오기 (역방향) — **네이버 스마트스토어 → 우리 몰**.
 * 설계: docs/사이트개선/네이버_스마트스토어_연동.md §1 방향 정의 / §15
 *       docs/사이트개선/도매꾹_온채널_스마트스토어_연동_상세설계.md §10
 *
 * ⚠ 방향을 반드시 확인할 것. 이 저장소에는 "등록/가져오기"가 반대 방향 여러 곳에 쓰인다.
 *     naverPublishService  : 우리 몰 → 네이버   (아웃바운드)
 *     publishService       : 공급처 → 우리 몰   (도매꾹 staging 승격)
 *     **이 파일**           : 네이버 → 우리 몰   (역방향)
 *
 * 판매자가 스마트스토어에 직접 등록해 둔 상품을 우리 몰 상품(products)으로 만들어
 * 재고·주문을 한 곳에서 관리할 수 있게 한다.
 *
 * 설계 판단
 *   - 상품 생성은 publishService.publishToMall 과 **같은 규칙**을 따른다.
 *     (옵션상품은 대표 SKU 없음 / 단일상품만 is_default=1 / 이미지는 내려받아 로컬 저장 /
 *      슬러그 전역 유니크 / 부분 삽입 방지를 위해 트랜잭션)
 *     상품 생성 규칙이 두 벌이 되면 재고·주문이 조용히 어긋난다.
 *   - **우리가 올린 상품(source_type='BUILDER')은 다시 가져오지 않는다.** 그대로 두면
 *     같은 상품이 우리 몰에 두 개 생긴다. 매핑을 origin/channel 상품번호로 먼저 조회한다.
 *   - 재실행이 idempotent 해야 한다. 이미 가져온 건은 실패가 아니라 **건너뜀**으로 센다.
 *
 * ✅ 검증 상태 — 목록 조회(`POST /v1/products/search`)는 2026-07-23 실호출로 확인했다.
 *   응답은 `contents[].channelProducts[]` 중첩이고, 요청은 `orderType` 을 **보내면 400** 이다.
 *   상세는 기존 `GET /v2/products/origin-products/{no}` 를 그대로 쓴다.
 *   그래도 **요청 조립·응답 정규화는 각각 함수 하나에 가둬 둔다**
 *   (buildSearchRequest / normalizeSearchResponse / normalizeOriginProduct).
 *   스펙이 바뀌면 고칠 곳은 그 셋뿐이고 화면·적재 코드는 우리 shape 만 본다.
 *   모든 호출의 원본 응답은 channel_publish_log(action='FETCH') 에 남는다.
 */

const pool = require('../../../config/db');
const cred = require('../credential');
const naverProducts = require('./naverProducts');
const { writeLog, CHANNEL } = require('./channelLog');
const { generateUniqueSlugFromName } = require('../../catalog/slugService');
const taxonomyResolver = require('../../catalog/taxonomyResolver');
const { sanitize } = require('../../display/htmlSanitizer');
const urlIngest = require('../../media/urlIngest');

// products.name 은 varchar(100). 네이버 상품명은 최대 100 자라 보통 그대로 들어간다.
const MAX_NAME_LEN = 100;
// 상세 이미지(추가이미지)는 네이버도 9장까지다.
const MAX_SUB_IMAGES = 9;
// 1회 가져오기 상한. 건당 상세조회 1회 + 이미지 N장 다운로드라 이 선에서 끊는다.
const IMPORT_LIMIT = 20;
// 목록 1페이지 크기. 네이버 페이징 규약상 흔히 쓰이는 값들만 노출한다.
const PAGE_SIZES = [10, 50, 100];

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
// 네이버 응답 ↔ 우리 shape — **변환은 이 절에만 있다**
// ---------------------------------------------------------------------------

/**
 * 목록 조회 요청 조립. 스펙이 바뀌면 여기만 고친다.
 *
 * ★ 2026-07-23 실호출로 확정한 것(추정 아님)
 *   - `orderType` 은 **보내면 400** 이다(`허용하지 않는 정렬조건입니다`). 생략하면
 *     네이버가 regDate DESC + productNo DESC 로 정렬해 준다 → 아예 보내지 않는다.
 *   - 동작이 확인된 검색조건은 **두 가지뿐**이다.
 *       searchKeywordType='SELLER_CODE'       + sellerManagementCode (문자열)
 *       searchKeywordType='CHANNEL_PRODUCT_NO'+ channelProductNos     (숫자 배열)
 *   - **상품명 검색은 제공되지 않는다.** `CHANNEL_PRODUCT_NAME` 은 enum 으로 통과하지만
 *     짝 필드를 찾을 수 없었다(channelProductName·productName·searchKeyword·keyword·name·
 *     channelProductNames·productNames·searchKeywordValue·searchWord 전부 **조용히 무시**).
 *     그래서 상품명은 화면에서 **조회된 목록을 걸러 보는 방식**으로만 제공한다.
 *     여기서 이름 파라미터를 지어내면 "검색했는데 엉뚱한 게 나오는" 화면이 된다.
 *
 * @param {{page?:number, size?:number, code?:string, statusTypes?:string[]}} opts
 *        code — 판매자관리코드 또는 채널상품번호. 형태로 구분한다(사용자가 고르지 않아도 되게).
 */
function buildSearchRequest(opts = {}) {
    const size = PAGE_SIZES.includes(Number(opts.size)) ? Number(opts.size) : 50;
    const body = {
        page: Math.max(toInt(opts.page, 1), 1),
        size,
        // 판매중·품절·판매중지까지 본다. 삭제분(DELETE)은 가져올 이유가 없다.
        productStatusTypes: Array.isArray(opts.statusTypes) && opts.statusTypes.length
            ? opts.statusTypes
            : ['SALE', 'OUTOFSTOCK', 'SUSPENSION'],
    };

    const code = String(opts.code || '').trim();
    if (code) {
        // 채널상품번호는 10자리 이상 숫자다. 그보다 짧거나 문자가 섞이면 판매자관리코드로 본다.
        if (/^\d{10,}$/.test(code)) {
            body.searchKeywordType = 'CHANNEL_PRODUCT_NO';
            body.channelProductNos = [Number(code)];
        } else {
            body.searchKeywordType = 'SELLER_CODE';
            body.sellerManagementCode = code;
        }
    }
    return body;
}

/**
 * 목록 응답 정규화.
 *
 * 네이버는 `contents[].channelProducts[]` 로 원상품 아래 채널상품을 중첩해 준다.
 * 우리는 **채널상품 1건 = 목록 1행** 으로 편다(스마트스토어 노출 단위가 그것이므로).
 * 실응답 기준으로 맞췄지만, 필드가 빠져도 화면이 깨지지 않도록 방어적으로 읽는다.
 */
function normalizeSearchResponse(res) {
    const root = res || {};
    const contents = Array.isArray(root.contents) ? root.contents
        : (Array.isArray(root) ? root : []);

    const items = [];
    for (const c of contents) {
        const originNo = c.originProductNo != null ? String(c.originProductNo) : null;
        const channels = Array.isArray(c.channelProducts) && c.channelProducts.length
            ? c.channelProducts
            : [c]; // 채널 중첩이 없으면 원상품 자체를 1행으로 본다.

        for (const ch of channels) {
            const no = originNo || (ch.originProductNo != null ? String(ch.originProductNo) : null);
            if (!no) continue;
            items.push({
                originProductNo: no,
                channelProductNo: ch.channelProductNo != null ? String(ch.channelProductNo) : null,
                name: ch.name || ch.channelProductName || c.name || '(이름 없음)',
                statusType: ch.statusType || c.statusType || null,
                displayStatus: ch.channelProductDisplayStatusType || null,
                salePrice: toInt(ch.salePrice != null ? ch.salePrice : c.salePrice, 0),
                stockQuantity: toInt(ch.stockQuantity != null ? ch.stockQuantity : c.stockQuantity, 0),
                categoryId: ch.categoryId != null ? String(ch.categoryId)
                    : (c.categoryId != null ? String(c.categoryId) : null),
                categoryName: ch.wholeCategoryName || c.wholeCategoryName || null,
                imageUrl: (ch.representativeImage && ch.representativeImage.url)
                    || (c.representativeImage && c.representativeImage.url) || null,
                sellerManagementCode: ch.sellerManagementCode || c.sellerManagementCode || null,
                modelId: ch.modelId != null ? String(ch.modelId) : null,
            });
        }
    }

    return {
        items,
        page: toInt(root.page, 1),
        size: toInt(root.size, items.length),
        totalElements: toInt(root.totalElements, items.length),
        totalPages: toInt(root.totalPages, 1),
    };
}

/**
 * 원상품 상세 응답 → 우리 shape.
 *
 * 옵션 가격 역산 ★ — 네이버의 옵션 `price` 는 **판매가 대비 추가금액**이고
 * 우리 SKU 는 절대가다(naverMapper.buildOptionInfo 의 정확한 역연산).
 *
 *     sku 가격 = salePrice + combination.price
 */
function normalizeOriginProduct(res) {
    const root = res || {};
    const op = root.originProduct || root;
    const ch = root.smartstoreChannelProduct || {};
    const da = op.detailAttribute || {};
    const oi = da.optionInfo || {};

    const salePrice = toInt(op.salePrice, 0);

    // 옵션 축 이름 — 배열이 아니라 객체다({optionGroupName1: '색상', ...}).
    const groupNames = oi.optionCombinationGroupNames || {};
    const axisNames = [];
    for (let i = 1; i <= 3; i++) {
        const v = groupNames[`optionGroupName${i}`];
        if (v) axisNames.push(String(v));
    }

    const rawCombos = Array.isArray(oi.optionCombinations) ? oi.optionCombinations : [];
    const combinations = rawCombos.map((c, idx) => {
        const values = [];
        for (let i = 1; i <= Math.max(axisNames.length, 1); i++) {
            const v = c[`optionName${i}`];
            if (v != null && v !== '') values.push(String(v));
        }
        return {
            naverOptionId: c.id != null ? String(c.id) : null,
            values,
            // usable=false 는 "팔 수 없는 옵션". 우리 SKU 도 OFF 로 만들어야 재고가 안 꼬인다.
            usable: c.usable !== false,
            stock: toInt(c.stockQuantity, 0),
            price: salePrice + toInt(c.price, 0),
            extraPrice: toInt(c.price, 0),
            sellerManagerCode: c.sellerManagerCode || null,
            order: idx,
        };
    });

    const subImages = [];
    const optional = (op.images && op.images.optionalImages) || [];
    for (const im of Array.isArray(optional) ? optional : []) {
        if (im && im.url) subImages.push(String(im.url));
    }

    return {
        name: String(op.name || ch.channelProductName || '').slice(0, MAX_NAME_LEN),
        statusType: op.statusType || null,
        detailContent: op.detailContent || '',
        salePrice,
        stockQuantity: toInt(op.stockQuantity, 0),
        leafCategoryId: op.leafCategoryId != null ? String(op.leafCategoryId) : null,
        repImageUrl: (op.images && op.images.representativeImage && op.images.representativeImage.url) || null,
        subImageUrls: subImages.slice(0, MAX_SUB_IMAGES),
        axisNames,
        combinations,
        sellerManagementCode: (da.sellerCodeInfo && da.sellerCodeInfo.sellerManagementCode) || null,
        manufacturerName: (da.naverShoppingSearchInfo && da.naverShoppingSearchInfo.manufacturerName) || null,
        channelProductNo: ch.channelProductNo != null ? String(ch.channelProductNo) : null,
        channelProductName: ch.channelProductName || null,
    };
}

// ---------------------------------------------------------------------------
// 목록 조회 (읽기 전용)
// ---------------------------------------------------------------------------

/**
 * 이 몰이 이미 알고 있는 매핑을 원상품번호 기준으로 모아 준다.
 * 목록에 "우리가 올린 것 / 이미 가져온 것 / 새 것" 을 표시하기 위한 것.
 */
async function loadMappingsByOriginNo(mallId, originNos) {
    const list = [...new Set((originNos || []).filter(Boolean).map(String))];
    if (!list.length) return new Map();
    const [rows] = await pool.query(
        `SELECT m.*, p.name AS mall_product_name
           FROM channel_product_mapping m
           LEFT JOIN products p ON p.id = m.product_id
          WHERE m.mall_id = ? AND m.channel = ? AND m.origin_product_no IN (?)`,
        [mallId, CHANNEL, list]
    );
    return new Map(rows.map((r) => [String(r.origin_product_no), r]));
}

/**
 * 스토어 상품 목록 조회. **읽기만 한다** — 우리 DB 를 바꾸지 않는다.
 *
 * @returns {Promise<{items:Array, page:number, size:number, totalElements:number, totalPages:number}>}
 */
async function searchStoreProducts(mallId, opts = {}) {
    const startedAt = Date.now();
    const credential = opts.credential || await getNaverCredential(mallId);
    const body = buildSearchRequest(opts);

    let raw;
    try {
        raw = await naverProducts.searchProducts(credential, body);
    } catch (e) {
        await writeLog({
            mallId, action: 'FETCH', ok: false, httpStatus: e.status || null,
            message: `스토어 상품 목록 조회 실패: ${e.message}` + (e.traceId ? ` [trace=${e.traceId}]` : ''),
            request: body, response: e.body || null,
            durationMs: Date.now() - startedAt, actor: opts.actor,
        });
        throw e;
    }

    const norm = normalizeSearchResponse(raw);

    /*
     * 첫 호출의 **원본 응답을 통째로 남긴다.** 이 엔드포인트는 미검증이라
     * 이 로그가 곧 스펙 확인 수단이다(정규화 결과가 비면 원본을 보고 고친다).
     */
    await writeLog({
        mallId, action: 'FETCH', ok: true, httpStatus: 200,
        message: `스토어 상품 목록 ${norm.items.length}건 (page ${norm.page}/${norm.totalPages || 1}, 전체 ${norm.totalElements})`
            + (norm.items.length === 0 ? ' — 정규화 결과 0건. 응답 원본을 확인하세요.' : ''),
        request: body, response: raw,
        durationMs: Date.now() - startedAt, actor: opts.actor,
    });

    // 우리 쪽 상태를 붙인다 — 어떤 게 새 상품인지 화면에서 바로 보여야 한다.
    const mappings = await loadMappingsByOriginNo(mallId, norm.items.map((i) => i.originProductNo));
    for (const item of norm.items) {
        const m = mappings.get(item.originProductNo) || null;
        item.mapping = m;
        if (!m) {
            item.linkState = 'NEW';           // 아직 우리 몰에 없다 — 가져올 수 있다
        } else if (m.source_type === 'BUILDER') {
            item.linkState = 'BUILDER';       // 우리가 올린 상품 — 되가져오면 중복이 된다
        } else {
            item.linkState = 'IMPORTED';      // 이미 가져왔다
        }
        item.mallProductId = m ? m.product_id : null;
        item.mallProductName = m ? m.mall_product_name : null;
    }

    return norm;
}

// ---------------------------------------------------------------------------
// 가져오기 (우리 몰 상품 생성)
// ---------------------------------------------------------------------------

/**
 * 네이버 리프 카테고리 → 우리 몰 카테고리.
 *
 * ★ 네이버 리프는 L4 가 대부분(활성 리프 4,999 중 3,468)인데 우리 글로벌 카테고리는
 *   **네이버 L1~L3 만** 시드한다(categoryReflect — 우리 카테고리가 최대 3뎁스라서).
 *   그래서 ID 완전일치만 보면 L4 상품이 전부 미분류로 떨어진다.
 *   L3 까지는 항상 반영돼 있으므로 **L4 는 상위 L3 로 잘라 비교**한다
 *   (예: 스포츠/레저>등산>등산의류>반팔티셔츠 → 등산의류).
 *   이 폴백은 상품 폼 저장 경로가 쓰는 taxonomyResolver 와 같은 함수를 재사용한다
 *   — 같은 상품이 어느 경로로 들어오든 같은 카테고리에 붙어야 한다.
 *
 * 매칭이 없으면 null 을 돌려주고 **가져오기를 막지 않는다**(미분류로 들어온다).
 *
 * ⚠ collation 드리프트 — categories.naver_category_id 는 general_ci, naver_category 는
 *   unicode_ci 다. 여기서는 컬럼 vs 파라미터 비교라 충돌하지 않지만,
 *   naver_category 를 조인할 때는 반드시 COLLATE 를 명시해야 한다(§8).
 */
async function resolveMallCategory(mallId, leafCategoryId) {
    if (!leafCategoryId) return null;

    // 1) 몰 전용 카테고리를 포함한 완전일치(L1~L3, 또는 운영자가 직접 연결해 둔 L4).
    const [rows] = await pool.query(
        `SELECT id FROM categories
          WHERE type = 'NORMAL' AND mall_id IN (0, ?) AND naver_category_id = ?
          ORDER BY depth DESC, id
          LIMIT 1`,
        [mallId, String(leafCategoryId)]
    );
    if (rows.length) return Number(rows[0].id);

    // 2) L4 → 상위 L3 폴백(글로벌 카테고리 기준).
    const hit = await taxonomyResolver.resolveByNaverCategoryId({ naverCategoryId: String(leafCategoryId) });
    return hit && hit.id ? Number(hit.id) : null;
}

/**
 * 이미지 수집 — 네이버 CDN URL 을 내려받아 우리 /uploads 로 옮긴다.
 * 실패한 장은 건너뛴다(가져오기 자체를 막지 않는다).
 */
async function ingestImages(detail) {
    let main = null;
    let failed = 0;

    if (detail.repImageUrl) {
        try {
            main = await urlIngest.ingestImageFromUrl(detail.repImageUrl, { dest: 'products' });
        } catch (e) {
            failed++;
            console.error('[naver/import] 대표이미지 저장 실패:', e.message);
        }
    }

    const subs = [];
    for (const url of detail.subImageUrls) {
        try {
            subs.push(await urlIngest.ingestImageFromUrl(url, { dest: 'products' }));
        } catch (e) {
            failed++;
            console.error('[naver/import] 추가이미지 저장 실패:', url, e.message);
        }
    }

    if (!main && subs.length) main = subs[0];
    return { main, subs, failed };
}

/** 이미 이 원상품과 연결된 매핑이 있는지. 중복 상품 생성의 최종 방어선. */
async function findMappingByOriginNo(mallId, originProductNo) {
    const [rows] = await pool.query(
        `SELECT * FROM channel_product_mapping
          WHERE mall_id = ? AND channel = ? AND origin_product_no = ?
          LIMIT 1`,
        [mallId, CHANNEL, String(originProductNo)]
    );
    return rows[0] || null;
}

/**
 * 스토어 상품 1건을 우리 몰 상품으로 가져온다.
 *
 * @param {number} mallId
 * @param {string} originProductNo 네이버 **원상품**번호(채널상품번호가 아니다)
 * @param {{actor?:string, credential?:object, fallbackCategoryId?:number,
 *          status?:string, visibility?:string, channelProductNo?:string}} opts
 *
 * ⚠ channelProductNo 는 **목록 응답에만 있고 상세 응답에는 없다**(실호출 확인 —
 *   `GET /v2/products/origin-products/{no}` 의 smartstoreChannelProduct 에 번호가 빠져 있다).
 *   그래서 목록에서 본 값을 여기로 들고 온다. 없으면 NULL 로 두고 원상품번호만 쓴다
 *   — 두 번호는 별개이므로 원상품번호를 채널상품번호 자리에 넣으면 안 된다(§4).
 */
async function importOne(mallId, originProductNo, opts = {}) {
    const startedAt = Date.now();
    const credential = opts.credential || await getNaverCredential(mallId);
    const no = String(originProductNo);

    // 1) 중복 방어 — 우리가 올린 것(BUILDER)은 되가져오지 않는다.
    const existing = await findMappingByOriginNo(mallId, no);
    if (existing) {
        const err = new Error(
            existing.source_type === 'BUILDER'
                ? `우리 몰에서 네이버로 등록한 상품입니다(상품번호 ${existing.product_id}). 되가져오면 상품이 중복됩니다.`
                : `이미 가져온 상품입니다(상품번호 ${existing.product_id}).`
        );
        err.alreadyLinked = true;
        err.mallProductId = existing.product_id;
        err.sourceType = existing.source_type;
        throw err;
    }

    // 2) 상세 조회 — 목록 응답에는 옵션·상세HTML 이 없다.
    let raw;
    try {
        raw = await naverProducts.getOriginProduct(credential, no);
    } catch (e) {
        await writeLog({
            mallId, action: 'FETCH', ok: false, httpStatus: e.status || null,
            message: `원상품 ${no} 상세 조회 실패: ${e.message}` + (e.traceId ? ` [trace=${e.traceId}]` : ''),
            response: e.body || null, durationMs: Date.now() - startedAt, actor: opts.actor,
        });
        throw e;
    }

    const detail = normalizeOriginProduct(raw);
    if (!detail.name) throw new Error(`원상품 ${no} 응답에 상품명이 없습니다 — 가져올 수 없습니다.`);
    // 채널상품번호는 상세 응답에 없다 — 목록에서 본 값을 받아 채운다.
    const channelProductNo = detail.channelProductNo
        || (opts.channelProductNo ? String(opts.channelProductNo) : null);

    // 3) 카테고리 — 자동 매핑 → 화면에서 고른 기본값 → 미분류(NULL 허용, 가져오기를 막지 않는다)
    const autoCategoryId = await resolveMallCategory(mallId, detail.leafCategoryId);
    const categoryId = autoCategoryId || (Number(opts.fallbackCategoryId) || null);

    // 4) 이미지는 외부 I/O 라 트랜잭션 밖에서 먼저 끝낸다(락 유지 시간 최소화).
    const img = await ingestImages(detail);

    const usable = detail.combinations.filter((c) => c.values.length > 0);
    const isOption = detail.axisNames.length > 0 && usable.length > 0;
    const slug = await generateUniqueSlugFromName(detail.name, null, null);
    const description = sanitize(detail.detailContent || '');

    /*
     * 가져온 상품은 우리 몰 기준으로는 검수 전이다(상세 HTML 은 네이버 원문, 배송·고시는
     * 우리 정책과 다를 수 있다). 그래서 기본값은 판매중지 + 비노출이다.
     * 화면에서 "바로 판매중" 을 고르면 그때만 켠다.
     */
    const status = ['ON', 'OFF', 'SOLD_OUT', 'COMING_SOON', 'RESTOCK'].includes(opts.status) ? opts.status : 'OFF';
    const visibility = ['PUBLIC', 'HIDDEN', 'MEMBER_ONLY'].includes(opts.visibility) ? opts.visibility : 'HIDDEN';

    const conn = await pool.getConnection();
    let productId = null;
    let mappingId = null;
    let skuCount = 0;

    try {
        await conn.beginTransaction();

        const [pr] = await conn.query(
            `INSERT INTO products
                (mall_id, category_id, product_type, source_channel, naver_category_id,
                 name, product_code, provider, description, main_image, thumbnail_image,
                 price, stock, status, visibility, slug)
             VALUES (?, ?, ?, 'NAVER_SMARTSTORE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                mallId, categoryId, isOption ? 'OPTION' : 'SINGLE',
                detail.leafCategoryId,
                detail.name,
                String(detail.sellerManagementCode || `NV-${no}`).slice(0, 100),
                detail.manufacturerName ? String(detail.manufacturerName).slice(0, 100) : null,
                description, img.main, img.main,
                detail.salePrice,
                isOption ? 0 : detail.stockQuantity,
                status, visibility, slug,
            ]
        );
        productId = pr.insertId;

        // SKU
        const skuIdByCombo = new Map();

        if (!isOption) {
            // 단일상품 — 대표 SKU 가 없으면 주문 시 SKU 해석이 실패한다.
            const [sr] = await conn.query(
                `INSERT INTO product_sku
                    (mall_id, product_id, sku_code, price, stock, stock_managed, status, is_default)
                 VALUES (?, ?, ?, ?, ?, 1, 'ON', 1)`,
                [
                    mallId, productId,
                    String(detail.sellerManagementCode || `NV-${no}`).slice(0, 100),
                    detail.salePrice, detail.stockQuantity,
                ]
            );
            skuCount = 1;
            skuIdByCombo.set('__single__', sr.insertId);
        } else {
            // 옵션상품 — 대표 SKU 를 만들지 않는다(optionService 규칙).
            const axisNames = detail.axisNames;

            const optionIds = [];
            for (let i = 0; i < axisNames.length; i++) {
                const [or_] = await conn.query(
                    'INSERT INTO product_option (product_id, option_name, display_order) VALUES (?, ?, ?)',
                    [productId, String(axisNames[i]).slice(0, 50), i]
                );
                optionIds.push(or_.insertId);
            }

            // 축별 값(중복 제거, 등장 순서 유지)
            const valueIdMap = axisNames.map(() => new Map());
            for (let i = 0; i < axisNames.length; i++) {
                const seen = [];
                for (const c of usable) {
                    const v = String(c.values[i] == null ? '' : c.values[i]).slice(0, 100);
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

            for (let r = 0; r < usable.length; r++) {
                const c = usable[r];
                const [sr] = await conn.query(
                    `INSERT INTO product_sku
                        (mall_id, product_id, sku_code, price, stock, stock_managed, status, is_default, display_order)
                     VALUES (?, ?, ?, ?, ?, 1, ?, 0, ?)`,
                    [
                        mallId, productId,
                        String(c.sellerManagerCode || `NV-${no}-${c.naverOptionId || r}`).slice(0, 100),
                        c.price, c.stock,
                        // 네이버에서 팔 수 없는 옵션은 우리 몰에서도 꺼 둔다.
                        c.usable ? 'ON' : 'OFF',
                        r,
                    ]
                );
                skuIdByCombo.set(String(c.naverOptionId || `idx${r}`), sr.insertId);
                c._skuId = sr.insertId;

                for (let i = 0; i < axisNames.length; i++) {
                    const vname = String(c.values[i] == null ? '' : c.values[i]).slice(0, 100);
                    await conn.query(
                        'INSERT INTO sku_option_value (sku_id, product_option_id, product_option_value_id) VALUES (?, ?, ?)',
                        [sr.insertId, optionIds[i], valueIdMap[i].get(vname)]
                    );
                }
                skuCount++;
            }
        }

        for (let i = 0; i < img.subs.length; i++) {
            await conn.query(
                'INSERT INTO product_images (product_id, image_url, display_order) VALUES (?, ?, ?)',
                [productId, img.subs[i], i]
            );
        }

        /*
         * 5) 채널 매핑 — source_type='CHANNEL_IMPORT'.
         *    상태는 PUBLISHED 다. "우리가 올렸다"는 뜻이 아니라 **네이버에 살아 있다**는 뜻이고,
         *    이 값이 있어야 재고 동기화 대상에 잡힌다.
         */
        const [mr] = await conn.query(
            `INSERT INTO channel_product_mapping
                (mall_id, channel, product_id, origin_product_no, channel_product_no,
                 channel_product_name, status, sale_status, source_type, last_published_at)
             VALUES (?, ?, ?, ?, ?, ?, 'PUBLISHED', ?, 'CHANNEL_IMPORT', NOW())`,
            [
                mallId, CHANNEL, productId, no, channelProductNo,
                (detail.channelProductName || detail.name).slice(0, 255),
                detail.statusType,
            ]
        );
        mappingId = mr.insertId;

        // 6) SKU ↔ 네이버 옵션조합 매핑 — 재고 동기화의 열쇠(§8).
        if (isOption) {
            const rows = usable
                .filter((c) => c._skuId)
                .map((c) => [
                    mappingId, c._skuId, c.naverOptionId, c.sellerManagerCode,
                    c.values[0] || null, c.values[1] || null, c.values[2] || null,
                    c.stock, c.extraPrice,
                ]);
            if (rows.length) {
                await conn.query(
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
        }

        await conn.commit();
    } catch (e) {
        await conn.rollback();
        conn.release();
        await writeLog({
            mallId, productId: null, action: 'FETCH', ok: false,
            message: `원상품 ${no} 가져오기 실패: ${e.message}`,
            durationMs: Date.now() - startedAt, actor: opts.actor,
        });
        throw e;
    }
    conn.release();

    await writeLog({
        mallId, productId, mappingId, action: 'FETCH', ok: true, httpStatus: 200,
        message: `가져오기 성공 (원상품 ${no} → 상품 ${productId}, SKU ${skuCount}건`
            + `${categoryId ? '' : ', 카테고리 미분류'}${img.failed ? `, 이미지 ${img.failed}장 실패` : ''})`,
        response: raw, durationMs: Date.now() - startedAt, actor: opts.actor,
    });

    return {
        originProductNo: no,
        productId,
        mappingId,
        name: detail.name,
        price: detail.salePrice,
        skuCount,
        isOption,
        categoryId,
        // 네이버 리프로 자동 매칭됐는지(= 폴백/미분류가 아닌지). 화면이 이걸로 안내를 띄운다.
        categoryMatched: !!autoCategoryId,
        imageCount: img.subs.length + (img.main ? 1 : 0),
        imageFailed: img.failed,
    };
}

/**
 * 여러 건 가져오기 — **순차 처리**한다.
 * 건당 상세조회 1회 + 이미지 다운로드라 병렬로 돌리면 호출 제한(2 RPS)에 걸린다.
 */
async function importMany(mallId, originProductNos, opts = {}) {
    /*
     * 화면은 체크박스 값으로 `원상품번호:채널상품번호` 를 보낸다.
     * 채널상품번호가 목록에만 있어서(위 importOne 주석) 여기까지 들고 와야 한다.
     */
    const raw = (Array.isArray(originProductNos) ? originProductNos : [originProductNos])
        .map((v) => String(v || '').trim()).filter(Boolean);

    const byOrigin = new Map();
    for (const v of raw) {
        const [no, ch] = v.split(':');
        if (!no) continue;
        if (!byOrigin.has(no)) byOrigin.set(no, ch || null);
    }
    const list = [...byOrigin.keys()];
    if (!list.length) throw new Error('가져올 상품을 선택하세요.');

    const overLimit = list.length > IMPORT_LIMIT;
    const targets = list.slice(0, IMPORT_LIMIT);

    const credential = await getNaverCredential(mallId);

    const results = [];
    let success = 0, failed = 0, skipped = 0;

    for (const no of targets) {
        try {
            const r = await importOne(mallId, no, {
                ...opts, credential, channelProductNo: byOrigin.get(no),
            });
            success++;
            results.push({ originProductNo: no, ok: true, ...r });
        } catch (e) {
            if (e.alreadyLinked) {
                skipped++;
                results.push({ originProductNo: no, ok: false, skipped: true, error: e.message });
            } else {
                failed++;
                results.push({ originProductNo: no, ok: false, error: e.message, traceId: e.traceId || null });
            }
        }
    }

    return {
        requested: list.length,
        processed: targets.length,
        overLimit, limit: IMPORT_LIMIT,
        success, failed, skipped, results,
    };
}

module.exports = {
    searchStoreProducts,
    importOne,
    importMany,
    // 스펙 변경 시 고칠 지점 — 테스트에서도 이 셋만 보면 된다.
    buildSearchRequest,
    normalizeSearchResponse,
    normalizeOriginProduct,
    resolveMallCategory,
    getNaverCredential,
    IMPORT_LIMIT,
    PAGE_SIZES,
    CHANNEL,
};
