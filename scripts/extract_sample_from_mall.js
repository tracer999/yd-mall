/*
 * 샘플 리소스 추출기 — 기존 몰의 일부 데이터를 샘플 리소스 테이블로 굳힌다.
 * 설계: docs/사이트개선/샘플_데이터_리소스_설계.md
 *
 * 사용:
 *   node scripts/extract_sample_from_mall.js --mall=2 --categories=3 --per-category=2 --replace
 *   node scripts/extract_sample_from_mall.js --dry-run          # 무엇이 뽑힐지만 출력
 *
 * 옵션:
 *   --mall=N          원본 몰 id (기본 2 = 종합관)
 *   --categories=N    가져올 카테고리 수 (기본 3)
 *   --per-category=N  카테고리당 상품 수 (기본 2 → 총 6)
 *   --replace         기존 sample_* 를 비우고 새로 채움 (없으면 중단)
 *   --dry-run         DB·파일 변경 없이 선택 결과만 출력
 *   --keep-names      상품명의 [브라켓] 마케팅 문구를 지우지 않음
 *
 * 하는 일:
 *   1) 원본 몰에서 상품 많은 카테고리 N개 → 각 M개 상품 → 그 상품들의 브랜드 추출
 *   2) 상품 이미지를 **public/images/sample/products/ 로 내려받아 저장**(sharp 로 800px/q80 리사이즈)
 *      ⚠ 원본이 외부 CDN(핫링크)이든 /uploads(gitignore)든, 그대로 두면 납품본에서 깨진다.
 *        반드시 커밋되는 경로(/images/sample/...)로 복사해야 한다.
 *   3) sample_category / sample_product / sample_hero_slide 에 적재
 *
 * 이후 '서비스 관리 → 샘플 데이터 관리'(/admin/service/samples)에서 자유롭게 수정 가능.
 */

const path = require('path');
const fs = require('fs/promises');

const OUT_DIR = path.join(__dirname, '..', 'public', 'images', 'sample', 'products');
const WEB_DIR = '/images/sample/products';
const UPLOAD_ROOT = path.join(__dirname, '..', 'public');

function arg(name, fallback) {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split('=')[1] : fallback;
}
const HAS = (name) => process.argv.includes(`--${name}`);

/** 상품명에서 [최초가79,900원] 같은 선두 브라켓 문구를 걷어낸다. */
function cleanName(s) {
    let out = String(s || '').trim();
    if (!HAS('keep-names')) {
        // 선두의 [..] ( ..) 블록을 반복 제거
        for (let i = 0; i < 4; i++) {
            const next = out.replace(/^\s*[[(][^\])]*[\])]\s*/, '');
            if (next === out) break;
            out = next;
        }
    }
    return out.trim().slice(0, 255) || String(s || '').slice(0, 255);
}

/** 원본 이미지(외부 URL 또는 로컬 /uploads 경로) → public/images/sample/products/{key}.jpg */
async function materializeImage(src, key, sharp) {
    if (!src) return null;
    let buf = null;
    try {
        if (/^https?:\/\//i.test(src)) {
            const res = await fetch(src, {
                headers: { 'User-Agent': 'Mozilla/5.0 (yd-mall sample extractor)' },
                signal: AbortSignal.timeout(20000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            buf = Buffer.from(await res.arrayBuffer());
        } else {
            // '/uploads/products/x.jpg' → public/uploads/products/x.jpg
            buf = await fs.readFile(path.join(UPLOAD_ROOT, src.replace(/^\//, '')));
        }
        const outName = `${key}.jpg`;
        const outPath = path.join(OUT_DIR, outName);
        await sharp(buf)
            .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toFile(outPath);
        return `${WEB_DIR}/${outName}`;
    } catch (e) {
        console.warn(`  ! 이미지 실패 (${key}): ${e.message} — 이 상품은 이미지 없이 들어갑니다`);
        return null;
    }
}

(async () => {
    await require('./_bootstrap')();
    const pool = require('../config/db');
    const sharp = require('sharp');

    const mallId = Number(arg('mall', 2));
    const catCount = Number(arg('categories', 3));
    const perCat = Number(arg('per-category', 2));
    const dryRun = HAS('dry-run');
    const replace = HAS('replace');

    let exitCode = 0;
    try {
        // 0) 안전장치 — --replace 없이는 기존 샘플을 건드리지 않는다.
        const [[cur]] = await pool.query('SELECT COUNT(*) n FROM sample_product');
        if (!dryRun && cur.n > 0 && !replace) {
            console.error(`기존 샘플 상품 ${cur.n}건이 있습니다. 덮어쓰려면 --replace 를 붙이세요.`);
            await pool.end();
            process.exit(1);
        }

        // 1) 카테고리 — 이미지 있는 상품이 많은 순.
        //    ⚠ 원본 몰에는 동명 카테고리가 여러 개 있을 수 있다(종합관의 '니트' 등).
        //       샘플에 같은 이름이 중복되면 곤란하므로 **이름 기준으로 중복 제거**한다.
        const [catRows] = await pool.query(
            `SELECT c.id, c.name, COUNT(p.id) AS n
               FROM categories c JOIN products p ON p.category_id = c.id
              WHERE c.mall_id = ? AND c.type = 'NORMAL' AND p.main_image IS NOT NULL AND p.status = 'ON'
              GROUP BY c.id, c.name
              ORDER BY n DESC, c.id ASC`,
            [mallId]);
        const seenName = new Set();
        const cats = [];
        for (const r of catRows) {
            const nm = String(r.name).trim();
            if (seenName.has(nm)) continue;
            seenName.add(nm);
            cats.push(r);
            if (cats.length >= catCount) break;
        }
        if (!cats.length) throw new Error(`몰 ${mallId} 에서 카테고리를 찾지 못했습니다.`);

        // 2) 카테고리별 상품
        const picked = [];
        for (let ci = 0; ci < cats.length; ci++) {
            const [rows] = await pool.query(
                `SELECT p.id, p.name, p.price, p.original_price, p.main_image, p.short_description,
                        b.name AS brand_name
                   FROM products p
                   LEFT JOIN categories b ON b.id = p.brand_category_id
                  WHERE p.mall_id = ? AND p.category_id = ? AND p.main_image IS NOT NULL AND p.status = 'ON'
                  ORDER BY p.id DESC LIMIT ?`,
                [mallId, cats[ci].id, perCat]);
            rows.forEach((r, pi) => picked.push({ ...r, catIndex: ci, prodIndex: picked.length + 1, pi }));
        }
        if (!picked.length) throw new Error('상품을 찾지 못했습니다.');

        // 3) 브랜드 — 뽑힌 상품들이 실제로 쓰는 브랜드만
        const brandNames = [...new Set(picked.map((p) => p.brand_name).filter(Boolean))].slice(0, 5);

        console.log(`원본 몰 ${mallId} · 카테고리 ${cats.length} · 상품 ${picked.length} · 브랜드 ${brandNames.length}`);
        cats.forEach((c, i) => console.log(`  [cat${i + 1}] ${c.name} (상품 ${c.n}건 중 ${perCat}건)`));
        picked.forEach((p, i) => console.log(`  [p${i + 1}] ${cleanName(p.name)} — ${p.price}원 / ${p.brand_name || '브랜드없음'}`));
        brandNames.forEach((b, i) => console.log(`  [br${i + 1}] ${b}`));

        if (dryRun) { console.log('\n--dry-run: 변경 없음'); await pool.end(); process.exit(0); }

        await fs.mkdir(OUT_DIR, { recursive: true });

        // 4) 이미지 실체화 (외부 CDN → 커밋 가능한 로컬 자산)
        console.log('\n이미지 내려받는 중...');
        for (let i = 0; i < picked.length; i++) {
            picked[i].sampleKey = `p${i + 1}`;
            picked[i].localImage = await materializeImage(picked[i].main_image, `p${i + 1}`, sharp);
        }

        // 5) 적재
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            if (replace) {
                await conn.query('DELETE FROM sample_hero_slide');
                await conn.query('DELETE FROM sample_product');
                await conn.query('DELETE FROM sample_category');
            }

            // 카테고리
            const catKeyByIndex = {};
            for (let i = 0; i < cats.length; i++) {
                const key = `cat${i + 1}`;
                catKeyByIndex[i] = key;
                await conn.query(
                    `INSERT INTO sample_category (sample_key, type, name, image_path, display_order, is_active)
                     VALUES (?, 'NORMAL', ?, NULL, ?, 1)`,
                    [key, String(cats[i].name).slice(0, 100), i + 1]);
            }
            // 브랜드
            const brandKeyByName = {};
            for (let i = 0; i < brandNames.length; i++) {
                const key = `br${i + 1}`;
                brandKeyByName[brandNames[i]] = key;
                await conn.query(
                    `INSERT INTO sample_category (sample_key, type, name, image_path, display_order, is_active)
                     VALUES (?, 'BRAND', ?, NULL, ?, 1)`,
                    [key, String(brandNames[i]).slice(0, 100), i + 1]);
            }
            // 상품 — 앞 2건에 특가를 넣어 샘플 특가전이 비지 않게 한다.
            for (let i = 0; i < picked.length; i++) {
                const p = picked[i];
                const price = Number(p.price) || 0;
                const original = Number(p.original_price) || price;
                const dealPrice = i < 2 && price > 0 ? Math.round((price * 0.9) / 100) * 100 : null;
                await conn.query(
                    `INSERT INTO sample_product
                       (sample_key, category_key, brand_key, name, short_description, price, original_price,
                        badge, main_image, deal_price, is_new, display_order, is_active)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                    [p.sampleKey, catKeyByIndex[p.catIndex], brandKeyByName[p.brand_name] || null,
                     cleanName(p.name),
                     '샘플 상품입니다. 상품 관리에서 자유롭게 수정·삭제하세요.',
                     price, original,
                     i % 3 === 0 ? 'BEST' : (i % 3 === 1 ? 'NEW' : null),
                     p.localImage, dealPrice, i % 3 === 1 ? 1 : 0, i + 1]);
            }
            // 히어로 — 이미지가 살아있는 상품 중 앞 3개 MAIN + 1개 FEATURE
            const withImg = picked.filter((p) => p.localImage);
            let sort = 0;
            for (const p of withImg.slice(0, 3)) {
                await conn.query(
                    `INSERT INTO sample_hero_slide (slot, product_key, label, headline, image_path, sort_order, is_active)
                     VALUES ('MAIN', ?, ?, ?, ?, ?, 1)`,
                    [p.sampleKey, cats[p.catIndex] ? String(cats[p.catIndex].name).slice(0, 50) : null,
                     cleanName(p.name).slice(0, 200), p.localImage, sort++]);
            }
            if (withImg[3]) {
                await conn.query(
                    `INSERT INTO sample_hero_slide (slot, product_key, label, headline, image_path, sort_order, is_active)
                     VALUES ('FEATURE', ?, '신상품', ?, ?, 0, 1)`,
                    [withImg[3].sampleKey, cleanName(withImg[3].name).slice(0, 200), withImg[3].localImage]);
            }

            await conn.commit();
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }

        const [[c1]] = await pool.query("SELECT COUNT(*) n FROM sample_category WHERE type='NORMAL'");
        const [[c2]] = await pool.query("SELECT COUNT(*) n FROM sample_category WHERE type='BRAND'");
        const [[c3]] = await pool.query('SELECT COUNT(*) n FROM sample_product');
        const [[c4]] = await pool.query('SELECT COUNT(*) n FROM sample_hero_slide');
        console.log(`\n적재 완료 — 카테고리 ${c1.n} · 브랜드 ${c2.n} · 상품 ${c3.n} · 히어로 ${c4.n}`);
        console.log(`이미지: public/images/sample/products/ (git 추적됨 — 커밋해야 납품본에 실립니다)`);
        console.log(`확인: /admin/service/samples`);
    } catch (e) {
        console.error('실패:', e.message);
        exitCode = 1;
    } finally {
        await pool.end();
    }
    process.exit(exitCode);
})().catch((e) => { console.error(e); process.exit(1); });
