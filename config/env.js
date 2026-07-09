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

module.exports = { nodeEnv, loaded };
