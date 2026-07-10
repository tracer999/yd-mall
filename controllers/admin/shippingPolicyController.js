/*
 * 관리자 — 배송비 정책 (배송비 문서 §5-4, S8·S15)
 *
 * 기존 `/admin/shipping` 은 **송장 관리**(`shipments`)다. 배송비와 무관하므로 별도 메뉴로 둔다.
 *
 * 정책은 몰별 1행이다. 우측 상단 몰 선택기(req.adminMallId)와 무관하게 두 몰을 한 화면에서
 * 나란히 편집한다 — 정책은 두 개뿐이고, 몰을 오가며 비교할 일이 잦다.
 *
 * 우편번호 대역(`shipping_zipcode_zone`)은 몰 스코프가 없다. 제주가 어디인지는 몰마다 다르지 않다.
 */

const pool = require('../../config/db');

const ZONE_TYPES = ['JEJU', 'ISLAND'];

function toInt(v, fallback = 0) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
}

/** 5자리 숫자만 허용. 대역 판정이 문자열 BETWEEN 이라 자리수가 어긋나면 조용히 오작동한다. */
function normalizeZip(v) {
    const z = String(v || '').replace(/[^0-9]/g, '');
    return z.length === 5 ? z : null;
}

exports.getList = async (req, res, next) => {
    try {
        const [malls] = await pool.query('SELECT id, code, name FROM mall WHERE is_active = 1 ORDER BY id');
        const [policies] = await pool.query('SELECT * FROM shipping_policy');
        const [zones] = await pool.query(
            'SELECT * FROM shipping_zipcode_zone ORDER BY zone_type, zipcode_from'
        );

        const policyByMall = new Map(policies.map((p) => [Number(p.mall_id), p]));

        res.render('admin/shipping-policy/index', {
            layout: 'layouts/admin_layout',
            title: '배송비 정책',
            malls,
            policyByMall,
            zones,
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        next(err);
    }
};

exports.postSavePolicy = async (req, res, next) => {
    try {
        const mallId = toInt(req.body.mall_id);
        if (!mallId) return res.redirect('/admin/shipping-policy?error=몰이 지정되지 않았습니다');

        const baseFee = Math.max(0, toInt(req.body.base_fee));
        const jejuExtra = Math.max(0, toInt(req.body.jeju_extra));
        const islandExtra = Math.max(0, toInt(req.body.island_extra));
        const isActive = req.body.is_active ? 1 : 0;

        // 빈 문자열은 "무료배송 없음"(NULL) 이다. 0 과 구분해야 한다 — 0 이면 전 주문 무료배송이 된다.
        const rawThreshold = String(req.body.free_threshold ?? '').trim();
        const freeThreshold = rawThreshold === '' ? null : Math.max(0, toInt(rawThreshold));

        await pool.query(
            `INSERT INTO shipping_policy (mall_id, base_fee, free_threshold, jeju_extra, island_extra, is_active)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                base_fee = VALUES(base_fee), free_threshold = VALUES(free_threshold),
                jeju_extra = VALUES(jeju_extra), island_extra = VALUES(island_extra),
                is_active = VALUES(is_active)`,
            [mallId, baseFee, freeThreshold, jejuExtra, islandExtra, isActive]
        );
        res.redirect('/admin/shipping-policy?saved=1');
    } catch (err) {
        next(err);
    }
};

exports.postAddZone = async (req, res, next) => {
    try {
        const zoneType = ZONE_TYPES.includes(req.body.zone_type) ? req.body.zone_type : null;
        const from = normalizeZip(req.body.zipcode_from);
        const to = normalizeZip(req.body.zipcode_to);
        const label = String(req.body.label || '').trim() || null;

        if (!zoneType || !from || !to) {
            return res.redirect('/admin/shipping-policy?error=우편번호는 5자리 숫자여야 합니다');
        }
        if (from > to) {
            return res.redirect('/admin/shipping-policy?error=시작 우편번호가 끝보다 큽니다');
        }

        await pool.query(
            'INSERT INTO shipping_zipcode_zone (zone_type, zipcode_from, zipcode_to, label) VALUES (?, ?, ?, ?)',
            [zoneType, from, to, label]
        );
        res.redirect('/admin/shipping-policy?saved=1');
    } catch (err) {
        next(err);
    }
};

exports.postDeleteZone = async (req, res, next) => {
    try {
        await pool.query('DELETE FROM shipping_zipcode_zone WHERE id = ?', [toInt(req.params.id)]);
        res.redirect('/admin/shipping-policy?saved=1');
    } catch (err) {
        next(err);
    }
};
