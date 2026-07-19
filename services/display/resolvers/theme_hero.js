const pool = require('../../../config/db');
const dealSvc = require('../../deal/dealService');

/*
 * theme_hero — 테마별 히어로(몰 스코프 hero_slide 기반).
 *
 * 기존 hero 섹션은 variant 를 siteSettings/쿼리로 전역 결정하고 full_banner 는 **전역 banners**
 * 테이블을 읽어 몰 간 격리가 안 된다. theme_hero 는 몰 스코프 hero_slide 만 읽어 몰마다 독립적이다.
 *
 * config.layout 으로 표현을 가른다(뷰에서 분기):
 *   showcase  — 상품 쇼케이스(테마1). hero_showcase 재사용.
 *   banner    — 전체폭 이미지 배너 슬라이드(테마2). hero_banner 재사용.
 *   editorial — 풀블리드 대형 히어로(테마3). 전용 마크업.
 *
 * MAIN 슬라이드가 하나도 없으면 null 을 돌려 섹션을 통째로 스킵한다(빈 히어로 방지).
 */
async function resolve({ shared, config, locals }) {
    const mallId = shared.mallId || 1;
    const layout = ['showcase', 'banner', 'editorial'].includes(config.layout) ? config.layout : 'banner';

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

    const mainSlides = slides.filter((s) => s.slot === 'MAIN');
    const feature = slides.find((s) => s.slot === 'FEATURE') || null;
    if (mainSlides.length === 0) return null;

    locals.layout = layout;
    locals.mainSlides = mainSlides;
    locals.feature = feature;

    // 하단 흐름문구(마퀴) — 에디토리얼 표현에서만 뷰가 사용한다.
    // 소스는 site_settings(배너 관리 > 메인 슬라이더 화면에서 편집). 발행 스냅샷을 거치지 않으므로
    // 관리자가 저장하면 즉시 반영된다. 몰 행이 없으면 기본몰(1) 폴백 — siteSettings 미들웨어와 동일 규칙.
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

    return locals;
}

module.exports = { resolve };
