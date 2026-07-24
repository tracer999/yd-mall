require('./env');
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // 원격 DB(wait_timeout)·NAT 가 유휴 커넥션을 조용히 끊으면 풀이 죽은 커넥션을 내주어
    // 첫 쿼리에서 ECONNRESET(fatal) 로 500 이 난다(가동 시간이 길수록 재현). 아래로 방지한다.
    enableKeepAlive: true,          // TCP keepalive 로 유휴 커넥션이 살아 있게 유지
    keepAliveInitialDelay: 10000,   // 연결 후 10초부터 keepalive 프로브
    idleTimeout: 60000,             // 60초 이상 유휴 커넥션은 풀이 먼저 닫아 stale 재사용 차단
});

module.exports = pool;
