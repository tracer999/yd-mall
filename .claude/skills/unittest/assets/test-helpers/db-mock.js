/**
 * DB Mock Helper
 *
 * infrastructure/db.js 의 query 함수를 모킹하는 유틸리티.
 * mysql2 pool.execute() 는 [rows, fields] 를 반환한다.
 *
 * 사용법:
 *   const { query } = require('../../infrastructure/db');
 *   const { mockQuery, mockQuerySequence, mockQueryError } = require('../helpers/db-mock');
 *   jest.mock('../../infrastructure/db');
 */

const { query } = require('../../infrastructure/db');

/**
 * 단일 쿼리 결과 설정
 * @param {Array} rows - 반환할 행 배열
 * @param {Array} [fields] - 필드 메타데이터 (선택)
 */
function mockQuery(rows, fields = []) {
  query.mockResolvedValue([rows, fields]);
}

/**
 * 순차적 쿼리 결과 설정 (다중 쿼리 서비스용)
 * @param {Array<Array>} results - 각 쿼리의 [rows, fields] 배열
 */
function mockQuerySequence(results) {
  results.forEach((result) => {
    const rows = Array.isArray(result) ? result : [result];
    query.mockResolvedValueOnce([rows, []]);
  });
}

/**
 * DB 에러 시뮬레이션
 * @param {string} [message] - 에러 메시지
 */
function mockQueryError(message = 'Database error') {
  query.mockRejectedValue(new Error(message));
}

/**
 * DB 에러 1회 시뮬레이션 (이후 정상)
 * @param {string} [message] - 에러 메시지
 */
function mockQueryErrorOnce(message = 'Database error') {
  query.mockRejectedValueOnce(new Error(message));
}

/**
 * INSERT 결과 mock
 * @param {number} insertId
 */
function mockInsert(insertId) {
  query.mockResolvedValue([{ insertId, affectedRows: 1 }, []]);
}

/**
 * UPDATE/DELETE 결과 mock
 * @param {number} [affectedRows=1]
 */
function mockAffectedRows(affectedRows = 1) {
  query.mockResolvedValue([{ affectedRows, changedRows: affectedRows }, []]);
}

/**
 * 빈 SELECT 결과 mock
 */
function mockEmptyResult() {
  query.mockResolvedValue([[], []]);
}

/**
 * 모든 mock 초기화
 */
function resetDbMock() {
  query.mockReset();
}

module.exports = {
  mockQuery,
  mockQuerySequence,
  mockQueryError,
  mockQueryErrorOnce,
  mockInsert,
  mockAffectedRows,
  mockEmptyResult,
  resetDbMock,
};
