const svc = require('../services/exhibition/exhibitionService');
const { sanitize } = require('../services/display/htmlSanitizer');
const { COMING_SOON } = require('../routes/feature');

/*
 * 기획전 (고객) — SSR
 *
 * 설계: docs/사이트개선/exhibition_design_and_development.md §2, §8-1
 *
 * ── 준비중 랜딩 폴백 (중요) ──────────────────────────
 * `feature_menu.EXHIBITION.module_ready` 는 이미 1 이라 GNB 에 "기획전" 메뉴가 떠 있고,
 * 개발 DB 와 운영 DB 가 같다. 발행된 기획전이 0건인 상태로 이 컨트롤러가 붙으면
 * 운영에 빈 목록이 노출된다. 그래서 0건이면 기존 준비중 랜딩으로 되돌린다.
 *
 * ── 탭 ──────────────────────────────────────────────
 * `?tab={section_code}` 로 서버에서 고른다. JS 없이도 동작한다(앵커 링크).
 * 'all' 은 예약어 — 섹션 미배정 상품을 포함한 전체 목록.
 */

const ALL_TAB = 'all';

/** 준비중 랜딩. feature.js 의 comingSoon 과 같은 화면을 렌더한다. */
function renderComingSoon(res) {
    const feature = COMING_SOON.exhibition;
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

function siteMeta(res) {
    const siteSettings = res.locals.siteSettings || {};
    return {
        companyName: siteSettings.company_name || '와이디몰',
        domain: ((global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr').replace(/\/$/, ''),
    };
}

/** GET /exhibition — 목록 */
exports.getList = async (req, res) => {
    const mallId = req.mallId || 1;
    try {
        const sort = svc.values(svc.LIST_SORTS).includes(req.query.sort) ? req.query.sort : 'latest';
        const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

        /*
         * 전문관(SPECIALTY)은 기획전 목록에서 뺀다. 종료일이 없는 상시 매장이라
         * 여기 섞이면 "예정/진행중/종료" 배지도, "종료임박순" 정렬도 의미가 없어진다.
         * 전문관은 /specialty 가 따로 렌더한다.
         * (설계: docs/사이트개선/recommend_specialty_design_and_development.md §5-2)
         */
        const result = await svc.getPublicList(mallId, {
            sort, page, limit: 12, excludeTypes: [svc.SPECIALTY_TYPE],
        });

        /*
         * 고객에게 보여줄 기획전이 0건이면 빈 목록 대신 준비중 랜딩. (배포 순서 안전장치)
         *
         * 판정을 `getPublicList` 의 결과(total)로 한다. "발행된 행이 있는가" 를 따로 물으면
         * 발행됐지만 목록에서 빠지는 경우(list_visible=0, 종료+접근차단)에 폴백이 새서
         * 운영 GNB 에 빈 목록이 뜬다.
         */
        if (result.total === 0 && page === 1) return renderComingSoon(res);

        const { companyName, domain } = siteMeta(res);
        res.render('user/exhibition/list', {
            title: '기획전',
            exhibitions: result.items,
            pagination: result,
            sorts: svc.LIST_SORTS,
            sort,
            currentUser: req.user || null,
            seo: Object.assign({}, res.locals.seo, {
                title: `기획전 | ${companyName}`,
                description: `${companyName} 시즌·브랜드·테마별 기획전을 만나보세요.`,
                url: `${domain}/exhibition`,
            }),
        });
    } catch (err) {
        console.error('[exhibition] getList:', err.message);
        res.status(500).send('Server Error');
    }
};

/**
 * GET /exhibition/view/:id — id → slug 301
 *
 * 커스텀 메뉴는 `link_target` 에 숫자 id 만 들고 있다(§3). navigationService 가
 * 메뉴를 그릴 때마다 slug 를 조인해 오지 않도록, id URL 로 보내고 여기서 정규 URL 로 넘긴다.
 * (`/products/view/754` → `/products/{slug}` 와 같은 방식)
 */
exports.redirectToSlug = async (req, res, next) => {
    const mallId = req.mallId || 1;
    try {
        const slug = await svc.getPublicSlugById(mallId, req.params.id);
        if (!slug) return next(); // 404 핸들러로
        res.redirect(301, `/exhibition/${encodeURIComponent(slug)}`);
    } catch (err) {
        console.error('[exhibition] redirectToSlug:', err.message);
        next(err);
    }
};

/**
 * GET /exhibition/:slug — 상세
 * GET /specialty/:slug  — 전문관 상세도 **이 핸들러를 공유한다**(routes/specialty.js).
 *
 * 전문관과 기획전은 같은 테이블·같은 렌더를 쓰지만 정규 URL 이 갈린다.
 * 잘못된 경로로 들어오면 정규 URL 로 301 한다 — 같은 콘텐츠가 두 URL 에 살면 SEO 가 갈린다.
 */
exports.getDetail = async (req, res, next) => {
    const mallId = req.mallId || 1;
    try {
        const exhibition = await svc.getPublicBySlug(mallId, req.params.slug);
        if (!exhibition) return next(); // 발행되지 않았거나 없는 기획전 → 404

        // 정규 URL 강제. detailPath 는 exhibition_type 에서 파생된다(svc.decorate).
        const canonicalBase = exhibition.isSpecialty ? '/specialty' : '/exhibition';
        if (req.baseUrl !== canonicalBase) return res.redirect(301, exhibition.detailPath);

        // 종료 + 접근차단이면 상세를 열지 않는다.
        if (exhibition.phase === 'ENDED' && exhibition.ended_access_policy === 'BLOCK') return next();

        const config = svc.parseJson(exhibition.display_config_json);
        const [sections, products] = await Promise.all([
            svc.getSections(exhibition.id),
            svc.getProducts(exhibition.id, { hideSoldOut: Boolean(config.hide_sold_out) }),
        ]);

        // 탭으로 노출할 섹션만. 상품이 하나도 없는 탭은 빈 화면이 되므로 감춘다
        // (HTML 섹션은 상품이 없어도 보여줄 내용이 있다).
        const bySection = new Map();
        products.forEach((p) => {
            const key = p.section_id == null ? ALL_TAB : String(p.section_id);
            if (!bySection.has(key)) bySection.set(key, []);
            bySection.get(key).push(p);
        });

        const tabs = sections
            .filter(s => s.is_tab)
            .filter(s => s.section_type === 'HTML' || (bySection.get(String(s.id)) || []).length > 0);

        const requested = String(req.query.tab || ALL_TAB);
        const activeTab = tabs.find(s => s.section_code === requested) || null; // 없으면 전체
        const activeCode = activeTab ? activeTab.section_code : ALL_TAB;

        // 전체 탭은 섹션별로 묶어서 순서대로 보여준다(섹션 미배정 상품이 맨 앞).
        const groups = [];
        if (activeTab) {
            groups.push({
                section: activeTab,
                products: bySection.get(String(activeTab.id)) || [],
                html: activeTab.section_type === 'HTML' ? sanitize(activeTab.config.html || '') : '',
            });
        } else {
            const unassigned = bySection.get(ALL_TAB) || [];
            if (unassigned.length) groups.push({ section: null, products: unassigned, html: '' });
            sections.forEach((s) => {
                const items = bySection.get(String(s.id)) || [];
                const html = s.section_type === 'HTML' ? sanitize(s.config.html || '') : '';
                if (items.length || html) groups.push({ section: s, products: items, html });
            });
        }

        svc.incrementViewCount(mallId, exhibition.id); // 화면을 막지 않는다

        const { companyName, domain } = siteMeta(res);
        const ogImage = exhibition.og_image_url || exhibition.pc_hero_image_url || exhibition.list_thumbnail_url;

        res.render('user/exhibition/detail', {
            title: exhibition.title,
            exhibition,
            // 운영자 입력 HTML — 저장 시에 이어 렌더 시에도 통과시킨다(이중 방어)
            descriptionHtml: sanitize(exhibition.description || ''),
            noticeHtml: sanitize(config.notice || ''),
            tabs,
            activeCode,
            groups,
            productCount: products.length,
            currentUser: req.user || null,
            seo: Object.assign({}, res.locals.seo, {
                title: `${exhibition.title} | ${companyName}`,
                description: exhibition.summary || `${companyName} ${exhibition.title}`,
                url: `${domain}${exhibition.detailPath}`,
                image: ogImage ? (ogImage.startsWith('http') ? ogImage : domain + ogImage) : res.locals.seo.image,
                type: 'website',
                // search_visible=0 이면 검색엔진에 색인시키지 않는다.
                robots: exhibition.search_visible ? res.locals.seo.robots : 'noindex,nofollow',
            }),
        });
    } catch (err) {
        console.error('[exhibition] getDetail:', err.message);
        next(err);
    }
};
