const svc = require('../services/event/eventService');
const { sanitize } = require('../services/display/htmlSanitizer');
const { COMING_SOON } = require('../routes/feature');

/*
 * 이벤트&혜택 (고객) — SSR
 * 설계: docs/사이트개선/gnb_menu_design.md §2-7
 *
 * ── 준비중 랜딩 폴백 (중요) ──────────────────────────
 * `feature_menu.EVENT.module_ready` 는 이미 1 이라 GNB 에 "이벤트&혜택" 메뉴가 떠 있고,
 * 개발 DB 와 운영 DB 가 같다. 발행된 이벤트가 0건인 몰(현재 mall 2)에서 이 컨트롤러가
 * 빈 목록을 렌더하면 운영이 퇴보한다. 그래서 0건이면 준비중 랜딩으로 되돌린다.
 *
 * 예전 이 URL 은 '/boards/notice'(공지사항) 로 302 했다. 공지사항은 고객센터(/cs)의
 * 하위 항목이지 이벤트가 아니다.
 */

const PHASE_FILTERS = ['all', 'ongoing', 'upcoming', 'ended'];

/** 발행 0건일 때의 랜딩. feature.js 의 comingSoon 과 같은 화면. */
function renderComingSoon(res) {
    const feature = COMING_SOON.event;
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

/** GET /event */
exports.getList = async (req, res, next) => {
    try {
        const mallId = req.mallId || 1;
        if (!(await svc.hasAny(mallId))) return renderComingSoon(res);

        const phase = PHASE_FILTERS.includes(req.query.phase) ? req.query.phase : 'all';
        const events = await svc.list(mallId, { phase });
        const { companyName, domain } = siteMeta(res);

        res.render('user/event/list', {
            title: '이벤트 & 혜택',
            events,
            phase,
            currentUser: req.user || null,
            seo: Object.assign({}, res.locals.seo, {
                title: `이벤트 & 혜택 | ${companyName}`,
                description: `${companyName} 에서 진행 중인 이벤트와 혜택을 확인하세요.`,
                url: `${domain}/event`,
            }),
        });
    } catch (err) {
        next(err);
    }
};

/** GET /event/view/:id → 301 → /event/:slug (커스텀 메뉴가 숫자 id 를 들고 있을 때) */
exports.redirectToSlug = async (req, res, next) => {
    try {
        const mallId = req.mallId || 1;
        const ev = await svc.findById(mallId, req.params.id);
        if (!ev) return next();
        res.redirect(301, `/event/${encodeURIComponent(ev.slug)}`);
    } catch (err) {
        next(err);
    }
};

/** GET /event/:slug */
exports.getDetail = async (req, res, next) => {
    try {
        const mallId = req.mallId || 1;
        const ev = await svc.findBySlug(mallId, req.params.slug);
        if (!ev) return next(); // 404 핸들러로

        await svc.incrementView(ev.id);

        // 운영자 입력 HTML 이다. 반드시 새니타이즈한다.
        ev.contentHtml = ev.content ? sanitize(ev.content) : '';
        ev.noticeHtml = ev.notice ? sanitize(ev.notice) : '';

        const participated = req.user ? await svc.hasParticipated(ev.id, req.user.id) : false;
        const { companyName, domain } = siteMeta(res);

        res.render('user/event/detail', {
            title: ev.title,
            event: ev,
            participated,
            currentUser: req.user || null,
            flash: req.query.r || null, // 참여 결과 (ok/full/closed/duplicate/login)
            seo: Object.assign({}, res.locals.seo, {
                title: `${ev.title} | ${companyName}`,
                description: ev.summary || `${companyName} 이벤트`,
                url: `${domain}/event/${ev.slug}`,
            }),
        });
    } catch (err) {
        next(err);
    }
};

/** POST /event/:slug/apply — 참여 (E11) */
exports.postApply = async (req, res, next) => {
    try {
        const mallId = req.mallId || 1;
        const slug = req.params.slug;

        if (!req.user) return res.redirect(`/event/${encodeURIComponent(slug)}?r=login`);

        const ev = await svc.findBySlug(mallId, slug);
        if (!ev) return next();
        if (!ev.participable) return res.redirect(`/event/${encodeURIComponent(slug)}?r=closed`);

        const result = await svc.participate(mallId, ev.id, req.user.id);
        res.redirect(`/event/${encodeURIComponent(slug)}?r=${result}`);
    } catch (err) {
        next(err);
    }
};
