const dns = require('dns').promises;
const net = require('net');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/*
 * URL → 우리 사이트 업로드 (공통 미디어 수집)
 *
 * 관리자가 이미지/비디오 **URL 을 붙여넣으면 서버가 내려받아 public/uploads/ 에 저장**하고
 * 우리 경로(/uploads/...)를 돌려준다. 원본 URL 을 DB 에 그대로 박지 않는 이유:
 *   - 상대 사이트가 링크를 바꾸거나 핫링크를 차단하면 **우리 몰의 이미지가 깨진다**
 *   - 저장해 두면 이후 동작이 **직접 업로드한 것과 완전히 같아진다**(리사이즈·삭제·백업)
 *
 * 원래 services/catalog/productImporter.js 안에만 있던 로직을 여기로 올려
 * 상품·배너·히어로·브랜드 등 **모든 업로드 지점에서 재사용**한다.
 *
 * ⚠️ 이 기능은 **서버가 임의 URL 로 요청을 보낸다**(SSRF 면). 그래서
 *   - http/https 만 허용하고,
 *   - 호스트를 DNS 로 풀어 **사설/루프백 IP 를 차단**하며(내부망 192.168.1.x·메타데이터 IP 보호),
 *   - 응답 크기·시간에 상한을 둔다.
 * 저작권·이용약관은 서비스가 판단할 수 없다 — 가져온 콘텐츠를 쓸 권리는 운영자 책임이다.
 */

const FETCH_TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/*
 * 히어로 비디오 상한 — 미디어 스펙(목표 3~5MB, 최대 8MB, 5~10초).
 * 서버 변환(ffmpeg)이 없으므로 **운영자가 스펙에 맞춰 인코딩해 올려야 한다**.
 * 그래서 여기서 8MB 를 넘기면 받지 않고 명확히 거절한다(자동 축소가 불가능하기 때문).
 * 나중에 비동기 변환 워커가 붙으면 원본을 크게 받아 여기서 줄이면 된다.
 */
const MAX_VIDEO_BYTES = 8 * 1024 * 1024;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/*
 * 저장 대상 폴더 화이트리스트 — 사용자가 보낸 dest 를 그대로 경로에 쓰면 경로 traversal 이 된다.
 * middleware/upload.js 의 fieldname→폴더 분기와 같은 폴더를 쓴다(직접 업로드와 동일 취급).
 */
const DEST_DIRS = {
    products: 'products',
    banners: 'banners',
    brands: 'brands',
    logo: 'logo',
    og: 'og',
    hero: 'hero',
    exhibitions: 'exhibitions',
    'group-buys': 'group-buys',
};

const VIDEO_EXT_BY_MIME = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogv',
    'video/quicktime': 'mov',
};

class IngestError extends Error {
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

/** http/https + 공인 IP 인지 확인하고 URL 객체를 돌려준다. */
async function assertPublicUrl(raw) {
    let url;
    try {
        url = new URL(String(raw || '').trim());
    } catch {
        throw new IngestError('URL 형식이 올바르지 않습니다.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new IngestError('http/https URL 만 가져올 수 있습니다.');
    }
    const addrs = net.isIP(url.hostname)
        ? [{ address: url.hostname }]
        : await dns.lookup(url.hostname, { all: true }).catch(() => {
            throw new IngestError('주소를 찾을 수 없습니다.');
        });
    if (addrs.some((a) => isPrivateIp(a.address))) {
        throw new IngestError('내부망 주소는 가져올 수 없습니다.');
    }
    return url;
}

function resolveDir(dest) {
    const sub = DEST_DIRS[String(dest || 'products')];
    if (!sub) throw new IngestError(`허용되지 않은 저장 위치입니다: ${dest}`);
    const dir = path.join('public', 'uploads', sub);
    fs.mkdirSync(dir, { recursive: true });
    return { dir, web: `/uploads/${sub}` };
}

/** multer 와 같은 파일명 규칙 — 직접 업로드한 파일과 구분되지 않게. */
function makeFilename(ext) {
    return `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
}

async function fetchBinary(url, { accept, maxBytes, referer }) {
    const res = await fetch(url, {
        headers: Object.assign(
            { 'User-Agent': UA, Accept: accept },
            referer ? { Referer: referer } : {},
        ),
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch((err) => {
        throw new IngestError(err.name === 'TimeoutError' ? '응답이 너무 느립니다.' : '가져오지 못했습니다.');
    });
    if (!res.ok) throw new IngestError(`가져오지 못했습니다. (HTTP ${res.status})`, 502);

    // Content-Length 로 먼저 거르고(대용량 다운로드 방지), 실제 바이트로 한 번 더 확인한다.
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
        throw new IngestError('파일이 너무 큽니다.', 413);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new IngestError('빈 파일입니다.');
    if (buf.length > maxBytes) throw new IngestError('파일이 너무 큽니다.', 413);

    return { buf, contentType: (res.headers.get('content-type') || '').split(';')[0].trim() };
}

/**
 * 외부 이미지 URL → public/uploads/{dest}/ 저장. sharp 로 재인코딩한다
 * (재인코딩 실패 = 이미지가 아니거나 손상 → 명확히 실패시킨다).
 *
 * 원본을 크게 받아도 여기서 자동으로 줄여 저장한다 — 이미지는 서버 변환이 이미 갖춰져 있다.
 *
 * @param {string} rawUrl
 * @param {{dest?:string, referer?:string, maxWidth?:number, maxHeight?:number,
 *          quality?:number, format?:'jpeg'|'webp'}} opts
 * @returns {Promise<string>} 우리 사이트 경로 (예: /uploads/products/1712...-123.jpg)
 */
async function ingestImageFromUrl(rawUrl, opts = {}) {
    const url = await assertPublicUrl(rawUrl);
    const { dir, web } = resolveDir(opts.dest);
    const { buf } = await fetchBinary(url.href, {
        accept: 'image/*',
        maxBytes: MAX_IMAGE_BYTES,
        referer: opts.referer,
    });

    // poster 는 WebP 를 쓴다(같은 화질에서 JPEG 보다 작다 — 미디어 스펙: Poster WebP 100~300KB).
    const format = opts.format === 'webp' ? 'webp' : 'jpeg';
    const filename = makeFilename(format === 'webp' ? 'webp' : 'jpg');

    let pipeline = sharp(buf).rotate();
    if (opts.maxWidth || opts.maxHeight) {
        pipeline = pipeline.resize(opts.maxWidth || null, opts.maxHeight || null, {
            fit: 'inside', withoutEnlargement: true,
        });
    }
    pipeline = format === 'webp'
        ? pipeline.webp({ quality: opts.quality || 82 })
        : pipeline.jpeg({ quality: opts.quality || 88 });

    try {
        await pipeline.toFile(path.join(dir, filename));
    } catch (e) {
        throw new IngestError('이미지로 읽을 수 없는 파일입니다.');
    }
    return `${web}/${filename}`;
}

/**
 * 외부 비디오 URL → public/uploads/{dest}/ 저장. 재인코딩하지 않는다(ffmpeg 없음).
 * mime 으로 확장자를 정하므로 mp4/webm 이 원본 그대로 보존된다.
 *
 * ⚠️ 대용량이다. 운영에서는 CDN/오브젝트 스토리지가 정석이며 여기 저장은 소규모 전제다.
 * ⚠️ public/uploads 는 .gitignore 라 **납품 기본 자산으로는 못 쓴다**(고객이 자기 몰에 올리는 용도).
 */
async function ingestVideoFromUrl(rawUrl, opts = {}) {
    const url = await assertPublicUrl(rawUrl);
    const { dir, web } = resolveDir(opts.dest || 'hero');
    const { buf, contentType } = await fetchBinary(url.href, {
        accept: 'video/*',
        maxBytes: opts.maxBytes || MAX_VIDEO_BYTES,
        referer: opts.referer,
    });

    const ext = VIDEO_EXT_BY_MIME[contentType];
    if (!ext) throw new IngestError(`지원하지 않는 비디오 형식입니다: ${contentType || '알 수 없음'}`);

    const filename = makeFilename(ext);
    await fs.promises.writeFile(path.join(dir, filename), buf);
    return `${web}/${filename}`;
}

/** kind 로 분기하는 단일 진입점(라우트에서 사용). */
async function ingestFromUrl(rawUrl, { kind = 'image', dest, referer, maxWidth, format } = {}) {
    if (kind === 'video') return ingestVideoFromUrl(rawUrl, { dest, referer });
    return ingestImageFromUrl(rawUrl, { dest, referer, maxWidth, format });
}

module.exports = {
    ingestFromUrl,
    ingestImageFromUrl,
    ingestVideoFromUrl,
    assertPublicUrl,
    isPrivateIp,
    IngestError,
    DEST_DIRS,
    MAX_IMAGE_BYTES,
    MAX_VIDEO_BYTES,
};
