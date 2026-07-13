const pool = require('../../config/db');

/*
 * 메뉴 카탈로그 → 몰별 메뉴 백필.
 *
 * 왜 필요한가 (실제로 물렸던 버그):
 *   스토어프론트는 `FROM mall_feature_menu m JOIN feature_menu f`(INNER)로 메뉴를 읽는다.
 *   → 몰별 행이 **없으면** 카탈로그에 메뉴가 있어도 그 몰에는 영영 안 나온다.
 *   반면 관리자 화면은 `feature_menu LEFT JOIN mall_feature_menu` 라 행이 없어도 목록에 보인다.
 *   그래서 "관리자엔 보이는데 몰에는 안 나오고, 기능메뉴 화면에서 저장을 누르는 순간
 *   (ON DUPLICATE KEY 가 행을 INSERT 해서) 갑자기 나타나는" 증상이 났다.
 *
 * 해결: 카탈로그에 있는데 몰에 없는 메뉴는 **카탈로그 기본값으로 행을 만들어 준다.**
 *   기존 행은 절대 건드리지 않는다(운영자가 꺼 둔 메뉴가 되살아나면 안 된다).
 *   기본 ON/OFF 는 feature_menu.default_enabled 가 정한다 — 실험용 메뉴는 0 으로 등록하면
 *   카탈로그에 올려도 몰에 자동 노출되지 않는다.
 */

/**
 * 한 몰의 누락된 mall_feature_menu 행을 채운다.
 * @param {number} mallId
 * @returns {Promise<number>} 새로 만든 행 수
 */
async function ensureMallFeatureMenus(mallId) {
    const id = Number(mallId);
    if (!Number.isInteger(id) || id <= 0) return 0;

    // is_required 는 default_enabled 를 이긴다 — 끌 수 없는 메뉴가 꺼진 채 생기면 안 된다.
    // module_ready = 0 은 켜도 렌더에서 빠지므로 0 으로 둔다(상태를 정직하게).
    const [result] = await pool.query(`
        INSERT INTO mall_feature_menu
            (mall_id, feature_code, display_name, sort_order, is_enabled,
             pc_visible, mobile_visible, login_required, badge_type)
        SELECT ?, f.feature_code, NULL, f.default_sort_order,
               CASE WHEN f.is_required = 1 THEN 1
                    WHEN f.module_ready = 1 AND f.default_enabled = 1 THEN 1
                    ELSE 0 END,
               1, 1, 0, NULL
          FROM feature_menu f
         WHERE NOT EXISTS (
               SELECT 1 FROM mall_feature_menu m
                WHERE m.mall_id = ? AND m.feature_code = f.feature_code
         )
    `, [id, id]);

    return result.affectedRows || 0;
}

/** 활성 몰 전체를 백필한다(앱 기동 시 1회). */
async function ensureAllMalls() {
    const [malls] = await pool.query('SELECT id FROM mall WHERE is_active = 1');
    let total = 0;
    for (const m of malls) total += await ensureMallFeatureMenus(m.id);
    return total;
}

module.exports = { ensureMallFeatureMenus, ensureAllMalls };
