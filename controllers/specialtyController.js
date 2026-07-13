const svc = require('../services/exhibition/exhibitionService');
const { COMING_SOON } = require('../routes/feature');

/*
 * 전문관 (고객) — 목록
 *
 * 설계: docs/사이트개선/recommend_specialty_design_and_development.md §5
 *
 * ── 왜 새 테이블·새 모듈이 아닌가 ────────────────────────────
 * 전문관이 필요로 하는 것(상시 운영 · 고정 URL · 공통 템플릿 · 상품 교체 · 섹션)을
 * exhibition 이 이미 전부 갖고 있다. 전문관 = `exhibition_type='SPECIALTY'` + `end_at IS NULL`.
 * 새 테이블을 파면 관리자 화면·상품 매핑·섹션·배너·SEO 를 두 벌 유지하게 된다.
 *
 * ── 상세는 없다 ──────────────────────────────────────────────
 * `/specialty/:slug` 는 exhibitionController.getDetail 을 그대로 공유한다(routes/specialty.js).
 * 정규 URL 만 갈릴 뿐 렌더는 같다.
 *
 * ── 정렬 ─────────────────────────────────────────────────────
 * 기획전의 '종료임박순' 은 전문관에 없다(종료가 없다). 인기순·최신순만 제공한다.
 */

const SORTS = [
    { value: 'popular', label: '인기순' },
    { value: 'latest', label: '최신순' },
];

/** GET /specialty — 전문관 목록 */
exports.getList = async (req, res, next) => {
    const mallId = req.mallId || 1;
    try {
        const sort = SORTS.map(s => s.value).includes(req.query.sort) ? req.query.sort : 'popular';
        const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

        const result = await svc.getPublicList(mallId, {
            sort, page, limit: 12, types: [svc.SPECIALTY_TYPE],
        });

        /*
         * 발행된 전문관이 0건이면 빈 목록 대신 준비중 랜딩.
         * 개발 DB = 운영 DB 라, 라우트만 배포된 상태에서 빈 화면이 고객에게 노출되면 안 된다.
         * 판정을 total 로 한다 — "SPECIALTY 행이 있는가" 를 따로 물으면 list_visible=0 인
         * 전문관만 있을 때 폴백이 새서 빈 목록이 뜬다.
         */
        if (result.total === 0 && page === 1) {
            const feature = COMING_SOON.specialty;
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

        const siteSettings = res.locals.siteSettings || {};
        const companyName = siteSettings.company_name || '와이디몰';
        const domain = ((global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr').replace(/\/$/, '');

        res.render('user/specialty/list', {
            title: '전문관',
            specialties: result.items,
            pagination: result,
            sorts: SORTS,
            sort,
            currentUser: req.user || null,
            seo: Object.assign({}, res.locals.seo, {
                title: `전문관 | ${companyName}`,
                description: `${companyName} 테마별 전문 매장을 상시 운영합니다.`,
                url: `${domain}/specialty`,
            }),
        });
    } catch (err) {
        console.error('[specialty] getList:', err.message);
        next(err);
    }
};

exports.SORTS = SORTS;
