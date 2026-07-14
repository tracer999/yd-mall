/**
 * 회원 상세정보(주문·배송용) 정규화 · 검증 · 저장.
 *
 * 두 가입 경로가 같은 필드 세트를 쓴다:
 *   - 자체 가입폼        : GET/POST /auth/register     (신규 INSERT)
 *   - 소셜 가입 추가정보 : GET/POST /auth/signup-finish (기존 행 UPDATE)
 * 화면은 views/auth/_profile_fields.ejs 하나를 공유하고, 서버 로직은 이 파일 하나를 공유한다.
 */

const bcrypt = require('bcrypt');
const pool = require('../../config/db');
const { issueCoupon } = require('../coupon/couponIssueService');

const BCRYPT_ROUNDS = 10;
const PASSWORD_MIN_LENGTH = 8;
const GENDERS = ['M', 'F', 'UNKNOWN'];
const PLACEHOLDER_EMAIL_DOMAIN = '@no-email.com';

const trim = (value) => (typeof value === 'string' ? value.trim() : '');
const digitsOnly = (value) => trim(value).replace(/[^0-9]/g, '');

/** OAuth 가 이메일을 안 준 계정에 붙는 placeholder 인지 (카카오 이메일 미동의 등). */
function isPlaceholderEmail(email) {
    return !email || String(email).includes(PLACEHOLDER_EMAIL_DOMAIN);
}

/** 'YYYYMMDD' 또는 'YYYY-MM-DD' → 'YYYY-MM-DD'. 형식이 아니면 빈 문자열. */
function normalizeBirthdate(value) {
    const raw = trim(value);
    if (!raw) return '';
    const digits = raw.replace(/[^0-9]/g, '');
    if (digits.length !== 8) return '';
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/** 폼 body → 저장 가능한 프로필 객체. 두 경로가 같은 name 속성을 쓴다. */
function normalizeProfileInput(body = {}) {
    const gender = trim(body.gender).toUpperCase();
    return {
        name: trim(body.name),
        email: trim(body.email).toLowerCase(),
        birthdate: normalizeBirthdate(body.birthdate),
        gender: GENDERS.includes(gender) ? gender : 'UNKNOWN',
        phone: digitsOnly(body.phone),
        phone_sub: digitsOnly(body.phone_sub),
        receiver_name: trim(body.receiver_name),
        zipcode: trim(body.zipcode),
        address: trim(body.address),
        detailed_address: trim(body.detailed_address),
        delivery_request: trim(body.delivery_request),
        marketing_agreed: body.marketing_agreed ? 1 : 0
    };
}

/**
 * 필수값 검증. 반환값은 { field: '메시지' } 맵 — 뷰가 필드 옆에 그대로 뿌린다.
 * requireEmail: 소셜 계정이 이미 실제 이메일을 갖고 있으면 false (입력란 자체를 숨긴다).
 */
function validateProfile(profile, { requireEmail = true } = {}) {
    const errors = {};

    if (!profile.name) errors.name = '성함을 입력해주세요.';
    if (requireEmail) {
        if (!profile.email) errors.email = '이메일을 입력해주세요.';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) errors.email = '이메일 형식이 올바르지 않습니다.';
    }
    if (!profile.birthdate) errors.birthdate = '생년월일 8자리를 입력해주세요. (예: 19800101)';
    if (!profile.phone) errors.phone = '휴대폰 번호를 입력해주세요.';
    else if (profile.phone.length < 10 || profile.phone.length > 11) errors.phone = '휴대폰 번호가 올바르지 않습니다.';
    if (profile.phone_sub && (profile.phone_sub.length < 9 || profile.phone_sub.length > 11)) {
        errors.phone_sub = '보조 연락처가 올바르지 않습니다.';
    }
    if (!profile.receiver_name) errors.receiver_name = '수령인명을 입력해주세요.';
    if (!profile.zipcode || !profile.address) errors.address = '우편번호 찾기로 주소를 선택해주세요.';
    else if (!profile.detailed_address) errors.detailed_address = '상세 주소를 입력해주세요.';

    return errors;
}

/** 자체 가입 비밀번호 정책: 8자 이상 + 영문/숫자 조합. */
function validatePassword(password, passwordConfirm) {
    const errors = {};
    const value = typeof password === 'string' ? password : '';

    if (!value) {
        errors.password = '비밀번호를 입력해주세요.';
    } else if (value.length < PASSWORD_MIN_LENGTH) {
        errors.password = `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`;
    } else if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
        errors.password = '비밀번호는 영문과 숫자를 모두 포함해야 합니다.';
    } else if (value !== passwordConfirm) {
        errors.password_confirm = '비밀번호가 일치하지 않습니다.';
    }

    return errors;
}

async function isEmailTaken(email, excludeUserId = null) {
    const [rows] = excludeUserId
        ? await pool.query('SELECT id FROM users WHERE email = ? AND id <> ?', [email, excludeUserId])
        : await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    return rows.length > 0;
}

async function isPhoneTaken(phone, excludeUserId = null) {
    const [rows] = excludeUserId
        ? await pool.query('SELECT id FROM users WHERE phone = ? AND id <> ?', [phone, excludeUserId])
        : await pool.query('SELECT id FROM users WHERE phone = ?', [phone]);
    return rows.length > 0;
}

/** 이메일·휴대폰 중복 검사를 errors 맵에 합쳐 반환. */
async function checkDuplicates(profile, { excludeUserId = null, checkEmail = true } = {}) {
    const errors = {};
    if (checkEmail && profile.email && await isEmailTaken(profile.email, excludeUserId)) {
        errors.email = '이미 가입된 이메일입니다.';
    }
    if (profile.phone && await isPhoneTaken(profile.phone, excludeUserId)) {
        errors.phone = '이미 가입된 휴대폰 번호입니다.';
    }
    return errors;
}

const PROFILE_COLUMNS = [
    'name', 'birthdate', 'gender', 'phone', 'phone_sub',
    'receiver_name', 'zipcode', 'address', 'detailed_address',
    'delivery_request', 'marketing_agreed'
];

/**
 * 기존 회원(소셜 가입 직후)의 상세정보를 채우고 계정을 활성화한다.
 * updateEmail=true 인 경우에만 email 을 덮어쓴다(카카오 placeholder → 실제 이메일).
 */
async function completeProfile(executor, userId, profile, { termsId, privacyId, updateEmail = false }) {
    const columns = [...PROFILE_COLUMNS];
    const values = PROFILE_COLUMNS.map((column) => profile[column] || (column === 'marketing_agreed' ? 0 : null));

    if (updateEmail && profile.email) {
        columns.push('email');
        values.push(profile.email);
    }

    const assignments = columns.map((column) => `${column} = ?`).join(', ');
    await executor.query(
        `UPDATE users SET ${assignments}, agreed_terms_id = ?, agreed_privacy_id = ?, is_active = 1 WHERE id = ?`,
        [...values, termsId, privacyId, userId]
    );
}

/** 자체 가입폼으로 신규 회원 생성. 반환: insertId */
async function createLocalUser(executor, profile, password, { termsId, privacyId }) {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const columns = ['email', 'password_hash', 'signup_provider', ...PROFILE_COLUMNS, 'agreed_terms_id', 'agreed_privacy_id', 'is_active'];
    const values = [
        profile.email,
        passwordHash,
        'LOCAL',
        ...PROFILE_COLUMNS.map((column) => profile[column] || (column === 'marketing_agreed' ? 0 : null)),
        termsId,
        privacyId,
        1
    ];

    const placeholders = columns.map(() => '?').join(', ');
    const [result] = await executor.query(
        `INSERT INTO users (${columns.join(', ')}) VALUES (${placeholders})`,
        values
    );
    return result.insertId;
}

/** 자체 로그인용 비밀번호 검증. */
async function verifyPassword(user, password) {
    if (!user || !user.password_hash) return false;
    return bcrypt.compare(password, user.password_hash);
}

/**
 * 가입 자동 지급 쿠폰.
 *
 * 트리거는 `coupon_type='NEW_SIGNUP'` 이 아니라 `issue_method='AUTO_SIGNUP'` 이다.
 * 선착순·유효기간은 couponIssueService 가 관장한다(발급 경로 다섯 곳이 같은 규칙을 쓴다).
 * 쿠폰 실패가 가입 자체를 되돌리면 안 되므로 가입 트랜잭션 밖에서 호출하고 예외를 삼킨다.
 */
async function issueSignupCoupons(userId) {
    try {
        const [coupons] = await pool.query(
            `SELECT * FROM coupons
              WHERE issue_method = 'AUTO_SIGNUP' AND status = 'ACTIVE'
                AND (valid_from IS NULL OR valid_from <= NOW())
                AND (valid_to IS NULL OR valid_to >= NOW())`
        );
        for (const coupon of coupons) {
            const conn = await pool.getConnection();
            try {
                await conn.beginTransaction();
                await issueCoupon(conn, { userId, coupon, issuedBy: 'AUTO' });
                await conn.commit();
            } catch (err) {
                await conn.rollback();
                throw err;
            } finally {
                conn.release();
            }
        }
    } catch (err) {
        console.error('[profileService] AUTO_SIGNUP 쿠폰 발급 실패:', err);
    }
}

module.exports = {
    PASSWORD_MIN_LENGTH,
    isPlaceholderEmail,
    normalizeProfileInput,
    validateProfile,
    validatePassword,
    isEmailTaken,
    isPhoneTaken,
    checkDuplicates,
    completeProfile,
    createLocalUser,
    verifyPassword,
    issueSignupCoupons
};
