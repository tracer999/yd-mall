'use strict';

const { getAiStatus } = require('../services/ai/aiStatus');

/**
 * 관리자 화면 전역에서 AI 사용 가능 상태를 뷰로 노출한다.
 * res.locals.aiStatus = { enabled, hasKey, usable, reason, message }
 * AI 기능을 쓰는 메뉴는 이 값으로 버튼 비활성/알림 처리를 한다.
 */
module.exports = (req, res, next) => {
    res.locals.aiStatus = getAiStatus();
    next();
};
