const dns = require('dns').promises;
const net = require('net');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/*
 * 상품 URL 가져오기 (관리자 상품 등록 보조)
 *
 * 외부 쇼핑몰 상품 상세 URL 에서 상품명·가격·이미지·설명을 뽑아 등록 폼을 채운다.
 * 파싱 우선순위는 **구조화 데이터 → OpenGraph → HTML** 이다.
 *
 *   1) JSON-LD (schema.org/Product)  — name/offers.price/image[]/brand/sku/description. 가장 정확하다.
 *   2) OpenGraph (og:title/og:image/og:description, product:price:amount)
 *   3) <title> / <meta name="description">
 *
 * 페이지가 JS 로 그리는 값(동적 렌더)은 가져올 수 없다. 그래서 결과는 **초안**이며,
 * 저장하지 않고 폼에 채우기만 한다 — 운영자가 확인하고 [저장] 을 눌러야 상품이 만들어진다.
 *
 * ⚠️ 이 기능은 **서버가 임의 URL 로 요청을 보낸다**(SSRF 면). 그래서
 *   - http/https 만 허용하고,
 *   - 호스트를 DNS 로 풀어 **사설/루프백 IP 를 차단**하며(내부망 192.168.1.x·메타데이터 IP 보호),
 *   - 응답 크기·시간에 상한을 둔다.
 * 저작권·이용약관은 서비스가 판단할 수 없다 — 가져온 콘텐츠를 쓸 권리는 운영자 책임이다.
 */

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 4 * 1024 * 1024;      // 상품 상세 HTML 은 보통 1MB 미만
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGES = 10;                        // 서브 이미지 업로드 상한(multer)과 같은 수
const UPLOAD_DIR = path.join('public', 'uploads', 'products');

// 브라우저 UA 를 쓴다. 기본 UA 로는 봇으로 보고 빈 페이지를 주는 몰이 많다.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

class ImportError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

/** 사설·루프백·링크로컬 대역. 여기로 나가는 요청은 내부망 스캔이 된다. */
function isPrivateIp(ip) {
    if (net.isIPv4(ip)) {
        const [a, b] = ip.split('.').map(Number);
        return a === 10 || a === 127 || a === 0
            || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && b === 168)
            || (a === 169 && b === 254)
            || (a === 100 && b >= 64 && b <= 127);
    }
    const v6 = ip.toLowerCase();
    return v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

async function assertPublicUrl(raw) {
    let url;
    try {
        url = new URL(String(raw || '').trim());
    } catch {
        throw new ImportError('URL 형식이 올바르지 않습니다.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new ImportError('http/https URL 만 가져올 수 있습니다.');
    }

    // 호스트가 이미 IP 면 그대로, 도메인이면 DNS 로 풀어서 검사한다.
    const addrs = net.isIP(url.hostname)
        ? [{ address: url.hostname }]
        : await dns.lookup(url.hostname, { all: true }).catch(() => { throw new ImportError('주소를 찾을 수 없습니다.'); });

    if (addrs.some(a => isPrivateIp(a.address))) {
        throw new ImportError('내부망 주소는 가져올 수 없습니다.');
    }
    return url;
}

async function fetchWithLimit(url, { maxBytes, accept }) {
    const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', Accept: accept },
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch((err) => {
        throw new ImportError(err.name === 'TimeoutError' ? '페이지 응답이 너무 느립니다.' : '페이지를 가져오지 못했습니다.');
    });

    if (!res.ok) throw new ImportError(`페이지를 가져오지 못했습니다. (HTTP ${res.status})`, 502);

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new ImportError('응답이 너무 큽니다.', 413);
    return { buf, contentType: res.headers.get('content-type') || '' };
}

/* ── 파싱 ─────────────────────────────────────────────── */

function decodeEntities(s) {
    return String(s || '')
        .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .trim();
}

/** <meta property|name="key" content="..."> — 속성 순서가 뒤집힌 경우도 잡는다. */
function metaContent(html, key) {
    const k = key.replace(/[:.]/g, '\\$&');
    const patterns = [
        new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, 'i'),
        new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, 'i'),
    ];
    for (const re of patterns) {
        const m = html.match(re);
        if (m && m[1]) return decodeEntities(m[1]);
    }
    return null;
}

/** JSON-LD 블록을 전부 훑어 schema.org Product 노드를 찾는다(@graph·배열 중첩 포함). */
function findJsonLdProduct(html) {
    const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const block of blocks) {
        const json = block.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '');
        let data;
        try { data = JSON.parse(json); } catch { continue; }   // 깨진 JSON-LD 는 흔하다 — 조용히 넘어간다

        const stack = [data];
        while (stack.length) {
            const node = stack.shift();
            if (!node || typeof node !== 'object') continue;
            if (Array.isArray(node)) { stack.push(...node); continue; }

            const type = [].concat(node['@type'] || []);
            if (type.includes('Product')) return node;
            if (node['@graph']) stack.push(node['@graph']);
        }
    }
    return null;
}

function firstOffer(product) {
    const offers = [].concat(product.offers || []);
    return offers.find(o => o && (o.price != null || (o.priceSpecification && o.priceSpecification.price != null))) || null;
}

function toPrice(v) {
    if (v == null) return null;
    const n = Number(String(v).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** HTML 태그를 벗기고 공백을 정리한다(설명은 폼의 textarea 로 들어간다). */
function stripTags(s) {
    return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseProduct(html, pageUrl) {
    const ld = findJsonLdProduct(html) || {};
    const offer = firstOffer(ld);

    const name = ld.name
        || metaContent(html, 'og:title')
        || decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '')
        || null;

    const price = toPrice(offer && (offer.price ?? (offer.priceSpecification && offer.priceSpecification.price)))
        || toPrice(metaContent(html, 'product:price:amount'))
        || toPrice(metaContent(html, 'og:price:amount'));

    const description = stripTags(ld.description || metaContent(html, 'og:description') || metaContent(html, 'description') || '');

    const brand = (ld.brand && (typeof ld.brand === 'string' ? ld.brand : ld.brand.name)) || null;

    // 이미지는 JSON-LD 배열이 우선(상세 이미지 전부), 없으면 og:image 한 장.
    const rawImages = [].concat(ld.image || []).map(i => (typeof i === 'string' ? i : (i && i.url) || null));
    const ogImage = metaContent(html, 'og:image');
    const images = [...new Set([...rawImages, ogImage].filter(Boolean))]
        .map(src => { try { return new URL(src, pageUrl).href; } catch { return null; } })
        .filter(Boolean)
        .slice(0, MAX_IMAGES);

    /*
     * "이 페이지가 정말 상품 페이지인가" 의 근거.
     *
     * 봇을 막는 몰(네이버 쇼핑 등)은 200 과 함께 **에러/안내 페이지**를 준다. 그걸 그대로 파싱하면
     * `<title>` 이 상품명 자리에 들어가 "에러 페이지 : 네이버 쇼핑" 같은 쓰레기가 폼에 채워진다.
     * → 구조화 데이터(Product) · 상품형 OG · 가격 중 **하나도 없으면 상품 페이지로 인정하지 않는다.**
     */
    const ogType = String(metaContent(html, 'og:type') || '').toLowerCase();
    const hasProductEvidence = Boolean(findJsonLdProduct(html)) || ogType.includes('product') || price != null;

    return {
        hasProductEvidence,
        name: name ? name.slice(0, 200) : null,
        price,
        // 세일 전 가격(정가)은 표준 필드가 없다. 있으면 쓰고, 없으면 운영자가 채운다.
        original_price: toPrice(ld.highPrice) || toPrice(offer && offer.highPrice) || null,
        description,
        brand,
        sku: ld.sku ? String(ld.sku).slice(0, 100) : null,
        stock: null,
        images,
        sourceUrl: pageUrl,
    };
}

/* ── 사이트 어댑터 ────────────────────────────────────── */

/*
 * 몰마다 HTML 파싱이 통하지 않는 경우가 있다. 네이버 쇼핑이 그렇다 —
 * 상품 페이지를 서버에서 받으면 봇으로 보고 rate-limit 안내 페이지(shopv.pstatic.net)로 돌린다.
 * 대신 화면이 쓰는 **공개 JSON API**(/v1/products/{id})는 그대로 응답한다 → 그쪽을 읽는다.
 *
 * 어댑터가 없는 몰은 기존 경로(JSON-LD → OG → HTML)로 간다. SSF 처럼 구조화 데이터를 잘 갖춘
 * 몰은 그것만으로 충분하다.
 */
const ADAPTERS = [
    {
        name: 'naver-shopping',
        match: (host) => /(^|\.)shopping\.naver\.com$/i.test(host),
        load: loadNaverShopping,
    },
];

async function loadNaverShopping(url) {
    // /window-products/style/10347772511 · /products/10347772511 … 경로 마지막의 숫자 id 를 쓴다.
    const id = (url.pathname.match(/(\d{6,})(?:\/|$)/) || [])[1];
    if (!id) throw new ImportError('네이버 쇼핑 상품 URL 에서 상품 번호를 찾지 못했습니다.');

    const res = await fetch(`https://shopping.naver.com/v1/products/${id}`, {
        headers: { 'User-Agent': UA, Accept: 'application/json', Referer: url.href },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch(() => { throw new ImportError('네이버 쇼핑에서 상품 정보를 가져오지 못했습니다.'); });

    if (!res.ok) throw new ImportError(`네이버 쇼핑 응답 오류 (HTTP ${res.status})`, 502);

    const d = await res.json().catch(() => { throw new ImportError('네이버 쇼핑 응답을 해석하지 못했습니다.', 502); });
    if (!d || !d.name) throw new ImportError('이 URL 에서 상품 정보를 찾지 못했습니다.');

    // 할인가가 있으면 그것이 판매가, 원래 정가는 salePrice 로 남긴다.
    const sale = toPrice(d.salePrice);
    const discounted = toPrice(d.discountedSalePrice)
        || toPrice(d.benefitsView && d.benefitsView.discountedSalePrice);
    const price = discounted || sale;
    const original = (discounted && sale && sale > discounted) ? sale : null;

    // 대표 이미지(REPRESENTATIVE)를 첫 장으로 올린다 — 첫 장이 상품의 대표 이미지가 된다.
    const images = [...(d.productImages || [])]
        .sort((a, b) => (a.imageType === 'REPRESENTATIVE' ? -1 : 0) - (b.imageType === 'REPRESENTATIVE' ? -1 : 0))
        .map(i => i && i.url)
        .filter(Boolean)
        .slice(0, MAX_IMAGES);

    return {
        hasProductEvidence: true,
        name: String(d.name).slice(0, 200),
        price,
        original_price: original,
        description: '',            // 상세 설명은 API 에 없다(에디터 콘텐츠 별도) — 운영자가 채운다
        brand: (d.channel && d.channel.channelName) || null,   // 판매 채널(스토어)명
        sku: d.productNo ? String(d.productNo).slice(0, 100) : String(id),
        stock: Number.isFinite(Number(d.stockQuantity)) ? Number(d.stockQuantity) : null,
        images,
        sourceUrl: url.href,
    };
}

/* ── 이미지 저장 ──────────────────────────────────────── */

/**
 * 외부 이미지를 내려받아 public/uploads/products 에 저장하고 URL 을 돌려준다.
 *
 * 원본 URL 을 그대로 상품에 박으면 상대 사이트가 링크를 바꾸는 순간 이미지가 깨진다(핫링크 차단도 흔하다).
 * 업로드 경로에 넣어 두면 이후 동작이 **직접 업로드한 상품과 완전히 같아진다**.
 * sharp 로 재인코딩한다 — 실패하면 이미지가 아니거나 손상된 것이므로 그 장만 건너뛴다.
 */
async function downloadImages(urls, referer) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });

    const saved = [];
    for (const url of urls.slice(0, MAX_IMAGES)) {
        try {
            await assertPublicUrl(url);
            const res = await fetch(url, {
                headers: { 'User-Agent': UA, Referer: referer, Accept: 'image/*' },
                redirect: 'follow',
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            if (!res.ok) continue;

            const buf = Buffer.from(await res.arrayBuffer());
            if (!buf.length || buf.length > MAX_IMAGE_BYTES) continue;

            const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
            await sharp(buf).rotate().jpeg({ quality: 88 }).toFile(path.join(UPLOAD_DIR, filename));
            saved.push('/uploads/products/' + filename);
        } catch (err) {
            console.error('[productImporter] 이미지 저장 실패:', url, err.message);
        }
    }
    return saved;
}

/**
 * URL → 상품 초안. 이미지는 내려받아 업로드 경로에 저장한 뒤 그 URL 을 돌려준다.
 * DB 에는 아무것도 쓰지 않는다(폼 채우기 전용).
 */
async function importFromUrl(rawUrl, { withImages = true } = {}) {
    const url = await assertPublicUrl(rawUrl);

    const adapter = ADAPTERS.find(a => a.match(url.hostname));
    const draft = adapter
        ? await adapter.load(url)
        : parseProduct(
            (await fetchWithLimit(url.href, {
                maxBytes: MAX_HTML_BYTES,
                accept: 'text/html,application/xhtml+xml',
            })).buf.toString('utf8'),
            url.href,
        );

    /*
     * 봇 차단·에러 안내 페이지도 HTTP 200 으로 온다(네이버 쇼핑 등). 그때 <title> 을 상품명으로 채우면
     * "에러 페이지 : 네이버 쇼핑" 같은 값이 폼에 들어간다 → 상품 근거가 없으면 아예 실패로 돌린다.
     */
    if (!draft.name || !draft.hasProductEvidence) {
        throw new ImportError(
            '이 페이지에서 상품 정보를 찾지 못했습니다. 상품 상세 페이지 URL 인지 확인해 주세요. '
            + '(로그인이 필요하거나 화면을 JS 로 그리는 몰은 가져올 수 없습니다.)'
        );
    }
    delete draft.hasProductEvidence;   // 응답에는 내보내지 않는다(폼이 쓸 값이 아니다)

    const images = withImages ? await downloadImages(draft.images, url.href) : [];
    return Object.assign(draft, {
        images,
        main_image: images[0] || null,
        sub_images: images.slice(1),
    });
}

module.exports = { importFromUrl, ImportError };
