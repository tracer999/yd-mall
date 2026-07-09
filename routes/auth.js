const express = require('express');
const router = express.Router();
const passport = require('passport');
const pool = require('../config/db');
const { loadSystemSettingsAndApplyEnv } = require('../config/systemSettings');

function getOAuthCallbackUrl(provider) {
    const env = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
    if (provider === 'google') {
        return env === 'prod' ? process.env.GOOGLE_CALLBACK_URL_PROD : process.env.GOOGLE_CALLBACK_URL_DEV;
    }
    if (provider === 'kakao') {
        return env === 'prod' ? process.env.KAKAO_CALLBACK_URL_PROD : process.env.KAKAO_CALLBACK_URL_DEV;
    }
    return null;
}

async function refreshSystemSettings(req, res, next) {
    try {
        await loadSystemSettingsAndApplyEnv();
        return next();
    } catch (err) {
        return next(err);
    }
}

// Login Select Page
router.get('/login', (req, res) => {
    if (req.user) {
        return checkAndRedirect(req, res);
    }
    if (req.query.redirect && typeof req.query.redirect === 'string' && req.query.redirect.startsWith('/') && !req.query.redirect.startsWith('//')) {
        req.session.returnTo = req.query.redirect;
    } else if (!req.session.returnTo) {
        // Referer 헤더에서 이전 페이지 경로 자동 저장
        const referer = req.get('Referer');
        if (referer) {
            try {
                const refUrl = new URL(referer);
                const refPath = refUrl.pathname + refUrl.search;
                // 로그인/회원가입 관련 페이지가 아닌 경우에만 저장
                if (refPath.startsWith('/') && !refPath.startsWith('//') && !refPath.startsWith('/auth')) {
                    req.session.returnTo = refPath;
                }
            } catch (e) { /* invalid URL, ignore */ }
        }
    }
    res.render('auth/login', {
        layout: 'layouts/main_layout',
        title: '로그인'
    });
});

// Signup Page (Redirect to Login as entry point is the same for social)
router.get('/signup', (req, res) => {
    if (req.user) {
        return checkAndRedirect(req, res);
    }
    res.render('auth/login', {
        layout: 'layouts/main_layout',
        title: '회원가입'
    });
});

// Auth with Google
router.get('/google', refreshSystemSettings, (req, res, next) => {
    const callbackURL = getOAuthCallbackUrl('google');
    const options = { scope: ['profile', 'email'] };
    if (callbackURL) options.callbackURL = callbackURL;
    return passport.authenticate('google', options)(req, res, next);
});

// Google Callback
router.get('/google/callback', refreshSystemSettings, (req, res, next) => {
    const callbackURL = getOAuthCallbackUrl('google');
    const options = { failureRedirect: '/auth/login' };
    if (callbackURL) options.callbackURL = callbackURL;
    return passport.authenticate('google', options)(req, res, next);
},
    (req, res) => {
        checkAndRedirect(req, res);
    }
);

// Auth with Kakao
router.get('/kakao', refreshSystemSettings, (req, res, next) => {
    const callbackURL = getOAuthCallbackUrl('kakao');
    const options = { prompt: 'select_account' };
    if (callbackURL) options.callbackURL = callbackURL;
    return passport.authenticate('kakao', options)(req, res, next);
});

// Kakao 본인확인 재인증 (로그인 상태에서만)
router.get('/kakao/reauth', refreshSystemSettings, (req, res, next) => {
    if (!req.user) return res.redirect('/auth/login');
    const returnTo = req.query.return_to || '/mypage/profile';
    req.session.pending_reauth = {
        user_id: req.user.id,
        return_to: returnTo
    };
    req.session.save(() => {
        const callbackURL = getOAuthCallbackUrl('kakao');
        const options = { prompt: 'select_account' };
        if (callbackURL) options.callbackURL = callbackURL;
        return passport.authenticate('kakao', options)(req, res, next);
    });
});

// Kakao Callback
router.get('/kakao/callback', refreshSystemSettings, (req, res, next) => {
    const callbackURL = getOAuthCallbackUrl('kakao');
    const options = { failureRedirect: '/auth/login', keepSessionInfo: true };
    if (callbackURL) options.callbackURL = callbackURL;
    return passport.authenticate('kakao', options)(req, res, next);
},
    (req, res) => {
        // 재인증 플로우 처리
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
        checkAndRedirect(req, res);
    }
);

// Check if user has completed signup and policy agreements
async function checkAndRedirect(req, res) {
    if (!req.user) return res.redirect('/auth/login');

    // 추가 정보(전화번호) 미입력 시 먼저 추가 정보/최초 동의 화면으로
    if (!req.user.phone) {
        return res.redirect('/auth/signup-finish');
    }

    try {
        // 현재 시행중인 약관/개인정보 버전 조회
        const [[termsVersion]] = await pool.query(
            `SELECT id FROM policy_versions WHERE type = 'TERMS' AND is_active = 1 ORDER BY effective_date DESC LIMIT 1`
        );
        const [[privacyVersion]] = await pool.query(
            `SELECT id FROM policy_versions WHERE type = 'PRIVACY' AND is_active = 1 ORDER BY effective_date DESC LIMIT 1`
        );

        const activeTermsId = termsVersion ? termsVersion.id : null;
        const activePrivacyId = privacyVersion ? privacyVersion.id : null;

        const needsInitialAgree = !req.user.agreed_terms_id || !req.user.agreed_privacy_id;
        const needsUpgradeAgree = (
            (activeTermsId && req.user.agreed_terms_id && req.user.agreed_terms_id !== activeTermsId) ||
            (activePrivacyId && req.user.agreed_privacy_id && req.user.agreed_privacy_id !== activePrivacyId)
        );

        const isInactive = typeof req.user.is_active !== 'undefined' && req.user.is_active === 0;

        if (needsInitialAgree || needsUpgradeAgree || isInactive) {
            return res.redirect('/auth/terms-update');
        }

        const returnTo = req.session.returnTo;
        if (returnTo && typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
            delete req.session.returnTo;
            return res.redirect(returnTo);
        }
        return res.redirect('/');
    } catch (err) {
        console.error('Error in checkAndRedirect:', err);
        return res.redirect('/');
    }
}

// Signup Finish Page
router.get('/signup-finish', async (req, res) => {
    if (!req.user) return res.redirect('/auth/login');
    // If already has phone, redirect home
    if (req.user.phone) return res.redirect('/');

    // 기본 메시지
    let termsContent = '이용약관 내용이 등록되지 않았습니다.';
    let privacyContent = '개인정보 처리방침 내용이 등록되지 않았습니다.';

    try {
        // 1순위: policy_versions에서 현재 시행중(is_active=1) 약관/개인정보 버전 사용
        const [policyRows] = await pool.query(
            `SELECT type, content FROM policy_versions WHERE is_active = 1`
        );

        const activeTerms = policyRows.find((row) => row.type === 'TERMS');
        const activePrivacy = policyRows.find((row) => row.type === 'PRIVACY');

        if (activeTerms && activeTerms.content) {
            termsContent = activeTerms.content.replace(/\n/g, '<br>');
        }
        if (activePrivacy && activePrivacy.content) {
            privacyContent = activePrivacy.content.replace(/\n/g, '<br>');
        }

        // 2순위: 정책 버전이 없다면 site_settings의 단일 필드 사용 (기존 동작 유지용)
        if (!activeTerms || !activeTerms.content || !activePrivacy || !activePrivacy.content) {
            const [rows] = await pool.query('SELECT terms_of_service, privacy_policy FROM site_settings WHERE id = 1');
            if (rows.length > 0) {
                if (rows[0].terms_of_service) termsContent = rows[0].terms_of_service.replace(/\n/g, '<br>');
                if (rows[0].privacy_policy) privacyContent = rows[0].privacy_policy.replace(/\n/g, '<br>');
            }
        }
    } catch (err) {
        console.error('Error fetching policy contents:', err);
    }

    res.render('auth/signup_finish', {
        layout: 'layouts/main_layout',
        title: '추가 정보 입력',
        termsContent,
        privacyContent
    });
});

// --- 휴대폰 번호 중복 확인 API ---
router.post('/phone/check', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: '휴대폰 번호를 입력해주세요.' });

    try {
        const userId = req.user ? req.user.id : null;
        const query = userId
            ? 'SELECT id FROM users WHERE phone = ? AND id != ?'
            : 'SELECT id FROM users WHERE phone = ?';
        const params = userId ? [phone, userId] : [phone];
        const [rows] = await pool.query(query, params);

        if (rows.length > 0) {
            return res.json({ success: false, message: '이미 가입된 휴대폰 번호입니다.' });
        }
        res.json({ success: true, message: '사용 가능한 번호입니다.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

// Process Signup Finish
router.post('/signup-finish', async (req, res) => {
    if (!req.user) return res.redirect('/auth/login');

    let { name, birthdate, phone, address, detailed_address, zipcode, email } = req.body;

    // Convert 8-digit birthdate (YYYYMMDD) to YYYY-MM-DD
    if (birthdate && birthdate.length === 8 && !birthdate.includes('-')) {
        const y = birthdate.substring(0, 4);
        const m = birthdate.substring(4, 6);
        const d = birthdate.substring(6, 8);
        birthdate = `${y}-${m}-${d}`;
    }
    // Check for Duplicate Phone (excluding current user)
    // NOTE: In a real world scenario, you might want to handle this more robustly (e.g. UNIQUE constraint + catch error)
    // But manual check gives better UX here for now.
    const [existingPhone] = await pool.query('SELECT id FROM users WHERE phone = ? AND id != ?', [phone, req.user.id]);

    if (existingPhone.length > 0) {
        // Fetch policy contents again for re-render (같은 로직 재사용)
        let termsContent = '이용약관 내용이 등록되지 않았습니다.';
        let privacyContent = '개인정보 처리방침 내용이 등록되지 않았습니다.';
        try {
            const [policyRows] = await pool.query('SELECT type, content FROM policy_versions WHERE is_active = 1');
            const activeTerms = policyRows.find((row) => row.type === 'TERMS');
            const activePrivacy = policyRows.find((row) => row.type === 'PRIVACY');

            if (activeTerms && activeTerms.content) {
                termsContent = activeTerms.content.replace(/\n/g, '<br>');
            }
            if (activePrivacy && activePrivacy.content) {
                privacyContent = activePrivacy.content.replace(/\n/g, '<br>');
            }

            if (!activeTerms || !activeTerms.content || !activePrivacy || !activePrivacy.content) {
                const [rows] = await pool.query('SELECT terms_of_service, privacy_policy FROM site_settings WHERE id = 1');
                if (rows.length > 0) {
                    if (rows[0].terms_of_service) termsContent = rows[0].terms_of_service.replace(/\n/g, '<br>');
                    if (rows[0].privacy_policy) privacyContent = rows[0].privacy_policy.replace(/\n/g, '<br>');
                }
            }
        } catch (err) {
            console.error(err);
        }

        return res.render('auth/signup_finish', {
            layout: 'layouts/main_layout',
            title: '추가 정보 입력',
            termsContent,
            privacyContent,
            errorMessage: '이미 존재하는 휴대폰 번호입니다.' // Pass error message
        });
    }
    try {
        // 현재 시행중인 약관/개인정보 버전 ID 조회
        const [[termsVersion]] = await pool.query(
            `SELECT id FROM policy_versions WHERE type = 'TERMS' AND is_active = 1 ORDER BY effective_date DESC LIMIT 1`
        );
        const [[privacyVersion]] = await pool.query(
            `SELECT id FROM policy_versions WHERE type = 'PRIVACY' AND is_active = 1 ORDER BY effective_date DESC LIMIT 1`
        );

        const agreedTermsId = termsVersion ? termsVersion.id : null;
        const agreedPrivacyId = privacyVersion ? privacyVersion.id : null;

        // 이메일 업데이트 (카카오 placeholder인 경우 실제 이메일로 교체)
        const shouldUpdateEmail = email && email.trim() && req.user.email && req.user.email.includes('@no-email.com');
        const emailValue = shouldUpdateEmail ? email.trim() : undefined;

        // 사용자 기본 정보 + 현재 동의 버전 ID 저장 + 계정 활성화
        const updateFields = 'name = COALESCE(?, name), birthdate = ?, phone = ?, address = ?, detailed_address = ?, zipcode = ?, agreed_terms_id = ?, agreed_privacy_id = ?, is_active = 1' + (emailValue ? ', email = ?' : '');
        const updateParams = [name, birthdate, phone, address, detailed_address, zipcode, agreedTermsId, agreedPrivacyId];
        if (emailValue) updateParams.push(emailValue);
        updateParams.push(req.user.id);

        await pool.query(`UPDATE users SET ${updateFields} WHERE id = ?`, updateParams);

        // 동의 이력 저장 (약관/개인정보 각각 1행씩)
        if (agreedTermsId) {
            await pool.query(
                `INSERT INTO user_policy_agreements (user_id, policy_version_id)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE agreed_at = CURRENT_TIMESTAMP`,
                [req.user.id, agreedTermsId]
            );
        }
        if (agreedPrivacyId) {
            await pool.query(
                `INSERT INTO user_policy_agreements (user_id, policy_version_id)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE agreed_at = CURRENT_TIMESTAMP`,
                [req.user.id, agreedPrivacyId]
            );
        }

        // NEW_SIGNUP 쿠폰 자동 지급
        try {
            const [coupons] = await pool.query(
                `SELECT id FROM coupons WHERE coupon_type = 'NEW_SIGNUP' AND is_active = 1
                 AND (valid_from IS NULL OR valid_from <= NOW()) AND (valid_to IS NULL OR valid_to >= NOW())`
            );
            for (const c of coupons) {
                const [existing] = await pool.query(
                    'SELECT id FROM user_coupons WHERE user_id = ? AND coupon_id = ? AND used_at IS NULL',
                    [req.user.id, c.id]
                );
                if (existing.length > 0) continue;
                const [usageCount] = await pool.query(
                    'SELECT COUNT(*) as cnt FROM user_coupons WHERE coupon_id = ?',
                    [c.id]
                );
                const [[couponRow]] = await pool.query('SELECT max_total_uses FROM coupons WHERE id = ?', [c.id]);
                if (couponRow?.max_total_uses != null && usageCount[0].cnt >= couponRow.max_total_uses) continue;
                await pool.query(
                    'INSERT INTO user_coupons (user_id, coupon_id, issued_by) VALUES (?, ?, ?)',
                    [req.user.id, c.id, 'AUTO']
                );
            }
        } catch (couponErr) {
            console.error('[Auth] NEW_SIGNUP coupon issue error:', couponErr);
        }

        res.redirect('/auth/signup-success');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Success Page
router.get('/signup-success', (req, res) => {
    if (!req.user) return res.redirect('/auth/login');
    res.render('auth/signup_success', {
        layout: 'layouts/main_layout',
        title: '가입 완료'
    });
});

// Terms/Privacy re-agreement page
router.get('/terms-update', async (req, res) => {
    if (!req.user) return res.redirect('/auth/login');

    let termsContent = '이용약관 내용이 등록되지 않았습니다.';
    let privacyContent = '개인정보 처리방침 내용이 등록되지 않았습니다.';

    try {
        const [policyRows] = await pool.query('SELECT type, content FROM policy_versions WHERE is_active = 1');
        const activeTerms = policyRows.find((row) => row.type === 'TERMS');
        const activePrivacy = policyRows.find((row) => row.type === 'PRIVACY');

        if (activeTerms && activeTerms.content) {
            termsContent = activeTerms.content.replace(/\n/g, '<br>');
        }
        if (activePrivacy && activePrivacy.content) {
            privacyContent = activePrivacy.content.replace(/\n/g, '<br>');
        }
    } catch (err) {
        console.error('Error fetching policy contents for terms-update:', err);
    }

    res.render('auth/terms_update', {
        layout: 'layouts/main_layout',
        title: '약관 재동의',
        termsContent,
        privacyContent
    });
});

router.post('/terms-update', async (req, res) => {
    if (!req.user) return res.redirect('/auth/login');

    // 필수 체크박스 검증 (프론트에서도 required로 막지만 서버에서도 한 번 더 확인)
    if (!req.body.terms) {
        return res.status(400).send('약관 및 개인정보 처리방침에 동의해야 서비스를 이용할 수 있습니다.');
    }

    try {
        const [[termsVersion]] = await pool.query(
            `SELECT id FROM policy_versions WHERE type = 'TERMS' AND is_active = 1 ORDER BY effective_date DESC LIMIT 1`
        );
        const [[privacyVersion]] = await pool.query(
            `SELECT id FROM policy_versions WHERE type = 'PRIVACY' AND is_active = 1 ORDER BY effective_date DESC LIMIT 1`
        );

        const agreedTermsId = termsVersion ? termsVersion.id : null;
        const agreedPrivacyId = privacyVersion ? privacyVersion.id : null;

        await pool.query(
            'UPDATE users SET agreed_terms_id = ?, agreed_privacy_id = ?, is_active = 1 WHERE id = ?',
            [agreedTermsId, agreedPrivacyId, req.user.id]
        );

        if (agreedTermsId) {
            await pool.query(
                `INSERT INTO user_policy_agreements (user_id, policy_version_id)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE agreed_at = CURRENT_TIMESTAMP`,
                [req.user.id, agreedTermsId]
            );
        }
        if (agreedPrivacyId) {
            await pool.query(
                `INSERT INTO user_policy_agreements (user_id, policy_version_id)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE agreed_at = CURRENT_TIMESTAMP`,
                [req.user.id, agreedPrivacyId]
            );
        }

        res.redirect('/');
    } catch (err) {
        console.error('Error updating policy agreements in terms-update:', err);
        res.status(500).send('Server Error');
    }
});

// Logout
router.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

module.exports = router;
