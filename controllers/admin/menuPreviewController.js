const pool = require('../../config/db');
const navigationService = require('../../services/menu/navigationService');

/*
 * 메뉴 미리보기 (B7)
 *
 * 설계: docs/사이트개선/admin_dev_plan.md §3.3
 *
 * 조립 로직을 여기서 다시 짜지 않는다. 스토어프론트와 **같은 함수**
 * (`navigationService.getNavigation`)를 호출해야 미리보기와 실제가 어긋나지 않는다.
 * 잘린 개수도 서비스가 돌려주는 `gnbCandidateCount` 를 쓴다(커스텀 메뉴의 링크 해석까지 반영됨).
 *
 * 미리보기의 값은 "무엇이 보이는가" 보다 **"무엇이 왜 안 보이는가"** 에 있다.
 *   - `module_ready = 0`   → 켜도 렌더 제외 (죽은 링크 차단)
 *   - `is_enabled = 0`     → 운영자가 끔
 *   - `login_required`     → 비로그인 사용자에게 숨김
 *   - 노출 기간 밖         → 자동 숨김
 *   - `max_gnb_items` 초과 → 뒤에서 잘림
 *
 * PC/모바일은 서버가 기기 필터를 하지 않는다(같은 HTML 에 함께 렌더되고 뷰가 고른다).
 * 그래서 여기서도 각 항목의 pcVisible/mobileVisible 로 화면에서 거른다.
 */

const MALL_ID = 1;

const POSITION_LABELS = {
    gnb: 'GNB (상단 메뉴)',
    header_util: '헤더 유틸',
    right_rail: '우측 유틸 레일',
};

/** 렌더에서 빠진 기능 메뉴와 그 사유 */
async function findExcluded(isLoggedIn) {
    const [rows] = await pool.query(`
        SELECT f.feature_code, f.position, f.default_name, f.module_ready,
               COALESCE(m.is_enabled, 0) AS is_enabled,
               COALESCE(m.login_required, 0) AS login_required,
               COALESCE(NULLIF(m.display_name, ''), f.default_name) AS name,
               m.visible_start_at, m.visible_end_at
        FROM feature_menu f
        LEFT JOIN mall_feature_menu m ON m.feature_code = f.feature_code AND m.mall_id = ?
        ORDER BY f.position, f.default_sort_order
    `, [MALL_ID]);

    const now = new Date();
    const excluded = [];
    for (const r of rows) {
        let reason = null;
        if (!Number(r.module_ready)) reason = '모듈 미구현 (켜도 노출되지 않음)';
        else if (!Number(r.is_enabled)) reason = '사용 안 함 (운영자가 끔)';
        else if (Number(r.login_required) && !isLoggedIn) reason = '로그인 필요';
        else if (r.visible_start_at && new Date(r.visible_start_at) > now) reason = '노출 기간 전';
        else if (r.visible_end_at && new Date(r.visible_end_at) < now) reason = '노출 기간 종료';
        if (reason) excluded.push(Object.assign({}, r, {
            reason,
            positionLabel: POSITION_LABELS[r.position] || r.position,
        }));
    }
    return excluded;
}

/** GET /admin/menu-preview */
exports.getPreview = async (req, res) => {
    try {
        const opts = {
            isLoggedIn: req.query.login === '1',
            device: req.query.device === 'mobile' ? 'mobile' : 'pc',
        };

        // 스토어프론트와 동일한 경로
        const nav = await navigationService.getNavigation(MALL_ID, { isLoggedIn: opts.isLoggedIn });

        const maxGnb = Number(nav.config.max_gnb_items) || 8;
        const gnbTruncated = Math.max(0, (nav.gnbCandidateCount || 0) - nav.gnb.length);

        res.render('admin/menu-preview/index', {
            layout: 'layouts/admin_layout',
            title: '메뉴 미리보기',
            nav,
            opts,
            excluded: await findExcluded(opts.isLoggedIn),
            maxGnb,
            gnbTruncated,
        });
    } catch (err) {
        console.error('[menuPreview] getPreview:', err.message);
        res.status(500).send('Server Error');
    }
};
