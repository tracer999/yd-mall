const pool = require('../../config/db');

/*
 * 샘플 데이터 관리 (서비스 관리 하위 · super_admin)
 *   /admin/service/samples
 *
 * 몰 생성 시 "샘플 데이터 포함"을 켜면 services/mall/sampleSeeder.js 가 여기 리소스를
 * 새 몰로 복제한다. 즉 이 화면은 **납품본의 첫인상**을 결정한다.
 *
 * ⚠️ 이 리소스는 몰과 무관한 전역 데이터다(mall_id 없음). 납품 시 몰이 0개여도 존재해야
 *    하므로 특정 몰의 데이터를 참조하지 않는다. 여기서 바꾼 값은 **앞으로 생성될 몰**에만
 *    적용된다(이미 만든 몰은 바뀌지 않는다).
 *
 * ⚠️ 이미지 경로는 반드시 커밋되는 경로여야 한다(/images/...). /uploads/ 는 .gitignore 라
 *    납품본에서 깨진다 — 저장 시 검증한다.
 *
 * 스키마·기본 시드: scripts/migrate_sample_resources.sql
 */

const BASE = '/admin/service/samples';

const fs = require('fs');
const path = require('path');

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
const VIDEO_EXT = ['.mp4', '.webm'];

/*
 * `public/images/` 안의 파일 목록.
 *
 * 이 화면의 이미지·영상은 **반드시 git 에 커밋되는 `/images/...`** 여야 한다.
 * `/uploads/` 는 .gitignore 라 납품본에서 깨지므로, 여기만은 업로드 UI 를 쓰면 안 된다.
 * 그래서 "업로드" 대신 "이미 커밋된 파일 중에서 고르기"로 푼다 — 경로를 손으로 적지 않으면서
 * 커밋 경로 제약도 지킨다. 파일 추가는 개발자가 `public/images/sample/` 에 넣고 커밋한다.
 */
function listAssets(exts) {
    const root = path.join(__dirname, '..', '..', 'public', 'images');
    const out = [];
    const walk = (dir) => {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { walk(full); continue; }
            if (!exts.includes(path.extname(e.name).toLowerCase())) continue;
            out.push('/images/' + path.relative(root, full).split(path.sep).join('/'));
        }
    };
    walk(root);
    return out.sort();
}

function toArray(v) {
    if (v === undefined || v === null) return [];
    return Array.isArray(v) ? v : [v];
}

function toInt(v, fallback = 0) {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
}

function cleanStr(v, max) {
    const s = String(v == null ? '' : v).trim();
    return s.length > max ? s.slice(0, max) : s;
}

/** 자산 경로 검증 — 비었거나 /images/ 로 시작해야 한다. (영상도 public/images 에 둔다 — /uploads 는 배포에 안 실림) */
function validImagePath(p) {
    const s = String(p || '').trim();
    if (!s) return true;
    return s.startsWith('/images/');
}

/** 빈 문자열은 NULL 로 — 경로 컬럼에 '' 가 들어가면 렌더가 빈 src 를 낸다. */
function pathOrNull(v, max = 255) {
    const s = cleanStr(v, max);
    return s === '' ? null : s;
}

/** 공용 카탈로그가 사는 mall_id. services/catalog/categoryScope.js 와 같은 값. */
const GLOBAL_CATEGORY_MALL_ID = 0;

/**
 * 샘플이 가리킬 수 있는 **공용 카테고리 후보**를 타입별로 읽는다.
 * NORMAL 은 계층이 보이도록 "부모 > 자식" 라벨을 붙인다(같은 이름의 하위가 많다).
 */
async function loadGlobalCategoryOptions() {
    const [rows] = await pool.query(
        `SELECT id, name, parent_id, type, depth FROM categories
          WHERE mall_id = ? AND type IN ('NORMAL', 'BRAND')
          ORDER BY type, depth, display_order, id`,
        [GLOBAL_CATEGORY_MALL_ID]);

    const nameById = new Map(rows.map((r) => [r.id, r.name]));
    const label = (r) => {
        const parts = [];
        let cursor = r.parent_id;
        // 최대 3뎁스라 반복은 사실상 2회 — 그래도 순환 데이터 방어로 상한을 둔다.
        for (let i = 0; i < 3 && cursor; i++) {
            if (!nameById.has(cursor)) break;
            parts.unshift(nameById.get(cursor));
            cursor = (rows.find((x) => x.id === cursor) || {}).parent_id;
        }
        parts.push(r.name);
        return parts.join(' > ');
    };

    return {
        normal: rows.filter((r) => r.type === 'NORMAL').map((r) => ({ id: r.id, label: label(r) })),
        brand: rows.filter((r) => r.type === 'BRAND').map((r) => ({ id: r.id, label: r.name })),
    };
}

exports.getSamples = async (req, res) => {
    try {
        const [categories] = await pool.query(
            `SELECT id, sample_key, type, name, image_path, display_order, is_active, global_category_id
               FROM sample_category WHERE type = 'NORMAL' ORDER BY display_order, id`);
        const [brands] = await pool.query(
            `SELECT id, sample_key, type, name, image_path, display_order, is_active, global_category_id
               FROM sample_category WHERE type = 'BRAND' ORDER BY display_order, id`);
        const globalOptions = await loadGlobalCategoryOptions();
        const [products] = await pool.query(
            `SELECT id, sample_key, category_key, brand_key, name, price, original_price,
                    badge, main_image, deal_price, is_new, display_order, is_active
               FROM sample_product ORDER BY display_order, id`);
        const [heroes] = await pool.query(
            `SELECT id, slot, product_key, label, headline, image_path, sort_order, is_active,
                    media_type, mobile_image_path, video_webm_path, video_mp4_path,
                    mobile_video_webm_path, mobile_video_mp4_path, poster_path
               FROM sample_hero_slide ORDER BY slot, sort_order, id`);

        res.render('admin/service/samples', {
            layout: 'layouts/admin_layout',
            title: '샘플 데이터 관리',
            subtitle: '몰 생성 시 "샘플 데이터 포함"으로 새 몰에 복제되는 원본입니다. 이미 만들어진 몰에는 영향이 없습니다.',
            categories, brands, products, heroes, globalOptions,
            // 경로를 손으로 적지 않도록 `public/images/` 안의 실제 파일을 골라 쓰게 한다(§33).
            sampleImages: listAssets(IMAGE_EXT),
            sampleVideos: listAssets(VIDEO_EXT),
            saved: req.query.saved === '1',
            msg: req.query.msg || '',
            error: req.query.error || '',
        });
    } catch (e) {
        console.error('[samples] getSamples:', e.message);
        res.status(500).send('샘플 데이터 화면을 불러오지 못했습니다: ' + e.message);
    }
};

/** POST /admin/service/samples — 카테고리·브랜드·상품·히어로 일괄 저장 */
exports.postSaveSamples = async (req, res) => {
    const conn = await pool.getConnection();
    try {
        // 이미지 경로 사전 검증(하나라도 어긋나면 저장 안 함 — 납품본 이미지 깨짐 방지)
        const allImages = [
            ...toArray(req.body.cat_image), ...toArray(req.body.prod_image), ...toArray(req.body.hero_image),
            ...toArray(req.body.hero_mobile_image), ...toArray(req.body.hero_poster),
            ...toArray(req.body.hero_video_webm), ...toArray(req.body.hero_video_mp4),
            ...toArray(req.body.hero_mo_video_webm), ...toArray(req.body.hero_mo_video_mp4),
        ];
        const bad = allImages.find((p) => !validImagePath(p));
        if (bad !== undefined) {
            return res.redirect(`${BASE}?error=` + encodeURIComponent(
                `이미지 경로는 /images/ 로 시작해야 합니다 (입력값: ${bad}). /uploads/ 는 배포본에 실리지 않습니다.`));
        }

        await conn.beginTransaction();

        // 1) 카테고리 + 브랜드 (같은 테이블)
        const catIds = toArray(req.body.cat_id);
        const catNames = toArray(req.body.cat_name);
        const catImages = toArray(req.body.cat_image);
        const catOrders = toArray(req.body.cat_order);
        const catGlobals = toArray(req.body.cat_global);
        const catActive = new Set(toArray(req.body.cat_active).map(String));
        for (let i = 0; i < catIds.length; i++) {
            const id = toInt(catIds[i]);
            if (!id) continue;
            // 0/빈값 = "지정 안 함" → NULL. 시더가 이름으로 재탐색 후 미분류로 폴백한다.
            const globalId = toInt(catGlobals[i]) || null;
            await conn.query(
                `UPDATE sample_category
                    SET name = ?, image_path = ?, display_order = ?, is_active = ?, global_category_id = ?
                  WHERE id = ?`,
                [cleanStr(catNames[i], 100), cleanStr(catImages[i], 255) || null,
                 toInt(catOrders[i]), catActive.has(String(id)) ? 1 : 0, globalId, id]);
        }

        // 2) 상품
        const pIds = toArray(req.body.prod_id);
        const pNames = toArray(req.body.prod_name);
        const pPrices = toArray(req.body.prod_price);
        const pOriginals = toArray(req.body.prod_original);
        const pBadges = toArray(req.body.prod_badge);
        const pImages = toArray(req.body.prod_image);
        const pDeals = toArray(req.body.prod_deal);
        const pOrders = toArray(req.body.prod_order);
        const pActive = new Set(toArray(req.body.prod_active).map(String));
        const pNew = new Set(toArray(req.body.prod_new).map(String));
        for (let i = 0; i < pIds.length; i++) {
            const id = toInt(pIds[i]);
            if (!id) continue;
            const dealRaw = String(pDeals[i] == null ? '' : pDeals[i]).trim();
            await conn.query(
                `UPDATE sample_product
                    SET name = ?, price = ?, original_price = ?, badge = ?, main_image = ?,
                        deal_price = ?, is_new = ?, display_order = ?, is_active = ?
                  WHERE id = ?`,
                [cleanStr(pNames[i], 255), toInt(pPrices[i]), toInt(pOriginals[i]),
                 cleanStr(pBadges[i], 20) || null, cleanStr(pImages[i], 255) || null,
                 dealRaw === '' ? null : toInt(dealRaw),
                 pNew.has(String(id)) ? 1 : 0, toInt(pOrders[i]),
                 pActive.has(String(id)) ? 1 : 0, id]);
        }

        // 3) 히어로 슬라이드
        const hIds = toArray(req.body.hero_id);
        const hLabels = toArray(req.body.hero_label);
        const hHeadlines = toArray(req.body.hero_headline);
        const hImages = toArray(req.body.hero_image);
        const hMobileImages = toArray(req.body.hero_mobile_image);
        const hMediaTypes = toArray(req.body.hero_media_type);
        const hWebms = toArray(req.body.hero_video_webm);
        const hMp4s = toArray(req.body.hero_video_mp4);
        const hMoWebms = toArray(req.body.hero_mo_video_webm);
        const hMoMp4s = toArray(req.body.hero_mo_video_mp4);
        const hPosters = toArray(req.body.hero_poster);
        const hOrders = toArray(req.body.hero_order);
        const hActive = new Set(toArray(req.body.hero_active).map(String));
        for (let i = 0; i < hIds.length; i++) {
            const id = toInt(hIds[i]);
            if (!id) continue;
            const mediaType = hMediaTypes[i] === 'VIDEO' ? 'VIDEO' : 'IMAGE';
            await conn.query(
                `UPDATE sample_hero_slide
                    SET label = ?, headline = ?, media_type = ?, image_path = ?, mobile_image_path = ?,
                        video_webm_path = ?, video_mp4_path = ?,
                        mobile_video_webm_path = ?, mobile_video_mp4_path = ?, poster_path = ?,
                        sort_order = ?, is_active = ?
                  WHERE id = ?`,
                [cleanStr(hLabels[i], 50) || null, cleanStr(hHeadlines[i], 200) || null,
                 mediaType, pathOrNull(hImages[i]), pathOrNull(hMobileImages[i]),
                 pathOrNull(hWebms[i]), pathOrNull(hMp4s[i]),
                 pathOrNull(hMoWebms[i]), pathOrNull(hMoMp4s[i]), pathOrNull(hPosters[i]),
                 toInt(hOrders[i]), hActive.has(String(id)) ? 1 : 0, id]);
        }

        await conn.commit();
        res.redirect(`${BASE}?saved=1`);
    } catch (e) {
        await conn.rollback();
        console.error('[samples] postSaveSamples:', e.message);
        res.redirect(`${BASE}?error=` + encodeURIComponent(e.message));
    } finally {
        conn.release();
    }
};

/** POST /admin/service/samples/:kind/:id/delete — 샘플 리소스 1건 삭제 */
exports.postDeleteSample = async (req, res) => {
    const TABLE_BY_KIND = {
        category: 'sample_category',
        product: 'sample_product',
        hero: 'sample_hero_slide',
    };
    const table = TABLE_BY_KIND[req.params.kind];
    const id = toInt(req.params.id);
    if (!table || !id) return res.redirect(`${BASE}?error=` + encodeURIComponent('잘못된 요청입니다.'));
    try {
        await pool.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
        res.redirect(`${BASE}?msg=` + encodeURIComponent('삭제되었습니다.'));
    } catch (e) {
        res.redirect(`${BASE}?error=` + encodeURIComponent(e.message));
    }
};
