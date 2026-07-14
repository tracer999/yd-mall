const pool = require('../../config/db');
const presets = require('./presets');
const featureMenuSync = require('../menu/featureMenuSync');
const pageBuilderService = require('../display/pageBuilderService');
const mallContext = require('../../middleware/mallContext');
const themeData = require('../../middleware/themeData');
const navigationService = require('../menu/navigationService');

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

/**
 * page(home) + page_section — 홈 골격.
 *
 * @returns {Promise<{ pageId: number, replaced: boolean }>}
 */
async function applyHome(conn, mallId, mallCode, mallName, sections, overwrite) {
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
        await conn.query(`
            INSERT INTO page_section (page_id, section_type, position, title, sort_order, config_json, is_active)
            VALUES (?, ?, 'main_content', ?, ?, NULL, 1)`,
            [pageId, s.type, s.title || null, sortOrder++]);
    }

    return { pageId, replaced };
}

/**
 * 몰에 프리셋을 적용한다.
 *
 * @param {number} mallId
 * @param {string} presetKey  presets.js 의 키
 * @param {{ mode?: 'create'|'reapply', includeHome?: boolean, actor?: string }} opts
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

    // 메뉴 행 생성은 기존 장치에 맡긴다(트랜잭션 밖 — 멱등하고 pool 을 쓴다).
    await featureMenuSync.ensureMallFeatureMenus(id);

    const conn = await pool.getConnection();
    let home = { pageId: null, replaced: false };
    try {
        await conn.beginTransaction();

        await applyNavigationConfig(conn, id, preset.navigation, overwrite);
        await applyFeatureMenus(conn, id, preset.featureMenus);
        await applyTheme(conn, id, preset.theme, mall.name, overwrite);
        await applySiteSettings(conn, id, mall.name);

        if (includeHome) {
            home = await applyHome(conn, id, mall.code, mall.name, preset.homeSections, overwrite);
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
     * 홈 섹션을 교체했으면 반드시 발행한다. 안 하면 옛 스냅샷이 계속 렌더된다.
     * (새로 만든 페이지는 리비전이 없어 라이브 폴백으로 뜨지만, 발행해 두면 상태가 명확하다)
     */
    let revisionNo = null;
    if (includeHome && home.pageId) {
        revisionNo = await pageBuilderService.publish(home.pageId, opts.actor || 'provisioner');
    }

    // 캐시 무효화 — 안 하면 최대 60초 동안 옛 설정이 나간다.
    mallContext.invalidate();
    themeData.invalidate(id);
    navigationService.invalidateContentGate(id);

    return { preset, created: mode === 'create', homeReplaced: home.replaced, revisionNo };
}

module.exports = { provisionMall, inspect };
