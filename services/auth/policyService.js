/**
 * 약관·개인정보 처리방침 버전 조회 / 동의 이력 기록.
 *
 * 자체 가입폼(POST /auth/register), 소셜 추가정보(POST /auth/signup-finish),
 * 약관 재동의(POST /auth/terms-update) 세 경로가 같은 규칙을 써야 하므로 여기로 모은다.
 */

const pool = require('../../config/db');

const FALLBACK_TERMS = '이용약관 내용이 등록되지 않았습니다.';
const FALLBACK_PRIVACY = '개인정보 처리방침 내용이 등록되지 않았습니다.';

/** 현재 시행중인 약관/개인정보 버전 ID. 없으면 null. */
async function getActivePolicyIds() {
    const [[terms]] = await pool.query(
        `SELECT id FROM policy_versions WHERE type = 'TERMS' AND is_active = 1 ORDER BY effective_date DESC LIMIT 1`
    );
    const [[privacy]] = await pool.query(
        `SELECT id FROM policy_versions WHERE type = 'PRIVACY' AND is_active = 1 ORDER BY effective_date DESC LIMIT 1`
    );
    return {
        termsId: terms ? terms.id : null,
        privacyId: privacy ? privacy.id : null
    };
}

/**
 * 가입/재동의 화면에 노출할 약관 본문.
 * 1순위 policy_versions(is_active=1), 2순위 site_settings 단일 필드(레거시).
 */
async function getPolicyContents() {
    let termsContent = FALLBACK_TERMS;
    let privacyContent = FALLBACK_PRIVACY;

    try {
        const [rows] = await pool.query(`SELECT type, content FROM policy_versions WHERE is_active = 1`);
        const activeTerms = rows.find((row) => row.type === 'TERMS');
        const activePrivacy = rows.find((row) => row.type === 'PRIVACY');

        if (activeTerms && activeTerms.content) termsContent = activeTerms.content.replace(/\n/g, '<br>');
        if (activePrivacy && activePrivacy.content) privacyContent = activePrivacy.content.replace(/\n/g, '<br>');

        if (!activeTerms || !activeTerms.content || !activePrivacy || !activePrivacy.content) {
            const [legacy] = await pool.query('SELECT terms_of_service, privacy_policy FROM site_settings WHERE id = 1');
            if (legacy.length > 0) {
                if (termsContent === FALLBACK_TERMS && legacy[0].terms_of_service) {
                    termsContent = legacy[0].terms_of_service.replace(/\n/g, '<br>');
                }
                if (privacyContent === FALLBACK_PRIVACY && legacy[0].privacy_policy) {
                    privacyContent = legacy[0].privacy_policy.replace(/\n/g, '<br>');
                }
            }
        }
    } catch (err) {
        console.error('[policyService] 약관 본문 조회 실패:', err);
    }

    return { termsContent, privacyContent };
}

/** 동의 이력 저장 (약관/개인정보 각각 1행). executor 는 pool 또는 트랜잭션 커넥션. */
async function recordAgreements(executor, userId, { termsId, privacyId }) {
    const sql = `INSERT INTO user_policy_agreements (user_id, policy_version_id)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE agreed_at = CURRENT_TIMESTAMP`;
    if (termsId) await executor.query(sql, [userId, termsId]);
    if (privacyId) await executor.query(sql, [userId, privacyId]);
}

/** 재동의가 필요한 사용자인지 (미동의 또는 구버전 동의). */
function needsAgreement(user, { termsId, privacyId }) {
    const needsInitial = !user.agreed_terms_id || !user.agreed_privacy_id;
    const needsUpgrade = (
        (termsId && user.agreed_terms_id && user.agreed_terms_id !== termsId) ||
        (privacyId && user.agreed_privacy_id && user.agreed_privacy_id !== privacyId)
    );
    return needsInitial || needsUpgrade;
}

module.exports = {
    getActivePolicyIds,
    getPolicyContents,
    recordAgreements,
    needsAgreement
};
