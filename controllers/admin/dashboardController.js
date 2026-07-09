const pool = require('../../config/db');

/**
 * 관리자 대시보드 — 7개 섹션 데이터 수집 및 렌더링
 */
exports.getDashboard = async (req, res) => {
    try {
        // ── 쿼리 파라미터 ────────────────────────────────────────
        const searchRange = req.query.search_range || '30d';
        const chartPeriod = req.query.chart_period || '30d';

        // 검색통계 기간 필터
        let rangeFilter = '';
        let searchRangeLabel = '최근 30일';
        if (searchRange === '24h') {
            rangeFilter = 'AND sl.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)';
            searchRangeLabel = '최근 24시간';
        } else if (searchRange === '7d') {
            rangeFilter = 'AND sl.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
            searchRangeLabel = '최근 7일';
        } else {
            rangeFilter = 'AND sl.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
        }

        // 추이 차트 기간
        const days = chartPeriod === '90d' ? 90 : chartPeriod === '7d' ? 7 : 30;

        // ── 모든 쿼리 병렬 실행 ─────────────────────────────────
        const [
            [usersRow], [productsRow], [inquiriesRow],
            [orderCounts],
            [uvRow], [pvRow],
            [avgDurTodayRow], [avgDurYestRow],
            [bounceRow],
            [trendRows],
            [deviceRows],
            [refererRows],
            [searchRefererRows],
            [topSearchKeywords], [zeroResultKeywords],
            [popularRows],
            [kakaoSourceRows], [kakaoSummaryRow], [kakaoHourlyRows], [kakaoDowRows]
        ] = await Promise.all([
            // Q1: 회원수 + 당일 신규
            pool.query(`
                SELECT COUNT(*) AS total,
                       COALESCE(SUM(DATE(created_at) = CURDATE()), 0) AS today_new
                FROM users
            `),
            // Q2: 상품수 + 당일 신규
            pool.query(`
                SELECT COUNT(*) AS total,
                       COALESCE(SUM(DATE(created_at) = CURDATE()), 0) AS today_new
                FROM products
            `),
            // Q3: 문의 (미답변 + 오늘 접수)
            pool.query(`
                SELECT COALESCE(SUM(is_answered = 0), 0) AS unanswered,
                       COALESCE(SUM(DATE(created_at) = CURDATE()), 0) AS today_new
                FROM inquiries
            `),
            // Q4: 주문 상태별 카운트
            pool.query(`
                SELECT status, COUNT(*) AS count
                FROM orders
                WHERE status IN ('PENDING','PAID','PREPARING','SHIPPED','CANCELLED')
                GROUP BY status
            `),
            // Q5: 오늘 UV + 신규/재방문
            pool.query(`
                SELECT COUNT(*) AS uv,
                       COALESCE(SUM(is_new), 0) AS new_v,
                       COALESCE(SUM(1 - is_new), 0) AS return_v
                FROM visitor_logs
                WHERE visited_date = CURDATE()
            `),
            // Q6: 오늘 PV
            pool.query(`
                SELECT COUNT(*) AS pv
                FROM page_views
                WHERE DATE(created_at) = CURDATE()
            `),
            // Q7: 평균 체류시간 (오늘) — 세션 기준
            pool.query(`
                SELECT AVG(session_dur) AS avg_dur FROM (
                    SELECT session_id, SUM(duration) AS session_dur
                    FROM page_views
                    WHERE DATE(created_at) = CURDATE() AND duration > 0 AND session_id != ''
                    GROUP BY session_id
                ) t
            `),
            // Q8: 평균 체류시간 (어제)
            pool.query(`
                SELECT AVG(session_dur) AS avg_dur FROM (
                    SELECT session_id, SUM(duration) AS session_dur
                    FROM page_views
                    WHERE DATE(created_at) = CURDATE() - INTERVAL 1 DAY AND duration > 0 AND session_id != ''
                    GROUP BY session_id
                ) t
            `),
            // Q9: 이탈률 (1페이지 + 체류 4초 미만)
            pool.query(`
                SELECT COUNT(*) AS total_sessions,
                       COALESCE(SUM(pv_count = 1 AND duration_sec < 4), 0) AS bounce_sessions
                FROM (
                    SELECT session_id, COUNT(*) AS pv_count,
                           TIMESTAMPDIFF(SECOND, MIN(created_at), MAX(created_at)) AS duration_sec
                    FROM page_views
                    WHERE DATE(created_at) = CURDATE() AND session_id != ''
                    GROUP BY session_id
                ) t
            `),
            // Q10: 추이 데이터 (N일)
            pool.query(`
                WITH RECURSIVE dates AS (
                    SELECT CURDATE() - INTERVAL ? DAY AS dt
                    UNION ALL
                    SELECT dt + INTERVAL 1 DAY FROM dates WHERE dt < CURDATE()
                )
                SELECT
                    d.dt AS date_label,
                    COALESCE(pv.cnt, 0) AS pv_count,
                    COALESCE(uv.cnt, 0) AS uv_count,
                    COALESCE(su.cnt, 0) AS signup_count
                FROM dates d
                LEFT JOIN (
                    SELECT DATE(created_at) AS dt, COUNT(*) AS cnt
                    FROM page_views
                    WHERE created_at >= CURDATE() - INTERVAL ? DAY
                    GROUP BY DATE(created_at)
                ) pv ON d.dt = pv.dt
                LEFT JOIN (
                    SELECT visited_date AS dt, COUNT(*) AS cnt
                    FROM visitor_logs
                    WHERE visited_date >= CURDATE() - INTERVAL ? DAY
                    GROUP BY visited_date
                ) uv ON d.dt = uv.dt
                LEFT JOIN (
                    SELECT DATE(created_at) AS dt, COUNT(*) AS cnt
                    FROM users
                    WHERE created_at >= CURDATE() - INTERVAL ? DAY
                    GROUP BY DATE(created_at)
                ) su ON d.dt = su.dt
                ORDER BY d.dt ASC
            `, [days, days, days, days]),
            // Q11: 디바이스 비중 (오늘)
            pool.query(`
                SELECT device_type, COUNT(*) AS cnt
                FROM page_views
                WHERE DATE(created_at) = CURDATE()
                GROUP BY device_type
            `),
            // Q12: 유입 매체 TOP 10
            pool.query(`
                SELECT referer_host, COUNT(*) AS cnt
                FROM page_views
                WHERE DATE(created_at) >= CURDATE() - INTERVAL 30 DAY
                  AND referer_host IS NOT NULL
                  AND referer_host NOT IN ('localhost', '127.0.0.1', '')
                GROUP BY referer_host
                ORDER BY cnt DESC
                LIMIT 10
            `),
            // Q13: 외부 검색엔진 referer (키워드 파싱용)
            pool.query(`
                SELECT referer
                FROM page_views
                WHERE DATE(created_at) >= CURDATE() - INTERVAL 30 DAY
                  AND referer_host IN (
                    'www.google.com','www.google.co.kr','search.naver.com',
                    'm.search.naver.com','search.daum.net','m.search.daum.net',
                    'www.bing.com','search.yahoo.com'
                  )
                LIMIT 5000
            `),
            // Q14: 인기 검색어 TOP 10
            pool.query(
                `SELECT sl.keyword,
                        COUNT(*) AS search_count,
                        MAX(sl.created_at) AS last_searched_at,
                        SUM(CASE WHEN sl.result_count = 0 THEN 1 ELSE 0 END) AS zero_result_count
                 FROM search_logs sl
                 WHERE 1 = 1 ${rangeFilter}
                 GROUP BY keyword
                 ORDER BY search_count DESC, last_searched_at DESC
                 LIMIT 10`
            ),
            // Q15: 결과 0건 검색어
            pool.query(
                `SELECT sl.keyword,
                        COUNT(*) AS search_count,
                        MAX(sl.created_at) AS last_searched_at
                 FROM search_logs sl
                 WHERE sl.result_count = 0 ${rangeFilter}
                 GROUP BY keyword
                 ORDER BY search_count DESC, last_searched_at DESC
                 LIMIT 10`
            ),
            // Q16: 인기 상품 TOP 10 (view_count + 카카오톡 문의 전환)
            pool.query(`
                SELECT p.id, p.name, p.slug, p.main_image, p.view_count,
                       COALESCE(kc.click_count, 0) AS kakao_clicks
                FROM products p
                LEFT JOIN (
                    SELECT product_id, COUNT(*) AS click_count
                    FROM kakao_click_logs
                    GROUP BY product_id
                ) kc ON p.id = kc.product_id
                WHERE p.status = 'ON'
                ORDER BY p.view_count DESC
                LIMIT 10
            `),
            // Q17: 카카오 문의 경로 통계 (30일)
            pool.query(`
                SELECT source, source_label, COUNT(*) AS cnt
                FROM kakao_inquiry_logs
                WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                GROUP BY source, source_label
                ORDER BY cnt DESC
            `),
            // Q18: 카카오 문의 총건수 + 전월 대비
            pool.query(`
                SELECT
                    (SELECT COUNT(*) FROM kakao_inquiry_logs WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS total_30d,
                    (SELECT COUNT(*) FROM kakao_inquiry_logs WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 60 DAY) AND created_at < DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS total_prev_30d,
                    (SELECT ROUND(COUNT(*) / 30, 1) FROM kakao_inquiry_logs WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS daily_avg
            `),
            // Q19: 카카오 문의 시간대별 분포 (30일)
            pool.query(`
                SELECT HOUR(created_at) AS h, COUNT(*) AS cnt
                FROM kakao_inquiry_logs
                WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                GROUP BY h ORDER BY h
            `),
            // Q20: 카카오 문의 요일별 분포 (30일)
            pool.query(`
                SELECT DAYOFWEEK(created_at) AS dow, COUNT(*) AS cnt
                FROM kakao_inquiry_logs
                WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                GROUP BY dow ORDER BY dow
            `)
        ]);

        // ── 데이터 가공 ─────────────────────────────────────────

        // ① 운영 현황
        const users = usersRow[0];
        const products = productsRow[0];
        const inquiries = inquiriesRow[0];
        const todaySignups = Number(users.today_new) || 0;
        const uvToday = Number(uvRow[0].uv) || 0;
        const conversionRate = uvToday > 0 ? ((todaySignups / uvToday) * 100).toFixed(1) : '0.0';

        // ② 트래픽 지표
        const pvToday = Number(pvRow[0].pv) || 0;
        const newVisitors = Number(uvRow[0].new_v) || 0;
        const returningVisitors = Number(uvRow[0].return_v) || 0;
        const pvPerUv = uvToday > 0 ? (pvToday / uvToday).toFixed(1) : '0.0';

        const avgDurToday = Number(avgDurTodayRow[0].avg_dur) || 0;
        const avgDurYest = Number(avgDurYestRow[0].avg_dur) || 0;
        const avgDurationDelta = Math.round(avgDurToday - avgDurYest);

        const totalSessions = Number(bounceRow[0].total_sessions) || 0;
        const bounceSessions = Number(bounceRow[0].bounce_sessions) || 0;
        const bounceRate = totalSessions > 0 ? ((bounceSessions / totalSessions) * 100).toFixed(1) : '0.0';

        // ③ 주문 현황
        const orderStatusLabels = {
            PENDING: '대기', PAID: '결제완료', PREPARING: '배송준비',
            SHIPPED: '배송중', CANCELLED: '취소'
        };
        const orderStats = ['PENDING', 'PAID', 'PREPARING', 'SHIPPED', 'CANCELLED'].map(s => ({
            status: s,
            label: orderStatusLabels[s],
            count: (orderCounts.find(r => r.status === s) || {}).count || 0
        }));

        // ④ 추이 차트
        const trendChart = {
            labels: trendRows.map(r => {
                const d = new Date(r.date_label);
                return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            }),
            pvData: trendRows.map(r => Number(r.pv_count)),
            uvData: trendRows.map(r => Number(r.uv_count)),
            signupData: trendRows.map(r => Number(r.signup_count))
        };

        // ④ 디바이스 비중
        const deviceMap = { desktop: 0, mobile: 0, tablet: 0 };
        deviceRows.forEach(r => { deviceMap[r.device_type] = Number(r.cnt); });
        const deviceTotal = deviceMap.desktop + deviceMap.mobile + deviceMap.tablet;
        const deviceBreakdown = {
            desktop: deviceMap.desktop,
            mobile: deviceMap.mobile,
            tablet: deviceMap.tablet,
            total: deviceTotal || 0
        };

        // ⑤ 유입 매체 — referer_host를 한글 매핑
        const hostNameMap = {
            'search.naver.com': '네이버 검색', 'm.search.naver.com': '네이버 검색(모바일)',
            'www.google.com': '구글 검색', 'www.google.co.kr': '구글 검색',
            'search.daum.net': '다음 검색', 'm.search.daum.net': '다음 검색(모바일)',
            'www.instagram.com': '인스타그램', 'l.instagram.com': '인스타그램',
            'www.facebook.com': '페이스북', 'l.facebook.com': '페이스북',
            'www.youtube.com': '유튜브', 'm.youtube.com': '유튜브',
            't.co': '트위터/X', 'www.tiktok.com': '틱톡',
            'talk.naver.com': '네이버 톡톡', 'cafe.naver.com': '네이버 카페',
            'm.cafe.naver.com': '네이버 카페(모바일)',
            'blog.naver.com': '네이버 블로그', 'm.blog.naver.com': '네이버 블로그(모바일)',
            'www.bing.com': 'Bing 검색',
            'map.naver.com': '네이버 지도', 'm.map.naver.com': '네이버 지도(모바일)'
        };

        // 자사 도메인 필터링 (siteSettings에서 가져오거나 req.hostname 사용)
        const selfHost = req.hostname || 'localhost';
        const topReferers = refererRows
            .filter(r => !r.referer_host.includes(selfHost))
            .map(r => ({
                host: r.referer_host,
                label: hostNameMap[r.referer_host] || r.referer_host,
                count: Number(r.cnt)
            }));

        // ⑤ 외부 유입 키워드 파싱
        const searchParamNames = ['q', 'query', 'keyword', 'search_query', 'text'];
        const keywordCounts = {};
        searchRefererRows.forEach(row => {
            try {
                const url = new URL(row.referer);
                for (const param of searchParamNames) {
                    const val = url.searchParams.get(param);
                    if (val && val.trim()) {
                        const kw = val.trim().toLowerCase();
                        keywordCounts[kw] = (keywordCounts[kw] || 0) + 1;
                        break;
                    }
                }
            } catch (_) {}
        });
        const externalKeywords = Object.entries(keywordCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([keyword, count]) => ({ keyword, count }));

        // ⑦ 인기 상품
        const popularProducts = popularRows.map(r => ({
            id: r.id, name: r.name, slug: r.slug,
            image: r.main_image,
            viewCount: Number(r.view_count) || 0,
            kakaoClicks: Number(r.kakao_clicks) || 0
        }));

        // ⑧ 카카오 문의 경로 통계
        const kakaoTotal30d = Number(kakaoSummaryRow[0].total_30d) || 0;
        const kakaoPrev30d = Number(kakaoSummaryRow[0].total_prev_30d) || 0;
        const kakaoDelta = kakaoTotal30d - kakaoPrev30d;
        const kakaoDailyAvg = Number(kakaoSummaryRow[0].daily_avg) || 0;

        const kakaoSources = kakaoSourceRows.map(r => ({
            source: r.source,
            label: r.source_label || r.source,
            count: Number(r.cnt)
        }));

        // 시간대별 (0~23시)
        const kakaoHourly = Array(24).fill(0);
        kakaoHourlyRows.forEach(r => { kakaoHourly[Number(r.h)] = Number(r.cnt); });
        const kakaoHourlyMax = Math.max(...kakaoHourly, 1);

        // 요일별 (1=일 ~ 7=토, MySQL DAYOFWEEK)
        const dowLabels = ['일', '월', '화', '수', '목', '금', '토'];
        const kakaoDow = Array(7).fill(0);
        kakaoDowRows.forEach(r => { kakaoDow[Number(r.dow) - 1] = Number(r.cnt); });
        const kakaoDowMax = Math.max(...kakaoDow, 1);

        // ── 렌더링 ──────────────────────────────────────────────
        res.render('admin/dashboard', {
            layout: 'layouts/admin_layout',
            title: '대시보드',
            businessMetrics: {
                userTotal: Number(users.total),
                userTodayNew: todaySignups,
                productTotal: Number(products.total),
                productTodayNew: Number(products.today_new) || 0,
                inquiryUnanswered: Number(inquiries.unanswered) || 0,
                inquiryTodayNew: Number(inquiries.today_new) || 0,
                todaySignups,
                conversionRate
            },
            trafficMetrics: {
                uv: uvToday,
                newVisitors,
                returningVisitors,
                pv: pvToday,
                pvPerUv,
                avgDuration: Math.round(avgDurToday),
                avgDurationDelta,
                bounceRate: Number(bounceRate)
            },
            orderStats,
            trendChart,
            chartPeriod,
            deviceBreakdown,
            topReferers,
            externalKeywords,
            topSearchKeywords,
            zeroResultKeywords,
            searchStatsRange: { value: searchRange, label: searchRangeLabel },
            popularProducts,
            kakaoInquiryStats: {
                total: kakaoTotal30d,
                delta: kakaoDelta,
                dailyAvg: kakaoDailyAvg,
                sources: kakaoSources,
                hourly: kakaoHourly,
                hourlyMax: kakaoHourlyMax,
                dow: kakaoDow,
                dowMax: kakaoDowMax,
                dowLabels
            }
        });
    } catch (err) {
        console.error('Dashboard Error:', err);
        res.status(500).send('Server Error');
    }
};

exports.getSearchLogs = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const pageSize = 50;
        const offset = (page - 1) * pageSize;

        const startDate = req.query.start_date || '';
        const endDate = req.query.end_date || '';

        const conditions = [];
        const params = [];

        if (startDate) {
            conditions.push('DATE(sl.created_at) >= ?');
            params.push(startDate);
        }
        if (endDate) {
            conditions.push('DATE(sl.created_at) <= ?');
            params.push(endDate);
        }

        const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

        const countSql = `SELECT COUNT(*) AS count FROM search_logs sl ${whereClause}`;
        const [[totalRow]] = await pool.query(countSql, params);
        const totalCount = totalRow.count || 0;
        const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / pageSize);

        const listSql = `
            SELECT
                sl.id,
                sl.keyword,
                sl.result_count,
                sl.created_at,
                u.email AS user_email,
                u.name AS user_name
            FROM search_logs sl
            LEFT JOIN users u ON sl.user_id = u.id
            ${whereClause}
            ORDER BY sl.created_at DESC
            LIMIT ? OFFSET ?`;

        const listParams = [...params, pageSize, offset];
        const [logs] = await pool.query(listSql, listParams);

        res.render('admin/search_logs', {
            layout: 'layouts/admin_layout',
            title: '검색 로그',
            logs,
            pagination: { page, pageSize, totalCount, totalPages },
            filters: { startDate, endDate }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// ── 매체명/유형 매핑 (공용) ──────────────────────────
const HOST_NAME_MAP = {
    'search.naver.com': '네이버 검색', 'm.search.naver.com': '네이버 검색(모바일)',
    'www.google.com': '구글 검색', 'www.google.co.kr': '구글 검색',
    'search.daum.net': '다음 검색', 'm.search.daum.net': '다음 검색(모바일)',
    'www.instagram.com': '인스타그램', 'l.instagram.com': '인스타그램',
    'www.facebook.com': '페이스북', 'l.facebook.com': '페이스북',
    'www.youtube.com': '유튜브', 'm.youtube.com': '유튜브',
    't.co': '트위터/X', 'www.tiktok.com': '틱톡',
    'talk.naver.com': '네이버 톡톡', 'cafe.naver.com': '네이버 카페',
    'm.cafe.naver.com': '네이버 카페(모바일)',
    'blog.naver.com': '네이버 블로그', 'm.blog.naver.com': '네이버 블로그(모바일)',
    'www.bing.com': 'Bing 검색',
    'map.naver.com': '네이버 지도', 'm.map.naver.com': '네이버 지도(모바일)',
    'pf.kakao.com': '카카오톡'
};

const SEARCH_HOSTS = ['search.naver.com', 'm.search.naver.com', 'www.google.com', 'www.google.co.kr', 'search.daum.net', 'm.search.daum.net', 'www.bing.com'];
const SOCIAL_HOSTS = ['www.instagram.com', 'l.instagram.com', 'www.facebook.com', 'l.facebook.com', 'www.youtube.com', 'm.youtube.com', 't.co', 'www.tiktok.com', 'pf.kakao.com'];
const VIRAL_HOSTS = ['cafe.naver.com', 'm.cafe.naver.com'];
const SELF_DOMAINS = ['dev-mall.ydata.co.kr', 'ydata.co.kr', 'localhost', '127.0.0.1'];

function isSelfHost(host) {
    if (!host) return true;
    return SELF_DOMAINS.some(d => host === d || host.includes(d));
}

function classifyHost(host) {
    if (!host || isSelfHost(host)) return 'direct';
    if (SEARCH_HOSTS.includes(host)) return 'search';
    if (SOCIAL_HOSTS.includes(host)) return 'social';
    if (VIRAL_HOSTS.includes(host) || host.includes('blog.')) return 'viral';
    return 'referral';
}

// ── 유입 매체 상세 페이지 ────────────────────────────
exports.getTrafficSources = async (req, res) => {
    try {
        const periodMap = { 'today': 1, '7d': 7, '15d': 15, '1m': 30, '3m': 90, '1y': 365 };
        let period = req.query.period || '1m';
        let days;
        const customStart = req.query.start || '';
        const customEnd = req.query.end || '';

        if (period === 'custom' && customStart && customEnd) {
            const s = new Date(customStart);
            const e = new Date(customEnd);
            days = Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1);
        } else {
            days = periodMap[period] || 30;
        }

        const device = req.query.device || 'all';
        const typeFilter = req.query.type || 'all';
        const sort = req.query.sort || 'uv';

        const selfHosts = [...SELF_DOMAINS, req.hostname || 'localhost'];
        const uniqueSelfHosts = [...new Set(selfHosts)];
        const selfPlaceholders = uniqueSelfHosts.map(() => '?').join(',');

        let deviceWhere = '';
        if (device === 'desktop') deviceWhere = " AND pv.device_type = 'desktop'";
        else if (device === 'mobile') deviceWhere = " AND pv.device_type = 'mobile'";
        else if (device === 'tablet') deviceWhere = " AND pv.device_type = 'tablet'";

        // Q1: 매체별 UV, PV, 평균 체류시간, 이탈률
        const [mediaRows] = await pool.query(`
            SELECT
                COALESCE(pv.referer_host, '__direct__') AS host,
                COUNT(DISTINCT pv.session_id) AS uv,
                COUNT(*) AS pv_count,
                ROUND(AVG(pv.duration), 0) AS avg_duration,
                SUM(sub.is_bounce) AS bounce_sessions,
                COUNT(DISTINCT sub.session_id) AS total_sessions
            FROM page_views pv
            LEFT JOIN (
                SELECT session_id,
                       (COUNT(*) = 1 AND TIMESTAMPDIFF(SECOND, MIN(created_at), MAX(created_at)) < 4) AS is_bounce
                FROM page_views
                WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) ${deviceWhere.replace(/pv\./g, '')}
                GROUP BY session_id
            ) sub ON pv.session_id = sub.session_id
            WHERE pv.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
              AND (pv.referer_host IS NULL OR pv.referer_host NOT IN (${selfPlaceholders}))
              ${deviceWhere}
            GROUP BY host
            ORDER BY uv DESC
            LIMIT 20
        `, [days, days, ...uniqueSelfHosts]);

        // Q2: 전기간 UV (비교용)
        const [[prevUvRow]] = await pool.query(`
            SELECT COUNT(DISTINCT session_id) AS prev_uv
            FROM page_views
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
              AND created_at < DATE_SUB(CURDATE(), INTERVAL ? DAY)
              AND (referer_host IS NULL OR referer_host NOT IN (${selfPlaceholders}))
              ${deviceWhere}
        `, [days * 2, days, ...uniqueSelfHosts]);

        // Q3: 현재 기간 총 UV
        const [[curUvRow]] = await pool.query(`
            SELECT COUNT(DISTINCT session_id) AS cur_uv
            FROM page_views
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
              AND (referer_host IS NULL OR referer_host NOT IN (${selfPlaceholders}))
              ${deviceWhere}
        `, [days, ...uniqueSelfHosts]);

        // Q4: 총 가입 전환 (기간 내 가입자 수)
        const [[signupRow]] = await pool.query(`
            SELECT COUNT(*) AS signups FROM users
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        `, [days]);

        // Q5: 매체별 신규/재방문 비율
        const [newReturnRows] = await pool.query(`
            SELECT
                COALESCE(pv.referer_host, '__direct__') AS host,
                SUM(CASE WHEN vl.is_new = 1 THEN 1 ELSE 0 END) AS new_cnt,
                SUM(CASE WHEN vl.is_new = 0 THEN 1 ELSE 0 END) AS return_cnt
            FROM page_views pv
            LEFT JOIN visitor_logs vl ON pv.ip_address = vl.ip_address AND DATE(pv.created_at) = vl.visited_date
            WHERE pv.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
              AND (pv.referer_host IS NULL OR pv.referer_host NOT IN (${selfPlaceholders}))
              ${deviceWhere}
            GROUP BY host
        `, [days, ...uniqueSelfHosts]);

        // Q6: 매체별 일별 UV 추이 (상위 3개)
        const top3Hosts = mediaRows.slice(0, 3).map(r => r.host);
        let trendData = [];
        if (top3Hosts.length > 0) {
            const hostPlaceholders = top3Hosts.map(() => '?').join(',');
            const [trendRows] = await pool.query(`
                SELECT DATE(pv.created_at) AS dt,
                       COALESCE(pv.referer_host, '__direct__') AS host,
                       COUNT(DISTINCT pv.session_id) AS uv
                FROM page_views pv
                WHERE pv.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
                  AND (COALESCE(pv.referer_host, '__direct__') IN (${hostPlaceholders}))
                  ${deviceWhere}
                GROUP BY dt, host ORDER BY dt
            `, [days, ...top3Hosts]);
            trendData = trendRows;
        }

        // 데이터 가공
        const newReturnMap = {};
        newReturnRows.forEach(r => {
            newReturnMap[r.host] = { new_cnt: Number(r.new_cnt) || 0, return_cnt: Number(r.return_cnt) || 0 };
        });

        const typeTotals = { search: 0, social: 0, direct: 0, viral: 0, referral: 0 };
        const sources = mediaRows.map(r => {
            const host = r.host;
            const type = host === '__direct__' ? 'direct' : classifyHost(host);
            const uv = Number(r.uv);
            typeTotals[type] = (typeTotals[type] || 0) + uv;
            const nr = newReturnMap[host] || { new_cnt: 0, return_cnt: 0 };
            const totalNR = nr.new_cnt + nr.return_cnt || 1;
            const bounceRate = Number(r.total_sessions) > 0 ? Math.round(Number(r.bounce_sessions) / Number(r.total_sessions) * 100) : 0;

            return {
                host,
                label: host === '__direct__' ? '직접 접속' : (HOST_NAME_MAP[host] || host),
                type,
                uv,
                pv: Number(r.pv_count),
                avgDuration: Number(r.avg_duration) || 0,
                bounceRate,
                newPct: Math.round(nr.new_cnt / totalNR * 100),
                returnPct: Math.round(nr.return_cnt / totalNR * 100)
            };
        });

        // 매체 유형 필터
        const filtered = typeFilter === 'all' ? sources : sources.filter(s => s.type === typeFilter);

        // 정렬
        const sortFn = {
            uv: (a, b) => b.uv - a.uv,
            bounce: (a, b) => b.bounceRate - a.bounceRate,
            duration: (a, b) => b.avgDuration - a.avgDuration
        };
        if (sortFn[sort]) filtered.sort(sortFn[sort]);

        // 요약 지표
        const totalUv = Number(curUvRow.cur_uv) || 0;
        const prevUv = Number(prevUvRow.prev_uv) || 0;
        const uvDeltaPct = prevUv > 0 ? ((totalUv - prevUv) / prevUv * 100).toFixed(1) : '0';
        const totalSignups = Number(signupRow.signups) || 0;
        const convRate = totalUv > 0 ? (totalSignups / totalUv * 100).toFixed(1) : '0';
        const avgBounce = filtered.length > 0 ? Math.round(filtered.reduce((s, r) => s + r.bounceRate, 0) / filtered.length) : 0;

        // 최고 전환율 매체 (전환 데이터가 없으므로 이탈률이 가장 낮은 매체)
        const bestMedia = [...filtered].sort((a, b) => a.bounceRate - b.bounceRate)[0];

        // 유형별 비중
        const typeTotal = Object.values(typeTotals).reduce((a, b) => a + b, 0) || 1;
        const typeBreakdown = [
            { type: 'search', label: '검색', color: '#378ADD', pct: Math.round(typeTotals.search / typeTotal * 100) },
            { type: 'direct', label: '직접', color: '#1D9E75', pct: Math.round(typeTotals.direct / typeTotal * 100) },
            { type: 'social', label: 'SNS', color: '#EF9F27', pct: Math.round(typeTotals.social / typeTotal * 100) },
            { type: 'viral', label: '바이럴', color: '#E5507E', pct: Math.round(typeTotals.viral / typeTotal * 100) },
            { type: 'referral', label: '레퍼럴', color: '#7F77DD', pct: Math.round(typeTotals.referral / typeTotal * 100) }
        ];

        // 추이 차트 데이터
        const trendChart = {};
        if (top3Hosts.length > 0) {
            const dates = [...new Set(trendData.map(r => r.dt))].sort();
            const dateLabels = dates.map(d => {
                const dd = new Date(d);
                return `${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
            });
            const colors = ['#378ADD', '#1D9E75', '#EF9F27'];
            const datasets = top3Hosts.map((h, i) => {
                const label = h === '__direct__' ? '직접 접속' : (HOST_NAME_MAP[h] || h);
                const data = dates.map(d => {
                    const found = trendData.find(r => r.dt === d && r.host === h);
                    return found ? Number(found.uv) : 0;
                });
                return { label, data, color: colors[i] || '#999' };
            });
            trendChart.labels = dateLabels;
            trendChart.datasets = datasets;
        }

        const typeTagClass = { search: 'bg-blue-100 text-blue-700', social: 'bg-amber-100 text-amber-700', direct: 'bg-green-100 text-green-700', viral: 'bg-pink-100 text-pink-700', referral: 'bg-purple-100 text-purple-700' };
        const typeLabels = { search: '검색', social: 'SNS', direct: '직접', viral: '바이럴', referral: '레퍼럴' };

        res.render('admin/traffic_sources_detail', {
            layout: 'layouts/admin_layout',
            title: '유입 매체 상세',
            sources: filtered,
            summary: { totalUv, uvDeltaPct, avgBounce, totalSignups, convRate, bestMedia },
            typeBreakdown,
            trendChart,
            typeTagClass,
            typeLabels,
            filters: { period, device, type: typeFilter, sort, days, start: customStart, end: customEnd }
        });
    } catch (err) {
        console.error('TrafficSources Error:', err);
        res.status(500).send('Server Error');
    }
};

// ── 드릴다운 AJAX ────────────────────────────────────
exports.getTrafficSourceDrill = async (req, res) => {
    try {
        const host = req.query.host;
        const days = parseInt(req.query.days) || 30;
        if (!host) return res.json({ pages: [], trend: [] });

        const hostCondition = host === '__direct__'
            ? 'referer_host IS NULL'
            : 'referer_host = ?';
        const hostParams = host === '__direct__' ? [] : [host];

        // 진입 URL TOP 5
        const [pages] = await pool.query(`
            SELECT page_url, COUNT(DISTINCT session_id) AS uv
            FROM page_views
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) AND ${hostCondition}
            GROUP BY page_url ORDER BY uv DESC LIMIT 5
        `, [days, ...hostParams]);

        // 일별 UV 추이
        const [trend] = await pool.query(`
            SELECT DATE(created_at) AS dt, COUNT(DISTINCT session_id) AS uv
            FROM page_views
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) AND ${hostCondition}
            GROUP BY dt ORDER BY dt
        `, [days, ...hostParams]);

        // 유입 검색어 (referer에서 추출)
        const [referers] = await pool.query(`
            SELECT referer FROM page_views
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) AND ${hostCondition}
              AND referer IS NOT NULL
            LIMIT 500
        `, [days, ...hostParams]);

        const searchParamNames = ['q', 'query', 'keyword', 'search_query', 'text'];
        const kwCounts = {};
        referers.forEach(r => {
            try {
                const url = new URL(r.referer);
                for (const p of searchParamNames) {
                    const val = url.searchParams.get(p);
                    if (val && val.trim()) { const kw = val.trim().toLowerCase(); kwCounts[kw] = (kwCounts[kw] || 0) + 1; break; }
                }
            } catch (_) {}
        });
        const keywords = Object.entries(kwCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([kw, cnt]) => ({ keyword: kw, count: cnt }));

        res.json({
            pages: pages.map(p => ({ url: p.page_url, uv: Number(p.uv) })),
            trend: trend.map(t => ({ date: t.dt, uv: Number(t.uv) })),
            keywords
        });
    } catch (err) {
        console.error('TrafficSource Drill Error:', err);
        res.json({ pages: [], trend: [], keywords: [] });
    }
};

// ── 인기 상품 TOP 10 상세 페이지 ─────────────────────
exports.getPopularProducts = async (req, res) => {
    try {
        const periodMap = { 'today': 1, '7d': 7, '30d': 30, '3m': 90 };
        let period = req.query.period || '30d';
        const customStart = req.query.start || '';
        const customEnd = req.query.end || '';
        let days;
        if (period === 'custom' && customStart && customEnd) {
            days = Math.max(1, Math.ceil((new Date(customEnd) - new Date(customStart)) / (1000 * 60 * 60 * 24)) + 1);
        } else {
            days = periodMap[period] || 30;
        }

        const categoryFilter = req.query.category || '';
        const inquiryFilter = req.query.inquiryFilter || 'all';
        const sort = req.query.sort || 'pv';

        // Q1: 상품별 PV (page_views에서 상품 URL 매칭)
        const [pvRows] = await pool.query(`
            SELECT p.id, p.name, p.slug, p.main_image, p.category_id,
                   c.name AS category_name,
                   COUNT(*) AS pv,
                   COUNT(DISTINCT pv_tbl.session_id) AS sessions,
                   ROUND(AVG(NULLIF(pv_tbl.duration, 0)), 0) AS avg_duration
            FROM page_views pv_tbl
            JOIN products p ON (
                pv_tbl.page_url = CONCAT('/products/', p.slug)
                OR pv_tbl.page_url = CONCAT('/products/view/', p.id)
                OR pv_tbl.page_url LIKE CONCAT('/products/', p.slug, '?%')
            )
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE pv_tbl.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
              AND p.status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')
            GROUP BY p.id
            ORDER BY pv DESC
            LIMIT 50
        `, [days]);

        // Q2: 상품별 카카오 문의 수
        const [inquiryRows] = await pool.query(`
            SELECT product_id, COUNT(*) AS cnt
            FROM kakao_inquiry_logs
            WHERE source = 'product_detail'
              AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
              AND product_id IS NOT NULL
            GROUP BY product_id
        `, [days]);
        const inquiryMap = {};
        inquiryRows.forEach(r => { inquiryMap[r.product_id] = Number(r.cnt); });

        // Q3: 상품별 이탈률
        const productIds = pvRows.map(r => r.id);
        let bounceMap = {};
        if (productIds.length > 0) {
            const placeholders = productIds.map(() => '?').join(',');
            const [bounceRows] = await pool.query(`
                SELECT p.id AS product_id,
                       COUNT(DISTINCT sub.session_id) AS total_sessions,
                       COALESCE(SUM(sub.is_bounce), 0) AS bounce_sessions
                FROM products p
                JOIN page_views pv_tbl ON (
                    pv_tbl.page_url = CONCAT('/products/', p.slug)
                    OR pv_tbl.page_url = CONCAT('/products/view/', p.id)
                    OR pv_tbl.page_url LIKE CONCAT('/products/', p.slug, '?%')
                )
                LEFT JOIN (
                    SELECT session_id,
                           (COUNT(*) = 1 AND TIMESTAMPDIFF(SECOND, MIN(created_at), MAX(created_at)) < 4) AS is_bounce
                    FROM page_views
                    WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
                    GROUP BY session_id
                ) sub ON pv_tbl.session_id = sub.session_id
                WHERE p.id IN (${placeholders})
                  AND pv_tbl.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
                GROUP BY p.id
            `, [days, ...productIds, days]);
            bounceRows.forEach(r => {
                const total = Number(r.total_sessions) || 1;
                bounceMap[r.product_id] = Math.round(Number(r.bounce_sessions) / total * 100);
            });
        }

        // Q4: 일별 PV 추이 (상위 10개 상품, 최근 7일)
        let trendMap = {};
        const top10Ids = pvRows.slice(0, 10).map(r => r.id);
        if (top10Ids.length > 0) {
            const placeholders = top10Ids.map(() => '?').join(',');
            const [trendRows] = await pool.query(`
                SELECT p.id AS product_id, DATE(pv_tbl.created_at) AS dt, COUNT(*) AS cnt
                FROM page_views pv_tbl
                JOIN products p ON (
                    pv_tbl.page_url = CONCAT('/products/', p.slug)
                    OR pv_tbl.page_url = CONCAT('/products/view/', p.id)
                    OR pv_tbl.page_url LIKE CONCAT('/products/', p.slug, '?%')
                )
                WHERE p.id IN (${placeholders})
                  AND pv_tbl.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
                GROUP BY p.id, dt ORDER BY dt
            `, [...top10Ids]);
            trendRows.forEach(r => {
                if (!trendMap[r.product_id]) trendMap[r.product_id] = [];
                trendMap[r.product_id].push(Number(r.cnt));
            });
        }

        // Q5: 카테고리 목록
        const [categories] = await pool.query("SELECT id, name FROM categories WHERE type = 'NORMAL' ORDER BY display_order ASC");

        // 데이터 가공
        let products = pvRows.map((r, idx) => {
            const pv = Number(r.pv);
            const inquiries = inquiryMap[r.id] || 0;
            const bounceRate = bounceMap[r.id] || 0;
            const avgDur = Number(r.avg_duration) || 0;
            const trend = trendMap[r.id] || [];
            const trendMax = Math.max(...trend, 1);

            return {
                rank: idx + 1,
                id: r.id,
                name: r.name,
                slug: r.slug,
                categoryId: r.category_id,
                categoryName: r.category_name || '-',
                pv,
                avgDuration: avgDur,
                durationStr: `${Math.floor(avgDur / 60)}:${String(avgDur % 60).padStart(2, '0')}`,
                bounceRate,
                inquiries,
                trend,
                trendMax
            };
        });

        // 카테고리 필터
        if (categoryFilter) {
            products = products.filter(p => String(p.categoryId) === categoryFilter);
        }

        // 문의 상태 필터
        if (inquiryFilter === 'zero') {
            products = products.filter(p => p.inquiries === 0);
        } else if (inquiryFilter === 'nonzero') {
            products = products.filter(p => p.inquiries > 0);
        }

        // 정렬
        const sortFns = {
            pv: (a, b) => b.pv - a.pv,
            inquiry: (a, b) => b.inquiries - a.inquiries,
            duration: (a, b) => b.avgDuration - a.avgDuration,
            bounce: (a, b) => b.bounceRate - a.bounceRate
        };
        if (sortFns[sort]) products.sort(sortFns[sort]);

        // 상위 10개로 제한
        products = products.slice(0, 10);

        // 요약 지표
        const totalPv = products.reduce((s, p) => s + p.pv, 0);
        const totalInquiries = products.reduce((s, p) => s + p.inquiries, 0);
        const zeroInquiryCount = products.filter(p => p.inquiries === 0).length;
        const avgPvPerProduct = products.length > 0 ? (totalPv / products.length).toFixed(1) : '0';
        const conversionRate = totalPv > 0 ? (totalInquiries / totalPv * 100).toFixed(1) : '0';
        const topProduct = products[0] || null;
        const maxPv = products.length > 0 ? products[0].pv : 1;

        // 문의 0건 상품 목록 (경고 배너용)
        const zeroInquiryProducts = products.filter(p => p.inquiries === 0);

        res.render('admin/popular_products_detail', {
            layout: 'layouts/admin_layout',
            title: '인기 상품 TOP 10 상세',
            products,
            categories,
            summary: { totalPv, totalInquiries, zeroInquiryCount, avgPvPerProduct, conversionRate, topProduct },
            zeroInquiryProducts,
            maxPv,
            filters: { period, start: customStart, end: customEnd, category: categoryFilter, inquiryFilter, sort, days }
        });
    } catch (err) {
        console.error('PopularProducts Error:', err);
        res.status(500).send('Server Error');
    }
};
