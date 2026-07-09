#!/usr/bin/env node
/**
 * .env 민감 값 암호화 CLI 도구
 *
 * ENCRYPTION_KEY는 시스템 환경변수(/etc/environment)로 관리한다.
 * 인자로 키를 주지 않으면 process.env.ENCRYPTION_KEY를 사용한다.
 *
 * 사용법:
 *   # 값 암호화 (시스템 ENCRYPTION_KEY 사용)
 *   node scripts/encrypt.js "NEWtec4075@@"
 *
 *   # 값 암호화 (키 명시)
 *   node scripts/encrypt.js <ENCRYPTION_KEY> "NEWtec4075@@"
 *
 *   # 복호화 검증
 *   node scripts/encrypt.js --decrypt "ENC:iv:tag:ciphertext"
 *   node scripts/encrypt.js --decrypt <ENCRYPTION_KEY> "iv:tag:ciphertext"
 *
 *   # 새 키 생성 (참고용 — 이미 시스템 키가 있으면 사용하지 말 것)
 *   node scripts/encrypt.js --generate-key
 *
 * 출력된 ENC:... 문자열을 .env 의 해당 값 자리에 붙여넣는다.
 */

const crypto = require('crypto');
const { encrypt, decrypt, ENC_PREFIX } = require('../shared/crypto');

const args = process.argv.slice(2);
const envKey = process.env.ENCRYPTION_KEY;

function looksLikeKey(s) {
  return typeof s === 'string' && /^[0-9a-fA-F]{64}$/.test(s);
}

if (args.length === 0) {
  console.log(`
.env 민감 값 암호화 CLI (ENCRYPTION_KEY는 시스템 환경변수 사용)

사용법:
  node scripts/encrypt.js <평문>                        값 암호화
  node scripts/encrypt.js <KEY> <평문>                   값 암호화 (키 명시)
  node scripts/encrypt.js --decrypt <암호문>             복호화 검증
  node scripts/encrypt.js --decrypt <KEY> <암호문>       복호화 검증 (키 명시)
  node scripts/encrypt.js --generate-key                새 키 생성(참고용)
`);
  process.exit(0);
}

// --generate-key: 새 암호화 키 생성 (참고용)
if (args[0] === '--generate-key') {
  const key = crypto.randomBytes(32).toString('hex');
  console.log('\n새 ENCRYPTION_KEY (참고용, 이미 시스템 키가 있으면 교체 금지):');
  console.log(key);
  process.exit(0);
}

// --decrypt: 복호화 (검증용)
if (args[0] === '--decrypt') {
  const rest = args.slice(1);
  let hexKey = envKey;
  let encValue;
  if (rest.length >= 2 && looksLikeKey(rest[0])) {
    hexKey = rest[0];
    encValue = rest[1];
  } else {
    encValue = rest[0];
  }
  if (!hexKey) {
    console.error('ENCRYPTION_KEY가 없습니다. 시스템 환경변수를 설정하거나 키를 인자로 전달하세요.');
    process.exit(1);
  }
  if (!encValue) {
    console.error('사용법: node scripts/encrypt.js --decrypt [KEY] <암호문>');
    process.exit(1);
  }
  const raw = encValue.startsWith(ENC_PREFIX) ? encValue.slice(ENC_PREFIX.length) : encValue;
  try {
    console.log('복호화 결과:', decrypt(raw, hexKey));
  } catch (err) {
    console.error('복호화 실패:', err.message);
    process.exit(1);
  }
  process.exit(0);
}

// 암호화: [KEY] <평문>
let hexKey = envKey;
let plainText;
if (args.length >= 2 && looksLikeKey(args[0])) {
  hexKey = args[0];
  plainText = args[1];
} else {
  plainText = args[0];
}

if (!hexKey) {
  console.error('ENCRYPTION_KEY가 없습니다. 시스템 환경변수를 설정하거나 키를 첫 인자로 전달하세요.');
  process.exit(1);
}

try {
  const encrypted = encrypt(plainText, hexKey);
  console.log(`\n암호화 결과 (.env에 붙여넣기):`);
  console.log(`${ENC_PREFIX}${encrypted}`);
  const verified = decrypt(encrypted, hexKey);
  console.log(`\n검증: ${verified === plainText ? '✅ 성공' : '❌ 실패'}`);
} catch (err) {
  console.error('암호화 실패:', err.message);
  process.exit(1);
}
