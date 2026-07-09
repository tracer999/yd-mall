const pool = require('../../config/db');
const bcrypt = require('bcrypt');
const { sendEmail } = require('../../services/emailService');

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
