const path = require('path');

// NODE_ENV 하나만 지정하면 config/env.js가 그에 맞는 env 파일을 로드한다.
//   - NODE_ENV=production  → .env → .env.production (PORT=3006)  [기본]
//   - NODE_ENV=development → .env → .env.development (PORT=3006, 상용과 동일 포트)  [--env development]
// 실행:
//   상용:   pm2 start ecosystem.config.cjs                    (또는 npm run pm2:start)
//   개발:   pm2 start ecosystem.config.cjs --env development  (또는 npm run pm2:start:dev)
//   전환:   pm2 restart yd-mall --env development / --env production (--update-env 자동)
module.exports = {
  apps: [
    {
      name: 'yd-mall',
      script: 'app.js',
      instances: 1,
      exec_mode: 'fork',
      // 기본 환경(--env 미지정 시) = 상용
      env: {
        NODE_ENV: 'production',
      },
      // pm2 ... --env development 로 지정 시 적용 = 로컬 개발
      env_development: {
        NODE_ENV: 'development',
      },
      // stdout/stderr
      // 접속 로그는 app에서 logs/access.log에 직접 기록
      out_file: path.join(__dirname, 'logs', 'pm2-out.log'),
      error_file: path.join(__dirname, 'logs', 'pm2-error.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
