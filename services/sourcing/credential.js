/*
 * 외부 채널 자격증명 저장/로드 (몰별, 암호화).
 * 설계: docs/사이트개선/도매꾹_온채널_스마트스토어_연동_상세설계.md §5, §5.1
 *
 * - 시크릿은 'ENC:' + AES-256-GCM(shared/crypto) 로 저장. 평문 저장 금지.
 * - 몰별 독립(mall_id 스코프). 1:N 공유 참조 없음 — 서브몰은 각자 저장하거나 복사한다.
 * - 액세스 토큰은 저장하지 않는다(어댑터가 메모리 캐시).
 */

const pool = require('../../config/db');
const { encrypt, decrypt, ENC_PREFIX } = require('../../shared/crypto');

const CHANNELS = ['DOMEGGOOK', 'DOMEME', 'ONCHANNEL', 'NAVER_SMARTSTORE'];

function requireKey() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) throw new Error('ENCRYPTION_KEY 미설정 — 자격증명 암복호화 불가');
    return key;
}

function encSecret(plain) {
    if (plain == null || plain === '') return null;
    return ENC_PREFIX + encrypt(String(plain), requireKey());
}

function decSecret(enc) {
    if (!enc) return null;
    const body = enc.startsWith(ENC_PREFIX) ? enc.slice(ENC_PREFIX.length) : enc;
    return decrypt(body, requireKey());
}

// 목록(민감값 제외 — 화면 표시용)
async function listCredentials(mallId) {
    const [rows] = await pool.query(
        `SELECT id, channel, account_label, client_id,
                (secret_enc IS NOT NULL) AS has_secret,
                status, last_verified_at, last_error, updated_at
           FROM mall_channel_credential
          WHERE mall_id = ?
          ORDER BY channel, account_label`,
        [mallId]
    );
    return rows;
}

// 어댑터 주입용 — 복호화된 시크릿 포함
async function getCredential(mallId, id) {
    const [rows] = await pool.query(
        `SELECT * FROM mall_channel_credential WHERE mall_id = ? AND id = ? LIMIT 1`,
        [mallId, id]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
        id: r.id,
        mallId: r.mall_id,
        channel: r.channel,
        accountLabel: r.account_label,
        clientId: r.client_id,
        secret: decSecret(r.secret_enc),
        extra: r.extra_json || null,
        status: r.status,
    };
}

/*
 * 채널 코드로 사용 가능한 자격증명 1건을 찾는다(어댑터 주입용).
 * 도매매(DOMEME)처럼 다른 채널과 키를 공유하는 별칭 채널은 호출부에서
 * adapters.resolveCredentialChannel 로 원본 채널을 넘겨야 한다.
 * ACTIVE 를 우선하되, 미검증(자격증명은 있으나 아직 [검증] 안 누른) 건도 후보로 둔다.
 */
async function getCredentialByChannel(mallId, channel) {
    const [rows] = await pool.query(
        `SELECT * FROM mall_channel_credential
          WHERE mall_id = ? AND channel = ? AND status <> 'DISABLED'
          ORDER BY (status = 'ACTIVE') DESC, id ASC
          LIMIT 1`,
        [mallId, channel]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
        id: r.id,
        mallId: r.mall_id,
        channel: r.channel,
        accountLabel: r.account_label,
        clientId: r.client_id,
        secret: decSecret(r.secret_enc),
        extra: r.extra_json || null,
        status: r.status,
    };
}

// upsert — UNIQUE(mall_id, channel, account_label). 시크릿 미입력 시 기존 값 유지.
async function saveCredential(mallId, { id, channel, accountLabel, clientId, secret, extraJson }) {
    if (!CHANNELS.includes(channel)) throw new Error('알 수 없는 채널: ' + channel);
    const label = String(accountLabel || '기본').trim() || '기본';
    let extra = null;
    if (extraJson) {
        extra = typeof extraJson === 'string' ? extraJson : JSON.stringify(extraJson);
        try { JSON.parse(extra); } catch (e) { throw new Error('부가 설정(JSON) 형식 오류'); }
    }

    if (id) {
        const sets = ['channel = ?', 'account_label = ?', 'client_id = ?', 'extra_json = ?'];
        const params = [channel, label, clientId || null, extra];
        if (secret) { sets.push('secret_enc = ?'); params.push(encSecret(secret)); }
        params.push(mallId, id);
        await pool.query(
            `UPDATE mall_channel_credential SET ${sets.join(', ')} WHERE mall_id = ? AND id = ?`,
            params
        );
        return id;
    }

    const [r] = await pool.query(
        `INSERT INTO mall_channel_credential (mall_id, channel, account_label, client_id, secret_enc, extra_json)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            client_id  = VALUES(client_id),
            secret_enc = COALESCE(VALUES(secret_enc), secret_enc),
            extra_json = VALUES(extra_json)`,
        [mallId, channel, label, clientId || null, encSecret(secret), extra]
    );
    return r.insertId;
}

async function deleteCredential(mallId, id) {
    await pool.query(`DELETE FROM mall_channel_credential WHERE mall_id = ? AND id = ?`, [mallId, id]);
}

async function updateVerifyResult(mallId, id, { status, message }) {
    await pool.query(
        `UPDATE mall_channel_credential
            SET status = ?, last_error = ?,
                last_verified_at = CASE WHEN ? = 'ACTIVE' THEN NOW() ELSE last_verified_at END
          WHERE mall_id = ? AND id = ?`,
        [status, message || null, status, mallId, id]
    );
}

// 다른 몰 → 현재 몰로 자격증명 복사(값 복제. secret_enc 를 그대로 복사 — 같은 ENCRYPTION_KEY 라 유효).
async function copyCredentialsFromMall(fromMallId, toMallId) {
    const [rows] = await pool.query(
        `SELECT channel, account_label, client_id, secret_enc, extra_json
           FROM mall_channel_credential WHERE mall_id = ?`,
        [fromMallId]
    );
    let copied = 0;
    for (const r of rows) {
        const extra = r.extra_json == null ? null
            : (typeof r.extra_json === 'string' ? r.extra_json : JSON.stringify(r.extra_json));
        await pool.query(
            `INSERT INTO mall_channel_credential (mall_id, channel, account_label, client_id, secret_enc, extra_json)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                client_id  = VALUES(client_id),
                secret_enc = VALUES(secret_enc),
                extra_json = VALUES(extra_json)`,
            [toMallId, r.channel, r.account_label, r.client_id, r.secret_enc, extra]
        );
        copied++;
    }
    return copied;
}

module.exports = {
    CHANNELS,
    listCredentials,
    getCredential,
    getCredentialByChannel,
    saveCredential,
    deleteCredential,
    updateVerifyResult,
    copyCredentialsFromMall,
};
