/*
 * 거래처 견적 화면 (설계 §8).
 *
 * 견적 요청은 장바구니 또는 상품 상세에서 진입한다. 이후 협상은 같은 상세 화면에서
 * "재제안 / 수락 / 취소" 로 이어진다 — 상태에 따라 가능한 버튼만 서버가 골라 준다.
 */

const pool = require('../config/db');
const quoteService = require('../services/quote/quoteService');
const statusService = require('../services/quote/quoteStatusService');
const convertService = require('../services/quote/quoteConvertService');
const pdfService = require('../services/quote/quotePdfService');
const pricingService = require('../services/b2b/b2bPricingService');
const skuService = require('../services/catalog/skuService');

const LAYOUT = 'layouts/main_layout';

/** 승인 사업자만. 아니면 안내 화면으로 보낸다. */
function requireB2b(req, res) {
    if (!req.user) { res.redirect('/auth/login?redirect=/quotes'); return false; }
    if (!req.b2b || !req.b2b.active) { res.redirect('/b2b/status'); return false; }
    return true;
}

/** 내 견적인지 — 남의 견적번호로 단가가 새면 안 된다. */
function isOwner(req, quote) {
    return req.b2b && quote.business_profile_id === req.b2b.businessProfileId;
}

exports.getList = async (req, res, next) => {
    if (!requireB2b(req, res)) return;
    try {
        await statusService.expireOverdue();
        const { rows } = await quoteService.list({
            businessProfileId: req.b2b.businessProfileId,
            status: req.query.status || null,
            limit: 50,
        });
        res.render('user/quote/list', {
            layout: LAYOUT,
            title: '견적함',
            rows,
            STATUS: statusService.STATUS,
            status: req.query.status || '',
        });
    } catch (err) { next(err); }
};

/** 장바구니에서 견적 요청 폼으로. */
exports.getRequest = async (req, res, next) => {
    if (!requireB2b(req, res)) return;
    try {
        const [rows] = await pool.query(
            `SELECT c.quantity, c.sku_id, p.id AS product_id, p.name, p.price, p.tax_type, p.main_image, p.thumbnail_image
               FROM carts c JOIN products p ON c.product_id = p.id
              WHERE c.user_id = ? AND c.cart_type = 'B2B' AND p.status = 'ON'`,
            [req.user.id]
        );
        if (rows.length === 0) return res.redirect('/cart?error=empty');

        // 현재 전용가를 희망단가 기본값으로 채워 준다 — 처음부터 숫자를 만들어 내게 하지 않는다.
        const priced = await pricingService.resolveForProducts(req.b2b, rows.map(r => r.product_id));
        for (const r of rows) {
            const info = priced.get(Number(r.product_id));
            r.b2b_price = info ? info.unitPrice : r.price;
        }

        res.render('user/quote/request', {
            layout: LAYOUT,
            title: '견적 요청',
            items: rows,
            validDays: require('../middleware/b2bContext').getSettings().quoteValidDays,
        });
    } catch (err) { next(err); }
};

exports.postRequest = async (req, res, next) => {
    if (!requireB2b(req, res)) return;
    try {
        const productIds = [].concat(req.body.product_id || []);
        const quantities = [].concat(req.body.quantity || []);
        const wishes = [].concat(req.body.wish_price || []);
        const skuIds = [].concat(req.body.sku_id || []);
        if (productIds.length === 0) return res.redirect('/cart');

        const [products] = await pool.query(
            'SELECT id, name, price, tax_type FROM products WHERE id IN (?)', [productIds.map(Number)]
        );
        const pmap = new Map(products.map(p => [Number(p.id), p]));

        const lines = [];
        for (let i = 0; i < productIds.length; i += 1) {
            const p = pmap.get(Number(productIds[i]));
            if (!p) continue;
            const skuId = skuIds[i] ? Number(skuIds[i]) : null;
            const sku = await skuService.resolveSkuForLine(p.id, skuId);
            lines.push({
                productId: p.id,
                skuId: sku ? sku.id : skuId,
                productName: p.name,
                skuLabel: sku && !sku.is_default ? await require('../services/catalog/optionService').getSkuOptionLabel(sku.id) : null,
                taxType: p.tax_type,
                quantity: Math.max(1, parseInt(quantities[i], 10) || 1),
                catalogUnitPrice: Number(p.price),
                requestedUnitPrice: wishes[i] ? Math.max(0, parseInt(wishes[i], 10)) : null,
            });
        }

        const r = await quoteService.createRequest({
            b2b: req.b2b,
            mallId: req.mallId || 1,
            lines,
            note: (req.body.note || '').trim() || null,
            requestedDeliveryDate: req.body.requested_delivery_date || null,
        });
        if (!r.ok) return res.redirect('/cart?error=' + encodeURIComponent(r.error));

        // 견적으로 넘어갔으면 장바구니를 비운다 — 같은 상품이 두 경로로 남지 않게.
        await pool.query("DELETE FROM carts WHERE user_id = ? AND cart_type = 'B2B'", [req.user.id]);
        return res.redirect(`/quotes/${r.quoteId}`);
    } catch (err) { next(err); }
};

exports.getDetail = async (req, res, next) => {
    if (!requireB2b(req, res)) return;
    try {
        await statusService.expireOverdue();
        const data = await quoteService.findFull(req.params.id);
        if (!data) return res.status(404).send('견적을 찾을 수 없습니다.');
        if (!isOwner(req, data.quote)) return res.status(403).send('접근 권한이 없습니다.');

        const convertible = await convertService.checkConvertible(data.quote.id);
        res.render('user/quote/detail', {
            layout: LAYOUT,
            title: `견적 ${data.quote.quote_number}`,
            ...data,
            // 고객에게 관리자 내부 메모는 보이지 않는다.
            messages: data.messages.filter(m => m.visibility === 'ALL'),
            STATUS: statusService.STATUS,
            actions: statusService.allowedFor(data.quote.status, 'BUYER'),
            effectiveUnitPrice: quoteService.effectiveUnitPrice,
            convertible,
            prefill: {
                receiver_name: req.user.name || '',
                receiver_phone: req.user.phone || '',
                receiver_zipcode: req.user.zipcode || '',
                receiver_address: req.user.address || '',
                receiver_detailed_address: req.user.detailed_address || '',
            },
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (err) { next(err); }
};

/** 재제안·수락·취소·메시지를 한 엔드포인트로. 판정은 서비스가 한다. */
exports.postAction = async (req, res, next) => {
    if (!requireB2b(req, res)) return;
    const quoteId = req.params.id;
    try {
        const [[q]] = await pool.query('SELECT business_profile_id FROM quote WHERE id = ?', [quoteId]);
        if (!q || q.business_profile_id !== req.b2b.businessProfileId) return res.status(403).send('접근 권한이 없습니다.');

        const back = (qs) => res.redirect(`/quotes/${quoteId}${qs}`);
        let r;
        switch (req.body.action) {
            case 'counter': {
                const ids = [].concat(req.body.item_id || []);
                const qtys = [].concat(req.body.quantity || []);
                const wishes = [].concat(req.body.wish_price || []);
                const items = ids.map((id, i) => ({
                    id: Number(id),
                    quantity: Math.max(1, parseInt(qtys[i], 10) || 1),
                    requestedUnitPrice: wishes[i] ? Math.max(0, parseInt(wishes[i], 10)) : null,
                }));
                r = await quoteService.buyerCounter(quoteId, {
                    userId: req.user.id, items, message: (req.body.message || '').trim() || null,
                });
                break;
            }
            case 'accept':
                r = await quoteService.accept(quoteId, { actor: 'BUYER', actorId: req.user.id });
                break;
            case 'cancel':
                r = await quoteService.close(quoteId, {
                    to: 'CANCELLED', actor: 'BUYER', actorId: req.user.id,
                    reason: (req.body.message || '').trim() || null,
                });
                break;
            case 'message':
                r = await quoteService.addMessage(quoteId, {
                    senderType: 'BUYER', senderId: req.user.id, message: req.body.message,
                });
                break;
            default:
                r = { ok: false, error: '알 수 없는 작업입니다.' };
        }
        if (!r.ok) return back('?error=' + encodeURIComponent(r.error));
        return back('?message=' + encodeURIComponent('처리했습니다.'));
    } catch (err) { next(err); }
};

/** 수락된 견적을 주문으로 전환한다(거래처가 직접). */
exports.postConvert = async (req, res, next) => {
    if (!requireB2b(req, res)) return;
    const quoteId = req.params.id;
    try {
        const [[q]] = await pool.query('SELECT business_profile_id FROM quote WHERE id = ?', [quoteId]);
        if (!q || q.business_profile_id !== req.b2b.businessProfileId) return res.status(403).send('접근 권한이 없습니다.');

        const r = await convertService.convert(quoteId, {
            actor: 'BUYER', actorId: req.user.id,
            receiver: {
                receiver_name: req.body.receiver_name,
                receiver_phone: req.body.receiver_phone,
                receiver_zipcode: req.body.receiver_zipcode,
                receiver_address: req.body.receiver_address,
                receiver_detailed_address: req.body.receiver_detailed_address,
                shipping_message: req.body.shipping_message,
            },
        });
        if (!r.ok) return res.redirect(`/quotes/${quoteId}?error=` + encodeURIComponent(r.error));
        return res.redirect(`/checkout/b2b-received?order=${r.orderNumber}`);
    } catch (err) { next(err); }
};

/** 견적서 PDF 다운로드. 소유자만. */
exports.getPdf = async (req, res, next) => {
    if (!requireB2b(req, res)) return;
    try {
        const data = await quoteService.findFull(req.params.id);
        if (!data) return res.status(404).send('견적을 찾을 수 없습니다.');
        if (!isOwner(req, data.quote)) return res.status(403).send('접근 권한이 없습니다.');

        const buf = await pdfService.renderBuffer(data, res.locals.siteSettings || {});
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition',
            `inline; filename*=UTF-8''${encodeURIComponent(data.quote.quote_number + '.pdf')}`);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.end(buf);
    } catch (err) { next(err); }
};
