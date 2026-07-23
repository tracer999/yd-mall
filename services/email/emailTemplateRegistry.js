/*
 * 주문·배송 안내 메일 템플릿 카탈로그
 *
 * ── 왜 기본값이 코드에 있나 ──
 * 이 제품은 몰을 찍어내는 빌더다. 템플릿을 DB 시드로 깔면 "시드를 넣은 이 몰"에서만 메일이
 * 나가고, 새로 만든 몰에서는 조용히 아무것도 안 나간다. 그래서 **기본 제목·본문은 여기 코드에**
 * 두고, `email_template` 테이블에는 관리자가 실제로 고친 것만 오버라이드로 쌓는다.
 * 테이블이 텅 비어 있어도 모든 메일이 정상 발송된다.
 *
 * ── 토큰 ──
 * 본문·제목의 `{{token}}` 은 발송 시점 데이터로 치환된다. 관리자는 화면의 [변수 넣기] 칩으로
 * 토큰을 삽입할 뿐, 직접 타이핑하거나 JSON 을 쓰지 않는다.
 * 값은 기본적으로 HTML 이스케이프된다 — `raw: true` 인 토큰(item_table 등)만 그대로 들어간다.
 */

/** 화면 그룹 (목록 탭) */
const GROUPS = [
    { key: 'COMMON', label: '공통' },
    { key: 'B2C', label: '개인회원 주문·배송' },
    { key: 'B2B', label: '기업회원 주문·배송' },
    { key: 'ADMIN', label: '운영자 알림' },
];

/**
 * 토큰 사전. label 은 관리자 화면 칩에 뜨는 이름, sample 은 미리보기용 값.
 */
const VAR_CATALOG = {
    // 공통 — 사이트 정보
    shop_name: { label: '쇼핑몰 이름', sample: '와이디몰' },
    shop_url: { label: '쇼핑몰 주소', sample: 'https://dev-mall.ydata.co.kr' },
    cs_phone: { label: '고객센터 전화', sample: '1588-0000' },
    cs_email: { label: '고객센터 이메일', sample: 'help@example.co.kr' },
    cs_hours: { label: '고객센터 운영시간', sample: '평일 09:00 ~ 18:00' },
    content: { label: '본문 내용', sample: '(각 템플릿의 본문이 여기 들어갑니다)', raw: true },

    // 주문 공통
    order_number: { label: '주문번호', sample: 'ORD20260723-0001' },
    order_id: { label: '주문 ID', sample: '1024' },
    order_date: { label: '주문일시', sample: '2026-07-23 14:30' },
    order_url: { label: '주문 상세 링크', sample: 'https://dev-mall.ydata.co.kr/mypage/orders/1024' },
    customer_name: { label: '주문자명', sample: '홍길동' },
    item_summary: { label: '상품 요약(한 줄)', sample: '홍삼정 스틱 30포 외 2건' },
    item_count: { label: '상품 종류 수', sample: '3' },
    item_table: { label: '상품 목록 표', sample: '', raw: true },
    item_list: { label: '상품 목록(텍스트)', sample: '홍삼정 스틱 30포 x 1' },
    subtotal_amount: { label: '상품 금액', sample: '54,000원' },
    shipping_fee: { label: '배송비', sample: '3,000원' },
    discount_amount: { label: '할인 금액', sample: '5,000원' },
    point_used: { label: '사용 적립금', sample: '1,000원' },
    total_amount: { label: '결제 금액', sample: '51,000원' },
    payment_method: { label: '결제수단', sample: '카드' },

    // 배송지 / 배송
    receiver_name: { label: '받는 분', sample: '홍길동' },
    receiver_phone: { label: '받는 분 연락처', sample: '010-1234-5678' },
    receiver_address: { label: '배송지 주소', sample: '서울시 강남구 테헤란로 1길 10, 101호' },
    shipping_message: { label: '배송 요청사항', sample: '부재 시 경비실에 맡겨주세요' },
    courier_company: { label: '택배사', sample: 'CJ대한통운' },
    tracking_number: { label: '송장번호', sample: '123456789012' },
    shipped_at: { label: '출고일시', sample: '2026-07-24 11:00' },
    delivered_at: { label: '배송완료일시', sample: '2026-07-25 15:20' },

    // 클레임 / 환불
    claim_type_label: { label: '클레임 구분', sample: '반품' },
    claim_reason: { label: '신청 사유', sample: '단순 변심' },
    claim_status_label: { label: '처리 결과', sample: '승인' },
    refund_amount: { label: '환불 금액', sample: '51,000원' },
    return_shipping_fee: { label: '반품 배송비', sample: '3,000원' },
    admin_memo: { label: '처리 메모', sample: '상품 회수 확인 후 환불 처리했습니다.' },

    // B2B
    company_name: { label: '거래처명', sample: '(주)와이디상사' },
    business_number: { label: '사업자등록번호', sample: '123-45-67890' },
    supply_amount: { label: '공급가액', sample: '500,000원' },
    vat_amount: { label: '부가세', sample: '50,000원' },
    payment_due_at: { label: '입금 기한', sample: '2026-07-30' },
    bank_account: { label: '입금 계좌', sample: '국민은행 000-00-0000 (주)와이디' },
    purchase_order_number: { label: '발주번호', sample: 'PO-2026-0012' },
    reject_reason: { label: '반려/취소 사유', sample: '재고 부족' },
    b2b_order_url: { label: 'B2B 주문 링크', sample: 'https://dev-mall.ydata.co.kr/b2b/orders/1024' },
};

/* ── 기본 본문 조각 ─────────────────────────────────────────────── */

const S = {
    wrap: 'font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic","맑은 고딕",sans-serif;color:#111827;line-height:1.7;font-size:14px;',
    h: 'margin:0 0 16px;font-size:18px;font-weight:700;',
    box: 'background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;',
    row: 'padding:3px 0;',
    btn: 'display:inline-block;padding:10px 20px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;',
    muted: 'color:#6b7280;font-size:12px;',
};

/** 주문 요약 박스 (주문번호·상품·결제금액) */
const ORDER_BOX = `<div style="${S.box}">
  <div style="${S.row}"><strong>주문번호</strong> {{order_number}}</div>
  <div style="${S.row}"><strong>주문일시</strong> {{order_date}}</div>
  <div style="${S.row}"><strong>주문상품</strong> {{item_summary}}</div>
  <div style="${S.row}"><strong>결제금액</strong> {{total_amount}}</div>
</div>`;

const DELIVERY_BOX = `<div style="${S.box}">
  <div style="${S.row}"><strong>받는 분</strong> {{receiver_name}} ({{receiver_phone}})</div>
  <div style="${S.row}"><strong>배송지</strong> {{receiver_address}}</div>
</div>`;

const ORDER_BUTTON = `<p style="margin:20px 0;"><a href="{{order_url}}" style="${S.btn}">주문 상세 보기</a></p>`;

/* ── 템플릿 정의 ────────────────────────────────────────────────── */

const TEMPLATES = [
    /* 공통 레이아웃 --------------------------------------------------- */
    {
        key: '_layout',
        group: 'COMMON',
        label: '공통 레이아웃 (머리말·꼬리말)',
        description: '모든 안내 메일을 감싸는 틀입니다. 각 템플릿의 본문이 {{content}} 자리에 들어갑니다.',
        when: '모든 메일에 적용',
        canDisable: true,
        disableHint: '끄면 머리말·꼬리말 없이 각 템플릿 본문만 발송됩니다.',
        variables: ['content', 'shop_name', 'shop_url', 'cs_phone', 'cs_email', 'cs_hours'],
        defaultSubject: null, // 레이아웃은 제목이 없다
        defaultBody: `<div style="${S.wrap}max-width:600px;margin:0 auto;padding:24px;">
  <div style="padding-bottom:16px;border-bottom:2px solid #111827;">
    <a href="{{shop_url}}" style="font-size:20px;font-weight:800;color:#111827;text-decoration:none;">{{shop_name}}</a>
  </div>

  {{content}}

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;${S.muted}">
    <div>고객센터 {{cs_phone}} · {{cs_email}}</div>
    <div>{{cs_hours}}</div>
    <div style="margin-top:8px;">본 메일은 발신 전용입니다. 문의는 고객센터를 이용해 주세요.</div>
  </div>
</div>`,
    },

    /* 개인회원(B2C) --------------------------------------------------- */
    {
        key: 'b2c_order_paid',
        group: 'B2C',
        label: '주문·결제 완료 안내',
        description: '고객이 결제를 마쳤을 때 주문자에게 보냅니다.',
        when: '결제 승인 직후 (주문 상태 PAID)',
        recipient: '주문자',
        variables: [
            'customer_name', 'order_number', 'order_date', 'order_url', 'item_summary', 'item_count',
            'item_table', 'item_list', 'subtotal_amount', 'shipping_fee', 'discount_amount', 'point_used',
            'total_amount', 'payment_method', 'receiver_name', 'receiver_phone', 'receiver_address',
            'shipping_message', 'shop_name', 'shop_url', 'cs_phone',
        ],
        defaultSubject: '[{{shop_name}}] 주문이 정상적으로 접수되었습니다 (주문번호 {{order_number}})',
        defaultBody: `<p style="${S.h}">{{customer_name}} 님, 주문해 주셔서 감사합니다.</p>
<p>결제가 완료되어 주문이 접수되었습니다. 상품 준비가 끝나면 배송 안내를 다시 보내드립니다.</p>
${ORDER_BOX}
{{item_table}}
<div style="${S.box}">
  <div style="${S.row}"><strong>상품금액</strong> {{subtotal_amount}}</div>
  <div style="${S.row}"><strong>배송비</strong> {{shipping_fee}}</div>
  <div style="${S.row}"><strong>할인</strong> {{discount_amount}}</div>
  <div style="${S.row}"><strong>적립금 사용</strong> {{point_used}}</div>
  <div style="${S.row}"><strong>총 결제금액</strong> {{total_amount}} ({{payment_method}})</div>
</div>
${DELIVERY_BOX}
${ORDER_BUTTON}`,
    },
    {
        key: 'b2c_order_shipped',
        group: 'B2C',
        label: '배송 시작 안내',
        description: '송장이 등록되어 상품이 출고됐을 때 보냅니다.',
        when: '배송 관리에서 송장 등록 (주문 상태 SHIPPED)',
        recipient: '주문자',
        variables: [
            'customer_name', 'order_number', 'order_url', 'item_summary', 'courier_company',
            'tracking_number', 'shipped_at', 'receiver_name', 'receiver_phone', 'receiver_address',
            'shop_name', 'shop_url', 'cs_phone',
        ],
        defaultSubject: '[{{shop_name}}] 주문하신 상품이 출고되었습니다 (주문번호 {{order_number}})',
        defaultBody: `<p style="${S.h}">{{customer_name}} 님, 상품이 출고되었습니다.</p>
<p>주문하신 상품이 배송을 시작했습니다. 아래 송장번호로 배송 상황을 확인하실 수 있습니다.</p>
<div style="${S.box}">
  <div style="${S.row}"><strong>주문번호</strong> {{order_number}}</div>
  <div style="${S.row}"><strong>주문상품</strong> {{item_summary}}</div>
  <div style="${S.row}"><strong>택배사</strong> {{courier_company}}</div>
  <div style="${S.row}"><strong>송장번호</strong> {{tracking_number}}</div>
  <div style="${S.row}"><strong>출고일시</strong> {{shipped_at}}</div>
</div>
${DELIVERY_BOX}
${ORDER_BUTTON}`,
    },
    {
        key: 'b2c_order_delivered',
        group: 'B2C',
        label: '배송 완료 안내',
        description: '배송완료 처리 시 보냅니다. 반품 가능 기간 안내에 쓰입니다.',
        when: '배송 관리에서 배송완료 처리 (주문 상태 DELIVERED)',
        recipient: '주문자',
        variables: [
            'customer_name', 'order_number', 'order_url', 'item_summary', 'courier_company',
            'tracking_number', 'delivered_at', 'shop_name', 'shop_url', 'cs_phone',
        ],
        defaultSubject: '[{{shop_name}}] 상품이 배송 완료되었습니다 (주문번호 {{order_number}})',
        defaultBody: `<p style="${S.h}">{{customer_name}} 님, 상품이 잘 도착했습니다.</p>
<p>배송이 완료되었습니다. 상품에 이상이 있으시면 배송완료일로부터 7일 이내에 반품을 신청해 주세요.</p>
<div style="${S.box}">
  <div style="${S.row}"><strong>주문번호</strong> {{order_number}}</div>
  <div style="${S.row}"><strong>주문상품</strong> {{item_summary}}</div>
  <div style="${S.row}"><strong>배송완료</strong> {{delivered_at}}</div>
</div>
${ORDER_BUTTON}
<p style="${S.muted}">상품이 마음에 드셨다면 구매후기를 남겨 주세요. 다른 고객에게 큰 도움이 됩니다.</p>`,
    },
    {
        key: 'b2c_claim_requested',
        group: 'B2C',
        label: '취소·반품 접수 안내',
        description: '고객이 취소 또는 반품을 신청했을 때 보냅니다.',
        when: '마이페이지에서 취소·반품 신청',
        recipient: '주문자',
        variables: [
            'customer_name', 'order_number', 'order_url', 'item_summary', 'claim_type_label',
            'claim_reason', 'claim_status_label', 'shop_name', 'shop_url', 'cs_phone',
        ],
        defaultSubject: '[{{shop_name}}] {{claim_type_label}} 신청이 접수되었습니다 (주문번호 {{order_number}})',
        defaultBody: `<p style="${S.h}">{{customer_name}} 님, {{claim_type_label}} 신청이 접수되었습니다.</p>
<p>접수된 내용을 확인한 뒤 처리 결과를 다시 안내해 드리겠습니다.</p>
<div style="${S.box}">
  <div style="${S.row}"><strong>주문번호</strong> {{order_number}}</div>
  <div style="${S.row}"><strong>주문상품</strong> {{item_summary}}</div>
  <div style="${S.row}"><strong>신청 구분</strong> {{claim_type_label}}</div>
  <div style="${S.row}"><strong>신청 사유</strong> {{claim_reason}}</div>
  <div style="${S.row}"><strong>진행 상태</strong> {{claim_status_label}}</div>
</div>
${ORDER_BUTTON}`,
    },
    {
        key: 'b2c_claim_approved',
        group: 'B2C',
        label: '취소·반품 승인(환불) 안내',
        description: '관리자가 클레임을 승인하고 환불이 진행될 때 보냅니다.',
        when: '클레임 관리에서 승인 처리',
        recipient: '주문자',
        variables: [
            'customer_name', 'order_number', 'order_url', 'item_summary', 'claim_type_label',
            'claim_reason', 'refund_amount', 'return_shipping_fee', 'admin_memo',
            'shop_name', 'shop_url', 'cs_phone',
        ],
        defaultSubject: '[{{shop_name}}] {{claim_type_label}} 처리가 완료되었습니다 (주문번호 {{order_number}})',
        defaultBody: `<p style="${S.h}">{{customer_name}} 님, {{claim_type_label}} 처리가 완료되었습니다.</p>
<p>환불 금액은 결제수단에 따라 영업일 기준 3~5일 내에 반영됩니다.</p>
<div style="${S.box}">
  <div style="${S.row}"><strong>주문번호</strong> {{order_number}}</div>
  <div style="${S.row}"><strong>주문상품</strong> {{item_summary}}</div>
  <div style="${S.row}"><strong>처리 구분</strong> {{claim_type_label}}</div>
  <div style="${S.row}"><strong>환불 금액</strong> {{refund_amount}}</div>
  <div style="${S.row}"><strong>반품 배송비</strong> {{return_shipping_fee}}</div>
</div>
${ORDER_BUTTON}`,
    },
    {
        key: 'b2c_claim_rejected',
        group: 'B2C',
        label: '취소·반품 반려 안내',
        description: '클레임이 반려됐을 때 사유와 함께 보냅니다.',
        when: '클레임 관리에서 반려 처리',
        recipient: '주문자',
        variables: [
            'customer_name', 'order_number', 'order_url', 'item_summary', 'claim_type_label',
            'claim_reason', 'admin_memo', 'shop_name', 'shop_url', 'cs_phone',
        ],
        defaultSubject: '[{{shop_name}}] {{claim_type_label}} 신청이 반려되었습니다 (주문번호 {{order_number}})',
        defaultBody: `<p style="${S.h}">{{customer_name}} 님, {{claim_type_label}} 신청이 반려되었습니다.</p>
<div style="${S.box}">
  <div style="${S.row}"><strong>주문번호</strong> {{order_number}}</div>
  <div style="${S.row}"><strong>주문상품</strong> {{item_summary}}</div>
  <div style="${S.row}"><strong>신청 구분</strong> {{claim_type_label}}</div>
  <div style="${S.row}"><strong>반려 사유</strong> {{admin_memo}}</div>
</div>
<p>자세한 내용이 궁금하시면 고객센터({{cs_phone}})로 문의해 주세요.</p>
${ORDER_BUTTON}`,
    },

    /* 기업회원(B2B) --------------------------------------------------- */
    {
        key: 'b2b_order_requested',
        group: 'B2B',
        label: '[기업] 주문 접수 안내',
        description: '기업회원이 주문을 넣었을 때 담당자에게 보냅니다.',
        when: 'B2B 주문 접수 직후',
        recipient: '기업회원 담당자',
        variables: [
            'company_name', 'order_number', 'order_date', 'item_summary', 'total_amount',
            'supply_amount', 'vat_amount', 'purchase_order_number', 'b2b_order_url',
            'shop_name', 'shop_url', 'cs_phone',
        ],
        defaultSubject: '[{{shop_name}}] 주문이 접수되었습니다 ({{order_number}})',
        defaultBody: `<p style="${S.h}">{{company_name}} 님, 주문이 접수되었습니다.</p>
<p>담당자 확인 후 승인·입금 안내를 드립니다.</p>
<div style="${S.box}">
  <div style="${S.row}"><strong>주문번호</strong> {{order_number}}</div>
  <div style="${S.row}"><strong>발주번호</strong> {{purchase_order_number}}</div>
  <div style="${S.row}"><strong>주문상품</strong> {{item_summary}}</div>
  <div style="${S.row}"><strong>주문금액</strong> {{total_amount}}</div>
</div>
<p style="margin:20px 0;"><a href="{{b2b_order_url}}" style="${S.btn}">주문 상세 보기</a></p>`,
    },
    {
        key: 'b2b_order_approved',
        group: 'B2B',
        label: '[기업] 주문 승인·입금 안내',
        description: '주문이 승인되어 입금을 요청할 때 보냅니다.',
        when: 'B2B 주문 승인 처리',
        recipient: '기업회원 담당자',
        variables: [
            'company_name', 'order_number', 'item_summary', 'total_amount', 'supply_amount',
            'vat_amount', 'payment_due_at', 'bank_account', 'b2b_order_url',
            'shop_name', 'shop_url', 'cs_phone',
        ],
        defaultSubject: '[{{shop_name}}] 주문이 승인되었습니다 · 입금 안내 ({{order_number}})',
        defaultBody: `<p style="${S.h}">{{company_name}} 님, 주문이 승인되었습니다.</p>
<div style="${S.box}">
  <div style="${S.row}"><strong>주문번호</strong> {{order_number}}</div>
  <div style="${S.row}"><strong>공급가액</strong> {{supply_amount}}</div>
  <div style="${S.row}"><strong>부가세</strong> {{vat_amount}}</div>
  <div style="${S.row}"><strong>결제금액</strong> {{total_amount}}</div>
  <div style="${S.row}"><strong>입금 기한</strong> {{payment_due_at}}</div>
  <div style="${S.row}"><strong>입금 계좌</strong> {{bank_account}}</div>
</div>
<p>기한 내 입금이 확인되지 않으면 주문이 자동 취소될 수 있습니다.</p>
<p style="margin:20px 0;"><a href="{{b2b_order_url}}" style="${S.btn}">주문 상세 보기</a></p>`,
    },
    {
        key: 'b2b_order_paid',
        group: 'B2B',
        label: '[기업] 입금 확인 안내',
        description: '입금이 확인됐을 때 보냅니다.',
        when: 'B2B 입금 확인 처리',
        recipient: '기업회원 담당자',
        variables: [
            'company_name', 'order_number', 'item_summary', 'total_amount', 'b2b_order_url',
            'shop_name', 'shop_url', 'cs_phone',
        ],
        defaultSubject: '[{{shop_name}}] 입금이 확인되었습니다 ({{order_number}})',
        defaultBody: `<p style="${S.h}">{{company_name}} 님, 입금이 확인되었습니다.</p>
<p>상품 준비 후 출고해 드리겠습니다.</p>
<div style="${S.box}">
  <div style="${S.row}"><strong>주문번호</strong> {{order_number}}</div>
  <div style="${S.row}"><strong>주문상품</strong> {{item_summary}}</div>
  <div style="${S.row}"><strong>결제금액</strong> {{total_amount}}</div>
</div>
<p style="margin:20px 0;"><a href="{{b2b_order_url}}" style="${S.btn}">주문 상세 보기</a></p>`,
    },
    {
        key: 'b2b_order_shipped',
        group: 'B2B',
        label: '[기업] 출고 안내',
        description: '상품이 출고되고 송장이 등록됐을 때 보냅니다.',
        when: 'B2B 주문 출고 처리',
        recipient: '기업회원 담당자',
        variables: [
            'company_name', 'order_number', 'item_summary', 'courier_company', 'tracking_number',
            'shipped_at', 'receiver_name', 'receiver_address', 'b2b_order_url',
            'shop_name', 'shop_url', 'cs_phone',
        ],
        defaultSubject: '[{{shop_name}}] 주문 상품이 출고되었습니다 ({{order_number}})',
        defaultBody: `<p style="${S.h}">{{company_name}} 님, 주문 상품이 출고되었습니다.</p>
<div style="${S.box}">
  <div style="${S.row}"><strong>주문번호</strong> {{order_number}}</div>
  <div style="${S.row}"><strong>주문상품</strong> {{item_summary}}</div>
  <div style="${S.row}"><strong>택배사</strong> {{courier_company}}</div>
  <div style="${S.row}"><strong>송장번호</strong> {{tracking_number}}</div>
  <div style="${S.row}"><strong>배송지</strong> {{receiver_address}}</div>
</div>
<p style="margin:20px 0;"><a href="{{b2b_order_url}}" style="${S.btn}">주문 상세 보기</a></p>`,
    },
    {
        key: 'b2b_order_delivered',
        group: 'B2B',
        label: '[기업] 배송 완료 안내',
        description: '배송완료 처리 시 보냅니다.',
        when: 'B2B 주문 배송완료 처리',
        recipient: '기업회원 담당자',
        variables: [
            'company_name', 'order_number', 'item_summary', 'delivered_at', 'b2b_order_url',
            'shop_name', 'shop_url', 'cs_phone',
        ],
        defaultSubject: '[{{shop_name}}] 주문 상품이 배송 완료되었습니다 ({{order_number}})',
        defaultBody: `<p style="${S.h}">{{company_name}} 님, 주문 상품이 배송 완료되었습니다.</p>
<div style="${S.box}">
  <div style="${S.row}"><strong>주문번호</strong> {{order_number}}</div>
  <div style="${S.row}"><strong>주문상품</strong> {{item_summary}}</div>
  <div style="${S.row}"><strong>배송완료</strong> {{delivered_at}}</div>
</div>
<p>수량·상태에 이상이 있으면 고객센터({{cs_phone}})로 알려 주세요.</p>
<p style="margin:20px 0;"><a href="{{b2b_order_url}}" style="${S.btn}">주문 상세 보기</a></p>`,
    },
    {
        key: 'b2b_order_rejected',
        group: 'B2B',
        label: '[기업] 주문 반려·취소 안내',
        description: '주문이 반려되거나 취소됐을 때 사유와 함께 보냅니다.',
        when: 'B2B 주문 반려 / 취소 처리 (입금 기한 초과 자동 취소 포함)',
        recipient: '기업회원 담당자',
        variables: [
            'company_name', 'order_number', 'item_summary', 'total_amount', 'reject_reason',
            'b2b_order_url', 'shop_name', 'shop_url', 'cs_phone',
        ],
        defaultSubject: '[{{shop_name}}] 주문이 반려되었습니다 ({{order_number}})',
        defaultBody: `<p style="${S.h}">{{company_name}} 님, 주문이 반려되었습니다.</p>
<div style="${S.box}">
  <div style="${S.row}"><strong>주문번호</strong> {{order_number}}</div>
  <div style="${S.row}"><strong>주문상품</strong> {{item_summary}}</div>
  <div style="${S.row}"><strong>사유</strong> {{reject_reason}}</div>
</div>
<p>자세한 내용은 담당자에게 문의해 주세요. 고객센터 {{cs_phone}}</p>`,
    },

    {
        key: 'b2b_claim_approved',
        group: 'B2B',
        label: '[기업] 취소·반품 승인 안내',
        description: '기업 주문의 취소·반품이 승인됐을 때 보냅니다. 환불은 계좌 이체로 별도 진행됩니다.',
        when: 'B2B 클레임 승인 처리',
        recipient: '기업회원 담당자',
        variables: [
            'company_name', 'order_number', 'item_summary', 'claim_type_label', 'claim_reason',
            'refund_amount', 'return_shipping_fee', 'admin_memo', 'b2b_order_url',
            'shop_name', 'shop_url', 'cs_phone',
        ],
        defaultSubject: '[{{shop_name}}] {{claim_type_label}} 신청이 승인되었습니다 ({{order_number}})',
        defaultBody: `<p style="${S.h}">{{company_name}} 님, {{claim_type_label}} 신청이 승인되었습니다.</p>
<div style="${S.box}">
  <div style="${S.row}"><strong>주문번호</strong> {{order_number}}</div>
  <div style="${S.row}"><strong>주문상품</strong> {{item_summary}}</div>
  <div style="${S.row}"><strong>처리 구분</strong> {{claim_type_label}}</div>
  <div style="${S.row}"><strong>환불 예정 금액</strong> {{refund_amount}}</div>
  <div style="${S.row}"><strong>반품 배송비</strong> {{return_shipping_fee}}</div>
</div>
<p>환불 금액은 등록된 계좌로 이체해 드립니다. 계좌 정보가 변경되었다면 담당자에게 알려 주세요.</p>
<p style="margin:20px 0;"><a href="{{b2b_order_url}}" style="${S.btn}">주문 상세 보기</a></p>`,
    },
    {
        key: 'b2b_claim_rejected',
        group: 'B2B',
        label: '[기업] 취소·반품 반려 안내',
        description: '기업 주문의 취소·반품이 반려됐을 때 사유와 함께 보냅니다.',
        when: 'B2B 클레임 반려 처리',
        recipient: '기업회원 담당자',
        variables: [
            'company_name', 'order_number', 'item_summary', 'claim_type_label', 'claim_reason',
            'admin_memo', 'b2b_order_url', 'shop_name', 'shop_url', 'cs_phone',
        ],
        defaultSubject: '[{{shop_name}}] {{claim_type_label}} 신청이 반려되었습니다 ({{order_number}})',
        defaultBody: `<p style="${S.h}">{{company_name}} 님, {{claim_type_label}} 신청이 반려되었습니다.</p>
<div style="${S.box}">
  <div style="${S.row}"><strong>주문번호</strong> {{order_number}}</div>
  <div style="${S.row}"><strong>주문상품</strong> {{item_summary}}</div>
  <div style="${S.row}"><strong>반려 사유</strong> {{admin_memo}}</div>
</div>
<p>자세한 내용은 담당자에게 문의해 주세요. 고객센터 {{cs_phone}}</p>`,
    },
    {
        key: 'b2b_claim_refunded',
        group: 'B2B',
        label: '[기업] 환불 완료 안내',
        description: '운영자가 계좌로 환불을 이체하고 완료 처리했을 때 보냅니다.',
        when: 'B2B 클레임의 [계좌 환불 완료] 처리',
        recipient: '기업회원 담당자',
        variables: [
            'company_name', 'order_number', 'item_summary', 'claim_type_label', 'refund_amount',
            'admin_memo', 'b2b_order_url', 'shop_name', 'shop_url', 'cs_phone',
        ],
        defaultSubject: '[{{shop_name}}] 환불이 완료되었습니다 ({{order_number}})',
        defaultBody: `<p style="${S.h}">{{company_name}} 님, 환불이 완료되었습니다.</p>
<div style="${S.box}">
  <div style="${S.row}"><strong>주문번호</strong> {{order_number}}</div>
  <div style="${S.row}"><strong>주문상품</strong> {{item_summary}}</div>
  <div style="${S.row}"><strong>환불 금액</strong> {{refund_amount}}</div>
</div>
<p>입금 내역이 확인되지 않으면 고객센터({{cs_phone}})로 알려 주세요.</p>
<p style="margin:20px 0;"><a href="{{b2b_order_url}}" style="${S.btn}">주문 상세 보기</a></p>`,
    },

    /* 운영자 알림 ------------------------------------------------------ */
    {
        key: 'admin_claim_requested',
        group: 'ADMIN',
        label: '[운영자] 취소·반품 접수 알림',
        description: '고객이 취소·반품을 신청하면 운영자에게 보냅니다. 수신 주소는 환경설정의 관리자 이메일입니다.',
        when: '고객의 취소·반품 신청 직후',
        recipient: '운영자(관리자 이메일)',
        variables: [
            'order_number', 'order_id', 'customer_name', 'item_summary', 'claim_type_label',
            'claim_reason', 'total_amount', 'shop_name', 'shop_url',
        ],
        defaultSubject: '[{{shop_name}}] {{claim_type_label}} 신청 접수 — 주문번호 {{order_number}}',
        defaultBody: `<p style="${S.h}">{{claim_type_label}} 신청이 접수되었습니다.</p>
<div style="${S.box}">
  <div style="${S.row}"><strong>주문번호</strong> {{order_number}}</div>
  <div style="${S.row}"><strong>주문자</strong> {{customer_name}}</div>
  <div style="${S.row}"><strong>주문상품</strong> {{item_summary}}</div>
  <div style="${S.row}"><strong>결제금액</strong> {{total_amount}}</div>
  <div style="${S.row}"><strong>구분</strong> {{claim_type_label}}</div>
  <div style="${S.row}"><strong>사유</strong> {{claim_reason}}</div>
</div>
<p style="margin:20px 0;"><a href="{{shop_url}}/admin/claims" style="${S.btn}">클레임 관리로 이동</a></p>`,
    },
];

const BY_KEY = new Map(TEMPLATES.map((t) => [t.key, t]));

/** 레이아웃 템플릿 키 — 다른 템플릿을 감싸는 틀. 목록에서도 따로 다룬다. */
const LAYOUT_KEY = '_layout';

function getTemplateDef(key) {
    return BY_KEY.get(key) || null;
}

function listTemplates() {
    return TEMPLATES;
}

/** 그룹 순서대로 묶어서 반환 (관리자 목록 화면용) */
function listTemplatesByGroup() {
    return GROUPS.map((g) => ({
        ...g,
        templates: TEMPLATES.filter((t) => t.group === g.key),
    })).filter((g) => g.templates.length > 0);
}

/** 템플릿이 쓰는 토큰 정의 목록 (관리자 화면 칩) */
function variableDefs(key) {
    const def = getTemplateDef(key);
    if (!def) return [];
    return def.variables
        .map((token) => ({ token, ...(VAR_CATALOG[token] || { label: token, sample: '' }) }));
}

/** 값을 그대로(이스케이프 없이) 넣어야 하는 토큰인지 */
function isRawToken(token) {
    return Boolean((VAR_CATALOG[token] || {}).raw);
}

/** 미리보기용 샘플 값 묶음 */
function sampleVars(key) {
    const out = {};
    for (const v of variableDefs(key)) out[v.token] = v.sample;
    return out;
}

module.exports = {
    GROUPS,
    VAR_CATALOG,
    LAYOUT_KEY,
    listTemplates,
    listTemplatesByGroup,
    getTemplateDef,
    variableDefs,
    isRawToken,
    sampleVars,
};
