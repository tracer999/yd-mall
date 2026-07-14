const pool = require('../../config/db');
const fs = require('fs');
const path = require('path');
const { syncProductById, syncProductsByIds, deleteProductById, isShopifySyncEnabled } = require('../../services/shopify/syncService');
const newArrival = require('../../services/catalog/newArrival');
const productImporter = require('../../services/catalog/productImporter');

const OpenAI = require('openai');

const openai = (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim())
    ? new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: parseInt(process.env.OPENAI_TIMEOUT_MS) || 90000
    })
    : null;

if (!openai) {
    console.warn('OpenAI 비활성화: OPENAI_API_KEY (선택: OPENAI_MODEL, OPENAI_TIMEOUT_MS)를 설정하면 활성화됩니다.');
}

function slugify(text) {
    if (!text) return '';
    let slug = text.toString().toLowerCase();
    slug = slug
        .replace(/[^a-z0-9가-힣\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug;
}

function normalizeVisibility(value) {
    const allowed = ['PUBLIC', 'HIDDEN', 'MEMBER_ONLY'];
    const v = (value || '').toString().toUpperCase();
    return allowed.includes(v) ? v : 'PUBLIC';
}

function normalizeDistributionBadge(value) {
    if (!value) return null;
    const normalized = String(value).trim().toUpperCase();
    return ['ONLINE_ONLY', 'OFFLINE_ONLY'].includes(normalized) ? normalized : null;
}

function normalizeProductBadge(value) {
    if (!value) return null;
    const allowed = ['BEST', 'NEW', 'RECOMMEND', 'DEADLINE_SALE', 'GREENHUB_SPECIAL'];
    // SET type: value can be array or comma-separated string
    const values = Array.isArray(value) ? value : String(value).split(',');
    const normalized = values
        .map(v => v.trim().toUpperCase())
        .filter(v => allowed.includes(v));
    return normalized.length > 0 ? normalized.join(',') : null;
}

async function resolveBrandName(brandCategoryId) {
    if (!brandCategoryId) return '';
    const [rows] = await pool.query(
        "SELECT name FROM categories WHERE id = ? AND type = 'BRAND' LIMIT 1",
        [brandCategoryId]
    );
    return rows.length > 0 ? rows[0].name : '';
}

async function generateUniqueSlugFromName(name, requestedSlug, excludeId) {
    const baseSource = (requestedSlug && requestedSlug.trim()) ? requestedSlug : name;
    let baseSlug = slugify(baseSource);
    if (!baseSlug) {
        baseSlug = 'product';
    }

    const likePattern = baseSlug + '%';
    let query = 'SELECT slug FROM products WHERE slug LIKE ?';
    const params = [likePattern];
    if (excludeId) {
        query += ' AND id <> ?';
        params.push(excludeId);
    }

    const [rows] = await pool.query(query, params);
    const used = new Set(rows.map(r => r.slug));

    if (!used.has(baseSlug)) {
        return baseSlug;
    }

    let counter = 1;
    while (true) {
        const candidate = `${baseSlug}-${counter}`;
        if (!used.has(candidate)) {
            return candidate;
        }
        counter++;
    }
}

exports.generateAIRecommendation = async (req, res) => {
    const { name, category_name, provider } = req.body;

    try {
        if (!openai) {
            return res.status(503).json({ error: 'AI Recommendation disabled: OPENAI_API_KEY not set' });
        }

        const prompt = `상품명: ${name}\n카테고리: ${category_name}\n제공업체: ${provider}\n\n이 상품에 대해 소비자들이 구매해야 하는 이유와 추천 대상을 매력적으로 3줄 내외의 한국어로 작성해줘.`;

        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-5.2",
            messages: [
                { role: "system", content: "You are a helpful marketing assistant." },
                { role: "user", content: prompt }
            ]
        }, {
            timeout: parseInt(process.env.OPENAI_TIMEOUT_MS) || 90000
        });

        const content = completion.choices[0].message.content;
        res.json({ content });
    } catch (err) {
        console.error('OpenAI Error:', err);
        res.status(500).json({ error: 'AI Recommendation Generation Failed' });
    }
};

// AI 메타 디스크립션 생성
exports.generateMetaDescription = async (req, res) => {
    const { product_id } = req.body;
    try {
        if (!openai) {
            return res.status(503).json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' });
        }
        const [rows] = await pool.query(`
            SELECT p.name, p.provider, p.price, p.short_description, p.description, c.name as category_name
            FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?
        `, [product_id]);
        if (!rows.length) return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });

        const p = rows[0];
        const descPlain = (p.short_description || p.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 200);
        const prompt = `다음 상품 정보를 바탕으로 SEO에 최적화된 메타 디스크립션을 한국어로 작성해줘.
- 150자 이내로 작성
- 검색엔진에서 클릭을 유도할 수 있는 매력적인 문구
- 상품의 핵심 특징과 혜택 포함
- 특수문자나 이모지 사용 금지

상품명: ${p.name}
카테고리: ${p.category_name || ''}
브랜드: ${p.provider || ''}
가격: ${(p.price || 0).toLocaleString()}원
상품설명: ${descPlain}

메타 디스크립션만 출력해줘. 다른 설명이나 부연 없이 순수 텍스트만.`;

        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o",
            messages: [
                { role: "system", content: "You are an SEO expert specializing in Korean e-commerce product descriptions." },
                { role: "user", content: prompt }
            ]
        }, {
            timeout: parseInt(process.env.OPENAI_TIMEOUT_MS) || 90000
        });

        const content = completion.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
        res.json({ content });
    } catch (err) {
        console.error('AI Meta Description Error:', err);
        res.status(500).json({ error: 'AI 메타 디스크립션 생성 실패' });
    }
};

// 메타 디스크립션 저장
exports.saveMetaDescription = async (req, res) => {
    const { product_id, meta_description } = req.body;
    try {
        await pool.query('UPDATE products SET meta_description = ? WHERE id = ?', [meta_description || null, product_id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Save Meta Description Error:', err);
        res.status(500).json({ error: '저장 실패' });
    }
};

// 상품 SEO 보기 (팝업용) - 실제 상품 상세 페이지에서 사용하는 SEO 로직을 그대로 사용
exports.getProductSEOView = async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await pool.query(`
            SELECT p.*, c.name as category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.id = ?
        `, [id]);

        if (rows.length === 0) {
            return res.render('admin/products/seo_preview', {
                layout: false,
                seo: null,
                product: null,
                headHtml: null,
                message: '해당 상품을 찾을 수 없습니다.'
            });
        }

        const product = rows[0];

        // ===== 사용자 상세와 동일한 SEO 메타/OG/JSON-LD 구성 =====
        const siteSettings = res.locals.siteSettings || {};
        const companyName = siteSettings.company_name || '와이디몰';

        const domainFromSettings = (global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr';
        const domain = domainFromSettings.replace(/\/$/, '');
        const slugPath = (product.slug && product.slug.trim())
            ? `/products/${product.slug}`
            : `/products/view/${product.id}`;
        const productUrl = domain + slugPath;

        const seoTitle = `${product.name} | ${companyName}`;

        // 메타 디스크립션: DB 저장값 > short_description > 자동 생성
        let seoDescription = '';
        if (product.meta_description && product.meta_description.trim()) {
            seoDescription = product.meta_description.trim();
        } else if (product.short_description && product.short_description.trim()) {
            seoDescription = product.short_description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        } else {
            // 자동 생성: 상품 정보 조합
            const parts = [];
            if (product.provider) parts.push(product.provider);
            parts.push(product.name);
            if (product.category_name) parts.push(product.category_name);
            const priceStr = product.price ? ` ${product.price.toLocaleString()}원` : '';
            if (priceStr) parts.push(priceStr);
            seoDescription = parts.join(' - ');
            if (product.description) {
                const plain = String(product.description).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                if (plain) seoDescription += '. ' + plain;
            }
            seoDescription = seoDescription.substring(0, 160);
        }
        const seoDescriptionSource = product.meta_description && product.meta_description.trim()
            ? 'db' : (product.short_description && product.short_description.trim() ? 'short_desc' : 'auto');

        const imagePath = product.main_image || product.thumbnail_image || '';
        let imageUrl = '';
        if (imagePath) {
            if (/^https?:\/\//i.test(imagePath)) {
                imageUrl = imagePath;
            } else {
                const normalizedPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
                imageUrl = domain + normalizedPath;
            }
        }

        let availability;
        if (product.status === 'ON' && product.stock > 0) {
            availability = 'https://schema.org/InStock';
        } else if (product.status === 'COMING_SOON') {
            availability = 'https://schema.org/PreOrder';
        } else {
            availability = 'https://schema.org/OutOfStock';
        }

        const offerPrice = product.price || 0;
        const brandName = (product.provider || companyName || '').toString().trim();

        const jsonLdObject = {
            '@context': 'https://schema.org/',
            '@type': 'Product',
            name: product.name,
            description: seoDescription || undefined,
            image: imageUrl ? [imageUrl] : undefined,
            brand: {
                '@type': 'Brand',
                name: brandName
            },
            offers: {
                '@type': 'Offer',
                url: productUrl,
                priceCurrency: 'KRW',
                price: String(offerPrice),
                availability,
                seller: {
                    '@type': 'Organization',
                    name: companyName
                }
            },
            sku: String(product.id)
        };

        const seo = {
            title: seoTitle,
            description: seoDescription,
            url: productUrl,
            image: imageUrl,
            type: 'product',
            siteName: companyName,
            jsonLd: JSON.stringify(jsonLdObject, null, 2)
        };

        // head 내에 실제로 들어가는 태그 미리보기
        const headLines = [];
        headLines.push(`<title>${seoTitle}</title>`);
        if (seoDescription) headLines.push(`<meta name="description" content="${seoDescription}">`);
        headLines.push('<meta name="robots" content="index,follow">');
        headLines.push(`<link rel="canonical" href="${productUrl}">`);
        headLines.push(`<meta property="og:type" content="product">`);
        headLines.push(`<meta property="og:title" content="${seoTitle}">`);
        if (seoDescription) headLines.push(`<meta property="og:description" content="${seoDescription}">`);
        if (imageUrl) {
            headLines.push(`<meta property="og:image" content="${imageUrl}">`);
            headLines.push('<meta property="og:image:width" content="1200">');
            headLines.push('<meta property="og:image:height" content="630">');
        }
        headLines.push(`<meta property="og:url" content="${productUrl}">`);
        headLines.push(`<meta property="og:site_name" content="${companyName}">`);

        const headHtml = headLines.join('\n');

        res.render('admin/products/seo_preview', {
            layout: false,
            seo,
            product,
            headHtml,
            seoDescriptionSource,
            message: null
        });
    } catch (err) {
        console.error('getProductSEOView Error:', err);
        res.status(500).send('SEO 데이터를 생성하는 중 오류가 발생했습니다.');
    }
};

exports.getList = async (req, res) => {
    try {
        // theme_category_id 는 전량 NULL 인 죽은 컬럼이라 JOIN 을 걷어냈다(THEME 축 폐기).
        const [products] = await pool.query(`
            SELECT p.*, c.name as category_name, bc.name as brand_category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN categories bc ON p.brand_category_id = bc.id
            ORDER BY p.created_at DESC
        `);
        res.render('admin/products/list', {
            layout: 'layouts/admin_layout',
            title: '상품 관리',
            products
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postUpdateStatus = async (req, res) => {
    const { product_ids, status } = req.body;

    if (!product_ids || product_ids.length === 0) {
        return res.redirect('/admin/products');
    }

    const ids = Array.isArray(product_ids) ? product_ids : [product_ids];

    try {
        await pool.query('UPDATE products SET status = ? WHERE id IN (?)', [status, ids]);
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

/*
 * 판매 시작일 일괄 지정.
 *
 * 임포트로 들어온 상품은 created_at 이 적재 당일에 몰려 있어 판매 시작일의 근거가 되지 못한다.
 * 그래서 마이그레이션이 NULL 로 남겼고(= 신상품 아님), 운영이 이 화면에서 실제 날짜를 채운다.
 */
exports.postBulkSaleStartDate = async (req, res) => {
    const { product_ids, sale_start_date } = req.body;
    const ids = Array.isArray(product_ids) ? product_ids : (product_ids ? [product_ids] : []);

    if (!ids.length) return res.redirect('/admin/products');

    try {
        // 빈 값이면 미지정으로 되돌린다(신상품에서 제외).
        const value = sale_start_date && String(sale_start_date).trim() ? sale_start_date : null;
        await pool.query('UPDATE products SET sale_start_date = ? WHERE id IN (?)', [value, ids]);
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postVisibility = async (req, res) => {
    const { productId, visibility } = req.body;
    if (!productId || !visibility) return res.status(400).json({ success: false, message: '잘못된 요청' });
    const normalized = normalizeVisibility(visibility);
    try {
        await pool.query('UPDATE products SET visibility = ? WHERE id = ?', [normalized, productId]);
        res.json({ success: true, visibility: normalized });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
};

// ── 추천 상품 관리 API ──────────────────────────────
exports.getRecommendationSearch = async (req, res) => {
    const q = (req.query.q || '').trim();
    const excludeId = req.query.excludeId;
    if (!q || q.length < 1) return res.json({ products: [] });
    try {
        const [rows] = await pool.query(`
            SELECT p.id, p.name, p.main_image, p.product_code, p.price, p.status
            FROM products p
            WHERE (p.name LIKE ? OR p.product_code LIKE ?)
              AND p.id != ?
            ORDER BY p.created_at DESC LIMIT 10
        `, [`%${q}%`, `%${q}%`, excludeId || 0]);
        res.json({ products: rows });
    } catch (err) {
        res.status(500).json({ products: [] });
    }
};

exports.getRecommendations = async (req, res) => {
    const productId = req.params.productId;
    try {
        const [rows] = await pool.query(`
            SELECT pr.id AS rec_id, pr.display_order, p.id, p.name, p.main_image, p.product_code, p.status
            FROM product_recommendations pr
            JOIN products p ON p.id = pr.related_id
            WHERE pr.product_id = ?
            ORDER BY pr.display_order ASC
        `, [productId]);
        res.json({ recommendations: rows });
    } catch (err) {
        res.status(500).json({ recommendations: [] });
    }
};

exports.postAddRecommendation = async (req, res) => {
    const { productId, relatedId } = req.body;
    if (!productId || !relatedId) return res.status(400).json({ success: false });
    try {
        // 최대 8개 제한
        const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM product_recommendations WHERE product_id = ?', [productId]);
        if (cnt >= 8) return res.json({ success: false, message: '최대 8개까지 등록 가능합니다.' });

        // 다음 순서
        const [[{ maxOrder }]] = await pool.query('SELECT COALESCE(MAX(display_order), 0) AS maxOrder FROM product_recommendations WHERE product_id = ?', [productId]);

        // 양방향 등록
        await pool.query('INSERT IGNORE INTO product_recommendations (product_id, related_id, display_order) VALUES (?, ?, ?)', [productId, relatedId, maxOrder + 1]);

        // 역방향 (최대 8개 넘지 않으면)
        const [[{ cntReverse }]] = await pool.query('SELECT COUNT(*) AS cntReverse FROM product_recommendations WHERE product_id = ?', [relatedId]);
        if (cntReverse < 8) {
            const [[{ maxOrderReverse }]] = await pool.query('SELECT COALESCE(MAX(display_order), 0) AS maxOrderReverse FROM product_recommendations WHERE product_id = ?', [relatedId]);
            await pool.query('INSERT IGNORE INTO product_recommendations (product_id, related_id, display_order) VALUES (?, ?, ?)', [relatedId, productId, maxOrderReverse + 1]);
        }

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

exports.postRemoveRecommendation = async (req, res) => {
    const { productId, relatedId } = req.body;
    if (!productId || !relatedId) return res.status(400).json({ success: false });
    try {
        // 양방향 삭제
        await pool.query('DELETE FROM product_recommendations WHERE product_id = ? AND related_id = ?', [productId, relatedId]);
        await pool.query('DELETE FROM product_recommendations WHERE product_id = ? AND related_id = ?', [relatedId, productId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

exports.postReorderRecommendations = async (req, res) => {
    const { productId, order } = req.body; // order: [relatedId1, relatedId2, ...]
    if (!productId || !order) return res.status(400).json({ success: false });
    try {
        for (let i = 0; i < order.length; i++) {
            await pool.query('UPDATE product_recommendations SET display_order = ? WHERE product_id = ? AND related_id = ?', [i + 1, productId, order[i]]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

exports.getAdd = async (req, res) => {
    try {
        const _mallId = req.adminMallId || 1; // P5: 편집 중인 몰의 카테고리만
        const [productCategories] = await pool.query("SELECT id, name, display_order FROM categories WHERE type = 'NORMAL' AND mall_id = ? ORDER BY display_order ASC, id ASC", [_mallId]);
        const [brands] = await pool.query("SELECT id, name FROM categories WHERE type = 'BRAND' AND mall_id = ? ORDER BY display_order ASC, id ASC", [_mallId]);
        const domainFromSettings = (global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr';
        const domain = domainFromSettings.replace(/\/$/, '');
        const productUrlBase = domain + '/products/';
        res.render('admin/products/form', {
            layout: 'layouts/admin_layout',
            title: '상품 등록',
            productCategories,
            brands,
            product: null,
            productUrlBase,
            newProductDays: newArrival.newProductDays()
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

/**
 * POST /admin/products/import-url  { url }  → 상품 초안(JSON)
 *
 * 외부 상품 상세 URL 을 읽어 폼을 채울 값을 돌려준다. **DB 는 건드리지 않는다** —
 * 운영자가 폼에서 확인하고 [저장] 을 눌러야 상품이 만들어진다.
 * 가져오지 못한 필드는 null 로 온다(페이지가 JS 로 그리는 값은 읽을 수 없다).
 */
exports.postImportUrl = async (req, res) => {
    try {
        const draft = await productImporter.importFromUrl(req.body && req.body.url);

        // 브랜드는 이름만 안다. 이 몰의 BRAND 카테고리와 이름이 정확히 같으면 폼에서 자동 선택한다.
        let brandCategoryId = null;
        if (draft.brand) {
            const [rows] = await pool.query(
                `SELECT id FROM categories WHERE type = 'BRAND' AND mall_id = ? AND name = ? LIMIT 1`,
                [req.adminMallId || 1, draft.brand],
            );
            brandCategoryId = rows.length ? rows[0].id : null;
        }

        res.json({ success: true, data: Object.assign(draft, { brand_category_id: brandCategoryId }) });
    } catch (err) {
        const status = err.statusCode || 500;
        if (status >= 500) console.error('[products] importUrl:', err.message);
        res.status(status).json({ success: false, error: err.message || '가져오기에 실패했습니다.' });
    }
};

exports.postAdd = async (req, res) => {
    const {
        category_id, brand_category_id, name, product_code, provider, description, short_description,
        video_type, video_url,
        purchase_price, original_price, price, discount_rate, stock, status, sale_start_date,
        is_ai_recommendation, ai_recommendation_content,
        distribution_badge, product_badge, badge_expire_date, visibility
    } = req.body;

    /*
     * 이미지 출처는 둘이다.
     *   1) 관리자가 직접 올린 파일 (req.files)
     *   2) URL 가져오기가 미리 내려받아 업로드 경로에 저장해 둔 이미지 (imported_*)
     * 직접 올린 파일이 항상 우선한다 — 가져오기 후 이미지를 바꿔 올렸다면 그게 운영자의 최종 의사다.
     * imported_* 는 서버가 방금 만든 경로만 유효하다(임의 경로 주입 차단 → safeImported).
     */
    const safeImported = (v) => (typeof v === 'string' && /^\/uploads\/products\/[\w.-]+$/.test(v) ? v : null);

    const main_image = req.files['main_image']
        ? '/uploads/products/' + req.files['main_image'][0].filename
        : safeImported(req.body.imported_main_image);
    const thumbnail_image = req.files['thumbnail_image']
        ? '/uploads/products/' + req.files['thumbnail_image'][0].filename
        : safeImported(req.body.imported_thumbnail_image);

    let final_video_url = video_url;
    if (video_type === 'FILE' && req.files['video_file']) {
        final_video_url = '/uploads/products/' + req.files['video_file'][0].filename;
    }

    try {
        const finalSlug = await generateUniqueSlugFromName(name, req.body.slug, null);
        const normalizedDistributionBadge = normalizeDistributionBadge(distribution_badge);
        const normalizedProductBadge = normalizeProductBadge(product_badge);
        const normalizedBrandCategoryId = brand_category_id ? Number(brand_category_id) || null : null;
        const normalizedProductCode = (product_code && String(product_code).trim()) ? String(product_code).trim() : null;
        const resolvedBrandName = await resolveBrandName(normalizedBrandCategoryId);
        const finalProvider = resolvedBrandName || provider || null;

        const finalPrice = price || 0;
        const insertEntries = [
            ['mall_id', req.adminMallId || 1], // P5: 새 상품은 편집 중인 몰에 속한다
            ['category_id', category_id || null],
            ['brand_category_id', normalizedBrandCategoryId],
            ['name', name],
            ['product_code', normalizedProductCode],
            ['provider', finalProvider],
            ['description', description],
            ['short_description', short_description],
            ['main_image', main_image],
            ['thumbnail_image', thumbnail_image],
            ['video_type', video_type],
            ['video_url', final_video_url],
            ['purchase_price', purchase_price],
            ['original_price', original_price],
            ['price', finalPrice],
            ['discount_rate', discount_rate],
            ['stock', stock],
            ['status', status],
            // 신상품 판정 앵커. 비워두면 신상품에서 빠지므로 폼이 오늘 날짜를 프리필한다.
            ['sale_start_date', sale_start_date || null],
            ['is_ai_recommendation', is_ai_recommendation ? 1 : 0],
            ['ai_recommendation_content', ai_recommendation_content],
            ['slug', finalSlug],
            ['distribution_badge', normalizedDistributionBadge],
            ['product_badge', normalizedProductBadge],
            ['badge_expire_date', badge_expire_date || null],
            ['visibility', normalizeVisibility(visibility)]
        ];

        const insertColumns = insertEntries.map(([column]) => column);
        const insertValues = insertEntries.map(([, value]) => value);
        const placeholders = insertColumns.map(() => '?').join(', ');

        const [result] = await pool.query(`
            INSERT INTO products (${insertColumns.join(', ')})
            VALUES (${placeholders})
        `, insertValues);

        const productId = result.insertId;

        // Shopify 동기화 (백그라운드 — 실패해도 상품 저장에 영향 없음)
        syncProductById(productId).then(r => {
            console.log(`[Shopify Sync] 신규 상품 동기화 완료: product_id=${productId}, action=${r.action}`);
        }).catch(err => {
            console.error(`[Shopify Sync] 신규 상품 동기화 실패: product_id=${productId}: ${err.message}`);
        });


        // Sub Images Insert — 직접 올린 파일 + URL 가져오기로 저장된 이미지
        const subImageUrls = (req.files['sub_images'] || []).map(f => '/uploads/products/' + f.filename)
            .concat([].concat(req.body.imported_sub_images || []).map(safeImported).filter(Boolean));

        if (subImageUrls.length) {
            await Promise.all(subImageUrls.slice(0, 10).map((url, index) =>
                pool.query('INSERT INTO product_images (product_id, image_url, display_order) VALUES (?, ?, ?)',
                    [productId, url, index])));
        }

        // 추천 상품 연결 (신규 등록 시)
        const recIds = req.body.recommendation_ids;
        if (recIds) {
            const ids = Array.isArray(recIds) ? recIds : [recIds];
            for (let i = 0; i < ids.length && i < 8; i++) {
                const relatedId = parseInt(ids[i]);
                if (!relatedId) continue;
                // 양방향 등록
                await pool.query('INSERT IGNORE INTO product_recommendations (product_id, related_id, display_order) VALUES (?, ?, ?)', [productId, relatedId, i + 1]);
                const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM product_recommendations WHERE product_id = ?', [relatedId]);
                if (cnt < 8) {
                    const [[{ mx }]] = await pool.query('SELECT COALESCE(MAX(display_order), 0) AS mx FROM product_recommendations WHERE product_id = ?', [relatedId]);
                    await pool.query('INSERT IGNORE INTO product_recommendations (product_id, related_id, display_order) VALUES (?, ?, ?)', [relatedId, productId, mx + 1]);
                }
            }
        }

        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postEdit = async (req, res) => {
    const {
        id, category_id, brand_category_id, name, product_code, provider, description, short_description,
        purchase_price, original_price, price, discount_rate, stock, status, sale_start_date,
        video_type, video_url, old_image, old_thumbnail, old_video,
        is_ai_recommendation, ai_recommendation_content,
        distribution_badge, product_badge, badge_expire_date, visibility
    } = req.body;

    // Handle Images
    let main_image = old_image;
    if (req.files['main_image']) {
        main_image = '/uploads/products/' + req.files['main_image'][0].filename;
    }

    let thumbnail_image = old_thumbnail;
    if (req.files['thumbnail_image']) {
        thumbnail_image = '/uploads/products/' + req.files['thumbnail_image'][0].filename;
    }

    // Handle Video
    let final_video_url = (video_type === 'YOUTUBE') ? video_url : old_video;
    if (video_type === 'FILE' && req.files['video_file']) {
        final_video_url = '/uploads/products/' + req.files['video_file'][0].filename;
    } else if (video_type === 'FILE' && !req.files['video_file'] && old_video) {
        final_video_url = old_video;
    }

    try {
        const finalSlug = await generateUniqueSlugFromName(name, req.body.slug, id);
        const normalizedDistributionBadge = normalizeDistributionBadge(distribution_badge);
        const normalizedProductBadge = normalizeProductBadge(product_badge);
        const normalizedBrandCategoryId = brand_category_id ? Number(brand_category_id) || null : null;
        const normalizedProductCode = (product_code && String(product_code).trim()) ? String(product_code).trim() : null;
        const resolvedBrandName = await resolveBrandName(normalizedBrandCategoryId);
        const finalProvider = resolvedBrandName || provider || null;

        const finalPrice = price || 0;
        const updateEntries = [
            ['category_id', category_id || null],
            ['brand_category_id', normalizedBrandCategoryId],
            ['name', name],
            ['product_code', normalizedProductCode],
            ['provider', finalProvider],
            ['description', description],
            ['short_description', short_description],
            ['main_image', main_image],
            ['thumbnail_image', thumbnail_image],
            ['video_type', video_type],
            ['video_url', final_video_url],
            ['purchase_price', purchase_price],
            ['original_price', original_price],
            ['price', finalPrice],
            ['discount_rate', discount_rate],
            ['stock', stock],
            ['status', status],
            // 신상품 판정 앵커. 비워두면 신상품에서 빠지므로 폼이 오늘 날짜를 프리필한다.
            ['sale_start_date', sale_start_date || null],
            ['is_ai_recommendation', is_ai_recommendation ? 1 : 0],
            ['ai_recommendation_content', ai_recommendation_content],
            ['slug', finalSlug],
            ['distribution_badge', normalizedDistributionBadge],
            ['product_badge', normalizedProductBadge],
            ['badge_expire_date', badge_expire_date || null],
            ['visibility', normalizeVisibility(visibility)]
        ];

        const updateSql = updateEntries.map(([column]) => `${column}=?`).join(', ');
        const updateValues = updateEntries.map(([, value]) => value);
        updateValues.push(id);

        await pool.query(`
            UPDATE products SET ${updateSql}
            WHERE id=?
        `, updateValues);

        // Shopify 동기화 (백그라운드 — 실패해도 상품 저장에 영향 없음)
        syncProductById(Number(id)).then(r => {
            console.log(`[Shopify Sync] 상품 수정 동기화 완료: product_id=${id}, action=${r.action}`);
        }).catch(err => {
            console.error(`[Shopify Sync] 상품 수정 동기화 실패: product_id=${id}: ${err.message}`);
        });


        // Handle Sub Images Insert
        if (req.files['sub_images']) {
            const currentCountResult = await pool.query('SELECT COUNT(*) as count FROM product_images WHERE product_id = ?', [id]);
            let currentOrder = currentCountResult[0][0].count;

            const subImagePromises = req.files['sub_images'].map(async (file) => {
                await pool.query('INSERT INTO product_images (product_id, image_url, display_order) VALUES (?, ?, ?)',
                    [id, '/uploads/products/' + file.filename, currentOrder++]);
            });
            await Promise.all(subImagePromises);
        }

        // Handle Sub Images Delete
        if (req.body.delete_image_ids) {
            const deleteIds = Array.isArray(req.body.delete_image_ids) ? req.body.delete_image_ids : [req.body.delete_image_ids];
            await pool.query('DELETE FROM product_images WHERE id IN (?) AND product_id = ?', [deleteIds, id]);
        }

        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

/** 카테고리 서브트리 id 목록. 부모를 고르면 하위 뎁스 상품까지 잡아야 한다
 *  (mall 2 는 상품 대부분이 2·3뎁스에 달려 있다). 관리자용이라 비활성 카테고리도 포함한다. */
async function categorySubtreeIds(mallId, categoryId) {
    const [rows] = await pool.query(`
        WITH RECURSIVE sub AS (
            SELECT id FROM categories WHERE id = ? AND mall_id = ?
            UNION ALL
            SELECT c.id FROM categories c JOIN sub ON c.parent_id = sub.id
        )
        SELECT id FROM sub
    `, [categoryId, mallId]);
    return rows.map(r => r.id);
}

exports.getList = async (req, res) => {
    const MALL_ID = req.adminMallId || 1; // P5: 편집 중인 몰의 상품만
    try {
        const allowedSizes = [10, 20, 30, 50];
        const perPage = allowedSizes.includes(Number(req.query.perPage)) ? Number(req.query.perPage) : 20;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const offset = (page - 1) * perPage;
        const keyword = (req.query.keyword || '').trim();

        // 필터 — 허용값만 통과시킨다(쿼리에 직접 넣지 않고 파라미터로 바인딩).
        const STATUSES = ['ON', 'OFF', 'SOLD_OUT', 'COMING_SOON', 'RESTOCK'];
        const VISIBILITIES = ['PUBLIC', 'HIDDEN', 'MEMBER_ONLY'];
        const STOCKS = ['in', 'out'];

        const status = STATUSES.includes(req.query.status) ? req.query.status : '';
        const visibility = VISIBILITIES.includes(req.query.visibility) ? req.query.visibility : '';
        const stock = STOCKS.includes(req.query.stock) ? req.query.stock : '';
        const categoryId = Number(req.query.categoryId) > 0 ? Number(req.query.categoryId) : null;
        const brandId = Number(req.query.brandId) > 0 ? Number(req.query.brandId) : null;

        // 몰 필터는 항상 건다. keyword 유무와 무관하게 다른 몰 상품이 섞이면 안 된다.
        let whereClause = 'WHERE p.mall_id = ?';
        const queryParams = [MALL_ID];
        if (keyword) {
            whereClause += ` AND (p.name LIKE ? OR p.provider LIKE ? OR c.name LIKE ?)`;
            const like = `%${keyword}%`;
            queryParams.push(like, like, like);
        }
        if (status) {
            whereClause += ' AND p.status = ?';
            queryParams.push(status);
        }
        if (visibility) {
            whereClause += ' AND p.visibility = ?';
            queryParams.push(visibility);
        }
        if (stock === 'in') whereClause += ' AND p.stock > 0';
        else if (stock === 'out') whereClause += ' AND (p.stock IS NULL OR p.stock = 0)';

        // 선택한 카테고리가 다른 몰이면 서브트리가 비고, 결과는 0건이 된다(크로스몰 차단).
        let categoryIds = [];
        if (categoryId) {
            categoryIds = await categorySubtreeIds(MALL_ID, categoryId);
            if (categoryIds.length === 0) categoryIds = [0];
            whereClause += ` AND p.category_id IN (${categoryIds.map(() => '?').join(',')})`;
            queryParams.push(...categoryIds);
        }
        if (brandId) {
            whereClause += ' AND p.brand_category_id = ?';
            queryParams.push(brandId);
        }

        const [[{ total }]] = await pool.query(
            `SELECT COUNT(DISTINCT p.id) as total FROM products p LEFT JOIN categories c ON p.category_id = c.id ${whereClause}`,
            queryParams
        );

        const [products] = await pool.query(`
            SELECT p.*, c.name as category_name, bc.name as brand_category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN categories bc ON p.brand_category_id = bc.id
            ${whereClause}
            GROUP BY p.id
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        `, [...queryParams, perPage, offset]);

        // 선택 레이어용 목록 — 카테고리는 트리(들여쓰기), 브랜드는 검색으로 좁혀 고른다.
        const [filterCategories] = await pool.query(
            `SELECT id, name, parent_id, depth FROM categories
             WHERE mall_id = ? AND type = 'NORMAL' ORDER BY display_order ASC, id ASC`, [MALL_ID]
        );
        const [filterBrands] = await pool.query(
            `SELECT id, name FROM categories
             WHERE mall_id = ? AND type = 'BRAND' ORDER BY display_order ASC, id ASC`, [MALL_ID]
        );
        const selectedCategory = categoryId ? filterCategories.find(c => c.id === categoryId) || null : null;
        const selectedBrand = brandId ? filterBrands.find(b => b.id === brandId) || null : null;

        const totalPages = Math.ceil(total / perPage);

        res.render('admin/products/list', {
            layout: 'layouts/admin_layout',
            title: '상품 관리',
            products,
            keyword,
            filters: { status, visibility, stock, categoryId, brandId },
            filterCategories,
            filterBrands,
            selectedCategory,
            selectedBrand,
            pagination: { page, perPage, total, totalPages }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getDetail = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query(`
            SELECT p.*, c.name as category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.id = ?
        `, [id]);
        if (rows.length === 0) return res.redirect('/admin/products');

        const product = rows[0];

        const [images] = await pool.query('SELECT * FROM product_images WHERE product_id = ? ORDER BY display_order ASC', [id]);

        product.images = images;

        const domainFromSettings = (global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr';
        const domain = domainFromSettings.replace(/\/$/, '');
        const slugPath = (product.slug && product.slug.trim())
            ? `/products/${product.slug}`
            : `/products/view/${product.id}`;
        const productUrl = domain + slugPath;

        // 해당 상품의 판매이력 (최신순)
        const [salesHistory] = await pool.query(`
            SELECT oi.order_id, oi.product_name, oi.quantity, oi.product_price, oi.total_price, oi.created_at,
                   o.order_number, o.status AS order_status, o.paid_at, o.receiver_name,
                   COALESCE(u.email, o.buyer_email, '-') AS buyer_email,
                   COALESCE(u.name, o.buyer_name, o.receiver_name, '-') AS buyer_name
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            LEFT JOIN users u ON o.user_id = u.id
            WHERE oi.product_id = ? AND o.status IN ('PAID','PREPARING','SHIPPED','DELIVERED')
            ORDER BY COALESCE(o.paid_at, o.created_at) DESC
        `, [id]);

        res.render('admin/products/detail', {
            layout: 'layouts/admin_layout',
            title: '상품 상세 정보',
            product,
            productUrl,
            salesHistory
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getEdit = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
        if (rows.length === 0) return res.redirect('/admin/products');

        const _mallId = req.adminMallId || 1; // P5: 편집 중인 몰의 카테고리만
        const [productCategories] = await pool.query("SELECT id, name, display_order FROM categories WHERE type = 'NORMAL' AND mall_id = ? ORDER BY display_order ASC, id ASC", [_mallId]);
        const [brands] = await pool.query("SELECT id, name FROM categories WHERE type = 'BRAND' AND mall_id = ? ORDER BY display_order ASC, id ASC", [_mallId]);
        const [images] = await pool.query('SELECT * FROM product_images WHERE product_id = ? ORDER BY display_order ASC', [id]);

        rows[0].images = images;

        const domainFromSettings = (global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr';
        const domain = domainFromSettings.replace(/\/$/, '');
        const productUrlBase = domain + '/products/';

        res.render('admin/products/form', {
            layout: 'layouts/admin_layout',
            title: '상품 수정',
            productCategories,
            brands,
            product: rows[0],
            productUrlBase,
            newProductDays: newArrival.newProductDays()
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postUploadImage = async (req, res) => {
    if (req.file) {
        res.json({ location: '/uploads/products/' + req.file.filename });
    } else {
        res.status(400).json({ error: 'Image upload failed' });
    }
};

exports.postDelete = async (req, res) => {
    const { id } = req.body;
    try {
        // Shopify 상품 삭제 동기화 — DB 삭제 전에 실행 (매핑 테이블 읽어야 하므로)
        await deleteProductById(Number(id))
            .catch(e => console.error(`[Shopify Sync] 상품 삭제 동기화 실패 (id=${id}): ${e.message}`));

        await pool.query('DELETE FROM products WHERE id = ?', [id]);
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Shopify 일괄 동기화 (AJAX) — POST /admin/products/shopify-sync
// Body: { productIds: [1, 2, 3] }
exports.postShopifySync = async (req, res) => {
    const { productIds } = req.body;

    if (!isShopifySyncEnabled()) {
        return res.status(409).json({ success: false, disabled: true, message: 'Shopify 동기화가 비활성화되어 있습니다. (system_settings.shopify_sync_enabled)' });
    }

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ success: false, message: '상품 ID 목록이 필요합니다.' });
    }

    const ids = productIds.map(id => parseInt(id)).filter(Boolean);

    try {
        const result = await syncProductsByIds(ids);
        res.json({
            success: true,
            message: `동기화 완료: 신규 ${result.created}개, 업데이트 ${result.updated}개, 실패 ${result.failed}개`,
            ...result,
        });
    } catch (err) {
        console.error('[Shopify Sync] 일괄 동기화 오류:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};
