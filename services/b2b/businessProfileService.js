/**
 * 사업자 회원 프로필 — 정규화 · 검증 · 저장 · 승인 전이 (설계 §3).
 *
 * 두 진입 경로가 같은 필드 세트를 쓴다:
 *   - 사업자 가입폼   : GET/POST /auth/signup?type=biz
 *   - 사업자 전환 신청 : GET/POST /b2b/apply   (이미 가입한 일반회원)
 * 화면은 views/auth/_business_fields.ejs 하나를 공유하고, 서버 로직은 이 파일 하나를 공유한다.
 * (services/auth/profileService.js 와 같은 구조 — 두 경로가 갈라지면 검증이 어긋난다.)
 */

const pool = require('../../config/db');
const b2bContext = require('../../middleware/b2bContext');

const trim = (value) => (typeof value === 'string' ? value.trim() : '');
const digitsOnly = (value) => trim(value).replace(/[^0-9]/g, '');

/**
 * 국세청 사업자등록번호 체크섬.
 *
 * 진위 확인이 아니라 **오타 걸러내기**다. 실제 확인은 승인 단계에서 관리자가
 * 첨부된 사업자등록증과 대조해 판단한다(설계 §3.2 — 국세청 API 미사용).
 *
 * 가중치 [1,3,7,1,3,7,1,3,5] 를 앞 9자리에 곱해 더하고, 9번째 자리 × 5 의 십의 자리를 더한 뒤
 * (10 − 합%10) % 10 이 마지막 자리와 같아야 한다.
 */
function isValidBusinessNumber(value) {
    const d = digitsOnly(value);
    if (d.length !== 10) return false;
    if (/^(\d)\1{9}$/.test(d)) return false;   // 0000000000 같은 값 차단

    const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
    let sum = 0;
    for (let i = 0; i < 9; i += 1) sum += Number(d[i]) * weights[i];
    sum += Math.floor((Number(d[8]) * 5) / 10);
    const check = (10 - (sum % 10)) % 10;
    return check === Number(d[9]);
}

/** '1234567890' → '123-45-67890' (표시용) */
function formatBusinessNumber(value) {
    const d = digitsOnly(value);
    if (d.length !== 10) return value || '';
    return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/** 폼 body → 저장 가능한 사업자 정보. 두 경로가 같은 name 속성을 쓴다. */
function normalizeBusinessInput(body = {}) {
    return {
        company_name: trim(body.company_name),
        business_number: digitsOnly(body.business_number),
        representative_name: trim(body.representative_name),
        business_type: trim(body.business_type),
        business_category: trim(body.business_category),
        company_zipcode: trim(body.company_zipcode),
        company_address: trim(body.company_address),
        company_detailed_address: trim(body.company_detailed_address),
        tax_invoice_email: trim(body.tax_invoice_email).toLowerCase(),
        manager_name: trim(body.manager_name),
        manager_phone: digitsOnly(body.manager_phone),
    };
}

/**
 * 필수값 검증. 반환값은 { field: '메시지' } 맵 — 뷰가 필드 옆에 그대로 뿌린다.
 * @param {object} biz normalizeBusinessInput 결과
 * @param {{ hasLicenseFile:boolean }} opts 등록증 첨부 여부(신규 신청은 필수)
 */
function validateBusiness(biz, { hasLicenseFile = false, requireLicense = true } = {}) {
    const errors = {};

    if (!biz.company_name) errors.company_name = '상호를 입력해 주세요.';
    if (!biz.business_number) errors.business_number = '사업자등록번호를 입력해 주세요.';
    else if (!isValidBusinessNumber(biz.business_number)) {
        errors.business_number = '사업자등록번호 형식이 올바르지 않습니다. 다시 확인해 주세요.';
    }
    if (!biz.representative_name) errors.representative_name = '대표자명을 입력해 주세요.';
    if (!biz.business_type) errors.business_type = '업태를 입력해 주세요.';
    if (!biz.business_category) errors.business_category = '종목을 입력해 주세요.';

    if (!biz.tax_invoice_email) errors.tax_invoice_email = '세금계산서 수신 이메일을 입력해 주세요.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(biz.tax_invoice_email)) {
        errors.tax_invoice_email = '이메일 형식이 올바르지 않습니다.';
    }

    if (!biz.manager_name) errors.manager_name = '담당자명을 입력해 주세요.';
    if (!biz.manager_phone) errors.manager_phone = '담당자 연락처를 입력해 주세요.';

    if (requireLicense && !hasLicenseFile) {
        errors.license_file = '사업자등록증 사본을 첨부해 주세요.';
    }
    return errors;
}

/** 이미 등록된 사업자번호인지 (본인 제외). 사업자 신원은 몰 무관이라 전역 UNIQUE 다. */
async function isDuplicateBusinessNumber(businessNumber, excludeProfileId = null) {
    const params = [digitsOnly(businessNumber)];
    let sql = 'SELECT id FROM business_profile WHERE business_number = ?';
    if (excludeProfileId) { sql += ' AND id <> ?'; params.push(excludeProfileId); }
    const [rows] = await pool.query(sql, params);
    return rows.length > 0;
}

async function findByUser(userId) {
    return b2bContext.loadProfile(userId);
}

async function findById(id) {
    const [[row]] = await pool.query(
        `SELECT bp.*, u.email, u.name AS user_name, u.phone AS user_phone
           FROM business_profile bp
           LEFT JOIN users u ON u.id = bp.user_id
          WHERE bp.id = ?`,
        [id]
    );
    return row || null;
}

/**
 * 신청 생성. 이미 신청 이력이 있으면 재신청으로 간주해 갱신한다
 * (REJECTED 후 다시 넣는 흐름 — 행을 새로 만들면 uk_bp_user 에 걸린다).
 *
 * @returns {Promise<number>} business_profile.id
 */
async function createApplication({ userId, biz, licenseFile, licenseOriginalName }) {
    const existing = await findByUser(userId);

    if (existing) {
        await pool.query(
            `UPDATE business_profile
                SET company_name = ?, business_number = ?, representative_name = ?,
                    business_type = ?, business_category = ?,
                    company_zipcode = ?, company_address = ?, company_detailed_address = ?,
                    tax_invoice_email = ?, manager_name = ?, manager_phone = ?,
                    license_file = COALESCE(?, license_file),
                    license_original_name = COALESCE(?, license_original_name),
                    status = 'PENDING', reject_reason = NULL, applied_at = NOW()
              WHERE id = ?`,
            [biz.company_name, biz.business_number, biz.representative_name,
                biz.business_type, biz.business_category,
                biz.company_zipcode, biz.company_address, biz.company_detailed_address,
                biz.tax_invoice_email, biz.manager_name, biz.manager_phone,
                licenseFile || null, licenseOriginalName || null, existing.id]
        );
        await autoApproveIfEnabled(existing.id);
        return existing.id;
    }

    const [result] = await pool.query(
        `INSERT INTO business_profile
            (user_id, company_name, business_number, representative_name,
             business_type, business_category, company_zipcode, company_address, company_detailed_address,
             tax_invoice_email, manager_name, manager_phone, license_file, license_original_name, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'PENDING')`,
        [userId, biz.company_name, biz.business_number, biz.representative_name,
            biz.business_type, biz.business_category, biz.company_zipcode, biz.company_address,
            biz.company_detailed_address, biz.tax_invoice_email, biz.manager_name, biz.manager_phone,
            licenseFile || null, licenseOriginalName || null]
    );
    await autoApproveIfEnabled(result.insertId);
    return result.insertId;
}

/**
 * `b2b_auto_approve` 가 켜져 있으면 신청 즉시 승인한다.
 *
 * ⚠️ 등록증을 사람이 확인하지 않고 전용가를 여는 설정이다. 기본값은 꺼짐이며,
 *    관리자 화면(B2B 설정)에도 테스트 용도라고 명시해 뒀다.
 */
async function autoApproveIfEnabled(profileId) {
    if (!b2bContext.getSettings().autoApprove) return;
    await changeStatus(profileId, 'APPROVED', { adminId: null });
}

/*
 * 승인 상태 전이표 (설계 §3.3). 컨트롤러가 UPDATE 를 직접 쓰지 않고 이 표를 거친다.
 * SUSPENDED 는 승인 이후에만 갈 수 있고, 다시 APPROVED 로 되돌릴 수 있다.
 */
const ALLOWED_TRANSITIONS = {
    PENDING: ['UNDER_REVIEW', 'APPROVED', 'REJECTED'],
    UNDER_REVIEW: ['APPROVED', 'REJECTED', 'PENDING'],
    APPROVED: ['SUSPENDED'],
    SUSPENDED: ['APPROVED', 'REJECTED'],
    REJECTED: ['UNDER_REVIEW', 'APPROVED'],
};

function canTransition(from, to) {
    return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

/**
 * 승인 상태 변경. 승인 시 기본 등급을 자동 배정한다.
 *
 * @param {number} id business_profile.id
 * @param {string} to 목표 상태
 * @param {{ adminId:number, reason?:string }} opts
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function changeStatus(id, to, { adminId = null, reason = null } = {}) {
    const profile = await findById(id);
    if (!profile) return { ok: false, error: '대상을 찾을 수 없습니다.' };
    if (profile.status === to) return { ok: true };
    if (!canTransition(profile.status, to)) {
        return { ok: false, error: `${profile.status} → ${to} 는 허용되지 않는 상태 변경입니다.` };
    }

    if (to === 'APPROVED') {
        await pool.query(
            `UPDATE business_profile
                SET status = 'APPROVED', reject_reason = NULL, approved_at = NOW(), approved_by = ?
              WHERE id = ?`,
            [adminId, id]
        );
    } else {
        await pool.query(
            'UPDATE business_profile SET status = ?, reject_reason = ? WHERE id = ?',
            [to, to === 'REJECTED' || to === 'SUSPENDED' ? reason : null, id]
        );
    }
    return { ok: true };
}

/** 관리자 목록 조회. status 필터·검색어(상호/사업자번호) 지원. */
async function listProfiles({ status = null, keyword = null, limit = 50, offset = 0 }) {
    const where = ['1 = 1'];
    const params = [];
    if (status) { where.push('bp.status = ?'); params.push(status); }
    if (keyword) {
        where.push('(bp.company_name LIKE ? OR bp.business_number LIKE ? OR u.email LIKE ?)');
        const like = `%${keyword}%`;
        params.push(like, like, like);
    }
    const [rows] = await pool.query(
        `SELECT bp.*, u.email, u.name AS user_name
           FROM business_profile bp
           LEFT JOIN users u ON u.id = bp.user_id
          WHERE ${where.join(' AND ')}
          ORDER BY FIELD(bp.status,'PENDING','UNDER_REVIEW','APPROVED','SUSPENDED','REJECTED'), bp.applied_at DESC
          LIMIT ? OFFSET ?`,
        [...params, Number(limit), Number(offset)]
    );
    const [[cnt]] = await pool.query(
        `SELECT COUNT(*) AS total FROM business_profile bp
           LEFT JOIN users u ON u.id = bp.user_id
          WHERE ${where.join(' AND ')}`,
        params
    );
    return { rows, total: cnt ? cnt.total : 0 };
}

/** 사이드바 뱃지용 — 심사 대기 건수. */
async function countPending() {
    const [[row]] = await pool.query(
        "SELECT COUNT(*) AS cnt FROM business_profile WHERE status IN ('PENDING','UNDER_REVIEW')"
    );
    return row ? row.cnt : 0;
}

module.exports = {
    isValidBusinessNumber,
    formatBusinessNumber,
    normalizeBusinessInput,
    validateBusiness,
    isDuplicateBusinessNumber,
    findByUser,
    findById,
    createApplication,
    canTransition,
    changeStatus,
    listProfiles,
    countPending,
};
