const pool = require('../config/db');
const bcrypt = require('bcrypt');
const orderMailer = require('../services/email/orderMailer');
const { benefitLabel } = require('../services/coupon/discountCalculator');
const claimService = require('../services/order/claimService');
const partialClaimService = require('../services/order/partialClaimService');
const purchaseConfirmService = require('../services/order/purchaseConfirmService');
const { sellableStockSql } = require('../services/catalog/sellableStock');
const dealSvc = require('../services/deal/dealService');
const membershipEval = require('../services/membership/evaluationService');

/*
 * 마이페이지 주문 요약 카드가 쓰는 필터.
 * 고객에게 `PAID`·`PREPARING` 같은 코드를 보여 주지 않으려고 묶음 이름으로 받는다.
 */
const ORDER_FILTERS = {
    ongoing: { label: '주문중', statuses: ['PENDING', 'PAID', 'PREPARING'] },
    shipping: { label: '배송중', statuses: ['SHIPPED'] },
    done: { label: '배송완료', statuses: ['DELIVERED'] },
    /*
     * 반품/취소는 상태만으로 가릴 수 없다.
     *   - 고객이 신청한 클레임 → 주문은 살아 있을 수 있다(부분 취소·부분 반품·교환)
     *   - 관리자가 직권 취소한 주문 → `order_claims` 에 아무 기록이 없다
     * 둘 중 하나라도 해당하면 "취소·반품과 관련된 주문"이므로 합쳐서 본다.
     * 대시보드 카드의 숫자도 **이것과 같은 조건**으로 세야 눌렀을 때 건수가 맞는다.
     */
    claim: {
        label: '반품/취소',
        sql: `(o.status IN ('CANCELLED','REFUNDED')
               OR EXISTS (SELECT 1 FROM order_claims c
                           WHERE c.order_id = o.id AND c.status <> 'WITHDRAWN'))`,
    },
};

exports.getDashboard = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // 1. 최근 주문 5건 조회
        // orders 테이블의 컬럼명(total_amount 등)은 실제 DB 스키마에 맞춰 조정 필요
        const [recentOrders] = await pool.query(
            `SELECT id, created_at, total_amount, status
             FROM orders
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 5`,
            [userId]
        );

        // 2. 주문 상태별 카운트
        const [statusCounts] = await pool.query(
            `SELECT status, COUNT(*) as count
             FROM orders
             WHERE user_id = ?
             GROUP BY status`,
            [userId]
        );

        // 상태별 카운트 초기화
        const stats = {
            PENDING: 0,    // 입금대기
            PAID: 0,       // 결제완료
            PREPARING: 0,  // 배송준비
            SHIPPED: 0,    // 배송중
            DELIVERED: 0,  // 배송완료
            CANCELLED: 0,  // 취소
            REFUNDED: 0    // 환불
        };

        // DB 결과 매핑
        statusCounts.forEach(row => {
            if (stats[row.status] !== undefined) {
                stats[row.status] = row.count;
            }
        });

        // 3. 보유 쿠폰 수 조회 — 개인별 만료일(uc.expires_at)이 있으면 그것이 우선한다
        const [[{ coupon_count }]] = await pool.query(
            `SELECT COUNT(*) as coupon_count
             FROM user_coupons uc
             JOIN coupons c ON uc.coupon_id = c.id
             WHERE uc.user_id = ? AND uc.used_at IS NULL
               AND (COALESCE(uc.expires_at, c.valid_to) IS NULL OR COALESCE(uc.expires_at, c.valid_to) > NOW())`,
            [userId]
        ).catch(() => [[{ coupon_count: 0 }]]); // 쿠폰 관련 테이블이 없을 경우를 대비

        // 4. 보유 포인트 조회
        const [[userPoints]] = await pool.query(
            `SELECT points_balance FROM users WHERE id = ?`,
            [userId]
        ).catch(() => [[{ points_balance: 0 }]]);
        const pointsBalance = userPoints ? userPoints.points_balance : 0;

        // 5. 찜 상품 수
        const [[{ likes_count }]] = await pool.query(
            'SELECT COUNT(*) as likes_count FROM likes WHERE user_id = ?',
            [userId]
        ).catch(() => [[{ likes_count: 0 }]]);

        // 최근 본 상품 수 (15일 이내)
        const [[{ recent_view_count }]] = await pool.query(
            'SELECT COUNT(*) as recent_view_count FROM recent_views WHERE user_id = ? AND viewed_at >= DATE_SUB(NOW(), INTERVAL 15 DAY)',
            [userId]
        ).catch(() => [[{ recent_view_count: 0 }]]);
        const recentViewedCount = recent_view_count;

        /*
         * 주문 요약 3종 — 찜/최근본/포인트 카드 아래에 함께 보여 준다.
         *
         * 상태를 하나씩 늘어놓지 않고 **고객이 궁금해하는 단위**로 묶었다.
         *   주문중   : 결제는 됐고 아직 안 떠난 것 (입금대기·결제완료·배송준비)
         *   배송중   : 지금 오고 있는 것
         *   반품/취소: 취소·반품·교환으로 처리 중이거나 처리된 것
         *
         * 배송완료는 "끝난 일"이라 카드로 띄우지 않는다 — 전체 주문 내역에서 본다.
         */
        const orderSummary = {
            ongoing: (stats.PENDING || 0) + (stats.PAID || 0) + (stats.PREPARING || 0),
            shipping: stats.SHIPPED || 0,
            claim: 0,
            claimPending: 0,   // 아직 처리되지 않은 신청 — 있으면 카드에 따로 표시한다
        };

        /*
         * 반품/취소 건수 — **주문 단위**로 센다.
         *
         * 클레임만 세면 관리자가 직권 취소한 주문이 빠지고(그 주문에는 클레임 기록이 없다),
         * 주문 상태만 보면 부분 취소·부분 반품·교환이 빠진다(주문이 살아 있다).
         * 카드를 누르면 `/mypage/orders?filter=claim` 목록으로 가므로
         * **그 목록과 똑같은 조건**으로 세야 숫자와 건수가 어긋나지 않는다.
         */
        const [[claimRow]] = await pool.query(
            `SELECT COUNT(*) AS total,
                    COALESCE(SUM(
                        EXISTS (SELECT 1 FROM order_claims c
                                 WHERE c.order_id = o.id AND c.status = 'REQUESTED')
                    ), 0) AS pending
               FROM orders o
              WHERE o.user_id = ?
                AND ${ORDER_FILTERS.claim.sql}`,
            [userId]
        ).catch(() => [[{ total: 0, pending: 0 }]]);
        orderSummary.claim = Number(claimRow ? claimRow.total : 0) || 0;
        orderSummary.claimPending = Number(claimRow ? claimRow.pending : 0) || 0;

        // 3. 최근 활동 (리뷰 + 문의) 3건 조회
        const [recentActivities] = await pool.query(
            `SELECT 'review' as type, id, content, created_at, product_id
             FROM reviews
             WHERE user_id = ?
             UNION ALL
             SELECT 'inquiry' as type, id, title as content, created_at, NULL as product_id
             FROM inquiries
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 3`,
            [userId, userId]
        );

        // 멤버십 등급 요약(현재 등급·다음 등급까지 남은 실적). 실패해도 대시보드는 그린다.
        let membership = null;
        try {
            membership = await membershipEval.getCustomerSummary(userId, req.mallId || 1);
        } catch (e) {
            console.error('[mypage] membership summary failed:', e.message);
        }

        res.render('user/mypage/dashboard', {
            title: '마이페이지',
            user: req.user,
            recentOrders,
            stats,
            recentActivities,
            couponCount: coupon_count,
            pointsBalance,
            likesCount: likes_count,
            recentViewedCount,
            orderSummary,
            membership
        });
    } catch (err) {
        next(err);
    }
};

// 회원정보 수정 - 비밀번호 확인 폼 보여주기
exports.getProfile = async (req, res, next) => {
    try {
        const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);

        const now = Date.now();
        const verifiedAt = req.session.identity_verified_at || 0;
        const identityVerified = !!(req.session.identity_verified && (now - verifiedAt) < 15 * 60 * 1000);

        res.render('user/mypage/profile-edit', {
            title: '회원 정보 수정',
            user,
            identityVerified,
            reauthFailed: req.query.reauth === 'fail',
            reauthRequired: req.query.reauth === 'required',
            justVerified: req.query.verified === '1',
            updated: req.query.updated === '1'
        });
    } catch (err) {
        next(err);
    }
};

exports.getOrders = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = 10;
        const offset = (page - 1) * limit;

        const filterKey = Object.prototype.hasOwnProperty.call(ORDER_FILTERS, req.query.filter)
            ? req.query.filter : null;
        const filter = filterKey ? ORDER_FILTERS[filterKey] : null;

        const where = ['o.user_id = ?'];
        const params = [userId];
        if (filter && filter.statuses) {
            where.push(`o.status IN (${filter.statuses.map(() => '?').join(',')})`);
            params.push(...filter.statuses);
        } else if (filter && filter.sql) {
            where.push(filter.sql);
        }
        const whereSql = `WHERE ${where.join(' AND ')}`;

        // 전체 주문 수 조회 (필터가 걸리면 그 안에서)
        const [[{ count }]] = await pool.query(
            `SELECT COUNT(*) as count FROM orders o ${whereSql}`,
            params
        );

        const totalPages = Math.ceil(count / limit);

        // 주문 목록 조회 (대표 상품명, 아이템 개수 포함)
        const [orders] = await pool.query(
            `SELECT o.*,
                    (SELECT product_name FROM order_items WHERE order_id = o.id ORDER BY id ASC LIMIT 1) as first_product_name,
                    (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
             FROM orders o
             ${whereSql}
             ORDER BY o.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        // 표시용 상품명 가공
        orders.forEach(order => {
            if (order.item_count > 1) {
                order.product_name_display = `${order.first_product_name} 외 ${order.item_count - 1}건`;
            } else {
                order.product_name_display = order.first_product_name || '상품 정보 없음';
            }
        });

        res.render('user/mypage/orders', {
            title: '주문/배송 조회',
            orders,
            currentPage: page,
            totalPages,
            totalOrders: count,
            filterKey,
            filterLabel: filter ? filter.label : null
        });
    } catch (err) {
        next(err);
    }
};

exports.getClaims = async (req, res, next) => {
    try {
        const [claims] = await pool.query(
            `SELECT c.*, o.order_number, o.total_amount,
                    r.refund_amount, r.status AS refund_status, r.return_shipping_fee_deducted
               FROM order_claims c
               JOIN orders o ON o.id = c.order_id
               LEFT JOIN order_refunds r ON r.claim_id = c.id
              WHERE o.user_id = ?
              ORDER BY c.created_at DESC`,
            [req.user.id]
        );
        res.render('user/mypage/claims', { title: '취소·반품 내역', claims });
    } catch (err) {
        next(err);
    }
};

exports.withdrawClaim = async (req, res, next) => {
    try {
        const result = await claimService.withdrawClaim({ claimId: Number(req.params.id), userId: req.user.id });
        if (!result.ok) return res.redirect('/mypage/claims?error=' + encodeURIComponent(result.reason));
        res.redirect('/mypage/claims');
    } catch (err) {
        next(err);
    }
};

exports.getOrderDetail = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const orderId = req.params.id;

        // 주문 기본 정보
        const [orders] = await pool.query(
            'SELECT * FROM orders WHERE id = ? AND user_id = ?',
            [orderId, userId]
        );

        if (orders.length === 0) {
            return res.redirect('/mypage/orders');
        }
        const order = orders[0];

        // 주문 상품 목록
        const [items] = await pool.query(
            `SELECT oi.*, p.thumbnail_image, p.slug
             FROM order_items oi
             LEFT JOIN products p ON oi.product_id = p.id
             WHERE oi.order_id = ?`,
            [orderId]
        );

        // 배송 정보 (shipments)
        const [shipments] = await pool.query(
            'SELECT * FROM shipments WHERE order_id = ?',
            [orderId]
        );

        // 클레임 내역 (취소·반품)
        const [claims] = await pool.query(
            'SELECT * FROM order_claims WHERE order_id = ? ORDER BY created_at DESC',
            [orderId]
        );

        const rawClaim = String(req.query.claim || '');
        let claimMsg = {
            cancel_done: '주문이 취소되었습니다.',
            cancel_requested: '취소 신청이 접수되었습니다. 처리 결과를 기다려 주세요.',
            return_requested: '반품 신청이 접수되었습니다. 처리 결과를 기다려 주세요.',
            exchange_requested: '교환 신청이 접수되었습니다. 회수 안내를 기다려 주세요.',
            confirm_done: '구매확정이 완료되었습니다. 이용해 주셔서 감사합니다.',
        }[rawClaim] || null;
        // 적립이 함께 나간 경우 금액을 문구에 실어 준다(confirm_done_1200 형태).
        const rewardMatch = rawClaim.match(/^confirm_done_(\d+)$/);
        if (rewardMatch) {
            claimMsg = `구매확정이 완료되었습니다. ${Number(rewardMatch[1]).toLocaleString()}P 를 적립해 드렸습니다.`;
        }

        /*
         * 상품별 신청 가능 수량 — 이미 취소·반품한 만큼은 빼고 보여 준다.
         * 이 값이 없으면 고객이 2개 산 물건을 3개 반품 신청하는 화면이 만들어진다.
         */
        const claimable = await partialClaimService.getClaimableItems(pool, orderId);
        const claimableById = new Map(claimable.map((c) => [Number(c.id), c]));

        /*
         * 상품별 처리 상태 — **부분 취소한 상품이 정상 주문처럼 보이면 안 된다.**
         * 어떤 상품이 취소·반품·교환됐는지, 아직 처리 중인지를 상품 줄에 그대로 표시한다.
         * 전건 클레임은 `order_claim_items` 에 행이 없으므로 주문 상태로 판정한다(아래 뷰).
         */
        const [claimedRows] = await pool.query(`
            SELECT ci.order_item_id,
                   SUM(ci.quantity) AS qty,
                   MAX(c.claim_type) AS claim_type,
                   MIN(c.status = 'REQUESTED') AS all_done,
                   MAX(c.status = 'REQUESTED') AS has_pending
              FROM order_claim_items ci
              JOIN order_claims c ON c.id = ci.claim_id
             WHERE c.order_id = ? AND c.status IN ('REQUESTED', 'COMPLETED')
             GROUP BY ci.order_item_id
        `, [orderId]).catch(() => [[]]);
        const claimedById = new Map(claimedRows.map((r) => [Number(r.order_item_id), r]));

        const itemsWithRemaining = items.map((it) => {
            const c = claimableById.get(Number(it.id));
            const cl = claimedById.get(Number(it.id));
            return {
                ...it,
                remaining_qty: c ? c.remaining_qty : Number(it.quantity),
                claimed_qty: cl ? Number(cl.qty) : 0,
                claim_type: cl ? cl.claim_type : null,
                claim_pending: cl ? Number(cl.has_pending) === 1 : false,
            };
        });

        res.render('user/mypage/order_detail', {
            title: '주문 상세',
            order,
            items: itemsWithRemaining,
            shipment: shipments[0] || null,
            claims,
            claimMsg,
            claimError: req.query.claim_error || null
        });
    } catch (err) {
        next(err);
    }
};

// 회원정보 업데이트 처리 (일반/민감 분리)
exports.updateProfile = async (req, res, next) => {
    const { type, name, email, phone, zipcode, address, detailed_address } = req.body;
    const userId = req.user.id;

    // 민감 정보 수정 시 재인증 유효성 검사
    if (type === 'sensitive') {
        const now = Date.now();
        const verifiedAt = req.session.identity_verified_at || 0;
        const identityVerified = !!(req.session.identity_verified && (now - verifiedAt) < 15 * 60 * 1000);
        if (!identityVerified) {
            return res.redirect('/mypage/profile?reauth=required');
        }
    }

    try {
        if (type === 'general') {
            await pool.query(
                'UPDATE users SET name = ?, email = COALESCE(NULLIF(?, \'\'), email) WHERE id = ?',
                [name || null, email || '', userId]
            );
        } else if (type === 'sensitive') {
            await pool.query(
                'UPDATE users SET phone = ?, zipcode = ?, address = ?, detailed_address = ? WHERE id = ?',
                [phone || null, zipcode || null, address || null, detailed_address || null, userId]
            );
            // 재인증 세션 소비 (1회 사용 후 만료)
            delete req.session.identity_verified;
            delete req.session.identity_verified_at;
        }

        res.redirect('/mypage/profile?updated=1');
    } catch (err) {
        next(err);
    }
};

exports.getCoupons = async (req, res, next) => {
    try {
        const userId = req.user.id;

        /*
         * 보유 쿠폰 4구분 (쿠폰 문서 §7-2)
         *   사용 가능 · 주문 진행 중(RESERVED) · 사용 완료 · 기간 만료
         *
         * 만료일은 `COALESCE(uc.expires_at, c.valid_to)` 다 — valid_days 로 발급된 쿠폰은
         * 개인별 만료일(uc.expires_at)이 따로 있다.
         *
         * 30분 넘게 방치된 점유는 "주문 진행 중"이 아니다. 체크아웃 조회 기준과 같아야 한다.
         */
        const [rows] = await pool.query(
            `SELECT
                c.name,
                c.benefit_type, c.discount_amount, c.discount_rate, c.max_discount_amount,
                c.min_order_amount AS min_purchase,
                COALESCE(uc.expires_at, c.valid_to) AS expires_at,
                uc.used_at,
                o.order_number AS used_order_number,
                ro.order_number AS reserved_order_number,
                (uc.used_at IS NULL AND uc.reserved_order_id IS NOT NULL
                 AND uc.reserved_at >= NOW() - INTERVAL 30 MINUTE) AS is_reserved
             FROM user_coupons uc
             JOIN coupons c ON uc.coupon_id = c.id
             LEFT JOIN orders o  ON o.id  = uc.order_id
             LEFT JOIN orders ro ON ro.id = uc.reserved_order_id
             WHERE uc.user_id = ?
             ORDER BY uc.used_at ASC, COALESCE(uc.expires_at, c.valid_to) ASC, uc.created_at DESC`,
            [userId]
        ).catch(() => [[]]); // 쿠폰 관련 테이블이 없을 경우를 대비

        const now = Date.now();
        const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
        const coupons = rows.map((c) => {
            const expired = c.expires_at && new Date(c.expires_at).getTime() < now;
            let state = 'available';
            if (c.used_at) state = 'used';
            else if (expired) state = 'expired';
            else if (Number(c.is_reserved) === 1) state = 'reserved';
            return {
                ...c,
                state,
                benefit: benefitLabel(c),   // 정액·정률·무료배송을 한 곳에서 문구화한다 (C6 의 죽은 분기 대체)
                expiringSoon: state === 'available' && c.expires_at
                    && new Date(c.expires_at).getTime() - now <= THREE_DAYS,
            };
        });

        // 사용가능(만료임박순) → 진행중 → 사용완료 → 만료
        const order = { available: 0, reserved: 1, used: 2, expired: 3 };
        coupons.sort((a, b) => order[a.state] - order[b.state]);

        res.render('user/mypage/coupons', {
            title: '내 쿠폰함',
            coupons
        });
    } catch (err) {
        next(err);
    }
};

exports.getActivities = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const [reviews] = await pool.query(
            `SELECT r.*, p.name as product_name, p.thumbnail_image, p.slug
             FROM reviews r
             JOIN products p ON r.product_id = p.id
             WHERE r.user_id = ?
             ORDER BY r.created_at DESC`,
            [userId]
        );

        const [inquiries] = await pool.query(
            'SELECT * FROM inquiries WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );

        res.render('user/mypage/activities', {
            title: '나의 활동',
            reviews,
            inquiries
        });
    } catch (err) {
        next(err);
    }
};

exports.getLikes = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const [likedProducts] = await pool.query(
            `SELECT
                p.id, p.name, p.slug, p.price, p.original_price,
                p.main_image, ${sellableStockSql('p')} AS stock, p.status, p.provider,
                p.discount_rate, p.product_badge, p.distribution_badge
             FROM likes l
             JOIN products p ON l.product_id = p.id
             WHERE l.user_id = ? AND p.status IN ('ON','SOLD_OUT','COMING_SOON')
             ORDER BY l.created_at DESC`,
            [userId]
        );

        // 찜한 뒤 특가가 시작됐을 수 있다 — 현재가 기준으로 보여준다.
        await dealSvc.applyDeals(likedProducts);

        res.render('user/mypage/likes', {
            title: '관심 상품',
            likedProducts
        });
    } catch (err) {
        next(err);
    }
};

/**
 * 찜한 브랜드 목록 (brand_likes → categories[type=BRAND])
 * 브랜드별 판매중 상품 수를 함께 보여준다.
 */
exports.getBrandLikes = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const [likedBrands] = await pool.query(
            `SELECT
                c.id, c.name, c.logo_image_path,
                COUNT(p.id) AS product_count
             FROM brand_likes bl
             JOIN categories c ON bl.category_id = c.id AND c.type = 'BRAND'
             LEFT JOIN products p
                    ON p.brand_category_id = c.id
                   AND p.status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')
             WHERE bl.user_id = ?
             GROUP BY c.id, c.name, c.logo_image_path
             ORDER BY bl.created_at DESC`,
            [userId]
        );

        res.render('user/mypage/brand_likes', {
            title: '찜한 브랜드',
            likedBrands
        });
    } catch (err) {
        next(err);
    }
};

exports.getRecentViews = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const [recentProducts] = await pool.query(
            `SELECT p.id, p.name, p.slug, p.price, p.original_price,
                    p.main_image, ${sellableStockSql('p')} AS stock, p.status, p.provider,
                    p.discount_rate, p.product_badge, p.distribution_badge,
                    rv.viewed_at
             FROM recent_views rv
             JOIN products p ON rv.product_id = p.id
             WHERE rv.user_id = ? AND rv.viewed_at >= DATE_SUB(NOW(), INTERVAL 15 DAY)
               AND p.status IN ('ON','SOLD_OUT','COMING_SOON')
             ORDER BY rv.viewed_at DESC`,
            [userId]
        );

        // 본 뒤에 특가가 시작됐을 수 있다 — 현재가 기준으로 보여준다.
        await dealSvc.applyDeals(recentProducts);

        res.render('user/mypage/recent-views', {
            title: '최근 본 상품',
            recentProducts
        });
    } catch (err) {
        next(err);
    }
};

exports.getPoints = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // 현재 포인트 잔액
        const [[userPoints]] = await pool.query(
            'SELECT points_balance FROM users WHERE id = ?',
            [userId]
        );
        const pointsBalance = userPoints ? userPoints.points_balance : 0;

        // 포인트 변동 내역
        const [transactions] = await pool.query(
            'SELECT * FROM point_transactions WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        ).catch(() => [[]]); // 테이블 없을 경우 대비

        res.render('user/mypage/points', {
            title: '포인트 내역',
            pointsBalance,
            transactions
        });
    } catch (err) {
        next(err);
    }
};

/*
 * 취소 · 반품 · 교환 신청 화면 (GET)
 *
 * 팝업이 아니라 전용 화면이다. 신청은 "어떤 상품을 돌려보낼지" 를 보면서 고르는 일이라
 * 좁은 모달 안에서는 상품명·옵션·금액이 잘려 판단할 수가 없다.
 *
 * 고르는 방식은 둘 중 하나뿐이다 — **상품별 신청** 또는 **전체 신청**.
 * 수량을 세게 하지 않는다. 같은 상품을 2개 사서 1개만 돌려보내는 일은 드물고,
 * 그 드문 경우 때문에 모든 고객이 수량 입력을 마주하는 편이 나쁘다.
 */
/*
 * 구매확정 (POST)
 * 고객이 "잘 받았다"고 확정하는 순간이며, 이때 적립금이 지급된다.
 * 확정 후에는 반품·교환을 신청할 수 없다(claimService.claimability 가 막는다).
 */
exports.confirmPurchase = async (req, res, next) => {
    try {
        const orderId = Number(req.params.id);
        const result = await purchaseConfirmService.confirmPurchase(orderId, {
            source: 'CUSTOMER',
            userId: req.user.id,
        });
        if (!result.ok) {
            return res.redirect(`/mypage/orders/${orderId}?claim_error=` + encodeURIComponent(result.reason));
        }
        const msg = result.reward > 0
            ? `confirm_done_${result.reward}`
            : 'confirm_done';
        res.redirect(`/mypage/orders/${orderId}?claim=${msg}`);
    } catch (err) {
        next(err);
    }
};

exports.getClaimRequest = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const orderId = Number(req.params.id);

        const [[order]] = await pool.query(
            'SELECT * FROM orders WHERE id = ? AND user_id = ?', [orderId, userId]);
        if (!order) return res.redirect('/mypage/orders');

        // 이미 처리 중인 신청이 있으면 새로 받지 않는다(주문 단위 가드와 같은 규칙).
        if (order.claim_status === 'REQUESTED') {
            return res.redirect(`/mypage/orders/${orderId}?claim_error=` +
                encodeURIComponent('이미 처리 중인 신청이 있습니다. 처리 결과를 기다려 주세요.'));
        }

        const [[shipment]] = await pool.query(
            "SELECT * FROM shipments WHERE order_id = ? AND direction = 'OUTBOUND'", [orderId]);

        // 신청 가능 여부·유형은 claimService 가 판정한다(화면과 서버가 다른 규칙을 쓰지 않도록).
        const allowed = claimService.claimability(order, shipment || null);
        if (!allowed.types || !allowed.types.length) {
            return res.redirect(`/mypage/orders/${orderId}?claim_error=` +
                encodeURIComponent(allowed.reason || '지금은 신청할 수 없습니다.'));
        }

        const [items] = await pool.query(
            `SELECT oi.*, p.thumbnail_image, p.slug
               FROM order_items oi
               LEFT JOIN products p ON oi.product_id = p.id
              WHERE oi.order_id = ?
              ORDER BY oi.id`, [orderId]);

        // 이미 취소·반품한 만큼은 빼고 보여 준다.
        const claimable = await partialClaimService.getClaimableItems(pool, orderId);
        const byId = new Map(claimable.map((c) => [Number(c.id), c]));
        const rows = items.map((it) => {
            const c = byId.get(Number(it.id));
            const remaining = c ? c.remaining_qty : Number(it.quantity);
            return { ...it, remaining_qty: remaining, claimed_qty: c ? c.claimed_qty : 0 };
        });

        res.render('user/mypage/claim_request', {
            title: allowed.types.includes('RETURN') ? '반품 · 교환 신청' : '주문 취소',
            order,
            items: rows,
            selectable: rows.filter((r) => r.remaining_qty > 0),
            types: allowed.types,
            error: req.query.error || null,
        });
    } catch (err) {
        next(err);
    }
};

exports.cancelOrder = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const orderId = req.params.id;
        const { reason, reasonType } = req.body;

        /*
         * 취소·반품 신청은 claimService 하나로 모은다.
         * 출고 전(PENDING·PAID)이면 즉시 승인·환불까지 끝나고, 준비 시작 후에는 관리자 승인을 기다린다.
         * 출고 후에는 이 경로가 '취소'가 아니라 '반품'으로 처리된다.
         *
         * (과거엔 여기서 orders.cancel_reason 을 UPDATE 했는데 그 컬럼이 없어 **항상 500** 이었다.)
         */
        const [[order]] = await pool.query('SELECT status FROM orders WHERE id = ? AND user_id = ?', [orderId, userId]);
        if (!order) return res.status(404).send('주문을 찾을 수 없습니다.');

        const shipped = ['SHIPPED', 'DELIVERED'].includes(order.status);
        /*
         * 출고 후에는 반품과 교환 중에서 고객이 고른다(출고 전이면 언제나 취소).
         * 교환은 물건을 회수하고 같은 물건을 다시 보내는 것이라 환불이 없다.
         */
        const wantExchange = shipped && req.body.claim_type === 'EXCHANGE';
        const claimType = shipped ? (wantExchange ? 'EXCHANGE' : 'RETURN') : 'CANCEL';

        /*
         * 신청 범위 — 상품별이거나 전체거나, 둘 중 하나다.
         *
         *   item_id 가 오면  → 그 상품 **남은 수량 전부**
         *   없으면(전체 버튼) → 주문 전건 (items = null)
         *
         * 수량은 받지 않는다. 화면에서 고르게 하지 않았으므로 서버도 세지 않는다 —
         * 한쪽만 수량을 알면 "화면에는 1개라 적혀 있는데 2개가 취소된" 어긋남이 생긴다.
         */
        let items = null;
        const rawItemId = Number(req.body.item_id);
        if (Number.isFinite(rawItemId) && rawItemId > 0) {
            const claimable = await partialClaimService.getClaimableItems(pool, Number(orderId));
            const target = claimable.find((c) => Number(c.id) === rawItemId);
            if (!target) {
                return res.redirect(`/mypage/orders/${orderId}/claim?error=` +
                    encodeURIComponent('주문에 없는 상품입니다.'));
            }
            if (target.remaining_qty <= 0) {
                return res.redirect(`/mypage/orders/${orderId}/claim?error=` +
                    encodeURIComponent(`'${target.product_name}' 은(는) 이미 처리되었습니다.`));
            }
            items = [{ orderItemId: rawItemId, quantity: target.remaining_qty }];
        }

        const result = await claimService.requestClaim({
            orderId: Number(orderId),
            userId,
            claimType,
            reasonType: reasonType || 'CHANGE_OF_MIND',
            reasonDetail: reason,
            requestedBy: 'CUSTOMER',
            mallId: req.mallId || 1,
            items,
        });

        if (!result.ok) {
            // 신청 화면으로 되돌려 사유를 그 자리에서 보여 준다(주문 상세로 튕기면 다시 들어와야 한다).
            return res.redirect(`/mypage/orders/${orderId}/claim?error=` + encodeURIComponent(result.reason));
        }

        /*
         * 접수 안내 메일(고객 + 운영자). 문구·발송여부는 관리자 > 이메일 템플릿 관리에서 정한다.
         * 실패해도 취소 흐름을 막지 않는다.
         */
        orderMailer.notifyClaimRequested({
            orderId: Number(orderId),
            claimType,
            reasonType: reasonType || 'CHANGE_OF_MIND',
            reasonDetail: reason,
            autoApproved: Boolean(result.autoApproved),
        }).catch((err) => console.error('[mail] 클레임 접수 안내 실패:', err.message));

        // 문자·알림톡 — 설정이 없으면 조용히 건너뛴다.
        require('../services/notify/claimNotifier')
            .notifyRequested({ orderId: Number(orderId), claimType, autoApproved: Boolean(result.autoApproved) })
            .catch((err) => console.error('[sms] 클레임 접수 안내 실패:', err.message));

        const msg = result.autoApproved
            ? 'cancel_done'
            : (claimType === 'EXCHANGE' ? 'exchange_requested' : (claimType === 'RETURN' ? 'return_requested' : 'cancel_requested'));
        res.redirect(`/mypage/orders/${orderId}?claim=${msg}`);
    } catch (err) {
        next(err);
    }
};

// 회원탈퇴 페이지
exports.getWithdraw = async (req, res, next) => {
    try {
        const now = Date.now();
        const verifiedAt = req.session.identity_verified_at || 0;
        const identityVerified = !!(req.session.identity_verified && (now - verifiedAt) < 15 * 60 * 1000);

        res.render('user/mypage/withdraw', {
            layout: 'layouts/main_layout',
            title: '회원탈퇴',
            identityVerified,
            reauthRequired: req.query.reauth === 'required'
        });
    } catch (err) {
        next(err);
    }
};

// 회원탈퇴 처리
exports.postWithdraw = async (req, res, next) => {
    try {
        const now = Date.now();
        const verifiedAt = req.session.identity_verified_at || 0;
        const identityVerified = !!(req.session.identity_verified && (now - verifiedAt) < 15 * 60 * 1000);

        if (!identityVerified) {
            return res.redirect('/mypage/withdraw?reauth=required');
        }

        const userId = req.user.id;
        const reason = req.body.reason || null;

        // 소프트 삭제: is_active=0 + 개인정보 마스킹 + 탈퇴사유 저장
        await pool.query(
            `UPDATE users SET
                is_active = 0,
                withdraw_reason = ?,
                withdrawn_at = NOW(),
                name = '탈퇴회원',
                email = CONCAT('withdrawn_', id, '@deleted.com'),
                phone = NULL,
                address = NULL,
                detailed_address = NULL,
                zipcode = NULL,
                picture = NULL,
                birthdate = NULL,
                google_id = NULL,
                kakao_id = NULL,
                marketing_agreed = 0
            WHERE id = ?`,
            [reason, userId]
        );

        // 세션 정리 및 로그아웃
        delete req.session.identity_verified;
        delete req.session.identity_verified_at;

        req.logout(function (err) {
            if (err) return next(err);
            req.session.destroy(function () {
                res.redirect('/?withdrawn=1');
            });
        });
    } catch (err) {
        next(err);
    }
};
