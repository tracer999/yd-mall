/*
 * 네이버 상품 이미지 업로드.
 * 설계: docs/사이트개선/네이버_스마트스토어_연동.md §이미지
 *
 * 왜 별도 단계인가:
 *   네이버는 **외부 호스트의 이미지 URL 을 상품 등록에 직접 넣는 것을 거부**한다.
 *   반드시 이 업로드 API 가 돌려준 URL(shop*.phinf.naver.net)만 쓸 수 있다.
 *
 * 반드시 지켜야 하는 제약(공식):
 *   1. 엔드포인트는 **v1** 이다 — 상품 등록만 v2 다. 헷갈리기 쉽다.
 *   2. 폼 필드명은 **imageFiles** 고정. 다건이어도 전부 같은 이름으로 넣는다.
 *   3. 1회 최대 **10장**, payload 합계 **10MB 미만**.
 *   4. 허용 포맷은 **JPG/GIF/PNG/BMP 뿐** — 우리 업로드는 webp 라 변환이 필수다.
 *   5. **한 스토어 계정당 동시 1건만** 처리된다. 병렬 호출하면
 *      "이전 요청이 진행중입니다" 로 실패한다. → 계정 단위 직렬 락.
 *   6. Content-Type 은 확장자가 아니라 **실제 바이너리 포맷**과 일치해야 한다.
 */

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const pool = require('../../../config/db');
const naverClient = require('./naverClient');

const UPLOAD_PATH = '/v1/product-images/upload';
const PUBLIC_ROOT = path.join(__dirname, '..', '..', '..', 'public');

// 공식 제한. 용량은 여유를 둬 8MB 에서 끊는다(멀티파트 오버헤드 + 경계값 회피).
const MAX_FILES_PER_CALL = 10;
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;

// 네이버가 받는 포맷. 그 외(webp 등)는 jpeg 로 변환한다.
const PASSTHROUGH = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
};

/*
 * 계정 단위 직렬 락.
 * 스로틀(naverClient)은 "간격"만 보장할 뿐 동시성을 1로 만들지 않는다.
 * 이미지 업로드는 간격이 아니라 **겹치지 않음**이 요구조건이라 별도 락이 필요하다.
 */
const _locks = new Map(); // clientId → Promise chain

function withAccountLock(clientId, fn) {
    const key = String(clientId || 'default');
    const prev = _locks.get(key) || Promise.resolve();
    const next = prev.then(fn, fn);
    // 실패가 뒤를 막지 않도록 체인은 항상 resolve 로 이어 둔다.
    _locks.set(key, next.then(() => {}, () => {}));
    return next;
}

/** 우리 웹경로(/uploads/products/x.webp) → 실제 파일 절대경로. */
function toAbsolute(webPath) {
    const rel = String(webPath || '').replace(/^\/+/, '');
    const abs = path.join(PUBLIC_ROOT, rel);
    // 경로 traversal 방지 — DB 값이라도 그대로 믿지 않는다.
    if (!abs.startsWith(PUBLIC_ROOT)) throw new Error(`허용되지 않은 이미지 경로: ${webPath}`);
    return abs;
}

function isRemote(src) {
    return /^https?:\/\//i.test(String(src || ''));
}

/**
 * 원격 이미지를 받아 온다.
 *
 * 왜 필요한가: 우리 `products.main_image` 는 대부분 **공급처 호스트의 외부 URL** 이다
 * (소싱으로 들어온 상품). 네이버는 외부 URL 을 그대로 받지 않으므로, 우리가 내려받아
 * 업로드 API 로 다시 올려야 한다. 로컬 파일만 읽던 시절의 코드로는 등록 자체가 불가능했다.
 */
const REMOTE_TIMEOUT_MS = 15000;
const MAX_REMOTE_BYTES = 12 * 1024 * 1024;   // 변환 전 원본 상한

async function fetchRemote(url) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), REMOTE_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: ac.signal,
            // 일부 CDN 은 UA 가 없으면 403 을 준다.
            headers: { 'user-agent': 'Mozilla/5.0 (compatible; yd-mall/1.0)' },
        });
        if (!res.ok) throw new Error(`이미지 다운로드 실패(${res.status}): ${url}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length) throw new Error(`이미지가 비어 있습니다: ${url}`);
        if (buf.length > MAX_REMOTE_BYTES) {
            throw new Error(`이미지가 너무 큽니다(${Math.round(buf.length / 1024 / 1024)}MB): ${url}`);
        }
        return buf;
    } catch (e) {
        if (e.name === 'AbortError') throw new Error(`이미지 다운로드 시간초과: ${url}`);
        throw e;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 네이버가 받는 형태로 파일을 준비한다.
 * 로컬 경로(`/uploads/...`)와 외부 URL(`https://...`) 을 모두 받는다.
 * webp 등 비허용 포맷은 jpeg 로 재인코딩한다(원본은 건드리지 않는다).
 *
 * ★ 확장자를 믿지 않는다. 외부 URL 은 확장자가 없거나 실제 포맷과 다른 경우가 흔해
 *   `sharp` 로 **실제 바이너리 포맷**을 확인한다(제약 6: Content-Type 은 실제 포맷과 일치해야 함).
 * @returns {Promise<{buffer:Buffer, filename:string, contentType:string, hash:string}>}
 */
async function prepareFile(webPath) {
    let buffer;
    let base;

    if (isRemote(webPath)) {
        buffer = await fetchRemote(webPath);
        const name = path.basename(new URL(webPath).pathname) || 'image';
        base = path.basename(name, path.extname(name)) || 'image';
    } else {
        const abs = toAbsolute(webPath);
        buffer = await fs.readFile(abs);
        base = path.basename(abs, path.extname(abs));
    }

    // 실제 포맷으로 판정한다(확장자·Content-Type 헤더가 아니라).
    let format;
    try {
        format = (await sharp(buffer).metadata()).format;
    } catch (e) {
        throw new Error(`이미지를 해석할 수 없습니다: ${webPath}`);
    }
    let contentType = PASSTHROUGH[`.${format}`];
    let filename = `${base}.${format}`;

    if (!contentType) {
        // webp·avif 등 → jpeg. 알파 채널이 있으면 흰 배경을 깔아야 검게 뭉개지지 않는다.
        buffer = await sharp(buffer)
            .flatten({ background: '#ffffff' })
            .jpeg({ quality: 90 })
            .toBuffer();
        contentType = 'image/jpeg';
        filename = `${base}.jpg`;
    }

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    return { buffer, filename, contentType, hash };
}

/** 캐시 조회 — 이미 올린 이미지는 다시 올리지 않는다(호출 한도·시간 절약). */
async function findCached(mallId, webPaths) {
    if (!webPaths.length) return new Map();
    const [rows] = await pool.query(
        `SELECT local_path, remote_url FROM channel_image_cache
          WHERE mall_id = ? AND channel = 'NAVER_SMARTSTORE' AND local_path IN (?)`,
        [mallId, webPaths]
    );
    return new Map(rows.map((r) => [r.local_path, r.remote_url]));
}

async function saveCache(mallId, entries) {
    if (!entries.length) return;
    await pool.query(
        `INSERT INTO channel_image_cache (mall_id, channel, local_path, file_hash, remote_url)
         VALUES ${entries.map(() => '(?, ?, ?, ?, ?)').join(', ')}
         ON DUPLICATE KEY UPDATE remote_url = VALUES(remote_url), file_hash = VALUES(file_hash), uploaded_at = NOW()`,
        entries.flatMap((e) => [mallId, 'NAVER_SMARTSTORE', e.local_path, e.file_hash, e.remote_url])
    );
}

/** 준비된 파일들을 10장·8MB 기준으로 묶는다. */
function chunkFiles(files) {
    const chunks = [];
    let cur = [];
    let bytes = 0;
    for (const f of files) {
        const tooMany = cur.length >= MAX_FILES_PER_CALL;
        const tooBig = cur.length > 0 && bytes + f.buffer.length > MAX_PAYLOAD_BYTES;
        if (tooMany || tooBig) {
            chunks.push(cur);
            cur = [];
            bytes = 0;
        }
        cur.push(f);
        bytes += f.buffer.length;
    }
    if (cur.length) chunks.push(cur);
    return chunks;
}

/**
 * 웹경로 목록을 네이버에 업로드하고 **입력 순서 그대로** 네이버 URL 배열을 돌려준다.
 * 순서가 어긋나면 대표이미지가 뒤바뀌므로 순서 보존이 중요하다.
 *
 * @param {object} cred  네이버 자격증명
 * @param {number} mallId
 * @param {string[]} webPaths  ['/uploads/products/a.webp', ...]
 * @returns {Promise<{urls:string[], uploaded:number, cached:number}>}
 */
async function uploadImages(cred, mallId, webPaths) {
    const list = (webPaths || []).filter(Boolean);
    if (!list.length) return { urls: [], uploaded: 0, cached: 0 };

    const cache = await findCached(mallId, list);
    const result = new Map(cache); // webPath → naver url
    const todo = list.filter((p) => !result.has(p));

    if (todo.length) {
        const prepared = [];
        for (const p of todo) {
            prepared.push({ webPath: p, ...(await prepareFile(p)) });
        }

        const chunks = chunkFiles(prepared);
        for (const chunk of chunks) {
            const form = new FormData();
            for (const f of chunk) {
                // 필드명은 반드시 imageFiles — 다르면 400 "입력정보가 올바르지 않습니다".
                form.append('imageFiles', new Blob([f.buffer], { type: f.contentType }), f.filename);
            }

            // 계정 단위 직렬 — 네이버가 동시 업로드를 거부한다.
            const res = await withAccountLock(cred && cred.clientId, () =>
                naverClient.apiPostForm(cred, UPLOAD_PATH, form)
            );

            const images = (res && res.images) || [];
            if (images.length !== chunk.length) {
                throw new Error(
                    `이미지 업로드 응답 개수 불일치(요청 ${chunk.length} / 응답 ${images.length}) — 순서를 신뢰할 수 없어 중단합니다.`
                );
            }
            const saved = [];
            for (let i = 0; i < chunk.length; i++) {
                const url = images[i] && images[i].url;
                if (!url) throw new Error('이미지 업로드 응답에 url 이 없습니다.');
                result.set(chunk[i].webPath, url);
                saved.push({ local_path: chunk[i].webPath, file_hash: chunk[i].hash, remote_url: url });
            }
            await saveCache(mallId, saved);
        }
    }

    return {
        urls: list.map((p) => result.get(p)).filter(Boolean),
        uploaded: todo.length,
        cached: list.length - todo.length,
    };
}

module.exports = {
    uploadImages,
    prepareFile,
    chunkFiles,
    UPLOAD_PATH,
    MAX_FILES_PER_CALL,
    MAX_PAYLOAD_BYTES,
};
