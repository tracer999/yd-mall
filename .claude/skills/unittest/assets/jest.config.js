/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',

  // 테스트 파일 패턴
  testMatch: [
    '<rootDir>/__tests__/**/*.test.js',
  ],

  // 글로벌 setup
  setupFilesAfterSetup: [
    '<rootDir>/__tests__/helpers/setup.js',
  ],

  // 커버리지 설정
  collectCoverageFrom: [
    'services/**/*.js',
    'controllers/**/*.js',
    'infrastructure/**/*.js',
    'config/**/*.js',
    'schedule/**/*.js',
    '!**/node_modules/**',
    '!**/__tests__/**',
  ],

  coverageDirectory: 'coverage',

  coverageReporters: ['text', 'text-summary', 'html'],

  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },

  // 타임아웃 (AI mock 등 비동기 테스트용)
  testTimeout: 10000,

  // 모듈 자동 mock 비활성 (명시적 mock 선호)
  automock: false,

  // 테스트 후 리소스 정리
  forceExit: true,
  detectOpenHandles: true,

  // 병렬 실행 (기본값)
  maxWorkers: '50%',

  // 변환 제외
  transformIgnorePatterns: ['/node_modules/'],

  // 경로 별칭 (필요 시 추가)
  moduleNameMapper: {},
};
