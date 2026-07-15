/**
 * 상품 설명(description) 본문 내 이미지 → Shopify Files(CDN) 업로드
 *
 * yd-mall/cafe24 등 국내 서버에 있는 본문 이미지를 Shopify CDN(cdn.shopify.com)으로
 * 옮겨, 해외에서도 빠르게 로드되고 외부 서버 의존성을 제거한다.
 *
 * 업로드 전략(2단계):
 *   1차) fileCreate(originalSource = 원본 URL) — Shopify가 직접 가져와 호스팅(가장 저렴)
 *   2차) 1차 실패분(주로 Shopify 25메가픽셀 초과로 FAILED) → 다운로드 → sharp로 절반 리사이즈
 *        (25MP 이하 될 때까지) → stagedUploadsCreate로 바이너리 업로드 → fileCreate
 *
 * - shopify_image_mappings 테이블로 "원본 URL ↔ CDN URL" 캐싱 → 동일 이미지 1회만 업로드
 * - HTML 속성값의 엔티티(&amp; 등)를 디코딩해 실제 URL로 fetch, 치환 시 다시 인코딩
 * - 끝내 실패(404 등)는 원본(절대 URL)로 폴백해 최소한 깨지지 않게 유지
 *
 * 필요 권한(access scope): write_files, read_files
 */
const crypto = require('crypto');
const sharp = require('sharp');
const pool = require('../../config/db');
const { adminQuery } = require('./adminClient');

const BASE = (process.env.SHOPIFY_WEBHOOK_BASE_URL || 'https://dev-mall.ydata.co.kr').replace(/\/$/, '');

const FILE_CREATE = `
  mutation fileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files { id fileStatus ... on MediaImage { image { url } } }
      userErrors { field message code }
    }
  }`;

const FILE_POLL = `
  query($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on MediaImage { id fileStatus image { url } }
    }
  }`;

const STAGED_CREATE = `
  mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }`;

const POLL_ROUNDS = 50;          // 최대 폴링 횟수
const POLL_INTERVAL = 1500;      // ms
const RESIZE_SAFE_MP = 24_000_000;            // Shopify 25MP 한도 → 안전하게 24MP 이하로
const MAX_UPLOAD_BYTES = 19 * 1024 * 1024;    // Shopify 이미지 20MB 한도 → 안전하게 19MB 이하로

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

// HTML 속성값 → 실제 문자열 (URL 추출용). URL에서 주로 &amp; 가 문제됨.
function decodeEntities(s) {
    return s
        .replace(/&amp;/gi, '&')
        .replace(/&#0*38;/g, '&')
        .replace(/&#x0*26;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#0*39;/g, "'")
        .replace(/&#x0*27;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');
}

// HTML 속성에 다시 넣을 때 & 를 인코딩(유효 HTML 유지)
const encodeForAttr = url => url.replace(/&/g, '&amp;');

// 원본 src → 절대 URL (엔티티 디코딩 + 상대경로/프로토콜-상대 보정). data:/blob: 등은 null.
function toAbsolute(src) {
    if (!src) return null;
    const s = decodeEntities(src.trim());
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('//')) return 'https:' + s;
    if (s.startsWith('/')) return BASE + s;
    return null;
}

function basenameOf(url) {
    try { return decodeURIComponent(new URL(url).pathname.split('/').pop()) || 'image'; }
    catch { return 'image'; }
}

function guessMime(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (ext === 'png') return 'image/png';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'webp') return 'image/webp';
    return 'image/jpeg';
}

async function getCachedCdn(absoluteUrl) {
    const [[row]] = await pool.query(
        'SELECT shopify_cdn_url FROM shopify_image_mappings WHERE source_hash = ? AND shopify_cdn_url IS NOT NULL',
        [sha256(absoluteUrl)]
    );
    return row ? row.shopify_cdn_url : null;
}

async function saveMapping(absoluteUrl, fileId, cdnUrl) {
    await pool.query(
        `INSERT INTO shopify_image_mappings (source_hash, source_url, shopify_file_id, shopify_cdn_url)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE shopify_file_id = VALUES(shopify_file_id), shopify_cdn_url = VALUES(shopify_cdn_url)`,
        [sha256(absoluteUrl), absoluteUrl, fileId, cdnUrl]
    );
}

/**
 * fileCreate + READY 폴링. items: [{ key, originalSource }]
 *   key          = 매핑 저장에 쓸 원본 yd-mall URL
 *   originalSource = Shopify가 가져갈 소스(원본 URL 또는 staged resourceUrl)
 * @returns {{ success: Map<key,cdnUrl>, failedKeys: Set<key> }}
 */
async function createAndPoll(items, alt) {
    const success = new Map();
    const failedKeys = new Set();
    if (items.length === 0) return { success, failedKeys };

    const files = items.map(it => ({ originalSource: it.originalSource, contentType: 'IMAGE', alt: (alt || '').slice(0, 512) }));
    const data = await adminQuery(FILE_CREATE, { files });
    const errs = data.fileCreate.userErrors;
    if (errs?.length) console.warn(`[Shopify 이미지] fileCreate userErrors: ${errs.map(e => `${e.code || ''} ${e.message}`).join('; ')}`);

    const created = data.fileCreate.files || [];
    if (created.length !== items.length) {
        console.warn(`[Shopify 이미지] fileCreate 반환 개수 불일치(${created.length}/${items.length})`);
        items.forEach(it => failedKeys.add(it.key));
        return { success, failedKeys };
    }

    const idToKey = new Map();
    created.forEach((f, i) => { if (f?.id) idToKey.set(f.id, items[i].key); else failedKeys.add(items[i].key); });
    let pending = [...idToKey.keys()];

    for (let round = 0; round < POLL_ROUNDS && pending.length; round++) {
        await sleep(POLL_INTERVAL);
        const p = await adminQuery(FILE_POLL, { ids: pending });
        const next = [];
        for (const n of (p.nodes || [])) {
            if (!n || !n.id) continue;
            if (n.fileStatus === 'READY' && n.image?.url) success.set(idToKey.get(n.id), n.image.url);
            else if (n.fileStatus === 'FAILED') failedKeys.add(idToKey.get(n.id));
            else next.push(n.id);
        }
        pending = next;
    }
    for (const id of pending) failedKeys.add(idToKey.get(id)); // 타임아웃 → 실패로 간주(2차에서 재시도)

    for (const [id, key] of idToKey) {
        const cdn = success.get(key);
        if (cdn) await saveMapping(key, id, cdn);
    }
    return { success, failedKeys };
}

// 원본 다운로드 → Shopify 한도(25MP / 20MB) 이하로 정규화. 404·과대용량 불가 시 null.
async function fetchAndPrepare(url) {
    const res = await fetch(url);
    if (!res.ok) return null;
    let buffer = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') || '';
    let mimeType = ct.startsWith('image/') ? ct.split(';')[0].trim() : guessMime(basenameOf(url));
    let filename = basenameOf(url);
    const isGif = mimeType === 'image/gif' || /\.gif$/i.test(filename);
    const notes = [];

    try {
        const meta = await sharp(buffer, { limitInputPixels: false, animated: isGif }).metadata();
        const w = meta.width || 0;
        const frameH = meta.pageHeight || meta.height || 0;

        if (isGif && (meta.pages || 1) > 1) {
            // 애니메이션 GIF: 용량 초과 시 가로를 절반씩 줄여 재인코딩
            let width = w;
            for (let i = 0; i < 4 && buffer.length > MAX_UPLOAD_BYTES && width > 200; i++) {
                width = Math.round(width / 2);
                buffer = await sharp(buffer, { limitInputPixels: false, animated: true }).resize({ width }).gif().toBuffer();
                notes.push(`GIF→${width}px`);
            }
        } else {
            // 정적 이미지 ① 25MP 초과 → 절반씩 축소
            let width = w, height = frameH;
            if (width && height && width * height > RESIZE_SAFE_MP) {
                while (width * height > RESIZE_SAFE_MP) { width = Math.round(width / 2); height = Math.round(height / 2); }
                buffer = await sharp(buffer, { limitInputPixels: false }).resize({ width }).toBuffer();
                notes.push(`${w}x${frameH}→${width}x${height}`);
            }
            // ② 용량 초과 → JPEG 재압축(품질 점감, 필요 시 추가 축소)
            if (buffer.length > MAX_UPLOAD_BYTES) {
                let q = 85;
                let cw = width || w || (await sharp(buffer, { limitInputPixels: false }).metadata()).width;
                for (let i = 0; i < 7 && buffer.length > MAX_UPLOAD_BYTES; i++) {
                    let pipe = sharp(buffer, { limitInputPixels: false });
                    if (i > 0 && q < 45) { cw = Math.round(cw * 0.8); pipe = pipe.resize({ width: cw }); q = 75; }
                    buffer = await pipe.jpeg({ quality: q, mozjpeg: true }).toBuffer();
                    q -= 10;
                }
                mimeType = 'image/jpeg';
                filename = filename.replace(/\.[a-z0-9]+$/i, '') + '.jpg';
                notes.push('JPEG재압축');
            }
        }
    } catch (e) {
        console.warn(`[Shopify 이미지] 전처리 경고(${url}): ${e.message}`);
    }

    if (buffer.length > MAX_UPLOAD_BYTES) {
        console.warn(`[Shopify 이미지] 용량 한도 못 맞춤(${(buffer.length / 1048576).toFixed(1)}MB) 업로드 보류: ${url}`);
        return null;
    }
    return { buffer, mimeType, filename, resized: notes.join(', ') || null };
}

// 바이너리를 Shopify staged 영역에 업로드하고 resourceUrl 반환
async function stagedUpload(buffer, filename, mimeType) {
    const d = await adminQuery(STAGED_CREATE, {
        input: [{ filename, mimeType, resource: 'IMAGE', httpMethod: 'POST' }],
    });
    const errs = d.stagedUploadsCreate.userErrors;
    if (errs?.length) throw new Error(errs.map(e => e.message).join(', '));
    const target = d.stagedUploadsCreate.stagedTargets[0];

    const form = new FormData();
    for (const p of target.parameters) form.append(p.name, p.value);
    form.append('file', new Blob([buffer], { type: mimeType }), filename); // file 은 반드시 마지막

    const res = await fetch(target.url, { method: 'POST', body: form });
    if (res.status < 200 || res.status >= 300) {
        throw new Error(`staged POST 실패: ${res.status} ${await res.text().catch(() => '')}`);
    }
    return target.resourceUrl;
}

/**
 * 여러 이미지를 Shopify CDN으로 업로드(캐시 제외분). 성공한 것만 absoluteUrl → cdnUrl.
 */
async function uploadBatch(absoluteUrls, alt) {
    const uniq = [...new Set(absoluteUrls)];
    const result = new Map();
    if (uniq.length === 0) return result;

    // 1차: 원본 URL을 Shopify가 직접 가져가기
    const r1 = await createAndPoll(uniq.map(u => ({ key: u, originalSource: u })), alt);
    for (const [k, v] of r1.success) result.set(k, v);

    // 2차: 실패분 → 다운로드 + (필요 시) 리사이즈 + staged 업로드
    for (const key of r1.failedKeys) {
        try {
            const prep = await fetchAndPrepare(key);
            if (!prep) { console.warn(`[Shopify 이미지] 원본 다운로드 실패(부재로 추정): ${key}`); continue; }
            const resourceUrl = await stagedUpload(prep.buffer, prep.filename, prep.mimeType);
            const r2 = await createAndPoll([{ key, originalSource: resourceUrl }], alt);
            const cdn = r2.success.get(key);
            if (cdn) {
                result.set(key, cdn);
                console.log(`[Shopify 이미지] staged 재업로드 성공${prep.resized ? ` (리사이즈 ${prep.resized})` : ''}: ${key}`);
            } else {
                console.warn(`[Shopify 이미지] staged 재업로드 실패: ${key}`);
            }
        } catch (e) {
            console.warn(`[Shopify 이미지] staged 재시도 오류 ${key}: ${e.message}`);
        }
    }
    return result;
}

/** 단일 이미지 업로드(캐시 우선). */
async function uploadImageToShopify(absoluteUrl, alt) {
    const cached = await getCachedCdn(absoluteUrl);
    if (cached) return cached;
    const r = await uploadBatch([absoluteUrl], alt);
    const cdn = r.get(absoluteUrl);
    if (!cdn) throw new Error(`업로드 실패: ${absoluteUrl}`);
    return cdn;
}

/**
 * 설명 HTML 안의 모든 <img src>를 Shopify CDN URL로 치환한다.
 * @returns {Promise<string>} 치환된 HTML
 */
async function processDescriptionImages(html, productName) {
    if (!html) return html;

    const srcRe = /(<img\b[^>]*?\ssrc\s*=\s*)(["'])([^"']+)\2/gi;
    const origs = new Set();
    let m;
    while ((m = srcRe.exec(html)) !== null) origs.add(m[3]);
    if (origs.size === 0) return html;

    const replaceMap = new Map(); // 원문 src → 넣을 URL(HTML 인코딩 완료)
    const toUpload = [];          // { orig, abs }

    for (const orig of origs) {
        if (/cdn\.shopify\.com/i.test(orig)) continue; // 이미 Shopify CDN
        const abs = toAbsolute(orig);
        if (!abs) continue;                            // data:/blob: 등 → 원문 유지
        const cached = await getCachedCdn(abs);
        if (cached) replaceMap.set(orig, encodeForAttr(cached));
        else toUpload.push({ orig, abs });
    }

    if (toUpload.length) {
        let uploaded = new Map();
        try {
            uploaded = await uploadBatch(toUpload.map(u => u.abs), productName);
        } catch (e) {
            console.warn(`[Shopify 이미지] 배치 업로드 오류(폴백): ${e.message}`);
        }
        for (const { orig, abs } of toUpload) {
            const cdn = uploaded.get(abs);
            replaceMap.set(orig, encodeForAttr(cdn || abs)); // 실패 시 절대 URL 폴백
        }
    }

    return html.replace(srcRe, (full, pre, q, src) => {
        const repl = replaceMap.get(src);
        return repl ? `${pre}${q}${repl}${q}` : full;
    });
}

module.exports = { uploadImageToShopify, processDescriptionImages, toAbsolute };
