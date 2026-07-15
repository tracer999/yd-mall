const pool = require('../../config/db');
const mallContext = require('../../middleware/mallContext');
const presets = require('../../services/mall/presets');
const mallProvisioner = require('../../services/mall/mallProvisioner');
const mallEraser = require('../../services/mall/mallEraser');

/*
 * 몰 관리 (P5 관리자편 Phase 2 · 몰 빌더 P4) — `mall` 정의 테이블 CRUD + 프리셋 프로비저닝
 *
 * 몰을 추가·수정·삭제하고 기본몰을 지정한다. 스토어프론트/관리자 해석기가
 * 이 테이블을 캐시하므로, 변경 후 mallContext.invalidate() 로 캐시를 비운다.
 *
 * 몰을 만들 때 **헤더·GNB 스킨**(기본형 / 드로어형)을 고르면 mallProvisioner 가 내비·메뉴·
 * 테마·사이트설정·홈 섹션을 프리셋대로 채운다. 예전에는 navigation_config 한 행만 만들어서
 * GNB 도 메인 화면도 텅 빈 몰이 나왔다.
 *
 * 스킨은 몰의 규모와 무관하다 — 몰마다 자유롭게 고르고, 나중에 /admin/header-settings 에서 바꾼다.
 *
 * 반드시 지켜야 할 불변식:
 *   - 기본몰(is_default=1)은 **정확히 하나**. 새로 지정하면 나머지를 내린다(트랜잭션).
 *   - **기본몰은 삭제·비활성 불가** — 해석기의 폴백 대상이라 없으면 몰 해석이 깨진다.
 *   - 기본몰이 아닌 몰은 **데이터가 있어도 강제 삭제**할 수 있다(몰 빌더 성격상
 *     "만들고 → 지우고 → 다시 만드는" 반복이 잦다). mall_id 참조에 FK 가 없어
 *     고아가 남으므로, 딸린 데이터는 services/mall/mallEraser 가 안전 순서로 함께 지운다.
 *     오삭제 방지로 삭제 창에서 몰 코드 재입력을 요구한다.
 */

const CODE_RE = /^[a-z0-9_-]{2,50}$/;

function normalizeCode(v) {
    return String(v || '').trim().toLowerCase();
}

/** 폼에서 온 프리셋 키를 화이트리스트로 검증한다. */
function pickPreset(raw) {
    return presets.isValidKey(raw) ? String(raw) : presets.DEFAULT_KEY;
}

/*
 * 기본몰인데 코드를 비워 두면 서버가 자동 부여한다.
 *
 * 대부분의 납품처는 멀티몰을 쓰지 않는다 — 몰 하나만 쓰는 고객은 코드(?mall= slug)를
 * 알 필요가 없다(해석기가 기본몰로 폴백하므로 `/` 로 바로 접속). 그래서 "기본몰" 체크 시
 * 운영자가 코드를 입력하지 않아도 되게, base('main')부터 시작해 유일 코드를 찾아 준다.
 * code 컬럼 자체는 NOT NULL·UNIQUE 이고 slug 생성에도 쓰이므로 "없애는" 게 아니라
 * "보이지 않게 자동으로 채우는" 것이다.
 */
async function ensureUniqueCode(conn, base) {
    const [[first]] = await conn.query('SELECT id FROM mall WHERE code = ?', [base]);
    if (!first) return base;
    for (let i = 2; i <= 100; i++) {
        const candidate = `${base}-${i}`;
        const [[dup]] = await conn.query('SELECT id FROM mall WHERE code = ?', [candidate]);
        if (!dup) return candidate;
    }
    return `${base}-${Date.now()}`; // 100개까지 찰 리 없지만 최후 폴백
}

/** 이 몰이 보유한 데이터 수(삭제 가드용) */
async function mallDataCounts(mallId) {
    const [[c]] = await pool.query('SELECT COUNT(*) n FROM categories WHERE mall_id = ?', [mallId]);
    const [[p]] = await pool.query('SELECT COUNT(*) n FROM products WHERE mall_id = ?', [mallId]);
    return { categories: c.n, products: p.n };
}

/** GET /admin/malls */
exports.getList = async (req, res) => {
    try {
        /*
         * 스킨의 소스 오브 트루스는 navigation_config 다(mall.preset_key 는 "마지막에 적용한 프리셋"일 뿐
         * — 이후 Header 설정에서 스킨을 바꿨을 수 있다). 목록 배지는 실제 렌더 기준을 보여야 하므로
         * navigation_config 를 조인해서 읽는다. 행이 없는 몰은 기본형으로 폴백한다(렌더도 그렇게 한다).
         */
        const [malls] = await pool.query(`
            SELECT m.*, n.header_layout_type, n.nav_mode
              FROM mall m
              LEFT JOIN navigation_config n ON n.mall_id = m.id
             ORDER BY m.is_default DESC, m.id ASC
        `);
        for (const m of malls) {
            m.counts = await mallDataCounts(m.id);
            m.isDrawer = m.header_layout_type === 'compact_drawer_v1';
            m.skinLabel = m.isDrawer ? '드로어형' : '기본형';
            m.presetLabel = m.preset_key && presets.isValidKey(m.preset_key)
                ? presets.get(m.preset_key).label
                : null;
        }
        res.render('admin/malls/list', {
            layout: 'layouts/admin_layout',
            title: '몰 관리',
            malls,
            saved: req.query.saved === '1',
            provisioned: req.query.provisioned || null,
            // 목록의 '선택' 버튼이 ?adminMall=<id> 를 달고 되돌아온 경우.
            // 실제 전환은 middleware/adminMallContext 가 이미 처리했다(세션 저장).
            selected: req.query.selected === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[mall] getList:', err.message);
        res.status(500).send('Server Error');
    }
};

/** GET /admin/malls/new · /admin/malls/:id */
async function renderForm(res, mall, extra = {}) {
    // 기존 몰이면 "무엇이 이미 있는지"를 보여준다 — 프리셋 재적용이 무엇을 덮는지 알려야 한다.
    const state = mall.id ? await mallProvisioner.inspect(mall.id) : null;

    res.render('admin/malls/form', Object.assign({
        layout: 'layouts/admin_layout',
        title: mall.id ? '몰 수정' : '몰 등록',
        mall,
        presetList: presets.list(),
        defaultPresetKey: presets.DEFAULT_KEY,
        // 마지막으로 적용한 스킨(프리셋) 이름. 한 번도 적용한 적 없으면 null.
        presetLabel: mall.preset_key && presets.isValidKey(mall.preset_key)
            ? presets.get(mall.preset_key).label
            : null,
        state,
        error: null,
        notice: null,
        saved: false,
    }, extra));
}

exports.getNew = async (req, res) => {
    await renderForm(res, {
        id: null, code: '', name: '', domain: '',
        is_active: 1, is_default: 0,
        preset_key: presets.DEFAULT_KEY,
    });
};

exports.getEdit = async (req, res) => {
    try {
        const [[mall]] = await pool.query('SELECT * FROM mall WHERE id = ?', [req.params.id]);
        if (!mall) return res.redirect('/admin/malls?error=' + encodeURIComponent('몰을 찾을 수 없습니다.'));
        await renderForm(res, mall, {
            saved: req.query.saved === '1',
            notice: req.query.notice || null,
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[mall] getEdit:', err.message);
        res.status(500).send('Server Error');
    }
};

/** 기본몰 지정: 트랜잭션으로 나머지를 내리고 이 몰만 올린다. */
async function setDefault(conn, mallId) {
    await conn.query('UPDATE mall SET is_default = 0 WHERE id <> ?', [mallId]);
    await conn.query('UPDATE mall SET is_default = 1, is_active = 1 WHERE id = ?', [mallId]); // 기본몰은 항상 활성
}

/** POST /admin/malls — 생성 + 프리셋 프로비저닝 */
exports.postAdd = async (req, res) => {
    const name = String(req.body.name || '').trim();
    const presetKey = pickPreset(req.body.preset_key);
    const wantDefault = !!req.body.is_default;
    let code = normalizeCode(req.body.code);

    const conn = await pool.getConnection();
    let newMallId = null;
    try {
        // 기본몰인데 코드를 비워 두면 자동 부여(단일몰 납품 편의). 기본몰이 아니면 종전대로 필수.
        if (!code && wantDefault) code = await ensureUniqueCode(conn, 'main');

        const draft = {
            id: null, code, name, domain: req.body.domain,
            is_active: 1, is_default: wantDefault ? 1 : 0,
            preset_key: presetKey,
        };

        if (!CODE_RE.test(code)) return renderForm(res, draft, { error: '코드는 소문자·숫자·-·_ 2~50자여야 합니다. (기본몰은 비워 두면 자동 부여됩니다)' });
        if (!name) return renderForm(res, draft, { error: '몰 이름을 입력하세요.' });

        const [[dup]] = await conn.query('SELECT id FROM mall WHERE code = ?', [code]);
        if (dup) return renderForm(res, draft, { error: `코드 '${code}' 는 이미 사용 중입니다.` });

        await conn.beginTransaction();
        const [r] = await conn.query(
            'INSERT INTO mall (code, name, preset_key, domain, is_active, is_default) VALUES (?, ?, ?, ?, ?, 0)',
            [code, name.slice(0, 100), presetKey,
             String(req.body.domain || '').trim() || null, req.body.is_active ? 1 : 0]
        );
        newMallId = r.insertId;
        if (wantDefault) await setDefault(conn, newMallId);
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        console.error('[mall] postAdd:', err.message);
        return res.status(500).send('Server Error');
    } finally {
        conn.release();
    }

    mallContext.invalidate();

    /*
     * 프로비저닝은 몰 생성 트랜잭션 **밖**에서 돈다.
     * 실패해도 몰 자체는 남겨야 한다 — 몰만 만들어 두고 프리셋은 다시 적용하면 되지만,
     * 몰 생성을 통째로 롤백하면 운영자는 왜 저장이 안 됐는지 알 수 없다.
     */
    try {
        await mallProvisioner.provisionMall(newMallId, presetKey, {
            mode: 'create',
            actor: (req.session.admin && req.session.admin.username) || 'admin',
        });
    } catch (err) {
        console.error('[mall] 프로비저닝 실패:', err.message);
        return res.redirect('/admin/malls?error=' + encodeURIComponent(
            `몰은 만들어졌지만 초기 구성에 실패했습니다: ${err.message} — 몰 수정 화면에서 '프리셋 적용'을 다시 실행하세요.`));
    }

    res.redirect('/admin/malls?provisioned=' + encodeURIComponent(name));
};

/** POST /admin/malls/:id — 수정 (프리셋은 건드리지 않는다. 재적용은 postProvision) */
exports.postEdit = async (req, res) => {
    const id = Number(req.params.id);
    const conn = await pool.getConnection();
    try {
        const [[mall]] = await conn.query('SELECT * FROM mall WHERE id = ?', [id]);
        if (!mall) return res.redirect('/admin/malls?error=' + encodeURIComponent('몰을 찾을 수 없습니다.'));

        const code = normalizeCode(req.body.code);
        const name = String(req.body.name || '').trim();
        if (!CODE_RE.test(code) || !name) return renderForm(res, Object.assign({}, mall, { code, name }), { error: '코드/이름을 확인하세요.' });

        const [[dup]] = await conn.query('SELECT id FROM mall WHERE code = ? AND id <> ?', [code, id]);
        if (dup) return renderForm(res, Object.assign({}, mall, { code, name }), { error: `코드 '${code}' 는 다른 몰이 쓰고 있습니다.` });

        const wantDefault = !!req.body.is_default;
        let wantActive = req.body.is_active ? 1 : 0;

        // 기본몰은 비활성 불가(해석기 폴백 대상). 기본몰이거나 기본몰로 지정 중이면 활성 강제.
        if (mall.is_default && !wantActive && !wantDefault) {
            return renderForm(res, Object.assign({}, mall, { code, name }), { error: '기본몰은 비활성화할 수 없습니다. 다른 몰을 먼저 기본몰로 지정하세요.' });
        }
        if (wantDefault) wantActive = 1;

        await conn.beginTransaction();
        await conn.query('UPDATE mall SET code = ?, name = ?, domain = ?, is_active = ? WHERE id = ?',
            [code, name.slice(0, 100), String(req.body.domain || '').trim() || null, wantActive, id]);
        if (wantDefault && !mall.is_default) await setDefault(conn, id);
        await conn.commit();

        mallContext.invalidate();
        res.redirect('/admin/malls?saved=1');
    } catch (err) {
        await conn.rollback();
        console.error('[mall] postEdit:', err.message);
        res.status(500).send('Server Error');
    } finally {
        conn.release();
    }
};

/**
 * POST /admin/malls/:id/provision — 기존 몰에 프리셋 재적용
 *
 * 내비 정책·GNB 메뉴 세트·테마를 프리셋으로 되돌린다.
 * 홈 섹션 교체(`include_home`)는 **파괴적**이라 명시적으로 체크해야 실행된다.
 */
exports.postProvision = async (req, res) => {
    const id = Number(req.params.id);
    const presetKey = pickPreset(req.body.preset_key);
    const includeHome = req.body.include_home === '1';

    try {
        const [[mall]] = await pool.query('SELECT id FROM mall WHERE id = ?', [id]);
        if (!mall) return res.redirect('/admin/malls?error=' + encodeURIComponent('몰을 찾을 수 없습니다.'));

        const result = await mallProvisioner.provisionMall(id, presetKey, {
            mode: 'reapply',
            includeHome,
            actor: (req.session.admin && req.session.admin.username) || 'admin',
        });

        const note = result.homeReplaced
            ? `프리셋 '${result.preset.label}' 적용 완료 — 홈 섹션을 교체하고 발행했습니다(rev.${result.revisionNo}).`
            : `프리셋 '${result.preset.label}' 적용 완료 — 내비·메뉴·테마를 되돌렸습니다(홈 섹션은 유지).`;
        res.redirect(`/admin/malls/${id}?notice=` + encodeURIComponent(note));
    } catch (err) {
        console.error('[mall] postProvision:', err.message);
        res.redirect(`/admin/malls/${id}?error=` + encodeURIComponent(`프리셋 적용 실패: ${err.message}`));
    }
};

/**
 * POST /admin/malls/:id/delete — 몰 삭제(강제)
 *
 * 기본몰은 여전히 삭제 불가. 그 외 몰은 데이터가 있어도 지운다:
 *   - 데이터가 있으면 삭제 창에서 force=1 + 몰 코드 재입력(confirm_code)을 받아야 한다.
 *   - 딸린 데이터는 mallEraser.cascadeDeleteMall 가 FK 안전 순서로 한 트랜잭션에 지운다.
 */
exports.postDelete = async (req, res) => {
    const id = Number(req.params.id);
    try {
        const [[mall]] = await pool.query('SELECT * FROM mall WHERE id = ?', [id]);
        if (!mall) return res.redirect('/admin/malls');

        if (mall.is_default) {
            return res.redirect('/admin/malls?error=' + encodeURIComponent('기본몰은 삭제할 수 없습니다. 다른 몰을 기본몰로 지정한 뒤 삭제하세요.'));
        }

        const counts = await mallDataCounts(id);
        const hasData = counts.categories > 0 || counts.products > 0;
        const force = req.body.force === '1';

        // 데이터가 있는 몰은 강제 삭제 확인(force)을 거쳐야만 지운다.
        if (hasData && !force) {
            return res.redirect('/admin/malls?error=' + encodeURIComponent(
                `이 몰에 카테고리 ${counts.categories}개·상품 ${counts.products}개가 있습니다. 삭제 창에서 '강제 삭제'를 확인하세요.`));
        }
        // 강제 삭제 시 오삭제 방지: 입력한 코드가 몰 코드와 정확히 일치해야 한다.
        if (force && String(req.body.confirm_code || '').trim().toLowerCase() !== String(mall.code).toLowerCase()) {
            return res.redirect('/admin/malls?error=' + encodeURIComponent('입력한 몰 코드가 일치하지 않아 삭제를 취소했습니다.'));
        }

        await mallEraser.cascadeDeleteMall(id);

        mallContext.invalidate();
        res.redirect('/admin/malls?saved=1');
    } catch (err) {
        console.error('[mall] postDelete:', err.message);
        res.status(500).send('Server Error');
    }
};
