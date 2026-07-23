const pool = require('../../config/db');
const bcrypt = require('bcrypt');
const { sendEmail } = require('../../services/emailService');
const { generateTempPassword } = require('../../shared/tempPassword');

const CODE_VALID_MINUTES = 5;

/**
 * 6자리 랜덤 인증코드 생성
 */
function generateVerificationCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

exports.getLogin = (req, res) => {
    const step = req.query.reset === '1' ? 'credentials' : (req.session.pending2faAdminId ? 'code' : 'credentials');
    if (req.query.reset === '1' && req.session.pending2faAdminId) {
        delete req.session.pending2faAdminId;
        req.session.save(() => {});
    }
    res.render('admin/login', {
        layout: false,
        step,
        error: null,
        codeSent: false
    });
};

exports.postLogin = async (req, res) => {
    const { username, password, verificationCode } = req.body;

    // 2단계: 인증코드 검증
    if (verificationCode && req.session.pending2faAdminId) {
        return handleVerifyCode(req, res);
    }

    // 1단계: 아이디/비밀번호 검증 후 코드 발송
    return handleCredentials(req, res);
};

async function handleCredentials(req, res) {
    const { username, password } = req.body;
    try {
        const [rows] = await pool.query('SELECT * FROM admins WHERE username = ?', [username]);
        if (rows.length === 0) {
            return res.render('admin/login', { layout: false, step: 'credentials', error: '존재하지 않는 계정입니다.', codeSent: false });
        }

        const admin = rows[0];
        const match = await bcrypt.compare(password, admin.password);
        if (!match) {
            console.warn(`[ADMIN LOGIN] 비밀번호 불일치 username=${username} ip=${req.ip}`);
            return res.render('admin/login', { layout: false, step: 'credentials', error: '비밀번호가 일치하지 않습니다.', codeSent: false });
        }

        const use2fa = admin.use_2fa !== 0 && admin.use_2fa !== null;
        if (!use2fa) {
            delete req.session.pending2faAdminId;
            req.session.admin = { id: admin.id, username: admin.username, role: admin.role, email: admin.email };
            req.session.save((err) => {
                if (err) return res.status(500).send('Session Save Error');
                console.log(`[ADMIN LOGIN] success (no 2FA) id=${admin.id} username=${admin.username} email=${admin.email} ip=${req.ip}`);
                res.redirect('/admin');
            });
            return;
        }

        const email = (admin.email && String(admin.email).trim()) ? String(admin.email).trim() : null;
        if (!email) {
            return res.render('admin/login', { layout: false, step: 'credentials', error: '이 계정은 이중인증이 설정되어 있으나 등록된 이메일이 없습니다. 관리자에게 이메일 등록을 요청하세요.', codeSent: false });
        }

        const code = generateVerificationCode();
        const expiresAt = new Date(Date.now() + CODE_VALID_MINUTES * 60 * 1000);

        await pool.execute(
            'INSERT INTO admin_verification_codes (admin_id, code, expires_at) VALUES (?, ?, ?)',
            [admin.id, code, expiresAt]
        );

        const companyName = (res.locals.siteSettings && res.locals.siteSettings.company_name) || '관리자';
        const { success, error: mailError } = await sendEmail({
            to: email,
            subject: `[${companyName}] 관리자 로그인 인증코드`,
            html: `
                <p>관리자 로그인을 위한 인증코드입니다.</p>
                <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${code}</p>
                <p style="color: #666; font-size: 14px;">이 코드는 ${CODE_VALID_MINUTES}분 동안 유효합니다.</p>
                <p style="color: #999; font-size: 12px;">본인이 요청한 것이 아니라면 무시하세요.</p>
            `,
            text: `인증코드: ${code} (${CODE_VALID_MINUTES}분 유효)`
        });

        if (!success) {
            console.error('[ADMIN 2FA] Email send failed', mailError);
            return res.render('admin/login', { layout: false, step: 'credentials', error: '이메일 발송에 실패했습니다. SMTP 설정을 확인하세요.', codeSent: false });
        }

        req.session.pending2faAdminId = admin.id;
        req.session.save((err) => {
            if (err) return res.status(500).send('Session Save Error');
            res.render('admin/login', {
                layout: false,
                step: 'code',
                error: null,
                codeSent: true,
                maskedEmail: maskEmail(email)
            });
        });
    } catch (err) {
        console.error('[ADMIN 2FA] handleCredentials error', err);
        res.status(500).send('Server Error');
    }
}

function maskEmail(email) {
    const [local, domain] = email.split('@');
    if (!domain) return email;
    const len = Math.min(3, Math.floor(local.length / 2));
    const masked = local.slice(0, len) + '***';
    return `${masked}@${domain}`;
}

async function handleVerifyCode(req, res) {
    const adminId = req.session.pending2faAdminId;
    const code = (req.body.verificationCode || '').trim().replace(/\D/g, '').slice(0, 6);

    const renderCodeForm = async (error) => {
        let maskedEmail = null;
        if (adminId) {
            const [a] = await pool.query('SELECT email FROM admins WHERE id = ?', [adminId]);
            if (a[0] && a[0].email) maskedEmail = maskEmail(a[0].email);
        }
        return res.render('admin/login', {
            layout: false,
            step: 'code',
            error,
            codeSent: true,
            maskedEmail
        });
    };

    if (!code || code.length !== 6) {
        return renderCodeForm('6자리 인증코드를 입력해 주세요.');
    }

    try {
        const [rows] = await pool.query(
            `SELECT vc.id, vc.admin_id, a.username, a.role, a.email
             FROM admin_verification_codes vc
             JOIN admins a ON a.id = vc.admin_id
             WHERE vc.admin_id = ? AND vc.code = ? AND vc.expires_at > NOW() AND vc.used_at IS NULL
             LIMIT 1`,
            [adminId, code]
        );

        if (rows.length === 0) {
            return renderCodeForm('인증코드가 일치하지 않거나 만료되었습니다. 처음부터 다시 시도하세요.');
        }

        await pool.execute('UPDATE admin_verification_codes SET used_at = NOW() WHERE id = ?', [rows[0].id]);

        delete req.session.pending2faAdminId;
        req.session.admin = {
            id: rows[0].admin_id,
            username: rows[0].username,
            role: rows[0].role,
            email: rows[0].email
        };
        req.session.save((err) => {
            if (err) return res.status(500).send('Session Save Error');
            console.log(`[ADMIN LOGIN] success (2FA) id=${rows[0].admin_id} username=${rows[0].username} email=${rows[0].email} ip=${req.ip}`);
            res.redirect('/admin');
        });
    } catch (err) {
        console.error('[ADMIN 2FA] handleVerifyCode error', err);
        res.status(500).send('Server Error');
    }
}

exports.logout = (req, res) => {
    req.session.destroy(() => {
        res.redirect('/admin/login');
    });
};

/* ------------------------------------------------------------------
 * 비밀번호 찾기 (로그인 전)
 *
 * 운영자가 자기 비밀번호를 잊으면 지금까지는 개발자가 DB 를 고쳐야 했다. 그 경로를 없앤다.
 *
 * 흐름을 "아이디 + 등록된 이메일이 맞으면 임시 비밀번호를 그 메일로 보낸다" 하나로 줄였다.
 * 확인 코드를 한 번 더 받는 단계를 두지 않는 이유 — 임시 비밀번호는 **메일함을 가진 사람만**
 * 볼 수 있으므로 그 자체가 소유 증명이고, 단계가 늘수록 잊은 사람이 더 헤맨다.
 *
 * 결과 문구는 성공·실패를 구분하지 않는다. "그런 아이디 없음"을 알려 주면 계정 목록을
 * 밖에서 캐낼 수 있기 때문이다.
 * ------------------------------------------------------------------ */

const FORGOT_NOTICE = '아이디와 등록된 이메일이 일치하면 임시 비밀번호를 보냈습니다. 메일함을 확인해 주세요.';

exports.getForgot = (req, res) => {
    res.render('admin/forgot_password', { layout: false, error: null, notice: null });
};

exports.postForgot = async (req, res) => {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const render = (opts) => res.render('admin/forgot_password', Object.assign({ layout: false, error: null, notice: null }, opts));

    if (!username || !email) return render({ error: '아이디와 이메일을 모두 입력해 주세요.' });

    try {
        const [rows] = await pool.query(
            'SELECT id, username, email FROM admins WHERE username = ? AND LOWER(email) = ?', [username, email]);

        // 일치하지 않아도 같은 문구로 끝낸다(계정 존재 여부를 흘리지 않는다).
        if (rows.length === 0) {
            console.warn(`[ADMIN FORGOT] 불일치 요청 username=${username} ip=${req.ip}`);
            return render({ notice: FORGOT_NOTICE });
        }

        const admin = rows[0];
        const temp = generateTempPassword();
        const hash = await bcrypt.hash(temp, 10);
        await pool.query('UPDATE admins SET password = ? WHERE id = ?', [hash, admin.id]);

        const companyName = (res.locals.siteSettings && res.locals.siteSettings.company_name) || '관리자';
        const { success, error: mailError } = await sendEmail({
            to: admin.email,
            subject: `[${companyName}] 관리자 임시 비밀번호`,
            html: `
                <p>관리자 계정 <b>${admin.username}</b> 의 임시 비밀번호입니다.</p>
                <p style="font-size: 22px; font-weight: bold; letter-spacing: 2px;">${temp}</p>
                <p style="color:#666; font-size:14px;">로그인한 뒤 <b>내 계정 &gt; 비밀번호 변경</b>에서 반드시 새 비밀번호로 바꿔 주세요.</p>
                <p style="color:#999; font-size:12px;">본인이 요청한 것이 아니라면 즉시 비밀번호를 변경하고 담당자에게 알리세요.</p>
            `,
            text: `임시 비밀번호: ${temp}`,
        });

        if (!success) {
            // 비밀번호는 이미 바뀌었는데 메일이 안 나갔다 — 그대로 두면 아무도 못 들어간다. 사실대로 알린다.
            console.error('[ADMIN FORGOT] 메일 발송 실패', mailError);
            return render({ error: '임시 비밀번호는 발급됐지만 메일 발송에 실패했습니다. 시스템 설정의 SMTP 를 확인한 뒤 다시 시도하거나, 다른 최고관리자에게 초기화를 요청하세요.' });
        }

        console.log(`[ADMIN FORGOT] 임시 비밀번호 발급 id=${admin.id} username=${admin.username} ip=${req.ip}`);
        render({ notice: FORGOT_NOTICE });
    } catch (err) {
        console.error('[ADMIN FORGOT] error', err);
        res.status(500).send('Server Error');
    }
};

/* ------------------------------------------------------------------
 * 내 비밀번호 변경 (로그인 후)
 * 남의 계정은 손대지 못한다 — 세션의 관리자 자신만 바꾼다.
 * ------------------------------------------------------------------ */

exports.getMyPassword = (req, res) => {
    res.render('admin/account_password', {
        layout: 'layouts/admin_layout',
        title: '비밀번호 변경',
        error: null,
        notice: req.query.done ? '비밀번호를 변경했습니다.' : null,
    });
};

exports.postMyPassword = async (req, res) => {
    const me = req.session.admin;
    const render = (error) => res.render('admin/account_password', {
        layout: 'layouts/admin_layout', title: '비밀번호 변경', error, notice: null,
    });
    const { current_password: current, new_password: next, confirm_password: confirm } = req.body;

    if (!current || !next || !confirm) return render('모든 칸을 입력해 주세요.');
    if (next !== confirm) return render('새 비밀번호와 확인이 서로 다릅니다.');
    if (String(next).length < 8) return render('새 비밀번호는 8자 이상이어야 합니다.');
    if (String(next) === String(current)) return render('지금 쓰는 비밀번호와 다른 값을 넣어 주세요.');

    try {
        const [[admin]] = await pool.query('SELECT id, password FROM admins WHERE id = ?', [me.id]);
        if (!admin) return render('계정을 찾을 수 없습니다. 다시 로그인해 주세요.');

        const match = await bcrypt.compare(current, admin.password);
        if (!match) {
            console.warn(`[ADMIN PWCHANGE] 현재 비밀번호 불일치 id=${me.id} ip=${req.ip}`);
            return render('현재 비밀번호가 일치하지 않습니다.');
        }

        await pool.query('UPDATE admins SET password = ? WHERE id = ?', [await bcrypt.hash(next, 10), me.id]);
        console.log(`[ADMIN PWCHANGE] success id=${me.id} username=${me.username} ip=${req.ip}`);
        res.redirect('/admin/account/password?done=1');
    } catch (err) {
        console.error('[ADMIN PWCHANGE] error', err);
        res.status(500).send('Server Error');
    }
};
