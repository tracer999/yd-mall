const pool = require('../../config/db');

/*
 * 몰 강제 삭제 — 몰에 딸린 모든 데이터를 FK 안전 순서로 지운다.
 *
 * 왜 앱이 직접 지우나:
 *   mall_id 컬럼에는 FK 가 없다(자동 CASCADE 없음). 그래서 몰 행만 지우면
 *   카테고리·상품 등 수천 건이 고아 데이터로 남는다 → 여기서 전부 훑어 지운다.
 *
 * 반대로 products / categories / page 의 "자식"은 FK CASCADE 라 부모만 지우면 따라간다:
 *   - products 삭제 → carts·likes·reviews·product_images·product_seo·best_pin·
 *                      best_ranking·deal_item·exhibition_product … 전부 CASCADE.
 *                      order_items·hero_slide 는 SET NULL(주문 이력은 보존, 상품 링크만 끊김).
 *   - page 삭제     → page_section·page_revision CASCADE.
 *   - categories    → 자기참조 parent_id 및 상품의 category_id 는 SET NULL
 *                      (상품은 이미 앞에서 지운 뒤라 무해).
 *
 * ⭐ 글로벌 카탈로그는 보존한다: 카테고리·브랜드(categories NORMAL·BRAND = mall_id 0)와
 *    brand_profile, 네이버 동기화 마스터(naver_brand·naver_category·naver_taxonomy_*)는
 *    전 몰 공통이라 몰 삭제 대상이 아니다. 아래 categories DELETE 는 `mall_id = <대상몰>` 이면서
 *    `type IN ('THEME','OUTLET')` 인 것만 지운다 — 몰이 실제로 소유하는 타입은 그 둘뿐이다.
 *    글로벌 행(mall 0)은 두 조건 모두에서 빠지므로 이중으로 안전하다.
 *
 * 순서 제약(딱 하나): deal → deal_category 가 RESTRICT 라 deal 을 먼저 지운다.
 * FK CHECK 는 반드시 켜둔 채로 순서대로 지운다 — 끄면 CASCADE 가 돌지 않아
 * mall_id 없는 자식(deal_item·user_coupons 등)이 오히려 고아가 된다.
 *
 * ⚠️ 이 목록은 "mall_id 컬럼을 가진 테이블 전체"여야 한다. 새 몰 전용 테이블을
 *    추가하면 여기에도 넣어야 고아가 남지 않는다.
 *    (information_schema 로 확인: COLUMN_NAME='mall_id')
 */

// mall_id 로 직접 지우는 테이블. 순서 중요:
//   products 먼저(상품 자식 CASCADE) → deal 먼저(→deal_category RESTRICT) → 나머지
const MALL_SCOPED_TABLES = [
    'products',
    'deal',            // deal_item CASCADE. deal_category 보다 먼저(RESTRICT)
    'deal_category',
    'best_ranking', 'best_pin', 'best_group', 'best_ranking_run', 'best_score_config',
    // brand_category_stat·brand_stat = 몰별 집계(파생) → 몰 삭제 시 함께 정리.
    // brand_profile 은 여기서 뺐다 — 브랜드가 글로벌 한 벌(mall 0)이 되면서 프로필도 글로벌
    // 마스터(네이버 동기화·편집 데이터)라 몰 삭제와 무관하게 보존한다.
    'brand_category_stat', 'brand_stat',
    'coupons',         // user_coupons·coupon_download·event_coupon·live_show_coupon CASCADE
    'event', 'exhibition', 'group_buy', 'live_show',
    'faq', 'faq_category',
    'outlet_product', 'outlet_setting',
    'hero_slide', 'product_group', 'recommend_group',
    'mall_feature_menu', 'navigation_config', 'custom_menu',
    'shipping_policy', 'site_settings', 'theme',
    /*
     * 외부몰 연동(도매꾹·온채널 → 우리 몰) — 몰 스코프 데이터.
     *   supplier_product  : 가져온 공급처 상품 스냅샷.
     *                       supplier_variant 는 fk_sv_product ON DELETE CASCADE 라 따라 지워진다
     *                       (mall_id 컬럼이 없어 이 목록에 넣을 수 없고, 넣을 필요도 없다).
     *   supplier_import_log : 가져오기 실행 이력.
     *   mall_channel_setting: 몰별 연동 사용여부·기본 마진율.
     *
     * ⚠ mall_channel_credential 은 **일부러 뺐다**. 몰을 지워도 외부 계정 자격증명은
     *   참조용으로 남긴다(같은 키로 몰을 다시 만들 때 재입력하지 않기 위함).
     *   대신 삭제된 몰의 API 키가 DB 에 남으므로, 완전히 정리하려면 수동으로 지워야 한다.
     */
    'supplier_product', 'supplier_import_log', 'mall_channel_setting',
];

/**
 * 몰과 그 소유 데이터 전부를 한 트랜잭션으로 지운다.
 * 데이터가 없는 몰이면 각 DELETE 가 0행에 영향 → 그대로 몰만 지운다.
 * @param {number} mallId
 */
async function cascadeDeleteMall(mallId) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        for (const table of MALL_SCOPED_TABLES) {
            // 테이블명은 위 화이트리스트 상수뿐 — 사용자 입력 아님(식별자 바인딩 불가라 백틱 인용)
            await conn.query(`DELETE FROM \`${table}\` WHERE mall_id = ?`, [mallId]);
        }

        /*
         * 카테고리: 깊은 depth 부터 지워 parent_id 정합성을 지킨다(마지막 줄은 depth NULL 안전망).
         *
         * type 을 THEME/OUTLET 으로 **명시 한정**한다. 그게 몰이 실제로 소유하는 타입이고
         * (categoryController.js:271), NORMAL·BRAND 는 글로벌 한 벌(mall_id 0)이라 애초에
         * 대상이 아니다. 예전엔 type 필터가 없어 위 주석("몰별 타입만 삭제")과 실제 동작이
         * 달랐다 — 샘플 시더가 몰 스코프로 찍어낸 NORMAL/BRAND 를 같이 지우고 있었다.
         * 시더가 공용 참조로 바뀐 지금은 지울 몰 스코프 NORMAL/BRAND 자체가 생기지 않는다.
         * 필터를 명시해 두면 나중에 누가 몰 스코프 NORMAL 을 만들더라도 공용 카탈로그를
         * 실수로 지우는 경로가 열리지 않는다.
         */
        const OWNED_CATEGORY_TYPES = ['THEME', 'OUTLET'];
        for (const depth of [3, 2, 1]) {
            await conn.query(
                'DELETE FROM categories WHERE mall_id = ? AND type IN (?) AND depth = ?',
                [mallId, OWNED_CATEGORY_TYPES, depth]);
        }
        await conn.query(
            'DELETE FROM categories WHERE mall_id = ? AND type IN (?)',
            [mallId, OWNED_CATEGORY_TYPES]);

        // page → page_section·page_revision CASCADE
        await conn.query('DELETE FROM page WHERE mall_id = ?', [mallId]);

        // 마지막으로 몰 정의 자체
        await conn.query('DELETE FROM mall WHERE id = ?', [mallId]);

        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = { cascadeDeleteMall, MALL_SCOPED_TABLES };
