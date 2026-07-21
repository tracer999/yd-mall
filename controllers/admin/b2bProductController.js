/*
 * 상품별 B2B 판매 설정 (설계 §5, §11.2).
 *
 * 상품 등록/수정 폼(views/admin/products/form.ejs)은 80KB 짜리 단일 폼이라 탭을 끼워 넣으면
 * 기존 저장 흐름을 건드리게 된다. 옵션·SKU 편집기(/admin/products/options/:id)가 이미
 * **별도 화면**으로 분리된 선례를 따라 여기도 독립 화면으로 둔다.
 *
 * 설정 행이 없으면 그 상품은 B2B 판매를 하지 않는 것이다 — 저장할 때 비로소 만들어진다.
 */

const pool = require('../../config/db');
const b2bTaxService = require('../../services/b2b/b2bTaxService');

const LAYOUT = 'layouts/admin_layout';

/** 상품 + B2B 설정 + 수량가를 함께 읽는다. */
async function load(productId) {
    const [[product]] = await pool.query(
        'SELECT id, name, price, product_type, tax_type, main_image, thumbnail_image FROM products WHERE id = ?',
        [productId]
    );
    if (!product) return null;

    const [[setting]] = await pool.query(
        'SELECT * FROM product_b2b_setting WHERE product_id = ?', [productId]
    );
    const [volumes] = await pool.query(
        'SELECT * FROM b2b_volume_price WHERE product_id = ? ORDER BY min_quantity ASC', [productId]
    );
    const [tiers] = await pool.query(
        'SELECT id, tier_code, tier_name FROM b2b_tier WHERE is_active = 1 ORDER BY rank_order ASC'
    );
    return { product, setting, volumes, tiers };
}

exports.getEditor = async (req, res, next) => {
    try {
        const data = await load(req.params.id);
        if (!data) return res.status(404).send('상품을 찾을 수 없습니다.');

        // 옵션상품은 SKU 마다 판매가가 다를 수 있다 — 1단계 전용가는 상품 단위라 경고를 띄운다.
        const [[skuStat]] = await pool.query(
            'SELECT COUNT(*) AS cnt, MIN(price) AS min_price, MAX(price) AS max_price FROM product_sku WHERE product_id = ? AND status = \'ON\'',
            [req.params.id]
        );

        res.render('admin/b2b/product_sale', {
            layout: LAYOUT,
            title: 'B2B 판매 설정',
            subtitle: data.product.name,
            ...data,
            skuStat,
            taxSplit: b2bTaxService.split(data.product.price, data.product.tax_type),
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (err) {
        next(err);
    }
};

exports.postSave = async (req, res, next) => {
    const productId = Number(req.params.id);
    const {
        is_b2b_sale, sales_channel, b2b_price, min_order_qty, order_unit, max_order_qty,
        transaction_mode, quote_required_qty, price_visibility, tax_type,
    } = req.body;

    try {
        const [[product]] = await pool.query('SELECT price FROM products WHERE id = ?', [productId]);
        if (!product) return res.status(404).send('상품을 찾을 수 없습니다.');

        const price = b2b_price ? Number(b2b_price) : null;
        // 전용가가 판매가보다 비싸면 리졸버가 어차피 적용하지 않는다. 저장 단계에서 알려 준다.
        if (price != null && price >= Number(product.price)) {
            return res.redirect(`/admin/products/b2b/${productId}?error=`
                + encodeURIComponent(`전용가(${price.toLocaleString()}원)가 판매가(${Number(product.price).toLocaleString()}원) 이상입니다. 더 낮게 입력하세요.`));
        }

        await pool.query(
            `INSERT INTO product_b2b_setting
                (product_id, is_b2b_sale, sales_channel, b2b_price, min_order_qty, order_unit,
                 max_order_qty, transaction_mode, quote_required_qty, price_visibility)
             VALUES (?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE
                is_b2b_sale = VALUES(is_b2b_sale), sales_channel = VALUES(sales_channel),
                b2b_price = VALUES(b2b_price), min_order_qty = VALUES(min_order_qty),
                order_unit = VALUES(order_unit), max_order_qty = VALUES(max_order_qty),
                transaction_mode = VALUES(transaction_mode), quote_required_qty = VALUES(quote_required_qty),
                price_visibility = VALUES(price_visibility)`,
            [
                productId,
                is_b2b_sale ? 1 : 0,
                ['B2C_ONLY', 'B2B_ONLY', 'BOTH'].includes(sales_channel) ? sales_channel : 'BOTH',
                price,
                Math.max(1, parseInt(min_order_qty, 10) || 1),
                Math.max(1, parseInt(order_unit, 10) || 1),
                max_order_qty ? Math.max(1, parseInt(max_order_qty, 10)) : null,
                ['DIRECT_ORDER', 'QUOTE_OPTIONAL', 'QUOTE_REQUIRED'].includes(transaction_mode) ? transaction_mode : 'QUOTE_OPTIONAL',
                quote_required_qty ? Math.max(1, parseInt(quote_required_qty, 10)) : null,
                ['PUBLIC', 'APPROVED_ONLY', 'HIDDEN'].includes(price_visibility) ? price_visibility : 'APPROVED_ONLY',
            ]
        );

        // 과세구분은 products 에 있다(세금계산서·외부채널 등록이 함께 쓴다).
        if (['TAXABLE', 'TAX_FREE', 'ZERO_RATED'].includes(tax_type)) {
            await pool.query('UPDATE products SET tax_type = ? WHERE id = ?', [tax_type, productId]);
        }

        return res.redirect(`/admin/products/b2b/${productId}?message=` + encodeURIComponent('저장했습니다.'));
    } catch (err) {
        next(err);
    }
};

/** 수량 구간가 추가. 같은 (상품, 수량) 조합은 단가만 갱신한다. */
exports.postVolumeAdd = async (req, res, next) => {
    const productId = Number(req.params.id);
    const { min_quantity, unit_price, tier_id } = req.body;
    try {
        const qty = parseInt(min_quantity, 10);
        const price = parseInt(unit_price, 10);
        if (!(qty > 0) || !(price > 0)) {
            return res.redirect(`/admin/products/b2b/${productId}?error=` + encodeURIComponent('수량과 단가를 확인하세요.'));
        }
        /*
         * ⚠️ ON DUPLICATE KEY 를 쓸 수 없다. 유니크 키가 (product_id, sku_id, tier_id, min_quantity) 인데
         *    sku_id·tier_id 가 NULL 이면 MySQL 이 중복으로 보지 않아 같은 구간이 행으로 쌓인다
         *    (그러면 pickVolumeTier 가 어느 행을 집을지 불확실해진다). 지우고 넣는다.
         */
        const tierId = tier_id ? Number(tier_id) : null;
        await pool.query(
            'DELETE FROM b2b_volume_price WHERE product_id = ? AND sku_id IS NULL AND tier_id <=> ? AND min_quantity = ?',
            [productId, tierId, qty]
        );
        await pool.query(
            'INSERT INTO b2b_volume_price (product_id, sku_id, tier_id, min_quantity, unit_price) VALUES (?, NULL, ?, ?, ?)',
            [productId, tierId, qty, price]
        );
        return res.redirect(`/admin/products/b2b/${productId}?message=` + encodeURIComponent('수량별 가격을 저장했습니다.'));
    } catch (err) {
        next(err);
    }
};

exports.postVolumeDelete = async (req, res, next) => {
    const productId = Number(req.params.id);
    try {
        await pool.query('DELETE FROM b2b_volume_price WHERE id = ? AND product_id = ?', [req.body.id, productId]);
        return res.redirect(`/admin/products/b2b/${productId}?message=` + encodeURIComponent('삭제했습니다.'));
    } catch (err) {
        next(err);
    }
};
