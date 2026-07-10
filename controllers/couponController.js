/*
 * 고객 쿠폰존 `/coupon` (쿠폰 문서 §7-1)
 *
 * 역할이 마이페이지 쿠폰함과 다르다.
 *    /coupon          = 받는 곳 (다운로드)
 *    /mypage/coupons  = 보는 곳 (보유)
 *
 * 쿠폰 코드 입력(C5)은 체크아웃이 아니라 여기에 둔다. 결제 도중에 코드를 넣는 것보다
 * 쿠폰함에 미리 담는 흐름이 자연스럽고, 체크아웃 트랜잭션도 단순해진다.
 */

const pool = require('../config/db');
const { claimDownloadCoupon, redeemCouponCode } = require('../services/coupon/couponIssueService');
const { benefitLabel } = require('../services/coupon/discountCalculator');
const { COMING_SOON } = require('../routes/feature');

const CLAIM_MESSAGE = {
    already_claimed: '이미 받은 쿠폰입니다.',
    sold_out: '선착순이 마감되었습니다.',
    ended: '수령 기간이 종료되었습니다.',
    not_started: '아직 수령 기간이 아닙니다.',
    inactive: '지금은 받을 수 없는 쿠폰입니다.',
    expired: '만료된 쿠폰입니다.',
    not_downloadable: '다운로드 대상 쿠폰이 아닙니다.',
};

const CODE_MESSAGE = {
    empty: '쿠폰 코드를 입력해 주세요.',
    not_found: '유효하지 않은 쿠폰 코드입니다.',
    already_held: '이미 보유 중인 쿠폰입니다.',
    issue_limit: '발급 한도가 모두 소진된 쿠폰입니다.',
    inactive: '지금은 사용할 수 없는 쿠폰입니다.',
    expired: '만료된 쿠폰입니다.',
};

/** 쿠폰존 목록. 몰 스코프는 `mall_id IS NULL OR = ?` (§4-4). */
async function loadDownloadCoupons(mallId, userId) {
    const [rows] = await pool.query(
        `SELECT c.*,
                (cd.user_id IS NOT NULL) AS claimed
           FROM coupons c
           LEFT JOIN coupon_download cd ON cd.coupon_id = c.id AND cd.user_id = ?
          WHERE c.issue_method = 'DOWNLOAD'
            AND c.status = 'ACTIVE'
            AND (c.mall_id IS NULL OR c.mall_id = ?)
            AND (c.download_start_at IS NULL OR c.download_start_at <= NOW())
            AND (c.download_end_at IS NULL OR c.download_end_at >= NOW())
          ORDER BY c.discount_amount DESC, c.id DESC`,
        [userId || 0, mallId]
    );
    return rows;
}

/** 버튼 상태 5종 (§7-1). 서버가 판정한다 — 뷰에서 조건을 다시 조립하지 않는다. */
function buttonState(coupon, isLoggedIn) {
    if (!isLoggedIn) return 'login';
    if (coupon.claimed) return 'claimed';
    if (coupon.issue_limit != null && Number(coupon.issued_count) >= Number(coupon.issue_limit)) return 'sold_out';
    if (coupon.download_end_at && new Date(coupon.download_end_at) < new Date()) return 'ended';
    return 'available';
}

exports.getList = async (req, res, next) => {
    try {
        const mallId = req.mallId || 1;
        const userId = req.user ? req.user.id : null;
        const coupons = await loadDownloadCoupons(mallId, userId);

        // 0건 폴백 — 다운로드 쿠폰이 하나도 없으면 준비중 랜딩으로 되돌린다(gnb §4-2 배포 안전장치).
        if (coupons.length === 0) {
            const feature = COMING_SOON.coupon;
            return res.render('user/coming_soon', {
                title: feature.name,
                feature,
                seo: Object.assign({}, res.locals.seo, {
                    title: `${feature.name} (준비 중)`,
                    description: String(feature.description).replace(/<[^>]*>/g, ' '),
                    robots: 'noindex,follow',
                }),
            });
        }

        const typeFilter = req.query.type || '';
        const visible = typeFilter ? coupons.filter((c) => c.coupon_type === typeFilter) : coupons;

        res.render('user/coupon/list', {
            title: '쿠폰',
            coupons: visible.map((c) => ({
                ...c,
                buttonState: buttonState(c, !!userId),
                benefit: benefitLabel(c),   // 정액·정률·무료배송을 한 곳에서 문구화한다
            })),
            typeFilter,
            isLoggedIn: !!userId,
            message: req.query.msg || null,
            error: req.query.err || null,
        });
    } catch (err) {
        next(err);
    }
};

/** 수령. 선착순 슬롯 확보 + `coupon_download` PK 중복 차단을 한 트랜잭션에서 (§6-3). */
exports.postClaim = async (req, res, next) => {
    const couponId = parseInt(req.params.id, 10);
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        // issued_count 를 갱신하므로 최신 행을 잠그고 읽는다.
        const [[coupon]] = await conn.query('SELECT * FROM coupons WHERE id = ? FOR UPDATE', [couponId]);
        if (!coupon) {
            await conn.rollback();
            return res.redirect('/coupon?err=' + encodeURIComponent('존재하지 않는 쿠폰입니다.'));
        }
        if (coupon.mall_id != null && Number(coupon.mall_id) !== Number(req.mallId || 1)) {
            await conn.rollback();
            return res.redirect('/coupon?err=' + encodeURIComponent('이 몰에서 받을 수 없는 쿠폰입니다.'));
        }

        const result = await claimDownloadCoupon(conn, { userId: req.user.id, coupon });
        if (!result.ok) {
            await conn.rollback();
            return res.redirect('/coupon?err=' + encodeURIComponent(CLAIM_MESSAGE[result.reason] || '쿠폰을 받지 못했습니다.'));
        }
        await conn.commit();
        return res.redirect('/coupon?msg=' + encodeURIComponent('쿠폰을 받았습니다. 내 쿠폰함에서 확인하세요.'));
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
};

/** 쿠폰 코드 등록 (C5). 체크아웃의 데드 엔드포인트를 여기로 옮겼다. */
exports.postApplyCode = async (req, res, next) => {
    try {
        const result = await redeemCouponCode(req.user.id, req.body.coupon_code);
        if (!result.ok) {
            return res.redirect('/coupon?err=' + encodeURIComponent(CODE_MESSAGE[result.reason] || '쿠폰 등록에 실패했습니다.'));
        }
        return res.redirect('/coupon?msg=' + encodeURIComponent(`'${result.coupon.name}' 쿠폰이 등록되었습니다.`));
    } catch (err) {
        next(err);
    }
};
