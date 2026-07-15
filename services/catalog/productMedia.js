const fs = require('fs/promises');
const path = require('path');
const pool = require('../../config/db');

/*
 * 상품 물리 파일(이미지·업로드 영상) 정리.
 *
 * 상품을 영구 삭제하면 DB 행은 FK CASCADE 로 사라지지만, public/uploads/products/ 에
 * 저장된 실제 파일은 그대로 남아 "고아 파일" 이 된다. 몰 빌더 특성상 상품을
 * 만들고→지우고→다시 만드는 반복이 정상 흐름이라, 삭제 시 파일도 함께 정리한다.
 *
 * 안전 규칙:
 *   - 삭제 대상은 반드시 `/uploads/products/<파일명>` 패턴만(경로 이탈 차단).
 *   - 다른 상품이 여전히 참조하는 파일은 지우지 않는다(공유 이미지 보존).
 *   - 파일 삭제 실패는 무시(로그만) — 파일 정리가 상품 삭제 자체를 막지 않는다.
 */

const PUBLIC_UPLOADS = path.join(__dirname, '..', '..', 'public', 'uploads', 'products');

/** 안전한 상품 업로드 URL 만 물리 경로로 변환한다. 그 외(외부 URL·경로 이탈)는 null. */
function toPhysicalSafe(url) {
    if (typeof url !== 'string') return null;
    const m = /^\/uploads\/products\/([\w.-]+)$/.exec(url);
    if (!m || m[1] === '.' || m[1] === '..') return null;
    return path.join(PUBLIC_UPLOADS, m[1]);
}

/**
 * 상품에 딸린 물리 파일 URL 을 수집한다(대표·썸네일·업로드 영상 + 서브 이미지).
 * product_images 는 상품 삭제 시 CASCADE 로 사라지므로 **반드시 삭제 전에** 호출한다.
 * @returns {Promise<string[]>} 중복 제거된 URL 목록
 */
async function collectProductMediaUrls(productId) {
    const urls = new Set();

    const [[p]] = await pool.query(
        'SELECT main_image, thumbnail_image, video_type, video_url FROM products WHERE id = ?',
        [productId]
    );
    if (p) {
        if (p.main_image) urls.add(p.main_image);
        if (p.thumbnail_image) urls.add(p.thumbnail_image);
        // 영상은 FILE 로 업로드된 것만 로컬 파일이다(YOUTUBE 는 외부 URL → 대상 아님).
        if (p.video_type === 'FILE' && p.video_url) urls.add(p.video_url);
    }

    const [subs] = await pool.query(
        'SELECT image_url FROM product_images WHERE product_id = ?', [productId]
    );
    for (const s of subs) if (s.image_url) urls.add(s.image_url);

    return [...urls];
}

/**
 * 넘겨받은 URL 중 (1) 안전한 업로드 경로이고 (2) 어떤 상품도 더는 참조하지 않는
 * 파일만 디스크에서 지운다. 상품 행을 이미 지운 "뒤에" 호출한다(참조 0 판정을 위해).
 * @returns {Promise<{removed:number, kept:number}>}
 */
async function deleteOrphanMedia(urls) {
    let removed = 0;
    let kept = 0;

    for (const url of urls) {
        const physical = toPhysicalSafe(url);
        if (!physical) { kept++; continue; }

        // 다른 상품(대표/썸네일/영상) 또는 다른 상품의 서브이미지가 여전히 쓰면 보존.
        const [[{ n }]] = await pool.query(
            `SELECT (
                 (SELECT COUNT(*) FROM products WHERE main_image = ? OR thumbnail_image = ? OR video_url = ?)
               + (SELECT COUNT(*) FROM product_images WHERE image_url = ?)
             ) AS n`,
            [url, url, url, url]
        );
        if (Number(n) > 0) { kept++; continue; }

        try {
            await fs.unlink(physical);
            removed++;
        } catch (e) {
            if (e.code !== 'ENOENT') {
                console.error(`[product media] 파일 삭제 실패 ${url}: ${e.message}`);
            }
            // ENOENT(이미 없음)는 정상 — 목표 상태에 도달했으므로 무시.
        }
    }

    return { removed, kept };
}

module.exports = { collectProductMediaUrls, deleteOrphanMedia, toPhysicalSafe };
