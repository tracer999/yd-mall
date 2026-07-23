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
const channelImport = require('../../services/sourcing/channel/naverChannelImport');
const stockSync = require('../../services/sourcing/channel/naverStockSync');
const { sellableStockSql } = require('../../services/catalog/sellableStock');

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
            // extraJson 은 더 이상 화면에서 받지 않는다(§33 — 운영자에게 JSON 을 적게 하지 않는다).
            // 소비처도 없어 전 행 NULL 이었다. 필요해지면 이름 있는 필드로 받아 서버가 조립한다.
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
// 스토어 상품 가져오기 (역방향) — **네이버 → 우리 몰**
//
// ⚠ /admin/sourcing/import(공급처 → 우리 몰)·/publish(우리 몰 → 네이버)와 방향이 다르다.
// ---------------------------------------------------------------------------

const CHANNEL_IMPORT_BASE = '/admin/sourcing/channel-import';
const SYNC_BASE = '/admin/sourcing/sync';

// 조회는 GET 쿼리로 받는다 — 뒤로가기·새로고침이 그대로 동작해야 한다(getImport 와 같은 규칙).
exports.getChannelImport = async (req, res) => {
    const mallId = req.adminMallId || 1;
    /*
     * 네이버 목록 조회는 **상품명 검색을 제공하지 않는다**(실호출 확인 — naverChannelImport
     * §buildSearchRequest). 그래서 서버로 보내는 조건은 판매자관리코드·채널상품번호뿐이고,
     * 상품명은 화면에서 조회 결과를 걸러 보는 방식으로 처리한다.
     */
    const code = (req.query.code || '').trim();
    const page = Math.max(Number(req.query.page) || 1, 1);
    const size = channelImport.PAGE_SIZES.includes(Number(req.query.size)) ? Number(req.query.size) : 50;

    // 메뉴로 처음 들어왔을 때 자동으로 외부 API 를 부르지 않는다(호출 한도 보호).
    const fetched = req.query.fetch === '1';

    // 외부 실시간 데이터라 304 로 화면이 멈춘 것처럼 보이면 안 된다.
    res.set('Cache-Control', 'no-store');

    const view = {
        layout: 'layouts/admin_layout',
        title: '외부몰 연동 · 스토어 상품 가져오기 (역방향)',
        subtitle: '스마트스토어에 직접 등록해 둔 상품을 우리 몰 상품으로 가져옵니다. (네이버 → 우리 몰)',
        code, page, size, fetched,
        pageSizes: channelImport.PAGE_SIZES,
        importLimit: channelImport.IMPORT_LIMIT,
        result: null,
        categoryTree: [],
        msg: req.query.msg || '',
        error: req.query.error || '',
    };

    try {
        // 가져오기 시 자동 매핑에 실패한 상품이 들어갈 기본 카테고리를 고를 수 있게 한다.
        view.categoryTree = await publishService.getMallCategoryTree(mallId);
    } catch (e) {
        // 카테고리 트리는 부가 정보다 — 실패해도 조회 화면은 떠야 한다.
        console.error('[sourcing/channel-import] 카테고리 트리 로드 실패:', e.message);
    }

    if (fetched) {
        try {
            view.result = await channelImport.searchStoreProducts(mallId, {
                code, page, size, actor: actorOf(req),
            });
        } catch (e) {
            view.error = e.message;
        }
    }

    res.render('admin/sourcing/channel_import', view);
};

// 선택 상품을 우리 몰로 가져온다.
exports.postChannelImportRun = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const raw = req.body.origin_no;
    const originNos = Array.isArray(raw) ? raw : (raw ? [raw] : []);

    const back = `${CHANNEL_IMPORT_BASE}?fetch=1`
        + `&code=${encodeURIComponent(req.body.code || '')}`
        + `&page=${encodeURIComponent(req.body.page || 1)}`
        + `&size=${encodeURIComponent(req.body.size || 50)}`;

    try {
        const r = await channelImport.importMany(mallId, originNos, {
            actor: actorOf(req),
            fallbackCategoryId: Number(req.body.fallback_category_id) || null,
            status: req.body.status,
            visibility: req.body.visibility,
        });

        let msg = `${r.success}건 가져오기 완료`;
        if (r.skipped) msg += ` · ${r.skipped}건 건너뜀(이미 연결됨)`;
        if (r.failed) msg += ` · ${r.failed}건 실패`;
        if (r.overLimit) msg += ` (한 번에 최대 ${r.limit}건까지만 처리됩니다 — 나머지는 다시 선택해 주세요)`;

        const uncategorized = r.results.filter((x) => x.ok && !x.categoryMatched).length;
        if (uncategorized) msg += ` · 카테고리 자동 매핑 실패 ${uncategorized}건(상품 수정에서 지정하세요)`;

        const firstError = r.results.find((x) => !x.ok && !x.skipped);
        if (firstError) msg += ` · 첫 실패 사유: ${firstError.error}`;

        res.redirect(`${back}&msg=` + encodeURIComponent(msg));
    } catch (e) {
        res.redirect(`${back}&error=` + encodeURIComponent(e.message));
    }
};

// ---------------------------------------------------------------------------
// 재고 연동 — **우리 몰 → 네이버**(전송) + 네이버 현재 재고 조회(대사, 읽기 전용)
//
// 재고의 정본은 우리 몰(services/catalog/sellableStock.js)이다. 네이버 값을
// 우리 DB 에 덮어쓰지 않는다 — 그러면 결제·주문 재고가 조용히 어긋난다.
// ---------------------------------------------------------------------------

exports.getSync = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const q = (req.query.q || '').trim();
    const onlyDiff = req.query.diff === '1';

    res.set('Cache-Control', 'no-store');

    const view = {
        layout: 'layouts/admin_layout',
        title: '외부몰 연동 · 재고 연동',
        subtitle: '우리 몰의 판매가능재고를 스마트스토어로 전송합니다. (우리 몰 → 네이버 · 수동 실행)',
        q, onlyDiff,
        rows: [],
        pushLimit: stockSync.PUSH_LIMIT,
        check: null,
        msg: req.query.msg || '',
        error: req.query.error || '',
    };

    try {
        view.rows = await stockSync.listTargets(mallId, { q, onlyDiff });
    } catch (e) {
        view.error = e.message;
    }

    // 대사 조회는 명시적으로 요청했을 때만 외부 API 를 부른다.
    const checkId = Number(req.query.check) || 0;
    if (checkId) {
        try {
            view.check = await stockSync.fetchChannelStock(mallId, checkId, { actor: actorOf(req) });
        } catch (e) {
            view.error = e.message;
        }
    }

    res.render('admin/sourcing/sync', view);
};

exports.postStockPush = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const raw = req.body.product_id;
    const ids = Array.isArray(raw) ? raw : (raw ? [raw] : []);

    const back = `${SYNC_BASE}?q=${encodeURIComponent(req.body.q || '')}`
        + (req.body.diff === '1' ? '&diff=1' : '');

    try {
        const r = await stockSync.pushMany(mallId, ids, {
            actor: actorOf(req),
            // 변경이 없어도 보낸다 — 대사 후 강제 재전송용.
            force: req.body.force === '1',
        });

        let msg = `${r.success}건 전송 완료`;
        if (r.skipped) msg += ` · ${r.skipped}건 건너뜀(변경 없음)`;
        if (r.failed) msg += ` · ${r.failed}건 실패`;
        if (r.overLimit) msg += ` (한 번에 최대 ${r.limit}건)`;

        const partial = r.results.filter((x) => x.ok && x.unmappedSellable).length;
        if (partial) msg += ` · 옵션 매핑이 없어 일부 SKU 를 못 보낸 상품 ${partial}건`;

        const firstError = r.results.find((x) => !x.ok && !x.skipped);
        if (firstError) msg += ` · 첫 실패 사유: ${firstError.error}`;

        res.redirect(`${back}&msg=` + encodeURIComponent(msg));
    } catch (e) {
        res.redirect(`${back}&error=` + encodeURIComponent(e.message));
    }
};

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
        msg += ' 안전을 위해 기본 "판매중지 · 비노출"로 등록했으니 상품 관리에서 확인 후 켜주세요.';

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
// 네이버 리소스 관리 — 수집 현황 · 수동 수집 · 스케줄 · 수집된 리소스 브라우징
// 설계: docs/사이트개선/네이버_카테고리_리소스_설계.md
//
// 수집한 네이버 카테고리/브랜드 리소스를 보는 곳은 여기 하나다.
// (구 "몰 관리 → 리소스 관리"(/admin/resources)는 이 화면으로 통합·제거되었다)
//
// ⚠ 여기서 수집한 네이버 카테고리는 "참조 리소스"다. 몰 categories 에 자동
//   반영하지 않는다. 상품 등록 화면에서 검색·선택될 때 taxonomyResolver 가
//   그걸 근거로 몰 카테고리를 생성/매핑한다.
// ---------------------------------------------------------------------------

const NAVER_TABS = ['category', 'brand', 'origin', 'notice'];
const NAVER_PAGE_TITLE = '외부몰 연동 · 네이버 리소스 관리';

exports.getNaverTaxonomy = async (req, res) => {
    // 목록 필터는 화면 상태일 뿐이라 잘못된 값이 와도 기본값으로 흡수한다.
    const tab = NAVER_TABS.includes(req.query.tab) ? req.query.tab : 'category';
    const q = String(req.query.q || '').trim();
    const page = Number(req.query.page) || 1;
    // 체크박스는 "체크=필터 적용". 최초 진입(파라미터 없음)은 활성만 보여준다.
    const hasFilterParams = Object.prototype.hasOwnProperty.call(req.query, 'tab');
    const activeOnly = hasFilterParams ? req.query.active === '1' : true;
    const leafOnly = req.query.leaf === '1';

    try {
        const [status, noticeTypes] = await Promise.all([
            naverTaxonomy.getStatus(),
            naverNotice.listTypes(),
        ]);

        let list;
        if (tab === 'brand') {
            list = await naverTaxonomy.listBrands({ q, activeOnly, page });
        } else if (tab === 'origin') {
            // 원산지는 535건이라 페이징 없이 검색 결과만 보여 준다(최대 50건).
            list = { rows: await naverTaxonomy.searchOriginAreas(q, 50), total: null, page: 1, size: 50, totalPages: 1 };
        } else if (tab === 'notice') {
            const filtered = q
                ? noticeTypes.filter((t) => t.label.includes(q) || t.notice_type.includes(q.toUpperCase()))
                : noticeTypes;
            list = { rows: filtered, total: filtered.length, page: 1, size: filtered.length, totalPages: 1 };
        } else {
            list = await naverTaxonomy.listCategories({ q, activeOnly, leafOnly, page });
        }

        // 리프별 고시 유형 배정 현황 — 카테고리 탭 상단에 띄운다.
        status.noticeMapping = await naverNoticeMapping.stats();

        // 리소스 4종을 한 자리에서 보여 준다 — 어떤 게 비었는지 즉시 드러나야 한다.
        status.noticeCounts = {
            total: noticeTypes.length,
            fields: noticeTypes.reduce((n, t) => n + t.fields.length, 0),
            fromNaver: noticeTypes.filter((t) => t.source === 'NAVER').length,
        };

        res.render('admin/sourcing/naver_taxonomy', {
            layout: 'layouts/admin_layout',
            title: NAVER_PAGE_TITLE,
            subtitle: '네이버 스마트스토어의 카테고리·브랜드를 주기 수집해 상품 등록 시 참고합니다. (몰 카테고리에 자동 반영되지 않음)',
            status,
            tab,
            list,
            noticeTypes,
            filters: { q, activeOnly, leafOnly },
            saved: req.query.saved === '1',
            msg: req.query.msg || '',
            error: req.query.error || '',
        });
    } catch (e) {
        console.error('[naver-taxonomy] getNaverTaxonomy:', e.message);
        res.status(500).render('admin/sourcing/naver_taxonomy', {
            layout: 'layouts/admin_layout',
            title: NAVER_PAGE_TITLE,
            subtitle: '',
            status: null,
            tab,
            list: null,
            noticeTypes: [],
            filters: { q: '', activeOnly: true, leafOnly: false },
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

/**
 * 원산지 코드 수집. 535건 1회 호출이라 카테고리(5,815건)보다 훨씬 가볍지만,
 * 같은 로그·비활성 규약을 쓰므로 동작 방식은 동일하다.
 */
exports.postNaverOriginAreaRefresh = async (req, res) => {
    naverTaxonomy.syncOriginAreas({ triggerBy: 'MANUAL' })
        .then((r) => console.log('[naver-origin-area] 수동 수집 결과:', JSON.stringify(r)))
        .catch((e) => console.error('[naver-origin-area] 수동 수집 실패:', e.message));
    res.redirect(`${NAVER_BASE}?tab=origin&msg=` + encodeURIComponent('원산지 수집을 시작했습니다. 잠시 후 새로고침해 결과를 확인하세요.'));
};

/**
 * 리프 카테고리에 고시 유형을 규칙으로 일괄 배정.
 * 네이버가 카테고리별 유형을 알려주지 않아 우리가 경로 규칙으로 만든다(§6.5).
 * 사람이 지정한 것(MANUAL)은 덮지 않는다.
 */
exports.postNaverNoticeRules = async (req, res) => {
    try {
        const r = await naverNoticeMapping.applyRules();
        const parts = [`리프 ${r.leafTotal}건 중 ${r.matched}건 배정`];
        if (r.unmatched) parts.push(`규칙 없음 ${r.unmatched}건`);
        if (r.manualKept) parts.push(`직접 지정 ${r.manualKept}건 유지`);
        res.redirect(`${NAVER_BASE}?tab=category&msg=` + encodeURIComponent(parts.join(' / ')));
    } catch (e) {
        res.redirect(`${NAVER_BASE}?tab=category&error=` + encodeURIComponent(e.message));
    }
};

/** 리프 카테고리 하나의 고시 유형을 사람이 직접 지정(규칙 재적용에도 보존). */
exports.postNaverNoticeAssign = async (req, res) => {
    try {
        const r = await naverNoticeMapping.setManual(req.body.naver_category_id, req.body.notice_type);
        res.redirect(`${NAVER_BASE}?tab=category&q=` + encodeURIComponent(r.naverCategoryId)
            + '&msg=' + encodeURIComponent(`고시 유형을 ${r.noticeType || '미지정'} 으로 저장했습니다.`));
    } catch (e) {
        res.redirect(`${NAVER_BASE}?tab=category&error=` + encodeURIComponent(e.message));
    }
};

/** 프로필 화면의 원산지 검색 select 가 부르는 API. */
exports.getNaverOriginAreaSearch = async (req, res) => {
    try {
        const rows = await naverTaxonomy.searchOriginAreas(req.query.q, req.query.limit);
        res.json({ success: true, data: rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
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


// ---------------------------------------------------------------------------
// 스마트스토어 등록 (Phase 3)
//
// ⚠ 여기가 "우리 상품 → 네이버" 방향이다.
//   /staging 의 [등록]은 "공급처 → 우리 몰" 이라 완전히 다른 경로다.
//   두 화면 모두 '등록'이라는 단어를 쓰므로 문구에 방향을 항상 붙인다.
// ---------------------------------------------------------------------------

const naverPublish = require('../../services/sourcing/channel/naverPublishService');
const naverProfileSvc = require('../../services/sourcing/channel/naverProfile');
const naverCatInherit = require('../../services/sourcing/channel/naverCategoryInherit');
const naverNotice = require('../../services/sourcing/channel/naverNoticeSchema');
const naverAddressBook = require('../../services/sourcing/channel/naverAddressBook');
const naverNoticeMapping = require('../../services/sourcing/channel/naverNoticeMapping');

const PUBLISH_BASE = '/admin/sourcing/publish';
const PUBLISH_PAGE_SIZE = 30;

/** 등록 대상 상품 목록 + 네이버 매핑 상태를 함께 읽는다. */
async function listPublishTargets(mallId, filters) {
    const where = ['p.mall_id = ?'];
    const params = [mallId];

    if (filters.q) {
        where.push('p.name LIKE ?');
        params.push(`%${filters.q}%`);
    }
    if (filters.state === 'PUBLISHED') where.push("m.status = 'PUBLISHED'");
    else if (filters.state === 'FAILED') where.push("m.status = 'FAILED'");
    else if (filters.state === 'NONE') where.push('m.id IS NULL');
    // 네이버 카테고리가 없으면 애초에 등록할 수 없다 — 걸러 보고 싶을 때가 있다.
    if (filters.ready === 'Y') where.push('p.naver_category_id IS NOT NULL AND p.main_image IS NOT NULL');
    // 반대로 "카테고리를 지금 지정해야 하는 것"만 모아 일괄 지정하려는 흐름.
    if (filters.nocat === 'Y') where.push('p.naver_category_id IS NULL');
    // 같은 우리 카테고리끼리 모으면 리프 하나를 골라 한 번에 지정할 수 있다.
    if (filters.category_id) {
        where.push('p.category_id = ?');
        params.push(Number(filters.category_id));
    }

    const whereSql = where.join(' AND ');
    const page = Math.max(Number(filters.page) || 1, 1);
    const offset = (page - 1) * PUBLISH_PAGE_SIZE;

    const [rows] = await pool.query(
        `SELECT p.id, p.name, p.price, ${sellableStockSql('p')} AS stock, p.status, p.product_type,
                p.main_image, p.naver_category_id, p.product_code,
                nc.whole_category_name AS naver_category_path,
                m.id AS mapping_id, m.status AS map_status, m.origin_product_no,
                m.channel_product_no, m.sale_status, m.last_error, m.last_published_at
           FROM products p
           LEFT JOIN channel_product_mapping m
                  ON m.product_id = p.id AND m.mall_id = p.mall_id AND m.channel = 'NAVER_SMARTSTORE'
           -- ⚠ collation 드리프트: products.naver_category_id 는 utf8mb4_general_ci,
           --    naver_category.naver_category_id 는 utf8mb4_unicode_ci 라 그냥 조인하면
           --    "Illegal mix of collations" 로 쿼리가 죽는다. 명시 지정으로 맞춘다.
           LEFT JOIN naver_category nc
                  ON nc.naver_category_id = p.naver_category_id COLLATE utf8mb4_unicode_ci
          WHERE ${whereSql}
          ORDER BY p.id DESC
          LIMIT ? OFFSET ?`,
        [...params, PUBLISH_PAGE_SIZE, offset]
    );

    const [cnt] = await pool.query(
        `SELECT COUNT(*) AS total
           FROM products p
           LEFT JOIN channel_product_mapping m
                  ON m.product_id = p.id AND m.mall_id = p.mall_id AND m.channel = 'NAVER_SMARTSTORE'
          WHERE ${whereSql}`,
        params
    );

    return { rows, total: cnt[0].total, page, pageSize: PUBLISH_PAGE_SIZE };
}

/** 상단 요약 카드용 집계. */
async function publishStats(mallId) {
    const [rows] = await pool.query(
        `SELECT
            (SELECT COUNT(*) FROM products WHERE mall_id = ?) AS total,
            (SELECT COUNT(*) FROM channel_product_mapping
              WHERE mall_id = ? AND channel = 'NAVER_SMARTSTORE' AND status = 'PUBLISHED') AS published,
            (SELECT COUNT(*) FROM channel_product_mapping
              WHERE mall_id = ? AND channel = 'NAVER_SMARTSTORE' AND status = 'FAILED') AS failed,
            (SELECT COUNT(*) FROM products
              WHERE mall_id = ? AND (naver_category_id IS NULL OR main_image IS NULL)) AS not_ready`,
        [mallId, mallId, mallId, mallId]
    );
    return rows[0];
}

exports.getPublish = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const filters = {
        q: (req.query.q || '').trim(),
        state: req.query.state || '',
        ready: req.query.ready || '',
        nocat: req.query.nocat || '',
        category_id: req.query.category_id || '',
        page: req.query.page,
    };

    try {
        const [profile, list, stats, creds, inherit, noticeTypes] = await Promise.all([
            naverProfileSvc.getProfile(mallId),
            listPublishTargets(mallId, filters),
            publishStats(mallId),
            cred.listCredentials(mallId),
            naverCatInherit.previewInherit(mallId),
            naverNotice.listTypes(),
        ]);

        const [logs] = await pool.query(
            `SELECT id, product_id, action, ok, message, created_at
               FROM channel_publish_log
              WHERE mall_id = ? AND channel = 'NAVER_SMARTSTORE'
              ORDER BY id DESC LIMIT 20`,
            [mallId]
        );

        res.render('admin/sourcing/publish', {
            layout: 'layouts/admin_layout',
            title: '스마트스토어 등록',
            subtitle: '우리 몰 상품을 네이버 스마트스토어에 등록합니다. (우리 → 네이버 방향)',
            profile,
            profileMissing: naverProfileSvc.validateProfile(profile),
            hasCredential: creds.some((c) => c.channel === 'NAVER_SMARTSTORE' && c.has_secret),
            ...list,
            stats,
            filters,
            logs,
            batchLimit: naverPublish.BATCH_LIMIT,
            inherit,
            noticeTypes,
            // 저장된 원산지 코드의 표시명 — 화면이 코드 대신 이름을 보여 줘야 한다.
            originAreaName: profile.origin_area_code
                ? ((await naverTaxonomy.getOriginAreaName(profile.origin_area_code)) || {}).name || null
                : null,
            // 고시 필수 항목 누락 경고 — validateProfile 은 판매자 레벨만 보므로 여기서 따로 본다.
            noticeMissing: naverNotice.missingRequired(
                noticeTypes.find((t) => t.notice_type === profile.notice_type),
                profile.notice_defaults_json || {}
            ),
            noticeCommonFields: naverNotice.COMMON_FIELDS,
            deliveryCompanies: naverProfileSvc.DELIVERY_COMPANIES,
            result: req.session.naverPublishResult || null,
            saved: req.query.saved === '1',
            error: req.query.error || '',
            msg: req.query.msg || '',
        });
        // 결과는 한 번만 보여 준다(새로고침 시 재노출 방지).
        delete req.session.naverPublishResult;
    } catch (e) {
        res.status(500).render('admin/sourcing/placeholder', {
            layout: 'layouts/admin_layout',
            title: '스마트스토어 등록',
            subtitle: '화면을 불러오지 못했습니다.',
            note: e.message,
        });
    }
};

/** 네이버 등록 기본값(프로필) 저장. */
exports.postNaverProfile = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        await naverProfileSvc.saveProfile(mallId, req.body);
        res.redirect(`${PUBLISH_BASE}?saved=1`);
    } catch (e) {
        res.redirect(`${PUBLISH_BASE}?error=` + encodeURIComponent(e.message));
    }
};

/**
 * 카테고리의 네이버 리프 ID 를 상품에 일괄 상속.
 * 네이버 호출이 아니라 **우리 DB 안에서만** 도는 작업이다(등록 전 준비 단계).
 * 리프가 아닌 카테고리는 건드리지 않는다 — 비리프 ID 를 박으면 등록이 전량 실패한다.
 */
exports.postInheritNaverCategory = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const r = await naverCatInherit.applyInherit(mallId);
        res.redirect(`${PUBLISH_BASE}?msg=` + encodeURIComponent(naverCatInherit.summarize(r)));
    } catch (e) {
        res.redirect(`${PUBLISH_BASE}?error=` + encodeURIComponent(e.message));
    }
};

/**
 * 선택한 상품에 네이버 카테고리를 직접 지정.
 * 상속으로 못 채우는(우리 카테고리가 대·중분류인) 상품용 경로다.
 */
exports.postAssignNaverCategory = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const ids = [].concat(req.body.product_ids || []);
    try {
        const r = await naverCatInherit.assignCategory(mallId, ids, req.body.assign_naver_category_id);
        res.redirect(`${PUBLISH_BASE}?msg=` + encodeURIComponent(
            `${r.updated}건에 네이버 카테고리 지정 — ${r.categoryPath}`
        ));
    } catch (e) {
        res.redirect(`${PUBLISH_BASE}?error=` + encodeURIComponent(e.message));
    }
};

/**
 * 고시 상품군·필드 스키마를 네이버에서 수집(카탈로그 갱신).
 * ⚠ 네이버는 IP 화이트리스트라 개발서버(허용 IP)에서만 성공한다. 로컬은 403.
 */
exports.postNoticeSchemaRefresh = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const c = await cred.getCredentialByChannel(mallId, 'NAVER_SMARTSTORE');
        if (!c) throw new Error('네이버 자격증명이 없습니다. 외부몰 연결에서 먼저 등록하세요.');

        const r = await naverNotice.syncFromNaver(c);
        const parts = [`상품군 ${r.updated}/${r.total}건 수집`];
        if (r.skipped.length) parts.push(`건너뜀 ${r.skipped.length}건`);
        res.redirect(`${PUBLISH_BASE}?msg=` + encodeURIComponent(parts.join(' / ')));
    } catch (e) {
        res.redirect(`${PUBLISH_BASE}?error=` + encodeURIComponent(e.message));
    }
};

/*
 * 판매자 주소록 조회 (JSON) — 발행 프로필 화면의 [주소록 불러오기] 버튼이 부른다.
 *
 * 출고지·반품지는 네이버가 부여한 **번호**라 사람이 알 수 없다. 예전에는 직접 타이핑했고
 * 오타 한 자가 상품 등록 400 이었다(§34). 이제 목록을 받아 select 로 고른다.
 * 저장하지 않는다 — 주소록은 몰마다 다른 운영 데이터라 시드하면 안 된다(§31).
 */
exports.getNaverAddressBooks = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const c = await cred.getCredentialByChannel(mallId, 'NAVER_SMARTSTORE');
        const r = await naverAddressBook.list(c);
        if (!r.ok) return res.status(400).json({ ok: false, message: r.message });
        res.json({ ok: true, items: r.items });
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message || '주소록 조회에 실패했습니다.' });
    }
};

/** 선택 상품을 네이버에 등록(순차). */
exports.postPublishToNaver = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const ids = [].concat(req.body.product_ids || []);
    try {
        const result = await naverPublish.publishMany(mallId, ids, { actor: actorOf(req) });
        req.session.naverPublishResult = result;
        const parts = [`성공 ${result.success}건`];
        if (result.failed) parts.push(`실패 ${result.failed}건`);
        if (result.skipped) parts.push(`건너뜀 ${result.skipped}건`);
        if (result.overLimit) parts.push(`1회 상한 ${result.limit}건 — 나머지는 다시 선택해 실행하세요`);
        res.redirect(`${PUBLISH_BASE}?msg=` + encodeURIComponent(parts.join(' / ')));
    } catch (e) {
        res.redirect(`${PUBLISH_BASE}?error=` + encodeURIComponent(e.message));
    }
};

/** 등록 후 실제 상태 재확인(강제 카테고리 이동·판매금지 탐지). */
exports.postVerifyPublished = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const r = await naverPublish.verifyPublished(mallId, Number(req.params.id));
        const note = r.categoryMoved ? ' — ⚠ 네이버가 카테고리를 강제 이동했습니다' : '';
        res.redirect(`${PUBLISH_BASE}?msg=` + encodeURIComponent(`상태: ${r.statusType}${note}`));
    } catch (e) {
        res.redirect(`${PUBLISH_BASE}?error=` + encodeURIComponent(e.message));
    }
};
