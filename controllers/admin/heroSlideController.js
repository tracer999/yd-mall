const pool = require('../../config/db');
const upload = require('../../middleware/upload');
const displayService = require('../../services/display/displayService');

/*
 * 메인 슬라이더 관리 — 홈 히어로 영역 하나를 두 가지 방식 중 하나로 채운다.
 *
 * 프론트(mainController.buildHomeContext + partials/sections/hero.ejs)는
 * site_settings.hero_variant 값에 따라 **둘 중 하나만** 렌더한다.
 *
 *   product_showcase → hero_slide 테이블. 상품과 연결된 쇼케이스 슬라이드.
 *                      slot=MAIN(중앙 슬라이더) · slot=FEATURE(우측 카드).
 *                      label/headline/image_url/link_url 이 비면 상품 정보로 폴백(hero_showcase.ejs).
 *   full_banner      → banners 테이블의 banner_type='MAIN' 이미지 배너 슬라이드(hero_banner.ejs).
 *                      mobile_image_url 을 쓰는 유일한 경로.
 *
 * 예전에는 이 둘이 별도 탭('메인 슬라이더' / '메인 배너(레거시)')이었고 hero_variant 를 바꿀 UI 가
 * 아예 없어서, full_banner 쪽 배너를 등록해도 프론트에 나올 방법이 없었다. 이제 한 화면에서
 * 방식을 고르고(=hero_variant 저장) 그 방식의 콘텐츠를 편집한다.
 *
 * /admin/banners/hero-slides 하위로 마운트되어 배너 관리와 동일한 RBAC 를 상속한다.
 */

const SLOTS = ['MAIN', 'FEATURE'];
const VARIANTS = ['product_showcase', 'full_banner'];
// 프론트 폴백과 같은 값이어야 한다 — mainController 는 `hero_variant || 'full_banner'`.
// 어긋나면 이 화면의 '적용 중' 뱃지가 실제 노출과 다른 방식을 가리킨다.
const DEFAULT_VARIANT = 'full_banner';

/*
 * 이 몰에 적용 중인 히어로 방식.
 * middleware/siteSettings 와 같은 폴백을 쓴다 — 몰 행이 없으면 기본몰(1) 행의 브랜딩이 적용되므로,
 * 여기서도 기본몰 행을 읽어야 프론트가 실제로 렌더하는 방식과 일치한다.
 */
async function getActiveVariant(mallId) {
    const [rows] = await pool.query(
        `SELECT hero_variant FROM site_settings
         WHERE mall_id IN (?, 1) ORDER BY (mall_id = ?) DESC LIMIT 1`,
        [mallId, mallId]
    );
    const v = rows[0] && rows[0].hero_variant;
    return VARIANTS.includes(v) ? v : DEFAULT_VARIANT;
}

exports.getList = async (req, res) => {
    try {
        const mallId = req.adminMallId || 1;
        // 프론트가 실제로 그리는 히어로를 기준으로 판정한다.
        // theme_hero(페이지 빌더)를 쓰는 몰은 hero_variant 와 무관하게 hero_slide 를 렌더하므로,
        // hero_variant 로 화면 모드를 가르면 실제 노출 중인 슬라이드가 관리자에서 숨어버린다.
        const usesThemeHero = (await displayService.getHomeHeroType(mallId)) === 'theme_hero';
        const activeVariant = usesThemeHero ? 'product_showcase' : await getActiveVariant(mallId);
        // 적용 중이 아닌 방식도 미리 편집해 둘 수 있게 ?mode= 로 열람 방식을 따로 둔다.
        // 단 theme_hero 몰은 full_banner 가 프론트에 영향을 주지 않으므로 항상 쇼케이스로 연다.
        const mode = usesThemeHero
            ? 'product_showcase'
            : (VARIANTS.includes(req.query.mode) ? req.query.mode : activeVariant);

        const [slides] = await pool.query(`
            SELECT hs.*, p.name AS product_name, p.main_image, p.price, p.status AS product_status
            FROM hero_slide hs
            LEFT JOIN products p ON p.id = hs.product_id
            WHERE hs.mall_id = ?
            ORDER BY hs.slot ASC, hs.sort_order ASC, hs.id ASC
        `, [mallId]);

        // full_banner 방식의 소스 — 메뉴별 배너(group_key='menu:%')는 다른 화면 소관이라 제외한다.
        const [mainBanners] = await pool.query(`
            SELECT * FROM banners
            WHERE banner_type = 'MAIN'
              AND (group_key IS NULL OR group_key NOT LIKE 'menu:%')
            ORDER BY display_order ASC, id ASC
        `);

        res.render('admin/banners/hero-slides/list', {
            layout: 'layouts/admin_layout',
            title: '메인 슬라이더 관리',
            usesThemeHero,
            activeVariant,
            mode,
            slides,
            mainSlides: slides.filter(s => s.slot === 'MAIN'),
            featureSlides: slides.filter(s => s.slot === 'FEATURE'),
            mainBanners,
            saved: req.query.saved === '1'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

/** 히어로 방식 전환 — site_settings.hero_variant 를 바꾼다. 프론트는 매 요청 DB 를 읽으므로 즉시 반영된다. */
exports.postVariant = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const variant = req.body.hero_variant;
    // 모르는 값을 기본값으로 뭉개면 잘못된 요청 하나가 조용히 홈 히어로를 바꿔버린다. 거부한다.
    if (!VARIANTS.includes(variant)) {
        return res.status(400).send('알 수 없는 히어로 방식입니다.');
    }
    try {
        const [result] = await pool.query(
            'UPDATE site_settings SET hero_variant = ? WHERE mall_id = ?', [variant, mallId]
        );
        if (result.affectedRows === 0) {
            // 이 몰의 브랜딩 행이 없다 — 여기서 hero_variant 만 든 행을 만들면 siteSettings 미들웨어의
            // '기본몰 폴백'이 끊겨 회사명·로고·색상이 전부 빈 값이 된다. 행 생성은 사이트 설정 소관이다.
            return res.status(409).send(
                '이 몰의 사이트 설정이 아직 없습니다. 사이트 설정(/admin/settings)에서 먼저 저장한 뒤 다시 시도해 주세요.'
            );
        }
        res.redirect(`/admin/banners/hero-slides?mode=${variant}`);
    } catch (err) {
        console.error(err);
        res.status(500).send(`Hero variant update failed${err.code ? `: ${err.code}` : ''}`);
    }
};

/*
 * POST /admin/banners/hero-slides/banners — 이미지 배너 슬라이드의 순서·노출 일괄 저장.
 *
 * 목록에서 바로 정하게 한다. 배너마다 수정 폼에 들어갔다 나오면 순서를 맞추기가 어렵다
 * (홈에는 display_order 순으로 앞에서 6개만 나간다 — 무엇이 잘리는지 목록에서 보여야 한다).
 *
 * body: id=3&id=5 …, order[b<id>]=1, active[b<id>]=1(체크된 것만)
 *
 * ⚠️ 키를 `order[25]` 처럼 **숫자**로 두면 안 된다 — qs(express urlencoded extended)가 이를 배열
 *    인덱스로 보고 `["3","4"]` 로 압축해, id 로 값을 찾지 못한다(전 배너가 0/비노출로 저장됐다).
 *    그래서 `b` 접두어를 붙여 객체 키로 강제한다.
 *
 * banners 테이블에는 mall_id 가 없다(전 몰 공용) — 여기서도 몰 스코프를 걸지 않는다.
 */
exports.postBannerOrder = async (req, res) => {
    const ids = [].concat(req.body.id || []).map(Number).filter(n => Number.isInteger(n) && n > 0);
    const orders = req.body.order || {};
    const actives = req.body.active || {};

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        for (const id of ids) {
            await conn.query(
                `UPDATE banners SET display_order = ?, is_active = ?
                  WHERE id = ? AND banner_type = 'MAIN'
                    AND (group_key IS NULL OR group_key NOT LIKE 'menu:%')`,
                [Number(orders['b' + id]) || 0, String(actives['b' + id]) === '1' ? 1 : 0, id],
            );
        }
        await conn.commit();
        res.redirect('/admin/banners/hero-slides?mode=full_banner&saved=1');
    } catch (err) {
        await conn.rollback();
        console.error('[heroSlide] postBannerOrder:', err.message);
        res.status(500).send('Server Error');
    } finally {
        conn.release();
    }
};

exports.getAdd = async (req, res) => {
    try {
        const slot = SLOTS.includes(req.query.slot) ? req.query.slot : 'MAIN';
        res.render('admin/banners/hero-slides/form', {
            layout: 'layouts/admin_layout',
            title: '슬라이드 등록',
            slide: null,
            currentSlot: slot,
            maxUploadFileMb: upload.MAX_UPLOAD_FILE_MB
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postAdd = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const { slot, product_id, label, headline, link_url, sort_order, is_active } = req.body;
    const slideImage = req.files?.slide_image?.[0];
    const image_url = slideImage ? '/uploads/banners/' + slideImage.filename : null;

    const safeSlot = SLOTS.includes(slot) ? slot : 'MAIN';
    const productId = product_id ? Number(product_id) || null : null;

    try {
        await pool.query(`
            INSERT INTO hero_slide (mall_id, slot, product_id, label, headline, image_url, link_url, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            mallId,
            safeSlot,
            productId,
            label || null,
            headline || null,
            image_url,
            link_url || null,
            Number(sort_order) || 0,
            is_active ? 1 : 0
        ]);
        res.redirect('/admin/banners/hero-slides?mode=product_showcase');
    } catch (err) {
        console.error(err);
        res.status(500).send(`Hero slide save failed${err.code ? `: ${err.code}` : ''}`);
    }
};

exports.getEdit = async (req, res) => {
    try {
        const mallId = req.adminMallId || 1;
        const { id } = req.params;
        const [rows] = await pool.query(`
            SELECT hs.*, p.name AS product_name, p.main_image
            FROM hero_slide hs
            LEFT JOIN products p ON p.id = hs.product_id
            WHERE hs.id = ? AND hs.mall_id = ?
        `, [id, mallId]);

        if (rows.length === 0) return res.redirect('/admin/banners/hero-slides?mode=product_showcase');

        res.render('admin/banners/hero-slides/form', {
            layout: 'layouts/admin_layout',
            title: '슬라이드 수정',
            slide: rows[0],
            currentSlot: rows[0].slot,
            maxUploadFileMb: upload.MAX_UPLOAD_FILE_MB
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postEdit = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const { id } = req.params;
    const { slot, product_id, label, headline, link_url, sort_order, is_active } = req.body;
    let image_url = req.body.existing_image || null;
    const slideImage = req.files?.slide_image?.[0];
    if (slideImage) {
        image_url = '/uploads/banners/' + slideImage.filename;
    }

    const safeSlot = SLOTS.includes(slot) ? slot : 'MAIN';
    const productId = product_id ? Number(product_id) || null : null;

    try {
        await pool.query(`
            UPDATE hero_slide SET
              slot=?, product_id=?, label=?, headline=?, image_url=?, link_url=?, sort_order=?, is_active=?
            WHERE id=? AND mall_id=?
        `, [
            safeSlot,
            productId,
            label || null,
            headline || null,
            image_url,
            link_url || null,
            Number(sort_order) || 0,
            is_active ? 1 : 0,
            id,
            mallId
        ]);
        res.redirect('/admin/banners/hero-slides?mode=product_showcase');
    } catch (err) {
        console.error(err);
        res.status(500).send(`Hero slide update failed${err.code ? `: ${err.code}` : ''}`);
    }
};

exports.postDelete = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const { id } = req.body;
    try {
        await pool.query('DELETE FROM hero_slide WHERE id = ? AND mall_id = ?', [id, mallId]);
        res.redirect('/admin/banners/hero-slides?mode=product_showcase');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
