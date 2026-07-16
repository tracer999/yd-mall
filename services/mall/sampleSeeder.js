const pool = require('../../config/db');

/*
 * 샘플 데이터 시더 (몰 빌더 — "샘플 데이터 포함")
 *
 * 갓 만든 몰은 상품이 하나도 없어 리졸버가 전부 null 을 돌려 **메인 화면이 텅 빈다**.
 * 이 시더가 카테고리·브랜드·상품·특가·히어로 슬라이드를 **몰 스코프로 최소한** 심어
 * 몰 생성 직후 첫 화면이 바로 뜨게 한다.
 *
 * 원본은 **리소스 테이블**이다 (sample_category / sample_product / sample_hero_slide).
 * 예전에는 이 파일에 상수로 하드코딩했으나, 납품처마다 샘플을 바꾸려면 코드를 고쳐야 해서
 * 테이블로 옮겼다. 관리 화면: 서비스 관리 → 샘플 데이터 관리 (/admin/service/samples).
 * 스키마·기본 시드: scripts/migrate_sample_resources.sql
 *
 * 원칙
 *   - 최소한. 기본 시드는 카테고리 3 · 브랜드 2 · 상품 6 · 특가 1 · 히어로 슬라이드 4.
 *     (샘플이 많으면 사용자가 지우고 재설정하기 힘들다)
 *   - 몰 스코프. 모든 행에 mall_id. slug 는 몰 고유 접두어 `sm{mallId}-` (products.slug 는 전역 UNIQUE).
 *   - 멱등. 이미 샘플이 있으면 건너뛴다(중복 생성 방지).
 *   - provisionMall(베스트 집계 · 발행) **이전에** 호출해야 첫 스냅샷에 상품이 잡힌다.
 *   - 리소스가 비어 있으면 아무것도 만들지 않고 skip 한다(빈 특가·빈 카테고리 방지).
 *
 * 이미지는 리소스 테이블의 경로를 그대로 쓴다. 반드시 **커밋되는 경로**여야 한다
 * (/images/placeholders/sample/* 또는 /images/sample/*).
 * public/uploads 는 .gitignore 라 배포에 안 실린다 — 정적 이미지는 public/images 에 둔다.
 */

/** 리소스 테이블에서 샘플 원본을 읽어온다. */
async function loadResources() {
    const [categories] = await pool.query(
        `SELECT sample_key, name, image_path FROM sample_category
          WHERE type = 'NORMAL' AND is_active = 1 ORDER BY display_order, id`);
    const [brands] = await pool.query(
        `SELECT sample_key, name, image_path FROM sample_category
          WHERE type = 'BRAND' AND is_active = 1 ORDER BY display_order, id`);
    const [products] = await pool.query(
        `SELECT sample_key, category_key, brand_key, name, short_description,
                price, original_price, badge, main_image, deal_price, is_new
           FROM sample_product WHERE is_active = 1 ORDER BY display_order, id`);
    const [heroes] = await pool.query(
        `SELECT slot, product_key, label, headline, image_path, sort_order
           FROM sample_hero_slide WHERE is_active = 1 ORDER BY slot, sort_order, id`);
    return { categories, brands, products, heroes };
}

/** 이미 이 몰에 샘플이 있는가(멱등 가드) */
async function hasSample(mallId) {
    const [[row]] = await pool.query(
        'SELECT id FROM categories WHERE mall_id = ? AND slug LIKE ? LIMIT 1',
        [mallId, `sm${mallId}-%`]);
    return Boolean(row);
}

/**
 * 몰에 최소 샘플 데이터를 심는다. 멱등(이미 있으면 skip).
 * @returns {Promise<{ seeded: boolean, reason?: string, counts?: object }>}
 */
async function seedSampleData(mallId) {
    const id = Number(mallId);
    if (!Number.isInteger(id) || id <= 0) throw new Error('seedSampleData: 잘못된 mallId');

    if (await hasSample(id)) return { seeded: false, reason: 'already-seeded' };

    const { categories, brands, products, heroes } = await loadResources();
    // 리소스가 없으면 빈 껍데기(카테고리 0 · 빈 특가)를 만들지 않고 그냥 건너뛴다.
    if (!categories.length || !products.length) {
        return { seeded: false, reason: 'no-resources' };
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 1) 카테고리(NORMAL)
        const catIdByKey = {};
        let catOrder = 1;
        for (const c of categories) {
            const [r] = await conn.query(
                `INSERT INTO categories
                   (mall_id, name, slug, parent_id, depth, type, display_order, is_active, pc_visible, mobile_visible, logo_image_path)
                 VALUES (?, ?, ?, NULL, 1, 'NORMAL', ?, 1, 1, 1, ?)`,
                [id, c.name, `sm${id}-${c.sample_key}`, catOrder++, c.image_path]);
            catIdByKey[c.sample_key] = r.insertId;
        }

        // 2) 브랜드(type='BRAND')
        const brandIdByKey = {};
        const brandNameByKey = {};
        let brandOrder = 1;
        for (const b of brands) {
            const [r] = await conn.query(
                `INSERT INTO categories
                   (mall_id, name, slug, parent_id, depth, type, display_order, is_active, pc_visible, mobile_visible, logo_image_path, onboarded_at)
                 VALUES (?, ?, ?, NULL, 1, 'BRAND', ?, 1, 1, 1, ?, CURDATE())`,
                [id, b.name, `sm${id}-brand-${b.sample_key}`, brandOrder++, b.image_path]);
            brandIdByKey[b.sample_key] = r.insertId;
            brandNameByKey[b.sample_key] = b.name;
        }

        // 3) 상품 — 카테고리 키가 유효한 것만(리소스가 어긋나도 시딩이 통째로 실패하지 않게)
        const prodIdByKey = {};
        const seededProducts = [];
        for (const p of products) {
            const categoryId = catIdByKey[p.category_key];
            if (!categoryId) continue;
            const slug = `sm${id}-${p.sample_key}`;
            const original = p.original_price == null ? p.price : p.original_price;
            const discountRate = original > p.price
                ? Math.round((1 - p.price / original) * 100)
                : 0;
            const [r] = await conn.query(
                `INSERT INTO products
                   (mall_id, category_id, brand_category_id, name, product_code, provider, short_description,
                    price, original_price, discount_rate, stock, status, visibility,
                    main_image, thumbnail_image, slug, product_badge, sale_start_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 100, 'ON', 'PUBLIC', ?, ?, ?, ?, ?)`,
                [
                    id, categoryId, brandIdByKey[p.brand_key] || null, p.name, slug.toUpperCase(),
                    brandNameByKey[p.brand_key] || '',
                    p.short_description,
                    p.price, original, discountRate,
                    p.main_image, p.main_image, slug, p.badge || null,
                    p.is_new ? new Date() : null,
                ]);
            prodIdByKey[p.sample_key] = r.insertId;
            seededProducts.push(p);
        }

        // 4) 특가(deal_category + deal + deal_item) — deal_price 가 있는 상품이 하나라도 있을 때만.
        //    (빈 특가전은 화면에 빈 섹션으로 뜨므로 만들지 않는다)
        const dealProducts = seededProducts.filter((p) => p.deal_price != null);
        let dealCount = 0;
        if (dealProducts.length) {
            const [dc] = await conn.query(
                `INSERT INTO deal_category (mall_id, code, name, description, sort_order, is_active)
                 VALUES (?, ?, '오늘의 특가', '샘플 특가전', 0, 1)`,
                [id, `SAMPLE${id}`]);
            const dealCategoryId = dc.insertId;

            const [dl] = await conn.query(
                `INSERT INTO deal (mall_id, deal_category_id, title, subtitle, starts_at, ends_at,
                                   daily_start_time, daily_end_time, weekdays, priority, sort_order, is_active)
                 VALUES (?, ?, '샘플 특가전', '지금 만나는 특가', NOW(), DATE_ADD(NOW(), INTERVAL 60 DAY),
                         NULL, NULL, NULL, 0, 0, 1)`,
                [id, dealCategoryId]);
            const dealId = dl.insertId;

            let dealSort = 0;
            for (const p of dealProducts) {
                await conn.query(
                    `INSERT INTO deal_item (deal_id, product_id, deal_price, qty_limit, sold_qty, sort_order)
                     VALUES (?, ?, ?, NULL, 0, ?)`,
                    [dealId, prodIdByKey[p.sample_key], p.deal_price, dealSort++]);
            }
            dealCount = 1;
        }

        // 5) 히어로 슬라이드(hero_slide) — theme_hero 가 몰 스코프로 읽는다.
        //    product_key 가 실제로 시딩된 상품일 때만 넣는다(FK · 링크 정합성).
        let heroCount = 0;
        for (const h of heroes) {
            const productId = prodIdByKey[h.product_key];
            if (!productId) continue;
            await conn.query(
                `INSERT INTO hero_slide (mall_id, slot, product_id, label, headline, image_url, link_url, sort_order, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [id, h.slot, productId, h.label, h.headline, h.image_path,
                 `/products/sm${id}-${h.product_key}`, h.sort_order]);
            heroCount++;
        }

        await conn.commit();
        return {
            seeded: true,
            counts: {
                categories: Object.keys(catIdByKey).length,
                brands: Object.keys(brandIdByKey).length,
                products: seededProducts.length,
                deals: dealCount,
                heroSlides: heroCount,
            },
        };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = { seedSampleData, hasSample, loadResources };
