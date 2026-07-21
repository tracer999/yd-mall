/*
 * 관리자 견적 관리 · 협상 (설계 §11.4).
 *
 * 관리자가 할 수 있는 것: 품목 단가·수량 변경, 배송비·전체 할인 제안, 납기·결제조건·유효기간 설정,
 * 메시지(내부 메모 포함), 반려, 수락, 주문 전환, 견적서 PDF 발행.
 */

const pool = require('../../config/db');
const quoteService = require('../../services/quote/quoteService');
const statusService = require('../../services/quote/quoteStatusService');
const convertService = require('../../services/quote/quoteConvertService');
const pdfService = require('../../services/quote/quotePdfService');

const LAYOUT = 'layouts/admin_layout';
const PAGE_SIZE = 20;

exports.getList = async (req, res, next) => {
    try {
        const expired = await statusService.expireOverdue();
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const { rows, total } = await quoteService.list({
            status: req.query.status || null,
            keyword: (req.query.q || '').trim() || null,
            limit: PAGE_SIZE,
            offset: (page - 1) * PAGE_SIZE,
        });

        const [counts] = await pool.query('SELECT status, COUNT(*) AS cnt FROM quote GROUP BY status');
        const countMap = {};
        for (const c of counts) countMap[c.status] = c.cnt;

        res.render('admin/b2b/quotes', {
            layout: LAYOUT,
            title: '견적 관리',
            subtitle: '거래처 견적 요청을 검토하고 단가를 제안합니다. 수락된 견적은 주문으로 전환됩니다.',
            rows, total, page, pageSize: PAGE_SIZE,
            status: req.query.status || '',
            keyword: (req.query.q || '').trim(),
            countMap,
            STATUS: statusService.STATUS,
            expiredNow: expired,
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (err) { next(err); }
};

exports.getDetail = async (req, res, next) => {
    try {
        await statusService.expireOverdue();
        const data = await quoteService.findFull(req.params.id);
        if (!data) return res.status(404).send('견적을 찾을 수 없습니다.');

        const convertible = await convertService.checkConvertible(data.quote.id);
        res.render('admin/b2b/quote_detail', {
            layout: LAYOUT,
            title: `견적 ${data.quote.quote_number}`,
            subtitle: data.quote.company_name,
            ...data,
            STATUS: statusService.STATUS,
            actions: statusService.allowedFor(data.quote.status, 'SELLER'),
            effectiveUnitPrice: quoteService.effectiveUnitPrice,
            convertible,
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (err) { next(err); }
};

exports.postAction = async (req, res, next) => {
    const quoteId = req.params.id;
    const adminId = req.session.admin ? req.session.admin.id : null;
    const back = (qs) => res.redirect(`/admin/b2b/quotes/${quoteId}${qs}`);

    try {
        let r;
        switch (req.body.action) {
            case 'review':
                r = await statusService.transition(quoteId, 'UNDER_REVIEW', { actor: 'SELLER' });
                break;

            case 'propose': {
                const ids = [].concat(req.body.item_id || []);
                const qtys = [].concat(req.body.quantity || []);
                const prices = [].concat(req.body.proposed_price || []);
                const notes = [].concat(req.body.item_note || []);
                const items = ids.map((id, i) => ({
                    id: Number(id),
                    quantity: Math.max(1, parseInt(qtys[i], 10) || 1),
                    proposedUnitPrice: prices[i] !== '' && prices[i] != null ? Math.max(0, parseInt(prices[i], 10)) : null,
                    note: (notes[i] || '').trim() || null,
                }));
                r = await quoteService.sellerPropose(quoteId, {
                    adminId, items,
                    shipping: req.body.shipping_amount !== '' ? req.body.shipping_amount : null,
                    discount: req.body.discount_amount !== '' ? req.body.discount_amount : null,
                    validUntil: req.body.valid_until || null,
                    paymentTerms: (req.body.payment_terms || '').trim() || null,
                    deliveryTerms: (req.body.delivery_terms || '').trim() || null,
                    message: (req.body.message || '').trim() || null,
                });
                break;
            }

            case 'accept':
                r = await quoteService.accept(quoteId, { actor: 'SELLER', actorId: adminId });
                break;

            case 'reject':
                r = await quoteService.close(quoteId, {
                    to: 'REJECTED', actor: 'SELLER', actorId: adminId,
                    reason: (req.body.message || '').trim() || '판매자 반려',
                });
                break;

            case 'message':
                r = await quoteService.addMessage(quoteId, {
                    senderType: 'SELLER', senderId: adminId,
                    message: req.body.message,
                    visibility: req.body.internal ? 'INTERNAL' : 'ALL',
                });
                break;

            case 'assign':
                await pool.query('UPDATE quote SET assigned_admin_id = ? WHERE id = ?', [adminId, quoteId]);
                r = { ok: true };
                break;

            default:
                r = { ok: false, error: '알 수 없는 작업입니다.' };
        }
        if (!r.ok) return back('?error=' + encodeURIComponent(r.error));
        return back('?message=' + encodeURIComponent('처리했습니다.'));
    } catch (err) { next(err); }
};

/** 관리자가 대신 주문으로 전환한다(배송지는 거래처 기본 정보에서 가져온다). */
exports.postConvert = async (req, res, next) => {
    const quoteId = req.params.id;
    const adminId = req.session.admin ? req.session.admin.id : null;
    try {
        const [[u]] = await pool.query(
            `SELECT u.name, u.phone, u.zipcode, u.address, u.detailed_address
               FROM quote q JOIN users u ON u.id = q.requested_by WHERE q.id = ?`,
            [quoteId]
        );
        const r = await convertService.convert(quoteId, {
            actor: 'SELLER', actorId: adminId,
            receiver: {
                receiver_name: u ? u.name : null,
                receiver_phone: u ? u.phone : null,
                receiver_zipcode: u ? u.zipcode : null,
                receiver_address: u ? u.address : null,
                receiver_detailed_address: u ? u.detailed_address : null,
            },
        });
        if (!r.ok) return res.redirect(`/admin/b2b/quotes/${quoteId}?error=` + encodeURIComponent(r.error));
        return res.redirect(`/admin/b2b/orders/${r.orderId}?message=` + encodeURIComponent(`견적을 주문 ${r.orderNumber} 로 전환했습니다.`));
    } catch (err) { next(err); }
};

/** 견적서 PDF — 다운로드(inline) 또는 발행(파일 저장 + 리비전 기록). */
exports.getPdf = async (req, res, next) => {
    try {
        const data = await quoteService.findFull(req.params.id);
        if (!data) return res.status(404).send('견적을 찾을 수 없습니다.');
        const buf = await pdfService.renderBuffer(data, res.locals.siteSettings || {});
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition',
            `inline; filename*=UTF-8''${encodeURIComponent(data.quote.quote_number + '.pdf')}`);
        return res.end(buf);
    } catch (err) { next(err); }
};

exports.postIssuePdf = async (req, res, next) => {
    try {
        const r = await pdfService.issue(req.params.id, res.locals.siteSettings || {});
        if (!r.ok) return res.redirect(`/admin/b2b/quotes/${req.params.id}?error=` + encodeURIComponent(r.error));
        return res.redirect(`/admin/b2b/quotes/${req.params.id}?message=`
            + encodeURIComponent(`견적서를 발행했습니다 (${r.fileName}).`));
    } catch (err) { next(err); }
};
