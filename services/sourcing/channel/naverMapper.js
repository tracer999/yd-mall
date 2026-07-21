/*
 * 우리 몰 상품(products) → 네이버 커머스 API 상품등록 페이로드 변환.
 * 설계: docs/사이트개선/네이버_스마트스토어_연동.md §매핑
 *
 * 이 파일은 **순수 변환만** 한다(DB·네트워크 없음). 그래야 페이로드를 눈으로 검증하고
 * 스펙이 바뀌었을 때 여기만 고칠 수 있다. 데이터 적재는 naverPublishService 가 한다.
 *
 * 스펙에서 특히 틀리기 쉬운 지점(전부 실제 400 사례):
 *   - smartstoreChannelProduct 는 originProduct 의 **형제**다(안에 넣으면 400).
 *   - optionInfo 는 **detailAttribute 하위**다(밖에 두면 조용히 '옵션 없음'으로 등록된다).
 *   - optionCombinationGroupNames 는 배열이 아니라 **객체**({optionGroupName1: ...}).
 *   - 상품정보제공고시는 type 에 해당하는 **하위 객체 1개만** 넣는다(전부 넣으면 400).
 *   - 등록 시 statusType 은 **SALE 만** 유효하고,
 *     channelProductDisplayStatusType 은 **ON | SUSPENSION** 만 받는다.
 */

// 등록 시 허용되는 값(수정 시와 다르다).
const CREATE_STATUS_TYPE = 'SALE';
const DISPLAY_STATUS = { ON: 'ON', SUSPENSION: 'SUSPENSION' };

// 네이버 조합형 옵션은 축 3개까지(지점형 4개). 우리 축이 더 많으면 등록할 수 없다.
const MAX_OPTION_AXES = 3;
// 대표 1장 + 추가 9장.
const MAX_OPTIONAL_IMAGES = 9;

/*
 * 상품정보제공고시 — 모든 상품군이 공유하는 필수 5개.
 * 값을 비워 두면 네이버가 "상품상세 참조"로 저장하므로, 우리도 같은 문구를 기본값으로 쓴다.
 */
const NOTICE_COMMON_FIELDS = [
    'returnCostReason',
    'noRefundReason',
    'qualityAssuranceStandard',
    'compensationProcedure',
    'troubleShootingContents',
];
const NOTICE_FALLBACK = '상품상세 참조';

/*
 * 고시 유형 → JSON 하위 키. enum 은 UPPER_SNAKE, 하위 키는 camelCase 로 다르다.
 * ⚠ 건강기능식품 전용 유형(HEALTH_FUNCTIONAL_FOOD)은 **존재하지 않는다** — DIET_FOOD 를 쓴다.
 *   이 저장소의 표준 예시몰이 건강식품몰이라 특히 자주 걸린다.
 */
const NOTICE_TYPE_TO_KEY = {
    WEAR: 'wear', SHOES: 'shoes', BAG: 'bag', FASHION_ITEMS: 'fashionItems',
    SLEEPING_GEAR: 'sleepingGear', FURNITURE: 'furniture',
    IMAGE_APPLIANCES: 'imageAppliances', HOME_APPLIANCES: 'homeAppliances',
    SEASON_APPLIANCES: 'seasonAppliances', OFFICE_APPLIANCES: 'officeAppliances',
    OPTICS_APPLIANCES: 'opticsAppliances', MICROELECTRONICS: 'microElectronics',
    CELLPHONE: 'cellPhone', NAVIGATION: 'navigation', CAR_ARTICLES: 'carArticles',
    MEDICAL_APPLIANCES: 'medicalAppliances', KITCHEN_UTENSILS: 'kitchenUtensils',
    COSMETIC: 'cosmetic', JEWELLERY: 'jewellery',
    FOOD: 'food', GENERAL_FOOD: 'generalFood', DIET_FOOD: 'dietFood',
    KIDS: 'kids', MUSICAL_INSTRUMENT: 'musicalInstrument', SPORTS_EQUIPMENT: 'sportsEquipment',
    // RENTAL_HA(정수기·비데·공기청정기 대여)는 초기 표에 빠져 있었다. 실호출 목록에 존재한다.
    BOOKS: 'books', RENTAL_ETC: 'rentalEtc', RENTAL_HA: 'rentalHa', DIGITAL_CONTENTS: 'digitalContents',
    GIFT_CARD: 'giftCard', MOBILE_COUPON: 'mobileCoupon', MOVIE_SHOW: 'movieShow',
    ETC_SERVICE: 'etcService', BIOCHEMISTRY: 'biochemistry', BIOCIDAL: 'biocidal',
    ETC: 'etc',
};

/** 우리 상품 상태 → 채널 전시상태. 판매중이 아니면 노출을 멈춘다. */
function displayStatusOf(product, profile) {
    if (product.status !== 'ON' || product.visibility === 'HIDDEN') return DISPLAY_STATUS.SUSPENSION;
    return DISPLAY_STATUS[profile && profile.channel_display_status] || DISPLAY_STATUS.ON;
}

function toInt(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : fallback;
}

/**
 * 배송 정보. 반품·교환 배송비는 네이버 필수라 프로필에서 반드시 채워져야 한다.
 * 주소록 ID(shippingAddressId/returnAddressId)는 네이버 판매자 주소록의 번호이며
 * 인라인 주소 입력이 아니다 — 없으면 네이버 기본 주소록이 쓰인다.
 */
function buildDeliveryInfo(profile) {
    const feeType = profile.delivery_fee_type || 'PAID';
    const deliveryFee = { deliveryFeeType: feeType, deliveryFeePayType: 'PREPAID' };

    if (feeType !== 'FREE') {
        deliveryFee.baseFee = toInt(profile.delivery_fee, 0);
    }
    if (feeType === 'CONDITIONAL_FREE') {
        deliveryFee.freeConditionalAmount = toInt(profile.free_threshold, 0);
    }

    const claim = {
        returnDeliveryFee: toInt(profile.return_delivery_fee, 0),
        exchangeDeliveryFee: toInt(profile.exchange_delivery_fee, 0),
        returnDeliveryCompanyPriorityType: 'PRIMARY',
    };
    if (profile.release_address_no) claim.shippingAddressId = toInt(profile.release_address_no);
    if (profile.refund_address_no) claim.returnAddressId = toInt(profile.refund_address_no);

    const info = {
        deliveryType: 'DELIVERY',
        deliveryAttributeType: 'NORMAL',
        deliveryBundleGroupUsable: false,
        deliveryFee,
        claimDeliveryInfo: claim,
    };
    if (profile.delivery_company) info.deliveryCompany = profile.delivery_company;
    return info;
}

/**
 * 상품정보제공고시.
 * type 에 해당하는 하위 객체 **하나만** 넣는다. 프로필 기본값 → 상품별 override 순으로 덮는다.
 */
function buildNotice(profile, override) {
    const type = (override && override.notice_type) || profile.notice_type || 'ETC';
    const key = NOTICE_TYPE_TO_KEY[type];
    if (!key) throw new Error(`지원하지 않는 상품정보제공고시 유형입니다: ${type}`);

    const base = (profile.notice_defaults_json && typeof profile.notice_defaults_json === 'object')
        ? profile.notice_defaults_json : {};
    const extra = (override && override.notice && typeof override.notice === 'object') ? override.notice : {};
    const merged = { ...base, ...extra };

    // 공통 필수 5개는 비어 있으면 "상품상세 참조"로 채운다(누락 시 400 을 피한다).
    for (const f of NOTICE_COMMON_FIELDS) {
        if (!merged[f]) merged[f] = NOTICE_FALLBACK;
    }

    return { productInfoProvidedNoticeType: type, [key]: merged };
}

/**
 * 옵션(조합형) 구성.
 *
 * 네이버의 옵션 `price` 는 **판매가 대비 추가금액**이다. 우리 SKU 는 절대가라
 * 최저가를 salePrice 로 삼고 나머지를 차액으로 바꾼다. 이렇게 하면 네이버 정책
 * ("추가금액 0원인 조합이 1개 이상") 도 자동으로 만족한다.
 *
 * @returns {{basePrice:number, optionInfo:object, totalStock:number}|null} 옵션이 없으면 null
 */
function buildOptionInfo(product, options, skus) {
    const usable = (skus || []).filter((s) => s.status !== 'OFF');
    if (!options || !options.length || !usable.length) return null;

    if (options.length > MAX_OPTION_AXES) {
        throw new Error(
            `네이버 조합형 옵션은 축 ${MAX_OPTION_AXES}개까지입니다(현재 ${options.length}개). 옵션 구조를 줄여야 등록할 수 있습니다.`
        );
    }

    const basePrice = Math.min(...usable.map((s) => toInt(s.price)));

    const groupNames = {};
    options.forEach((opt, i) => {
        groupNames[`optionGroupName${i + 1}`] = String(opt.option_name || `옵션${i + 1}`).slice(0, 25);
    });

    const combinations = usable.map((sku) => {
        const row = {
            stockQuantity: toInt(sku.stock, 0),
            price: Math.max(toInt(sku.price) - basePrice, 0),
            usable: true,
        };
        options.forEach((opt, i) => {
            row[`optionName${i + 1}`] = String(sku.optionValues[i] == null ? '' : sku.optionValues[i]).slice(0, 25);
        });
        // 주문 수집 시 어떤 SKU 인지 되짚는 열쇠 — 반드시 넣는다.
        if (sku.sku_code) row.sellerManagerCode = String(sku.sku_code).slice(0, 50);
        return row;
    });

    return {
        basePrice,
        totalStock: combinations.reduce((a, c) => a + c.stockQuantity, 0),
        optionInfo: {
            optionCombinationSortType: 'CREATE',
            useStockManagement: true,
            optionCombinationGroupNames: groupNames,
            optionCombinations: combinations,
        },
    };
}

/**
 * 상세 HTML 정리 — 상대경로 이미지는 네이버에서 깨진다.
 * imageUrlMap 에 있으면 업로드된 네이버 URL 로, 없으면 우리 절대 URL 로 바꾼다.
 */
function rewriteDetailContent(html, imageUrlMap, siteOrigin) {
    let out = String(html || '');
    for (const [local, remote] of imageUrlMap || []) {
        out = out.split(local).join(remote);
    }
    if (siteOrigin) {
        // 남은 상대경로(/uploads/... 등)를 절대 URL 로. 이미 http 로 시작하면 건드리지 않는다.
        out = out.replace(/(src|href)=(["'])(\/[^"']*)\2/gi, (m, attr, q, p) => `${attr}=${q}${siteOrigin}${p}${q}`);
    }
    return out || '<p>상품 상세 정보는 옵션 및 고시정보를 참고해 주세요.</p>';
}

/**
 * 최종 페이로드 조립.
 *
 * @param {object} ctx
 *   product        products 행
 *   options        [{option_name, ...}] 축 순서대로
 *   skus           [{sku_code, price, stock, status, optionValues:[값1,값2]}]
 *   profile        naver_publish_profile 행
 *   repImageUrl    업로드된 대표이미지 네이버 URL
 *   optionalUrls   업로드된 추가이미지 네이버 URL 배열
 *   imageUrlMap    Map(로컬경로 → 네이버 URL) — 상세 HTML 치환용
 *   siteOrigin     'https://dev-mall.ydata.co.kr' 같은 우리 사이트 원본
 *   override       상품별 예외값(override_json)
 * @returns {{originProduct:object, smartstoreChannelProduct:object}}
 */
function buildProductPayload(ctx) {
    const { product, options, skus, profile, repImageUrl, optionalUrls, imageUrlMap, siteOrigin } = ctx;
    const override = ctx.override || {};

    if (!repImageUrl) throw new Error('대표 이미지가 없습니다 — 네이버는 대표 이미지 없이 등록할 수 없습니다.');
    if (!product.naver_category_id) throw new Error('네이버 카테고리(리프)가 지정되지 않았습니다.');

    const opt = buildOptionInfo(product, options, skus);
    const salePrice = opt ? opt.basePrice : toInt(product.price);
    const stockQuantity = opt ? opt.totalStock : toInt(product.stock, 0);

    const detailAttribute = {
        afterServiceInfo: {
            afterServiceTelephoneNumber: String(profile.as_telephone || ''),
            afterServiceGuideContent: String(profile.as_guide_content || ''),
        },
        originAreaInfo: {
            originAreaCode: String(profile.origin_area_code || ''),
            plural: false,
        },
        minorPurchasable: profile.minor_purchasable ? true : false,
        productInfoProvidedNotice: buildNotice(profile, override),
        taxType: 'TAX',
    };

    if (profile.origin_area_content) detailAttribute.originAreaInfo.content = String(profile.origin_area_content);
    if (opt) detailAttribute.optionInfo = opt.optionInfo;

    // 판매자 관리코드 — 주문·재고를 우리 상품으로 되짚는 열쇠.
    detailAttribute.sellerCodeInfo = {
        sellerManagementCode: String(product.product_code || `YD-${product.id}`).slice(0, 50),
    };

    if (product.provider) {
        detailAttribute.naverShoppingSearchInfo = { manufacturerName: String(product.provider).slice(0, 100) };
    }

    if (product.meta_description) {
        detailAttribute.seoInfo = {
            pageTitle: String(product.name).slice(0, 100),
            metaDescription: String(product.meta_description).slice(0, 160),
        };
    }

    const originProduct = {
        statusType: CREATE_STATUS_TYPE,
        saleType: 'NEW',
        leafCategoryId: String(product.naver_category_id),
        name: String(product.name).slice(0, 100),
        detailContent: rewriteDetailContent(product.description, imageUrlMap, siteOrigin),
        images: {
            representativeImage: { url: repImageUrl },
            optionalImages: (optionalUrls || []).slice(0, MAX_OPTIONAL_IMAGES).map((url) => ({ url })),
        },
        salePrice,
        stockQuantity,
        deliveryInfo: buildDeliveryInfo(profile),
        detailAttribute,
    };

    // 추가 이미지가 없으면 빈 배열 대신 키를 빼 준다(빈 배열을 싫어하는 필드가 있다).
    if (!originProduct.images.optionalImages.length) delete originProduct.images.optionalImages;

    return {
        originProduct,
        smartstoreChannelProduct: {
            channelProductName: String(product.name).slice(0, 100),
            naverShoppingRegistration: profile.naver_shopping_registration ? true : false,
            channelProductDisplayStatusType: displayStatusOf(product, profile),
        },
    };
}

/**
 * 보내기 전 자체 검증 — 부족한 항목의 사람말 목록을 돌려준다.
 * 네이버에 보내고 400 으로 알게 되면 호출 한도만 태우고, 오류 메시지도 필드명이
 * 정확히 맞지 않아 추적이 어렵다. 그래서 여기서 먼저 막는다.
 */
function validateBeforePublish({ product, profile, skus }) {
    const missing = [];
    if (!product.naver_category_id) missing.push('네이버 카테고리(리프)');
    if (!product.main_image) missing.push('대표 이미지');
    if (!product.name) missing.push('상품명');
    if (!toInt(product.price)) missing.push('판매가');

    if (!profile || !profile.as_telephone) missing.push('A/S 전화번호(프로필)');
    if (!profile || !profile.as_guide_content) missing.push('A/S 안내(프로필)');
    if (!profile || !profile.origin_area_code) missing.push('원산지 코드(프로필)');
    if (!profile || profile.return_delivery_fee == null) missing.push('반품 배송비(프로필)');
    if (!profile || profile.exchange_delivery_fee == null) missing.push('교환 배송비(프로필)');

    if (product.product_type === 'OPTION' && !(skus || []).some((s) => s.status !== 'OFF')) {
        missing.push('판매 가능한 옵션(SKU)');
    }
    return missing;
}

module.exports = {
    buildProductPayload,
    buildOptionInfo,
    buildDeliveryInfo,
    buildNotice,
    rewriteDetailContent,
    validateBeforePublish,
    displayStatusOf,
    NOTICE_TYPE_TO_KEY,
    NOTICE_COMMON_FIELDS,
    MAX_OPTION_AXES,
    MAX_OPTIONAL_IMAGES,
    CREATE_STATUS_TYPE,
};
