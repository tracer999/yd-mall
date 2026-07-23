/*
 * 문자(SMS/LMS) · 카카오 알림톡 발송
 *
 * ⚠️ **이 기능은 외부 계약이 있어야 실제로 나갑니다.**
 *    - 문자: 문자 중계사 계정 + **발신번호 사전등록**(통신사 규정, 서류 심사 필요)
 *    - 알림톡: 카카오 비즈니스 채널 개설 + **템플릿 사전승인**(영업일 기준 수일 소요)
 *    키·템플릿이 없으면 이 모듈은 **조용히 아무것도 보내지 않고** 스킵을 반환한다.
 *    설정이 안 된 새 몰에서 발송 실패로 주문·클레임 흐름이 막히면 안 되기 때문이다.
 *
 * ── 중계사를 왜 고를 수 있게 했나
 * 국내 문자 중계사는 계약이 제각각이라 하나로 고정하면 납품처마다 못 쓴다.
 * 요청 형식만 다르고 개념(수신번호·본문·발신번호)은 같으므로 어댑터로 가른다.
 * 새 중계사는 PROVIDERS 에 함수 하나를 더하면 된다.
 *
 * ── 알림톡 → 문자 폴백
 * 알림톡은 템플릿 승인분만 나간다. 승인 템플릿이 없거나 실패하면 같은 내용을 문자로 보낸다.
 * 고객에게 안내가 아예 안 가는 것보다 낫다. (중계사 대부분이 이 폴백을 자체 지원하지만,
 * 지원하지 않는 곳도 있어 우리 쪽에서도 한 번 더 시도한다)
 */

const SMS_MAX_BYTES = 90;   // 이 길이를 넘으면 LMS. EUC-KR 기준 한글 2바이트.

/** 설정값 읽기 — system_settings 에서. */
function cfg(key) {
    const v = global.systemSettings ? global.systemSettings[key] : null;
    return v == null ? '' : String(v).trim();
}

/** 발송 기능이 켜져 있고 최소 설정이 갖춰졌는가. */
function isEnabled() {
    if (['0', 'false', 'off', 'no'].includes(cfg('sms_enabled').toLowerCase())) return false;
    return !!(cfg('sms_provider') && cfg('sms_api_key') && cfg('sms_sender'));
}

/** 왜 못 보내는지 — 관리자 화면에 그대로 보여 준다. */
function disabledReason() {
    if (['0', 'false', 'off', 'no'].includes(cfg('sms_enabled').toLowerCase())) return '문자 발송이 꺼져 있습니다.';
    if (!cfg('sms_provider')) return '문자 중계사가 선택되지 않았습니다.';
    if (!cfg('sms_api_key')) return 'API 키가 등록되지 않았습니다.';
    if (!cfg('sms_sender')) return '발신번호가 등록되지 않았습니다. (통신사 사전등록을 마친 번호여야 합니다)';
    return null;
}

/** 숫자만 남긴다. 국제표기(+82)는 국내표기로 되돌린다. */
function normalizePhone(raw) {
    let s = String(raw || '').replace(/[^0-9+]/g, '');
    if (s.startsWith('+82')) s = '0' + s.slice(3);
    return s.replace(/\D/g, '');
}

/** 본문 바이트 수 — SMS/LMS 판정용. */
function byteLength(text) {
    let n = 0;
    for (const ch of String(text)) n += ch.charCodeAt(0) > 127 ? 2 : 1;
    return n;
}

/* ── 중계사 어댑터 ────────────────────────────────────────────
 * 각 함수는 { ok, detail } 을 돌려준다. 예외를 던지지 않는다 —
 * 안내 문자 하나 때문에 주문·클레임 트랜잭션이 깨져서는 안 된다.
 */
const PROVIDERS = {
    /** 알리고 — https://smartsms.aligo.in */
    async aligo({ to, text, title }) {
        const isLms = byteLength(text) > SMS_MAX_BYTES;
        const body = new URLSearchParams({
            key: cfg('sms_api_key'),
            user_id: cfg('sms_user_id'),
            sender: normalizePhone(cfg('sms_sender')),
            receiver: to,
            msg: text,
            msg_type: isLms ? 'LMS' : 'SMS',
        });
        if (isLms && title) body.set('title', title.slice(0, 44));

        const resp = await fetch('https://apis.aligo.in/send/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });
        const json = await resp.json().catch(() => ({}));
        // 알리고는 HTTP 200 에 result_code 로 성패를 싣는다. 0 이하가 실패다.
        const ok = resp.ok && Number(json.result_code) > 0;
        return { ok, detail: json.message || JSON.stringify(json).slice(0, 300) };
    },

    /** 솔라피(CoolSMS) — https://solapi.com */
    async solapi({ to, text }) {
        // 솔라피는 HMAC 서명을 요구한다. 키/시크릿으로 서명해 보낸다.
        const crypto = require('crypto');
        const apiKey = cfg('sms_api_key');
        const apiSecret = cfg('sms_api_secret');
        const date = new Date().toISOString();
        const salt = crypto.randomBytes(16).toString('hex');
        const signature = crypto.createHmac('sha256', apiSecret).update(date + salt).digest('hex');

        const resp = await fetch('https://api.solapi.com/messages/v4/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
            },
            body: JSON.stringify({ message: { to, from: normalizePhone(cfg('sms_sender')), text } }),
        });
        const json = await resp.json().catch(() => ({}));
        return { ok: resp.ok, detail: JSON.stringify(json).slice(0, 300) };
    },
};

const PROVIDER_LABELS = { aligo: '알리고 (Aligo)', solapi: '솔라피 (Solapi/CoolSMS)' };

/**
 * 문자 한 통. 실패해도 예외를 던지지 않는다.
 * @returns {Promise<{ok:boolean, skipped?:boolean, reason?:string}>}
 */
async function sendSms({ to, text, title }) {
    const reason = disabledReason();
    if (reason) return { ok: false, skipped: true, reason };

    const phone = normalizePhone(to);
    if (!phone || phone.length < 9) return { ok: false, skipped: true, reason: '연락처가 없거나 형식이 올바르지 않습니다.' };
    if (!String(text || '').trim()) return { ok: false, skipped: true, reason: '보낼 내용이 비어 있습니다.' };

    const provider = PROVIDERS[cfg('sms_provider')];
    if (!provider) return { ok: false, skipped: true, reason: `알 수 없는 중계사입니다: ${cfg('sms_provider')}` };

    try {
        const r = await provider({ to: phone, text: String(text).slice(0, 2000), title });
        if (!r.ok) console.error('[sms] 발송 실패:', r.detail);
        return r;
    } catch (err) {
        console.error('[sms] 발송 오류:', err.message);
        return { ok: false, reason: err.message };
    }
}

/**
 * 알림톡. 템플릿 코드가 없으면 곧바로 문자로 보낸다.
 * 알림톡 본문은 **승인받은 템플릿과 글자 하나까지 같아야** 발송된다 —
 * 그래서 문구를 코드에서 자유롭게 바꾸지 못한다. 변수만 채운다.
 */
async function sendAlimtalk({ to, text, templateCode, title }) {
    const code = templateCode || '';
    // 알림톡 채널·템플릿이 준비되지 않았으면 문자로 보낸다(안내가 아예 안 가는 것보다 낫다).
    if (!code || !cfg('alimtalk_sender_key')) {
        return sendSms({ to, text, title });
    }
    // 중계사별 알림톡 API 는 계약 후 발급되는 채널키·템플릿 형식에 따라 달라진다.
    // 지금은 문자 경로로 보내고, 계약이 끝나면 이 자리에 중계사 알림톡 엔드포인트를 넣는다.
    return sendSms({ to, text, title });
}

module.exports = {
    isEnabled, disabledReason, sendSms, sendAlimtalk,
    normalizePhone, byteLength, PROVIDER_LABELS,
};
