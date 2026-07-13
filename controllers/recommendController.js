const recommendService = require('../services/recommend/recommendService');
const bannerService = require('../services/display/bannerService');
const { COMING_SOON } = require('../routes/feature');

/*
 * 추천 (고객) — SSR 랜딩
 *
 * 설계: docs/사이트개선/recommend_specialty_design_and_development.md §4
 *
 * ── 준비중 랜딩 폴백 ────────────────────────────────
 * 개발 DB = 운영 DB 다. 세 섹션이 전부 비면 빈 화면이 운영에 노출되므로
 * 기존 준비중 랜딩으로 되돌린다(기획전·오늘특가와 같은 규칙).
 *
 * ── 비로그인 ────────────────────────────────────────
 * 개인화 섹션 자리를 **베스트 복제로 채우지 않는다.** 그러면 추천 메뉴가
 * 베스트와 구별되지 않는다. 대신 로그인 CTA 를 그 자리에 둔다(뷰에서 처리).
 */

/** GET /recommend */
async function getIndex(req, res, next) {
    try {
        const mallId = req.mallId || 1;
        const userId = req.user ? req.user.id : null;

        const { sections, isEmpty } = await recommendService.getLanding(mallId, userId);

        if (isEmpty) {
            const feature = COMING_SOON.recommend;
            return res.render('user/coming_soon', {
                title: feature.name,
                feature,
                seo: Object.assign({}, res.locals.seo, {
                    title: `${feature.name} (준비 중)`,
                    description: String(feature.description).replace(/<[^>]*>/g, ' '),
                    robots: 'noindex,follow',
                }),
            });
        }

        const banners = await bannerService.getByGroup('menu:RECOMMEND', { limit: 1 });

        res.render('user/recommend/index', {
            title: '추천',
            sections,
            banners,
            currentUser: req.user || null,
            seo: Object.assign({}, res.locals.seo, {
                title: '추천',
                description: '최근 본 상품과 MD 큐레이션을 바탕으로 고른 맞춤 상품을 만나보세요.',
                // 개인화 결과가 섞이는 화면이라 색인 대상이 아니다.
                robots: 'noindex,follow',
            }),
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { getIndex };
