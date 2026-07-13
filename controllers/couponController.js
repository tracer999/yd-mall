/*
 * 고객 쿠폰존 `/coupon` (쿠폰 문서 §7-1)
 *
 * 역할이 마이페이지 쿠폰함과 다르다.
 *    /coupon          = 받는 곳 (다운로드 · 코드 소개)
 *    /coupon/:id      = 쿠폰 소개 상세
 *    /mypage/coupons  = 보는 곳 (보유)
 *
 * 노출 대상은 "자동발급이 아닌" 쿠폰 — DOWNLOAD(받기) + CODE(코드 소개)다.
 * 리스트는 적용 대상(전상품/카테고리/브랜드/무료배송)으로 그룹핑하고, 카테고리·브랜드로 걸러 볼 수 있다.
 *
 * 쿠폰 코드 입력(C5)은 체크아웃이 아니라 여기에 둔다. 결제 도중에 코드를 넣는 것보다
 * 쿠폰함에 미리 담는 흐름이 자연스럽고, 체크아웃 트랜잭션도 단순해진다.
 */

const pool = require('../config/db');
const { claimDownloadCoupon, redeemCouponCode } = require('../services/coupon/couponIssueService');
const { benefitLabel, scopeGroup, scopeIncludeIds } = require('../services/coupon/discountCalculator');
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

// 그룹 메타 — 표시 순서와 라벨. 리스트가 이 순서대로 섹션을 쌓는다.
const GROUP_META = [
    { key: 'ALL', label: '전 상품 쿠폰', desc: '모든 상품에 사용할 수 있어요' },
    { key: 'CATEGORY', label: '카테고리 전용', desc: '특정 카테고리 상품에 사용' },
    { key: 'BRAND', label: '브랜드 전용', desc: '특정 브랜드 상품에 사용' },
    { key: 'SHIPPING', label: '배송비 쿠폰', desc: '배송비를 아껴보세요' },
];

/**
 * 쿠폰존 노출 대상. DOWNLOAD(수령기간 내) + CODE(상시 소개). 몰 스코프는 `mall_id IS NULL OR = ?` (§4-4).
 */
async function loadZoneCoupons(mallId, userId) {
    const [rows] = await pool.query(
        `SELECT c.*,
                (cd.user_id IS NOT NULL) AS claimed
           FROM coupons c
           LEFT JOIN coupon_download cd ON cd.coupon_id = c.id AND cd.user_id = ?
          WHERE c.status = 'ACTIVE'
            AND (c.mall_id IS NULL OR c.mall_id = ?)
            AND (
                  (c.issue_method = 'DOWNLOAD'
                    AND (c.download_start_at IS NULL OR c.download_start_at <= NOW())
                    AND (c.download_end_at IS NULL OR c.download_end_at >= NOW()))
                  OR c.issue_method = 'CODE'
                )
          ORDER BY c.discount_amount DESC, c.id DESC`,
        [userId || 0, mallId]
    );
    return rows;
}

/** 버튼 상태 (§7-1). 서버가 판정한다 — 뷰에서 조건을 다시 조립하지 않는다. */
function buttonState(coupon, isLoggedIn) {
    if (coupon.issue_method === 'CODE') return 'code_required';   // 코드형은 소개만 — 하단 코드입력창으로 유도
    if (!isLoggedIn) return 'login';
    if (coupon.claimed) return 'claimed';
    if (coupon.issue_limit != null && Number(coupon.issued_count) >= Number(coupon.issue_limit)) return 'sold_out';
    if (coupon.download_end_at && new Date(coupon.download_end_at) < new Date()) return 'ended';
    return 'available';
}

/** scope 에 등장하는 카테고리·브랜드 id 를 모아 이름을 붙인다. 필터 칩의 재료다. */
async function resolveTargetNames(coupons) {
    const catIds = new Set();
    const brandIds = new Set();
    coupons.forEach((c) => {
        const ids = scopeIncludeIds(c);
        ids.categoryIds.forEach((id) => catIds.add(id));
        ids.brandIds.forEach((id) => brandIds.add(id));
    });
    const allIds = [...new Set([...catIds, ...brandIds])];
    const nameMap = {};
    if (allIds.length) {
        const [rows] = await pool.query('SELECT id, name FROM categories WHERE id IN (?)', [allIds]);
        rows.forEach((r) => { nameMap[r.id] = r.name; });
    }
    return {
        categories: [...catIds].map((id) => ({ id, name: nameMap[id] || `#${id}` })),
        brands: [...brandIds].map((id) => ({ id, name: nameMap[id] || `#${id}` })),
    };
}

/** 뷰 카드용으로 쿠폰 한 건을 가공한다. */
function decorateCoupon(c, isLoggedIn) {
    const ids = scopeIncludeIds(c);
    return {
        ...c,
        buttonState: buttonState(c, isLoggedIn),
        benefit: benefitLabel(c),
        group: scopeGroup(c),
        targetCategoryIds: ids.categoryIds,
        targetBrandIds: ids.brandIds,
    };
}

exports.getList = async (req, res, next) => {
    try {
        const mallId = req.mallId || 1;
        const userId = req.user ? req.user.id : null;
        const raw = await loadZoneCoupons(mallId, userId);

        // 0건 폴백 — 노출할 쿠폰이 하나도 없으면 준비중 랜딩으로 되돌린다(gnb §4-2 배포 안전장치).
        if (raw.length === 0) {
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

        const decorated = raw.map((c) => decorateCoupon(c, !!userId));
        const targets = await resolveTargetNames(raw);

        // 필터 — 카테고리/브랜드로 좁혀 보기 (자동발급이 아닌 쿠폰 소개, §req3)
        const categoryFilter = req.query.category ? Number(req.query.category) : null;
        const brandFilter = req.query.brand ? Number(req.query.brand) : null;

        let filtered = decorated;
        if (categoryFilter) filtered = decorated.filter((c) => c.targetCategoryIds.includes(categoryFilter));
        else if (brandFilter) filtered = decorated.filter((c) => c.targetBrandIds.includes(brandFilter));

        // 적용 대상 기준 그룹핑. 필터가 걸리면 그룹 헤더 없이 평면 목록.
        const groups = GROUP_META
            .map((g) => ({ ...g, coupons: filtered.filter((c) => c.group === g.key) }))
            .filter((g) => g.coupons.length > 0);

        res.render('user/coupon/list', {
            title: '쿠폰',
            groups,
            totalCount: filtered.length,
            targets,
            filter: { category: categoryFilter, brand: brandFilter },
            isLoggedIn: !!userId,
            message: req.query.msg || null,
            error: req.query.err || null,
        });
    } catch (err) {
        next(err);
    }
};

/** 쿠폰 소개 상세 `/coupon/:id`. 노출 대상 쿠폰만 보여준다. */
exports.getDetail = async (req, res, next) => {
    try {
        const mallId = req.mallId || 1;
        const userId = req.user ? req.user.id : null;
        const couponId = parseInt(req.params.id, 10);

        const [[coupon]] = await pool.query(
            `SELECT c.*, (cd.user_id IS NOT NULL) AS claimed
               FROM coupons c
               LEFT JOIN coupon_download cd ON cd.coupon_id = c.id AND cd.user_id = ?
              WHERE c.id = ? AND c.status = 'ACTIVE'
                AND (c.mall_id IS NULL OR c.mall_id = ?)
                AND c.issue_method IN ('DOWNLOAD','CODE')`,
            [userId || 0, couponId, mallId]
        );
        if (!coupon) return res.redirect('/coupon');

        const decorated = decorateCoupon(coupon, !!userId);
        const targets = await resolveTargetNames([coupon]);

        res.render('user/coupon/detail', {
            title: coupon.name,
            coupon: decorated,
            targets,
            isLoggedIn: !!userId,
            message: req.query.msg || null,
            error: req.query.err || null,
        });
    } catch (err) {
        next(err);
    }
};

/**
 * 수령 후 돌아갈 곳.
 *
 * **임의 URL 을 받지 않는다** — 오픈 리다이렉트가 된다.
 * 정해진 형태만 해석하고, 그 외에는 전부 쿠폰존으로 보낸다.
 *   'detail'      → 쿠폰 상세
 *   'live:{slug}' → 그 쇼핑라이브 상세 (라이브 혜택 탭에서 받은 경우)
 *
 * slug 는 encodeURIComponent 로 감싸므로 '//evil.com' 같은 값이 와도 경로 조각이 될 뿐이다.
 */
function claimBackPath(body, couponId) {
    const r = String((body && body.redirect) || '');
    if (r === 'detail') return `/coupon/${couponId}`;

    const live = /^live:(.+)$/.exec(r);
    if (live) return `/live/${encodeURIComponent(live[1])}`;

    return '/coupon';
}

/** 수령. 선착순 슬롯 확보 + `coupon_download` PK 중복 차단을 한 트랜잭션에서 (§6-3). */
exports.postClaim = async (req, res, next) => {
    const couponId = parseInt(req.params.id, 10);
    const back = claimBackPath(req.body, couponId);
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        // issued_count 를 갱신하므로 최신 행을 잠그고 읽는다.
        const [[coupon]] = await conn.query('SELECT * FROM coupons WHERE id = ? FOR UPDATE', [couponId]);
        if (!coupon) {
            await conn.rollback();
            return res.redirect(back + '?err=' + encodeURIComponent('존재하지 않는 쿠폰입니다.'));
        }
        if (coupon.mall_id != null && Number(coupon.mall_id) !== Number(req.mallId || 1)) {
            await conn.rollback();
            return res.redirect(back + '?err=' + encodeURIComponent('이 몰에서 받을 수 없는 쿠폰입니다.'));
        }

        const result = await claimDownloadCoupon(conn, { userId: req.user.id, coupon });
        if (!result.ok) {
            await conn.rollback();
            return res.redirect(back + '?err=' + encodeURIComponent(CLAIM_MESSAGE[result.reason] || '쿠폰을 받지 못했습니다.'));
        }
        await conn.commit();
        return res.redirect(back + '?msg=' + encodeURIComponent('쿠폰을 받았습니다. 내 쿠폰함에서 확인하세요.'));
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
