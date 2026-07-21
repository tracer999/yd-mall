/*
 * 기업회원 승인 관리 (설계 §11.1, §3.3).
 *
 * 진위 확인은 국세청 API 가 아니라 **첨부된 사업자등록증과 입력값 대조**로 한다(§3.2).
 * 그래서 이 화면의 핵심은 "등록증을 열어 보고 승인/반려한다" 는 흐름이다.
 */

const path = require('path');
const fs = require('fs');
const pool = require('../../config/db');
const businessProfileService = require('../../services/b2b/businessProfileService');
const { sendEmail } = require('../../services/emailService');

const LAYOUT = 'layouts/admin_layout';
const PAGE_SIZE = 20;

const STATUS_LABEL = {
    PENDING: '심사 대기',
    UNDER_REVIEW: '심사 중',
    APPROVED: '승인',
    SUSPENDED: '정지',
    REJECTED: '반려',
};

exports.getList = async (req, res, next) => {
    try {
        const status = req.query.status || null;
        const keyword = (req.query.q || '').trim() || null;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);

        const { rows, total } = await businessProfileService.listProfiles({
            status, keyword, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
        });

        // 상태별 건수 — 탭 뱃지에 쓴다.
        const [counts] = await pool.query(
            'SELECT status, COUNT(*) AS cnt FROM business_profile GROUP BY status'
        );
        const countMap = {};
        for (const c of counts) countMap[c.status] = c.cnt;

        res.render('admin/b2b/members', {
            layout: LAYOUT,
            title: '기업회원 승인',
            subtitle: '사업자 회원 신청을 검토하고 승인·반려합니다. 사업자등록증을 열어 입력값과 대조하세요.',
            rows,
            total,
            page,
            pageSize: PAGE_SIZE,
            status,
            keyword: keyword || '',
            countMap,
            STATUS_LABEL,
            formatBusinessNumber: businessProfileService.formatBusinessNumber,
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (err) {
        next(err);
    }
};

exports.getDetail = async (req, res, next) => {
    try {
        const profile = await businessProfileService.findById(req.params.id);
        if (!profile) return res.status(404).send('대상을 찾을 수 없습니다.');

        const [tiers] = await pool.query(
            'SELECT id, tier_code, tier_name FROM b2b_tier WHERE is_active = 1 ORDER BY rank_order ASC'
        );

        res.render('admin/b2b/member_detail', {
            layout: LAYOUT,
            title: '기업회원 상세',
            subtitle: profile.company_name,
            profile,
            tiers,
            STATUS_LABEL,
            formatBusinessNumber: businessProfileService.formatBusinessNumber,
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (err) {
        next(err);
    }
};

/**
 * 사업자등록증 스트리밍.
 *
 * ⚠️ 파일이 `storage/` (public 밖)에 있는 이유가 여기다 — 관리자 인증을 통과한 이 라우트로만
 *    내보낸다. 경로는 DB 에 저장된 값만 쓰고, storage 밖으로 벗어나면 거부한다(경로 조작 차단).
 */
exports.getLicense = async (req, res, next) => {
    try {
        const profile = await businessProfileService.findById(req.params.id);
        if (!profile || !profile.license_file) return res.status(404).send('첨부 파일이 없습니다.');

        const root = path.resolve('storage', 'business');
        const abs = path.resolve(profile.license_file);
        if (!abs.startsWith(root + path.sep)) {
            console.warn('[b2b] 허용되지 않은 첨부 경로 접근 차단:', profile.license_file);
            return res.status(403).send('접근할 수 없는 파일입니다.');
        }
        if (!fs.existsSync(abs)) return res.status(404).send('파일을 찾을 수 없습니다.');

        const ext = path.extname(abs).toLowerCase();
        const mime = ext === '.pdf' ? 'application/pdf'
            : ext === '.png' ? 'image/png'
                : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : 'application/octet-stream';

        res.setHeader('Content-Type', mime);
        // 브라우저에서 바로 보되, 저장 시 원본 파일명을 쓴다.
        const name = encodeURIComponent(profile.license_original_name || path.basename(abs));
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${name}`);
        res.setHeader('Cache-Control', 'private, no-store');
        fs.createReadStream(abs).pipe(res);
    } catch (err) {
        next(err);
    }
};

/** 승인·반려·정지. 전이 판정은 서비스의 전이표가 한다. */
exports.postStatus = async (req, res, next) => {
    const { id } = req.params;
    const { status, reason } = req.body;
    try {
        const adminId = req.session.admin ? req.session.admin.id : null;
        const result = await businessProfileService.changeStatus(id, status, { adminId, reason: (reason || '').trim() || null });
        if (!result.ok) {
            return res.redirect(`/admin/b2b/members/${id}?error=${encodeURIComponent(result.error)}`);
        }

        await notifyStatusChange(id, status).catch((e) => console.warn('[b2b] 상태 안내 메일 실패:', e.message));
        return res.redirect(`/admin/b2b/members/${id}?message=${encodeURIComponent(STATUS_LABEL[status] + ' 처리했습니다.')}`);
    } catch (err) {
        next(err);
    }
};

/** 등급·계약기간·담당 영업·메모 수정. 상태는 여기서 바꾸지 않는다. */
exports.postUpdate = async (req, res, next) => {
    const { id } = req.params;
    const { tier_id, contract_valid_from, contract_valid_to, admin_note } = req.body;
    try {
        await pool.query(
            `UPDATE business_profile
                SET tier_id = ?, contract_valid_from = ?, contract_valid_to = ?, admin_note = ?
              WHERE id = ?`,
            [
                tier_id ? Number(tier_id) : null,
                contract_valid_from || null,
                contract_valid_to || null,
                (admin_note || '').trim() || null,
                id,
            ]
        );
        return res.redirect(`/admin/b2b/members/${id}?message=${encodeURIComponent('저장했습니다.')}`);
    } catch (err) {
        next(err);
    }
};

/** 승인·반려 결과를 신청자에게 알린다. 메일 실패가 상태 변경을 되돌리지는 않는다. */
async function notifyStatusChange(id, status) {
    if (!['APPROVED', 'REJECTED', 'SUSPENDED'].includes(status)) return;
    const profile = await businessProfileService.findById(id);
    if (!profile || !profile.email) return;

    const subject = {
        APPROVED: '[사업자 회원] 승인 완료 안내',
        REJECTED: '[사업자 회원] 신청 반려 안내',
        SUSPENDED: '[사업자 회원] 이용 정지 안내',
    }[status];

    const body = {
        APPROVED: `${profile.company_name} 님, 사업자 회원 승인이 완료되었습니다.\n로그인하시면 기업 전용가로 주문하실 수 있습니다.`,
        REJECTED: `${profile.company_name} 님, 사업자 회원 신청이 반려되었습니다.\n사유: ${profile.reject_reason || '-'}\n내용을 확인하신 뒤 다시 신청해 주세요.`,
        SUSPENDED: `${profile.company_name} 님, 기업 거래가 일시 중지되었습니다.\n사유: ${profile.reject_reason || '-'}\n담당자에게 문의해 주세요.`,
    }[status];

    await sendEmail({ to: profile.email, subject, text: body });
}
