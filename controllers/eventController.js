const svc = require('../services/event/eventService');
const { sanitize } = require('../services/display/htmlSanitizer');
const membershipInfo = require('../services/membership/membershipInfo');

/*
 * 이벤트&혜택 (고객) — SSR
 * 설계: docs/사이트개선/gnb_menu_design.md §2-7
 *
 * ── 이 페이지는 이제 '혜택 허브'다 (2026-07) ─────────
 * 멤버십이 GNB 에서 내려와 이 페이지의 하위 섹션이 됐다. 그래서 발행 이벤트가 0건이어도
 * 준비중 랜딩(COMING_SOON.event)으로 되돌리지 않는다 — 상시 혜택·멤버십이라는 보여줄 내용이
 * 남아 있고, 되돌리면 이벤트가 0건인 몰(mall 2)에서 멤버십이 도달 불가가 된다.
 *
 * 예전 이 URL 은 '/boards/notice'(공지사항) 로 302 했다. 공지사항은 고객센터(/cs)의
 * 하위 항목이지 이벤트가 아니다.
 */

const PHASE_FILTERS = ['all', 'ongoing', 'upcoming', 'ended'];

function siteMeta(res) {
    const siteSettings = res.locals.siteSettings || {};
    return {
        companyName: siteSettings.company_name || '와이디몰',
        domain: ((global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr').replace(/\/$/, ''),
    };
}

/*
 * GET /event
 *
 * ⚠️ 발행 이벤트가 0건이어도 **준비중 랜딩으로 되돌리지 않는다**(2026-07 변경).
 * 멤버십이 GNB 에서 내려와 이 페이지의 하위 섹션이 됐기 때문이다 — 이제 /event 는
 * "이벤트 목록"이 아니라 **혜택 허브**이고, 이벤트가 없어도 상시 혜택·멤버십이라는
 * 보여줄 내용이 있다. 0건이면 목록 자리에만 빈 상태 문구가 뜬다(뷰가 처리).
 *
 * 되돌렸다면 이벤트가 0건인 몰(mall 2)에서 멤버십이 통째로 도달 불가가 된다.
 */
exports.getList = async (req, res, next) => {
    try {
        const mallId = req.mallId || 1;

        const phase = PHASE_FILTERS.includes(req.query.phase) ? req.query.phase : 'all';
        const events = await svc.list(mallId, { phase });
        const { companyName, domain } = siteMeta(res);

        res.render('user/event/list', {
            title: '이벤트 & 혜택',
            events,
            phase,
            // 멤버십 섹션 — 정의는 services/membership/membershipInfo.js 한 곳에 있다.
            membershipTiers: membershipInfo.TIERS,
            membershipBenefits: membershipInfo.BENEFITS,
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
