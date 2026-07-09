/**
 * 공통 이메일 발송 서비스
 * system_settings(SMTP 설정) 또는 process.env 기반으로 발송
 * 사용처: 주문 알림, 배송 알림, 운영자 이중인증, 기타 알림
 */

const nodemailer = require('nodemailer');

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

    // 유효하지 않은 이메일 (카카오 placeholder 등) 발송 차단
    const recipients = Array.isArray(to) ? to : [to];
    const validRecipients = recipients.filter(email => !email.includes('@no-email.com'));
    if (validRecipients.length === 0) {
        console.warn('[EmailService] 발송 스킵: 유효한 이메일 없음 (수신자:', to, ')');
        return { success: false, error: '유효한 이메일 주소가 없습니다.' };
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
    sendEmail,
    getSmtpConfig
};
