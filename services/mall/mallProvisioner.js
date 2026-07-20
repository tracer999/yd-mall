const pool = require('../../config/db');
const presets = require('./presets');
const featureMenuSync = require('../menu/featureMenuSync');
const pageBuilderService = require('../display/pageBuilderService');
const mallContext = require('../../middleware/mallContext');
const themeData = require('../../middleware/themeData');
const navigationService = require('../menu/navigationService');
const bestRankingService = require('../best/bestRankingService');
const taxonomyResolver = require('../catalog/taxonomyResolver');

/*
 * 몰 프로비저너 (몰 빌더 P4)
 *
 * 몰을 만들면 `mall` 행과 `navigation_config` 만 생겨서 **GNB 도 메인 화면도 텅 빈 몰**이 나왔다.
 * (몰 2 는 scripts/seed_mall2_general.js 로 수동 시딩한 것이다)
 * 여기서 프리셋대로 내비·메뉴·테마·사이트설정·홈 섹션을 채워 "바로 뜨는 몰"을 만든다.
 *
 * 모드
 *   create  — 신규 몰. 없는 것만 만든다(멱등). 있는 행은 건드리지 않는다.
 *   reapply — 기존 몰에 프리셋 재적용. navigation_config · theme · 메뉴 세트를 프리셋으로 되돌린다.
 *             홈 섹션은 opts.includeHome 일 때만 교체한다(파괴적).
 *
 * 🔴 page_revision 함정
 *   displayService 는 **발행 스냅샷(page_revision)이 있으면 그것을 렌더**하고, 없을 때만
 *   라이브 page_section 으로 폴백한다. 따라서 홈 섹션을 갈아끼운 뒤 발행하지 않으면
 *   "저장했는데 화면이 안 바뀐다". → 홈을 교체하면 반드시 publish() 한다.
 *
 * 설계: docs/사이트개선/mall_builder_plan.md §3.4
 */

const HOME_LAYOUT_TYPE = 'main_basic';

/** 이 몰이 이미 가진 것들 — 무엇을 만들지/덮을지 판단용 */
async function inspect(mallId) {
    const [[nav]] = await pool.query('SELECT id FROM navigation_config WHERE mall_id = ? LIMIT 1', [mallId]);
    const [[theme]] = await pool.query('SELECT id FROM theme WHERE mall_id = ? LIMIT 1', [mallId]);
    const [[settings]] = await pool.query('SELECT id FROM site_settings WHERE mall_id = ? LIMIT 1', [mallId]);
    const [[home]] = await pool.query(
        "SELECT id FROM page WHERE mall_id = ? AND page_type = 'home' ORDER BY id ASC LIMIT 1", [mallId]);

    let sectionCount = 0;
    if (home) {
        const [[c]] = await pool.query('SELECT COUNT(*) n FROM page_section WHERE page_id = ?', [home.id]);
        sectionCount = c.n;
    }

    return {
        hasNavigation: Boolean(nav),
        hasTheme: Boolean(theme),
        hasSettings: Boolean(settings),
        homePageId: home ? home.id : null,
        sectionCount,
    };
}

/** navigation_config — 프리셋의 내비 정책 */
async function applyNavigationConfig(conn, mallId, nav, overwrite) {
    const cols = [
        'header_layout_type', 'nav_mode', 'category_display_type',
        'max_gnb_items', 'max_custom_items', 'category_max_depth',
        'use_mega_menu', 'use_search_bar',
    ];
    const values = cols.map(c => nav[c]);

    if (!overwrite) {
        await conn.query(
            `INSERT IGNORE INTO navigation_config (mall_id, ${cols.join(', ')})
             VALUES (?, ${cols.map(() => '?').join(', ')})`,
            [mallId, ...values]);
        return;
    }
    // 행이 없을 수도 있으므로 INSERT ... ON DUPLICATE KEY UPDATE (mall_id 가 UNIQUE)
    await conn.query(
        `INSERT INTO navigation_config (mall_id, ${cols.join(', ')})
         VALUES (?, ${cols.map(() => '?').join(', ')})
         ON DUPLICATE KEY UPDATE ${cols.map(c => `${c} = VALUES(${c})`).join(', ')}`,
        [mallId, ...values]);
}

/**
 * mall_feature_menu — 프리셋의 GNB 메뉴 세트.
 *
 * 행 생성은 featureMenuSync 가 담당한다(중복 구현 금지 — 스토어프론트는 INNER JOIN 이라
 * 행이 없으면 메뉴가 영영 안 뜬다). 여기서는 **켜고 끄기만** 한다.
 *
 * 규칙:
 *   - position='gnb' 만 대상. header_util / right_rail 은 몰 유형과 무관하므로 안 건드린다.
 *   - is_required = 1 은 프리셋 목록에 없어도 항상 켠다(끌 수 없는 메뉴).
 */
async function applyFeatureMenus(conn, mallId, codes) {
    const list = Array.isArray(codes) ? codes : [];
    const placeholders = list.length ? list.map(() => '?').join(', ') : "''";

    await conn.query(`
        UPDATE mall_feature_menu m
          JOIN feature_menu f ON f.feature_code = m.feature_code
           SET m.is_enabled = CASE
                   WHEN f.is_required = 1 THEN 1
                   WHEN m.feature_code IN (${placeholders}) THEN 1
                   ELSE 0 END
         WHERE m.mall_id = ? AND f.position = 'gnb'
    `, [...list, mallId]);
}

/** theme — 프리셋 토큰 */
async function applyTheme(conn, mallId, tokens, mallName, overwrite) {
    const [[existing]] = await conn.query(
        'SELECT id FROM theme WHERE mall_id = ? ORDER BY id DESC LIMIT 1', [mallId]);

    if (!existing) {
        await conn.query(
            'INSERT INTO theme (mall_id, name, config_json, is_active) VALUES (?, ?, ?, 1)',
            [mallId, `${mallName} 기본 테마`.slice(0, 100), JSON.stringify(tokens)]);
        return;
    }
    if (overwrite) {
        await conn.query('UPDATE theme SET config_json = ?, is_active = 1 WHERE id = ?',
            [JSON.stringify(tokens), existing.id]);
    }
}

/**
 * site_settings — 없으면 만든다.
 *
 * overwrite 여도 **덮지 않는다.** 로고·상호·연락처는 운영자 자산이지 프리셋의 소유물이 아니다.
 * (없을 때 middleware/siteSettings.js 가 기본몰 설정으로 폴백하므로, 새 몰이 기본몰의
 *  로고·상호를 달고 나오는 것을 막으려면 행이 반드시 있어야 한다)
 */
async function applySiteSettings(conn, mallId, mallName) {
    await conn.query(
        'INSERT IGNORE INTO site_settings (mall_id, company_name) VALUES (?, ?)',
        [mallId, String(mallName || '').slice(0, 100)]);
}

/*
 * 홈 섹션이 먹고 살 상품 그룹.
 *
 * condition(조건형)이라 상품을 하나씩 담을 필요가 없다 — 몰에 상품이 들어오는 순간 채워진다.
 * manual 로 만들면 운영자가 상품을 담기 전까지 0건이라 섹션이 그대로 증발한다.
 */
const PRODUCT_GROUP_SEEDS = [
    { key: 'recommend', name: '추천 상품', sort_type: 'newest', filter: {} },
    { key: 'new', name: '신상품', sort_type: 'sale_start', filter: { isNew: true } },
];

/**
 * product_group — 프리셋 섹션이 참조할 조건형 그룹. 이름으로 멱등(있으면 재사용).
 * @returns {Promise<Object>} { recommend: id, new: id }
 */
async function applyProductGroups(conn, mallId) {
    const idByKey = {};
    for (const seed of PRODUCT_GROUP_SEEDS) {
        const [[existing]] = await conn.query(
            'SELECT id FROM product_group WHERE mall_id = ? AND name = ? LIMIT 1', [mallId, seed.name]);
        if (existing) { idByKey[seed.key] = existing.id; continue; }

        const [r] = await conn.query(`
            INSERT INTO product_group (mall_id, name, group_type, sort_type, filter_condition_json, is_active)
            VALUES (?, ?, 'condition', ?, ?, 1)`,
            [mallId, seed.name, seed.sort_type, JSON.stringify(seed.filter)]);
        idByKey[seed.key] = r.insertId;
    }
    return idByKey;
}

/**
 * best_group — 몰의 'ALL'(전체) 베스트 그룹. 없으면 best_ranking 리졸버가 즉시 null 을 돌려
 * 베스트 섹션이 통째로 사라진다. 랭킹 산출(집계)은 트랜잭션 밖에서 따로 돈다.
 */
async function applyBestGroups(conn, mallId) {
    const [[existing]] = await conn.query(
        "SELECT id FROM best_group WHERE mall_id = ? AND group_type = 'ALL' LIMIT 1", [mallId]);
    if (existing) return existing.id;

    const [r] = await conn.query(
        "INSERT INTO best_group (mall_id, name, group_type, sort_order, is_active) VALUES (?, '전체', 'ALL', 0, 1)",
        [mallId]);
    return r.insertId;
}

/*
 * 히어로 표현(config.layout)만 프리셋에 맞춘다 — include_home 과 무관하게 항상 돈다.
 *
 * 히어로가 showcase|banner|editorial 중 무엇인가는 **테마의 정체성**이라 테마를 바꾸면
 * 반드시 따라와야 한다. 그런데 이건 그동안 '홈 섹션 전체 파괴적 교체'(include_home)에
 * 묶여 있었다. 그래서 홈을 지키면서 테마만 바꾸면 히어로가 이전 테마에 남았고,
 * mall.preset_key 와 실제 화면이 갈라졌다(테마1·2 를 고른 몰이 에디토리얼에 갇힌 원인).
 *
 * layout 키 하나만 갱신한다 — 다른 섹션도, 히어로의 다른 config 키도 건드리지 않는다.
 * @returns {Promise<{pageId: number|null, changed: boolean}>}
 */
async function syncHeroLayout(conn, mallId, sections) {
    const heroDef = (sections || []).find((s) => s.type === 'theme_hero');
    const layout = heroDef && heroDef.config && heroDef.config.layout;
    if (!layout) return { pageId: null, changed: false };

    const [[home]] = await conn.query(
        "SELECT id FROM page WHERE mall_id = ? AND page_type = 'home' ORDER BY id ASC LIMIT 1", [mallId]);
    if (!home) return { pageId: null, changed: false };

    const [rows] = await conn.query(
        "SELECT id, config_json FROM page_section WHERE page_id = ? AND section_type = 'theme_hero'", [home.id]);

    let changed = false;
    for (const r of rows) {
        let cfg = {};
        if (r.config_json) {
            if (typeof r.config_json === 'object') cfg = r.config_json;
            else { try { cfg = JSON.parse(r.config_json); } catch (e) { cfg = {}; } }
        }
        if (cfg.layout === layout) continue;
        await conn.query('UPDATE page_section SET config_json = ? WHERE id = ?',
            [JSON.stringify(Object.assign({}, cfg, { layout })), r.id]);
        changed = true;
    }
    return { pageId: home.id, changed };
}

/**
 * page(home) + page_section — 홈 골격.
 *
 * @param groupIdByKey 프리셋 섹션의 `group` 힌트 → product_group.id
 * @returns {Promise<{ pageId: number, replaced: boolean }>}
 */
async function applyHome(conn, mallId, mallCode, mallName, sections, overwrite, groupIdByKey = {}) {
    const [[existing]] = await conn.query(
        "SELECT id FROM page WHERE mall_id = ? AND page_type = 'home' ORDER BY id ASC LIMIT 1", [mallId]);

    let pageId = existing ? existing.id : null;
    let replaced = false;

    if (!pageId) {
        const [r] = await conn.query(`
            INSERT INTO page (mall_id, page_type, slug, title, layout_type, status, published_at)
            VALUES (?, 'home', ?, ?, ?, 'published', NOW())`,
            [mallId, `home-${mallCode}`.slice(0, 255), `${mallName} 홈`.slice(0, 200), HOME_LAYOUT_TYPE]);
        pageId = r.insertId;
    } else if (!overwrite) {
        return { pageId, replaced: false }; // 이미 홈이 있고 덮어쓰지 않는다 → 그대로 둔다
    } else {
        await conn.query('DELETE FROM page_section WHERE page_id = ?', [pageId]);
        replaced = true;
    }

    let sortOrder = 1;
    for (const s of sections) {
        // 데이터 소스를 여기서 물려 준다. 안 물리면 리졸버가 0건을 보고 섹션을 통째로 버린다.
        const groupId = s.group ? (groupIdByKey[s.group] || null) : null;
        // 프리셋이 섹션별 초기 설정을 지정하면 config_json 으로 심는다(테마 히어로 옵션 등).
        const cfg = s.config && Object.keys(s.config).length ? JSON.stringify(s.config) : null;
        await conn.query(`
            INSERT INTO page_section
              (page_id, section_type, position, title, sort_order, data_source_type, data_source_id, config_json, is_active)
            VALUES (?, ?, 'main_content', ?, ?, ?, ?, ?, 1)`,
            [pageId, s.type, s.title || null, sortOrder++, groupId ? 'product_group' : null, groupId, cfg]);
    }

    return { pageId, replaced };
}

/**
 * 몰에 프리셋을 적용한다.
 *
 * @param {number} mallId
 * @param {string} presetKey  presets.js 의 키
 * @param {{ mode?: 'create'|'reapply', includeHome?: boolean, actor?: string, menuMode?: 'split'|'unified' }} opts
 * @returns {Promise<{ preset, created: boolean, homeReplaced: boolean, revisionNo: number|null }>}
 */
async function provisionMall(mallId, presetKey, opts = {}) {
    const id = Number(mallId);
    if (!Number.isInteger(id) || id <= 0) throw new Error('provisionMall: 잘못된 mallId');

    const mode = opts.mode === 'reapply' ? 'reapply' : 'create';
    const overwrite = mode === 'reapply';
    // 신규 몰은 홈이 없으니 항상 만든다. 재적용은 명시적으로 요청할 때만 홈을 건드린다.
    const includeHome = mode === 'create' ? true : Boolean(opts.includeHome);

    const preset = presets.get(presetKey);

    const [[mall]] = await pool.query('SELECT id, code, name FROM mall WHERE id = ?', [id]);
    if (!mall) throw new Error(`provisionMall: 몰 ${id} 을(를) 찾을 수 없습니다.`);

    /*
     * 메뉴 구성 방식(분리형/통합형). 지정이 없으면
     *   - 재적용: 이 몰이 지금 쓰는 방식을 유지한다. 안 그러면 통합형으로 쓰던 몰이 재적용 한 번에
     *     조용히 분리형으로 되돌아간다.
     *   - 신규:   기본값(분리형).
     */
    let menuMode = opts.menuMode;
    if (!presets.isValidMenuMode(menuMode)) {
        const [[cur]] = await pool.query('SELECT nav_mode FROM navigation_config WHERE mall_id = ? LIMIT 1', [id]);
        menuMode = (mode === 'reapply' && cur && presets.isValidMenuMode(cur.nav_mode))
            ? cur.nav_mode
            : presets.DEFAULT_MENU_MODE;
    }
    const navigation = presets.resolveNavigation(preset, menuMode);

    // 메뉴 행 생성은 기존 장치에 맡긴다(트랜잭션 밖 — 멱등하고 pool 을 쓴다).
    await featureMenuSync.ensureMallFeatureMenus(id);

    const conn = await pool.getConnection();
    let home = { pageId: null, replaced: false };
    let heroSynced = false; // include_home 없이 히어로 layout 만 바꿨는가
    try {
        await conn.beginTransaction();

        await applyNavigationConfig(conn, id, navigation, overwrite);
        await applyFeatureMenus(conn, id, preset.featureMenus);
        await applyTheme(conn, id, preset.theme, mall.name, overwrite);
        await applySiteSettings(conn, id, mall.name);

        // "미분류" 폴백 카테고리를 미리 심는다(멱등). 근거 텍스트 없이 등록되는 상품이
        // category_id=null 로 사라지지 않게 하는 안전망. 고객 GNB 에는 숨는다.
        await taxonomyResolver.getUncategorizedCategoryId({ mallId: id, conn });

        if (includeHome) {
            // 섹션보다 **먼저** 데이터 소스를 만든다 — 섹션이 만들어질 때 물려야 하므로.
            const groupIdByKey = await applyProductGroups(conn, id);
            await applyBestGroups(conn, id);
            home = await applyHome(conn, id, mall.code, mall.name, preset.homeSections, overwrite, groupIdByKey);
        } else {
            // 홈 섹션은 보존하되 히어로 표현만 테마를 따르게 한다(위 syncHeroLayout 주석 참고).
            const synced = await syncHeroLayout(conn, id, preset.homeSections);
            heroSynced = synced.changed;
            if (synced.changed) home = { pageId: synced.pageId, replaced: false };
        }

        // 마지막으로 적용한 프리셋을 기억한다(목록·재적용 화면 표시용).
        // 실제 스킨의 소스 오브 트루스는 navigation_config(header_layout_type·nav_mode)다.
        await conn.query('UPDATE mall SET preset_key = ? WHERE id = ?', [preset.key, id]);

        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }

    /*
     * 베스트 랭킹 초기 집계. best_group 만 만들어 두면 best_ranking(스냅샷)이 비어 있어
     * getRanking 이 0건을 돌려주고 → 섹션이 또 사라진다. 배치(cron)를 기다리지 않고 지금 한 번 돈다.
     * 실패해도 몰은 살아야 한다 — 다음 배치나 관리자의 "지금 집계"가 채운다.
     */
    if (includeHome) {
        try {
            await bestRankingService.calculateAllPeriods(id);
        } catch (err) {
            console.error(`[provisionMall] 베스트 초기 집계 실패(몰 ${id}):`, err.message);
        }
    }

    /*
     * 홈 섹션을 교체했으면 반드시 발행한다. 안 하면 옛 스냅샷이 계속 렌더된다.
     * (새로 만든 페이지는 리비전이 없어 라이브 폴백으로 뜨지만, 발행해 두면 상태가 명확하다)
     *
     * 히어로 layout 만 바꾼 경우도 발행해야 한다 — 프론트는 발행 스냅샷을 우선 읽으므로
     * page_section 만 고치면 화면이 그대로다(테마를 바꿨는데 안 바뀌는 것처럼 보인다).
     */
    let revisionNo = null;
    if ((includeHome || heroSynced) && home.pageId) {
        revisionNo = await pageBuilderService.publish(home.pageId, opts.actor || 'provisioner');
    }

    // 캐시 무효화 — 안 하면 최대 60초 동안 옛 설정이 나간다.
    mallContext.invalidate();
    themeData.invalidate(id);
    navigationService.invalidateContentGate(id);

    return { preset, menuMode, created: mode === 'create', homeReplaced: home.replaced, heroSynced, revisionNo };
}

/**
 * 페이지 이지모드 번들 적용 — 홈의 "히어로 아래 콘텐츠 캐러셀"만 교체·발행한다.
 *
 * provisionMall 과 달리 **내비·테마·메뉴는 건드리지 않는다**(그건 페이지 빌더 > 테마 설정 탭 · 디자인 스타일 소관).
 * 리딩 히어로(theme_hero)는 원래 config 를 보존해 그대로 두고, 나머지 섹션을 번들로 갈아끼운다.
 *
 * @param {number} mallId
 * @param {string} bundleKey  presets.PAGE_BUNDLES 키
 * @param {{ actor?: string }} opts
 * @returns {Promise<{ bundle, pageId: number, revisionNo: number|null }>}
 */
async function applyHomeBundle(mallId, bundleKey, opts = {}) {
    const id = Number(mallId);
    if (!Number.isInteger(id) || id <= 0) throw new Error('applyHomeBundle: 잘못된 mallId');

    const bundle = presets.getBundle(bundleKey);
    if (!bundle) throw new Error('applyHomeBundle: 알 수 없는 번들 키');

    const [[mall]] = await pool.query('SELECT id FROM mall WHERE id = ?', [id]);
    if (!mall) throw new Error(`applyHomeBundle: 몰 ${id} 을(를) 찾을 수 없습니다.`);

    const [[home]] = await pool.query(
        "SELECT id FROM page WHERE mall_id = ? AND page_type = 'home' ORDER BY id ASC LIMIT 1", [id]);
    if (!home) throw new Error('applyHomeBundle: 편집할 홈 페이지가 없습니다. 먼저 테마를 적용하세요.');

    // 프로모션 배너가 번들에 있으면 실제 존재하는 그룹 키를 하나 배선한다(없으면 그 섹션은 스킵됨).
    let bannerGroupKey = null;
    if (bundle.sections.some((s) => s.type === 'promotion_banner')) {
        const [rows] = await pool.query(`
            SELECT group_key FROM banners
             WHERE is_active = 1 AND mall_id = ? AND group_key IS NOT NULL AND group_key <> ''
             GROUP BY group_key ORDER BY MIN(display_order) ASC, group_key ASC LIMIT 1`, [id]);
        bannerGroupKey = rows.length ? rows[0].group_key : null;
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 히어로는 테마 소관 — 원래 config 그대로 보존한다.
        const [heroRows] = await conn.query(
            `SELECT title, sort_order, data_source_type, data_source_id, config_json, is_active
               FROM page_section
              WHERE page_id = ? AND section_type = 'theme_hero'
              ORDER BY sort_order ASC`, [home.id]);

        // 신상품 캐러셀이 물 조건형 상품 그룹(멱등) + 베스트 그룹.
        const groupIdByKey = await applyProductGroups(conn, id);
        await applyBestGroups(conn, id);

        await conn.query('DELETE FROM page_section WHERE page_id = ?', [home.id]);

        let sortOrder = 1;
        // 1) 히어로 재삽입(보존).
        //    config_json 은 JSON 컬럼이라 mysql2 가 SELECT 시 객체로 파싱해 돌려준다.
        //    그대로 다시 넣으면 mysql2 가 객체를 SET 표현식으로 직렬화해 깨진다 → 문자열로 정규화한다.
        for (const h of heroRows) {
            const heroCfg = h.config_json == null
                ? null
                : (typeof h.config_json === 'string' ? h.config_json : JSON.stringify(h.config_json));
            await conn.query(`
                INSERT INTO page_section
                  (page_id, section_type, position, title, sort_order, data_source_type, data_source_id, config_json, is_active)
                VALUES (?, 'theme_hero', 'main_content', ?, ?, ?, ?, ?, ?)`,
                [home.id, h.title, sortOrder++, h.data_source_type, h.data_source_id, heroCfg, h.is_active]);
        }
        // 2) 번들 섹션 삽입
        for (const s of bundle.sections) {
            const groupId = s.group ? (groupIdByKey[s.group] || null) : null;
            const cfg = Object.assign({}, s.config || {});
            if (s.type === 'promotion_banner' && bannerGroupKey && !cfg.groupKey) cfg.groupKey = bannerGroupKey;
            const cfgJson = Object.keys(cfg).length ? JSON.stringify(cfg) : null;
            await conn.query(`
                INSERT INTO page_section
                  (page_id, section_type, position, title, sort_order, data_source_type, data_source_id, config_json, is_active)
                VALUES (?, ?, 'main_content', ?, ?, ?, ?, ?, 1)`,
                [home.id, s.type, s.title || null, sortOrder++, groupId ? 'product_group' : null, groupId, cfgJson]);
        }

        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }

    // 교체 후 반드시 발행 — 안 하면 옛 page_revision 스냅샷이 계속 렌더된다.
    const revisionNo = await pageBuilderService.publish(home.id, opts.actor || 'bundle');

    return { bundle, pageId: home.id, revisionNo };
}

module.exports = {
    provisionMall,
    applyHomeBundle,
    inspect,
    // 백필 스크립트(scripts/backfill_mall_data_sources.js)가 같은 시드 정의를 재사용한다.
    PRODUCT_GROUP_SEEDS,
    applyProductGroups,
    applyBestGroups,
};
