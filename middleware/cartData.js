const pool = require('../config/db');

/*
 * 장바구니 수량 + 우측레일 바로가기 배지 카운트.
 *
 * 이 미들웨어는 **모든 페이지**에서 돈다. 그래서 항목마다 쿼리를 나누지 않고
 * 스칼라 서브쿼리 하나로 묶는다(로그인 사용자 기준 요청당 1회).
 *
 * ⚠️ 배지는 목적지 화면과 **같은 조건**으로 세야 한다. 숫자가 다르면 배지가 거짓말을 한다.
 *   - 찜   : 찜 화면(/mypage/likes)이 상품·브랜드 두 탭을 함께 보여주므로 **둘의 합**이다.
 *           각 탭의 조회 조건(getLikes 의 status 필터 / queryLikedBrands 의 type='BRAND' 조인)을
 *           그대로 따라간다 — 화면에 안 나오는 행을 세면 탭 라벨의 개수와 어긋난다.
 *   - 주문 : mypageController.getOrders 는 기본 필터가 없다 → 전체 건수
 *   - 장바구니: 수량 합계(헤더 배지가 예전부터 쓰던 값)
 *
 * res.locals.railCounts 는 featureCode 를 키로 쓴다 — 레일 파셜(PC·모바일)이
 * 코드별 if 분기 없이 "값이 있으면 배지"로 일반화할 수 있도록.
 */
const EMPTY_COUNTS = Object.freeze({ RAIL_CART: 0, RAIL_WISHLIST: 0, RAIL_ORDERS: 0 });

module.exports = async (req, res, next) => {
    if (!req.user) {
        res.locals.cartCount = 0;
        res.locals.railCounts = EMPTY_COUNTS;
        return next();
    }

    try {
        const [[row]] = await pool.query(`
            SELECT
                (SELECT COALESCE(SUM(quantity), 0) FROM carts WHERE user_id = ?) AS cartCount,
                (SELECT COUNT(*)
                   FROM likes l
                   JOIN products p ON p.id = l.product_id
                  WHERE l.user_id = ? AND p.status IN ('ON','SOLD_OUT','COMING_SOON'))
              + (SELECT COUNT(*)
                   FROM brand_likes bl
                   JOIN categories c ON c.id = bl.category_id AND c.type = 'BRAND'
                  WHERE bl.user_id = ?) AS wishlistCount,
                (SELECT COUNT(*) FROM orders WHERE user_id = ?) AS orderCount
        `, [req.user.id, req.user.id, req.user.id, req.user.id]);

        const cart = Number(row.cartCount) || 0;
        res.locals.cartCount = cart;
        res.locals.railCounts = {
            RAIL_CART: cart,
            RAIL_WISHLIST: Number(row.wishlistCount) || 0,
            RAIL_ORDERS: Number(row.orderCount) || 0,
        };
        next();
    } catch (err) {
        console.error('Cart Middleware Error:', err);
        res.locals.cartCount = 0;
        res.locals.railCounts = EMPTY_COUNTS;
        next();
    }
};
