const pool = require('../config/db');
const { sanitize } = require('../services/display/htmlSanitizer');

/*
 * 고객센터 컨트롤러 (M8)
 *
 * 캡처 구조 (docs/사이트개선/capture/image copy.png):
 *   좌 LNB : 1:1문의하기 / 1:1문의내역 / 공지사항 / 자주묻는질문(분류) / 비회원 주문조회 / 대표번호
 *   본문   : FAQ 검색 → 자주묻는질문 BEST 10 (아코디언) → 공지사항 목록
 *   우측   : 전역 유틸 레일 (main_layout 이 렌더)
 *
 * FAQ 답변은 HTML 이므로 렌더 직전 반드시 새니타이즈한다.
 */

const BEST_LIMIT = 10;
const NOTICE_LIMIT = 5;
const SEARCH_LIMIT = 30;

/** FAQ 답변 HTML 을 안전하게 변환 */
function sanitizeFaqs(rows) {
    return rows.map(f => Object.assign({}, f, { answer: sanitize(f.answer) }));
}

async function loadCategories() {
    const [rows] = await pool.query(`
        SELECT c.id, c.code, c.name, COUNT(f.id) AS faq_count
        FROM faq_category c
        LEFT JOIN faq f ON f.category_id = c.id AND f.is_active = 1
        WHERE c.mall_id = 1 AND c.is_active = 1
        GROUP BY c.id, c.code, c.name
        ORDER BY c.sort_order ASC, c.id ASC
    `);
    return rows;
}

/*
 * 공지사항은 `notices` 테이블에 있고, 배포 시점에 따라 `type`/`is_deleted` 컬럼이
 * 없을 수 있다(boardController 와 동일한 런타임 탐지). 컬럼 정보는 1회만 캐시한다.
 */
let noticeColsCache = null;
async function getNoticeColumns() {
    if (noticeColsCache) return noticeColsCache;
    const [cols] = await pool.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notices'`
    );
    const names = cols.map(c => c.COLUMN_NAME);
    noticeColsCache = {
        hasType: names.includes('type'),
        hasIsDeleted: names.includes('is_deleted'),
        hasImportance: names.includes('importance'),
    };
    return noticeColsCache;
}

async function loadNotices(limit = NOTICE_LIMIT) {
    const { hasType, hasIsDeleted, hasImportance } = await getNoticeColumns();

    const where = [];
    const params = [];
    if (hasType) { where.push('type = ?'); params.push('NOTICE'); }
    if (hasIsDeleted) where.push('is_deleted = 0');

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const orderBy = hasImportance ? 'importance DESC, created_at DESC' : 'created_at DESC';

    const [rows] = await pool.query(`
        SELECT id, title, created_at
        FROM notices
        ${whereClause}
        ORDER BY ${orderBy}, id DESC
        LIMIT ?
    `, [...params, limit]);
    return rows;
}

/**
 * GET /cs
 * 고객센터 메인 — FAQ BEST 10 + 공지사항
 */
exports.getIndex = async (req, res, next) => {
    try {
        const [categories, notices] = await Promise.all([loadCategories(), loadNotices()]);

        const [best] = await pool.query(`
            SELECT f.id, f.question, f.answer, f.view_count, c.name AS category_name
            FROM faq f
            LEFT JOIN faq_category c ON c.id = f.category_id
            WHERE f.mall_id = 1 AND f.is_active = 1
            ORDER BY f.is_best DESC, f.view_count DESC, f.sort_order ASC, f.id ASC
            LIMIT ?
        `, [BEST_LIMIT]);

        res.render('user/cs/index', {
            title: '고객센터',
            categories,
            faqs: sanitizeFaqs(best),
            notices,
            activeCategoryId: null,
            keyword: '',
            seo: Object.assign({}, res.locals.seo, {
                title: '고객센터',
                description: '자주 묻는 질문과 공지사항을 확인하세요.',
            }),
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /cs/faq?categoryId=&q=
 * 분류별 FAQ 목록 / 검색 결과
 */
exports.getFaq = async (req, res, next) => {
    try {
        const categoryId = Number(req.query.categoryId) || null;
        const keyword = (req.query.q || '').trim().slice(0, 100);

        const where = ['f.mall_id = 1', 'f.is_active = 1'];
        const params = [];
        if (categoryId) { where.push('f.category_id = ?'); params.push(categoryId); }
        if (keyword) {
            // LIKE 와일드카드는 파라미터로 전달 (문자열 결합 금지)
            where.push('(f.question LIKE ? OR f.answer LIKE ?)');
            params.push(`%${keyword}%`, `%${keyword}%`);
        }

        const [categories, notices] = await Promise.all([loadCategories(), loadNotices()]);
        const [rows] = await pool.query(`
            SELECT f.id, f.question, f.answer, f.view_count, c.name AS category_name
            FROM faq f
            LEFT JOIN faq_category c ON c.id = f.category_id
            WHERE ${where.join(' AND ')}
            ORDER BY f.sort_order ASC, f.id ASC
            LIMIT ?
        `, [...params, SEARCH_LIMIT]);

        res.render('user/cs/index', {
            title: '고객센터',
            categories,
            faqs: sanitizeFaqs(rows),
            notices,
            activeCategoryId: categoryId,
            keyword,
            seo: Object.assign({}, res.locals.seo, {
                title: keyword ? `'${keyword}' 검색 결과 | 고객센터` : '자주 묻는 질문',
                robots: 'noindex,follow',
            }),
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /cs/faq/:id/view
 * FAQ 조회수 증가 (아코디언 펼침 시 비동기 호출)
 */
exports.postFaqView = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ success: false });
        await pool.query('UPDATE faq SET view_count = view_count + 1 WHERE id = ? AND is_active = 1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};
