/*
 * 도매꾹 API 응답 → 빌더 중간 모델(supplier_product / supplier_variant) 정규화.
 * 설계: docs/사이트개선/도매꾹_온채널_스마트스토어_연동_상세설계.md §4.1
 *   "공급처 상품 객체를 그대로 채널로 보내지 않는다 — 반드시 정규화를 거친다."
 *
 * 도매꾹 응답의 값은 대부분 **문자열**이다("9900", "false", "0"). 여기서 숫자/불리언으로 바꾼다.
 * 원본은 supplier_product.raw_json 에 그대로 남기므로, 여기서 손실이 생겨도 재정규화가 가능하다.
 */

const MAX_DETAIL_IMAGES = 50;

// --- 원시값 변환 헬퍼 -------------------------------------------------------

function toInt(v) {
    if (v == null || v === '') return null;
    const n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
}

function toNum(v) {
    if (v == null || v === '') return null;
    const n = Number(String(v).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
}

// 도매꾹은 불리언을 "true"/"false" 문자열로 준다.
function toBool(v) {
    if (v === true) return true;
    if (v === false) return false;
    const s = String(v == null ? '' : v).trim().toLowerCase();
    return s === 'true' || s === 'y' || s === '1';
}

function str(v, max) {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    return max && s.length > max ? s.slice(0, max) : s;
}

// --- 옵션(selectOpt) --------------------------------------------------------

/**
 * selectOpt 파싱. 도매꾹은 이 필드를 **JSON 문자열**로 준다(객체 아님).
 *
 * 구조:
 *   { type:'combination', set:[{name:'선택', opts:[...]}],
 *     data:{ '00':{ name, qty, domPrice, supPrice, dom, sup, hid, hash } } }
 *
 * - data 의 각 키가 하나의 판매 조합(SKU)이다.
 * - domPrice/supPrice 는 절대가가 아니라 **기본가에 더해지는 추가금**이다.
 * - dom/sup 는 해당 마켓에서 그 옵션이 판매되는지 여부.
 *
 * @param {*} selectOpt 원본 필드
 * @param {'dome'|'supply'} market
 * @returns {{type:string|null, variants:Array}}
 */
function parseSelectOpt(selectOpt, market) {
    if (!selectOpt) return { type: null, variants: [] };

    let parsed = selectOpt;
    if (typeof selectOpt === 'string') {
        try {
            parsed = JSON.parse(selectOpt);
        } catch (e) {
            // 파싱 실패는 옵션 없음으로 처리하되 타입만 남긴다(원본은 raw_json 에 있음).
            return { type: 'unparsable', variants: [] };
        }
    }
    if (!parsed || typeof parsed !== 'object') return { type: null, variants: [] };

    const data = parsed.data;
    if (!data || typeof data !== 'object') {
        return { type: str(parsed.type) || null, variants: [] };
    }

    const isSupply = market === 'supply';
    const variants = [];

    for (const [code, raw] of Object.entries(data)) {
        if (!raw || typeof raw !== 'object') continue;
        const extra = isSupply ? raw.supPrice : raw.domPrice;
        const availFlag = isSupply ? raw.sup : raw.dom;

        variants.push({
            optCode: String(code),
            optHash: str(raw.hash, 100),
            optName: str(raw.name, 500) || `옵션 ${code}`,
            extraPrice: toNum(extra) || 0,
            qty: toInt(raw.qty),
            isHidden: toBool(raw.hid),
            // 플래그가 아예 없으면(구버전 응답) 판매 가능으로 본다.
            available: availFlag == null ? true : toBool(availFlag),
            raw,
        });
    }

    // 화면 표시 안정성을 위해 조합 코드 순으로 정렬한다.
    variants.sort((a, b) => a.optCode.localeCompare(b.optCode, 'en', { numeric: true }));

    return { type: str(parsed.type) || 'combination', variants };
}

// --- 상세 이미지 ------------------------------------------------------------

/** 상세 HTML 에서 이미지 URL 을 추출한다(중복 제거 + 상한). */
function extractImages(html) {
    if (!html || typeof html !== 'string') return [];
    const urls = [];
    const seen = new Set();
    const re = /<img[^>]+src\s*=\s*["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        let u = m[1].trim();
        if (!u || u.startsWith('data:')) continue;
        if (u.startsWith('//')) u = 'https:' + u;
        if (!/^https?:\/\//i.test(u)) continue;
        if (seen.has(u)) continue;
        seen.add(u);
        urls.push(u);
        if (urls.length >= MAX_DETAIL_IMAGES) break;
    }
    return urls;
}

// --- 목록 아이템 ------------------------------------------------------------

/**
 * getItemList 의 item → 화면 표시용 요약.
 * (중간 테이블 적재는 상세 조회 후에 한다 — 목록엔 재고·옵션이 없다)
 */
function normalizeListItem(item, supplier) {
    if (!item) return null;
    const deli = item.deli || {};
    const market = item.market || {};
    return {
        supplier,
        itemNo: String(item.no),
        title: str(item.title, 500) || '(제목 없음)',
        thumbUrl: str(item.thumb, 1000),
        price: toNum(item.price),
        unitQty: toInt(item.unitQty),
        sellerId: str(item.id, 100),
        comOnly: toBool(item.comOnly),
        adultOnly: toBool(item.adultOnly),
        deliWho: str(deli.who, 10),          // C=구매자 부담 등
        deliFee: toNum(deli.fee),
        sourceUrl: str(item.url, 500),
        onDome: toBool(market.domeggook),
        onSupply: toBool(market.supply),
    };
}

// --- 상세 ------------------------------------------------------------------

/**
 * getItemView 의 domeggook 객체 → { product, variants }.
 *
 * @param {object} root getItemView 응답의 domeggook 하위
 * @param {'DOMEGGOOK'|'DOMEME'} supplier
 * @returns {{product:object, variants:Array}}
 */
function normalizeDetail(root, supplier) {
    if (!root || !root.basis) throw new Error('도매꾹 상세 응답에 basis 가 없습니다.');

    const market = supplier === 'DOMEME' ? 'supply' : 'dome';
    const basis = root.basis || {};
    const price = root.price || {};
    const qty = root.qty || {};
    const deli = root.deli || {};
    const deliSide = (market === 'supply' ? deli.supply : deli.dome) || {};
    const feeExtra = deli.feeExtra || {};
    const thumb = root.thumb || {};
    const desc = root.desc || {};
    const contents = desc.contents || {};
    const license = desc.license || {};
    const seller = root.seller || {};
    const company = seller.company || {};
    const detail = root.detail || {};
    const infoDuty = detail.infoDuty || {};
    const category = (root.category && root.category.current) || {};

    // 마켓별 공급가. 도매매 상품이 dome 가격만 갖고 있는 경우가 있어 폴백을 둔다.
    const supplyPrice = market === 'supply'
        ? (toNum(price.supply) != null ? toNum(price.supply) : toNum(price.dome))
        : toNum(price.dome);

    const detailHtml = str(contents.item) || null;
    const { type: optionType, variants } = parseSelectOpt(root.selectOpt, market);

    // 재판매 가능 여부 — 오픈마켓 재판매 금지 상품을 스마트스토어에 올리면 계정 제재로 이어진다.
    // license 블록이 없으면 '미확인(null)' 로 둔다. 임의로 '가능' 처리하지 않는다.
    const resaleAllowed = license.usable == null ? null : (toBool(license.usable) ? 1 : 0);

    const product = {
        supplier,
        supplierItemNo: String(basis.no),
        title: str(basis.title, 500) || '(제목 없음)',
        statusText: str(basis.status, 50),
        thumbUrl: str(thumb.original || thumb.large || thumb.small, 1000),
        sourceUrl: `https://domeggook.com/${basis.no}`,

        supplyPrice,
        currency: 'KRW',
        moq: toInt(market === 'supply' ? qty.supplyMoq : qty.domeMoq) ?? toInt(qty.domeMoq),
        unitQty: toInt(market === 'supply' ? qty.supplyUnit : qty.domeUnit) ?? toInt(qty.domeUnit),
        inventoryQty: toInt(qty.inventory),

        deliMethod: str(deli.method, 50),
        deliPay: str(deli.pay, 100),
        deliFeeType: str(deliSide.type, 50),
        deliFeeTable: str(deliSide.tbl, 255),
        deliFeeJeju: toInt(feeExtra.jeju),
        deliFeeIslands: toInt(feeExtra.islands),
        fromOversea: toBool(deli.fromOversea) ? 1 : 0,

        sellerId: str(seller.id, 100),
        sellerNick: str(seller.nick, 200),
        sellerCompany: str(company.name, 200),

        categoryCode: str(category.code, 64),
        categoryName: str(category.name, 255),
        categoryDepth: toInt(category.depth),

        country: str(detail.country, 100),
        manufacturer: str(detail.manufacturer, 200),
        modelName: str(detail.model, 200),
        weightG: str(detail.weight, 50),
        sizeText: str(detail.size, 100),
        taxType: str(basis.tax, 50),
        infoDutyType: str(infoDuty.type, 100),
        adultOnly: toBool(basis.adult) ? 1 : 0,

        resaleAllowed,
        resaleMsg: str(license.msg, 500),

        detailHtml,
        noticeHtml: str(desc.notice) || null,
        images: extractImages(detailHtml),

        optionType,
        raw: root,
    };

    return { product, variants };
}

module.exports = {
    normalizeListItem,
    normalizeDetail,
    parseSelectOpt,
    extractImages,
    // 테스트/재사용용
    _helpers: { toInt, toNum, toBool, str },
};
