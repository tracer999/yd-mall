/*
 * 공급처/판매채널 어댑터 레지스트리 (골격).
 * 설계: docs/사이트개선/도매꾹_온채널_스마트스토어_연동_상세설계.md §8
 *
 * 지금은 채널 메타데이터 + validateConnection 스텁만 제공한다.
 * 실제 API 호출(검색·상세·재고·주문·등록)은 Phase 2~ 에서
 * services/sourcing/supplier/*, channel/* 에 자격증명 주입형으로 구현한다.
 */

const CHANNEL_META = {
    DOMEGGOOK: {
        kind: 'supplier',
        label: '도매꾹',
        needsSecret: false,
        help: 'Open API Key(aid)를 입력합니다. 재고 수량 미제공 시 가상재고 정책이 적용됩니다.',
    },
    DOMEME: {
        kind: 'supplier',
        label: '도매매',
        needsSecret: false,
        help: '도매매 Open API Key.',
    },
    ONCHANNEL: {
        kind: 'supplier',
        label: '온채널',
        needsSecret: false,
        help: 'L1(수동·CSV) 방식. 제휴 API 확인 전에는 CSV 임포트만 지원합니다.',
    },
    NAVER_SMARTSTORE: {
        kind: 'channel',
        label: '네이버 스마트스토어',
        needsSecret: true,
        help: '커머스API 애플리케이션의 client_id / client_secret. 인증은 전자서명 OAuth2 방식.',
    },
};

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

    // 온채널(L1)은 별도 자격증명 없이 사용
    if (cred.channel === 'ONCHANNEL') {
        return { ok: true, message: 'L1(CSV) 방식 — 별도 자격증명 없이 사용' };
    }

    const missing = [];
    if (!cred.clientId) missing.push('client_id/API Key');
    if (meta.needsSecret && !cred.secret) missing.push('client_secret');
    if (missing.length) return { ok: false, message: `필수값 누락: ${missing.join(', ')}` };

    // TODO(Phase 2~3): 실제 토큰 발급/상품 1건 조회로 실연결 검증.
    return { ok: true, message: '자격증명 형식 확인됨 (실 API 연결 검증은 어댑터 구현 후 지원)' };
}

module.exports = { CHANNEL_META, CAPABILITIES, validateConnection };
