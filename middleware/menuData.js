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

/**
 * navigationService 결과 항목 → 뷰가 쓰는 공통 형태
 *
 * children 은 unified(소형몰) GNB 에서만 채워진다 — 카테고리 1뎁스가 GNB 항목이 되고
 * 2·3뎁스가 드롭다운으로 달린다. split(대형몰)에선 항상 빈 배열이라 기존 뷰가 그대로 돈다.
 * 예전엔 여기서 children 을 통째로 버려서 하위 뎁스를 표현할 수단이 없었다.
 */
function toViewItem(item) {
    return {
        name: item.name,
        href: item.path || '#',
        kind: item.kind || 'feature',   // 'feature' | 'custom' | 'category'
        featureCode: item.featureCode || null,
        categoryId: item.categoryId || null,
        isCustom: Boolean(item.isCustom),
        newWindow: Boolean(item.newWindow),
        // NEW / HOT / SALE (navigationService 가 화이트리스트로 정규화함). 없으면 null
        badgeType: item.badgeType || null,
        pcVisible: item.pcVisible === undefined ? 1 : Number(item.pcVisible),
        mobileVisible: item.mobileVisible === undefined ? 1 : Number(item.mobileVisible),
        children: (item.children || []).map(toViewItem),
        // 레거시 뷰 호환: 고정 항목 필터에 사용되던 필드
        is_fixed: 0,
    };
}

/*
 * 내비게이션을 조립해 res.locals 에 싣는다.
 *
 * 미들웨어와 분리한 이유: 관리자 미리보기는 **미들웨어가 다 돈 뒤에** 편집 몰(adminMallId)로
 * 스코프를 바꾼다. 그때 이미 실려 있는 res.locals 는 기본 몰 기준이라, 종합관을 편집해도
 * 헤더 GNB 는 건강식품관 것이 나왔다. 컨트롤러가 몰을 확정한 뒤 이 함수를 다시 부르면 맞춰진다.
 */
async function applyNavigation(req, res, mallId) {
    const targetMallId = mallId || req.mallId || MALL_ID;

    try {
        const nav = await navigationService.getNavigation(targetMallId, {
            isLoggedIn: Boolean(req.user),
        });

        res.locals.nav = nav;
        res.locals.gnbMenus = nav.gnb.map(toViewItem);
        res.locals.categoryButton = nav.categoryButton ? { name: nav.categoryButton.name } : null;
        res.locals.rightRailMenus = nav.rightRail.map(toViewItem);
        res.locals.headerUtilMenus = nav.headerUtil.map(toViewItem);
        res.locals.categoryTree = nav.categoryTree;

        // THEME 카테고리 (레거시 하위호환) — 몰 스코프
        const [themeCategories] = await pool.query(
            "SELECT * FROM categories WHERE type = 'THEME' AND mall_id = ? ORDER BY display_order ASC", [targetMallId]
        );
        res.locals.menuCategories = themeCategories;
    } catch (err) {
        console.error('Menu Middleware Error:', err);
        res.locals.nav = null;
        res.locals.gnbMenus = [];
        res.locals.categoryButton = { name: '카테고리' }; // 골격은 유지
        res.locals.rightRailMenus = [];
        res.locals.headerUtilMenus = [];
        res.locals.categoryTree = [];
        res.locals.menuCategories = [];
    }
}

module.exports = async (req, res, next) => {
    res.locals.currentPath = req.path;
    await applyNavigation(req, res, req.mallId || MALL_ID);
    next();
};

module.exports.applyNavigation = applyNavigation;
