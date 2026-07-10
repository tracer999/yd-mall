const { getMalls } = require('./mallContext');

/*
 * 관리자 편집 몰 해석기 (P5 관리자편)
 *
 * "관리자가 지금 **어느 몰을 편집 중인가**" 를 결정해 req.adminMallId 에 싣는다.
 * 스토어프론트의 req.mallId(손님이 보는 몰)와 **별개의 세션 키**(adminMallId)를 쓴다.
 * → 관리자가 스토어프론트를 ?mall=2 로 미리보기해도 편집 대상 몰은 안 바뀐다(그 반대도).
 *
 * 해석: ?adminMall=<id|code> → 세션 저장 → 이후 유지. 없으면 기본 몰(mall.is_default).
 * adminAuth 뒤에 마운트한다(인증된 관리자 요청에만 적용).
 *
 * 관리자 컨트롤러는 하드코딩 MALL_ID=1 대신 req.adminMallId 를 쓴다.
 * 단 admin_menus(사이드바)·banners·orders/users 등 몰 무관 데이터는 스코프하지 않는다.
 */

function resolveParam(raw, malls) {
    if (raw == null || raw === '') return null;
    const asNum = Number.parseInt(raw, 10);
    if (Number.isFinite(asNum) && malls.byId.has(asNum)) return asNum;
    const byCode = malls.byCode.get(String(raw).trim());
    return byCode ? Number(byCode.id) : null;
}

module.exports = async (req, res, next) => {
    try {
        const malls = await getMalls();

        if (Object.prototype.hasOwnProperty.call(req.query, 'adminMall')) {
            const picked = resolveParam(req.query.adminMall, malls);
            if (picked && req.session) req.session.adminMallId = picked;
        }

        let mallId = (req.session && Number(req.session.adminMallId)) || malls.defaultId;
        if (!malls.byId.has(mallId)) mallId = malls.defaultId;

        req.adminMallId = mallId;
        res.locals.adminMallId = mallId;
        res.locals.adminMall = malls.byId.get(mallId) || null;
        // 레이아웃 셀렉터가 쓸 몰 목록(활성 몰만)
        res.locals.adminMalls = Array.from(malls.byId.values());
    } catch (err) {
        console.warn('[adminMallContext] 해석 실패, mall 1 폴백:', err.message);
        req.adminMallId = 1;
        res.locals.adminMallId = 1;
        res.locals.adminMall = null;
        res.locals.adminMalls = [];
    }
    next();
};
