const pool = require('../../config/db');
const upload = require('../../middleware/upload');

/*
 * 메뉴별 배너 대상 (파트2 틀)
 *
 * "메뉴별 배너"는 스키마 변경 없이 group_key 를 재사용해 관리한다.
 *   저장 형태: banner_type='CATEGORY', category_id=NULL, group_key='menu:{key}'
 *   → 기존 프론트 경로(MAIN 히어로·CATEGORY/BRAND 매칭·POPUP)에는 걸리지 않고,
 *     productController 의 menuBanner 훅(group_key='menu:{key}')에서만 소비된다.
 *
 * key 는 routes/feature.js 의 preset({ menuKey }) 및 productController 와 1:1 로 맞춘다.
 * 새 메뉴에 배너를 붙이려면 이 목록 + routes/feature.js preset 두 곳만 추가하면 된다.
 */
const MENU_BANNER_TARGETS = [
    { key: 'BEST', label: '베스트 (/best)' },
    { key: 'NEW', label: '신상품 (/new)' },
    { key: 'DEAL', label: '쇼핑특가 (/deals)' },
];
const MENU_KEYS = MENU_BANNER_TARGETS.map(t => t.key);
exports.MENU_BANNER_TARGETS = MENU_BANNER_TARGETS;

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
        const type = req.query.type || 'MAIN';
        let banners;
        if (type === 'MENU') {
            // 메뉴별 배너는 group_key='menu:%' 로 식별한다 (banner_type 무시).
            [banners] = await pool.query(`
                SELECT b.*, c.name AS category_name
                FROM banners b
                LEFT JOIN categories c ON b.category_id = c.id
                WHERE b.group_key LIKE 'menu:%'
                ORDER BY b.group_key ASC, b.display_order ASC, b.created_at DESC
            `);
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
            menuTargets: MENU_BANNER_TARGETS
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getAdd = async (req, res) => {
    try {
        const type = req.query.type || 'MAIN';
        const [categories] = await pool.query('SELECT id, name, type FROM categories ORDER BY display_order ASC, id ASC');
        res.render('admin/banners/form', {
            layout: 'layouts/admin_layout',
            title: '배너 등록',
            banner: null,
            categories,
            currentType: type,
            menuTargets: MENU_BANNER_TARGETS,
            currentMenuKey: '',
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

    // 신규 등록 — 보존할 기존 group_key 없음(null).
    const { storedType, categoryId, groupKey, redirectType } = resolveBannerTarget(banner_type, category_id, req.body.menu_target, null);

    try {
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
        res.redirect(`/admin/banners?type=${redirectType}`);
    } catch (err) {
        console.error(err);
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
function resolveBannerTarget(bannerType, categoryIdRaw, menuTarget, existingGroupKey) {
    if (bannerType === 'MENU') {
        const key = MENU_KEYS.includes(menuTarget) ? menuTarget : MENU_KEYS[0];
        return { storedType: 'CATEGORY', categoryId: null, groupKey: `menu:${key}`, redirectType: 'MENU' };
    }
    const type = ['MAIN', 'CATEGORY', 'POPUP', 'BRAND'].includes(bannerType) ? bannerType : 'MAIN';
    const categoryId = (type === 'CATEGORY' || type === 'BRAND') && categoryIdRaw ? Number(categoryIdRaw) || null : null;
    const groupKey = existingGroupKey && !String(existingGroupKey).startsWith('menu:') ? existingGroupKey : null;
    return { storedType: type, categoryId, groupKey, redirectType: type };
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
            menuTargets: MENU_BANNER_TARGETS,
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

    // 편집 — 기존 group_key(existing_group_key)를 넘겨 이 화면과 무관한 group_key 를 보존한다.
    const { storedType, categoryId, groupKey, redirectType } = resolveBannerTarget(banner_type, category_id, req.body.menu_target, req.body.existing_group_key);

    try {
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
        res.redirect(`/admin/banners?type=${redirectType}`);
    } catch (err) {
        console.error(err);
        res.status(500).send(`Banner update failed${err.code ? `: ${err.code}` : ''}`);
    }
};

exports.postDelete = async (req, res) => {
    const { id } = req.body;
    try {
        await pool.query('DELETE FROM banners WHERE id = ?', [id]);
        res.redirect('/admin/banners');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
