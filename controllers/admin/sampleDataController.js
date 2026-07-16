const pool = require('../../config/db');

/*
 * 샘플 데이터 관리 (서비스 관리 하위 · super_admin)
 *   /admin/service/samples
 *
 * 몰 생성 시 "샘플 데이터 포함"을 켜면 services/mall/sampleSeeder.js 가 여기 리소스를
 * 새 몰로 복제한다. 즉 이 화면은 **납품본의 첫인상**을 결정한다.
 *
 * ⚠️ 이 리소스는 몰과 무관한 전역 데이터다(mall_id 없음). 납품 시 몰이 0개여도 존재해야
 *    하므로 특정 몰의 데이터를 참조하지 않는다. 여기서 바꾼 값은 **앞으로 생성될 몰**에만
 *    적용된다(이미 만든 몰은 바뀌지 않는다).
 *
 * ⚠️ 이미지 경로는 반드시 커밋되는 경로여야 한다(/images/...). /uploads/ 는 .gitignore 라
 *    납품본에서 깨진다 — 저장 시 검증한다.
 *
 * 스키마·기본 시드: scripts/migrate_sample_resources.sql
 */

const BASE = '/admin/service/samples';

function toArray(v) {
    if (v === undefined || v === null) return [];
    return Array.isArray(v) ? v : [v];
}

function toInt(v, fallback = 0) {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
}

function cleanStr(v, max) {
    const s = String(v == null ? '' : v).trim();
    return s.length > max ? s.slice(0, max) : s;
}

/** 이미지 경로 검증 — 비었거나 /images/ 로 시작해야 한다. */
function validImagePath(p) {
    const s = String(p || '').trim();
    if (!s) return true;
    return s.startsWith('/images/');
}

exports.getSamples = async (req, res) => {
    try {
        const [categories] = await pool.query(
            `SELECT id, sample_key, type, name, image_path, display_order, is_active
               FROM sample_category WHERE type = 'NORMAL' ORDER BY display_order, id`);
        const [brands] = await pool.query(
            `SELECT id, sample_key, type, name, image_path, display_order, is_active
               FROM sample_category WHERE type = 'BRAND' ORDER BY display_order, id`);
        const [products] = await pool.query(
            `SELECT id, sample_key, category_key, brand_key, name, price, original_price,
                    badge, main_image, deal_price, is_new, display_order, is_active
               FROM sample_product ORDER BY display_order, id`);
        const [heroes] = await pool.query(
            `SELECT id, slot, product_key, label, headline, image_path, sort_order, is_active
               FROM sample_hero_slide ORDER BY slot, sort_order, id`);

        res.render('admin/service/samples', {
            layout: 'layouts/admin_layout',
            title: '샘플 데이터 관리',
            subtitle: '몰 생성 시 "샘플 데이터 포함"으로 새 몰에 복제되는 원본입니다. 이미 만들어진 몰에는 영향이 없습니다.',
            categories, brands, products, heroes,
            saved: req.query.saved === '1',
            msg: req.query.msg || '',
            error: req.query.error || '',
        });
    } catch (e) {
        console.error('[samples] getSamples:', e.message);
        res.status(500).send('샘플 데이터 화면을 불러오지 못했습니다: ' + e.message);
    }
};

/** POST /admin/service/samples — 카테고리·브랜드·상품·히어로 일괄 저장 */
exports.postSaveSamples = async (req, res) => {
    const conn = await pool.getConnection();
    try {
        // 이미지 경로 사전 검증(하나라도 어긋나면 저장 안 함 — 납품본 이미지 깨짐 방지)
        const allImages = [
            ...toArray(req.body.cat_image), ...toArray(req.body.prod_image), ...toArray(req.body.hero_image),
        ];
        const bad = allImages.find((p) => !validImagePath(p));
        if (bad !== undefined) {
            return res.redirect(`${BASE}?error=` + encodeURIComponent(
                `이미지 경로는 /images/ 로 시작해야 합니다 (입력값: ${bad}). /uploads/ 는 배포본에 실리지 않습니다.`));
        }

        await conn.beginTransaction();

        // 1) 카테고리 + 브랜드 (같은 테이블)
        const catIds = toArray(req.body.cat_id);
        const catNames = toArray(req.body.cat_name);
        const catImages = toArray(req.body.cat_image);
        const catOrders = toArray(req.body.cat_order);
        const catActive = new Set(toArray(req.body.cat_active).map(String));
        for (let i = 0; i < catIds.length; i++) {
            const id = toInt(catIds[i]);
            if (!id) continue;
            await conn.query(
                `UPDATE sample_category SET name = ?, image_path = ?, display_order = ?, is_active = ?
                  WHERE id = ?`,
                [cleanStr(catNames[i], 100), cleanStr(catImages[i], 255) || null,
                 toInt(catOrders[i]), catActive.has(String(id)) ? 1 : 0, id]);
        }

        // 2) 상품
        const pIds = toArray(req.body.prod_id);
        const pNames = toArray(req.body.prod_name);
        const pPrices = toArray(req.body.prod_price);
        const pOriginals = toArray(req.body.prod_original);
        const pBadges = toArray(req.body.prod_badge);
        const pImages = toArray(req.body.prod_image);
        const pDeals = toArray(req.body.prod_deal);
        const pOrders = toArray(req.body.prod_order);
        const pActive = new Set(toArray(req.body.prod_active).map(String));
        const pNew = new Set(toArray(req.body.prod_new).map(String));
        for (let i = 0; i < pIds.length; i++) {
            const id = toInt(pIds[i]);
            if (!id) continue;
            const dealRaw = String(pDeals[i] == null ? '' : pDeals[i]).trim();
            await conn.query(
                `UPDATE sample_product
                    SET name = ?, price = ?, original_price = ?, badge = ?, main_image = ?,
                        deal_price = ?, is_new = ?, display_order = ?, is_active = ?
                  WHERE id = ?`,
                [cleanStr(pNames[i], 255), toInt(pPrices[i]), toInt(pOriginals[i]),
                 cleanStr(pBadges[i], 20) || null, cleanStr(pImages[i], 255) || null,
                 dealRaw === '' ? null : toInt(dealRaw),
                 pNew.has(String(id)) ? 1 : 0, toInt(pOrders[i]),
                 pActive.has(String(id)) ? 1 : 0, id]);
        }

        // 3) 히어로 슬라이드
        const hIds = toArray(req.body.hero_id);
        const hLabels = toArray(req.body.hero_label);
        const hHeadlines = toArray(req.body.hero_headline);
        const hImages = toArray(req.body.hero_image);
        const hOrders = toArray(req.body.hero_order);
        const hActive = new Set(toArray(req.body.hero_active).map(String));
        for (let i = 0; i < hIds.length; i++) {
            const id = toInt(hIds[i]);
            if (!id) continue;
            await conn.query(
                `UPDATE sample_hero_slide SET label = ?, headline = ?, image_path = ?, sort_order = ?, is_active = ?
                  WHERE id = ?`,
                [cleanStr(hLabels[i], 50) || null, cleanStr(hHeadlines[i], 200) || null,
                 cleanStr(hImages[i], 255) || null, toInt(hOrders[i]),
                 hActive.has(String(id)) ? 1 : 0, id]);
        }

        await conn.commit();
        res.redirect(`${BASE}?saved=1`);
    } catch (e) {
        await conn.rollback();
        console.error('[samples] postSaveSamples:', e.message);
        res.redirect(`${BASE}?error=` + encodeURIComponent(e.message));
    } finally {
        conn.release();
    }
};

/** POST /admin/service/samples/:kind/:id/delete — 샘플 리소스 1건 삭제 */
exports.postDeleteSample = async (req, res) => {
    const TABLE_BY_KIND = {
        category: 'sample_category',
        product: 'sample_product',
        hero: 'sample_hero_slide',
    };
    const table = TABLE_BY_KIND[req.params.kind];
    const id = toInt(req.params.id);
    if (!table || !id) return res.redirect(`${BASE}?error=` + encodeURIComponent('잘못된 요청입니다.'));
    try {
        await pool.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
        res.redirect(`${BASE}?msg=` + encodeURIComponent('삭제되었습니다.'));
    } catch (e) {
        res.redirect(`${BASE}?error=` + encodeURIComponent(e.message));
    }
};
