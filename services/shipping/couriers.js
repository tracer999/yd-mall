/*
 * 택배사 카탈로그
 *
 * 택배사는 외부 코드값이라 자유 입력을 받지 않는다(오타 하나가 조회 실패로 돌아온다).
 * 화면은 언제나 이 목록으로 select 를 그리고, 저장은 `name` 문자열로 한다
 * (기존 데이터가 'CJ대한통운' 같은 이름으로 쌓여 있어 코드로 바꾸면 과거 주문의 택배사가 날아간다).
 *
 *  - trackUrl : 송장번호만 붙이면 열리는 조회 페이지. API 계약 없이도 "배송 조회" 링크가 동작한다.
 *  - apiCode  : 택배 추적 API(스윗트래커 계열) 연동 시 쓰는 코드.
 *               ⚠️ 실제 연동을 켤 때 공급사가 주는 최신 코드표와 반드시 대조하고 켜야 한다.
 *               코드가 비어 있어도 조회 링크와 수동 배송완료 처리는 그대로 동작한다.
 */

const COURIERS = [
    { name: 'CJ대한통운',       apiCode: '04', trackUrl: 'https://trace.cjlogistics.com/next/tracking.html?wblNo={no}' },
    { name: '우체국택배',       apiCode: '01', trackUrl: 'https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1={no}' },
    { name: '한진택배',         apiCode: '05', trackUrl: 'https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2={no}' },
    { name: '롯데택배',         apiCode: '08', trackUrl: 'https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo={no}' },
    { name: '로젠택배',         apiCode: '06', trackUrl: 'https://www.ilogen.com/web/personal/trace/{no}' },
    { name: '경동택배',         apiCode: '23', trackUrl: 'https://kdexp.com/basicNewDelivery.kd?barcode={no}' },
    { name: '대신택배',         apiCode: '22', trackUrl: 'https://www.ds3211.co.kr/freight/internalFreightSearch.ds?searchInvoiceNumber={no}' },
    { name: '천일택배',         apiCode: '17', trackUrl: 'https://www.chunil.co.kr/HTrace/HTrace.jsp?transNo={no}' },
    { name: '건영택배',         apiCode: '18', trackUrl: 'https://www.kunyoung.com/goods/goods_01.php?mulno={no}' },
    { name: '합동택배',         apiCode: '32', trackUrl: 'https://www.hdexp.co.kr/basic_new/delivery/deliverysearch.asp?p_item={no}' },
    { name: '일양로지스',       apiCode: '11', trackUrl: 'https://www.ilyanglogis.com/functionality/tracking_result.asp?hawb_no={no}' },
    { name: 'CU 편의점택배',    apiCode: '46', trackUrl: 'https://www.cupost.co.kr/postbox/delivery/localResult.cupost?invoice_no={no}' },
    { name: 'GS Postbox 택배', apiCode: '24', trackUrl: 'https://www.cvsnet.co.kr/invoice/tracking.do?invoice_no={no}' },
    { name: '쿠팡로지스틱스',   apiCode: '',   trackUrl: '' },
    { name: '기타',             apiCode: '',   trackUrl: '' },
];

const byName = new Map(COURIERS.map((c) => [c.name, c]));

/** 목록에 있는 이름인가. CSV 업로드 검증에 쓴다. */
function isValid(name) {
    return byName.has(String(name || '').trim());
}

/**
 * 사람이 적은 택배사 이름을 카탈로그 이름으로 맞춘다.
 * CSV 로 올릴 때 'cj대한통운', 'CJ 대한통운', '대한통운' 같이 제각각으로 적히기 때문이다.
 * 못 맞추면 null — 조용히 '기타'로 바꾸지 않는다(어느 택배사인지 모른 채 저장되면 조회가 안 된다).
 */
function normalize(raw) {
    const s = String(raw || '').replace(/\s|\(.*?\)/g, '').toLowerCase();
    if (!s) return null;
    const exact = COURIERS.find((c) => c.name.replace(/\s/g, '').toLowerCase() === s);
    if (exact) return exact.name;
    const ALIAS = {
        'cj': 'CJ대한통운', '대한통운': 'CJ대한통운', 'cj택배': 'CJ대한통운', 'cjgls': 'CJ대한통운',
        '우체국': '우체국택배', 'epost': '우체국택배', '등기': '우체국택배',
        '한진': '한진택배', 'hanjin': '한진택배',
        '롯데': '롯데택배', '현대택배': '롯데택배', 'lotte': '롯데택배',
        '로젠': '로젠택배', 'logen': '로젠택배', 'ilogen': '로젠택배',
        '경동': '경동택배', '대신': '대신택배', '천일': '천일택배', '건영': '건영택배',
        '합동': '합동택배', '일양': '일양로지스',
        'cu': 'CU 편의점택배', 'cu편의점': 'CU 편의점택배', 'cupost': 'CU 편의점택배',
        'gs': 'GS Postbox 택배', 'gs25': 'GS Postbox 택배', 'cvsnet': 'GS Postbox 택배',
        '쿠팡': '쿠팡로지스틱스', 'coupang': '쿠팡로지스틱스',
    };
    return ALIAS[s] || null;
}

/** 배송 조회 URL. 택배사·송장이 없거나 조회 주소를 모르면 null. */
function trackingUrl(name, trackingNumber) {
    const c = byName.get(String(name || '').trim());
    const no = String(trackingNumber || '').replace(/[^0-9A-Za-z]/g, '');
    if (!c || !c.trackUrl || !no) return null;
    return c.trackUrl.replace('{no}', encodeURIComponent(no));
}

module.exports = { COURIERS, isValid, normalize, trackingUrl, byName };
