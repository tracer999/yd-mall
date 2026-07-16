const pool = require('../../config/db');
const brandStat = require('../../services/brand/brandStatService');
const { toInitial, toChosung, INITIAL_BUCKETS } = require('../../shared/hangul');

/*
 * 브랜드 관리 — 브랜드 허브(/brands)의 운영 화면
 *
 * 설계: docs/사이트개선/brand_hub_dev_plan.md §6
 *
 * 브랜드 마스터는 categories(type='BRAND') 이고, 브랜드 전용 속성은 brand_profile 이
 * 1:1 로 확장한다. 카테고리 트리 화면(/admin/categories)은 계층·활성만 다루므로
 * 영문명·별칭·공식여부·스토리 같은 확장 속성은 여기서 편집한다.
 *
 * 상품 수·인기 점수·혜택 수는 brand_stat(집계 캐시)에서 읽는다. 화면이 직접 집계하지 않는다.
 */

const PAGE_SIZE = 30;

/** GET /admin/brands */
exports.getList = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const q = (req.query.q || '').trim();
        const official = req.query.official === '1' ? 1 : req.query.official === '0' ? 0 : null;
        const sort = ['count', 'name', 'popular', 'new'].includes(req.query.sort) ? req.query.sort : 'count';
        const page = Math.max(1, Number(req.query.page) || 1);

        const where = ["c.type = 'BRAND'", 'c.mall_id = ?'];
        const params = [mallId];
        if (q) {
            where.push('(c.name LIKE ? OR bp.name_en LIKE ? OR bp.alias LIKE ? OR bp.initial_chosung LIKE ?)');
            const like = `%${q}%`;
            params.push(like, like, like, `%${toChosung(q)}%`);
        }
        if (official !== null) {
            where.push('COALESCE(bp.official_yn, 0) = ?');
            params.push(official);
        }
        const whereSql = `WHERE ${where.join(' AND ')}`;

        const order = {
            count: 'COALESCE(s.product_count, 0) DESC, c.name ASC',
            name: 'c.name ASC',
            popular: 'COALESCE(s.popularity_score, 0) DESC, COALESCE(s.product_count, 0) DESC',
            new: 'c.onboarded_at DESC'
        }[sort];

        const [[{ total }]] = await pool.query(`
            SELECT COUNT(*) AS total
              FROM categories c
              LEFT JOIN brand_profile bp ON bp.category_id = c.id
             ${whereSql}
        `, params);

        const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const cur = Math.min(page, pages);

        const [brands] = await pool.query(`
            SELECT c.id, c.name, c.logo_image_path, c.is_active, c.onboarded_at, c.display_order,
                   bp.name_en, bp.initial, bp.official_yn, bp.shop_enabled, bp.is_seller, bp.seller_name,
                   s.product_count, s.popularity_score, s.benefit_count, s.top_category_id,
                   tc.name AS top_category_name
              FROM categories c
              LEFT JOIN brand_profile bp ON bp.category_id = c.id
              LEFT JOIN brand_stat s ON s.category_id = c.id
              LEFT JOIN categories tc ON tc.id = s.top_category_id
             ${whereSql}
             ORDER BY ${order}
             LIMIT ? OFFSET ?
        `, [...params, PAGE_SIZE, (cur - 1) * PAGE_SIZE]);

        // 집계가 언제 돌았는지 — 상품 수가 실제와 어긋나 보일 때 운영자가 확인할 근거
        const [[stat]] = await pool.query(
            'SELECT MAX(calculated_at) AS calculated_at, COUNT(*) AS n FROM brand_stat WHERE mall_id = ?',
            [mallId]
        );

        res.render('admin/brands/list', {
            layout: 'layouts/admin_layout',
            title: '브랜드 관리',
            brands,
            filters: { q, official, sort },
            pagination: { total, page: cur, pages },
            stat,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (err) {
        console.error('[admin/brands] 목록 실패', err);
        res.status(500).send('Server Error');
    }
};

/**
 * GET /admin/brands/search.json — 브랜드 자동완성 (다른 관리자 화면에서 브랜드를 고를 때)
 *
 * 브랜드가 1,379개라 드롭다운으로 못 쓴다. 기획전의 '브랜드 귀속' 선택 등에서 호출한다.
 */
exports.searchJson = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const q = String(req.query.q || '').trim();
        if (!q) return res.json({ brands: [] });
        const like = `%${q}%`;
        const [brands] = await pool.query(`
            SELECT c.id, c.name, c.logo_image_path, bp.name_en, s.product_count
              FROM categories c
              LEFT JOIN brand_profile bp ON bp.category_id = c.id
              LEFT JOIN brand_stat s ON s.category_id = c.id
             WHERE c.type = 'BRAND' AND c.mall_id = ?
               AND (c.name LIKE ? OR bp.name_en LIKE ? OR bp.alias LIKE ? OR bp.initial_chosung LIKE ?)
             ORDER BY COALESCE(s.product_count, 0) DESC
             LIMIT 15
        `, [mallId, like, like, like, `%${toChosung(q)}%`]);
        res.json({ brands });
    } catch (err) {
        console.error('[admin/brands] 검색 실패', err);
        res.status(500).json({ brands: [] });
    }
};

/** GET /admin/brands/:id */
exports.getEdit = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const id = Number(req.params.id);
        const [[brand]] = await pool.query(`
            SELECT c.id, c.name, c.logo_image_path, c.is_active, c.display_order, c.onboarded_at, c.description,
                   bp.name_en, bp.alias, bp.initial, bp.initial_chosung, bp.tagline, bp.story,
                   bp.country, bp.official_yn, bp.shop_enabled, bp.hero_image_url,
                   bp.seo_title, bp.seo_description, bp.seller_name, bp.is_seller,
                   s.product_count, s.popularity_score, s.benefit_count, s.calculated_at
              FROM categories c
              LEFT JOIN brand_profile bp ON bp.category_id = c.id
              LEFT JOIN brand_stat s ON s.category_id = c.id
             WHERE c.id = ? AND c.type = 'BRAND' AND c.mall_id = ?
        `, [id, mallId]);
        if (!brand) return res.status(404).send('Not Found');

        // 이 브랜드가 취급하는 카테고리 (파생값 — 읽기 전용)
        const [categories] = await pool.query(`
            SELECT c.name, bcs.product_count
              FROM brand_category_stat bcs
              JOIN categories c ON c.id = bcs.cat_id
             WHERE bcs.mall_id = ? AND bcs.category_id = ?
             ORDER BY bcs.product_count DESC LIMIT 20
        `, [mallId, id]);

        res.render('admin/brands/form', {
            layout: 'layouts/admin_layout',
            title: `브랜드 · ${brand.name}`,
            brand,
            categories,
            initialBuckets: INITIAL_BUCKETS,
            success: req.query.success || null
        });
    } catch (err) {
        console.error('[admin/brands] 편집 실패', err);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/brands/:id */
exports.postUpdate = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = Number(req.params.id);
    const conn = await pool.getConnection();
    try {
        const [[owned]] = await conn.query(
            "SELECT id, name FROM categories WHERE id = ? AND type = 'BRAND' AND mall_id IN (0, ?)", [id, mallId]
        );
        if (!owned) return res.status(404).send('Not Found');

        const b = req.body;
        await conn.beginTransaction();

        // 브랜드명·입점일은 마스터(categories)에 남는다 — 다른 화면이 이 컬럼을 본다
        await conn.query(
            'UPDATE categories SET name = ?, onboarded_at = ?, is_active = ? WHERE id = ?',
            [
                (b.name || owned.name).trim(),
                b.onboarded_at || null,
                b.is_active === '1' ? 1 : 0,
                id
            ]
        );

        const name = (b.name || owned.name).trim();
        // 초성은 이름에서 파생한다. 관리자가 직접 고른 값이 있으면 그걸 우선한다.
        const initial = INITIAL_BUCKETS.includes(b.initial) ? b.initial : toInitial(name);

        await conn.query(`
            INSERT INTO brand_profile
                (category_id, mall_id, name_en, alias, initial, initial_chosung, tagline, story,
                 country, official_yn, shop_enabled, hero_image_url, seo_title, seo_description,
                 seller_name, is_seller)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                name_en = VALUES(name_en), alias = VALUES(alias),
                initial = VALUES(initial), initial_chosung = VALUES(initial_chosung),
                tagline = VALUES(tagline), story = VALUES(story), country = VALUES(country),
                official_yn = VALUES(official_yn), shop_enabled = VALUES(shop_enabled),
                hero_image_url = VALUES(hero_image_url),
                seo_title = VALUES(seo_title), seo_description = VALUES(seo_description),
                seller_name = VALUES(seller_name), is_seller = VALUES(is_seller)
        `, [
            id, mallId,
            b.name_en?.trim() || null,
            b.alias?.trim() || null,
            initial,
            toChosung(name),
            b.tagline?.trim() || null,
            b.story?.trim() || null,
            b.country?.trim() || null,
            b.official_yn === '1' ? 1 : 0,
            b.shop_enabled === '1' ? 1 : 0,
            b.hero_image_url?.trim() || null,
            b.seo_title?.trim() || null,
            b.seo_description?.trim() || null,
            b.seller_name?.trim() || null,
            b.is_seller === '1' ? 1 : 0
        ]);

        await conn.commit();
        res.redirect(`/admin/brands/${id}?success=${encodeURIComponent('저장했습니다.')}`);
    } catch (err) {
        await conn.rollback();
        console.error('[admin/brands] 저장 실패', err);
        res.status(500).send('Server Error');
    } finally {
        conn.release();
    }
};

/** POST /admin/brands/recalc — 집계 재계산 */
exports.postRecalc = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const r = await brandStat.recalcMall(mallId);
        res.redirect(`/admin/brands?success=${encodeURIComponent(`집계를 갱신했습니다. 브랜드 ${r.brands}건`)}`);
    } catch (err) {
        console.error('[admin/brands] 집계 실패', err);
        res.redirect(`/admin/brands?error=${encodeURIComponent('집계에 실패했습니다.')}`);
    }
};
