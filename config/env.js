const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const nodeEnv = process.env.NODE_ENV || 'development';
const envSpecificFile = nodeEnv === 'production' ? '.env.production' : '.env.development';

// 로드 순서: .env(기본값) → 환경별 파일(.env.development | .env.production, override)
const loadOrder = ['.env', envSpecificFile];
const loaded = [];

for (const file of loadOrder) {
  const envPath = path.join(__dirname, '..', file);
  if (fs.existsSync(envPath)) {
    // 뒤에 로드되는 환경별 파일이 .env 기본값을 덮어쓰도록 override 사용
    dotenv.config({ path: envPath, override: true });
    loaded.push(file);
  }
}

if (loaded.length > 0) {
  console.log(`[env] NODE_ENV=${nodeEnv}, Loaded: ${loaded.join(' → ')}`);
} else {
  console.warn('[env] No .env files found, falling back to process.env');
}

// ENC: 접두어가 붙은 암호화된 환경변수(DB_PASS, REDIS_PASSWORD 등)를 자동 복호화한다.
// ENCRYPTION_KEY 는 시스템 환경변수(/etc/environment)로 관리한다.
const { decryptEnvVars, ENC_PREFIX } = require('../shared/crypto');
const hasEncrypted = Object.values(process.env).some(
  (v) => typeof v === 'string' && v.startsWith(ENC_PREFIX)
);
if (hasEncrypted && !process.env.ENCRYPTION_KEY) {
  console.error(
    '[env] ENC: 로 암호화된 값이 있으나 ENCRYPTION_KEY 환경변수가 없습니다. ' +
    '/etc/environment 에 ENCRYPTION_KEY 를 설정하세요.'
  );
  process.exit(1);
}
decryptEnvVars();

module.exports = { nodeEnv, loaded };
