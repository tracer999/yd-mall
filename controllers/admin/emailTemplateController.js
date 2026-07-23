/*
 * 이메일 템플릿 관리 (쇼핑몰 관리 > 이메일 템플릿 관리)
 *
 * 주문·배송 안내 메일의 제목·본문을 몰별로 고친다. 저장하지 않은 템플릿은 코드 기본값으로
 * 발송되므로, 이 화면에 한 번도 들어오지 않아도 메일은 정상 동작한다.
 */

const pool = require('../../config/db');
const registry = require('../../services/email/emailTemplateRegistry');
const templateService = require('../../services/email/emailTemplateService');
const { loadSystemSettingsAndApplyEnv } = require('../../config/systemSettings');

/** 몰 목록 + 현재 선택 몰. 쿼리스트링 ?mall= 이 없으면 기본몰. */
async function resolveMall(req) {
    const [malls] = await pool.query('SELECT id, name, code, is_default FROM mall ORDER BY is_default DESC, id ASC');
    // GET 요청에는 body 가 없다(Express 5 는 undefined).
    const requested = Number(req.query.mall || (req.body || {}).mall_id);
    const found = malls.find((m) => Number(m.id) === requested);
    const current = found || malls.find((m) => Number(m.is_default) === 1) || malls[0] || { id: 1, name: '기본몰' };
    return { malls, mallId: Number(current.id), currentMall: current };
}

/** 운영자 알림 수신 주소 — system_settings 우선, 없으면 사이트 설정의 대표 메일. */
async function adminNotifyEmail(mallId) {
    const fromSettings = (global.systemSettings || {}).admin_email;
    if (fromSettings) return { value: fromSettings, source: 'system' };
    const [[row]] = await pool.query('SELECT contact_email FROM site_settings WHERE mall_id = ?', [mallId]);
    if (row && row.contact_email) return { value: row.contact_email, source: 'site' };
    return { value: '', source: 'none' };
}

/* ── 목록 ───────────────────────────────────────────────────────── */

exports.getList = async (req, res) => {
    try {
        const { malls, mallId, currentMall } = await resolveMall(req);
        const groups = await templateService.listResolvedByGroup(mallId);
        const adminEmail = await adminNotifyEmail(mallId);

        res.render('admin/email-templates/list', {
            layout: 'layouts/admin_layout',
            title: '이메일 템플릿 관리',
            malls,
            mallId,
            currentMall,
            groups,
            adminEmail,
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

/* ── 편집 ───────────────────────────────────────────────────────── */

exports.getEdit = async (req, res) => {
    try {
        const { malls, mallId, currentMall } = await resolveMall(req);
        const key = req.params.key;
        const tpl = await templateService.getTemplate(mallId, key);
        if (!tpl) return res.status(404).send('템플릿을 찾을 수 없습니다.');

        res.render('admin/email-templates/form', {
            layout: 'layouts/admin_layout',
            title: `이메일 템플릿 — ${tpl.def.label}`,
            malls,
            mallId,
            currentMall,
            tpl,
            variables: registry.variableDefs(key),
            tinymceKey: process.env.TINYMCE_KEY || '',
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postEdit = async (req, res) => {
    const key = req.params.key;
    const mallId = Number(req.body.mall_id) || 1;
    try {
        await templateService.saveTemplate(mallId, key, {
            subject: req.body.subject,
            body: req.body.body,
            isEnabled: req.body.is_enabled === '1',
            adminId: req.session.admin ? req.session.admin.id : null,
        });
        res.redirect(`/admin/email-templates/${encodeURIComponent(key)}?mall=${mallId}&message=${encodeURIComponent('저장했습니다.')}`);
    } catch (err) {
        console.error(err);
        const msg = err && err.code === 'ER_NO_SUCH_TABLE'
            ? 'email_template 테이블이 없습니다. scripts/migrate_email_template.sql 을 실행하세요.'
            : (err.message || '저장에 실패했습니다.');
        res.redirect(`/admin/email-templates/${encodeURIComponent(key)}?mall=${mallId}&error=${encodeURIComponent(msg)}`);
    }
};

/** 기본값으로 되돌리기 */
exports.postReset = async (req, res) => {
    const key = req.params.key;
    const mallId = Number(req.body.mall_id) || 1;
    try {
        await templateService.resetTemplate(mallId, key);
        res.redirect(`/admin/email-templates/${encodeURIComponent(key)}?mall=${mallId}&message=${encodeURIComponent('기본 문구로 되돌렸습니다.')}`);
    } catch (err) {
        console.error(err);
        res.redirect(`/admin/email-templates/${encodeURIComponent(key)}?mall=${mallId}&error=${encodeURIComponent('되돌리기에 실패했습니다.')}`);
    }
};

/** 목록에서 발송 on/off */
exports.postToggle = async (req, res) => {
    const key = req.params.key;
    const mallId = Number(req.body.mall_id) || 1;
    try {
        const tpl = await templateService.getTemplate(mallId, key);
        if (!tpl) return res.redirect(`/admin/email-templates?mall=${mallId}`);
        await templateService.saveTemplate(mallId, key, {
            subject: tpl.subject,
            body: tpl.body,
            isEnabled: !tpl.isEnabled,
            adminId: req.session.admin ? req.session.admin.id : null,
        });
        const label = !tpl.isEnabled ? '발송하도록' : '발송하지 않도록';
        res.redirect(`/admin/email-templates?mall=${mallId}&message=${encodeURIComponent(`'${tpl.def.label}' 을 ${label} 변경했습니다.`)}`);
    } catch (err) {
        console.error(err);
        const msg = err && err.code === 'ER_NO_SUCH_TABLE'
            ? 'email_template 테이블이 없습니다. scripts/migrate_email_template.sql 을 실행하세요.'
            : '변경에 실패했습니다.';
        res.redirect(`/admin/email-templates?mall=${mallId}&error=${encodeURIComponent(msg)}`);
    }
};

/**
 * 미리보기 — 저장 전 화면의 내용을 그대로 샘플 값으로 렌더한다(AJAX).
 * 저장된 값이 아니라 편집 중인 값을 봐야 의미가 있으므로 body 를 받아서 렌더한다.
 */
exports.postPreview = async (req, res) => {
    try {
        const key = req.params.key;
        const mallId = Number(req.body.mall_id) || 1;
        const def = registry.getTemplateDef(key);
        if (!def) return res.status(404).json({ error: '템플릿을 찾을 수 없습니다.' });

        const vars = await buildPreviewVars(mallId, key);
        const subject = templateService.renderString(req.body.subject || def.defaultSubject || '', vars, { escape: false });
        const inner = templateService.renderString(req.body.body || '', vars);

        let html = inner;
        if (key !== registry.LAYOUT_KEY) {
            const layout = await templateService.getTemplate(mallId, registry.LAYOUT_KEY);
            if (layout && layout.isEnabled) {
                html = templateService.renderString(layout.body, { ...vars, content: inner });
            }
        } else {
            html = templateService.renderString(req.body.body || '', { ...vars, content: vars.content });
        }

        res.json({ subject, html });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || '미리보기에 실패했습니다.' });
    }
};

/** 테스트 발송 — 편집 중인 내용을 샘플 값으로 채워 실제로 보낸다. */
exports.postTest = async (req, res) => {
    const key = req.params.key;
    const mallId = Number(req.body.mall_id) || 1;
    try {
        const to = String(req.body.test_email || '').trim();
        if (!to) return res.status(400).json({ error: '받는 사람 주소를 입력하세요.' });

        const def = registry.getTemplateDef(key);
        if (!def) return res.status(404).json({ error: '템플릿을 찾을 수 없습니다.' });

        const vars = await buildPreviewVars(mallId, key);
        const subject = templateService.renderString(req.body.subject || def.defaultSubject || '', vars, { escape: false });
        const inner = templateService.renderString(req.body.body || '', vars);

        let html = inner;
        const layout = await templateService.getTemplate(mallId, registry.LAYOUT_KEY);
        if (key !== registry.LAYOUT_KEY && layout && layout.isEnabled) {
            html = templateService.renderString(layout.body, { ...vars, content: inner });
        }

        const { sendEmail } = require('../../services/emailService');
        const result = await sendEmail({ to, subject: `[테스트] ${subject}`, html });
        if (!result.success) return res.status(400).json({ error: result.error || '발송에 실패했습니다.' });
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || '테스트 발송에 실패했습니다.' });
    }
};

/** 운영자 알림 수신 주소 저장 (system_settings.admin_email) */
exports.postAdminEmail = async (req, res) => {
    const mallId = Number(req.body.mall_id) || 1;
    try {
        const value = String(req.body.admin_email || '').trim();
        await pool.query(
            `INSERT INTO system_settings (setting_key, setting_value, description)
             VALUES ('admin_email', ?, '운영자 알림 메일 수신 주소 (주문 취소·반품 접수 등)')
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), description = VALUES(description)`,
            [value]
        );
        await loadSystemSettingsAndApplyEnv();
        res.redirect(`/admin/email-templates?mall=${mallId}&message=${encodeURIComponent('운영자 알림 주소를 저장했습니다.')}`);
    } catch (err) {
        console.error(err);
        res.redirect(`/admin/email-templates?mall=${mallId}&error=${encodeURIComponent('저장에 실패했습니다.')}`);
    }
};

/* ── 미리보기 값 ────────────────────────────────────────────────── */

/**
 * 미리보기용 변수. 사이트 이름·고객센터처럼 실제로 아는 값은 진짜 데이터를 쓰고,
 * 주문번호·금액 같은 건 샘플을 쓴다. 관리자가 "우리 몰 이름이 맞게 들어가는지"를 확인해야 하기 때문.
 */
async function buildPreviewVars(mallId, key) {
    const sample = registry.sampleVars(key);

    const [[row]] = await pool.query(
        `SELECT m.name AS mall_name, s.company_name, s.contact_phone, s.contact_email, s.cs_hours
           FROM mall m LEFT JOIN site_settings s ON s.mall_id = m.id
          WHERE m.id = ?`,
        [mallId]
    ).catch(() => [[]]);

    const settings = global.systemSettings || {};
    const baseUrl = String(settings.domain || process.env.SITE_URL || '').replace(/\/+$/, '');

    const real = {
        shop_name: (row && (row.mall_name || row.company_name)) || sample.shop_name,
        shop_url: baseUrl || sample.shop_url,
        cs_phone: (row && row.contact_phone) || sample.cs_phone,
        cs_email: (row && row.contact_email) || settings.smtp_sender_email || sample.cs_email,
        cs_hours: (row && row.cs_hours) || sample.cs_hours,
    };

    // 표 형태 토큰은 샘플 문자열이 없으므로 여기서 만들어 준다.
    const itemTable = `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
  <thead><tr style="background:#f9fafb;">
    <th style="padding:8px 4px;text-align:left;font-size:12px;color:#6b7280;">상품</th>
    <th style="padding:8px 4px;text-align:center;font-size:12px;color:#6b7280;width:60px;">수량</th>
    <th style="padding:8px 4px;text-align:right;font-size:12px;color:#6b7280;width:100px;">금액</th>
  </tr></thead>
  <tbody>
    <tr><td style="padding:8px 4px;border-bottom:1px solid #f3f4f6;">홍삼정 스틱 30포</td>
        <td style="padding:8px 4px;border-bottom:1px solid #f3f4f6;text-align:center;">1개</td>
        <td style="padding:8px 4px;border-bottom:1px solid #f3f4f6;text-align:right;">39,000원</td></tr>
    <tr><td style="padding:8px 4px;border-bottom:1px solid #f3f4f6;">비타민D 1000IU</td>
        <td style="padding:8px 4px;border-bottom:1px solid #f3f4f6;text-align:center;">2개</td>
        <td style="padding:8px 4px;border-bottom:1px solid #f3f4f6;text-align:right;">15,000원</td></tr>
  </tbody>
</table>`;

    return {
        ...sample,
        ...real,
        item_table: itemTable,
        item_list: '홍삼정 스틱 30포 x 1\n비타민D 1000IU x 2',
        order_url: baseUrl ? `${baseUrl}/mypage/orders/1024` : sample.order_url,
        b2b_order_url: baseUrl ? `${baseUrl}/b2b/orders/1024` : sample.b2b_order_url,
        content: sample.content || '<p>(각 안내 메일의 본문이 이 자리에 들어갑니다.)</p>',
    };
}
