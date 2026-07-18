const pool = require('../../config/db');
const upload = require('../../middleware/upload');
const menuShowcaseService = require('../../services/menu/menuShowcaseService');
const topbarService = require('../../services/display/topbarService');
const { visibleCategoryIdSet } = require('../../services/catalog/categoryScope');

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

/*
 * 메인 히어로 배너(banner_type='MAIN')는 이제 '메인 슬라이더' 화면이 관장한다.
 * 그 화면에서 상품 쇼케이스 방식과 함께 하나의 탭으로 다루므로, 옛 진입점은 그리로 넘긴다.
 */
const HERO_LIST_URL = '/admin/banners/hero-slides?mode=full_banner';

exports.getList = async (req, res) => {
    try {
        const mallId = req.adminMallId || 1;
        // type 없이 들어온 경우(사이드바 '배너 관리')는 mode 를 지정하지 않는다 —
        // 그래야 메인 슬라이더 화면이 '적용 중'인 방식으로 열린다. 옛 ?type=MAIN 링크만 배너 방식으로 보낸다.
        if (!req.query.type) return res.redirect('/admin/banners/hero-slides');
        const type = req.query.type;
        if (type === 'MAIN') return res.redirect(HERO_LIST_URL);
        // 카테고리·브랜드 배너는 '대상(카테고리/브랜드) 리스트' 화면으로 — 각 대상별 배너 적용 여부를 한눈에.
        if (type === 'CATEGORY' || type === 'BRAND') return renderTargetList(req, res, mallId, type);
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
            //
            // 몰 스코프: banners 테이블엔 mall_id 가 없다(전 몰 공용). CATEGORY·BRAND 배너는 대상
            // 카테고리/브랜드로 몰이 정해지므로 조인한 categories.mall_id 로 좁힌다. 단 카테고리·브랜드가
            // 글로벌화되어(글로벌 마스터 mall_id=0 + 몰별 mall_id) 존재하므로, 폼의 대상 드롭다운과 동일하게
            // mall_id IN (0, 현재몰) 을 본다 — 글로벌 대상에 걸린 개별 배너가 목록에서 사라지지 않게.
            // 전체 공통 배너는 category_id 가 NULL 이라 조인으로 몰을 못 잡으므로 group_key='common:{TYPE}:{mallId}'
            // 로 이 몰 것만 노출한다(타 몰 공통 배너가 섞이지 않게). POPUP 은 대상이 없어 전 몰 공용으로 둔다.
            const scopeByMall = (type === 'CATEGORY' || type === 'BRAND');
            const commonKey = commonGroupKey(type, mallId);
            [banners] = await pool.query(`
                SELECT b.*, c.name AS category_name
                FROM banners b
                LEFT JOIN categories c ON b.category_id = c.id
                WHERE b.banner_type = ? AND (b.group_key IS NULL OR b.group_key NOT LIKE 'menu:%')
                ${scopeByMall ? 'AND (c.mall_id IN (0, ?) OR b.group_key = ?)' : ''}
                ORDER BY b.display_order ASC, b.created_at DESC
            `, scopeByMall ? [type, mallId, commonKey] : [type]);
        }

        res.render('admin/banners/list', {
            layout: 'layouts/admin_layout',
            title: '배너 관리',
            targetMode: false,
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

/*
 * 카테고리·브랜드 배너 = 대상 리스트 화면.
 * 대상(카테고리 1뎁스 / 브랜드)을 나열하고 각 대상에 설정된 배너를 오른쪽 카드로 붙여
 * "어디에 배너가 걸렸는지"를 한눈에 보게 한다.
 *
 * 대상 집합 = mall_id IN (0, mallId) · type 일치 중에서
 *   (depth==1 AND 이 몰에 노출됨) OR (배너가 걸려 있음)
 * — 배너가 걸린 대상은 지금 상품이 없어 노출되지 않아도 반드시 보여야 관리(수정/삭제)가 가능하다.
 */
async function renderTargetList(req, res, mallId, type) {
    const isBrand = type === 'BRAND';
    const catType = isBrand ? 'BRAND' : 'NORMAL';

    // 이 몰의 모든 대상 후보(글로벌 마스터 mall 0 + 몰별)
    const [allTargets] = await pool.query(
        'SELECT id, name, depth, parent_id, display_order FROM categories WHERE mall_id IN (0, ?) AND type = ? ORDER BY display_order ASC, id ASC',
        [mallId, catType]
    );

    // 개별 배너 한방 조회(N+1 금지). menu:/common: 는 category_id 가 NULL 이라 자동 제외.
    const [indivBanners] = await pool.query(
        `SELECT * FROM banners
         WHERE banner_type = ? AND category_id IS NOT NULL
           AND (group_key IS NULL OR group_key NOT LIKE 'menu:%')
         ORDER BY display_order ASC, created_at DESC`,
        [type]
    );
    const bannersByCat = new Map();
    for (const b of indivBanners) {
        if (!bannersByCat.has(b.category_id)) bannersByCat.set(b.category_id, []);
        bannersByCat.get(b.category_id).push(b);
    }

    // 전체 공통 배너(상단 별도 노출)
    const commonKey = commonGroupKey(type, mallId);
    const [commonBanners] = await pool.query(
        'SELECT * FROM banners WHERE group_key = ? ORDER BY display_order ASC, created_at DESC',
        [commonKey]
    );

    // 이 몰에 노출되는(상품 있는) 대상 + 배너 걸린 대상은 무조건 포함
    const visible = await visibleCategoryIdSet(mallId, { brand: isBrand });
    const nameById = new Map(allTargets.map(t => [t.id, t.name]));
    let targets = allTargets
        .map(t => Object.assign({}, t, {
            banners: bannersByCat.get(t.id) || [],
            parentName: t.parent_id ? (nameById.get(t.parent_id) || '') : '',
        }))
        .filter(t => (t.depth === 1 && visible.has(t.id)) || t.banners.length > 0);

    const setCount = targets.filter(t => t.banners.length > 0).length;

    // 필터: all | set(설정됨) | unset(미설정)
    const statusFilter = ['set', 'unset'].includes(req.query.status) ? req.query.status : 'all';
    let filtered = targets;
    if (statusFilter === 'set') filtered = targets.filter(t => t.banners.length > 0);
    else if (statusFilter === 'unset') filtered = targets.filter(t => t.banners.length === 0);

    // 페이지네이션(브랜드는 몰에 따라 수백~수천 개 → 필수)
    const perPage = 40;
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    const page = Math.min(Math.max(1, Number.parseInt(req.query.page, 10) || 1), totalPages);
    const pageTargets = filtered.slice((page - 1) * perPage, page * perPage);

    res.render('admin/banners/list', {
        layout: 'layouts/admin_layout',
        title: '배너 관리',
        targetMode: true,
        currentType: type,
        targets: pageTargets,
        commonBanners,
        targetTotal: targets.length,
        targetSetCount: setCount,
        statusFilter,
        page,
        totalPages,
        // 공유 템플릿이 참조하는 변수들(대상 모드에선 미사용) 안전 기본값
        banners: [],
        currentMenuKey: '',
        menuTargets: [],
        menuBannerCounts: {},
        menuProductGroup: null,
    });
}

exports.getAdd = async (req, res) => {
    try {
        const type = req.query.type || 'MAIN';
        const menuTargets = await getBannerMenuTargets(req.adminMallId || 1);
        // 목록의 메뉴 서브탭에서 '배너 등록'을 누르면 그 메뉴가 골라진 채로 열린다.
        const requested = req.query.menu;
        const currentMenuKey = menuTargets.some(t => t.key === requested) ? requested : '';

        const [categories] = await pool.query(
            'SELECT id, name, type FROM categories WHERE mall_id IN (0, ?) ORDER BY display_order ASC, id ASC',
            [req.adminMallId || 1]
        );
        // 대상 리스트에서 '배너 등록'을 누르면 그 카테고리/브랜드가 골라진 채로(또는 공통 체크된 채로) 열린다.
        const preselectTarget = Number.parseInt(req.query.target, 10) || null;
        const preselectCommon = req.query.common === '1';
        res.render('admin/banners/form', {
            layout: 'layouts/admin_layout',
            title: '배너 등록',
            banner: null,
            categories,
            currentType: type,
            menuTargets,
            currentMenuKey,
            preselectTarget,
            preselectCommon,
            maxUploadFileMb: upload.MAX_UPLOAD_FILE_MB
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

/*
 * 배너 내 문구(오버레이) — 메인 슬라이더의 '이미지 배너 슬라이더' 방식에서만 뜻이 있다.
 * 이미지 위에 큰 제목 + 추가 문구(최대 2줄) + 이동 버튼을 얹는다(views/partials/sections/hero_banner.ejs).
 *
 * MAIN 이 아닌 타입에서는 저장하지 않는다 — 카테고리/팝업 배너에는 렌더할 자리가 없어서
 * 값만 남으면 나중에 "왜 안 나오지" 가 된다. 타입을 MAIN 에서 바꾸면 문구도 비워진다.
 */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const ALIGNS = ['LEFT', 'CENTER', 'RIGHT'];

function readOverlay(body, storedType) {
    if (storedType !== 'MAIN') {
        return { title: null, subtitle: null, buttonText: null, buttonColor: null, align: 'LEFT' };
    }
    const trim = (v, max) => {
        const s = String(v == null ? '' : v).trim();
        return s ? s.slice(0, max) : null;
    };
    // 추가 문구는 최대 2줄. 3줄째부터는 버려서 저장 시점에 규칙을 지킨다(뷰에서만 자르면 데이터가 거짓말한다).
    const subtitleRaw = String(body.overlay_subtitle || '').replace(/\r\n/g, '\n');
    const subtitle = subtitleRaw.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 2).join('\n') || null;

    const color = String(body.overlay_button_color || '').trim();
    return {
        title: trim(body.overlay_title, 120),
        subtitle: subtitle ? subtitle.slice(0, 200) : null,
        buttonText: trim(body.overlay_button_text, 40),
        buttonColor: HEX_COLOR.test(color) ? color.toLowerCase() : null,
        align: ALIGNS.includes(body.overlay_align) ? body.overlay_align : 'LEFT',
    };
}

exports.postAdd = async (req, res) => {
    const { title, link_url, display_order, is_active, banner_type, category_id, start_date, end_date } = req.body;
    const bannerImage = req.files?.banner_image?.[0];
    const mobileBannerImage = req.files?.mobile_banner_image?.[0];
    const image_url = bannerImage ? '/uploads/banners/' + bannerImage.filename : null;
    const mobile_image_url = mobileBannerImage ? '/uploads/banners/' + mobileBannerImage.filename : null;

    try {
        // 신규 등록 — 보존할 기존 group_key 없음(null).
        const mallId = req.adminMallId || 1;
        const menuKeys = (await getBannerMenuTargets(mallId)).map(t => t.key);
        const { storedType, categoryId, groupKey, redirectType, menuKey } =
            resolveBannerTarget(banner_type, category_id, req.body.menu_target, null, menuKeys, req.body.is_common === '1', mallId);
        const ov = readOverlay(req.body, banner_type);

        if (await hasMobileImageColumn()) {
            await pool.query(
                `INSERT INTO banners (banner_type, category_id, group_key, title, image_url, mobile_image_url, link_url, display_order, is_active, start_date, end_date,
                                      overlay_title, overlay_subtitle, overlay_button_text, overlay_button_color, overlay_align)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    storedType, categoryId, groupKey, title, image_url, mobile_image_url, link_url,
                    display_order || 0, is_active ? 1 : 0, start_date || null, end_date || null,
                    ov.title, ov.subtitle, ov.buttonText, ov.buttonColor, ov.align
                ]
            );
        } else {
            await pool.query(
                `INSERT INTO banners (banner_type, category_id, group_key, title, image_url, link_url, display_order, is_active, start_date, end_date,
                                      overlay_title, overlay_subtitle, overlay_button_text, overlay_button_color, overlay_align)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    storedType, categoryId, groupKey, title, image_url, link_url,
                    display_order || 0, is_active ? 1 : 0, start_date || null, end_date || null,
                    ov.title, ov.subtitle, ov.buttonText, ov.buttonColor, ov.align
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

/** 카테고리/브랜드 '전체 공통' 배너 group_key — menu 배너처럼 group_key 로 몰 스코프를 얻는다. */
function commonGroupKey(type, mallId) {
    return `common:${type}:${mallId}`;
}

/*
 * 폼의 banner_type → 실제 저장값을 정한다.
 * MENU 는 스키마 변경을 피하려 banner_type='CATEGORY' + category_id=NULL + group_key='menu:{key}' 로 저장한다.
 *
 * 카테고리/브랜드 '전체 공통' 배너도 같은 관용구다: banner_type 은 그대로(CATEGORY/BRAND),
 * category_id=NULL, group_key='common:{TYPE}:{mallId}'. 개별 대상이 없는 카테고리/브랜드 접근 시
 * 폴백으로 노출된다. banners 엔 mall_id 가 없어 group_key 로 몰을 구분한다.
 *
 * ⚠️ 비-MENU 타입은 group_key 를 **보존**한다. 이 화면과 무관한 group_key(예: 홈 프로모션 섹션이
 *    소비하는 'home_promo')를 가진 배너를 편집할 때 null 로 덮어쓰면 라이브 배너가 사라진다.
 *    단 'menu:'·'common:' 네임스페이스는 이 화면 전용이므로, 개별 대상으로 전환되면 제거한다.
 */
function resolveBannerTarget(bannerType, categoryIdRaw, menuTarget, existingGroupKey, menuKeys = [], isCommon = false, mallId = 1) {
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

    // 카테고리/브랜드 전체 공통 배너 — 개별 대상 대신 몰 전체 기본값.
    if ((type === 'CATEGORY' || type === 'BRAND') && isCommon) {
        return {
            storedType: type, categoryId: null, groupKey: commonGroupKey(type, mallId),
            redirectType: type, menuKey: ''
        };
    }

    const categoryId = (type === 'CATEGORY' || type === 'BRAND') && categoryIdRaw ? Number(categoryIdRaw) || null : null;

    // 개별 대상 저장 시 'menu:'·'common:' 키는 제거(전환 잔존 방지). 그 외(home_promo 등)는 보존.
    let groupKey = existingGroupKey || null;
    if (groupKey && (String(groupKey).startsWith('menu:') || String(groupKey).startsWith('common:'))) {
        groupKey = null;
    }

    // 개별 카테고리/브랜드 배너인데 대상 미선택 → 저장할 곳이 없다(공통이면 위에서 처리됨).
    if ((type === 'CATEGORY' || type === 'BRAND') && !categoryId) {
        const err = new Error('대상 카테고리/브랜드를 선택하거나 전체 공통으로 설정하세요.');
        err.statusCode = 400;
        throw err;
    }

    return { storedType: type, categoryId, groupKey, redirectType: type, menuKey: '' };
}

/** 저장 후 돌아갈 목록 URL — 메뉴별 배너는 방금 편집한 메뉴 서브탭으로, MAIN 은 메인 슬라이더 화면으로. */
function listUrl(redirectType, menuKey) {
    if (redirectType === 'MENU' && menuKey) {
        return `/admin/banners?type=MENU&menu=${encodeURIComponent(menuKey)}`;
    }
    if (redirectType === 'MAIN') return HERO_LIST_URL;
    return `/admin/banners?type=${redirectType}`;
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

        const [categories] = await pool.query(
            'SELECT id, name, type FROM categories WHERE mall_id IN (0, ?) ORDER BY display_order ASC, id ASC',
            [req.adminMallId || 1]
        );
        res.render('admin/banners/form', {
            layout: 'layouts/admin_layout',
            title: '배너 수정',
            categories,
            banner,
            currentType: isMenuBanner ? 'MENU' : banner.banner_type,
            menuTargets: await getBannerMenuTargets(req.adminMallId || 1),
            currentMenuKey,
            preselectTarget: null,
            preselectCommon: false,
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
        const mallId = req.adminMallId || 1;
        const menuKeys = (await getBannerMenuTargets(mallId)).map(t => t.key);
        const { storedType, categoryId, groupKey, redirectType, menuKey } =
            resolveBannerTarget(banner_type, category_id, req.body.menu_target, req.body.existing_group_key, menuKeys, req.body.is_common === '1', mallId);
        const ov = readOverlay(req.body, banner_type);

        if (await hasMobileImageColumn()) {
            await pool.query(`
                UPDATE banners SET
                banner_type=?, category_id=?, group_key=?, title=?, image_url=?, mobile_image_url=?, link_url=?, display_order=?, is_active=?, start_date=?, end_date=?,
                overlay_title=?, overlay_subtitle=?, overlay_button_text=?, overlay_button_color=?, overlay_align=?
                WHERE id=?
            `, [
                storedType, categoryId, groupKey, title, image_url, mobile_image_url, link_url, display_order || 0, is_active ? 1 : 0, start_date || null, end_date || null,
                ov.title, ov.subtitle, ov.buttonText, ov.buttonColor, ov.align, id
            ]);
        } else {
            await pool.query(`
                UPDATE banners SET
                banner_type=?, category_id=?, group_key=?, title=?, image_url=?, link_url=?, display_order=?, is_active=?, start_date=?, end_date=?,
                overlay_title=?, overlay_subtitle=?, overlay_button_text=?, overlay_button_color=?, overlay_align=?
                WHERE id=?
            `, [
                storedType, categoryId, groupKey, title, image_url, link_url, display_order || 0, is_active ? 1 : 0, start_date || null, end_date || null,
                ov.title, ov.subtitle, ov.buttonText, ov.buttonColor, ov.align, id
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

/* ───────────────────── 헤더 톱바 (배너 3슬롯 + 알림 1) — '톱바 배너·알림' 탭 ─────────────────────
 *
 * 스토어프론트 헤더 최상단 바. 다른 배너와 달리 `banners` 가 아니라 `header_topbar_item` 에 담는다
 * — banners 에는 mall_id 가 없어(전 몰 공용) 몰별 톱바를 구분할 수 없다.
 * 슬롯이 UNIQUE 로 고정이라 목록·등록 화면 없이 편집 한 장으로 끝난다.
 *
 * 렌더 경로: topbarService → middleware/topbar → partials/storefront/header/_topbar.ejs
 */

const trimOrNull = (v) => {
    const s = (v ?? '').toString().trim();
    return s === '' ? null : s;
};

/** date input 은 값이 없으면 빈 문자열을 보낸다 — DATE 컬럼에 그대로 넣으면 에러다. */
const dateOrNull = (v) => (/^\d{4}-\d{2}-\d{2}$/.test((v ?? '').trim()) ? v.trim() : null);

/** 업로드 파일 → 웹 경로. 새 파일이 없으면 폼이 들고 온 기존 경로(hidden)를 유지한다. */
function topbarImageOf(files, field, existing) {
    const f = files && files[field] && files[field][0];
    if (f) return `/uploads/banners/${f.filename}`;
    return trimOrNull(existing);
}

async function upsertTopbarItem(conn, mallId, kind, slot, row) {
    await conn.query(`
        INSERT INTO header_topbar_item
            (mall_id, kind, slot, message, image_url, link_url, new_window, is_active, start_date, end_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            message = VALUES(message), image_url = VALUES(image_url), link_url = VALUES(link_url),
            new_window = VALUES(new_window), is_active = VALUES(is_active),
            start_date = VALUES(start_date), end_date = VALUES(end_date)
    `, [mallId, kind, slot, row.message, row.image_url, row.link_url,
        row.new_window, row.is_active, row.start_date, row.end_date]);
}

async function deleteTopbarItem(conn, mallId, kind, slot) {
    await conn.query(
        'DELETE FROM header_topbar_item WHERE mall_id = ? AND kind = ? AND slot = ?',
        [mallId, kind, slot]
    );
}

/** GET /admin/banners/topbar */
exports.getTopbar = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        res.render('admin/banners/topbar', {
            layout: 'layouts/admin_layout',
            title: '배너 관리',
            topbar: await topbarService.getTopbarForAdmin(mallId),
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[admin/banners] 톱바 조회 실패', err);
        res.status(500).send('Server Error');
    }
};

/**
 * POST /admin/banners/topbar
 *
 * 내용이 빈 슬롯은 행을 지운다 — 빈 행을 남기면 스토어프론트가 "콘텐츠 있음"으로 보고
 * 아무것도 없는 바를 낸다. 배너 4개째는 폼에도 스키마(UNIQUE slot)에도 자리가 없다.
 */
exports.postTopbar = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const conn = await pool.getConnection();
    try {
        const b = req.body;
        const files = req.files || {};
        await conn.beginTransaction();

        // 알림 — 문구가 비면 등록하지 않은 것으로 본다.
        const message = trimOrNull(b.notice_message);
        if (!message) {
            await deleteTopbarItem(conn, mallId, 'NOTICE', 1);
        } else {
            await upsertTopbarItem(conn, mallId, 'NOTICE', 1, {
                message,
                image_url: null,
                link_url: trimOrNull(b.notice_link_url),
                new_window: b.notice_new_window === '1' ? 1 : 0,
                is_active: b.notice_is_active === '1' ? 1 : 0,
                start_date: dateOrNull(b.notice_start_date),
                end_date: dateOrNull(b.notice_end_date),
            });
        }

        // 배너 3슬롯 — 이미지가 없으면 배너가 아니다(문구만 있는 배너는 없다).
        for (const slot of [1, 2, 3]) {
            const image = topbarImageOf(files, `topbar_banner_${slot}`, b[`banner_${slot}_existing_image`]);
            if (!image || b[`banner_${slot}_delete`] === '1') {
                await deleteTopbarItem(conn, mallId, 'BANNER', slot);
                continue;
            }
            await upsertTopbarItem(conn, mallId, 'BANNER', slot, {
                message: trimOrNull(b[`banner_${slot}_alt`]),   // 대체 텍스트(접근성)
                image_url: image,
                link_url: trimOrNull(b[`banner_${slot}_link_url`]),
                new_window: b[`banner_${slot}_new_window`] === '1' ? 1 : 0,
                is_active: b[`banner_${slot}_is_active`] === '1' ? 1 : 0,
                start_date: dateOrNull(b[`banner_${slot}_start_date`]),
                end_date: dateOrNull(b[`banner_${slot}_end_date`]),
            });
        }

        await conn.commit();
        res.redirect('/admin/banners/topbar?saved=1');
    } catch (err) {
        await conn.rollback();
        console.error('[admin/banners] 톱바 저장 실패', err);
        res.redirect(`/admin/banners/topbar?error=${encodeURIComponent('톱바 저장에 실패했습니다.')}`);
    } finally {
        conn.release();
    }
};
