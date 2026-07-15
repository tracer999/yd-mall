'use strict';

const OpenAI = require('openai');

/**
 * AI(OpenAI) 사용 가능 상태 판정 및 클라이언트 생성 헬퍼.
 *
 * 판정 소스는 전역 system_settings(global.systemSettings)이다.
 *  - ai_enabled    : 'Y' 이면 AI 사용, 그 외(N/미설정)는 미사용
 *  - openai_api_key : 비어 있지 않아야 실제 호출 가능
 *
 * "AI 사용여부가 N" 이거나, "Y 여도 키가 없는" 경우 usable=false 가 되고
 * 사유(reason)와 사용자용 안내 메시지(message)를 함께 돌려준다.
 */

const SETTINGS_HINT = '[환경 설정 > 시스템 설정]';

function getAiStatus() {
    const s = global.systemSettings || {};
    const enabled = String(s.ai_enabled || '').trim().toUpperCase() === 'Y';
    const hasKey = !!(s.openai_api_key && String(s.openai_api_key).trim());
    const usable = enabled && hasKey;

    let reason = null;
    let message = null;
    if (!enabled) {
        reason = 'disabled';
        message = `AI 기능이 비활성화되어 있습니다. ${SETTINGS_HINT}에서 'AI 사용'을 켜주세요.`;
    } else if (!hasKey) {
        reason = 'no_key';
        message = `OpenAI API 키가 설정되지 않았습니다. ${SETTINGS_HINT}에서 키를 등록해주세요.`;
    }

    return { enabled, hasKey, usable, reason, message };
}

/**
 * 현재 저장된 설정으로 OpenAI 클라이언트를 생성한다.
 * 매 요청마다 새로 만들므로 키/타임아웃 변경이 재기동 없이 즉시 반영된다.
 * 사용 불가(비활성 또는 키 없음)면 null 을 돌려준다.
 */
function getOpenAIClient() {
    const status = getAiStatus();
    if (!status.usable) return null;

    const s = global.systemSettings || {};
    const apiKey = String(s.openai_api_key).trim();
    const timeout = parseInt(s.openai_timeout_ms || process.env.OPENAI_TIMEOUT_MS, 10) || 90000;

    return new OpenAI({ apiKey, timeout });
}

module.exports = { getAiStatus, getOpenAIClient };
