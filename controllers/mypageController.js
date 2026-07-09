const pool = require('../config/db');
const bcrypt = require('bcrypt');
const emailService = require('../services/emailService');

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

        // 3. 보유 쿠폰 수 조회
        const [[{ coupon_count }]] = await pool.query(
            `SELECT COUNT(*) as coupon_count
             FROM user_coupons uc
             JOIN coupons c ON uc.coupon_id = c.id
             WHERE uc.user_id = ? AND uc.used_at IS NULL AND (c.expires_at IS NULL OR c.expires_at > NOW())`,
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

        res.render('user/mypage/dashboard', {
            title: '마이페이지',
            user: req.user,
            recentOrders,
            stats,
            recentActivities,
            couponCount: coupon_count,
            pointsBalance,
            likesCount: likes_count,
            recentViewedCount
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

        // 전체 주문 수 조회
        const [[{ count }]] = await pool.query(
            'SELECT COUNT(*) as count FROM orders WHERE user_id = ?',
            [userId]
        );

        const totalPages = Math.ceil(count / limit);

        // 주문 목록 조회 (대표 상품명, 아이템 개수 포함)
        const [orders] = await pool.query(
            `SELECT o.*,
                    (SELECT product_name FROM order_items WHERE order_id = o.id ORDER BY id ASC LIMIT 1) as first_product_name,
                    (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
             FROM orders o
             WHERE o.user_id = ?
             ORDER BY o.created_at DESC
             LIMIT ? OFFSET ?`,
            [userId, limit, offset]
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
            totalOrders: count
        });
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

        res.render('user/mypage/order_detail', {
            title: '주문 상세',
            order,
            items,
            shipment: shipments[0] || null
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

        const [coupons] = await pool.query(
            `SELECT
                c.name,
                c.type,
                c.discount_amount,
                c.min_purchase,
                c.expires_at,
                uc.used_at
             FROM user_coupons uc
             JOIN coupons c ON uc.coupon_id = c.id
             WHERE uc.user_id = ?
             ORDER BY uc.used_at ASC, c.expires_at ASC, uc.created_at DESC`,
            [userId]
        ).catch(() => [[]]); // 쿠폰 관련 테이블이 없을 경우를 대비

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
                p.main_image, p.stock, p.status, p.provider,
                p.discount_rate, p.product_badge, p.distribution_badge
             FROM likes l
             JOIN products p ON l.product_id = p.id
             WHERE l.user_id = ? AND p.status IN ('ON','SOLD_OUT','COMING_SOON')
             ORDER BY l.created_at DESC`,
            [userId]
        );

        res.render('user/mypage/likes', {
            title: '관심 상품',
            likedProducts
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
                    p.main_image, p.stock, p.status, p.provider,
                    p.discount_rate, p.product_badge, p.distribution_badge,
                    rv.viewed_at
             FROM recent_views rv
             JOIN products p ON rv.product_id = p.id
             WHERE rv.user_id = ? AND rv.viewed_at >= DATE_SUB(NOW(), INTERVAL 15 DAY)
               AND p.status IN ('ON','SOLD_OUT','COMING_SOON')
             ORDER BY rv.viewed_at DESC`,
            [userId]
        );

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

exports.cancelOrder = async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const userId = req.user.id;
        const orderId = req.params.id;
        const { reason } = req.body;

        // 주문 조회 및 상태 확인 (Lock)
        const [orders] = await connection.query(
            'SELECT status, buyer_email FROM orders WHERE id = ? AND user_id = ? FOR UPDATE',
            [orderId, userId]
        );

        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).send('주문을 찾을 수 없습니다.');
        }

        const order = orders[0];
        if (order.status !== 'PENDING' && order.status !== 'PAID') {
            await connection.rollback();
            return res.status(400).send('취소할 수 없는 주문 상태입니다.');
        }

        await connection.query(
            'UPDATE orders SET status = ?, cancel_reason = ? WHERE id = ?',
            ['CANCELLED', reason, orderId]
        );

        await connection.commit();

        // 관리자에게 취소 알림 이메일 발송
        const adminEmail = process.env.ADMIN_EMAIL;
        if (adminEmail) {
            emailService.sendEmail({
                to: adminEmail,
                subject: `[주문취소] 주문번호 ${orderId} 취소 알림`,
                text: `주문번호: ${orderId}\n취소사유: ${reason}\n사용자ID: ${userId}\n일시: ${new Date().toLocaleString()}`
            }).catch(err => console.error('관리자 알림 이메일 발송 실패:', err));
        }

        // 사용자에게 취소 알림 이메일 발송
        const userEmail = order.buyer_email || req.user.email;
        if (userEmail) {
            emailService.sendEmail({
                to: userEmail,
                subject: `[와이디몰] 주문번호 ${orderId} 취소가 완료되었습니다.`,
                text: `안녕하세요.\n주문번호 ${orderId}의 주문 취소가 정상적으로 처리되었습니다.\n\n취소사유: ${reason}\n\n이용해 주셔서 감사합니다.`
            }).catch(err => console.error('사용자 취소 알림 이메일 발송 실패:', err));
        }

        res.redirect(`/mypage/orders/${orderId}`);
    } catch (err) {
        await connection.rollback();
        next(err);
    } finally {
        connection.release();
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
