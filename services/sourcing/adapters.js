/*
 * 공급처/판매채널 어댑터 레지스트리 (골격).
 * 설계: docs/사이트개선/도매꾹_온채널_스마트스토어_연동_상세설계.md §8
 *
 * 지금은 채널 메타데이터 + validateConnection 스텁만 제공한다.
 * 실제 API 호출(검색·상세·재고·주문·등록)은 Phase 2~ 에서
 * services/sourcing/supplier/*, channel/* 에 자격증명 주입형으로 구현한다.
 */

/*
 * 채널 메타 — 관리자 자격증명 폼은 이 정의만 보고 입력칸을 구성한다.
 *   needsClientId / needsSecret : 입력칸 노출 여부. 둘 다 false 면 자격증명이 없는 채널.
 *   aliasOf : 자격증명을 다른 채널과 공유한다. 이 채널로는 계정을 만들지 않는다.
 *   hidden  : 채널 선택 목록에서 감춘다(= 사용자가 직접 고를 일이 없는 채널).
 */
const CHANNEL_META = {
    DOMEGGOOK: {
        kind: 'supplier',
        label: '도매꾹·도매매',
        needsClientId: true,
        needsSecret: false,
        clientIdLabel: 'Open API Key (aid)',
        /*
         * 도매꾹·도매매는 아이디를 공유하므로 Open API Key 하나로 양쪽을 조회한다.
         * 어느 쪽 상품을 볼지는 자격증명이 아니라 호출 파라미터(market)로 정한다.
         */
        markets: { dome: '도매꾹', supply: '도매매' },
        help: '도매꾹 로그인 → API 키 관리에서 발급합니다(시크릿 없음). 도매꾹과 도매매는 아이디를 공유하므로 이 키 하나로 양쪽 상품을 조회합니다 — 도매매를 따로 등록하지 마세요. 아이디당 키 5개, 호출 제한 분당 180회·하루 15,000회.',
    },
    DOMEME: {
        kind: 'supplier',
        label: '도매매',
        needsClientId: true,
        needsSecret: false,
        aliasOf: 'DOMEGGOOK',
        hidden: true,
        help: '자격증명은 도매꾹과 공용입니다. 도매꾹 계정 하나로 도매매까지 동작합니다.',
    },
    ONCHANNEL: {
        kind: 'supplier',
        label: '온채널',
        needsClientId: false,
        needsSecret: false,
        help: 'L1(수동·CSV) 방식이라 입력할 자격증명이 없습니다. 이 몰에서 온채널을 쓴다는 표시로만 등록합니다.',
    },
    NAVER_SMARTSTORE: {
        kind: 'channel',
        label: '네이버 스마트스토어',
        needsClientId: true,
        needsSecret: true,
        clientIdLabel: 'client_id',
        secretLabel: 'client_secret',
        extraHint: '스토어채널ID·반품지코드 등',
        help: '커머스API 애플리케이션의 client_id / client_secret. 인증은 전자서명 OAuth2 방식.',
    },
};

// 자격증명을 실제로 저장할 채널 — 별칭 채널은 원본으로 접는다.
function resolveCredentialChannel(channel) {
    const meta = CHANNEL_META[channel];
    return (meta && meta.aliasOf) || channel;
}

const CAPABILITIES = [
    'PRODUCT_SEARCH', 'PRODUCT_DETAIL', 'INVENTORY_READ', 'PRICE_READ', 'SALE_APPROVAL',
    'ORDER_CREATE', 'ORDER_STATUS_READ', 'SHIPMENT_READ', 'CANCEL_REQUEST', 'RETURN_REQUEST',
    'CHANNEL_PRODUCT_READ',
];

/*
 * 연결 검증 — 골격 단계.
 * 실 API 어댑터가 붙기 전에는 '필수값 존재'만 확인한다(가짜 성공 표시 금지).
 * cred: { channel, clientId, secret, ... } (credential.getCredential 반환형)
 */
async function validateConnection(cred) {
    const meta = CHANNEL_META[cred.channel];
    if (!meta) return { ok: false, message: '알 수 없는 채널' };

    // 자격증명이 없는 채널(온채널 L1) — 검증할 값 자체가 없다.
    if (!meta.needsClientId && !meta.needsSecret) {
        return { ok: true, message: `${meta.label} — 자격증명 없이 사용(수동·CSV)` };
    }

    const missing = [];
    if (meta.needsClientId && !cred.clientId) missing.push(meta.clientIdLabel || 'client_id/API Key');
    if (meta.needsSecret && !cred.secret) missing.push(meta.secretLabel || 'client_secret');
    if (missing.length) return { ok: false, message: `필수값 누락: ${missing.join(', ')}` };

    // 네이버 스마트스토어는 실제 토큰 발급으로 실연결을 검증한다(전자서명 OAuth2).
    if (cred.channel === 'NAVER_SMARTSTORE') {
        try {
            const naverClient = require('./channel/naverClient');
            await naverClient.verify(cred);
            return { ok: true, message: '네이버 커머스 API 토큰 발급 성공 — 연결 확인됨' };
        } catch (e) {
            return { ok: false, message: `네이버 연결 실패: ${e.message}` };
        }
    }

    // 도매꾹·도매매는 Open API 로 1건 조회해 키 유효성을 실제로 확인한다.
    if (cred.channel === 'DOMEGGOOK' || cred.channel === 'DOMEME') {
        try {
            const domeggook = require('./supplier/domeggook');
            await domeggook.verify(cred);
            return { ok: true, message: '도매꾹 Open API 호출 성공 — 연결 확인됨(도매매 공용)' };
        } catch (e) {
            return { ok: false, message: `도매꾹 연결 실패: ${e.message}` };
        }
    }

    return { ok: true, message: '자격증명 형식 확인됨 (실 API 연결 검증은 어댑터 구현 후 지원)' };
}

module.exports = { CHANNEL_META, CAPABILITIES, validateConnection, resolveCredentialChannel };
