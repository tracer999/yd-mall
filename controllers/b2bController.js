/*
 * 사업자 회원 — 전환 신청 · 신청 상태 (설계 §3).
 *
 * 이미 가입한 일반회원이 사업자로 전환하는 경로다. 신규 가입 경로(/auth/signup?type=biz)와
 * **같은 검증·같은 화면 블록**을 쓴다(services/b2b/businessProfileService, views/auth/_business_fields).
 */

const businessProfileService = require('../services/b2b/businessProfileService');
const b2bContext = require('../middleware/b2bContext');

const LAYOUT = 'layouts/main_layout';

/** 상태별 안내 문구. 화면이 조건을 재조립하지 않게 서버가 정한다. */
const STATE_LABEL = {
    PENDING: { badge: '심사 대기', tone: 'amber', desc: '접수되었습니다. 사업자등록증을 확인한 뒤 승인해 드립니다.' },
    UNDER_REVIEW: { badge: '심사 중', tone: 'amber', desc: '담당자가 확인하고 있습니다.' },
    APPROVED: { badge: '승인 완료', tone: 'green', desc: '기업 전용가로 주문하실 수 있습니다.' },
    REJECTED: { badge: '반려', tone: 'red', desc: '아래 사유를 확인하고 다시 신청해 주세요.' },
    SUSPENDED: { badge: '이용 정지', tone: 'red', desc: '기업 거래가 일시 중지되었습니다. 담당자에게 문의해 주세요.' },
    EXPIRED: { badge: '계약 만료', tone: 'gray', desc: '계약 기간이 끝났습니다. 담당자에게 문의해 주세요.' },
};

/** 신청 폼. 이미 승인된 사업자는 상태 화면으로 보낸다. */
exports.getApply = async (req, res, next) => {
    if (!req.user) return res.redirect('/auth/login?redirect=/b2b/apply');
    try {
        const profile = await businessProfileService.findByUser(req.user.id);
        if (profile && ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'SUSPENDED'].includes(profile.status)) {
            return res.redirect('/b2b/status');
        }

        // 반려 후 재신청이면 직전 입력값을 채워 준다 — 처음부터 다시 적게 하지 않는다.
        return res.render('user/b2b/apply', {
            layout: LAYOUT,
            title: '사업자 회원 신청',
            bizValues: profile ? {
                company_name: profile.company_name,
                business_number: profile.business_number,
                representative_name: profile.representative_name,
                business_type: profile.business_type,
                business_category: profile.business_category,
                company_zipcode: profile.company_zipcode,
                company_address: profile.company_address,
                company_detailed_address: profile.company_detailed_address,
                tax_invoice_email: profile.tax_invoice_email,
                manager_name: profile.manager_name,
                manager_phone: profile.manager_phone,
            } : { tax_invoice_email: req.user.email || '', manager_name: req.user.name || '', manager_phone: req.user.phone || '' },
            bizErrors: {},
            // 재신청이고 이미 파일이 있으면 다시 올리지 않아도 된다.
            requireLicense: !(profile && profile.license_file),
            rejectReason: profile && profile.status === 'REJECTED' ? profile.reject_reason : null,
            error: req.query.error === 'save' ? '신청 저장에 실패했습니다. 다시 시도해 주세요.' : null,
        });
    } catch (err) {
        return next(err);
    }
};

exports.postApply = async (req, res, next) => {
    if (!req.user) return res.redirect('/auth/login');
    try {
        const existing = await businessProfileService.findByUser(req.user.id);
        if (existing && ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'SUSPENDED'].includes(existing.status)) {
            return res.redirect('/b2b/status');
        }

        const biz = businessProfileService.normalizeBusinessInput(req.body);
        const requireLicense = !(existing && existing.license_file);
        const bizErrors = businessProfileService.validateBusiness(biz, {
            hasLicenseFile: !!req.file || !requireLicense,
            requireLicense,
        });

        if (!bizErrors.business_number
            && await businessProfileService.isDuplicateBusinessNumber(biz.business_number, existing ? existing.id : null)) {
            bizErrors.business_number = '이미 등록된 사업자등록번호입니다.';
        }

        if (Object.keys(bizErrors).length > 0) {
            return res.status(400).render('user/b2b/apply', {
                layout: LAYOUT,
                title: '사업자 회원 신청',
                bizValues: biz,
                bizErrors,
                requireLicense,
                rejectReason: null,
                error: null,
            });
        }

        await businessProfileService.createApplication({
            userId: req.user.id,
            biz,
            licenseFile: req.file ? req.file.path : null,
            licenseOriginalName: req.file ? req.file.originalname : null,
        });
        return res.redirect('/b2b/status');
    } catch (err) {
        return next(err);
    }
};

/*
 * 구매 자격 전환(postMode)은 제거했다.
 *
 * 기업회원과 일반회원은 로그인 자체가 상호 배타가 되어(routes/auth.js resolveLoginMode)
 * 승인 사업자가 개인 자격으로 들어올 방법이 없다. 따라서 도중에 바꿀 자격도 없다.
 * 자격 판정은 middleware/b2bContext 한 곳이 전부다.
 */

/** 신청 상태 화면. 마이페이지의 "사업자 정보" 진입점이기도 하다. */
exports.getStatus = async (req, res, next) => {
    if (!req.user) return res.redirect('/auth/login?redirect=/b2b/status');
    try {
        const profile = await businessProfileService.findByUser(req.user.id);
        if (!profile) return res.redirect('/b2b/apply');

        // 계약 만료는 business_profile.status 에 없다 — 컨텍스트가 판정한 state 를 쓴다.
        const state = req.b2b && req.b2b.state !== 'NONE' ? req.b2b.state : profile.status;

        return res.render('user/b2b/status', {
            layout: LAYOUT,
            title: '사업자 회원 정보',
            profile,
            state,
            label: STATE_LABEL[state] || STATE_LABEL.PENDING,
            settings: b2bContext.getSettings(),
            formatBusinessNumber: businessProfileService.formatBusinessNumber,
        });
    } catch (err) {
        return next(err);
    }
};
