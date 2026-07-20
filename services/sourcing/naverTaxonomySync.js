/*
 * 네이버 카테고리/브랜드 참조 리소스 수집.
 * 설계: docs/사이트개선/네이버_카테고리_리소스_설계.md
 *
 * 흐름: ACTIVE 네이버 자격증명 1건 선택 → 커머스 API 전체 카테고리 조회
 *       → naver_category upsert(이번 수집분은 fetched_at=runStart)
 *       → 이번 수집에 없는 기존 항목 is_active=0(soft delete)
 *       → naver_taxonomy_sync_log 에 회차 기록.
 *
 * 원칙:
 *   - 네이버 카테고리는 판매자 공통(전역)이라 자격증명 1건만 있으면 된다.
 *   - 몰 categories 에 자동 반영하지 않는다. 여긴 순수 "참조 리소스" 적재만.
 *   - 자격증명이 없으면 SKIPPED(실패 아님) — 발급 전에도 크론이 조용히 넘어간다.
 */

const pool = require('../../config/db');
const cred = require('./credential');
const naverClient = require('./channel/naverClient');

const UPSERT_CHUNK = 500;

/** ACTIVE 상태의 네이버 자격증명 1건을 몰 무관하게 찾아 복호화해 돌려준다. */
async function pickActiveNaverCredential() {
    const [rows] = await pool.query(
        `SELECT id, mall_id FROM mall_channel_credential
          WHERE channel = 'NAVER_SMARTSTORE'
            AND secret_enc IS NOT NULL
            AND status IN ('ACTIVE')
          ORDER BY last_verified_at DESC, id ASC
          LIMIT 1`
    );
    if (!rows.length) return null;
    return cred.getCredential(rows[0].mall_id, rows[0].id);
}

/** 네이버 카테고리 응답 1건 → naver_category 행으로 방어적 매핑. */
function mapCategory(item, runStart) {
    const id = item.id != null ? String(item.id)
        : (item.categoryId != null ? String(item.categoryId) : null);
    if (!id) return null;
    const whole = String(item.wholeCategoryName || item.wholeName || '').slice(0, 500);
    // /v1/categories 응답은 id·name·wholeCategoryName·last 만 준다(레벨·부모 없음).
    // 깊이는 전체 경로의 '>' 구분자 수로 유도한다. categoryLevel 이 오면 그걸 우선.
    const level = Number.isFinite(Number(item.categoryLevel)) ? Number(item.categoryLevel)
        : (whole ? whole.split('>').length : null);
    return {
        naver_category_id: id,
        name: String(item.name || '').slice(0, 255),
        whole_category_name: whole,
        parent_naver_id: item.parentId != null ? String(item.parentId) : null,
        category_level: level,
        is_leaf: (item.last === true || item.last === 'true' || item.leaf === true) ? 1 : 0,
        raw_json: JSON.stringify(item),
        fetched_at: runStart,
    };
}

async function upsertCategories(rows) {
    if (!rows.length) return 0;
    let upserted = 0;
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
        const chunk = rows.slice(i, i + UPSERT_CHUNK);
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, 1, ?, ?)').join(', ');
        const params = [];
        for (const r of chunk) {
            params.push(r.naver_category_id, r.name, r.whole_category_name, r.parent_naver_id,
                r.category_level, r.is_leaf, r.raw_json, r.fetched_at);
        }
        const [res] = await pool.query(
            `INSERT INTO naver_category
                (naver_category_id, name, whole_category_name, parent_naver_id, category_level, is_leaf, is_active, raw_json, fetched_at)
             VALUES ${placeholders}
             ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                whole_category_name = VALUES(whole_category_name),
                parent_naver_id = VALUES(parent_naver_id),
                category_level = VALUES(category_level),
                is_leaf = VALUES(is_leaf),
                is_active = 1,
                raw_json = VALUES(raw_json),
                fetched_at = VALUES(fetched_at)`,
            params
        );
        upserted += chunk.length;
        void res;
    }
    return upserted;
}

/**
 * 카테고리 수집 1회.
 * @param {{ triggerBy?: 'CRON'|'MANUAL' }} [opts]
 * @returns {Promise<{status:string, total?:number, upserted?:number, deactivated?:number, message?:string}>}
 */
async function syncCategories(opts = {}) {
    const triggerBy = opts.triggerBy === 'MANUAL' ? 'MANUAL' : 'CRON';

    const credential = await pickActiveNaverCredential();
    if (!credential) {
        await writeLog({ resource: 'CATEGORY', triggerBy, credentialId: null, status: 'SKIPPED',
            message: 'ACTIVE 네이버 자격증명 없음 — 발급·검증 후 수집됩니다.' });
        return { status: 'SKIPPED', message: 'ACTIVE 네이버 자격증명 없음' };
    }

    const logId = await startLog({ resource: 'CATEGORY', triggerBy, credentialId: credential.id });
    // runStart 는 이번 회차 마커. upsert 된 행은 이 시각으로 갱신되고,
    // 그보다 오래된(=이번 응답에 없던) 행을 is_active=0 으로 내린다.
    const [[{ now }]] = await pool.query('SELECT NOW() AS now');
    const runStart = now;

    try {
        const raw = await naverClient.getCategories(credential);
        const mapped = raw.map((it) => mapCategory(it, runStart)).filter(Boolean);

        const upserted = await upsertCategories(mapped);

        const [deac] = await pool.query(
            'UPDATE naver_category SET is_active = 0 WHERE fetched_at < ? AND is_active = 1',
            [runStart]
        );
        const deactivated = deac.affectedRows || 0;

        await finishLog(logId, { status: 'SUCCESS', total: mapped.length, upserted, deactivated,
            message: `카테고리 ${mapped.length}건 수집(리프 포함), 비활성 ${deactivated}건` });

        // Phase 4 지속 동기화 — 수집분을 우리 글로벌 카테고리에 반영(신규 추가 + 비활성 정리).
        // 실패해도 수집 자체는 SUCCESS. (설계: 네이버_기반_글로벌_카테고리_재구성_설계.md §5 Phase 4)
        try {
            const categoryReflect = require('./categoryReflect');
            const rr = await categoryReflect.reflect({ commit: true });
            console.log(`[categoryReflect] 신규 ${rr.created} · 승격 ${rr.promoted} · 비활성정리 ${rr.removed}`);
        } catch (e) {
            console.error('[categoryReflect] 글로벌 카테고리 반영 실패(수집은 성공):', e.message);
        }

        return { status: 'SUCCESS', total: mapped.length, upserted, deactivated };
    } catch (e) {
        await finishLog(logId, { status: 'FAILED', message: e.message });
        return { status: 'FAILED', message: e.message };
    }
}

// ---- 로그 헬퍼 -------------------------------------------------------------

async function startLog({ resource, triggerBy, credentialId }) {
    const [r] = await pool.query(
        `INSERT INTO naver_taxonomy_sync_log (resource, trigger_by, credential_id, status)
         VALUES (?, ?, ?, 'RUNNING')`,
        [resource, triggerBy, credentialId || null]
    );
    return r.insertId;
}

async function finishLog(id, { status, total, upserted, deactivated, message }) {
    await pool.query(
        `UPDATE naver_taxonomy_sync_log
            SET status = ?, total_count = ?, upserted_count = ?, deactivated_count = ?,
                message = ?, finished_at = NOW()
          WHERE id = ?`,
        [status, total ?? null, upserted ?? null, deactivated ?? null, (message || '').slice(0, 500), id]
    );
}

async function writeLog({ resource, triggerBy, credentialId, status, message }) {
    await pool.query(
        `INSERT INTO naver_taxonomy_sync_log (resource, trigger_by, credential_id, status, message, finished_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [resource, triggerBy, credentialId || null, status, (message || '').slice(0, 500)]
    );
}

/** 관리자 현황 화면용 — 최근 회차 + 현재 적재 통계(카테고리 · 브랜드). */
async function getStatus() {
    const [[counts]] = await pool.query(
        `SELECT
            COUNT(*) AS total,
            SUM(is_active = 1) AS active_total,
            SUM(is_active = 1 AND is_leaf = 1) AS active_leaf,
            MAX(fetched_at) AS last_fetched_at
         FROM naver_category`
    );
    const [[brandCounts]] = await pool.query(
        `SELECT
            COUNT(*) AS total,
            SUM(is_active = 1) AS active_total,
            MAX(fetched_at) AS last_fetched_at
         FROM naver_brand`
    );
    const [logs] = await pool.query(
        `SELECT id, resource, trigger_by, status, total_count, upserted_count, deactivated_count,
                message, started_at, finished_at
           FROM naver_taxonomy_sync_log
          ORDER BY id DESC LIMIT 20`
    );
    const [[schedule]] = await pool.query('SELECT * FROM naver_taxonomy_schedule WHERE id = 1');
    const [[credRow]] = await pool.query(
        `SELECT COUNT(*) AS n FROM mall_channel_credential
          WHERE channel = 'NAVER_SMARTSTORE' AND status = 'ACTIVE' AND secret_enc IS NOT NULL`
    );
    return {
        counts: counts || { total: 0, active_total: 0, active_leaf: 0, last_fetched_at: null },
        brandCounts: brandCounts || { total: 0, active_total: 0, last_fetched_at: null },
        logs,
        schedule: schedule || null,
        hasActiveCredential: (credRow && credRow.n > 0),
    };
}

// ---- 리소스 브라우징 -------------------------------------------------------
// "네이버 리소스 관리" 화면에서 수집된 리소스를 직접 훑어보기 위한 페이징 목록.
// 검색 API(searchLeafCategories)와 달리 비활성·비리프도 볼 수 있어야 한다.

const PAGE_SIZE = 50;

/** page/size 를 안전한 정수로 정규화한다(음수·NaN·과대값 차단). */
function normalizePaging(page, size) {
    const p = Math.max(1, Math.floor(Number(page)) || 1);
    const s = Math.min(200, Math.max(1, Math.floor(Number(size)) || PAGE_SIZE));
    return { page: p, size: s, offset: (p - 1) * s };
}

/**
 * 수집된 네이버 카테고리 목록(페이징).
 * @param {{q?:string, leafOnly?:boolean, activeOnly?:boolean, level?:number, page?:number, size?:number}} opts
 */
async function listCategories(opts = {}) {
    const { page, size, offset } = normalizePaging(opts.page, opts.size);
    const where = [];
    const params = [];

    const q = String(opts.q || '').trim();
    if (q) {
        where.push('(whole_category_name LIKE ? OR name LIKE ? OR naver_category_id = ?)');
        params.push(`%${q}%`, `%${q}%`, q);
    }
    if (opts.activeOnly) where.push('is_active = 1');
    if (opts.leafOnly) where.push('is_leaf = 1');

    const level = Number(opts.level);
    if (Number.isFinite(level) && level >= 1) {
        where.push('category_level = ?');
        params.push(level);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[cnt]] = await pool.query(
        `SELECT COUNT(*) AS n FROM naver_category ${whereSql}`,
        params
    );
    const [rows] = await pool.query(
        `SELECT naver_category_id, name, whole_category_name, category_level,
                is_leaf, is_active, fetched_at
           FROM naver_category
           ${whereSql}
          ORDER BY whole_category_name ASC, naver_category_id ASC
          LIMIT ? OFFSET ?`,
        [...params, size, offset]
    );

    const total = (cnt && cnt.n) || 0;
    return { rows, total, page, size, totalPages: Math.max(1, Math.ceil(total / size)) };
}

/**
 * 수집된 네이버 브랜드 목록(페이징).
 * @param {{q?:string, activeOnly?:boolean, page?:number, size?:number}} opts
 */
async function listBrands(opts = {}) {
    const { page, size, offset } = normalizePaging(opts.page, opts.size);
    const where = [];
    const params = [];

    const q = String(opts.q || '').trim();
    if (q) {
        where.push('(name LIKE ? OR name_en LIKE ? OR naver_brand_id = ?)');
        params.push(`%${q}%`, `%${q}%`, q);
    }
    if (opts.activeOnly) where.push('is_active = 1');

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[cnt]] = await pool.query(
        `SELECT COUNT(*) AS n FROM naver_brand ${whereSql}`,
        params
    );
    const [rows] = await pool.query(
        `SELECT naver_brand_id, name, name_en, is_active, fetched_at
           FROM naver_brand
           ${whereSql}
          ORDER BY name ASC, naver_brand_id ASC
          LIMIT ? OFFSET ?`,
        [...params, size, offset]
    );

    const total = (cnt && cnt.n) || 0;
    return { rows, total, page, size, totalPages: Math.max(1, Math.ceil(total / size)) };
}

/**
 * 리프 카테고리 검색(상품 등록 위젯 autocomplete 용).
 * whole_category_name / name LIKE 검색, 활성·리프만.
 */
async function searchLeafCategories(query, limit = 20) {
    const q = String(query || '').trim();
    if (q.length < 1) return [];
    const like = `%${q}%`;
    const [rows] = await pool.query(
        `SELECT naver_category_id, name, whole_category_name
           FROM naver_category
          WHERE is_active = 1 AND is_leaf = 1
            AND (whole_category_name LIKE ? OR name LIKE ?)
          ORDER BY CHAR_LENGTH(whole_category_name) ASC
          LIMIT ?`,
        [like, like, Math.min(Number(limit) || 20, 50)]
    );
    return rows;
}

module.exports = {
    syncCategories,
    getStatus,
    searchLeafCategories,
    listCategories,
    listBrands,
    pickActiveNaverCredential,
    mapCategory,
};
