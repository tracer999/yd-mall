/*
 * 거래처 등급 관리 + B2B 운영 설정 (설계 §11.1, §2.4).
 *
 * 등급은 **시드하지 않는다.** 관리자가 이 화면에서 만든다 — 새로 찍어낸 몰도 등급 0건에서
 * 시작하고, 그 상태로도 승인·주문이 동작한다(등급 없이 승인).
 *
 * 운영 설정은 몰별 테이블이 아니라 `system_settings` 전역 키다. 행이 없으면
 * middleware/b2bContext.js 의 DEFAULTS 가 쓰이므로, 아무것도 저장하지 않아도 정상 동작한다.
 */

const pool = require('../../config/db');
const b2bContext = require('../../middleware/b2bContext');
const { loadSystemSettingsAndApplyEnv } = require('../../config/systemSettings');

const LAYOUT = 'layouts/admin_layout';

// ──────────────────────────────── 거래처 등급

exports.getTiers = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            `SELECT t.*, (SELECT COUNT(*) FROM business_profile bp WHERE bp.tier_id = t.id) AS member_count
               FROM b2b_tier t ORDER BY t.rank_order ASC, t.id ASC`
        );
        res.render('admin/b2b/tiers', {
            layout: LAYOUT,
            title: '거래처 등급',
            subtitle: '기업회원 승인 시 배정할 등급을 정의합니다. 기본 등급을 지정해 두면 승인할 때 자동으로 붙습니다.',
            rows,
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (err) {
        next(err);
    }
};

exports.postTierSave = async (req, res, next) => {
    const { id, tier_code, tier_name, rank_order, is_default, is_active, description } = req.body;
    try {
        const code = (tier_code || '').trim().toUpperCase();
        const name = (tier_name || '').trim();
        if (!code || !name) {
            return res.redirect('/admin/b2b/tiers?error=' + encodeURIComponent('등급 코드와 등급명을 입력하세요.'));
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            // 기본 등급은 하나뿐이다 — 새로 지정하면 나머지를 내린다.
            if (is_default) await conn.query('UPDATE b2b_tier SET is_default = 0');

            if (id) {
                await conn.query(
                    `UPDATE b2b_tier SET tier_code = ?, tier_name = ?, rank_order = ?, is_default = ?, is_active = ?, description = ?
                      WHERE id = ?`,
                    [code, name, Number(rank_order) || 100, is_default ? 1 : 0, is_active ? 1 : 0, (description || '').trim() || null, id]
                );
            } else {
                await conn.query(
                    `INSERT INTO b2b_tier (tier_code, tier_name, rank_order, is_default, is_active, description)
                     VALUES (?,?,?,?,?,?)`,
                    [code, name, Number(rank_order) || 100, is_default ? 1 : 0, is_active ? 1 : 0, (description || '').trim() || null]
                );
            }
            await conn.commit();
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
        return res.redirect('/admin/b2b/tiers?message=' + encodeURIComponent('저장했습니다.'));
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.redirect('/admin/b2b/tiers?error=' + encodeURIComponent('이미 있는 등급 코드입니다.'));
        }
        next(err);
    }
};

exports.postTierDelete = async (req, res, next) => {
    try {
        const { id } = req.body;
        // 소속 거래처가 있으면 지우지 않는다 — FK 는 SET NULL 이라 조용히 등급이 빠져 버린다.
        const [[used]] = await pool.query('SELECT COUNT(*) AS cnt FROM business_profile WHERE tier_id = ?', [id]);
        if (used.cnt > 0) {
            return res.redirect('/admin/b2b/tiers?error='
                + encodeURIComponent(`이 등급을 쓰는 거래처가 ${used.cnt}곳 있습니다. 먼저 등급을 변경하세요.`));
        }
        await pool.query('DELETE FROM b2b_tier WHERE id = ?', [id]);
        return res.redirect('/admin/b2b/tiers?message=' + encodeURIComponent('삭제했습니다.'));
    } catch (err) {
        next(err);
    }
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
