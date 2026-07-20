/*
 * 외부몰 연동 관리자 (골격) — 공급처/채널 연결 + 사용여부 설정.
 * 설계: docs/사이트개선/도매꾹_온채널_스마트스토어_연동_상세설계.md §21
 * 개발계획: docs/사이트개선/도매꾹_온채널_스마트스토어_연동_개발계획서.md Phase 1
 *
 * 몰 스코프는 req.adminMallId. 자격증명은 몰별 독립(§5.1).
 * 나머지 1차 화면(가져오기·중간테이블·등록·역수집·재고주문)은 플레이스홀더로 두고
 * Phase 2~ 에서 어댑터/서비스를 채운다.
 */

const pool = require('../../config/db');
const cred = require('../../services/sourcing/credential');
const { CHANNEL_META, validateConnection, resolveCredentialChannel } = require('../../services/sourcing/adapters');
const naverTaxonomy = require('../../services/sourcing/naverTaxonomySync');

const BASE = '/admin/sourcing/connections';
const NAVER_BASE = '/admin/sourcing/naver-taxonomy';

function isProviderReq(req) {
    return !!(req.session && req.session.admin && req.session.admin.role === 'super_admin');
}

async function getSetting(mallId) {
    const [rows] = await pool.query(
        'SELECT * FROM mall_channel_setting WHERE mall_id = ? LIMIT 1',
        [mallId]
    );
    return rows[0] || {
        mall_id: mallId,
        sourcing_enabled: 0,
        default_margin_rate: null,
        default_channel_fee_rate: null,
    };
}

// ---------------------------------------------------------------------------
// 공급처/채널 연결
// ---------------------------------------------------------------------------

exports.getConnections = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const [creds, setting] = await Promise.all([cred.listCredentials(mallId), getSetting(mallId)]);
    res.render('admin/sourcing/connections', {
        layout: 'layouts/admin_layout',
        title: '외부몰 연동 · 공급처/채널 연결',
        subtitle: '몰별로 도매꾹·온채널·네이버 스마트스토어 계정을 연결합니다. (몰당 1:1, 서브몰은 각자 설정)',
        channels: CHANNEL_META,
        creds,
        setting,
        isProvider: isProviderReq(req),
        otherMalls: (res.locals.adminMalls || []).filter((m) => Number(m.id) !== Number(mallId)),
        saved: req.query.saved === '1',
        error: req.query.error || '',
        msg: req.query.msg || '',
    });
};

exports.postConnectionSave = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        await cred.saveCredential(mallId, {
            id: Number(req.body.id) || null,
            // 도매매처럼 도매꾹과 키를 공유하는 채널은 원본 채널로 접어 저장한다.
            channel: resolveCredentialChannel(req.body.channel),
            accountLabel: req.body.account_label,
            clientId: req.body.client_id,
            secret: req.body.secret,
            extraJson: req.body.extra_json || null,
        });
        res.redirect(`${BASE}?saved=1`);
    } catch (e) {
        res.redirect(`${BASE}?error=` + encodeURIComponent(e.message));
    }
};

exports.postConnectionDelete = async (req, res) => {
    const mallId = req.adminMallId || 1;
    await cred.deleteCredential(mallId, Number(req.params.id));
    res.redirect(`${BASE}?saved=1`);
};

exports.postConnectionVerify = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = Number(req.params.id);
    try {
        const c = await cred.getCredential(mallId, id);
        if (!c) return res.redirect(`${BASE}?error=` + encodeURIComponent('자격증명을 찾을 수 없습니다.'));
        const result = await validateConnection(c);
        await cred.updateVerifyResult(mallId, id, {
            status: result.ok ? 'ACTIVE' : 'INVALID',
            message: result.message,
        });
        res.redirect(`${BASE}?msg=` + encodeURIComponent(result.message));
    } catch (e) {
        res.redirect(`${BASE}?error=` + encodeURIComponent(e.message));
    }
};

exports.postConnectionCopy = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const fromMallId = Number(req.body.from_mall_id);
    try {
        if (!fromMallId || fromMallId === mallId) throw new Error('복사할 원본 몰을 선택하세요.');
        const n = await cred.copyCredentialsFromMall(fromMallId, mallId);
        res.redirect(`${BASE}?msg=` + encodeURIComponent(`${n}건 복사됨`));
    } catch (e) {
        res.redirect(`${BASE}?error=` + encodeURIComponent(e.message));
    }
};

// 사용여부/기본정책 — super_admin(제공자)만 사용여부를 바꾼다(유료 계약 항목).
exports.postSetting = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const provider = isProviderReq(req);
    const setting = await getSetting(mallId);

    // 제공자가 아니면 사용여부는 기존 값 유지(변경 무시), 정책값만 저장.
    const enabled = provider
        ? (req.body.sourcing_enabled === '1' || req.body.sourcing_enabled === 'on' ? 1 : 0)
        : (setting.sourcing_enabled ? 1 : 0);
    const margin = req.body.default_margin_rate === '' || req.body.default_margin_rate == null
        ? null : Number(req.body.default_margin_rate);
    const fee = req.body.default_channel_fee_rate === '' || req.body.default_channel_fee_rate == null
        ? null : Number(req.body.default_channel_fee_rate);

    await pool.query(
        `INSERT INTO mall_channel_setting (mall_id, sourcing_enabled, default_margin_rate, default_channel_fee_rate)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            sourcing_enabled = VALUES(sourcing_enabled),
            default_margin_rate = VALUES(default_margin_rate),
            default_channel_fee_rate = VALUES(default_channel_fee_rate)`,
        [mallId, enabled, margin, fee]
    );
    res.redirect(`${BASE}?saved=1`);
};

// ---------------------------------------------------------------------------
// 1차 나머지 화면 — 골격 플레이스홀더
// ---------------------------------------------------------------------------

function placeholder(title, subtitle, note) {
    return (req, res) => res.render('admin/sourcing/placeholder', {
        layout: 'layouts/admin_layout',
        title,
        subtitle,
        note,
    });
}

exports.getImport = placeholder(
    '상품 가져오기',
    '도매꾹/온채널에서 상품을 검색·가져와 중간 테이블에 적재합니다.',
    '공급처 어댑터(Phase 2)에서 구현됩니다.'
);
exports.getStaging = placeholder(
    '가져온 상품(중간 테이블)',
    '적재된 상품을 확인하고 선택하여 "상품 등록"합니다. (가져오기 ≠ 상품 등록)',
    'Phase 2~3에서 구현됩니다.'
);
exports.getPublish = placeholder(
    '스마트스토어 등록',
    '편집한 상품을 네이버에 등록하고 검수 상태를 추적합니다.',
    'Phase 3에서 구현됩니다.'
);
exports.getChannelImport = placeholder(
    '스토어 상품 가져오기 (역방향)',
    '스마트스토어에 직접 등록된 상품을 우리 몰로 가져옵니다.',
    'Phase 3에서 구현됩니다.'
);
exports.getSync = placeholder(
    '재고·주문 가져오기',
    '"가져오기" 버튼으로 재고·주문을 그 시점에 조회·동기화합니다. (1차, 배치 없음)',
    'Phase 3~5에서 구현됩니다.'
);

// ---------------------------------------------------------------------------
// 네이버 카테고리 리소스 — 수집 현황 · 수동 수집 · 스케줄
// 설계: docs/사이트개선/네이버_카테고리_리소스_설계.md
//
// ⚠ 여기서 수집한 네이버 카테고리는 "참조 리소스"다. 몰 categories 에 자동
//   반영하지 않는다. 상품 등록 화면에서 검색·선택될 때 taxonomyResolver 가
//   그걸 근거로 몰 카테고리를 생성/매핑한다.
// ---------------------------------------------------------------------------

exports.getNaverTaxonomy = async (req, res) => {
    try {
        const status = await naverTaxonomy.getStatus();
        res.render('admin/sourcing/naver_taxonomy', {
            layout: 'layouts/admin_layout',
            title: '외부몰 연동 · 네이버 카테고리 리소스',
            subtitle: '네이버 스마트스토어 전체 카테고리를 주기 수집해 상품 등록 시 참고합니다. (몰 카테고리에 자동 반영되지 않음)',
            status,
            saved: req.query.saved === '1',
            msg: req.query.msg || '',
            error: req.query.error || '',
        });
    } catch (e) {
        res.status(500).render('admin/sourcing/naver_taxonomy', {
            layout: 'layouts/admin_layout',
            title: '외부몰 연동 · 네이버 카테고리 리소스',
            subtitle: '',
            status: null,
            saved: false,
            msg: '',
            error: e.message,
        });
    }
};

// 수동 수집 — 오래 걸릴 수 있어 백그라운드로 던지고 즉시 리다이렉트한다.
// 진행/결과는 naver_taxonomy_sync_log(화면 하단)에 남는다.
exports.postNaverTaxonomyRefresh = async (req, res) => {
    naverTaxonomy.syncCategories({ triggerBy: 'MANUAL' })
        .then((r) => console.log('[naver-taxonomy] 수동 수집 결과:', JSON.stringify(r)))
        .catch((e) => console.error('[naver-taxonomy] 수동 수집 실패:', e.message));
    res.redirect(`${NAVER_BASE}?msg=` + encodeURIComponent('수집을 시작했습니다. 잠시 후 새로고침해 결과를 확인하세요.'));
};

exports.postNaverTaxonomySchedule = async (req, res) => {
    try {
        const enabled = (req.body.enabled === '1' || req.body.enabled === 'on') ? 1 : 0;
        let hours = Number(req.body.interval_hours);
        if (!Number.isFinite(hours) || hours < 1) hours = 24;
        if (hours > 24 * 30) hours = 24 * 30; // 상한 30일
        await pool.query(
            `INSERT INTO naver_taxonomy_schedule (id, enabled, interval_hours)
             VALUES (1, ?, ?)
             ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), interval_hours = VALUES(interval_hours)`,
            [enabled, hours]
        );
        res.redirect(`${NAVER_BASE}?saved=1`);
    } catch (e) {
        res.redirect(`${NAVER_BASE}?error=` + encodeURIComponent(e.message));
    }
};

// 상품 등록 폼 autocomplete — 활성 리프 카테고리 검색(JSON).
exports.getNaverCategorySearch = async (req, res) => {
    try {
        const rows = await naverTaxonomy.searchLeafCategories(req.query.q, req.query.limit);
        res.json({ success: true, data: rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};

