const fs = require('fs');
const pool = require('../../config/db');
const upload = require('../../middleware/upload');
const { isVideoUrl } = require('../../shared/mediaType');
const menuShowcaseService = require('../../services/menu/menuShowcaseService');
const topbarService = require('../../services/display/topbarService');
const headerSkins = require('../../services/menu/headerSkins');
const navigationService = require('../../services/menu/navigationService');
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
async function getMenuBannerCounts(mallId) {
    const [rows] = await pool.query(`
        SELECT group_key, COUNT(*) AS cnt
        FROM banners
        WHERE group_key LIKE 'menu:%' AND mall_id = ?
        GROUP BY group_key
    `, [mallId]);
    const counts = {};
    for (const r of rows) counts[r.group_key.slice('menu:'.length)] = Number(r.cnt);
    return counts;
}

/*
 * 프로모션 배너
 *
 * 페이지 빌더의 'promotion_banner' 섹션이 config.groupKey 로 집어가는 배너 묶음이다.
 * 메뉴별 배너와 같은 관용구로 저장한다(스키마 변경 없음):
 *   banner_type='CATEGORY', category_id=NULL, group_key='{그룹키}'
 *
 * 'menu:'·'common:' 은 각각 전용 화면(메뉴별 배너 / 카테고리·브랜드 공통)이 관장하므로
 * 프로모션 그룹에서 제외한다. 그래서 그룹 키에는 ':' 를 허용하지 않는다.
 */
const PROMO_RESERVED_PREFIXES = ['menu:', 'common:'];
const DEFAULT_PROMO_GROUP = 'home_promo';
const PROMO_GROUP_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** 이 group_key 가 프로모션 그룹인가 — 전용 네임스페이스가 아니면 프로모션으로 본다. */
function isPromoGroupKey(key) {
    const k = String(key || '').trim();
    if (!k) return false;
    return !PROMO_RESERVED_PREFIXES.some(p => k.startsWith(p));
}

/** 이 배너가 프로모션 배너인가 — 대상 카테고리가 없는(묶음 전용) 배너만 해당한다. */
function isPromoBanner(banner) {
    return !banner.category_id && isPromoGroupKey(banner.group_key);
}

/** 폼 입력 → 저장 가능한 group_key. banners.group_key 는 VARCHAR(50). */
function normalizePromoGroupKey(raw) {
    const key = String(raw || '').trim().slice(0, 50);
    if (!key) {
        const err = new Error('프로모션 그룹 키를 입력하세요.');
        err.statusCode = 400;
        throw err;
    }
    // ':' 를 막아 'menu:'·'common:' 네임스페이스 침범을 원천 차단한다.
    if (!PROMO_GROUP_KEY_RE.test(key)) {
        const err = new Error('프로모션 그룹 키는 영문으로 시작하고 영문·숫자·_·- 만 쓸 수 있습니다.');
        err.statusCode = 400;
        throw err;
    }
    return key;
}

/**
 * 이 몰의 프로모션 그룹 목록.
 *
 * 등록된 배너의 그룹 ∪ 페이지 빌더 섹션이 참조하는 그룹. 후자를 합치는 이유는,
 * 섹션은 걸어 뒀는데 배너가 하나도 없는 그룹(= 프론트에 아무것도 안 나오는 상태)이
 * 목록에 보여야 "왜 안 나오지"가 생기지 않기 때문이다.
 */
async function getPromoGroups(mallId) {
    const [bannerRows] = await pool.query(`
        SELECT group_key, COUNT(*) AS cnt,
               SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_cnt
        FROM banners
        WHERE mall_id = ? AND group_key IS NOT NULL AND category_id IS NULL
          AND group_key NOT LIKE 'menu:%' AND group_key NOT LIKE 'common:%'
        GROUP BY group_key
    `, [mallId]);

    const [sectionRows] = await pool.query(`
        SELECT ps.config_json ->> '$.groupKey' AS group_key, COUNT(*) AS cnt
        FROM page_section ps
        JOIN page p ON p.id = ps.page_id
        WHERE ps.section_type = 'promotion_banner' AND p.mall_id = ?
          AND ps.config_json ->> '$.groupKey' IS NOT NULL
        GROUP BY 1
    `, [mallId]);

    const groups = new Map();
    for (const r of bannerRows) {
        groups.set(r.group_key, {
            key: r.group_key,
            bannerCount: Number(r.cnt),
            activeCount: Number(r.active_cnt),
            sectionCount: 0,
        });
    }
    for (const r of sectionRows) {
        // 'menu:NEW' 처럼 남의 네임스페이스를 가리키는 섹션은 이 화면 소관이 아니다.
        if (!isPromoGroupKey(r.group_key)) continue;
        const cur = groups.get(r.group_key)
            || { key: r.group_key, bannerCount: 0, activeCount: 0, sectionCount: 0 };
        cur.sectionCount = Number(r.cnt);
        groups.set(r.group_key, cur);
    }

    // 아무것도 없는 몰에서도 등록을 시작할 수 있게 기본 그룹 하나는 항상 제시한다.
    if (groups.size === 0) {
        groups.set(DEFAULT_PROMO_GROUP, {
            key: DEFAULT_PROMO_GROUP, bannerCount: 0, activeCount: 0, sectionCount: 0,
        });
    }
    return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
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
        let promoGroups = [];
        let currentPromoKey = '';

        if (type === 'PROMO') {
            // 프로모션 탭은 그룹 하나를 골라 그 그룹의 배너만 보여준다(메뉴별 배너와 같은 서브탭 방식).
            promoGroups = await getPromoGroups(mallId);
            const requested = String(req.query.group || '').trim();
            currentPromoKey = promoGroups.some(g => g.key === requested)
                ? requested
                : (promoGroups[0]?.key || DEFAULT_PROMO_GROUP);

            [banners] = await pool.query(`
                SELECT b.*, NULL AS category_name
                FROM banners b
                WHERE b.group_key = ? AND b.mall_id = ? AND b.category_id IS NULL
                ORDER BY b.display_order ASC, b.created_at DESC
            `, [currentPromoKey, mallId]);
        } else if (type === 'MENU') {
            // 메뉴별 탭은 메뉴 하나를 골라 그 메뉴의 배너만 보여준다(서브탭). 기본은 첫 메뉴.
            const requested = req.query.menu;
            currentMenuKey = menuTargets.some(t => t.key === requested)
                ? requested
                : (menuTargets[0]?.key || '');
            menuBannerCounts = await getMenuBannerCounts(mallId);

            // 이 메뉴에 상품 캐러셀도 걸려 있는지 — 배너는 그 위에 함께 노출된다는 안내를 위해.
            if (currentMenuKey) {
                menuProductGroup = await menuShowcaseService.getProductGroupForMenu(mallId, currentMenuKey);
            }

            [banners] = currentMenuKey
                ? await pool.query(`
                    SELECT b.*, c.name AS category_name
                    FROM banners b
                    LEFT JOIN categories c ON b.category_id = c.id
                    WHERE b.group_key = ? AND b.mall_id = ?
                    ORDER BY b.display_order ASC, b.created_at DESC
                `, [`menu:${currentMenuKey}`, mallId])
                : [[]];
        } else {
            // 일반 타입 배너에는 묶음 전용 배너(메뉴별 'menu:%' · 프로모션 그룹)가 섞이지 않도록,
            // group_key 가 비었거나 공통 배너('common:%')인 것만 남긴다.
            //
            // 몰 스코프는 banners.mall_id 로 직접 건다(20260720_banners_mall_scope.sql).
            // 예전에는 이 컬럼이 없어 CATEGORY·BRAND 를 조인한 categories.mall_id 로 우회했는데,
            // 카테고리가 글로벌화(mall_id=0)된 뒤로는 그 우회가 몰을 전혀 가르지 못했다.
            [banners] = await pool.query(`
                SELECT b.*, c.name AS category_name
                FROM banners b
                LEFT JOIN categories c ON b.category_id = c.id
                WHERE b.banner_type = ? AND b.mall_id = ?
                  AND (b.group_key IS NULL OR b.group_key LIKE 'common:%')
                ORDER BY b.display_order ASC, b.created_at DESC
            `, [type, mallId]);
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
            menuProductGroup,
            promoGroups,
            currentPromoKey
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
         WHERE banner_type = ? AND mall_id = ? AND category_id IS NOT NULL
           AND (group_key IS NULL OR group_key NOT LIKE 'menu:%')
         ORDER BY display_order ASC, created_at DESC`,
        [type, mallId]
    );
    const bannersByCat = new Map();
    for (const b of indivBanners) {
        if (!bannersByCat.has(b.category_id)) bannersByCat.set(b.category_id, []);
        bannersByCat.get(b.category_id).push(b);
    }

    // 전체 공통 배너(상단 별도 노출)
    const commonKey = commonGroupKey(type, mallId);
    const [commonBanners] = await pool.query(
        'SELECT * FROM banners WHERE group_key = ? AND mall_id = ? ORDER BY display_order ASC, created_at DESC',
        [commonKey, mallId]
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
        promoGroups: [],
        currentPromoKey: '',
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

        // 프로모션 탭에서 '배너 등록'을 누르면 보던 그룹이 채워진 채로 열린다.
        // '새 그룹'(?new=1)으로 들어오면 비운 채 열어 새 그룹 키를 직접 입력하게 한다.
        const promoGroups = await getPromoGroups(req.adminMallId || 1);
        const requestedGroup = String(req.query.group || '').trim();
        let currentPromoKey = '';
        if (type === 'PROMO' && req.query.new !== '1') {
            currentPromoKey = promoGroups.some(g => g.key === requestedGroup)
                ? requestedGroup
                : (promoGroups[0]?.key || DEFAULT_PROMO_GROUP);
        }

        res.render('admin/banners/form', {
            layout: 'layouts/admin_layout',
            title: '배너 등록',
            banner: null,
            categories,
            currentType: type,
            menuTargets,
            currentMenuKey,
            promoGroups,
            currentPromoKey,
            preselectTarget,
            preselectCommon,
            maxUploadFileMb: upload.MAX_UPLOAD_FILE_MB,
            // 배너에 영상도 올릴 수 있어 상한이 두 개다(이미지 / 동영상). 폼이 파일 종류에 따라 나눠 검사한다.
            maxVideoUploadMb: upload.MAX_VIDEO_UPLOAD_MB
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

/*
 * 배너 문구(오버레이) — banners.overlay_* 컬럼.
 *
 * 두 갈래로 쓰인다.
 *   MAIN                        : 큰 제목 + 추가 문구(최대 2줄) + 이동 버튼 + 정렬/버튼색
 *                                 → views/partials/sections/hero_banner.ejs
 *   CATEGORY·BRAND·MENU·PROMO   : overlay_subtitle 만. 배너 제목(banners.title)은 지금까지의 크기로,
 *                                 이 문구는 크게(줄 수에 따라 크기 조절, 최대 3줄) 얹는다.
 *                                 → views/partials/banner_copy.ejs
 *
 * 위 타입이 아니면(POPUP) 저장하지 않는다 — 렌더할 자리가 없어 값만 남으면 "왜 안 나오지" 가 된다.
 * 타입을 바꾸면 그 타입이 안 쓰는 항목은 비워진다.
 */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const ALIGNS = ['LEFT', 'CENTER', 'RIGHT'];
/** 배너 문구(최대 3줄)만 쓰는 타입 — 폼의 banner_type 값 기준(MENU·PROMO 는 가상 타입). */
const COPY_TYPES = ['CATEGORY', 'BRAND', 'MENU', 'PROMO'];
const SUBTITLE_MAX = 300;   // banners.overlay_subtitle VARCHAR(300)

/** 줄 단위로 다듬고 maxLines 줄까지만 남긴다. 뷰에서만 자르면 저장된 데이터가 거짓말을 한다. */
function readSubtitle(raw, maxLines) {
    const lines = String(raw || '')
        .replace(/\r\n/g, '\n')
        .split('\n').map(l => l.trim()).filter(Boolean)
        .slice(0, maxLines);
    const joined = lines.join('\n');
    return joined ? joined.slice(0, SUBTITLE_MAX) : null;
}

function readOverlay(body, formType) {
    const empty = { title: null, subtitle: null, buttonText: null, buttonColor: null, align: 'LEFT' };

    if (COPY_TYPES.includes(formType)) {
        // 이 타입들은 제목·버튼·정렬을 렌더하지 않는다. 문구(최대 3줄)만 남긴다.
        return { ...empty, subtitle: readSubtitle(body.overlay_subtitle, 3) };
    }
    if (formType !== 'MAIN') return empty;

    const trim = (v, max) => {
        const s = String(v == null ? '' : v).trim();
        return s ? s.slice(0, max) : null;
    };
    const color = String(body.overlay_button_color || '').trim();
    return {
        title: trim(body.overlay_title, 120),
        subtitle: readSubtitle(body.overlay_subtitle, 2),
        buttonText: trim(body.overlay_button_text, 40),
        buttonColor: HEX_COLOR.test(color) ? color.toLowerCase() : null,
        align: ALIGNS.includes(body.overlay_align) ? body.overlay_align : 'LEFT',
    };
}

/*
 * 배너 미디어(이미지/영상) 검사.
 *
 * 영상을 <video> 로 그릴 수 있는 배너는 **메인 슬라이더(MAIN)** 뿐이다(hero_media.ejs).
 * 다른 타입은 렌더러가 <img> 하나뿐이라 영상이 들어오면 화면이 깨진다 — 저장 전에 막는다.
 * multer 의 fileFilter 가 아니라 여기서 보는 이유: 멀티파트 필드 순서에 따라 파일이
 * banner_type 보다 먼저 도착할 수 있어 필터 시점의 req.body 는 신뢰할 수 없다.
 *
 * 막을 때는 이미 디스크에 떨어진 업로드본을 지운다(저장되지 않을 파일이 남으면 쓰레기가 쌓인다).
 *
 * 새로 올린 파일이 아니라 **저장될 최종 경로**를 본다 — 영상이 걸린 MAIN 배너의 타입만
 * 바꾸는 경우(파일 업로드 없음)도 같은 이유로 막아야 한다.
 */
function assertBannerMedia({ files, bannerType, imageUrl, mobileImageUrl }) {
    if (bannerType === 'MAIN') return;
    if (!isVideoUrl(imageUrl) && !isVideoUrl(mobileImageUrl)) return;

    const uploaded = [files?.banner_image?.[0], files?.mobile_banner_image?.[0]].filter(Boolean);
    for (const f of uploaded) {
        try { fs.unlinkSync(f.path); } catch { /* 이미 없으면 그만 */ }
    }
    const err = new Error('동영상은 메인 슬라이더(이미지 배너)에만 등록할 수 있습니다. 다른 배너 타입에는 이미지 파일을 올려주세요.');
    err.statusCode = 400;
    throw err;
}

exports.postAdd = async (req, res) => {
    const { title, link_url, display_order, is_active, banner_type, category_id, start_date, end_date } = req.body;
    const bannerImage = req.files?.banner_image?.[0];
    const mobileBannerImage = req.files?.mobile_banner_image?.[0];
    const image_url = bannerImage ? '/uploads/banners/' + bannerImage.filename : null;
    const mobile_image_url = mobileBannerImage ? '/uploads/banners/' + mobileBannerImage.filename : null;

    try {
        assertBannerMedia({ files: req.files, bannerType: banner_type, imageUrl: image_url, mobileImageUrl: mobile_image_url });
        // 신규 등록 — 보존할 기존 group_key 없음(null).
        const mallId = req.adminMallId || 1;
        const menuKeys = (await getBannerMenuTargets(mallId)).map(t => t.key);
        const { storedType, categoryId, groupKey, redirectType, menuKey, promoKey } =
            resolveBannerTarget({
                bannerType: banner_type,
                categoryIdRaw: category_id,
                menuTarget: req.body.menu_target,
                promoGroup: req.body.promo_group,
                existingGroupKey: null,
                menuKeys,
                isCommon: req.body.is_common === '1',
                mallId,
            });
        const ov = readOverlay(req.body, banner_type);

        if (await hasMobileImageColumn()) {
            await pool.query(
                `INSERT INTO banners (mall_id, banner_type, category_id, group_key, title, image_url, mobile_image_url, link_url, display_order, is_active, start_date, end_date,
                                      overlay_title, overlay_subtitle, overlay_button_text, overlay_button_color, overlay_align)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    mallId, storedType, categoryId, groupKey, title, image_url, mobile_image_url, link_url,
                    display_order || 0, is_active ? 1 : 0, start_date || null, end_date || null,
                    ov.title, ov.subtitle, ov.buttonText, ov.buttonColor, ov.align
                ]
            );
        } else {
            await pool.query(
                // 컬럼 16개 ↔ 플레이스홀더 16개. (이전엔 15:14 로 어긋나 있었다 — 이 분기는
                //  mobile_image_url 컬럼이 없는 DB 에서만 타므로 현 환경에서 드러나지 않았다.)
                `INSERT INTO banners (mall_id, banner_type, category_id, group_key, title, image_url, link_url, display_order, is_active, start_date, end_date,
                                      overlay_title, overlay_subtitle, overlay_button_text, overlay_button_color, overlay_align)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    mallId, storedType, categoryId, groupKey, title, image_url, link_url,
                    display_order || 0, is_active ? 1 : 0, start_date || null, end_date || null,
                    ov.title, ov.subtitle, ov.buttonText, ov.buttonColor, ov.align
                ]
            );
        }
        res.redirect(listUrl(redirectType, menuKey, promoKey));
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
function resolveBannerTarget({
    bannerType, categoryIdRaw, menuTarget, promoGroup,
    existingGroupKey, menuKeys = [], isCommon = false, mallId = 1,
}) {
    // 프로모션 배너 — 메뉴별 배너와 같은 관용구(CATEGORY + category_id=NULL + group_key).
    if (bannerType === 'PROMO') {
        const groupKey = normalizePromoGroupKey(promoGroup);
        return {
            storedType: 'CATEGORY', categoryId: null, groupKey,
            redirectType: 'PROMO', menuKey: '', promoKey: groupKey
        };
    }
    if (bannerType === 'MENU') {
        // 목록에 없는 키는 저장하지 않는다 — 노출될 곳이 없는 배너가 생긴다.
        if (!menuKeys.includes(menuTarget)) {
            const err = new Error('메뉴 배너 대상이 올바르지 않습니다.');
            err.statusCode = 400;
            throw err;
        }
        return {
            storedType: 'CATEGORY', categoryId: null, groupKey: `menu:${menuTarget}`,
            redirectType: 'MENU', menuKey: menuTarget, promoKey: ''
        };
    }
    const type = ['MAIN', 'CATEGORY', 'POPUP', 'BRAND'].includes(bannerType) ? bannerType : 'MAIN';

    // 카테고리/브랜드 전체 공통 배너 — 개별 대상 대신 몰 전체 기본값.
    if ((type === 'CATEGORY' || type === 'BRAND') && isCommon) {
        return {
            storedType: type, categoryId: null, groupKey: commonGroupKey(type, mallId),
            redirectType: type, menuKey: '', promoKey: ''
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

    return { storedType: type, categoryId, groupKey, redirectType: type, menuKey: '', promoKey: '' };
}

/** 저장 후 돌아갈 목록 URL — 메뉴별·프로모션 배너는 방금 편집한 서브탭으로, MAIN 은 메인 슬라이더 화면으로. */
function listUrl(redirectType, menuKey, promoKey) {
    if (redirectType === 'MENU' && menuKey) {
        return `/admin/banners?type=MENU&menu=${encodeURIComponent(menuKey)}`;
    }
    if (redirectType === 'PROMO' && promoKey) {
        return `/admin/banners?type=PROMO&group=${encodeURIComponent(promoKey)}`;
    }
    if (redirectType === 'MAIN') return HERO_LIST_URL;
    return `/admin/banners?type=${redirectType}`;
}

exports.getEdit = async (req, res) => {
    try {
        const { id } = req.params;
        const mallId = req.adminMallId || 1;
        const [rows] = await pool.query(`
            SELECT b.*, c.name AS category_name
            FROM banners b
            LEFT JOIN categories c ON b.category_id = c.id
            WHERE b.id = ? AND b.mall_id = ?
        `, [id, mallId]);

        if (rows.length === 0) return res.redirect('/admin/banners');

        const banner = rows[0];
        // 메뉴별 배너(group_key='menu:%')는 폼에서 'MENU' 타입으로 다룬다.
        const isMenuBanner = banner.group_key && banner.group_key.startsWith('menu:');
        const currentMenuKey = isMenuBanner ? banner.group_key.slice('menu:'.length) : '';
        // 프로모션 배너도 마찬가지로 'PROMO' 가상 타입으로 다룬다.
        const promoBanner = isPromoBanner(banner);

        const [categories] = await pool.query(
            'SELECT id, name, type FROM categories WHERE mall_id IN (0, ?) ORDER BY display_order ASC, id ASC',
            [req.adminMallId || 1]
        );

        let currentType = banner.banner_type;
        if (isMenuBanner) currentType = 'MENU';
        else if (promoBanner) currentType = 'PROMO';

        res.render('admin/banners/form', {
            layout: 'layouts/admin_layout',
            title: '배너 수정',
            categories,
            banner,
            currentType,
            menuTargets: await getBannerMenuTargets(req.adminMallId || 1),
            currentMenuKey,
            promoGroups: await getPromoGroups(mallId),
            currentPromoKey: promoBanner ? banner.group_key : '',
            preselectTarget: null,
            preselectCommon: false,
            maxUploadFileMb: upload.MAX_UPLOAD_FILE_MB,
            // 배너에 영상도 올릴 수 있어 상한이 두 개다(이미지 / 동영상). 폼이 파일 종류에 따라 나눠 검사한다.
            maxVideoUploadMb: upload.MAX_VIDEO_UPLOAD_MB
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
    /*
     * 모바일 이미지 — 우선순위는 톱바·히어로 슬라이드와 같다: 새 파일 > 비우기 > 기존.
     * '삭제' 체크는 기존 이미지를 지우겠다는 뜻이지만, 같은 저장에 새 파일이 올라왔다면
     * 교체가 의도이므로 새 파일이 이긴다. (PC 이미지는 banners.image_url 이 NOT NULL 이라 교체만 가능)
     */
    if (mobileBannerImage) {
        mobile_image_url = '/uploads/banners/' + mobileBannerImage.filename;
    } else if (req.body.clear_mobile_image === '1') {
        mobile_image_url = null;
    }

    try {
        assertBannerMedia({ files: req.files, bannerType: banner_type, imageUrl: image_url, mobileImageUrl: mobile_image_url });
        // 편집 — 기존 group_key(existing_group_key)를 넘겨 이 화면과 무관한 group_key 를 보존한다.
        const mallId = req.adminMallId || 1;
        const menuKeys = (await getBannerMenuTargets(mallId)).map(t => t.key);
        const { storedType, categoryId, groupKey, redirectType, menuKey, promoKey } =
            resolveBannerTarget({
                bannerType: banner_type,
                categoryIdRaw: category_id,
                menuTarget: req.body.menu_target,
                promoGroup: req.body.promo_group,
                existingGroupKey: req.body.existing_group_key,
                menuKeys,
                isCommon: req.body.is_common === '1',
                mallId,
            });
        const ov = readOverlay(req.body, banner_type);

        if (await hasMobileImageColumn()) {
            await pool.query(`
                UPDATE banners SET
                banner_type=?, category_id=?, group_key=?, title=?, image_url=?, mobile_image_url=?, link_url=?, display_order=?, is_active=?, start_date=?, end_date=?,
                overlay_title=?, overlay_subtitle=?, overlay_button_text=?, overlay_button_color=?, overlay_align=?
                WHERE id=? AND mall_id=?
            `, [
                storedType, categoryId, groupKey, title, image_url, mobile_image_url, link_url, display_order || 0, is_active ? 1 : 0, start_date || null, end_date || null,
                ov.title, ov.subtitle, ov.buttonText, ov.buttonColor, ov.align, id, mallId
            ]);
        } else {
            await pool.query(`
                UPDATE banners SET
                banner_type=?, category_id=?, group_key=?, title=?, image_url=?, link_url=?, display_order=?, is_active=?, start_date=?, end_date=?,
                overlay_title=?, overlay_subtitle=?, overlay_button_text=?, overlay_button_color=?, overlay_align=?
                WHERE id=? AND mall_id=?
            `, [
                storedType, categoryId, groupKey, title, image_url, link_url, display_order || 0, is_active ? 1 : 0, start_date || null, end_date || null,
                ov.title, ov.subtitle, ov.buttonText, ov.buttonColor, ov.align, id, mallId
            ]);
        }
        res.redirect(listUrl(redirectType, menuKey, promoKey));
    } catch (err) {
        console.error(err);
        if (err.statusCode === 400) return res.status(400).send(err.message);
        res.status(500).send(`Banner update failed${err.code ? `: ${err.code}` : ''}`);
    }
};

exports.postDelete = async (req, res) => {
    const { id } = req.body;
    const mallId = req.adminMallId || 1;
    try {
        // mall_id 를 함께 건다 — 없으면 남의 몰 배너 id 로 삭제가 통한다.
        await pool.query('DELETE FROM banners WHERE id = ? AND mall_id = ?', [id, mallId]);
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

/** 이번 저장에 새로 올라온 업로드 파일 → 웹 경로. 없으면 null. */
function uploadedTopbarImage(files, field) {
    const f = files && files[field] && files[field][0];
    return f ? `/uploads/banners/${f.filename}` : null;
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
        /*
         * 톱바는 **헤더 스킨이 그려 줘야** 나온다. 에디토리얼형처럼 톱바를 include 하지 않는
         * 스킨을 쓰는 몰에서는 아무리 등록해도 화면에 안 나오는데, 그 사실을 알 방법이 없으면
         * "저장이 안 됐나?" 로 이어진다. 그래서 지금 스킨과 노출 여부를 화면에 같이 낸다.
         */
        const navConfig = await navigationService.getConfig(mallId);
        const headerSkin = navConfig.header_layout_type;

        res.render('admin/banners/topbar', {
            layout: 'layouts/admin_layout',
            title: '배너 관리',
            topbar: await topbarService.getTopbarForAdmin(mallId),
            headerSkinLabel: headerSkins.labelOf(headerSkin),
            headerSkinRendersTopbar: headerSkins.rendersTopbar(headerSkin),
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

        /*
         * 배너 3슬롯 — **이미지가 1순위, 대체 텍스트가 폴백**.
         * 이미지가 없어도 대체 텍스트가 있으면 텍스트 배너로 남긴다(스토어프론트가 카드로 그린다).
         * 둘 다 비어야 '등록하지 않은 슬롯'이고, 그때만 행을 지운다.
         */
        for (const slot of [1, 2, 3]) {
            const alt = trimOrNull(b[`banner_${slot}_alt`]);
            /*
             * '이미지 삭제' 체크는 **기존 이미지**를 지우겠다는 뜻이다.
             * 같은 저장에 새 파일까지 올라왔다면 교체가 의도이므로 새 파일이 이긴다.
             */
            const uploaded = uploadedTopbarImage(files, `topbar_banner_${slot}`);
            const keepExisting = b[`banner_${slot}_delete`] === '1'
                ? null
                : trimOrNull(b[`banner_${slot}_existing_image`]);
            const image = uploaded || keepExisting;

            if (!image && !alt) {
                await deleteTopbarItem(conn, mallId, 'BANNER', slot);
                continue;
            }
            await upsertTopbarItem(conn, mallId, 'BANNER', slot, {
                message: alt,          // 대체 텍스트 — 접근성 + 이미지 없을 때의 텍스트 배너 내용
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
