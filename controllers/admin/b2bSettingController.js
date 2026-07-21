/*
 * 거래처 할인 + B2B 운영 설정.
 *
 * 상품별 B2B 설정(판매 여부·할인율·최소 수량)은 **상품 등록/수정 화면 안**에 있다.
 * 여기는 거래처 단위로 얹는 추가 할인율과 몰 공통 설정만 다룬다.
 *
 * 운영 설정은 몰별 테이블이 아니라 `system_settings` 전역 키다. 행이 없으면
 * middleware/b2bContext.js 의 DEFAULTS 가 쓰이므로, 아무것도 저장하지 않아도 정상 동작한다.
 */

const pool = require('../../config/db');
const b2bContext = require('../../middleware/b2bContext');
const { loadSystemSettingsAndApplyEnv } = require('../../config/systemSettings');

const LAYOUT = 'layouts/admin_layout';

// ──────────────────────────────── 거래처 할인

/**
 * 거래처별 추가 할인율.
 *
 * 상품마다 정한 B2B 할인율에 **단순 합산**된다. 상품 30% + 거래처 5% = 35% 할인.
 * 등급·정책 같은 계층을 두지 않는다 — 조건이 더 복잡해지면 견적에서 협의한다.
 */
exports.getDiscounts = async (req, res, next) => {
    try {
        const keyword = (req.query.q || '').trim();
        const where = ["bp.status = 'APPROVED'"];
        const params = [];
        if (keyword) {
            where.push('(bp.company_name LIKE ? OR bp.business_number LIKE ?)');
            params.push(`%${keyword}%`, `%${keyword}%`);
        }
        const [rows] = await pool.query(
            `SELECT bp.id, bp.company_name, bp.business_number, bp.extra_discount_rate,
                    u.email, u.name AS user_name
               FROM business_profile bp
               LEFT JOIN users u ON u.id = bp.user_id
              WHERE ${where.join(' AND ')}
              ORDER BY bp.extra_discount_rate DESC, bp.company_name ASC`,
            params
        );
        res.render('admin/b2b/discounts', {
            layout: LAYOUT,
            title: '거래처 할인',
            subtitle: '거래처마다 추가로 얹어 줄 할인율입니다. 상품에 정한 B2B 할인율과 단순 합산됩니다.',
            rows, keyword,
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (err) { next(err); }
};

exports.postDiscount = async (req, res, next) => {
    try {
        const { id, extra_discount_rate } = req.body;
        const rate = Number(extra_discount_rate);
        if (!id || !Number.isFinite(rate) || rate < 0 || rate > 99) {
            return res.redirect('/admin/b2b/discounts?error=' + encodeURIComponent('할인율은 0~99 사이로 입력하세요.'));
        }
        await pool.query('UPDATE business_profile SET extra_discount_rate = ? WHERE id = ?', [rate.toFixed(2), id]);
        return res.redirect('/admin/b2b/discounts?message=' + encodeURIComponent('저장했습니다.'));
    } catch (err) { next(err); }
};

// ──────────────────────────────── 운영 설정

/** 화면에 노출할 설정 키. system_settings 에 이 키로 저장한다. */
const SETTING_KEYS = [
    ['b2b_tax_display', 'B2B 가격 표기'],
    ['b2b_payment_due_days', '입금 기한(일)'],
    ['b2b_bank_account_info', '입금 계좌 안내'],
    ['b2b_free_ship_threshold', 'B2B 무료배송 기준액'],
    ['b2b_allow_coupon_stacking', '쿠폰·포인트 사용 허용'],
    ['b2b_auto_approve', '가입 즉시 자동 승인'],
    ['b2b_quote_valid_days', '견적 기본 유효기간(일)'],
];

exports.getSettings = async (req, res, next) => {
    try {
        res.render('admin/b2b/settings', {
            layout: LAYOUT,
            title: 'B2B 설정',
            subtitle: 'B2B 는 모든 몰에서 동작합니다. 아래 값은 저장하지 않아도 기본값으로 동작합니다.',
            settings: b2bContext.getSettings(),
            defaults: b2bContext.DEFAULTS,
            message: req.query.message || null,
        });
    } catch (err) {
        next(err);
    }
};

exports.postSettings = async (req, res, next) => {
    try {
        const values = {
            b2b_tax_display: req.body.tax_display === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE',
            b2b_payment_due_days: String(Math.max(1, parseInt(req.body.payment_due_days, 10) || 7)),
            b2b_bank_account_info: (req.body.bank_account_info || '').trim(),
            // 빈 값이면 "기본 배송정책을 따른다" 는 뜻이라 빈 문자열로 저장한다(0 과 다르다).
            b2b_free_ship_threshold: String(req.body.free_ship_threshold || '').trim(),
            b2b_allow_coupon_stacking: req.body.allow_coupon_stacking ? '1' : '0',
            b2b_auto_approve: req.body.auto_approve ? '1' : '0',
            b2b_quote_valid_days: String(Math.max(1, parseInt(req.body.quote_valid_days, 10) || 14)),
        };

        const labels = Object.fromEntries(SETTING_KEYS);
        for (const [key, value] of Object.entries(values)) {
            await pool.query(
                `INSERT INTO system_settings (setting_key, setting_value, description)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
                [key, value, `B2B — ${labels[key] || key}`]
            );
        }

        // 저장 즉시 반영. 앱 기동 때만 읽으면 관리자가 바꾼 값이 다음 재기동까지 안 먹는다.
        await loadSystemSettingsAndApplyEnv();
        return res.redirect('/admin/b2b/settings?message=' + encodeURIComponent('저장했습니다.'));
    } catch (err) {
        next(err);
    }
};
