/*
 * 이메일 템플릿 로딩 · 렌더 · 발송
 *
 * 우선순위는 항상 **DB 오버라이드 → 코드 기본값** 이다. `email_template` 에 행이 없으면
 * emailTemplateRegistry 의 defaultSubject/defaultBody 를 쓴다. 새로 찍어낸 몰에서도
 * 아무 설정 없이 메일이 나가야 하기 때문이다.
 *
 * 테이블이 아직 만들어지지 않은 환경(마이그레이션 전)에서도 발송이 멈추면 안 되므로,
 * 조회 실패는 기본값 폴백으로 흡수한다.
 */

const pool = require('../../config/db');
const registry = require('./emailTemplateRegistry');
const { sendEmail } = require('../emailService');

const { LAYOUT_KEY } = registry;

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** `{{token}}` 치환. raw 토큰이 아니면 HTML 이스케이프한다. */
function renderString(tpl, vars, { escape = true } = {}) {
    return String(tpl || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, token) => {
        const value = vars[token];
        if (value === undefined || value === null) return '';
        const str = String(value);
        if (!escape || registry.isRawToken(token)) return str;
        return escapeHtml(str);
    });
}

/* ── 저장소 ─────────────────────────────────────────────────────── */

/** 몰의 오버라이드 행 전부. 테이블이 없으면 빈 Map. */
async function loadOverrides(mallId) {
    try {
        const [rows] = await pool.query(
            'SELECT template_key, subject, body, is_enabled, updated_at FROM email_template WHERE mall_id = ?',
            [Number(mallId) || 1]
        );
        return new Map(rows.map((r) => [r.template_key, r]));
    } catch (err) {
        if (err && err.code === 'ER_NO_SUCH_TABLE') {
            console.warn('[emailTemplate] email_template 테이블이 없습니다. 코드 기본값으로 발송합니다. (scripts/migrate_email_template.sql)');
            return new Map();
        }
        throw err;
    }
}

/**
 * 최종 템플릿 = 코드 기본값 + DB 오버라이드.
 * @returns {{key, def, subject, body, isEnabled, isCustomized, updatedAt}|null}
 */
function resolveWith(def, row) {
    if (!def) return null;
    const hasSubject = row && row.subject !== null && row.subject !== undefined && String(row.subject).trim() !== '';
    const hasBody = row && row.body !== null && row.body !== undefined && String(row.body).trim() !== '';
    return {
        key: def.key,
        def,
        subject: hasSubject ? row.subject : def.defaultSubject,
        body: hasBody ? row.body : def.defaultBody,
        isEnabled: row ? Number(row.is_enabled) === 1 : true,
        isCustomized: Boolean(hasSubject || hasBody),
        updatedAt: row ? row.updated_at : null,
    };
}

async function getTemplate(mallId, key) {
    const def = registry.getTemplateDef(key);
    if (!def) return null;
    const overrides = await loadOverrides(mallId);
    return resolveWith(def, overrides.get(key));
}

/** 관리자 목록용 — 전체 템플릿을 그룹별로 (오버라이드 반영해서) */
async function listResolvedByGroup(mallId) {
    const overrides = await loadOverrides(mallId);
    return registry.listTemplatesByGroup().map((g) => ({
        ...g,
        templates: g.templates.map((def) => resolveWith(def, overrides.get(def.key))),
    }));
}

/** 저장. 기본값과 똑같은 내용이면 오버라이드 행을 남기지 않는다(항상 코드 기본값을 따라가도록). */
async function saveTemplate(mallId, key, { subject, body, isEnabled = true, adminId = null }) {
    const def = registry.getTemplateDef(key);
    if (!def) throw new Error(`알 수 없는 템플릿입니다: ${key}`);

    const normSubject = def.defaultSubject === null ? null : (String(subject || '').trim() || null);
    const normBody = String(body || '').trim() || null;

    const subjectSame = normSubject === (def.defaultSubject || null);
    const bodySame = normBody === (def.defaultBody || null);

    await pool.query(
        `INSERT INTO email_template (mall_id, template_key, subject, body, is_enabled, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE subject = VALUES(subject), body = VALUES(body),
                                 is_enabled = VALUES(is_enabled), updated_by = VALUES(updated_by)`,
        [
            Number(mallId) || 1,
            key,
            subjectSame ? null : normSubject,
            bodySame ? null : normBody,
            isEnabled ? 1 : 0,
            adminId,
        ]
    );
}

/** 기본값으로 되돌리기 — 오버라이드 행 삭제. */
async function resetTemplate(mallId, key) {
    await pool.query('DELETE FROM email_template WHERE mall_id = ? AND template_key = ?', [Number(mallId) || 1, key]);
}

/* ── 렌더 ───────────────────────────────────────────────────────── */

/**
 * 제목·본문을 렌더하고 공통 레이아웃으로 감싼다.
 * @returns {{subject: string, html: string, isEnabled: boolean}}
 */
async function renderTemplate(mallId, key, vars = {}) {
    const overrides = await loadOverrides(mallId);
    const tpl = resolveWith(registry.getTemplateDef(key), overrides.get(key));
    if (!tpl) throw new Error(`알 수 없는 템플릿입니다: ${key}`);

    const subject = renderString(tpl.subject, vars, { escape: false });
    const inner = renderString(tpl.body, vars);

    const layout = resolveWith(registry.getTemplateDef(LAYOUT_KEY), overrides.get(LAYOUT_KEY));
    const html = layout && layout.isEnabled
        ? renderString(layout.body, { ...vars, content: inner })
        : inner;

    return { subject, html, isEnabled: tpl.isEnabled };
}

/* ── 발송 ───────────────────────────────────────────────────────── */

/**
 * 템플릿으로 메일 발송. 템플릿이 꺼져 있으면 조용히 건너뛴다.
 * 호출부의 주문 처리를 되돌리면 안 되므로 예외는 삼키고 결과만 돌려준다.
 */
async function sendTemplateMail({ mallId = 1, key, to, vars = {}, replyTo = null }) {
    try {
        if (!to) return { success: false, skipped: true, error: '수신자가 없습니다.' };
        const { subject, html, isEnabled } = await renderTemplate(mallId, key, vars);
        if (!isEnabled) {
            return { success: false, skipped: true, error: '이 안내 메일은 발송하지 않도록 설정되어 있습니다.' };
        }
        if (!subject) return { success: false, skipped: true, error: '제목이 비어 있습니다.' };
        return await sendEmail({ to, subject, html, replyTo });
    } catch (err) {
        console.error(`[emailTemplate] 발송 실패 (${key}):`, err.message);
        return { success: false, error: err.message };
    }
}

module.exports = {
    renderString,
    escapeHtml,
    getTemplate,
    listResolvedByGroup,
    saveTemplate,
    resetTemplate,
    renderTemplate,
    sendTemplateMail,
};
