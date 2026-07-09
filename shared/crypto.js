/**
 * AES-256-GCM 환경변수 암호화/복호화 모듈
 *
 * .env 파일의 민감 값을 암호화하여 저장하고, 앱 시작 시 자동 복호화한다.
 * 암호화된 값은 ENC: 접두어로 구분한다.
 *
 * (kotourlive-platform/shared/crypto.js 와 동일한 방식)
 *
 * 사용법:
 *   const { decryptEnvVars } = require('../shared/crypto');
 *   decryptEnvVars();  // process.env의 ENC: 값들을 자동 복호화
 */

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const ENC_PREFIX = 'ENC:';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * 평문을 AES-256-GCM으로 암호화한다.
 * @param {string} plainText - 암호화할 평문
 * @param {string} hexKey - 64자리 hex 문자열 (32바이트 키)
 * @returns {string} "iv:tag:ciphertext" 형식의 hex 문자열
 */
function encrypt(plainText, hexKey) {
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars)');

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * AES-256-GCM 암호문을 복호화한다.
 * @param {string} encryptedText - "iv:tag:ciphertext" 형식의 hex 문자열
 * @param {string} hexKey - 64자리 hex 문자열 (32바이트 키)
 * @returns {string} 복호화된 평문
 */
function decrypt(encryptedText, hexKey) {
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars)');

  const parts = encryptedText.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format. Expected iv:tag:ciphertext');

  const [ivHex, tagHex, data] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  if (iv.length !== IV_LENGTH) throw new Error(`Invalid IV length: ${iv.length}`);
  if (tag.length !== TAG_LENGTH) throw new Error(`Invalid auth tag length: ${tag.length}`);

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * process.env에서 ENC: 접두어가 붙은 값들을 자동 복호화한다.
 * ENCRYPTION_KEY 환경변수가 없으면 건너뛴다 (하위 호환/평문 모드).
 */
function decryptEnvVars() {
  const hexKey = process.env.ENCRYPTION_KEY;
  if (!hexKey) return; // 키가 없으면 평문 모드로 동작

  let count = 0;
  for (const [key, value] of Object.entries(process.env)) {
    if (value && value.startsWith(ENC_PREFIX)) {
      try {
        process.env[key] = decrypt(value.slice(ENC_PREFIX.length), hexKey);
        count++;
      } catch (err) {
        console.error(`[crypto] Failed to decrypt ${key}:`, err.message);
        process.exit(1);
      }
    }
  }
  if (count > 0) {
    console.log(`[crypto] ${count}개 환경변수 복호화 완료`);
  }
}

module.exports = { encrypt, decrypt, decryptEnvVars, ENC_PREFIX };
