/**
 * 스크립트 공용 부트스트랩.
 *
 * .env 로드(암호화된 ENC: 값은 config/env.js 가 자동 복호화) 후,
 * DB의 system_settings 를 process.env 에 주입한다.
 *
 * SHOPIFY_*, SESSION_SECRET, TINYMCE_KEY 등은 .env 가 아니라 system_settings 에서
 * 오므로, 스탠드얼론 스크립트도 앱과 동일하게 이 로더를 먼저 실행해야 한다.
 *
 * 사용:
 *   const bootstrap = require('./_bootstrap');
 *   (async () => {
 *     await bootstrap();               // 이후 process.env.SHOPIFY_* 사용 가능
 *     ...
 *   })();
 */
require('../config/env');
const { loadSystemSettingsAndApplyEnv } = require('../config/systemSettings');

let readyPromise = null;

// 여러 번 호출해도 한 번만 로드한다.
module.exports = function bootstrap() {
  if (!readyPromise) readyPromise = loadSystemSettingsAndApplyEnv();
  return readyPromise;
};
