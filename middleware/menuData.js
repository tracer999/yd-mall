const pool = require('../config/db');
const navigationService = require('../services/menu/navigationService');

/*
 * 내비게이션 주입 미들웨어 (M5 — navigationService 기반)
 *
 * 주입되는 res.locals:
 *   nav               위치별 조립 결과 전체
 *   categoryButton    GNB 고정 카테고리 버튼(없으면 null → 버튼 미노출)
 *   gnbMenus          GNB 기능 메뉴 + 커스텀 슬롯 (골격=코드, 항목=데이터)
 *   rightRailMenus    우측 유틸 레일 항목
 *   headerUtilMenus   헤더 우측 유틸 항목
 *   categoryTree      NORMAL 카테고리 트리 (최대 뎁스 이내)
 *   menuCategories    THEME 카테고리 (레거시 하위호환)
 *   currentPath       활성 메뉴 밑줄 표시용
 *
 * 레거시 storefront_menu 폴백은 M7에서 제거했다(테이블 DROP).
 * 조회 실패 시에는 골격만 유지한 채 빈 메뉴로 렌더한다(화면이 깨지지 않도록).
 */

const MALL_ID = 1;

/** navigationService 결과 항목 → 뷰가 쓰는 공통 형태 */
function toViewItem(item) {
    return {
        name: item.name,
        href: item.path || '#',
        featureCode: item.featureCode || null,
        isCustom: Boolean(item.isCustom),
        newWindow: Boolean(item.newWindow),
        pcVisible: item.pcVisible === undefined ? 1 : Number(item.pcVisible),
        mobileVisible: item.mobileVisible === undefined ? 1 : Number(item.mobileVisible),
        // 레거시 뷰 호환: 고정 항목 필터에 사용되던 필드
        is_fixed: 0,
    };
}

module.exports = async (req, res, next) => {
    res.locals.currentPath = req.path;

    try {
        const nav = await navigationService.getNavigation(MALL_ID, {
            isLoggedIn: Boolean(req.user),
        });

        res.locals.nav = nav;
        res.locals.gnbMenus = nav.gnb.map(toViewItem);
        res.locals.categoryButton = nav.categoryButton ? { name: nav.categoryButton.name } : null;
        res.locals.rightRailMenus = nav.rightRail.map(toViewItem);
        res.locals.headerUtilMenus = nav.headerUtil.map(toViewItem);
        res.locals.categoryTree = nav.categoryTree;

        // THEME 카테고리 (레거시 하위호환)
        const [themeCategories] = await pool.query(
            "SELECT * FROM categories WHERE type = 'THEME' ORDER BY display_order ASC"
        );
        res.locals.menuCategories = themeCategories;

        next();
    } catch (err) {
        console.error('Menu Middleware Error:', err);
        res.locals.nav = null;
        res.locals.gnbMenus = [];
        res.locals.categoryButton = { name: '카테고리' }; // 골격은 유지
        res.locals.rightRailMenus = [];
        res.locals.headerUtilMenus = [];
        res.locals.categoryTree = [];
        res.locals.menuCategories = [];
        next();
    }
};
