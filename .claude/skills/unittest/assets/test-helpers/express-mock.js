/**
 * Express Mock Helper
 *
 * Express req, res, next 객체를 모킹하는 유틸리티.
 * admin 컨트롤러 테스트에 사용.
 *
 * 사용법:
 *   const { createMockReq, createMockRes } = require('../helpers/express-mock');
 *   const req = createMockReq({ body: { title: 'Test' } });
 *   const res = createMockRes();
 */

/**
 * Mock Express Request 생성
 * @param {Object} overrides - req 속성 덮어쓰기
 * @returns {Object} mock req
 */
function createMockReq(overrides = {}) {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
    session: {
      user: { id: 1, username: 'admin', role: 'super_admin' },
      flash: {},
    },
    files: null,
    file: null,
    get: jest.fn((header) => overrides.headers?.[header] || ''),
    ...overrides,
  };
}

/**
 * Mock Express Response 생성
 * 체이닝 지원: res.status(200).json({})
 * @returns {Object} mock res
 */
function createMockRes() {
  const res = {
    statusCode: 200,
    _rendered: null,
    _json: null,
    _redirectUrl: null,
    _sentData: null,
  };

  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((data) => {
    res._json = data;
    return res;
  });
  res.send = jest.fn((data) => {
    res._sentData = data;
    return res;
  });
  res.render = jest.fn((view, locals) => {
    res._rendered = { view, locals };
    return res;
  });
  res.redirect = jest.fn((url) => {
    res._redirectUrl = url;
    return res;
  });
  res.set = jest.fn().mockReturnThis();
  res.cookie = jest.fn().mockReturnThis();
  res.clearCookie = jest.fn().mockReturnThis();
  res.end = jest.fn().mockReturnThis();

  return res;
}

/**
 * Mock next function
 * @returns {jest.Mock}
 */
function createMockNext() {
  return jest.fn();
}

module.exports = {
  createMockReq,
  createMockRes,
  createMockNext,
};
