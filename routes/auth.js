const express = require('express');
const router = express.Router();
const passport = require('passport');
const pool = require('../config/db');
const { loadSystemSettingsAndApplyEnv } = require('../config/systemSettings');
const { PROVIDERS, LABELS, getCallbackUrl, getEnabledProviders } = require('../services/auth/authProviders');
const policyService = require('../services/auth/policyService');
const profileService = require('../services/auth/profileService');
// 사업자 회원가입(/auth/signup?type=biz) — 일반 가입 성공 뒤 사업자 신청을 덧붙인다.
const businessProfileService = require('../services/b2b/businessProfileService');
const upload = require('../middleware/upload');

const LAYOUT = 'layouts/main_layout';

/**
 * OAuth 진입 직전에 system_settings 를 다시 읽고 전략을 재등록한다.
 * 관리자가 방금 키를 바꿨어도(예: 네이버 키 최초 입력) 앱 재기동 없이 반영된다 —
 * passport.use 는 같은 이름의 전략을 덮어쓴다.
 */
async function refreshAuthConfig(req, res, next) {
    try {
        await loadSystemSettingsAndApplyEnv();
        require('../config/passport')(passport);
        return next();
    } catch (err) {
        return next(err);
    }
}

function isSafeInternalPath(value) {
    return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

function rememberReturnTo(req) {
    if (isSafeInternalPath(req.query.redirect)) {
        req.session.returnTo = req.query.redirect;
        return;
    }
    if (req.session.returnTo) return;

    const referer = req.get('Referer');
    if (!referer) return;
    try {
        const refUrl = new URL(referer);
        const refPath = refUrl.pathname + refUrl.search;
        if (isSafeInternalPath(refPath) && !refPath.startsWith('/auth')) {
            req.session.returnTo = refPath;
        }
    } catch (e) { /* 잘못된 Referer 는 무시 */ }
}

/**
 * 로그인 성공 후 분기.
 * 상세정보(휴대폰) 미입력 → 추가정보 화면, 약관 미동의/구버전 → 재동의 화면, 그 외 → 원래 가던 곳.
 */
async function checkAndRedirect(req, res) {
    if (!req.user) return res.redirect('/auth/login');
    if (!req.user.phone) return res.redirect('/auth/signup-finish');

    try {
        const policyIds = await policyService.getActivePolicyIds();
        const isInactive = typeof req.user.is_active !== 'undefined' && req.user.is_active === 0;

        if (policyService.needsAgreement(req.user, policyIds) || isInactive) {
            return res.redirect('/auth/terms-update');
        }

        const returnTo = req.session.returnTo;
        if (isSafeInternalPath(returnTo)) {
            delete req.session.returnTo;
            return res.redirect(returnTo);
        }
        return res.redirect('/');
    } catch (err) {
        console.error('[auth] checkAndRedirect 실패:', err);
        return res.redirect('/');
    }
}

// ---------------------------------------------------------------- 로그인

router.get('/login', (req, res) => {
    if (req.user) return checkAndRedirect(req, res);
    rememberReturnTo(req);

    res.render('auth/login', {
        layout: LAYOUT,
        title: '로그인',
        providers: getEnabledProviders(),
        providerLabels: LABELS,
        errorMessage: req.query.error === 'oauth' ? '소셜 로그인에 실패했습니다. 다시 시도해주세요.' : null,
        values: { asBusiness: req.query.type === 'biz' }
    });
});

/**
 * 로그인 자격 확인 (기업회원 / 일반회원).
 *
 * 로그인 화면은 하나지만 **자격은 상호 배타**다. 체크박스로 어느 자격으로 들어왔는지 밝히게 하고,
 * 서버가 실제 자격과 대조해 **어긋나면 거부**한다.
 *
 *   체크함  + 사업자 프로필 있음 → 통과 (미승인이면 상태 안내 화면으로)
 *   체크함  + 사업자 아님        → 거부. 일반회원이 기업 자격으로 들어올 수 없다
 *   체크 안 함 + 사업자 프로필 있음 → 거부. 기업회원은 일반 자격으로 들어올 수 없다
 *   체크 안 함 + 사업자 아님     → 통과 (일반회원)
 *
 * 기준은 `business_profile` 행의 존재 하나뿐이다 — 관리자 화면의 분리 기준
 * (controllers/admin/userController.js)과 **같은 기준**을 쓴다. 두 곳이 갈라지면
 * "회원 관리에는 없는데 일반 로그인은 되는" 회원이 생긴다.
 *
 * 승인 전(PENDING·UNDER_REVIEW·REJECTED)에도 로그인 자체는 된다. 다만 b2bContext 가
 * active=false 로 판정하므로 전용가 없이 일반가로 쇼핑한다 — 자격과 가격은 별개다.
 */
async function resolveLoginMode(req, user, asBusiness) {
    const profile = await businessProfileService.findByUser(user.id);

    if (!asBusiness) {
        if (profile) {
            return {
                ok: false,
                error: '기업회원 계정입니다. "사업자 회원으로 로그인"을 선택해 주세요.'
            };
        }
        return { ok: true, redirect: null };
    }
    if (!profile) {
        return { ok: false, error: '사업자 회원이 아닙니다. 일반 회원으로 로그인하시거나 사업자 회원 신청을 해주세요.' };
    }
    if (profile.status !== 'APPROVED') {
        return { ok: true, redirect: '/b2b/status' };   // 심사중·반려·정지 → 상태를 먼저 보여준다
    }
    return { ok: true, redirect: null };
}

router.post('/login', (req, res, next) => {
    const asBusiness = req.body.login_as_business === '1';

    const renderFail = (message) => res.status(401).render('auth/login', {
        layout: LAYOUT,
        title: '로그인',
        providers: getEnabledProviders(),
        providerLabels: LABELS,
        errorMessage: message,
        values: { email: req.body.email || '', asBusiness }
    });

    passport.authenticate('local', (err, user, info) => {
        if (err) return next(err);
        if (!user) return renderFail((info && info.message) || '로그인에 실패했습니다.');

        req.login(user, async (loginErr) => {
            if (loginErr) return next(loginErr);
            try {
                const mode = await resolveLoginMode(req, user, asBusiness);
                if (!mode.ok) {
                    // 자격이 없으면 세션을 남기지 않는다 — 반쯤 들어온 상태를 만들지 않는다.
                    return req.logout(() => renderFail(mode.error));
                }
                if (mode.redirect) return res.redirect(mode.redirect);
                return checkAndRedirect(req, res);
            } catch (e) {
                return next(e);
            }
        });
    })(req, res, next);
});

// ---------------------------------------------------------------- 소셜 로그인 (Google / Kakao / Naver)

const AUTH_OPTIONS = {
    google: { scope: ['profile', 'email'] },
    kakao: { prompt: 'select_account' },
    naver: { authType: 'reprompt' }
};

for (const provider of PROVIDERS) {
    router.get(`/${provider}`, refreshAuthConfig, (req, res, next) => {
        const callbackURL = getCallbackUrl(provider);
        const options = { ...AUTH_OPTIONS[provider] };
        if (callbackURL) options.callbackURL = callbackURL;
        return passport.authenticate(provider, options)(req, res, next);
    });

    router.get(`/${provider}/callback`, refreshAuthConfig, (req, res, next) => {
        const callbackURL = getCallbackUrl(provider);
        const options = { failureRedirect: '/auth/login?error=oauth', keepSessionInfo: true };
        if (callbackURL) options.callbackURL = callbackURL;
        return passport.authenticate(provider, options)(req, res, next);
    }, (req, res) => {
        // 카카오 본인확인 재인증으로 들어온 경우 (아래 /kakao/reauth 참고)
        const reauth = req.session.pending_reauth;
        if (reauth) {
            delete req.session.pending_reauth;
            if (!req.user || String(req.user.id) !== String(reauth.user_id)) {
                return res.redirect('/mypage/profile?reauth=fail');
            }
            req.session.identity_verified = true;
            req.session.identity_verified_at = Date.now();
            return res.redirect(reauth.return_to + '?verified=1');
        }
        return checkAndRedirect(req, res);
    });
}

// 카카오 본인확인 재인증 (로그인 상태에서만)
router.get('/kakao/reauth', refreshAuthConfig, (req, res, next) => {
    if (!req.user) return res.redirect('/auth/login');

    req.session.pending_reauth = {
        user_id: req.user.id,
        return_to: isSafeInternalPath(req.query.return_to) ? req.query.return_to : '/mypage/profile'
    };
    req.session.save(() => {
        const callbackURL = getCallbackUrl('kakao');
        const options = { prompt: 'select_account' };
        if (callbackURL) options.callbackURL = callbackURL;
        return passport.authenticate('kakao', options)(req, res, next);
    });
});

// ---------------------------------------------------------------- 자체 가입폼

function renderSignupForm(res, { values, errors, termsContent, privacyContent, status = 200,
    isBusiness = false, bizValues = {}, bizErrors = {} }) {
    return res.status(status).render('auth/signup_form', {
        layout: LAYOUT,
        title: isBusiness ? '사업자 회원가입' : '회원가입',
        providers: getEnabledProviders(),
        providerLabels: LABELS,
        values,
        errors,
        termsContent,
        privacyContent,
        isBusiness,
        bizValues,
        bizErrors
    });
}

/**
 * `?type=biz` 또는 폼의 hidden signup_type 으로 사업자 가입인지 판단한다.
 *
 * ⚠️ Express 5 는 본문이 없는 GET 요청에서 `req.body` 를 **undefined** 로 둔다.
 *    `req.body.signup_type` 을 그냥 읽으면 GET /auth/signup 이 500 으로 죽는다.
 */
function isBusinessSignup(req) {
    if (req.query && req.query.type === 'biz') return true;
    return !!(req.body && req.body.signup_type === 'biz');
}

router.get('/signup', async (req, res, next) => {
    if (req.user) return checkAndRedirect(req, res);
    try {
        const { termsContent, privacyContent } = await policyService.getPolicyContents();
        return renderSignupForm(res, {
            values: {}, errors: {}, termsContent, privacyContent,
            isBusiness: isBusinessSignup(req)
        });
    } catch (err) {
        return next(err);
    }
});

/*
 * 사업자 가입은 등록증 파일이 붙어 multipart 로 온다. multer 는 multipart 가 아니면
 * 그대로 통과시키므로, 일반 가입 경로의 동작은 이 미들웨어가 있어도 바뀌지 않는다.
 */
router.post('/signup', upload.businessLicense.single('license_file'), async (req, res, next) => {
    if (req.user) return checkAndRedirect(req, res);

    const profile = profileService.normalizeProfileInput(req.body);
    const isBusiness = isBusinessSignup(req);
    const biz = isBusiness ? businessProfileService.normalizeBusinessInput(req.body) : null;

    try {
        const errors = {
            ...profileService.validateProfile(profile, { requireEmail: true }),
            ...profileService.validatePassword(req.body.password, req.body.password_confirm)
        };
        if (!req.body.terms) {
            errors.terms = '이용약관 및 개인정보 처리방침에 동의해야 가입할 수 있습니다.';
        }

        Object.assign(errors, await profileService.checkDuplicates(profile, { checkEmail: !errors.email }));

        // 사업자 항목은 별도 오류 맵으로 모은다 — 뷰가 사업자 블록 옆에 따로 뿌린다.
        let bizErrors = {};
        if (isBusiness) {
            bizErrors = businessProfileService.validateBusiness(biz, { hasLicenseFile: !!req.file });
            if (!bizErrors.business_number
                && await businessProfileService.isDuplicateBusinessNumber(biz.business_number)) {
                bizErrors.business_number = '이미 등록된 사업자등록번호입니다.';
            }
        }

        if (Object.keys(errors).length > 0 || Object.keys(bizErrors).length > 0) {
            const { termsContent, privacyContent } = await policyService.getPolicyContents();
            return renderSignupForm(res, {
                values: profile, errors, termsContent, privacyContent, status: 400,
                isBusiness, bizValues: biz || {}, bizErrors
            });
        }

        const policyIds = await policyService.getActivePolicyIds();
        const conn = await pool.getConnection();
        let userId;
        try {
            await conn.beginTransaction();
            userId = await profileService.createLocalUser(conn, profile, req.body.password, policyIds);
            await policyService.recordAgreements(conn, userId, policyIds);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        await profileService.issueSignupCoupons(userId);

        /*
         * 사업자 신청은 회원 생성이 끝난 뒤 덧붙인다. 여기서 실패해도 회원가입 자체는 이미
         * 커밋됐으므로, 사용자를 로그인시킨 뒤 /b2b/apply 로 보내 다시 신청하게 한다
         * (가입을 통째로 되돌리면 이메일·전화번호가 묶여 재가입이 막힌다).
         */
        let bizApplied = false;
        if (isBusiness) {
            try {
                await businessProfileService.createApplication({
                    userId,
                    biz,
                    licenseFile: req.file ? req.file.path : null,
                    licenseOriginalName: req.file ? req.file.originalname : null,
                });
                bizApplied = true;
            } catch (bizErr) {
                console.error('[signup] 사업자 신청 저장 실패 — 회원가입은 완료됨:', bizErr.message);
            }
        }

        const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
        req.login(user, (loginErr) => {
            if (loginErr) return next(loginErr);
            if (isBusiness) return res.redirect(bizApplied ? '/b2b/status' : '/b2b/apply?error=save');
            return res.redirect('/auth/signup-success');
        });
    } catch (err) {
        return next(err);
    }
});

// ---------------------------------------------------------------- 소셜 가입 후 추가정보 (주문·배송용)

function renderSignupFinish(res, { user, values, errors, termsContent, privacyContent, status = 200 }) {
    return res.status(status).render('auth/signup_finish', {
        layout: LAYOUT,
        title: '추가 정보 입력',
        values,
        errors,
        needsEmail: profileService.isPlaceholderEmail(user.email),
        termsContent,
        privacyContent
    });
}

router.get('/signup-finish', async (req, res, next) => {
    if (!req.user) return res.redirect('/auth/login');
    if (req.user.phone) return res.redirect('/');

    try {
        const { termsContent, privacyContent } = await policyService.getPolicyContents();
        const needsEmail = profileService.isPlaceholderEmail(req.user.email);
        return renderSignupFinish(res, {
            user: req.user,
            values: {
                name: req.user.name || '',
                receiver_name: req.user.name || '',
                email: needsEmail ? '' : req.user.email
            },
            errors: {},
            termsContent,
            privacyContent
        });
    } catch (err) {
        return next(err);
    }
});

router.post('/signup-finish', async (req, res, next) => {
    if (!req.user) return res.redirect('/auth/login');

    const needsEmail = profileService.isPlaceholderEmail(req.user.email);
    const profile = profileService.normalizeProfileInput(req.body);

    try {
        const errors = profileService.validateProfile(profile, { requireEmail: needsEmail });
        if (!req.body.terms) {
            errors.terms = '이용약관 및 개인정보 처리방침에 동의해야 서비스를 이용할 수 있습니다.';
        }

        Object.assign(errors, await profileService.checkDuplicates(profile, {
            excludeUserId: req.user.id,
            checkEmail: needsEmail && !errors.email
        }));

        if (Object.keys(errors).length > 0) {
            const { termsContent, privacyContent } = await policyService.getPolicyContents();
            return renderSignupFinish(res, {
                user: req.user,
                values: profile,
                errors,
                termsContent,
                privacyContent,
                status: 400
            });
        }

        const policyIds = await policyService.getActivePolicyIds();
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            await profileService.completeProfile(conn, req.user.id, profile, { ...policyIds, updateEmail: needsEmail });
            await policyService.recordAgreements(conn, req.user.id, policyIds);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        await profileService.issueSignupCoupons(req.user.id);
        return res.redirect('/auth/signup-success');
    } catch (err) {
        return next(err);
    }
});

router.get('/signup-success', (req, res) => {
    if (!req.user) return res.redirect('/auth/login');
    res.render('auth/signup_success', {
        layout: LAYOUT,
        title: '가입 완료'
    });
});

// ---------------------------------------------------------------- 중복 확인 API (가입폼·추가정보 공용)

router.post('/phone/check', async (req, res) => {
    const phone = String(req.body.phone || '').replace(/[^0-9]/g, '');
    if (!phone) return res.status(400).json({ success: false, message: '휴대폰 번호를 입력해주세요.' });

    try {
        const taken = await profileService.isPhoneTaken(phone, req.user ? req.user.id : null);
        return res.json({
            success: !taken,
            message: taken ? '이미 가입된 휴대폰 번호입니다.' : '사용 가능한 번호입니다.'
        });
    } catch (err) {
        console.error('[auth] 휴대폰 중복 확인 실패:', err);
        return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

router.post('/email/check', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ success: false, message: '이메일을 입력해주세요.' });

    try {
        const taken = await profileService.isEmailTaken(email, req.user ? req.user.id : null);
        return res.json({
            success: !taken,
            message: taken ? '이미 가입된 이메일입니다.' : '사용 가능한 이메일입니다.'
        });
    } catch (err) {
        console.error('[auth] 이메일 중복 확인 실패:', err);
        return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

// ---------------------------------------------------------------- 약관 재동의

router.get('/terms-update', async (req, res, next) => {
    if (!req.user) return res.redirect('/auth/login');

    try {
        const { termsContent, privacyContent } = await policyService.getPolicyContents();
        res.render('auth/terms_update', {
            layout: LAYOUT,
            title: '약관 재동의',
            termsContent,
            privacyContent
        });
    } catch (err) {
        return next(err);
    }
});

router.post('/terms-update', async (req, res, next) => {
    if (!req.user) return res.redirect('/auth/login');
    if (!req.body.terms) {
        return res.status(400).send('약관 및 개인정보 처리방침에 동의해야 서비스를 이용할 수 있습니다.');
    }

    try {
        const policyIds = await policyService.getActivePolicyIds();
        await pool.query(
            'UPDATE users SET agreed_terms_id = ?, agreed_privacy_id = ?, is_active = 1 WHERE id = ?',
            [policyIds.termsId, policyIds.privacyId, req.user.id]
        );
        await policyService.recordAgreements(pool, req.user.id, policyIds);
        return res.redirect('/');
    } catch (err) {
        return next(err);
    }
});

// ---------------------------------------------------------------- 로그아웃

router.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/');
    });
});

module.exports = router;
