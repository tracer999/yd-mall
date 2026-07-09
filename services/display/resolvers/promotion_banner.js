const bannerService = require('../bannerService');

/**
 * promotion_banner — banners.group_key 로 묶인 배너 목록 (CT-5)
 *
 * config:
 *   groupKey  배너 그룹 키 (필수)
 *   maxCount  최대 노출 수 (기본 4)
 *
 * 배너가 0건이면 스킵.
 */
async function resolve({ config, locals }) {
    const groupKey = config.groupKey;
    if (!groupKey) return null;

    const banners = await bannerService.getByGroup(groupKey, {
        limit: config.maxCount || 4,
    });
    if (!banners || banners.length === 0) return null;

    locals.banners = banners;
    return locals;
}

module.exports = { resolve };
