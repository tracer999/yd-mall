/*
 * 채널 전송·수집 로그 적재(channel_publish_log) 공용 헬퍼.
 *
 * 등록(naverPublishService)·역수집(naverChannelImport)·재고 전송(naverStockSync)이
 * 같은 테이블에 같은 규약으로 남긴다. 규약이 셋으로 갈라지면 실패 추적이 불가능해진다.
 *
 * ⚠ 로그 적재 실패가 본 작업을 깨뜨리면 안 된다 — 여기서 삼키고 콘솔로만 알린다.
 */

const pool = require('../../../config/db');

const CHANNEL = 'NAVER_SMARTSTORE';

/**
 * @param {object} row
 *   mallId, productId, mappingId, action('CREATE'|'UPDATE'|'DELETE'|'STOCK'|'IMAGE'|'FETCH'),
 *   ok, httpStatus, message, request, response, durationMs, actor
 */
async function writeLog(row) {
    try {
        await pool.query(
            `INSERT INTO channel_publish_log
                (mall_id, channel, product_id, mapping_id, action, ok, http_status, message,
                 request_json, response_json, duration_ms, actor)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                row.mallId, row.channel || CHANNEL, row.productId || null, row.mappingId || null,
                row.action, row.ok ? 1 : 0, row.httpStatus || null,
                (row.message || '').slice(0, 4000),
                row.request ? JSON.stringify(row.request) : null,
                row.response ? JSON.stringify(row.response) : null,
                row.durationMs || null, row.actor || null,
            ]
        );
    } catch (e) {
        console.error('[channel/log] 로그 적재 실패:', e.message);
    }
}

module.exports = { writeLog, CHANNEL };
