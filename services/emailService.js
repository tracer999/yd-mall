/**
 * 공통 이메일 발송 서비스
 * system_settings(SMTP 설정) 또는 process.env 기반으로 발송
 * 사용처: 주문 알림, 배송 알림, 운영자 이중인증, 기타 알림
 */

const nodemailer = require('nodemailer');

/*
 * ── 발송 안전장치 ──
 *
 * 1) 배달 불가 도메인 차단
 *    RFC 2606/6761 예약 도메인(example.com, *.test, *.invalid, *.localhost, *.local)은
 *    MX 레코드가 없다. 보내면 배달은 안 되고 **발신 계정에 반송(DSN)만 쌓이며**,
 *    반송률이 올라가면 발신 도메인 평판이 깎인다.
 *    개발용 계정(sku_test@example.com 등)으로 실제 발송이 나가는 사고를 구조적으로 막는다.
 *
 * 2) 전역 발송 스위치 (system_settings.email_enabled)
 *    검증·리허설 중에는 이걸 0 으로 두면 어떤 메일도 나가지 않는다.
 *    **미설정이면 발송한다** — 납품된 몰이 설정 하나 빠졌다고 주문 알림을 못 보내면 안 된다.
 */
const UNDELIVERABLE_PATTERN = /@(?:no-email\.com|example\.(?:com|org|net)|[^@]*\.(?:test|invalid|localhost|local))$/i;

/** 이 주소로는 절대 배달되지 않는다(예약 도메인·placeholder). */
function isUndeliverable(email) {
    return UNDELIVERABLE_PATTERN.test(String(email || '').trim());
}

/** 전역 발송 스위치. 값이 없으면 발송(기본 동작을 바꾸지 않는다). */
function isEmailEnabled() {
    const v = (global.systemSettings || {}).email_enabled;
    if (v === undefined || v === null || String(v).trim() === '') return true;
    return !['0', 'false', 'off', 'no'].includes(String(v).trim().toLowerCase());
}

/**
 * SMTP 설정에서 transporter 생성에 필요한 옵션 반환
 */
function getSmtpConfig() {
    const settings = global.systemSettings || {};
    const host = settings.smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(settings.smtp_port || process.env.SMTP_PORT || '587', 10);
    const isGmail = (settings.smtp_is_gmail || process.env.SMTP_IS_GMAIL || '1') === '1';
    const user = settings.smtp_sender_email || process.env.SMTP_SENDER_EMAIL;
    const pass = isGmail
        ? (settings.smtp_app_password || process.env.SMTP_APP_PASSWORD)
        : (settings.smtp_password || process.env.SMTP_PASSWORD);

    return { host, port, isGmail, user, pass };
}

/**
 * Nodemailer transporter 생성 (캐시 없이 매번 새로 생성 - 설정 변경 반영)
 */
function createTransporter() {
    const { host, port, isGmail, user, pass } = getSmtpConfig();

    if (!user || !pass) {
        throw new Error('SMTP 설정이 완료되지 않았습니다. 관리자 > 환경 설정 > SMTP 메일 설정을 확인하세요.');
    }

    const options = {
        host,
        port,
        secure: port === 465,
        auth: {
            user,
            pass: pass.trim()
        }
    };

    if (isGmail && port === 587) {
        options.secure = false;
        options.requireTLS = true;
    }

    return nodemailer.createTransport(options);
}

/**
 * 이메일 발송
 * @param {Object} options
 * @param {string|string[]} options.to - 수신자 이메일 (쉼표 구분 문자열 또는 배열)
 * @param {string} options.subject - 제목
 * @param {string} [options.text] - 텍스트 본문 (html이 없을 때 사용)
 * @param {string} [options.html] - HTML 본문
 * @param {string} [options.from] - 발신자 (미지정 시 smtp_sender_email 사용)
 * @param {string|string[]} [options.replyTo] - 답장 주소
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
async function sendEmail({ to, subject, text, html, from, replyTo }) {
    const settings = global.systemSettings || {};
    const defaultFrom = settings.smtp_sender_email || process.env.SMTP_SENDER_EMAIL;

    if (!defaultFrom && !from) {
        throw new Error('발송자 이메일이 설정되지 않았습니다.');
    }
    if (!to) {
        throw new Error('수신자가 지정되지 않았습니다.');
    }

    // 전역 스위치가 꺼져 있으면 아무것도 보내지 않는다. 호출부는 실패를 흡수하도록 되어 있다.
    if (!isEmailEnabled()) {
        console.warn(`[EmailService] 발송 비활성(email_enabled=0) — 스킵: to=${to} subject=${subject}`);
        return { success: false, skipped: true, error: '이메일 발송이 비활성화되어 있습니다.' };
    }

    /*
     * 배달 불가 주소 차단 (카카오 placeholder + RFC 2606 예약 도메인).
     * 여러 수신자 중 일부만 불가면 그것만 빼고 나머지에는 보낸다.
     */
    const recipients = Array.isArray(to) ? to : [to];
    const blocked = recipients.filter(isUndeliverable);
    const validRecipients = recipients.filter(email => !isUndeliverable(email));
    if (blocked.length > 0) {
        console.warn('[EmailService] 배달 불가 주소 차단(예약 도메인):', blocked.join(', '));
    }
    if (validRecipients.length === 0) {
        console.warn('[EmailService] 발송 스킵: 유효한 이메일 없음 (수신자:', to, ')');
        return { success: false, skipped: true, error: '유효한 이메일 주소가 없습니다.' };
    }
    to = validRecipients;
    if (!subject) {
        throw new Error('제목이 지정되지 않았습니다.');
    }

    const transporter = createTransporter();

    const mailOptions = {
        from: from || defaultFrom,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        text: text || (html ? html.replace(/<[^>]*>/g, '') : ''),
        html: html || undefined,
        replyTo: replyTo || undefined
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        return { success: true, messageId: info.messageId };
    } catch (err) {
        console.error('[EmailService] Send failed:', err);
        return {
            success: false,
            error: err.message || '이메일 발송에 실패했습니다.'
        };
    }
}

module.exports = {
    isUndeliverable,
    isEmailEnabled,
    sendEmail,
    getSmtpConfig
};
