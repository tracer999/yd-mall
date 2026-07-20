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
const importService = require('../../services/sourcing/importService');
const { sanitize } = require('../../services/display/htmlSanitizer');
const domeggookCategories = require('../../services/sourcing/supplier/domeggook/categories');
const publishService = require('../../services/sourcing/publishService');

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
// 상품 가져오기 — 공급처 검색 → 선택 → 중간 테이블 적재 (Phase 2)
//
// ⚠ "가져오기 ≠ 상품 등록"이다. 여기서는 공급처 원본을 supplier_product 에 적재만 한다.
//   빌더 상품 변환·스마트스토어 등록은 Phase 3.
// ---------------------------------------------------------------------------

const IMPORT_BASE = '/admin/sourcing/import';
const STAGING_BASE = '/admin/sourcing/staging';

function actorOf(req) {
    return (req.session && req.session.admin && req.session.admin.username) || null;
}

// 검색은 GET 쿼리로 받는다 — 뒤로가기·새로고침·URL 공유가 그대로 동작해야 하므로.
exports.getImport = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const supplier = ['DOMEGGOOK', 'DOMEME'].includes(req.query.supplier) ? req.query.supplier : 'DOMEGGOOK';
    const keyword = (req.query.q || '').trim();
    const categoryCode = (req.query.cat || '').trim();
    const page = Math.max(Number(req.query.page) || 1, 1);
    const size = Math.min(Math.max(Number(req.query.size) || 20, 5), 100);

    // 검색 폼을 눌렀는지(제출) vs 메뉴로 처음 들어왔는지를 구분한다.
    // 빈 검색어로 제출했을 때 초기 화면을 그대로 다시 그리면 "아무 반응 없음"으로 보인다.
    const submitted = Object.prototype.hasOwnProperty.call(req.query, 'q')
        || Object.prototype.hasOwnProperty.call(req.query, 'cat');
    const searched = !!(keyword || categoryCode);

    // 검색 결과는 외부 실시간 데이터다. 조건이 같아 본문이 동일하면 브라우저가 304 로
    // 캐시를 재사용해 화면이 멈춘 것처럼 보이므로 캐시를 끈다.
    res.set('Cache-Control', 'no-store');

    const view = {
        layout: 'layouts/admin_layout',
        title: '외부몰 연동 · 상품 가져오기',
        subtitle: '도매꾹·도매매에서 상품을 검색해 선택한 건만 중간 테이블로 가져옵니다. (가져오기 ≠ 상품 등록)',
        supplier, keyword, categoryCode, page, size, searched,
        result: null,
        maxBatch: importService.MAX_IMPORT_BATCH,
        msg: req.query.msg || '',
        error: req.query.error || '',
    };

    if (!searched) {
        // 빈 조건으로 제출한 경우에만 이유를 알려준다(첫 진입은 안내 문구만 보여준다).
        if (submitted) view.error = '검색어 또는 카테고리 코드를 입력한 뒤 [검색]을 눌러주세요.';
        return res.render('admin/sourcing/import', view);
    }

    try {
        view.result = await importService.searchSupplier(mallId, {
            supplier, keyword, categoryCode, page, size,
        });
        await importService.logImport(mallId, {
            supplier, action: 'SEARCH', keyword, categoryCode,
            requested: view.result.items.length, success: view.result.items.length,
            actor: actorOf(req),
        });
    } catch (e) {
        view.error = e.message;
    }
    res.render('admin/sourcing/import', view);
};

// 선택 상품 가져오기 — 완료 후 결과 요약을 들고 '가져온 상품' 으로 보낸다.
exports.postImportRun = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const supplier = ['DOMEGGOOK', 'DOMEME'].includes(req.body.supplier) ? req.body.supplier : 'DOMEGGOOK';
    // 체크박스는 1건일 때 문자열, 여러 건일 때 배열로 온다.
    const raw = req.body.item_no;
    const itemNos = Array.isArray(raw) ? raw : (raw ? [raw] : []);

    // 검색 조건을 유지해 돌아갈 수 있도록 쿼리를 보존한다.
    const back = `${IMPORT_BASE}?supplier=${encodeURIComponent(supplier)}`
        + `&q=${encodeURIComponent(req.body.q || '')}`
        + `&cat=${encodeURIComponent(req.body.cat || '')}`
        + `&page=${encodeURIComponent(req.body.page || 1)}`;

    try {
        const r = await importService.importItems(mallId, { supplier, itemNos, actor: actorOf(req) });

        let msg = `${r.success}건 가져오기 완료`;
        if (r.failed) msg += ` · ${r.failed}건 실패`;
        if (r.truncated) msg += ` (한 번에 최대 ${r.limit}건까지만 처리됩니다 — 나머지는 다시 선택해 주세요)`;

        const blocked = r.results.filter((x) => x.ok && x.resaleAllowed === 0).length;
        if (blocked) msg += ` · 재판매 금지 ${blocked}건 포함(등록 전 확인 필요)`;

        res.redirect(`${STAGING_BASE}?msg=` + encodeURIComponent(msg));
    } catch (e) {
        res.redirect(`${back}&error=` + encodeURIComponent(e.message));
    }
};

// 도매꾹 카테고리 트리(JSON) — 가져오기 화면의 단계별 선택기가 호출한다.
// 사용자는 카테고리 코드를 알 수 없으므로 이름으로 고르게 하고 코드는 내부에서 채운다.
exports.getDomeggookCategories = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const c = await importService.resolveCredential(mallId, 'DOMEGGOOK');
        const tree = await domeggookCategories.getTree(c, req.query.refresh === '1');
        // 자주 바뀌지 않는 정적 리소스 성격이라 브라우저 캐시를 허용한다.
        res.set('Cache-Control', 'private, max-age=3600');
        res.json({ success: true, tree });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};

// ---------------------------------------------------------------------------
// 가져온 상품 (중간 테이블)
// ---------------------------------------------------------------------------

exports.getStaging = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const filters = {
            supplier: ['DOMEGGOOK', 'DOMEME', 'ONCHANNEL'].includes(req.query.supplier) ? req.query.supplier : '',
            status: ['DETAILED', 'LISTED', 'FAILED'].includes(req.query.status) ? req.query.status : '',
            q: (req.query.q || '').trim(),
            published: ['Y', 'N'].includes(req.query.published) ? req.query.published : '',
            page: req.query.page,
            size: req.query.size,
        };
        const [list, stats, categoryTree, defaultMargin] = await Promise.all([
            importService.listStaging(mallId, filters),
            importService.getStats(mallId),
            publishService.getMallCategoryTree(mallId),
            publishService.getDefaultMarginRate(mallId),
        ]);
        res.render('admin/sourcing/staging', {
            layout: 'layouts/admin_layout',
            title: '외부몰 연동 · 가져온 상품',
            subtitle: '공급처에서 가져온 원본 스냅샷입니다. 확인·재수집 후 우리 몰 상품으로 등록합니다.',
            list, stats, filters, categoryTree, defaultMargin,
            supplierLabel: importService.SUPPLIER_LABEL,
            msg: req.query.msg || '',
            error: req.query.error || '',
        });
    } catch (e) {
        res.status(500).render('admin/sourcing/placeholder', {
            layout: 'layouts/admin_layout',
            title: '외부몰 연동 · 가져온 상품',
            subtitle: '',
            note: '목록을 불러오지 못했습니다: ' + e.message,
        });
    }
};

exports.getStagingDetail = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const data = await importService.getStaging(mallId, Number(req.params.id));
        if (!data) return res.redirect(`${STAGING_BASE}?error=` + encodeURIComponent('상품을 찾을 수 없습니다.'));

        // 공급처 상세 HTML 은 외부에서 온 신뢰할 수 없는 마크업이다.
        // 관리자 화면이라도 그대로 렌더하면 저장형 XSS 가 되므로 반드시 새니타이즈한다.
        const detailHtmlSafe = sanitize(data.product.detail_html || '');
        const noticeHtmlSafe = sanitize(data.product.notice_html || '');

        // images_json 은 드라이버/버전에 따라 문자열로 올 수 있어 방어적으로 파싱한다.
        let images = data.product.images_json || [];
        if (typeof images === 'string') {
            try { images = JSON.parse(images); } catch (e) { images = []; }
        }
        if (!Array.isArray(images)) images = [];

        const [categoryTree, defaultMargin] = await Promise.all([
            publishService.getMallCategoryTree(mallId),
            publishService.getDefaultMarginRate(mallId),
        ]);

        res.render('admin/sourcing/staging_detail', {
            layout: 'layouts/admin_layout',
            title: '가져온 상품 상세',
            subtitle: data.product.title,
            product: data.product,
            variants: data.variants,
            detailHtmlSafe, noticeHtmlSafe, images,
            categoryTree, defaultMargin,
            supplierLabel: importService.SUPPLIER_LABEL,
            msg: req.query.msg || '',
            error: req.query.error || '',
        });
    } catch (e) {
        res.redirect(`${STAGING_BASE}?error=` + encodeURIComponent(e.message));
    }
};

// 재수집 — 공급처의 현재 가격·재고·옵션으로 스냅샷을 갱신한다.
exports.postStagingRefresh = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = Number(req.params.id);
    try {
        await importService.refreshItem(mallId, id, actorOf(req));
        res.redirect(`${STAGING_BASE}/${id}?msg=` + encodeURIComponent('공급처에서 다시 가져왔습니다.'));
    } catch (e) {
        res.redirect(`${STAGING_BASE}/${id}?error=` + encodeURIComponent(e.message));
    }
};

// ---------------------------------------------------------------------------
// 우리 몰 상품으로 등록 (스마트스토어 등록 아님)
// supplier_product → products/product_sku/product_option*/product_images
// ---------------------------------------------------------------------------

exports.postPublishToMall = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const raw = req.body.id || req.params.id;
    const ids = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    // 상세 화면에서 눌렀으면 그 화면으로, 목록에서 눌렀으면 목록으로 돌아간다.
    const back = req.params.id ? `${STAGING_BASE}/${req.params.id}` : STAGING_BASE;

    try {
        const r = await publishService.publishMany(mallId, ids, {
            categoryId: req.body.category_id,
            // 비어 있으면 publishService 가 mall_channel_setting.default_margin_rate 를 쓴다.
            marginRate: req.body.margin_rate === '' ? null : req.body.margin_rate,
            status: req.body.status,
            visibility: req.body.visibility,
            actor: actorOf(req),
        });

        if (!r.success) {
            const first = r.results.find((x) => !x.ok);
            return res.redirect(`${back}?error=` + encodeURIComponent(first ? first.error : '등록에 실패했습니다.'));
        }

        let msg = `${r.success}건을 우리 몰 상품으로 등록했습니다.`;
        if (r.skipped) msg += ` (이미 등록된 ${r.skipped}건은 건너뛰었습니다)`;
        if (r.failed) msg += ` (${r.failed}건 실패)`;
        const imgFailed = r.results.reduce((a, x) => a + (x.imageFailed || 0), 0);
        if (imgFailed) msg += ` 이미지 ${imgFailed}장은 가져오지 못했습니다.`;
        msg += ' 판매 상태는 안전을 위해 기본 "판매중지"이니 상품 관리에서 확인 후 켜주세요.';

        res.redirect(`${back}?msg=` + encodeURIComponent(msg));
    } catch (e) {
        res.redirect(`${back}?error=` + encodeURIComponent(e.message));
    }
};

exports.postStagingDelete = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const raw = req.body.id || req.params.id;
    const ids = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    try {
        const n = await importService.deleteStaging(mallId, ids);
        res.redirect(`${STAGING_BASE}?msg=` + encodeURIComponent(`${n}건 삭제했습니다. (공급처 원본에는 영향 없음)`));
    } catch (e) {
        res.redirect(`${STAGING_BASE}?error=` + encodeURIComponent(e.message));
    }
};

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

