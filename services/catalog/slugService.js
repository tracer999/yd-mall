/*
 * 상품 slug 생성 — 상품 등록/수정 화면과 외부 상품 이관이 함께 쓴다.
 *
 * 원래 controllers/admin/productController.js 안에만 있던 로직을 옮겼다.
 * 공급처 상품을 프로그램적으로 우리 몰 상품으로 만들 때도 같은 규칙이어야
 * 수동 등록분과 URL 체계가 어긋나지 않기 때문이다(동작은 그대로).
 *
 * ⚠ products.slug 는 **몰 스코프가 아니라 전역 유니크**다(tables.sql: uk_products_slug).
 *   그래서 중복 검사에 mall_id 를 걸지 않는다.
 */

const pool = require('../../config/db');

/** 한글은 보존하고 나머지는 소문자·하이픈으로 정리한다. */
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

/**
 * 중복되지 않는 slug 를 만든다. 이미 쓰이면 -1, -2 … 를 붙인다.
 * @param {string} name 상품명
 * @param {string} [requestedSlug] 사용자가 직접 지정한 slug(있으면 우선)
 * @param {number} [excludeId] 수정 시 자기 자신 제외
 */
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
    const used = new Set(rows.map((r) => r.slug));

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

module.exports = { slugify, generateUniqueSlugFromName };
