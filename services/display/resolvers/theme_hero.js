const pool = require('../../../config/db');
const dealSvc = require('../../deal/dealService');
const bestRankingService = require('../../best/bestRankingService');

/*
 * theme_hero — 홈 최상단 히어로.
 *
 * 축이 둘이고 서로 **독립**이다. 예전엔 config.layout 하나가 배치와 데이터 소스를 함께
 * 정해서, 테마를 바꾸면 등록해 둔 배너·상품이 통째로 안 보였다("테마 바꿨더니 다 깨짐").
 *
 *   ① 배치(테마)  page_section.config_json.layout
 *        split_feature — 좌 히어로 + 우 상품 카드 (테마1)
 *        full_width    — 전체폭 (테마2)
 *        full_bleed    — 풀블리드 + 오버레이 헤더 (테마3)
 *
 *   ② 콘텐츠      site_settings.hero_variant  ← 배너 관리 > 메인 슬라이더에서 고른다
 *        product_showcase — 상품 쇼케이스. hero_slide(slot=MAIN) → 없으면 베스트 상위 N 자동
 *        full_banner      — 이미지 배너. banners(banner_type='MAIN')
 *
 * 우측 카드(split_feature 전용)는 hero_slide(slot=FEATURE) 등록분 우선, 없으면 베스트 1위.
 *
 * 노출할 게 하나도 없으면 null 을 돌려 섹션을 통째로 스킵한다(빈 히어로 방지).
 * 관리자에게는 "상품을 선택해 주세요" 안내가 메인 슬라이더 화면에 뜬다.
 */

const LAYOUTS = ['split_feature', 'full_width', 'full_bleed'];
const DEFAULT_LAYOUT = 'full_width';

/* 예전 layout 값 → 새 배치 값. 발행 스냅샷에 옛 값이 남아 있어도 화면이 깨지지 않게 한다. */
const LEGACY_LAYOUT = {
    showcase: 'split_feature',
    banner: 'full_width',
    editorial: 'full_bleed',
};

const SOURCES = ['product_showcase', 'full_banner'];
const DEFAULT_SOURCE = 'full_banner'; // mainController 의 폴백과 같아야 한다

/*
 * 중앙 슬라이더 상품 수 상한 — 수동 선택·자동 구성 모두 여기에 맞춘다.
 * 썸네일 스트립이 데스크톱에서 한 줄에 보여 줄 수 있는 개수이기도 하다
 * (hero_showcase_main.ejs 의 breakpoints 와 같은 값이어야 넘치지 않는다).
 */
const MAX_MAIN_SLIDES = 7;
/* 자동 구성 시 중앙 슬라이더에 쓸 상품 수. 우측 카드용 1건은 따로 더 받는다. */
const AUTO_MAIN_COUNT = MAX_MAIN_SLIDES;

function normalizeLayout(raw) {
    if (LAYOUTS.includes(raw)) return raw;
    if (LEGACY_LAYOUT[raw]) return LEGACY_LAYOUT[raw];
    return DEFAULT_LAYOUT;
}

async function resolve({ shared, config, locals }) {
    const mallId = shared.mallId || 1;
    const layout = normalizeLayout(config.layout);
    const source = await resolveSource(mallId);

    const mainSlides = source === 'product_showcase'
        ? await loadProductSlides(mallId, shared.hasUser)
        : await loadBannerSlides(mallId);

    if (mainSlides.length === 0) return null;

    locals.layout = layout;
    locals.source = source;
    locals.mainSlides = mainSlides;
    // 우측 카드는 split_feature 배치에서만 쓴다 — 다른 배치에서 조회하면 헛일이다.
    locals.feature = layout === 'split_feature'
        ? await resolveFeatureSlide(mallId, shared.hasUser)
        : null;

    await applyMarquee(mallId, locals);
    return locals;
}

/* 이 몰의 히어로 콘텐츠 종류. site_settings 행이 없으면 기본몰(1) 폴백 — siteSettings 미들웨어와 동일 규칙. */
async function resolveSource(mallId) {
    const [rows] = await pool.query(
        `SELECT hero_variant FROM site_settings
          WHERE mall_id IN (?, 1) ORDER BY (mall_id = ?) DESC LIMIT 1`,
        [mallId, mallId]
    );
    const v = rows[0] && rows[0].hero_variant;
    return SOURCES.includes(v) ? v : DEFAULT_SOURCE;
}

/*
 * 상품 쇼케이스 — 운영자가 고른 상품(hero_slide) 우선, 없으면 베스트 상위 N 자동.
 * 둘 다 없으면 빈 배열 → 섹션 스킵.
 */
async function loadProductSlides(mallId, hasUser) {
    const [slides] = await pool.query(`
        SELECT hs.id, hs.slot, hs.label, hs.headline, hs.image_url, hs.link_url, hs.sort_order,
               hs.media_type, hs.mobile_image_url, hs.video_webm_url, hs.video_mp4_url,
               hs.mobile_video_webm_url, hs.mobile_video_mp4_url,
               hs.embed_id, hs.poster_url, hs.autoplay, hs.muted, hs.loop_play, hs.preload,
               p.id AS product_id, p.name AS product_name, p.slug, p.main_image,
               p.price, p.original_price, p.discount_rate, p.status, p.stock, p.provider
          FROM hero_slide hs
          LEFT JOIN products p ON p.id = hs.product_id
         WHERE hs.is_active = 1 AND hs.mall_id = ? AND hs.slot = 'MAIN'
         ORDER BY hs.sort_order ASC, hs.id ASC
         LIMIT ?
    `, [mallId, MAX_MAIN_SLIDES]);

    if (slides.length > 0) {
        // 히어로에 물린 상품도 특가가로 노출한다(상품 미연결 슬라이드는 applyDeals 가 건너뛴다).
        await dealSvc.applyDeals(slides, { idKey: 'product_id' });
        return slides;
    }
    const auto = await buildAutoBestSlides(mallId, hasUser);
    return auto.mainSlides;
}

/* 이미지 배너 — banners(banner_type='MAIN', 몰 스코프). 상품과 무관한 순수 이미지다. */
async function loadBannerSlides(mallId) {
    const [banners] = await pool.query(`
        SELECT id, title, image_url, mobile_image_url, link_url, display_order,
               overlay_title, overlay_subtitle, overlay_button_text, overlay_button_color, overlay_align
          FROM banners
         WHERE is_active = 1 AND banner_type = 'MAIN' AND mall_id = ?
           AND (start_date IS NULL OR start_date <= CURDATE())
           AND (end_date IS NULL OR end_date >= CURDATE())
         ORDER BY display_order ASC, id ASC
         LIMIT 10
    `, [mallId]);
    return banners;
}

/*
 * 우측 피처 카드 한 장 — 운영자가 등록한 FEATURE 슬라이드 우선, 없으면 베스트 1위.
 * 콘텐츠가 이미지 배너여도 이 카드만은 상품 카드다(캡쳐 구조).
 */
async function resolveFeatureSlide(mallId, hasUser) {
    const [rows] = await pool.query(`
        SELECT hs.id, hs.slot, hs.label, hs.headline, hs.image_url, hs.link_url,
               p.id AS product_id, p.name AS product_name, p.slug, p.main_image,
               p.price, p.original_price, p.discount_rate, p.status, p.stock, p.provider
          FROM hero_slide hs
          LEFT JOIN products p ON p.id = hs.product_id
         WHERE hs.is_active = 1 AND hs.mall_id = ? AND hs.slot = 'FEATURE'
         ORDER BY hs.sort_order ASC, hs.id ASC
         LIMIT 1
    `, [mallId]);

    if (rows.length) {
        await dealSvc.applyDeals(rows, { idKey: 'product_id' });
        return rows[0];
    }
    const auto = await buildAutoBestSlides(mallId, hasUser);
    return auto.feature || (auto.mainSlides.length ? auto.mainSlides[0] : null);
}

/*
 * 베스트 랭킹 상위 상품으로 슬라이드를 만든다(운영자 선택이 없을 때의 폴백).
 *
 * 홈 베스트 섹션과 같은 best_ranking 스냅샷을 읽는다 — 히어로와 베스트 섹션이 서로 다른
 * 상품을 보여주면 운영자가 원인을 못 찾는다.
 * 아직 집계 전이면 빈 배열 → 섹션 스킵(관리자 화면이 "상품을 선택해 주세요"로 안내한다).
 */
async function buildAutoBestSlides(mallId, hasUser) {
    const empty = { mainSlides: [], feature: null };
    try {
        const [[group]] = await pool.query(
            `SELECT id FROM best_group
              WHERE mall_id = ? AND is_active = 1 AND group_type = 'ALL'
              ORDER BY sort_order, id LIMIT 1`,
            [mallId]
        );
        if (!group) return empty;

        const { products } = await bestRankingService.getRanking({
            mallId,
            groupId: group.id,
            period: 'DAILY',
            hasUser: !!hasUser,
            limit: AUTO_MAIN_COUNT + 1, // 마지막 1건은 우측 피처 카드로
        });
        if (!products || products.length === 0) return empty;

        const toSlide = (p, i, slot) => ({
            id: `auto-${p.id}`,
            slot,
            label: null,          // 뷰가 비면 공급사명으로 폴백한다
            headline: null,       // 비면 상품명
            image_url: null,      // 비면 상품 대표이미지
            link_url: null,       // 비면 상품 상세
            sort_order: i,
            media_type: 'IMAGE',
            isAuto: true,
            product_id: p.id,
            product_name: p.name,
            slug: p.slug,
            main_image: p.main_image,
            price: p.price,
            original_price: p.original_price,
            discount_rate: p.discount_rate,
            status: p.status,
            stock: p.stock,
            provider: p.provider,
        });

        const mainSlides = products.slice(0, AUTO_MAIN_COUNT).map((p, i) => toSlide(p, i, 'MAIN'));
        const featureProduct = products[AUTO_MAIN_COUNT] || null;
        return {
            mainSlides,
            feature: featureProduct ? toSlide(featureProduct, 0, 'FEATURE') : null,
        };
    } catch (err) {
        // 랭킹이 아직 집계 전이거나 테이블이 없어도 홈은 떠야 한다 — 섹션만 스킵된다.
        console.error('[theme_hero] 자동 베스트 히어로 구성 실패:', err.message);
        return empty;
    }
}

/*
 * 하단 흐름문구(마퀴) — full_bleed 배치에서만 뷰가 사용한다.
 * 소스는 site_settings(배너 관리 > 메인 슬라이더 화면에서 편집). 발행 스냅샷을 거치지 않으므로
 * 관리자가 저장하면 즉시 반영된다. 몰 행이 없으면 기본몰(1) 폴백.
 */
async function applyMarquee(mallId, locals) {
    const [ssRows] = await pool.query(
        `SELECT marquee_enabled, marquee_text, marquee_speed FROM site_settings
          WHERE mall_id IN (?, 1) ORDER BY (mall_id = ?) DESC LIMIT 1`,
        [mallId, mallId]
    );
    const ss = ssRows[0] || {};
    const rawText = (ss.marquee_text != null && String(ss.marquee_text).trim())
        ? String(ss.marquee_text)
        : '전 상품 무료배송\n신규 회원 15% 쿠폰\n당일 출고';
    const items = rawText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const spd = Number(ss.marquee_speed);
    locals.marqueeEnabled = Number(ss.marquee_enabled) !== 0 && items.length > 0;
    locals.marqueeItems = items;
    locals.marqueeSpeed = (Number.isFinite(spd) && spd >= 5 && spd <= 120) ? spd : 28;
}

module.exports = {
    resolve,
    // 관리자 화면이 같은 규칙을 쓰도록 공개한다(값·폴백이 갈리면 미리보기가 거짓말을 한다).
    LAYOUTS,
    LEGACY_LAYOUT,
    SOURCES,
    DEFAULT_LAYOUT,
    DEFAULT_SOURCE,
    MAX_MAIN_SLIDES,
    AUTO_MAIN_COUNT,
    normalizeLayout,
};
