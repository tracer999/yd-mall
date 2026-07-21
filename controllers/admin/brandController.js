const pool = require('../../config/db');
const brandStat = require('../../services/brand/brandStatService');
const { toInitial, toChosung, INITIAL_BUCKETS } = require('../../shared/hangul');
const { GLOBAL_CATEGORY_MALL_ID } = require('../../services/catalog/categoryScope');

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
const BRAND_PROD_PER_PAGE = 50;
const VISIBILITIES = ['PUBLIC', 'HIDDEN', 'MEMBER_ONLY'];

/** GET /admin/brands */
exports.getList = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const q = (req.query.q || '').trim();
        const official = req.query.official === '1' ? 1 : req.query.official === '0' ? 0 : null;
        const sort = ['count', 'name', 'popular', 'new'].includes(req.query.sort) ? req.query.sort : 'count';
        const page = Math.max(1, Number(req.query.page) || 1);

        // 브랜드는 글로벌 한 벌(mall 0). 잔존 몰별 브랜드도 함께 보이도록 IN.
        const where = ["c.type = 'BRAND'", 'c.mall_id IN (0, ?)'];
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
              LEFT JOIN brand_stat s ON s.category_id = c.id AND s.mall_id = ?
              LEFT JOIN categories tc ON tc.id = s.top_category_id
             ${whereSql}
             ORDER BY ${order}
             LIMIT ? OFFSET ?
        `, [mallId, ...params, PAGE_SIZE, (cur - 1) * PAGE_SIZE]);

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
 *
 * 검색어가 없으면 빈 배열이 아니라 **이 몰에 상품이 있는 브랜드**를 상품 많은 순으로 준다.
 * 호출부가 셀렉트박스처럼 "먼저 목록을 보고 고르는" UI 를 만들 수 있어야 하기 때문이다
 * (기획전 유형=브랜드 설정). 브랜드명을 알아야만 고를 수 있으면 셀렉트가 아니다.
 */
exports.searchJson = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const q = String(req.query.q || '').trim();
        if (!q) {
            // brand_stat 은 몰에 따라 비어 있을 수 있어(재계산 전) products 에서 직접 집계한다.
            const [brands] = await pool.query(`
                SELECT c.id, c.name, c.logo_image_path, bp.name_en, COUNT(p.id) AS product_count
                  FROM categories c
                  JOIN products p ON p.brand_category_id = c.id AND p.mall_id = ?
                  LEFT JOIN brand_profile bp ON bp.category_id = c.id
                 WHERE c.type = 'BRAND' AND c.mall_id IN (0, ?)
                 GROUP BY c.id, c.name, c.logo_image_path, bp.name_en
                 ORDER BY product_count DESC, c.name ASC
                 LIMIT 30
            `, [mallId, mallId]);
            return res.json({ brands });
        }
        const like = `%${q}%`;
        const [brands] = await pool.query(`
            SELECT c.id, c.name, c.logo_image_path, bp.name_en, s.product_count
              FROM categories c
              LEFT JOIN brand_profile bp ON bp.category_id = c.id
              LEFT JOIN brand_stat s ON s.category_id = c.id AND s.mall_id = ?
             WHERE c.type = 'BRAND' AND c.mall_id IN (0, ?)
               AND (c.name LIKE ? OR bp.name_en LIKE ? OR bp.alias LIKE ? OR bp.initial_chosung LIKE ?)
             ORDER BY COALESCE(s.product_count, 0) DESC
             LIMIT 15
        `, [mallId, mallId, like, like, like, `%${toChosung(q)}%`]);
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
              LEFT JOIN brand_stat s ON s.category_id = c.id AND s.mall_id = ?
             WHERE c.id = ? AND c.type = 'BRAND' AND c.mall_id IN (0, ?)
        `, [mallId, id, mallId]);
        if (!brand) return res.status(404).send('Not Found');

        // 이 브랜드가 취급하는 카테고리 (파생값 — 읽기 전용)
        const [categories] = await pool.query(`
            SELECT c.name, bcs.product_count
              FROM brand_category_stat bcs
              JOIN categories c ON c.id = bcs.cat_id
             WHERE bcs.mall_id = ? AND bcs.category_id = ?
             ORDER BY bcs.product_count DESC LIMIT 20
        `, [mallId, id]);

        // 이 브랜드에 속한 이 몰 상품 (배정/제거 관리 — 브랜드는 글로벌, 상품은 몰별)
        const prodPage = Math.max(1, Number.parseInt(req.query.ppage, 10) || 1);
        const [[{ ptotal }]] = await pool.query(
            'SELECT COUNT(*) AS ptotal FROM products WHERE mall_id = ? AND brand_category_id = ?', [mallId, id]
        );
        const ptotalPages = Math.max(1, Math.ceil(ptotal / BRAND_PROD_PER_PAGE));
        const curProdPage = Math.min(prodPage, ptotalPages);
        const [assignedProducts] = await pool.query(
            `SELECT id, name, product_code, main_image, price, stock, status, visibility
               FROM products WHERE mall_id = ? AND brand_category_id = ?
              ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [mallId, id, BRAND_PROD_PER_PAGE, (curProdPage - 1) * BRAND_PROD_PER_PAGE]
        );
        const [[{ unassignedCount }]] = await pool.query(
            'SELECT COUNT(*) AS unassignedCount FROM products WHERE mall_id = ? AND brand_category_id IS NULL', [mallId]
        );

        const [[mallRow]] = await pool.query('SELECT name FROM mall WHERE id = ?', [mallId]).catch(() => [[null]]);

        res.render('admin/brands/form', {
            layout: 'layouts/admin_layout',
            title: `브랜드 · ${brand.name}`,
            brand,
            categories,
            initialBuckets: INITIAL_BUCKETS,
            success: req.query.success || null,
            assignedProducts,
            productPagination: { total: ptotal, page: curProdPage, pages: ptotalPages },
            unassignedCount,
            currentMallName: (mallRow && mallRow.name) || `몰 ${mallId}`,
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
            id, GLOBAL_CATEGORY_MALL_ID, // 브랜드·프로필은 글로벌 한 벌(몰 삭제 시 보존)
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

/* ── 브랜드 상품 배정/제거 (brand_category_id 단일 FK · 현재 편집 몰 스코프) ── */

async function ensureBrand(id, mallId) {
    const [[b]] = await pool.query(
        "SELECT id FROM categories WHERE id = ? AND type = 'BRAND' AND mall_id IN (0, ?)", [id, mallId]
    );
    return b || null;
}

/** GET /admin/brands/:id/product-search — 브랜드 미설정 상품 검색(JSON) */
exports.getProductSearch = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = Number(req.params.id);
    try {
        if (!(await ensureBrand(id, mallId))) return res.status(404).json({ products: [] });
        const q = String(req.query.q || '').trim();
        const inStock = String(req.query.in_stock || '');
        const visibility = String(req.query.visibility || '');

        const where = ['p.mall_id = ?', 'p.brand_category_id IS NULL'];
        const params = [mallId];
        if (q) { where.push('(p.name LIKE ? OR p.product_code LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
        if (inStock === 'y') where.push('p.stock > 0');
        else if (inStock === 'n') where.push('p.stock <= 0');
        if (VISIBILITIES.includes(visibility)) { where.push('p.visibility = ?'); params.push(visibility); }

        const [products] = await pool.query(`
            SELECT p.id, p.name, p.product_code, p.main_image, p.price, p.stock, p.status, p.visibility
            FROM products p WHERE ${where.join(' AND ')}
            ORDER BY p.created_at DESC LIMIT 100
        `, params);
        res.json({ products, limited: products.length >= 100 });
    } catch (err) {
        console.error('[admin/brands] getProductSearch:', err.message);
        res.status(500).json({ products: [] });
    }
};

/** POST /admin/brands/:id/products — 미설정 상품을 이 브랜드에 일괄 배정 */
exports.postAssignProducts = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = Number(req.params.id);
    const ids = [].concat(req.body.product_ids || []).map(Number).filter(n => Number.isInteger(n) && n > 0);
    try {
        if (!(await ensureBrand(id, mallId))) return res.status(404).json({ success: false, message: '브랜드를 찾을 수 없습니다.' });
        if (!ids.length) return res.json({ success: true, assigned: 0 });
        const [r] = await pool.query(
            `UPDATE products SET brand_category_id = ? WHERE mall_id = ? AND brand_category_id IS NULL AND id IN (${ids.map(() => '?').join(',')})`,
            [id, mallId, ...ids]
        );
        res.json({ success: true, assigned: r.affectedRows });
    } catch (err) {
        console.error('[admin/brands] postAssignProducts:', err.message);
        res.status(500).json({ success: false, message: '배정 실패' });
    }
};

/** POST /admin/brands/:id/products/remove — 상품을 이 브랜드에서 제거(연결 해제) */
exports.postRemoveProduct = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = Number(req.params.id);
    const productId = Number(req.body.product_id);
    try {
        if (!(await ensureBrand(id, mallId))) return res.status(404).json({ success: false });
        const [r] = await pool.query(
            'UPDATE products SET brand_category_id = NULL WHERE id = ? AND mall_id = ? AND brand_category_id = ?',
            [productId, mallId, id]
        );
        res.json({ success: true, removed: r.affectedRows });
    } catch (err) {
        console.error('[admin/brands] postRemoveProduct:', err.message);
        res.status(500).json({ success: false });
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
