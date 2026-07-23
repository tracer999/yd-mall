const pool = require('../config/db');
const groupBuySvc = require('../services/groupBuy/groupBuyService');
const liveSvc = require('../services/live/liveService');
const dealSvc = require('../services/deal/dealService');
const { calcShippingFee } = require('../services/shipping/shippingCalculator');
const { redeemCouponCode, reserveCouponForOrder } = require('../services/coupon/couponIssueService');
const {
    combinationGroup, couponableAmount, calcOrderDiscount, calcShippingDiscount,
    meetsMinOrder, benefitLabel,
} = require('../services/coupon/discountCalculator');
// 멤버십 등급 혜택(정률할인·추가적립·무료배송) + 실적 원장 + 즉시 승급
const membershipBenefitService = require('../services/membership/membershipBenefitService');
const performanceService = require('../services/membership/performanceService');
const evaluationService = require('../services/membership/evaluationService');
const membershipConfigService = require('../services/membership/membershipConfigService');
const skuService = require('../services/catalog/skuService');
// B2B — 전용가 리졸버 · 세액 분해 · 주문 절차(승인/입금)
const b2bPricingService = require('../services/b2b/b2bPricingService');
const b2bTaxService = require('../services/b2b/b2bTaxService');
const b2bOrderService = require('../services/b2b/b2bOrderService');
const b2bContextMw = require('../middleware/b2bContext');
const optionService = require('../services/catalog/optionService');
const { getNumberSetting } = require('../config/systemSettings');
const orderMailer = require('../services/email/orderMailer');

// 구매 적립률(%)이 system_settings 에 아예 없을 때만 쓰는 기본값.
// 관리자가 0 을 저장했다면 그건 "적립 없음"이라는 뜻이므로 이 값으로 덮지 않는다.
const DEFAULT_POINT_RATE = 5;

/*
 * ── 공동구매 연동 (docs/사이트개선/group_buy_design_and_development.md §9) ──
 *
 * `group_buy_id` 가 없으면 이 파일의 동작은 예전과 완전히 같다. 있으면 단일 상품
 * 바로구매 경로에서만 갈라지고, 결제 단가를 `groupBuySvc.resolveLine()` 이 서버에서
 * 다시 계산한다. 프론트가 보낸 가격은 어디서도 쓰지 않는다(§9-2).
 *
 * 장바구니(cart=1) 경로는 건드리지 않았다 — carts 에 가격·출처 컬럼이 없어 라인마다
 * 공동구매가를 실을 수 없다(2차).
 */

/** 공동구매 검증 실패 시 되돌아갈 곳. slug 를 모르면 목록으로. */
function groupBuyErrorRedirect(line) {
    return line.slug
        ? `/group-buy/${encodeURIComponent(line.slug)}?error=${line.reason}`
        : '/group-buy';
}

/** 쇼핑라이브 구매 검증 실패 → 방송 상세로 되돌린다 (설계: live sales.md §5) */
function liveErrorRedirect(line) {
    return line.slug
        ? `/live/${encodeURIComponent(line.slug)}?error=${line.reason}`
        : '/live';
}

/*
 * 쿠폰 적용범위(scope_json) 판정에 필요한 상품 속성. 주문 라인마다 실어 나른다.
 * 이 컬럼들이 없으면 카테고리·브랜드·뱃지 쿠폰이 전 상품에 걸린다.
 */
const PRODUCT_SCOPE_COLS = `p.id AS product_id, p.name, p.price,
    p.category_id, p.brand_category_id, p.product_badge`;

function toScopeItem(row) {
    return {
        product_id: row.product_id,
        name: row.name,
        price: row.price,
        category_id: row.category_id,
        brand_id: row.brand_category_id,
        badges: row.product_badge ? String(row.product_badge).split(',') : [],
    };
}

/**
 * 지금 쓸 수 있는 쿠폰 (미사용 + 미점유 + 유효기간 내 + 몰 스코프).
 *
 *  · 유효기간은 `COALESCE(uc.expires_at, c.valid_to)` — valid_days 로 발급된 쿠폰은 개인별 만료일이 있다.
 *  · 다른 PENDING 주문이 점유 중인 쿠폰은 제외한다(C2). 30분 넘게 방치된 점유는 무시한다
 *    — 점유 해제 배치가 없으므로 조회 시 나이로 거른다(§6-2 각주).
 *  · `uc.id` 를 `user_coupon_id` 로 내보낸다. `c.id` 는 쿠폰 마스터 id 다 — 섞으면 안 된다.
 */
async function loadUsableCoupons(userId, mallId) {
    const [rows] = await pool.query(
        `SELECT uc.id AS user_coupon_id, c.*
           FROM user_coupons uc
           JOIN coupons c ON uc.coupon_id = c.id
          WHERE uc.user_id = ? AND uc.used_at IS NULL AND c.status = 'ACTIVE'
            AND (c.mall_id IS NULL OR c.mall_id = ?)
            AND (uc.reserved_order_id IS NULL OR uc.reserved_at < NOW() - INTERVAL 30 MINUTE)
            AND (c.valid_from IS NULL OR c.valid_from <= NOW())
            AND (COALESCE(uc.expires_at, c.valid_to) IS NULL OR COALESCE(uc.expires_at, c.valid_to) >= NOW())`,
        [userId, mallId]
    );
    return rows;
}

/** 전체 사용 한도(max_total_uses) 재검증 (C4). 발급 한도(issue_limit)와 다른 축이다. */
async function usageLimitReached(coupon) {
    if (coupon.max_total_uses == null) return false;
    const [[row]] = await pool.query(
        'SELECT COUNT(*) AS c FROM user_coupons WHERE coupon_id = ? AND used_at IS NOT NULL',
        [coupon.id]
    );
    return Number(row.c) >= Number(coupon.max_total_uses);
}

/**
 * 주문 번호 생성 (토스 orderId: 6자 이상 64자 이하, 영문/숫자/-_)
 */
function generateOrderNumber(prefix = 'ORD') {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const rand = String(Math.floor(Math.random() * 90000) + 10000);
    return `${prefix}-${y}${m}${d}-${rand}`;
}

/**
 * 주문의 재고 검증 (결제 전 재고 확인)
 * @returns {{ ok: boolean, productName?: string, available?: number }}
 */
async function validateStockForOrder(orderId) {
    // 재고 검증은 SKU 기준(order_items.sku_id, 없으면 대표 SKU 폴백). 차감 로직과 동일 소스여야 한다.
    return skuService.validateStockForOrder(pool, orderId);
}

/**
 * 재고 확인 + 차감 + 주문 PAID 업데이트를 한 트랜잭션으로 처리
 * @param {number} orderId - orders.id (PK)
 * @param {{ paymentKey?: string, paymentMethod: string }} opts
 * @returns {{ ok: boolean }}
 */
async function completeOrderWithStockAndPaid(orderId, opts = {}) {
    const { paymentKey = null, paymentMethod = 'CARD' } = opts;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 쿠폰·적립금·배송비는 **주문 행이 유일한 근거**다. 요청에서 읽지 않는다(배송비 문서 §1-1).
        const [[orderRow]] = await conn.query(
            `SELECT user_id, mall_id, coupon_discount, grade_discount, point_used, user_coupon_id, shipping_coupon_id,
                    subtotal_amount, shipping_fee, shipping_discount, total_amount
               FROM orders WHERE id = ?`,
            [orderId]
        );

        // 재고 차감: SKU 기준(FOR UPDATE). 대표 SKU 면 products.stock 미러도 함께 깎인다.
        const deduct = await skuService.deductStockForOrder(conn, orderId);
        if (!deduct.ok) {
            await conn.rollback();
            return { ok: false };
        }

        await conn.query(
            // stock_deducted_at: 재고를 깎았다는 사실. 취소 시 복원 판정이 이 값을 본다(B2B 와 공용).
            `UPDATE orders SET status = 'PAID', payment_key = ?, payment_method = ?, paid_at = NOW(),
                    stock_deducted_at = COALESCE(stock_deducted_at, NOW())
              WHERE id = ?`,
            [paymentKey, paymentMethod, orderId]
        );

        if (orderRow && orderRow.user_id) {
            const userId = orderRow.user_id;
            const pointUsed = Number(orderRow.point_used) || 0;

            // 점유(RESERVED) → 사용(USED). 주문 쿠폰과 배송비 쿠폰 둘 다 소모한다.
            for (const ucId of [orderRow.user_coupon_id, orderRow.shipping_coupon_id].filter(Boolean)) {
                await conn.query(
                    'UPDATE user_coupons SET used_at = NOW(), order_id = ?, reserved_order_id = NULL, reserved_at = NULL WHERE id = ?',
                    [orderId, ucId]
                );
            }

            if (pointUsed > 0) {
                await conn.query(
                    'UPDATE users SET points_balance = points_balance - ? WHERE id = ?',
                    [pointUsed, userId]
                );
                await conn.query(
                    'INSERT INTO point_transactions (user_id, amount, transaction_type, order_id, description) VALUES (?, ?, ?, ?, ?)',
                    [userId, -pointUsed, 'PURCHASE_USE', orderId, '주문 결제 사용']
                );
            }

            // 적립은 상품 결제액에만 붙인다. 배송비에 적립을 주면 배송비를 내고 포인트를 버는 셈이 된다.
            // 적립률: 주문 시점 스냅샷에 저장된 등급 유효 적립률(기본률+등급 가산/대체)을 쓴다.
            // 스냅샷이 없으면(비회원·등급 미설정) 시스템 기본률로 폴백한다.
            const baseRate = getNumberSetting('point_accumulate_rate', DEFAULT_POINT_RATE);
            const [[snap]] = await conn.query(
                'SELECT grade_point_rate FROM order_membership_benefit_snapshot WHERE order_id = ?',
                [orderId]
            );
            const rate = snap && snap.grade_point_rate != null ? Number(snap.grade_point_rate) : baseRate;
            const netShipping = (Number(orderRow.shipping_fee) || 0) - (Number(orderRow.shipping_discount) || 0);
            const payAmount = Math.max(0, (Number(orderRow.total_amount) || 0) - netShipping);
            const accumulate = Math.floor((payAmount * rate) / 100);
            if (accumulate > 0) {
                await conn.query(
                    'UPDATE users SET points_balance = points_balance + ? WHERE id = ?',
                    [accumulate, userId]
                );
                await conn.query(
                    'INSERT INTO point_transactions (user_id, amount, transaction_type, order_id, description) VALUES (?, ?, ?, ?, ?)',
                    [userId, accumulate, 'PURCHASE_ACCUMULATE', orderId, `구매 적립 (${rate}%)`]
                );
            }
            // 스냅샷에 실제 적립액 기록(있을 때만).
            if (snap) {
                await conn.query(
                    'UPDATE order_membership_benefit_snapshot SET grade_point_expected = ? WHERE order_id = ?',
                    [accumulate, orderId]
                );
            }
        }

        /*
         * 공동구매 참여 기록 (§9-1).
         *
         * 같은 트랜잭션 안에서 돌린다 — 결제는 확정됐는데 참여 수량은 안 올라간 상태를
         * 만들지 않기 위해서다. 공동구매 주문이 아니면 order_items 스캔 1회로 끝난다.
         * 재실행돼도 uk_gb_participation_order_item 때문에 중복 집계되지 않는다.
         */
        await groupBuySvc.recordParticipation(conn, orderId);

        /*
         * 특가 선착순 수량 소진 (쇼핑특가 문서 §5.2).
         *
         * order_items 에 박힌 deal_item.id 로만 깎는다 — 특가를 여기서 재조회하면,
         * 주문 생성과 결제 승인 사이에 타임특가 시간창이 닫혔을 때 고객은 특가로
         * 결제했는데 소진 카운터는 건너뛰게 된다.
         *
         * 한도를 넘으면 재고 부족과 동일하게 롤백한다 → 호출부가 결제를 취소한다.
         */
        const quotaOk = await dealSvc.consumeDealQuota(conn, orderId);
        if (!quotaOk) {
            await conn.rollback();
            return { ok: false };
        }

        await conn.commit();

        /*
         * 멤버십 실적 적립 + 즉시 승급 (설계 §10.1). 트랜잭션 커밋 후 별도 처리한다 —
         * evaluateCustomer 가 자체 pool 연결로 users/customer_membership 을 잠그므로, 결제
         * 트랜잭션 안에서 돌리면 락 경합이 생긴다. best-effort: 실패해도 결제는 이미 확정됐다.
         */
        if (orderRow && orderRow.user_id && orderRow.mall_id) {
            try {
                const recognized = Math.max(0,
                    (Number(orderRow.subtotal_amount) || 0)
                    - (Number(orderRow.coupon_discount) || 0)
                    - (Number(orderRow.grade_discount) || 0));
                await performanceService.appendConfirmed(null, {
                    userId: orderRow.user_id, mallId: orderRow.mall_id, orderId,
                    amount: recognized, count: 1, occurredAt: new Date(),
                });
                await evaluationService.evaluateCustomer(orderRow.user_id, orderRow.mall_id, { immediateOnly: true });
            } catch (e) {
                console.error('[membership] post-paid ledger/eval failed (order ' + orderId + '):', e.message);
            }
        }

        /*
         * 주문 완료 안내 메일. 커밋 뒤에 보낸다 — 메일 때문에 결제 트랜잭션을 붙잡지 않는다.
         * 문구는 관리자 > 쇼핑몰 관리 > 이메일 템플릿 관리에서 바꾼다(끄면 안 나간다).
         */
        orderMailer.notifyOrderPaid(orderId)
            .catch((e) => console.error('[mail] 주문완료 안내 실패 (order ' + orderId + '):', e.message));

        return { ok: true };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * 토스페이먼츠 결제 취소 API 호출
 */
async function cancelTossPayment(paymentKey, secretKey, cancelReason) {
    const auth = Buffer.from(secretKey + ':').toString('base64');
    const resp = await fetch(`https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cancelReason: cancelReason || '재고 부족' })
    });
    return resp.ok;
}

/**
 * 비로그인 시 회원/비회원 선택
 */
exports.getChoose = async (req, res) => {
    if (req.user) {
        const redirect = `/checkout?${new URLSearchParams(req.query).toString()}`;
        return res.redirect(redirect);
    }
    res.render('user/checkout/choose', {
        title: '구매 방법 선택',
        query: req.query
    });
};

/**
 * 주문 폼 표시 (GET)
 * - 비로그인 + guest=1: 비회원 주문 폼
 * - 로그인: 회원 주문 폼 (주소 프리필)
 */
exports.getForm = async (req, res) => {
    const { product_id, quantity, guest, cart, error, success, group_buy_id, live_show_id } = req.query;
    const isGuest = guest === '1';

    if (!req.user && !isGuest) {
        const qs = new URLSearchParams(req.query).toString();
        return res.redirect(`/checkout/choose?${qs}`);
    }

    let items = [];
    let totalAmount = 0;

    if (cart === '1' && req.user) {
        const [rows] = await pool.query(
            `SELECT c.id AS cart_id, c.quantity, ${PRODUCT_SCOPE_COLS}, p.main_image, p.thumbnail_image
             FROM carts c
             JOIN products p ON c.product_id = p.id
             WHERE c.user_id = ? AND p.status = 'ON'`,
            [req.user.id]
        );
        rows.forEach((r) => {
            const qty = r.quantity || 1;
            items.push({ ...toScopeItem(r), quantity: qty, image: r.main_image || r.thumbnail_image });
        });
    } else if (group_buy_id && product_id && quantity) {
        // 공동구매 바로구매 — 단가는 group_buy_product.group_buy_price 로 서버가 확정한다.
        const line = await groupBuySvc.resolveLine(req.mallId || 1, group_buy_id, product_id, quantity);
        if (!line.ok) return res.redirect(groupBuyErrorRedirect(line));

        const [[p]] = await pool.query(
            `SELECT ${PRODUCT_SCOPE_COLS}, p.main_image, p.thumbnail_image FROM products p WHERE p.id = ?`,
            [line.product.product_id]
        );
        items = [{
            ...(p ? toScopeItem(p) : { product_id: line.product.product_id, name: line.product.name }),
            price: line.unitPrice,           // 공동구매가가 상품 정가를 이긴다
            quantity: line.quantity,
            image: p ? (p.main_image || p.thumbnail_image) : null,
            source_type: 'GROUP_BUY',        // 특가 리졸버가 이 라인을 건너뛰게 한다
            source_id: line.groupBuy.id,
        }];
    } else if (live_show_id && product_id && quantity) {
        // 쇼핑라이브 바로구매 — 단가는 live_show_product.live_price 로 서버가 확정한다.
        const line = await liveSvc.resolveLine(req.mallId || 1, live_show_id, product_id, quantity);
        if (!line.ok) return res.redirect(liveErrorRedirect(line));

        const [[p]] = await pool.query(
            `SELECT ${PRODUCT_SCOPE_COLS}, p.main_image, p.thumbnail_image FROM products p WHERE p.id = ?`,
            [line.product.product_id]
        );
        items = [{
            ...(p ? toScopeItem(p) : { product_id: line.product.product_id, name: line.product.name }),
            price: line.unitPrice,           // 라이브가가 상품 정가를 이긴다
            quantity: line.quantity,
            image: p ? (p.main_image || p.thumbnail_image) : null,
            source_type: 'LIVE_SHOW',        // 특가 리졸버가 이 라인을 건너뛰게 한다
            source_id: line.liveShow.id,
        }];
    } else if (product_id && quantity) {
        const pid = parseInt(product_id, 10);
        const qty = Math.max(1, parseInt(quantity, 10) || 1);
        const [rows] = await pool.query(
            `SELECT ${PRODUCT_SCOPE_COLS}, p.main_image, p.thumbnail_image FROM products p WHERE p.id = ? AND p.status = 'ON'`,
            [pid]
        );
        if (rows.length === 0) return res.redirect('/products');
        const p = rows[0];
        items = [{ ...toScopeItem(p), quantity: qty, image: p.main_image || p.thumbnail_image }];
    }

    if (items.length === 0) return res.redirect('/products');

    /*
     * 특가 적용. 주문서에 보이는 금액이 postForm 이 확정할 금액과 같아야 한다.
     * 공동구매 라인은 source_type 이 이미 있어 건너뛴다.
     */
    /*
     * B2B 전용가를 **특가보다 먼저** 적용한다. 여기서 찍는 source_type='B2B' 를 보고
     * dealSvc 가 그 라인을 건너뛴다(dealService.js:172) → 계약가 레인과 프로모션 레인이 분리된다.
     * 비활성 컨텍스트면 items 를 그대로 돌려주므로 B2C 흐름은 예전과 같다.
     */
    const isB2bOrder = !!(req.b2b && req.b2b.active);
    items = await b2bPricingService.applyToScopeItems(req.b2b, items);
    items = await dealSvc.applyToScopeItems(items);
    totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    const user = req.user || null;
    let pointsBalance = 0;
    let pointMinUse = 1000;
    if (user) {
        const [[uRow]] = await pool.query('SELECT points_balance FROM users WHERE id = ?', [user.id]);
        pointsBalance = (uRow && uRow.points_balance) || 0;
        pointMinUse = Number(global.systemSettings?.point_min_use || 1000) || 1000;
    }

    const prefilled = user ? {
        buyer_name: user.name || '',
        buyer_email: user.email || '',
        buyer_phone: user.phone || '',
        receiver_name: user.name || '',
        receiver_phone: user.phone || '',
        receiver_zipcode: user.zipcode || '',
        receiver_address: user.address || '',
        receiver_detailed_address: user.detailed_address || ''
    } : {};

    // 등급 혜택(표시용). 주문 생성 시 서버가 다시 계산해 확정한다 — 이 값은 총액의 근거가 아니다.
    const gradeBenefits = req.user
        ? await membershipBenefitService.getOrderBenefits({ userId: req.user.id, mallId: req.mallId || 1, subtotalAmount: totalAmount })
        : { ...membershipBenefitService.ZERO };
    const gradeDiscount = Number(gradeBenefits.discountAmount) || 0;
    const stackingMode = req.user ? await membershipConfigService.getStackingMode(req.mallId || 1) : 'STACK';

    // 화면 표시용 배송비. 주문 생성 시 서버가 다시 계산한다(§1-1) — 이 값은 총액의 근거가 아니다.
    const shipping = await calcShippingFee({
        mallId: req.mallId || 1,
        subtotalAmount: totalAmount,
        receiverZipcode: prefilled.receiver_zipcode,
        grade: { freeShipping: gradeBenefits.freeShipping, freeShipThreshold: gradeBenefits.freeShipThreshold },
    });

    /*
     * 쿠폰을 두 그룹으로 나눠 넘긴다 (§6-1).
     *   ORDER    → 주문 쿠폰 1장 (user_coupon_id)
     *   SHIPPING → 배송비 쿠폰 1장 (shipping_coupon_id)
     * 적용 가능/불가 사유도 서버가 판정한다 — 뷰가 조건을 다시 조립하지 않는다(§7-3).
     */
    const usable = user ? await loadUsableCoupons(user.id, req.mallId || 1) : [];
    const options = usable.map((c) => {
        const group = combinationGroup(c);
        const couponable = couponableAmount(items, c);
        const ok = meetsMinOrder(c, couponable);
        const discount = group === 'SHIPPING'
            ? calcShippingDiscount(c, shipping.fee)
            : calcOrderDiscount(c, couponable);
        return {
            id: c.user_coupon_id,
            name: c.name,
            group,
            benefit: benefitLabel(c),
            minOrder: Number(c.min_order_amount) || 0,
            couponable,
            discount,
            applicable: ok && discount > 0,
            reason: !ok
                ? `${Number(c.min_order_amount).toLocaleString('ko-KR')}원 이상 구매 시 사용 가능 (현재 ${couponable.toLocaleString('ko-KR')}원)`
                : (discount === 0 ? (group === 'SHIPPING' ? '배송비가 없어 사용할 수 없습니다' : '할인 대상 상품이 없습니다') : null),
        };
    });

    // B2B 주문서: 쿠폰·포인트 슬롯을 숨기고 공급가/부가세를 분리해 보여준다(설계 §7.4).
    const b2bSettings = b2bContextMw.getSettings();
    const b2bAllowsCoupon = !isB2bOrder || b2bSettings.allowCouponStacking;
    const b2bTaxTotals = isB2bOrder ? b2bTaxService.calcOrderTax(items) : null;

    res.render('user/checkout/form', {
        title: isB2bOrder ? '주문 요청' : '주문/결제',
        isB2bOrder,
        b2bSettings,
        b2bAllowsCoupon,
        b2bTaxTotals,
        items,
        totalAmount,
        isGuest,
        prefilled,
        query: req.query,
        orderCoupons: options.filter((o) => o.group === 'ORDER'),
        shippingCoupons: options.filter((o) => o.group === 'SHIPPING'),
        pointsBalance: typeof pointsBalance === 'number' ? pointsBalance : 0,
        pointMinUse: typeof pointMinUse === 'number' ? pointMinUse : 1000,
        shipping,
        gradeBenefits,
        gradeDiscount,
        stackingMode,
        error,
        success
    });
};

/**
 * 배송비 재조회 (AJAX) — 배송지 우편번호가 바뀌면 화면 배송비를 갱신한다.
 *
 * 클라이언트는 우편번호만 보낸다. **금액은 보내지 않는다.** 상품 금액은 서버가 장바구니·상품에서
 * 다시 구한다. 이 응답 역시 표시용이며, 주문 생성 시 서버가 한 번 더 계산한다.
 */
exports.postShippingFee = async (req, res) => {
    try {
        const { product_id, quantity, cart, group_buy_id, live_show_id, receiver_zipcode } = req.body;
        let subtotalAmount = 0;

        if (cart === '1' && req.user) {
            const [[row]] = await pool.query(
                `SELECT COALESCE(SUM(p.price * c.quantity), 0) AS subtotal
                   FROM carts c JOIN products p ON c.product_id = p.id
                  WHERE c.user_id = ? AND p.status = 'ON'`,
                [req.user.id]
            );
            subtotalAmount = Number(row.subtotal) || 0;
        } else if (group_buy_id && product_id && quantity) {
            const line = await groupBuySvc.resolveLine(req.mallId || 1, group_buy_id, product_id, quantity);
            if (line.ok) subtotalAmount = line.unitPrice * line.quantity;
        } else if (live_show_id && product_id && quantity) {
            const line = await liveSvc.resolveLine(req.mallId || 1, live_show_id, product_id, quantity);
            if (line.ok) subtotalAmount = line.unitPrice * line.quantity;
        } else if (product_id && quantity) {
            const qty = Math.max(1, parseInt(quantity, 10) || 1);
            const [[p]] = await pool.query('SELECT price FROM products WHERE id = ? AND status = "ON"', [parseInt(product_id, 10)]);
            if (p) subtotalAmount = p.price * qty;
        }

        const gradeBenefits = req.user
            ? await membershipBenefitService.getOrderBenefits({ userId: req.user.id, mallId: req.mallId || 1, subtotalAmount })
            : { ...membershipBenefitService.ZERO };
        const shipping = await calcShippingFee({
            mallId: req.mallId || 1,
            subtotalAmount,
            receiverZipcode: receiver_zipcode,
            grade: { freeShipping: gradeBenefits.freeShipping, freeShipThreshold: gradeBenefits.freeShipThreshold },
        });
        return res.json({ ok: true, subtotalAmount, shipping });
    } catch (err) {
        console.error('[Checkout] postShippingFee error:', err);
        return res.status(500).json({ ok: false });
    }
};

/**
 * 쿠폰 코드 적용 (SPECIAL 타입) - 회원만
 */
exports.postApplyCouponCode = async (req, res) => {
    if (!req.user) {
        const qs = new URLSearchParams(req.body).toString();
        return res.redirect('/checkout/choose?' + qs);
    }
    const code = String(req.body.coupon_code || '').trim();
    const redirectParams = new URLSearchParams();
    if (req.body.product_id) redirectParams.set('product_id', req.body.product_id);
    if (req.body.quantity) redirectParams.set('quantity', req.body.quantity);
    if (req.body.cart) redirectParams.set('cart', req.body.cart);
    const qs = redirectParams.toString();

    if (!code) {
        return res.redirect('/checkout?error=coupon_code_empty&' + qs);
    }

    try {
        // 코드 입력형은 `coupon_type='SPECIAL'` 이 아니라 `issue_method='CODE'` 로 식별한다.
        const result = await redeemCouponCode(req.user.id, code);
        if (!result.ok) {
            const map = { not_found: 'coupon_code_invalid', already_held: 'coupon_code_duplicate', issue_limit: 'coupon_code_limit' };
            return res.redirect(`/checkout?error=${map[result.reason] || 'coupon_code_error'}&` + qs);
        }
        return res.redirect('/checkout?success=coupon_applied&' + qs);
    } catch (err) {
        console.error('[Checkout] apply coupon code error:', err);
        return res.redirect('/checkout?error=coupon_code_error&' + qs);
    }
};

/**
 * 주문 생성 (POST) → PENDING, redirect /checkout/pay/:orderId
 */
exports.postForm = async (req, res) => {
    const {
        product_id, quantity, cart, group_buy_id, live_show_id,
        buyer_name, buyer_email, buyer_phone,
        receiver_name, receiver_phone, receiver_zipcode, receiver_address, receiver_detailed_address,
        shipping_message,
        user_coupon_id, shipping_coupon_id, point_use_amount
    } = req.body;
    const isGuest = req.body.guest === '1';

    if (!req.user && !isGuest) {
        return res.redirect('/checkout/choose');
    }

    let items = [];
    if (cart === '1' && req.user) {
        const [rows] = await pool.query(
            `SELECT c.quantity, c.sku_id, ${PRODUCT_SCOPE_COLS}, p.stock
             FROM carts c JOIN products p ON c.product_id = p.id
             WHERE c.user_id = ? AND p.status = 'ON'`,
            [req.user.id]
        );
        for (const r of rows) {
            const qty = r.quantity || 1;
            const stock = (r.stock != null && r.stock >= 0) ? r.stock : 0;
            if (qty > stock) {
                return res.redirect(`/cart?error=stock&product=${r.product_id}&max=${stock}`);
            }
            items.push({ ...toScopeItem(r), quantity: qty, sku_id: r.sku_id || null });
        }
    } else if (group_buy_id && product_id && quantity) {
        // 주문서를 거치지 않고 이 POST 를 직접 두드릴 수 있으므로 여기서도 다시 검증한다.
        const line = await groupBuySvc.resolveLine(req.mallId || 1, group_buy_id, product_id, quantity);
        if (!line.ok) return res.redirect(groupBuyErrorRedirect(line));

        const [[p]] = await pool.query(`SELECT ${PRODUCT_SCOPE_COLS} FROM products p WHERE p.id = ?`, [line.product.product_id]);
        items = [{
            ...(p ? toScopeItem(p) : { product_id: line.product.product_id, name: line.product.name }),
            price: line.unitPrice,
            quantity: line.quantity,
            source_type: 'GROUP_BUY',
            source_id: line.groupBuy.id,
        }];
    } else if (live_show_id && product_id && quantity) {
        // 주문서를 거치지 않고 이 POST 를 직접 두드릴 수 있으므로 여기서도 다시 검증한다.
        const line = await liveSvc.resolveLine(req.mallId || 1, live_show_id, product_id, quantity);
        if (!line.ok) return res.redirect(liveErrorRedirect(line));

        const [[p]] = await pool.query(`SELECT ${PRODUCT_SCOPE_COLS} FROM products p WHERE p.id = ?`, [line.product.product_id]);
        items = [{
            ...(p ? toScopeItem(p) : { product_id: line.product.product_id, name: line.product.name }),
            price: line.unitPrice,
            quantity: line.quantity,
            source_type: 'LIVE_SHOW',
            source_id: line.liveShow.id,
        }];
    } else if (product_id && quantity) {
        const pid = parseInt(product_id, 10);
        const qty = Math.max(1, parseInt(quantity, 10) || 1);
        const selectedSkuId = parseInt(req.body.sku_id, 10) || null;
        const [rows] = await pool.query(
            `SELECT ${PRODUCT_SCOPE_COLS}, p.stock, p.slug FROM products p WHERE p.id = ? AND p.status = 'ON'`, [pid]
        );
        if (rows.length === 0) return res.redirect('/products');
        const p = rows[0];
        // 옵션상품이면 선택 SKU 재고로, 아니면 대표 SKU(=products.stock) 로 조기 검증.
        const preSku = await skuService.resolveSkuForLine(pid, selectedSkuId);
        const stock = preSku ? Math.max(0, preSku.stock || 0) : ((p.stock != null && p.stock >= 0) ? p.stock : 0);
        if (qty > stock) {
            const path = p.slug ? `/products/${encodeURIComponent(p.slug)}` : `/products/view/${pid}`;
            return res.redirect(`${path}?error=stock&max=${stock}`);
        }
        items = [{ ...toScopeItem(p), quantity: qty, sku_id: selectedSkuId }];
    }

    if (items.length === 0) return res.redirect('/products');

    /*
     * 각 라인의 판매 SKU 를 확정한다(설계 §26.2). base 가격을 SKU 기준으로 맞춰,
     * 옵션상품(SKU별 가격 상이)에서도 표시가=청구가가 유지된다.
     * deal/group_buy/live 오버라이드(source_type)는 그대로 얹힌다.
     */
    for (const it of items) {
        const sku = await skuService.resolveSkuForLine(it.product_id, it.sku_id || null);
        if (!sku) return res.redirect('/products');
        it.sku_id = sku.id;
        if (!it.source_type) it.price = sku.price;
        // 옵션 SKU 면 조합 라벨을 주문 스냅샷에 남긴다(단일상품 대표 SKU 는 null).
        if (!sku.is_default) it.option_snapshot = await optionService.getSkuOptionLabel(sku.id);
    }

    /*
     * 특가 적용 — 결제 금액이 확정되는 지점이다(설계 §5.1).
     *
     * 여기서 덮은 price 가 subtotalAmount → couponableAmount → totalAmount →
     * order_items.product_price → orders.total_amount → Toss 결제 amount 로 그대로 흘러간다.
     * 폼이 보낸 금액은 어디서도 쓰지 않는다.
     *
     * 부착한 source_id(deal_item.id) 가 order_items 에 저장되고, 결제 확정 트랜잭션은
     * 특가를 **재조회하지 않고** 그 id 로만 수량을 소진한다(§5.2).
     */
    // 주문서와 같은 순서로 적용한다 — 표시가와 청구가가 어긋나면 안 된다.
    const isB2bOrder = !!(req.b2b && req.b2b.active);
    items = await b2bPricingService.applyToScopeItems(req.b2b, items);
    items = await dealSvc.applyToScopeItems(items);

    /*
     * B2B 수량 규칙 재검증 (설계 §7.6). 주문서를 거치지 않고 이 POST 를 직접 두드릴 수 있다.
     * MOQ·주문단위 위반, 견적 필수 수량은 여기서 막는다.
     */
    if (isB2bOrder) {
        const violations = await b2bPricingService.validateOrderItems(req.b2b, items);
        if (violations.length > 0) {
            return res.redirect('/cart?error=b2b_qty&reason=' + encodeURIComponent(violations[0].reason));
        }
    }

    const subtotalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    /*
     * 멤버십 등급 혜택 (회원만). 정률 할인·무료배송 override 를 여기서 확정한다(설계 §7, §10.4).
     * 비회원은 무혜택(ZERO). 할인은 상품금액(subtotal) 기준이며 최소주문·최대할인 상한은 서비스가 건다.
     */
    /*
     * B2B 는 전용가가 이미 계약가다. 쿠폰·포인트·등급할인을 얹으면 마진 관리가 불가능해진다
     * (설계 §4.5). 기본은 미적용이며 system_settings.b2b_allow_coupon_stacking 으로만 연다.
     */
    const b2bStacking = isB2bOrder && b2bContextMw.getSettings().allowCouponStacking;
    const skipBenefits = isB2bOrder && !b2bStacking;

    const gradeBenefits = (req.user && !skipBenefits)
        ? await membershipBenefitService.getOrderBenefits({ userId: req.user.id, mallId: req.mallId || 1, subtotalAmount })
        : { ...membershipBenefitService.ZERO };
    let gradeDiscount = Number(gradeBenefits.discountAmount) || 0;

    /*
     * 배송비는 서버가 계산한다 (배송비 문서 §1-1).
     * 폼에 shipping_fee 필드를 두지 않는다 — 화면 표시값은 참고일 뿐 총액의 근거가 아니다.
     * 무료배송 판정은 쿠폰·적립금 차감 전 `subtotalAmount` 로 한다 (§1-2).
     * 등급 무료배송(상시/문턱 override)도 여기서 반영한다.
     * 배송비 쿠폰보다 **먼저** 구해야 한다 — 배송비 할인이 배송비를 넘을 수 없기 때문이다.
     */
    const shipping = await calcShippingFee({
        mallId: req.mallId || 1,
        subtotalAmount,
        receiverZipcode: receiver_zipcode,
        grade: { freeShipping: gradeBenefits.freeShipping, freeShipThreshold: gradeBenefits.freeShipThreshold },
    });
    const shippingFee = shipping.fee;

    let couponDiscount = 0;
    let shippingDiscount = 0;
    let pointUsed = 0;
    let userCouponId = null;
    let shippingCouponId = null;

    /**
     * 선택된 쿠폰을 검증하고 할인액을 돌려준다. 쿼리스트링·폼의 금액은 절대 믿지 않는다.
     * @returns {{error:string}|{coupon:object, discount:number}}
     */
    const validateCoupon = async (userCouponId_, expectedGroup) => {
        const usable = await loadUsableCoupons(req.user.id, req.mallId || 1);
        const coupon = usable.find((c) => Number(c.user_coupon_id) === Number(userCouponId_));
        if (!coupon) return { error: 'coupon' };
        if (combinationGroup(coupon) !== expectedGroup) return { error: 'coupon' };
        if (await usageLimitReached(coupon)) return { error: 'coupon_limit' };

        const couponable = couponableAmount(items, coupon);
        if (!meetsMinOrder(coupon, couponable)) return { error: 'coupon_min' };

        const discount = expectedGroup === 'SHIPPING'
            ? calcShippingDiscount(coupon, shippingFee)   // ≤ shippingFee 를 계산기가 보장한다 (P9)
            : calcOrderDiscount(coupon, couponable);      // ≤ couponable 을 계산기가 보장한다
        return { coupon, discount };
    };

    // B2B(비중첩 모드)는 쿠폰·포인트를 아예 태우지 않는다. 폼이 값을 보내도 무시한다.
    if (req.user && !skipBenefits) {
        // 1. 주문 쿠폰 (ORDER 그룹) — 1장
        if (user_coupon_id) {
            const r = await validateCoupon(user_coupon_id, 'ORDER');
            if (r.error) return res.redirect(`/checkout?error=${r.error}&` + new URLSearchParams(req.query).toString());
            // 적용범위(scope_json)에 걸려 할인 대상 상품이 하나도 없으면 쿠폰을 태우지 않는다.
            if (r.discount === 0) {
                return res.redirect('/checkout?error=coupon_scope&' + new URLSearchParams(req.query).toString());
            }
            couponDiscount = r.discount;
            userCouponId = Number(user_coupon_id);
        }

        /*
         * 2. 배송비 쿠폰 (SHIPPING 그룹) — 1장. 주문 쿠폰과 동시 적용된다 (§6-1)
         *
         * 배송비가 0원이면(무료배송 기준 초과) 할인액도 0이다. 이때 쿠폰을 붙이면 **소모만 되고
         * 혜택은 없다.** 조용히 떼어 낸다 — 주문을 막을 이유는 없다.
         */
        if (shipping_coupon_id) {
            const r = await validateCoupon(shipping_coupon_id, 'SHIPPING');
            if (r.error) return res.redirect(`/checkout?error=${r.error}&` + new URLSearchParams(req.query).toString());
            if (r.discount > 0) {
                shippingDiscount = r.discount;
                shippingCouponId = Number(shipping_coupon_id);
            }
        }

        // 설정형 할인 우선순위(§7.3): 쿠폰 우선 모드면 주문 쿠폰 사용 시 등급 할인을 적용하지 않는다.
        const stackingMode = await membershipConfigService.getStackingMode(req.mallId || 1);
        if (stackingMode === 'COUPON_PRIORITY' && userCouponId && gradeDiscount > 0) {
            gradeDiscount = 0;
        }

        // 3. 포인트 (상품 할인 후 남은 상품금액 기준 — 배송비는 포인트로 결제하지 않는다)
        const pointMinUse = Number(global.systemSettings?.point_min_use || 1000) || 1000;
        const reqPoint = Math.abs(Number(point_use_amount) || 0);
        if (reqPoint > 0) {
            const [[uRow]] = await pool.query('SELECT points_balance FROM users WHERE id = ?', [req.user.id]);
            const balance = (uRow && uRow.points_balance) || 0;
            if (reqPoint > balance) {
                return res.redirect('/checkout?error=point&' + new URLSearchParams(req.query).toString());
            }
            if (reqPoint % pointMinUse !== 0) {
                return res.redirect('/checkout?error=point_min&' + new URLSearchParams(req.query).toString());
            }
            if (reqPoint > subtotalAmount - couponDiscount - gradeDiscount) {
                return res.redirect('/checkout?error=point_max&' + new URLSearchParams(req.query).toString());
            }
            pointUsed = reqPoint;
        }
    }

    // 계산 순서는 배송비 문서 §4 와 쿠폰 문서 §9 가 같아야 한다. 등급 할인은 쿠폰과 같은 층(주문 할인)이다.
    //   subtotal − coupon − grade − point + shipping_fee − shipping_discount = total
    const totalAmount = Math.max(0, subtotalAmount - couponDiscount - gradeDiscount - pointUsed + shippingFee - shippingDiscount);
    const orderNumber = generateOrderNumber(isB2bOrder ? 'B2B' : 'ORD');

    /*
     * 공급가액·부가세 (설계 §4.6). 라인 합과 주문 총액이 반드시 일치하도록 서비스가 잔차를 흡수한다.
     * B2C 주문에도 계산해 두면 좋지만, 이번 범위에서는 B2B 주문에만 채운다(기존 흐름 불변).
     */
    const taxTotals = isB2bOrder ? b2bTaxService.calcOrderTax(items) : null;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const userId = req.user ? req.user.id : null;
        const shippingAddr = [receiver_zipcode, receiver_address, receiver_detailed_address].filter(Boolean).join(' ');

        await connection.query(
            `INSERT INTO orders (
                user_id, mall_id, order_number, status, subtotal_amount, shipping_fee, shipping_discount,
                total_amount, coupon_discount, grade_discount, point_used, user_coupon_id, shipping_coupon_id,
                receiver_name, receiver_phone, receiver_zipcode, receiver_address, receiver_detailed_address,
                shipping_address, shipping_message,
                buyer_name, buyer_email, buyer_phone,
                order_type, supply_amount, vat_amount, tax_free_amount
            ) VALUES (?, ?, ?, 'PENDING', ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?,
                ?, ?, ?,
                ?, ?, ?, ?)`,
            [
                userId, req.mallId || 1, orderNumber, subtotalAmount, shippingFee, shippingDiscount,
                totalAmount, couponDiscount, gradeDiscount, pointUsed, userCouponId, shippingCouponId,
                receiver_name, receiver_phone, receiver_zipcode || null, receiver_address || null, receiver_detailed_address || null,
                shippingAddr || null, shipping_message || null,
                isGuest ? buyer_name : null, isGuest ? buyer_email : null, isGuest ? buyer_phone : null,
                isB2bOrder ? 'B2B' : 'B2C',
                taxTotals ? taxTotals.supplyAmount : null,
                taxTotals ? taxTotals.vatAmount : null,
                taxTotals ? taxTotals.taxFreeAmount : null
            ]
        );
        const orderId = (await connection.query('SELECT LAST_INSERT_ID() as id'))[0][0].id;

        /*
         * 주문 등급혜택 스냅샷 (설계 §2.2). 회원·등급이 있을 때만. 주문 시점의 등급·유효 적립률을
         * 박아 둔다 — 이후 등급이 바뀌어도 이 주문의 적립·할인 근거는 변하지 않는다.
         * grade_point_rate 에는 결제 확정 시 그대로 쓸 **유효 적립률**(기본률+등급)을 저장한다.
         */
        if (req.user && gradeBenefits.gradeId) {
            const baseRate = getNumberSetting('point_accumulate_rate', DEFAULT_POINT_RATE);
            const effectiveRate = membershipBenefitService.effectivePointRate(baseRate, gradeBenefits);
            const freeShipApplied = (gradeBenefits.freeShipping || gradeBenefits.freeShipThreshold != null) && shipping.isFree ? 1 : 0;
            await connection.query(
                `INSERT INTO order_membership_benefit_snapshot
                    (order_id, user_id, mall_id, grade_id, grade_code_snapshot, grade_name_snapshot,
                     grade_discount_amount, grade_point_rate, free_shipping_applied, benefit_details_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    orderId, req.user.id, req.mallId || 1, gradeBenefits.gradeId,
                    gradeBenefits.gradeCode, gradeBenefits.gradeName,
                    gradeDiscount, effectiveRate, freeShipApplied,
                    JSON.stringify({
                        discountRate: gradeBenefits.discountRate,
                        pointRate: gradeBenefits.pointRate,
                        pointRateMode: gradeBenefits.pointRateMode,
                        baseRate,
                    }),
                ]
            );
        }

        /*
         * 쿠폰 점유 (C2). 같은 쿠폰을 두 개의 PENDING 주문이 물면, 먼저 결제되는 쪽만 살고
         * 나머지는 "할인은 받았는데 쿠폰은 안 쓰인" 상태가 된다. 조건부 UPDATE 로 잡는다.
         * 주문 쿠폰과 배송비 쿠폰을 둘 다 잡는다 — 어느 하나라도 실패하면 주문을 만들지 않는다.
         */
        for (const ucId of [userCouponId, shippingCouponId].filter(Boolean)) {
            const reserved = await reserveCouponForOrder(connection, {
                userCouponId: ucId, userId: req.user.id, orderId,
            });
            if (!reserved) {
                await connection.rollback();
                connection.release();
                return res.redirect('/checkout?error=coupon_reserved&' + new URLSearchParams(req.query).toString());
            }
        }

        for (let i = 0; i < items.length; i += 1) {
            const item = items[i];
            const lineTotal = item.price * item.quantity;
            // source_type/source_id 는 nullable — 일반 주문에는 NULL 이 들어간다(§9-1).
            // sku_id: 유효 판매 SKU. option_snapshot: 옵션 조합 텍스트(단일상품은 NULL).
            // supply/vat: B2B 주문의 세금계산서 근거. B2C 는 NULL 이라 기존과 같다.
            const taxLine = taxTotals ? taxTotals.lines[i] : null;
            await connection.query(
                `INSERT INTO order_items (order_id, product_id, sku_id, product_name, option_snapshot, product_price, quantity, total_price, source_type, source_id,
                                          supply_price, vat_price, price_source, list_price)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [orderId, item.product_id, item.sku_id || null, item.name, item.option_snapshot || null,
                    item.price, item.quantity, lineTotal,
                    item.source_type || null, item.source_id || null,
                    taxLine ? taxLine.supplyPrice : null,
                    taxLine ? taxLine.vatPrice : null,
                    item.price_source || null,
                    item.list_price || null]
            );
        }

        /*
         * B2B 확장정보 + 접수 처리 (설계 §7.2).
         * 여기서는 재고를 깎지 않는다 — 판매자 승인 시점에 차감한다(§7.3).
         */
        if (isB2bOrder) {
            await connection.query(
                `INSERT INTO b2b_order_detail
                    (order_id, business_profile_id, purchase_order_number, requested_delivery_date,
                     tax_invoice_required, buyer_note, approval_status, payment_terms)
                 VALUES (?, ?, ?, ?, ?, ?, 'REQUESTED', 'PREPAY')`,
                [orderId, req.b2b.businessProfileId,
                    (req.body.purchase_order_number || '').trim() || null,
                    req.body.requested_delivery_date || null,
                    req.body.tax_invoice_required ? 1 : 0,
                    (req.body.buyer_note || '').trim() || null]
            );
        }

        if (cart === '1' && req.user) {
            await connection.query('DELETE FROM carts WHERE user_id = ?', [req.user.id]);
        }

        await connection.commit();
        connection.release();

        // 비회원 주문에는 소유자를 판정할 user_id 가 없다. 주문 완료 화면이 남의 주문번호로
        // 배송지를 노출하지 않도록, 이 세션이 만든 주문번호만 기억해 둔다(getComplete 참고).
        if (!userId && req.session) {
            req.session.guestOrders = [...((req.session.guestOrders || []).slice(-9)), orderNumber];
        }

        // B2B 는 즉시 결제가 아니다 — 결제창으로 보내지 않고 접수 완료로 간다(설계 §7.1).
        if (isB2bOrder) {
            b2bOrderService.notify(orderId, 'REQUESTED').catch((e) => console.warn('[b2b] 접수 안내 실패:', e.message));
            return res.redirect(`/checkout/b2b-received?order=${orderNumber}`);
        }
        return res.redirect(`/checkout/pay/${orderNumber}`);
    } catch (err) {
        await connection.rollback();
        connection.release();
        console.error('[Checkout] postForm error:', err);
        return res.status(500).send('주문 생성 중 오류가 발생했습니다.');
    }
};

/**
 * 결제창 페이지
 */
exports.getPay = async (req, res) => {
    const { orderId } = req.params;
    const [rows] = await pool.query(
        'SELECT id, order_number, total_amount, status, coupon_discount, point_used, user_coupon_id, subtotal_amount FROM orders WHERE order_number = ?',
        [orderId]
    );
    if (rows.length === 0 || rows[0].status !== 'PENDING') {
        return res.redirect('/checkout/fail?reason=invalid');
    }
    const order = rows[0];
    const clientKey = (global.systemSettings && global.systemSettings.tosspayments_client_key) || process.env.TOSSPAYMENTS_CLIENT_KEY;
    const domain = (global.systemSettings && global.systemSettings.domain) || process.env.DOMAIN || 'http://localhost:3000';
    const baseUrl = domain.replace(/\/$/, '');

    res.render('user/checkout/pay', {
        title: '결제하기',
        order,
        clientKey,
        successUrl: `${baseUrl}/checkout/success`,
        failUrl: `${baseUrl}/checkout/fail`
    });
};

/**
 * 결제 성공 콜백 → 승인 API 호출 → complete 리다이렉트
 */
exports.getSuccess = async (req, res) => {
    const { paymentKey, orderId, amount } = req.query;
    if (!paymentKey || !orderId || !amount) {
        return res.redirect('/checkout/fail?reason=missing');
    }

    const [rows] = await pool.query('SELECT id, total_amount, status FROM orders WHERE order_number = ?', [orderId]);
    if (rows.length === 0 || rows[0].status !== 'PENDING') {
        return res.redirect('/checkout/fail?reason=invalid');
    }
    const order = rows[0];
    const expectedAmount = parseInt(amount, 10);
    if (order.total_amount !== expectedAmount) {
        return res.redirect('/checkout/fail?reason=amount');
    }

    const secretKey = (global.systemSettings && global.systemSettings.tosspayments_secret_key) || process.env.TOSSPAYMENTS_SECRET_KEY;
    if (!secretKey) {
        console.error('[Checkout] TOSSPAYMENTS_SECRET_KEY not configured');
        return res.redirect('/checkout/fail?reason=config');
    }

    try {
        const stockCheck = await validateStockForOrder(order.id);
        if (!stockCheck.ok) {
            return res.redirect('/checkout/fail?reason=stock');
        }

        const auth = Buffer.from(secretKey + ':').toString('base64');
        const resp = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ paymentKey, orderId, amount: expectedAmount })
        });

        if (!resp.ok) {
            const errBody = await resp.text();
            console.error('[Checkout] Toss confirm fail:', resp.status, errBody);
            return res.redirect('/checkout/fail?reason=approve');
        }

        const completeResult = await completeOrderWithStockAndPaid(order.id, {
            paymentKey,
            paymentMethod: 'CARD'
        });
        if (!completeResult.ok) {
            await cancelTossPayment(paymentKey, secretKey, '재고 부족으로 인한 결제 취소');
            return res.redirect('/checkout/fail?reason=stock');
        }

        return res.redirect(`/checkout/complete?orderId=${encodeURIComponent(orderId)}`);
    } catch (err) {
        console.error('[Checkout] getSuccess error:', err);
        return res.redirect('/checkout/fail?reason=error');
    }
};

/**
 * 결제 실패
 */
exports.getFail = (req, res) => {
    const reason = req.query.reason || 'unknown';
    res.render('user/checkout/fail', {
        title: '결제 실패',
        reason
    });
};

/**
 * 주문 완료
 *
 * ⚠️ 이 함수는 과거 `?test=1&coupon_discount=...&user_coupon_id=...` 쿼리스트링을 그대로 믿고
 *    주문을 PAID 로 확정했다. 결제 없이 주문 완료가 가능했고, 남의 user_coupon_id 를 주입해
 *    타인의 쿠폰을 소모시킬 수 있었다(쿠폰 문서 C3).
 *
 *    지금은 세 가지를 지킨다.
 *      1) 쿠폰·포인트·배송비는 요청에서 읽지 않는다. 주문 행이 유일한 근거다.
 *      2) 테스트 확정 경로는 NODE_ENV 로 잠근다. 클라이언트가 켤 수 없다.
 *      3) 주문 소유자만 조회할 수 있다(비회원은 주문 생성 시 세션에 남긴 주문번호로 판정).
 */
function isTestCheckoutAllowed(req) {
    return process.env.NODE_ENV !== 'production' && req.query.test === '1';
}

function isOrderOwner(req, order) {
    if (order.user_id) {
        return !!(req.user && Number(req.user.id) === Number(order.user_id));
    }
    const guestOrders = (req.session && req.session.guestOrders) || [];
    return guestOrders.includes(order.order_number);
}

exports.getComplete = async (req, res) => {
    const orderNumber = req.query.orderId;
    let order = null;

    if (orderNumber) {
        const [rows] = await pool.query(
            'SELECT id, user_id, order_number, status FROM orders WHERE order_number = ?',
            [orderNumber]
        );
        const found = rows[0];

        if (found && isOrderOwner(req, found)) {
            if (found.status === 'PENDING' && isTestCheckoutAllowed(req)) {
                const completeResult = await completeOrderWithStockAndPaid(found.id, { paymentMethod: 'TEST' });
                if (!completeResult.ok) {
                    return res.redirect('/checkout/fail?reason=stock');
                }
            }

            const [paidRows] = await pool.query(
                `SELECT o.id, o.order_number, o.subtotal_amount, o.coupon_discount, o.point_used,
                        o.shipping_fee, o.shipping_discount, o.total_amount,
                        o.receiver_name, o.receiver_phone, o.shipping_address, o.created_at
                 FROM orders o WHERE o.id = ? AND o.status = 'PAID'`,
                [found.id]
            );
            if (paidRows.length > 0) order = paidRows[0];
        }
    }
    res.render('user/checkout/complete', {
        title: '주문 완료',
        order
    });
};

/*
 * B2B 주문 접수 완료 화면 (설계 §7.1).
 *
 * ⚠️ getComplete 를 재사용하면 안 된다. 그 핸들러는 테스트 모드에서 PENDING 주문을
 *    completeOrderWithStockAndPaid 로 **자동 결제 처리**한다 — B2B 주문이 그리로 가면
 *    판매자 승인 없이 재고가 깎이고 결제 완료가 된다.
 */
exports.getB2bReceived = async (req, res) => {
    const orderNumber = req.query.order;
    let order = null;

    if (orderNumber) {
        const [[found]] = await pool.query(
            `SELECT o.id, o.user_id, o.order_number, o.status, o.total_amount,
                    o.supply_amount, o.vat_amount, o.tax_free_amount, o.shipping_fee, o.subtotal_amount,
                    o.receiver_name, o.receiver_phone, o.shipping_address, o.created_at,
                    d.purchase_order_number, d.requested_delivery_date, d.tax_invoice_required,
                    d.approval_status, d.payment_due_at
               FROM orders o JOIN b2b_order_detail d ON d.order_id = o.id
              WHERE o.order_number = ?`,
            [orderNumber]
        );
        // 남의 주문번호로 배송지가 노출되지 않도록 소유자만 본다.
        if (found && req.user && found.user_id === req.user.id) order = found;
    }

    res.render('user/checkout/b2b_received', {
        title: '주문 접수 완료',
        order,
        settings: b2bContextMw.getSettings(),
    });
};
