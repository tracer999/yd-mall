const express = require('express');
const router = express.Router();
const { SitemapStream, streamToPromise } = require('sitemap');
const { Readable } = require('stream');
const crypto = require('crypto');
const pool = require('../config/db');
const newArrival = require('../services/catalog/newArrival');
const { isIndexingAllowed } = require('../config/indexingPolicy');

// ── 캐시 (24시간 TTL) ───────────────────────────────
let cache = { xml: null, etag: null, generatedAt: 0 };
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24시간

function getDomain() {
    return ((global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr').replace(/\/$/, '');
}

// ── Sitemap XML 생성 ────────────────────────────────
async function generateSitemap() {
    const domain = getDomain();

    // 1. 고정 페이지
    const links = [
        { url: '/', changefreq: 'daily', priority: 1.0 },
        { url: '/products', changefreq: 'daily', priority: 0.9 },
        { url: '/brands', changefreq: 'weekly', priority: 0.7 },
        { url: '/notice', changefreq: 'monthly', priority: 0.5 },
        { url: '/guide', changefreq: 'monthly', priority: 0.4 },
    ];

    // 크롤러는 세션이 없어 기본 몰로 본다. 다른 몰의 카테고리·브랜드를 실으면
    // 기본 몰에서 열리지 않는 URL 을 색인시키게 된다.
    const [[defaultMall]] = await pool.query(
        'SELECT id FROM mall WHERE is_default = 1 AND is_active = 1 LIMIT 1'
    );
    const mallId = defaultMall?.id || 1;

    // 2. 카테고리 페이지
    const [categories] = await pool.query(
        "SELECT id, name FROM categories WHERE type = 'NORMAL' AND mall_id IN (0, ?) ORDER BY display_order ASC",
        [mallId]
    );
    categories.forEach(cat => {
        links.push({
            url: `/products/category/${cat.id}`,
            changefreq: 'weekly',
            priority: 0.8
        });
    });

    // 3. 브랜드 상세관
    const [brands] = await pool.query(
        "SELECT id, name FROM categories WHERE type = 'BRAND' AND mall_id IN (0, ?) ORDER BY display_order ASC",
        [mallId]
    );
    brands.forEach(brand => {
        links.push({
            url: `/brands/${brand.id}`,
            changefreq: 'weekly',
            priority: 0.7
        });
    });

    // 4. 상품 페이지 (이미지 사이트맵 포함)
    const [products] = await pool.query(`
        SELECT id, slug, name, main_image, created_at
        FROM products
        WHERE status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')
          AND slug IS NOT NULL AND TRIM(slug) != ''
        ORDER BY created_at DESC
    `);
    products.forEach(p => {
        const entry = {
            url: `/products/${encodeURIComponent(p.slug)}`,
            changefreq: 'weekly',
            priority: 0.8,
            lastmod: p.created_at ? new Date(p.created_at).toISOString().split('T')[0] : undefined
        };
        // 이미지 사이트맵
        if (p.main_image) {
            const imgUrl = p.main_image.startsWith('http') ? p.main_image : `${domain}${p.main_image}`;
            entry.img = [{ url: imgUrl, title: p.name }];
        }
        links.push(entry);
    });

    // 5. 공지사항 — 카테고리와 마찬가지로 이 사이트맵이 대상으로 삼은 몰의 것만 싣는다.
    const [notices] = await pool.query(
        "SELECT id, created_at FROM notices WHERE mall_id = ? ORDER BY created_at DESC LIMIT 50",
        [mallId]
    );
    notices.forEach(n => {
        links.push({
            url: `/notice/${n.id}`,
            changefreq: 'monthly',
            priority: 0.4,
            lastmod: n.created_at ? new Date(n.created_at).toISOString().split('T')[0] : undefined
        });
    });

    // THEME 카테고리(베스트/신규)는 축째로 폐기됐다. 정본은 기능 메뉴(/best, /new)이고
    // 옛 /products/category/{5,6} 은 301 로 넘어가므로 사이트맵에 싣지 않는다.

    // SitemapStream으로 XML 생성
    const stream = new SitemapStream({ hostname: domain });
    const xmlPromise = streamToPromise(Readable.from(links).pipe(stream));
    const xml = (await xmlPromise).toString();

    // ETag 생성
    const etag = crypto.createHash('md5').update(xml).digest('hex');

    return { xml, etag };
}

// ── GET /sitemap.xml ────────────────────────────────
router.get('/sitemap.xml', async (req, res) => {
    // 색인 차단 중에는 사이트맵 자체를 제공하지 않는다.
    if (!isIndexingAllowed()) {
        return res.status(404).type('text/plain').send('Not Found');
    }

    try {
        const now = Date.now();

        // 캐시 히트
        if (cache.xml && (now - cache.generatedAt) < CACHE_TTL) {
            // ETag 304 처리
            if (req.headers['if-none-match'] === `"${cache.etag}"`) {
                return res.status(304).end();
            }
            res.set('Content-Type', 'application/xml; charset=utf-8');
            res.set('Cache-Control', 'public, max-age=86400');
            res.set('ETag', `"${cache.etag}"`);
            return res.send(cache.xml);
        }

        // 캐시 미스: 생성
        const { xml, etag } = await generateSitemap();
        cache = { xml, etag, generatedAt: now };

        // Google 핑 (백그라운드, 실패 무시)
        try {
            const domain = getDomain();
            const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(domain + '/sitemap.xml')}`;
            fetch(pingUrl).catch(() => {});
        } catch (_) {}

        if (req.headers['if-none-match'] === `"${etag}"`) {
            return res.status(304).end();
        }
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=86400');
        res.set('ETag', `"${etag}"`);
        res.send(xml);
    } catch (err) {
        console.error('Sitemap generation error:', err);
        res.status(500).send('Sitemap generation failed');
    }
});

// ── GET /robots.txt ─────────────────────────────────
router.get('/robots.txt', (req, res) => {
    const domain = getDomain();

    // 색인 차단 중에는 전면 Disallow. sitemap 도 함께 감춘다.
    const robots = !isIndexingAllowed()
        ? ['User-agent: *', 'Disallow: /'].join('\n')
        : [
            'User-agent: *',
            'Allow: /',
            '',
            'Disallow: /admin/',
            'Disallow: /auth/',
            'Disallow: /cart/',
            'Disallow: /checkout/',
            'Disallow: /mypage/',
            'Disallow: /api/',
            '',
            `Sitemap: ${domain}/sitemap.xml`
        ].join('\n');

    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(robots);
});

// ── RSS 캐시 ────────────────────────────────────────
let rssCache = { xml: null, generatedAt: 0 };

function escapeXml(s) {
    if (!s) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// ── GET /rss.xml (신상품 RSS 피드) ──────────────────
router.get('/rss.xml', async (req, res) => {
    try {
        const now = Date.now();
        if (rssCache.xml && (now - rssCache.generatedAt) < CACHE_TTL) {
            res.set('Content-Type', 'application/rss+xml; charset=utf-8');
            res.set('Cache-Control', 'public, max-age=86400');
            return res.send(rssCache.xml);
        }

        const domain = getDomain();
        const siteName = (global.systemSettings && global.systemSettings.company_name) || '와이디몰';
        const siteDesc = (global.systemSettings && global.systemSettings.meta_description) || '건강식품 전문 쇼핑몰';

        // 신상품 피드 — 이름대로 신상품 판정(services/catalog/newArrival)을 따른다.
        // 예전에는 판정과 무관하게 created_at 최신 50건을 뿌려, 같은 '신상품'이 화면과 다른 결과를 냈다.
        const np = newArrival.newProductPredicate('');
        const [products] = await pool.query(`
            SELECT id, name, slug, short_description, description, main_image, price, original_price, created_at, sale_start_date
            FROM products
            WHERE status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')
              AND slug IS NOT NULL AND TRIM(slug) != ''
              AND ${np.sql}
            ORDER BY ${newArrival.NEW_PRODUCT_ORDER}
            LIMIT 50
        `, [...np.params]);

        const items = products.map(p => {
            const link = `${domain}/products/${encodeURIComponent(p.slug)}`;
            const pubDate = p.created_at ? new Date(p.created_at).toUTCString() : new Date().toUTCString();
            const imgUrl = p.main_image ? (p.main_image.startsWith('http') ? p.main_image : `${domain}${p.main_image}`) : '';
            const desc = (p.short_description || (p.description ? p.description.replace(/<[^>]*>/g, '').substring(0, 200) : '') || p.name);
            // 판매가를 싣는다. 예전엔 존재하지 않는 price_retail 을 SELECT 해 RSS 가 항상 500 이었다.
            const price = p.price || 0;

            return `
    <item>
      <title>${escapeXml(p.name)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${desc}${imgUrl ? `<br><img src="${imgUrl}" alt="${escapeXml(p.name)}" />` : ''}<br>가격: ${Number(price).toLocaleString()}원]]></description>
      ${imgUrl ? `<enclosure url="${imgUrl}" type="image/jpeg" />` : ''}
    </item>`;
        }).join('');

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteName)} — 신상품</title>
    <link>${domain}</link>
    <description>${escapeXml(siteDesc)}</description>
    <language>ko-KR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${domain}/rss.xml" rel="self" type="application/rss+xml" />${items}
  </channel>
</rss>`;

        rssCache = { xml, generatedAt: now };

        res.set('Content-Type', 'application/rss+xml; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=86400');
        res.send(xml);
    } catch (err) {
        console.error('RSS generation error:', err);
        res.status(500).send('RSS generation failed');
    }
});

module.exports = router;
