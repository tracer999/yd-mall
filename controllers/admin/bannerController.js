const pool = require('../../config/db');
const upload = require('../../middleware/upload');
const menuShowcaseService = require('../../services/menu/menuShowcaseService');

/*
 * 메뉴별 배너
 *
 * 스키마 변경 없이 group_key 를 재사용해 관리한다.
 *   저장 형태: banner_type='CATEGORY', category_id=NULL, group_key='menu:{feature_code}'
 *   → 기존 프론트 경로(MAIN 히어로·CATEGORY/BRAND 매칭·POPUP)에는 걸리지 않고,
 *     middleware/menuShowcase 가 경로로 메뉴를 판별해 상단 캐러셀로 렌더한다.
 *
 * 대상 목록은 **feature_menu 에서 동적으로** 읽는다(예전엔 BEST/NEW/DEAL 3개가 하드코딩돼
 * 실제 GNB 메뉴와 어긋났다). key 는 feature_menu.feature_code 다.
 *
 * 켜져 있는 GNB 메뉴는 **전부** 배너 대상이다. 예전에는 상품형 메뉴(쇼핑특가·베스트·신상품)를
 * 뺐는데, 상품그룹이 걸린 메뉴에서 배너가 조회조차 되지 않았기 때문이다. 이제 배너와 상품
 * 캐러셀은 공존하므로(배너가 위) 그 메뉴들도 배너를 걸 수 있다.
 */

/** 배너를 걸 수 있는 메뉴 = 켜져 있는 GNB 메뉴 전부 */
async function getBannerMenuTargets(mallId = 1) {
    return menuShowcaseService.getMenuTargets(mallId);
}

/** 메뉴별 배너 등록 건수 — 서브탭에 표시해 어디에 배너가 있는지 한눈에 보이게 한다. */
async function getMenuBannerCounts() {
    const [rows] = await pool.query(`
        SELECT group_key, COUNT(*) AS cnt
        FROM banners
        WHERE group_key LIKE 'menu:%'
        GROUP BY group_key
    `);
    const counts = {};
    for (const r of rows) counts[r.group_key.slice('menu:'.length)] = Number(r.cnt);
    return counts;
}

let hasMobileImageColumnCache = null;

async function hasMobileImageColumn() {
    if (hasMobileImageColumnCache !== null) return hasMobileImageColumnCache;
    try {
        const [rows] = await pool.query(`
            SELECT COUNT(*) AS count
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'banners'
              AND COLUMN_NAME = 'mobile_image_url'
        `);
        hasMobileImageColumnCache = !!rows[0]?.count;
    } catch (err) {
        hasMobileImageColumnCache = false;
    }
    return hasMobileImageColumnCache;
}

exports.getList = async (req, res) => {
    try {
        const mallId = req.mallId || 1;
        const type = req.query.type || 'MAIN';
        const menuTargets = await getBannerMenuTargets(mallId);

        let banners;
        let currentMenuKey = '';
        let menuBannerCounts = {};
        let menuProductGroup = null;

        if (type === 'MENU') {
            // 메뉴별 탭은 메뉴 하나를 골라 그 메뉴의 배너만 보여준다(서브탭). 기본은 첫 메뉴.
            const requested = req.query.menu;
            currentMenuKey = menuTargets.some(t => t.key === requested)
                ? requested
                : (menuTargets[0]?.key || '');
            menuBannerCounts = await getMenuBannerCounts();

            // 이 메뉴에 상품 캐러셀도 걸려 있는지 — 배너는 그 위에 함께 노출된다는 안내를 위해.
            if (currentMenuKey) {
                menuProductGroup = await menuShowcaseService.getProductGroupForMenu(mallId, currentMenuKey);
            }

            [banners] = currentMenuKey
                ? await pool.query(`
                    SELECT b.*, c.name AS category_name
                    FROM banners b
                    LEFT JOIN categories c ON b.category_id = c.id
                    WHERE b.group_key = ?
                    ORDER BY b.display_order ASC, b.created_at DESC
                `, [`menu:${currentMenuKey}`])
                : [[]];
        } else {
            // 일반 타입 배너에는 메뉴별 배너(group_key='menu:%')가 섞이지 않도록 제외한다.
            [banners] = await pool.query(`
                SELECT b.*, c.name AS category_name
                FROM banners b
                LEFT JOIN categories c ON b.category_id = c.id
                WHERE b.banner_type = ? AND (b.group_key IS NULL OR b.group_key NOT LIKE 'menu:%')
                ORDER BY b.display_order ASC, b.created_at DESC
            `, [type]);
        }

        res.render('admin/banners/list', {
            layout: 'layouts/admin_layout',
            title: '배너 관리',
            banners,
            currentType: type,
            currentMenuKey,
            menuTargets,
            menuBannerCounts,
            menuProductGroup
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getAdd = async (req, res) => {
    try {
        const type = req.query.type || 'MAIN';
        const menuTargets = await getBannerMenuTargets(req.mallId || 1);
        // 목록의 메뉴 서브탭에서 '배너 등록'을 누르면 그 메뉴가 골라진 채로 열린다.
        const requested = req.query.menu;
        const currentMenuKey = menuTargets.some(t => t.key === requested) ? requested : '';

        const [categories] = await pool.query('SELECT id, name, type FROM categories ORDER BY display_order ASC, id ASC');
        res.render('admin/banners/form', {
            layout: 'layouts/admin_layout',
            title: '배너 등록',
            banner: null,
            categories,
            currentType: type,
            menuTargets,
            currentMenuKey,
            maxUploadFileMb: upload.MAX_UPLOAD_FILE_MB
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postAdd = async (req, res) => {
    const { title, link_url, display_order, is_active, banner_type, category_id, start_date, end_date } = req.body;
    const bannerImage = req.files?.banner_image?.[0];
    const mobileBannerImage = req.files?.mobile_banner_image?.[0];
    const image_url = bannerImage ? '/uploads/banners/' + bannerImage.filename : null;
    const mobile_image_url = mobileBannerImage ? '/uploads/banners/' + mobileBannerImage.filename : null;

    try {
        // 신규 등록 — 보존할 기존 group_key 없음(null).
        const menuKeys = (await getBannerMenuTargets(req.mallId || 1)).map(t => t.key);
        const { storedType, categoryId, groupKey, redirectType, menuKey } =
            resolveBannerTarget(banner_type, category_id, req.body.menu_target, null, menuKeys);

        if (await hasMobileImageColumn()) {
            await pool.query(
                `INSERT INTO banners (banner_type, category_id, group_key, title, image_url, mobile_image_url, link_url, display_order, is_active, start_date, end_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    storedType, categoryId, groupKey, title, image_url, mobile_image_url, link_url,
                    display_order || 0, is_active ? 1 : 0, start_date || null, end_date || null
                ]
            );
        } else {
            await pool.query(
                `INSERT INTO banners (banner_type, category_id, group_key, title, image_url, link_url, display_order, is_active, start_date, end_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    storedType, categoryId, groupKey, title, image_url, link_url,
                    display_order || 0, is_active ? 1 : 0, start_date || null, end_date || null
                ]
            );
        }
        res.redirect(listUrl(redirectType, menuKey));
    } catch (err) {
        console.error(err);
        if (err.statusCode === 400) return res.status(400).send(err.message);
        res.status(500).send(`Banner save failed${err.code ? `: ${err.code}` : ''}`);
    }
};

/*
 * 폼의 banner_type → 실제 저장값을 정한다.
 * MENU 는 스키마 변경을 피하려 banner_type='CATEGORY' + category_id=NULL + group_key='menu:{key}' 로 저장한다.
 *
 * ⚠️ 비-MENU 타입은 group_key 를 **보존**한다. 이 화면과 무관한 group_key(예: 홈 프로모션 섹션이
 *    소비하는 'home_promo')를 가진 배너를 편집할 때 null 로 덮어쓰면 라이브 배너가 사라진다.
 *    단 'menu:' 네임스페이스는 메뉴별 배너 전용이므로, 일반 타입으로 전환되면 제거한다.
 */
function resolveBannerTarget(bannerType, categoryIdRaw, menuTarget, existingGroupKey, menuKeys = []) {
    if (bannerType === 'MENU') {
        // 목록에 없는 키는 저장하지 않는다 — 노출될 곳이 없는 배너가 생긴다.
        if (!menuKeys.includes(menuTarget)) {
            const err = new Error('메뉴 배너 대상이 올바르지 않습니다.');
            err.statusCode = 400;
            throw err;
        }
        return {
            storedType: 'CATEGORY', categoryId: null, groupKey: `menu:${menuTarget}`,
            redirectType: 'MENU', menuKey: menuTarget
        };
    }
    const type = ['MAIN', 'CATEGORY', 'POPUP', 'BRAND'].includes(bannerType) ? bannerType : 'MAIN';
    const categoryId = (type === 'CATEGORY' || type === 'BRAND') && categoryIdRaw ? Number(categoryIdRaw) || null : null;
    const groupKey = existingGroupKey && !String(existingGroupKey).startsWith('menu:') ? existingGroupKey : null;
    return { storedType: type, categoryId, groupKey, redirectType: type, menuKey: '' };
}

/** 저장 후 돌아갈 목록 URL — 메뉴별 배너는 방금 편집한 메뉴 서브탭으로 되돌린다. */
function listUrl(redirectType, menuKey) {
    return redirectType === 'MENU' && menuKey
        ? `/admin/banners?type=MENU&menu=${encodeURIComponent(menuKey)}`
        : `/admin/banners?type=${redirectType}`;
}

exports.getEdit = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query(`
            SELECT b.*, c.name AS category_name 
            FROM banners b 
            LEFT JOIN categories c ON b.category_id = c.id 
            WHERE b.id = ?
        `, [id]);

        if (rows.length === 0) return res.redirect('/admin/banners');

        const banner = rows[0];
        // 메뉴별 배너(group_key='menu:%')는 폼에서 'MENU' 타입으로 다룬다.
        const isMenuBanner = banner.group_key && banner.group_key.startsWith('menu:');
        const currentMenuKey = isMenuBanner ? banner.group_key.slice('menu:'.length) : '';

        const [categories] = await pool.query('SELECT id, name, type FROM categories ORDER BY display_order ASC, id ASC');
        res.render('admin/banners/form', {
            layout: 'layouts/admin_layout',
            title: '배너 수정',
            categories,
            banner,
            currentType: isMenuBanner ? 'MENU' : banner.banner_type,
            menuTargets: await getBannerMenuTargets(req.mallId || 1),
            currentMenuKey,
            maxUploadFileMb: upload.MAX_UPLOAD_FILE_MB
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postEdit = async (req, res) => {
    const { id } = req.params;
    const { title, link_url, display_order, is_active, banner_type, category_id, start_date, end_date } = req.body;
    let image_url = req.body.existing_image;
    let mobile_image_url = req.body.existing_mobile_image || null;
    const bannerImage = req.files?.banner_image?.[0];
    const mobileBannerImage = req.files?.mobile_banner_image?.[0];

    if (bannerImage) {
        image_url = '/uploads/banners/' + bannerImage.filename;
    }
    if (mobileBannerImage) {
        mobile_image_url = '/uploads/banners/' + mobileBannerImage.filename;
    }

    try {
        // 편집 — 기존 group_key(existing_group_key)를 넘겨 이 화면과 무관한 group_key 를 보존한다.
        const menuKeys = (await getBannerMenuTargets(req.mallId || 1)).map(t => t.key);
        const { storedType, categoryId, groupKey, redirectType, menuKey } =
            resolveBannerTarget(banner_type, category_id, req.body.menu_target, req.body.existing_group_key, menuKeys);

        if (await hasMobileImageColumn()) {
            await pool.query(`
                UPDATE banners SET
                banner_type=?, category_id=?, group_key=?, title=?, image_url=?, mobile_image_url=?, link_url=?, display_order=?, is_active=?, start_date=?, end_date=?
                WHERE id=?
            `, [
                storedType, categoryId, groupKey, title, image_url, mobile_image_url, link_url, display_order || 0, is_active ? 1 : 0, start_date || null, end_date || null, id
            ]);
        } else {
            await pool.query(`
                UPDATE banners SET
                banner_type=?, category_id=?, group_key=?, title=?, image_url=?, link_url=?, display_order=?, is_active=?, start_date=?, end_date=?
                WHERE id=?
            `, [
                storedType, categoryId, groupKey, title, image_url, link_url, display_order || 0, is_active ? 1 : 0, start_date || null, end_date || null, id
            ]);
        }
        res.redirect(listUrl(redirectType, menuKey));
    } catch (err) {
        console.error(err);
        if (err.statusCode === 400) return res.status(400).send(err.message);
        res.status(500).send(`Banner update failed${err.code ? `: ${err.code}` : ''}`);
    }
};

exports.postDelete = async (req, res) => {
    const { id } = req.body;
    try {
        await pool.query('DELETE FROM banners WHERE id = ?', [id]);
        // 보던 탭으로 되돌린다. 외부 URL 로 튕기지 않도록 배너 목록 경로만 허용한다.
        const back = String(req.body.return_to || '');
        res.redirect(back.startsWith('/admin/banners') ? back : '/admin/banners');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
