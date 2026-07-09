/**
 * Jest Global Setup
 *
 * 모든 테스트 파일 실행 전에 로드된다.
 * 테스트 환경 변수, 글로벌 mock 설정 등을 담당한다.
 */

// 테스트용 환경변수 설정
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test_koreantourism';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_PASSWORD = '';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.OPENAI_TIMEOUT_MS = '5000';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.KOTOUR_API_CLIENT_ID = 'test-client-id';
process.env.KOTOUR_API_SECRET_KEY = 'test-secret-key';

// Worker 환경변수 (테스트에서는 기본 비활성)
process.env.ENABLE_TRANSLATION_WORKER = '0';
process.env.ENABLE_FESTIVAL_IMPORT_WORKER = '0';
process.env.ENABLE_FESTIVALLIST_IMPORT_WORKER = '0';
process.env.ENABLE_NEWS_AUTO_WORKER = '0';
process.env.ENABLE_CONCERT_IMPORT_WORKER = '0';
process.env.ENABLE_CONTENT_CHECK_WORKER = '0';
process.env.ENABLE_PUBLICATION_SCHEDULER = '0';

// 콘솔 출력 억제 (필요 시 해제)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };
