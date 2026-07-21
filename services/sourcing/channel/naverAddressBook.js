/*
 * 네이버 판매자 주소록 조회
 *
 * 발행 프로필의 `release_address_no`(출고지) · `refund_address_no`(반품지) 는
 * 네이버 판매자센터 주소록의 **번호**다. 사람이 외우고 있을 값이 아니라서
 * 예전에는 관리자가 번호를 직접 타이핑했고, 오타 한 자가 상품 등록 400 으로 돌아왔다.
 * (CLAUDE.md §34 — 외부 코드값은 자유 입력 대신 선택으로 받는다)
 *
 * 여기서는 **저장하지 않는다.** 주소록은 몰마다 다른 운영 데이터이고,
 * 판매자센터에서 언제든 바뀐다. 미리 시드해 두면 납품된 다른 몰에서 틀린 값이 된다(§31).
 * 화면의 [주소록 불러오기] 버튼이 누를 때마다 네이버에서 바로 받아 온다.
 *
 * ⚠ 네이버 API 는 허용 IP(개발서버)에서만 응답한다. 로컬에서는 호출이 실패하며,
 *   그 경우 화면은 오류 메시지를 보여 주고 기존에 저장된 번호를 그대로 유지한다.
 */

const naverClient = require('./naverClient');

/* 커머스API 주소록 조회. 페이지네이션이 있으나 주소록은 보통 수 건이라 1페이지면 충분하다. */
const ADDRESSBOOK_PATH = '/v1/seller/addressbooks-for-page?page=1&size=100';

/*
 * 네이버 주소록 유형 → 화면 라벨.
 * 실제 응답에서 확인된 값: RELEASE, REFUND_OR_EXCHANGE.
 * 문서에만 있는 값도 함께 둔다(응답이 달라도 '기타'로 떨어질 뿐 동작은 유지).
 */
const TYPE_LABEL = {
    RELEASE: '출고지',
    REFUND_OR_EXCHANGE: '반품·교환지',
    REFUND: '반품지',
    EXCHANGE: '교환지',
    GENERAL: '일반',
};

/**
 * 네이버 응답 1건 → 화면이 쓰는 모양.
 *
 * 응답 필드명이 문서와 실제가 어긋날 수 있어 **여기 한 함수에만** 가둔다.
 * (naverNoticeSchema.normalizeNaverSchema 와 같은 방침 — 고칠 곳을 하나로 둔다)
 */
function normalize(raw) {
    if (!raw) return null;
    const no = raw.addressBookNo ?? raw.addressBookNumber ?? raw.no;
    if (no == null) return null;

    const addr = raw.address || {};
    const parts = [
        addr.baseAddress ?? raw.baseAddress,
        addr.detailAddress ?? raw.detailAddress,
    ].filter(Boolean).join(' ').trim();

    return {
        no: String(no),
        name: String(raw.name ?? raw.addressName ?? '이름 없음'),
        type: String(raw.addressType ?? raw.type ?? 'GENERAL'),
        typeLabel: TYPE_LABEL[raw.addressType ?? raw.type] || '기타',
        phone: String(raw.phoneNumber1 ?? raw.phoneNumber ?? '').trim() || null,
        address: parts || null,
    };
}

/**
 * 주소록을 조회한다.
 * @param {object} credential ACTIVE 네이버 자격증명
 * @returns {Promise<{ok:true, items:Array}|{ok:false, message:string}>}
 */
async function list(credential) {
    if (!credential) {
        return { ok: false, message: '네이버 자격증명이 없습니다. [공급처/채널 연결]에서 먼저 계정을 연결·검증하세요.' };
    }
    try {
        const res = await naverClient.apiGet(credential, ADDRESSBOOK_PATH);
        // 응답 껍데기가 배열이거나 { contents: [...] } 형태일 수 있다.
        const raw = Array.isArray(res) ? res : (res && (res.contents || res.addressBooks || res.items)) || [];
        const items = raw.map(normalize).filter(Boolean);
        return { ok: true, items };
    } catch (e) {
        return { ok: false, message: e.message || '주소록 조회에 실패했습니다.' };
    }
}

module.exports = { list, normalize, TYPE_LABEL };
