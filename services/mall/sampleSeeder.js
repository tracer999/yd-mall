const pool = require('../../config/db');
const skuService = require('../catalog/skuService');

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
 *     ⚠️ 단 **카테고리·브랜드는 예외**다 — 아래 참고.
 *   - 멱등. 이미 샘플이 있으면 건너뛴다(중복 생성 방지).
 *   - provisionMall(베스트 집계 · 발행) **이전에** 호출해야 첫 스냅샷에 상품이 잡힌다.
 *   - 리소스가 비어 있으면 아무것도 만들지 않고 skip 한다(빈 특가·빈 카테고리 방지).
 *
 * 이미지는 리소스 테이블의 경로를 그대로 쓴다. 반드시 **커밋되는 경로**여야 한다
 * (/images/placeholders/sample/* 또는 /images/sample/*).
 * public/uploads 는 .gitignore 라 배포에 안 실린다 — 정적 이미지는 public/images 에 둔다.
 *
 * ── 카테고리·브랜드는 만들지 않고 "공용 것을 가리킨다" ─────────────────────────
 * 예전엔 여기서 categories 에 mall_id=<새 몰> 인 NORMAL/BRAND 행을 새로 INSERT 했다.
 * 그런데 이 저장소는 NORMAL·BRAND 를 **글로벌 한 벌(mall_id=0)** 로 전환했다
 * (categoryController.js:271 · categoryScope.js 의 GLOBAL_CATEGORY_MALL_ID).
 * 시더만 그 전환에서 누락돼, 몰을 찍을 때마다 공용 트리와 무관한 최상위 카테고리가
 * 중복 생성됐다(몰 20개 만들면 '지갑' 20개). 그래서 이제는 **기존 공용 카테고리를
 * 조회해 상품에 물리기만 한다.**
 *
 * 어느 공용 카테고리인지는 `sample_category.global_category_id` 가 정한다
 * (관리자: 서비스 관리 → 샘플 데이터 관리에서 지정). 폴백 순서는 resolveGlobalCategory 참고.
 * 마이그레이션: scripts/migrations/20260720_sample_category_global_ref.sql
 */

/** 공용 카탈로그(카테고리·브랜드)가 사는 mall_id. services/catalog/categoryScope.js 와 같은 값. */
const GLOBAL_CATEGORY_MALL_ID = 0;

/** 리소스 테이블에서 샘플 원본을 읽어온다. */
async function loadResources() {
    const [categories] = await pool.query(
        `SELECT sample_key, name, image_path, global_category_id FROM sample_category
          WHERE type = 'NORMAL' AND is_active = 1 ORDER BY display_order, id`);
    const [brands] = await pool.query(
        `SELECT sample_key, name, image_path, global_category_id FROM sample_category
          WHERE type = 'BRAND' AND is_active = 1 ORDER BY display_order, id`);
    const [products] = await pool.query(
        `SELECT sample_key, category_key, brand_key, name, short_description,
                price, original_price, badge, main_image, deal_price, is_new
           FROM sample_product WHERE is_active = 1 ORDER BY display_order, id`);
    const [heroes] = await pool.query(
        `SELECT slot, product_key, label, headline, image_path, sort_order,
                media_type, mobile_image_path, video_webm_path, video_mp4_path,
                mobile_video_webm_path, mobile_video_mp4_path,
                embed_id, poster_path, autoplay, muted, loop_play, preload
           FROM sample_hero_slide WHERE is_active = 1 ORDER BY slot, sort_order, id`);
    return { categories, brands, products, heroes };
}

/**
 * 이미 이 몰에 샘플이 있는가(멱등 가드).
 *
 * 예전엔 categories 를 봤지만 이제 카테고리를 만들지 않으므로(공용 참조) 절대 걸리지 않는다.
 * 몰 스코프로 남는 것 중 slug 접두어를 갖는 건 products 라 이쪽을 본다.
 */
async function hasSample(mallId) {
    const [[row]] = await pool.query(
        'SELECT id FROM products WHERE mall_id = ? AND slug LIKE ? LIMIT 1',
        [mallId, `sm${mallId}-%`]);
    return Boolean(row);
}

/**
 * 샘플 리소스 1건이 가리킬 **공용 카테고리 id** 를 정한다. 절대 새로 만들지 않는다.
 *
 * 폴백 순서
 *   1) global_category_id 가 실재하고 mall_id=0 · type 일치하면 그대로
 *   2) 아니면 같은 이름의 공용 카테고리 (설치본마다 id 가 달라도 붙게)
 *   3) NORMAL 은 '미분류', BRAND 는 null (브랜드는 없어도 상품이 만들어진다)
 *
 * @returns {Promise<number|null>}
 */
async function resolveGlobalCategory(conn, resource, type) {
    const wanted = Number(resource.global_category_id);
    if (Number.isInteger(wanted) && wanted > 0) {
        const [[hit]] = await conn.query(
            'SELECT id FROM categories WHERE id = ? AND mall_id = ? AND type = ? LIMIT 1',
            [wanted, GLOBAL_CATEGORY_MALL_ID, type]);
        if (hit) return hit.id;
    }

    const [[byName]] = await conn.query(
        'SELECT id FROM categories WHERE mall_id = ? AND type = ? AND name = ? ORDER BY id LIMIT 1',
        [GLOBAL_CATEGORY_MALL_ID, type, resource.name]);
    if (byName) return byName.id;

    if (type === 'BRAND') return null;

    const [[fallback]] = await conn.query(
        `SELECT id FROM categories
          WHERE mall_id = ? AND type = 'NORMAL' AND name = '미분류' ORDER BY id LIMIT 1`,
        [GLOBAL_CATEGORY_MALL_ID]);
    return fallback ? fallback.id : null;
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

        // 1) 카테고리(NORMAL) — 만들지 않고 **공용 카탈로그에서 찾아 쓴다**.
        const catIdByKey = {};
        for (const c of categories) {
            const categoryId = await resolveGlobalCategory(conn, c, 'NORMAL');
            if (categoryId) catIdByKey[c.sample_key] = categoryId;
        }

        // 2) 브랜드(type='BRAND') — 마찬가지로 공용 브랜드를 가리킨다.
        //    브랜드 이름은 products.provider 에 그대로 넣으므로 실제 공용 행의 이름을 쓴다
        //    (샘플 리소스의 이름과 공용 카탈로그의 표기가 다를 수 있다).
        const brandIdByKey = {};
        const brandNameByKey = {};
        for (const b of brands) {
            const brandId = await resolveGlobalCategory(conn, b, 'BRAND');
            if (!brandId) continue;
            const [[row]] = await conn.query('SELECT name FROM categories WHERE id = ?', [brandId]);
            brandIdByKey[b.sample_key] = brandId;
            brandNameByKey[b.sample_key] = row ? row.name : b.name;
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
            /*
             * 대표 SKU 생성 — 빠뜨리면 "보이는데 담을 수 없는" 상품이 된다.
             *
             * 이 저장소는 "항상 SKU" 설계다(설계 §25.1). 재고·가격의 정본은 product_sku 이고
             * 단일상품도 is_default=1 SKU 1행을 반드시 갖는다. SKU 가 없으면
             * skuService.resolveSkuForLine 이 null 을 돌려주고, cartController 가
             * 에러 메시지도 없이 redirect('back') 으로 담기를 삼킨다.
             *
             * 예전에는 이 시더만 SKU 를 만들지 않아(다른 생성 경로는 전부 만든다) 샘플 데이터로
             * 몰을 찍을 때마다 그런 상품이 6건씩 태어났다. 몰 빌더라 새 몰마다 재발했다.
             * 재고 100 은 위 INSERT 의 하드코딩 값과 같아야 한다(대표 SKU 는 products 의 미러).
             */
            await skuService.syncDefaultSkuFromProduct(r.insertId, {
                mall_id: id,
                price: p.price,
                stock: 100,
                purchase_price: 0,
                status: 'ON',
                sku_code: slug.toUpperCase(),
            }, conn);

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
        //    리소스의 *_path 를 hero_slide 의 *_url 로 옮겨 담는다(영상 배너 포함).
        let heroCount = 0;
        for (const h of heroes) {
            const productId = prodIdByKey[h.product_key];
            if (!productId) continue;
            await conn.query(
                `INSERT INTO hero_slide
                   (mall_id, slot, media_type, product_id, label, headline,
                    image_url, mobile_image_url, video_webm_url, video_mp4_url,
                    mobile_video_webm_url, mobile_video_mp4_url,
                    embed_id, poster_url, autoplay, muted, loop_play, preload,
                    link_url, sort_order, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [id, h.slot, h.media_type || 'IMAGE', productId, h.label, h.headline,
                 h.image_path, h.mobile_image_path, h.video_webm_path, h.video_mp4_path,
                 h.mobile_video_webm_path, h.mobile_video_mp4_path,
                 h.embed_id, h.poster_path, h.autoplay, h.muted, h.loop_play, h.preload,
                 `/products/sm${id}-${h.product_key}`, h.sort_order]);
            heroCount++;
        }

        await conn.commit();
        return {
            seeded: true,
            counts: {
                // 카테고리·브랜드는 "만든 개수"가 아니라 **연결된 공용 카테고리 개수**다.
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
