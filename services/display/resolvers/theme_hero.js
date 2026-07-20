const pool = require('../../../config/db');
const dealSvc = require('../../deal/dealService');
const bestRankingService = require('../../best/bestRankingService');

/*
 * theme_hero — 테마별 히어로.
 *
 * config.layout 으로 표현과 **데이터 소스**를 함께 가른다:
 *   showcase  — 상품 쇼케이스(테마1). hero_slide(상품 연결). hero_showcase 재사용.
 *   banner    — 전체폭 이미지 배너 슬라이드(테마2). banners(banner_type='MAIN'). hero_banner 재사용.
 *   editorial — 풀블리드 대형 히어로(테마3). hero_slide. 전용 마크업.
 *
 * 테마1/3 이 hero_slide, 테마2 가 banners 인 건 "상품 배너 / 일반 배너" 구분 그대로다.
 * 예전엔 banners 에 mall_id 가 없어 세 레이아웃이 전부 hero_slide 를 읽었고, 그래서 테마2가
 * 테마1과 같은 소스를 보게 되어 구분이 사라졌다. mall_id 추가 후 원래 의도대로 되돌린다.
 * (20260720_banners_mall_scope.sql)
 *
 * 슬라이드가 하나도 없으면 null 을 돌려 섹션을 통째로 스킵한다(빈 히어로 방지).
 */
async function resolve({ shared, config, locals }) {
    const mallId = shared.mallId || 1;
    const layout = ['showcase', 'banner', 'editorial'].includes(config.layout) ? config.layout : 'banner';

    if (layout === 'banner') return resolveBannerLayout({ mallId, layout, locals, hasUser: shared.hasUser });

    const [slides] = await pool.query(`
        SELECT hs.id, hs.slot, hs.label, hs.headline, hs.image_url, hs.link_url, hs.sort_order,
               hs.media_type, hs.mobile_image_url, hs.video_webm_url, hs.video_mp4_url,
               hs.mobile_video_webm_url, hs.mobile_video_mp4_url,
               hs.embed_id, hs.poster_url, hs.autoplay, hs.muted, hs.loop_play, hs.preload,
               p.id AS product_id, p.name AS product_name, p.slug, p.main_image,
               p.price, p.original_price, p.discount_rate, p.status, p.stock, p.provider
          FROM hero_slide hs
          LEFT JOIN products p ON p.id = hs.product_id
         WHERE hs.is_active = 1 AND hs.mall_id = ?
         ORDER BY hs.slot ASC, hs.sort_order ASC, hs.id ASC
    `, [mallId]);

    // 히어로에 물린 상품도 특가가로 노출한다(상품 미연결 슬라이드는 applyDeals 가 건너뛴다).
    await dealSvc.applyDeals(slides, { idKey: 'product_id' });

    let mainSlides = slides.filter((s) => s.slot === 'MAIN');
    let feature = slides.find((s) => s.slot === 'FEATURE') || null;

    /*
     * 수동 등록이 없으면 베스트 랭킹으로 자동 구성한다(자동 + 수동 병행).
     *
     * 수동 슬라이드가 하나라도 있으면 그것이 우선이다 — 운영자가 고른 걸 자동이 덮으면 안 된다.
     * 예전엔 여기서 곧장 null 을 돌려 섹션을 스킵했다. 그래서 새로 찍어낸 몰은 히어로가 통째로
     * 비었고, 시드 스크립트가 hero_slide 를 채워준 몰만 "자동으로 채워진" 것처럼 보였다.
     */
    if (mainSlides.length === 0) {
        const auto = await buildAutoBestSlides(mallId, shared.hasUser);
        if (auto.mainSlides.length === 0) return null;
        mainSlides = auto.mainSlides;
        if (!feature) feature = auto.feature;
        locals.heroAuto = true; // 뷰·관리자가 "자동 구성 중"임을 알 수 있게
    }

    locals.layout = layout;
    locals.mainSlides = mainSlides;
    locals.feature = feature;

    await applyMarquee(mallId, locals);
    return locals;
}

/* 자동 구성 시 중앙 슬라이더에 쓸 상품 수 — 캡쳐 기준(5~7)의 중앙값. */
const AUTO_MAIN_COUNT = 6;

/*
 * 베스트 랭킹 상위 상품으로 히어로 슬라이드를 만든다.
 *
 * best_ranking 스냅샷을 읽는 best_ranking 리졸버와 같은 소스를 쓴다 — 홈 베스트 섹션과
 * 히어로가 서로 다른 상품을 보여주면 운영자가 원인을 못 찾는다.
 * hero_slide 행 모양으로 맞춰 돌려주므로 뷰는 수동/자동을 구분하지 않아도 된다.
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
            limit: AUTO_MAIN_COUNT + 1, // 마지막 1건은 우측 FEATURE 카드로
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
 * 테마2 — 일반(이미지) 배너 슬라이드 + 우측 피처 카드.
 *
 * 배너 본문 소스는 banners(banner_type='MAIN', 몰 스코프) — 상품과 무관한 순수 이미지 배너다.
 * 우측 피처 카드만은 상품 카드라서 hero_slide(slot='FEATURE')에서 따로 가져온다.
 * 캡쳐 구조상 테마1·2 모두 오른쪽 카드가 있었는데, 예전엔 여기서 feature 를 null 로 박아
 * 테마2로 바꾸면 우측 카드가 사라졌다.
 */
async function resolveBannerLayout({ mallId, layout, locals, hasUser }) {
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

    if (banners.length === 0) return null;

    locals.layout = layout;
    locals.mainSlides = banners;
    locals.feature = await resolveFeatureSlide(mallId, hasUser);

    await applyMarquee(mallId, locals);
    return locals;
}

/*
 * 우측 피처 카드 한 장 — 수동 등록(hero_slide slot='FEATURE') 우선, 없으면 베스트 1위.
 * 상품 카드라서 배너(banners)가 아니라 hero_slide/랭킹에서 가져온다.
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
 * 하단 흐름문구(마퀴) — 에디토리얼 표현에서만 뷰가 사용한다.
 * 소스는 site_settings(배너 관리 > 메인 슬라이더 화면에서 편집). 발행 스냅샷을 거치지 않으므로
 * 관리자가 저장하면 즉시 반영된다. 몰 행이 없으면 기본몰(1) 폴백 — siteSettings 미들웨어와 동일 규칙.
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

module.exports = { resolve };
