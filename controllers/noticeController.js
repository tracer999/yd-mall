const pool = require('../config/db');

function decodeHtmlEntities(value) {
    if (!value || typeof value !== 'string') return value;

    const decodeOnce = (input) => {
        let out = input
            .replace(/&(#x[0-9a-fA-F]+|#\d+);/g, (m, code) => {
                if (code.startsWith('#x') || code.startsWith('#X')) {
                    const num = parseInt(code.slice(2), 16);
                    return Number.isFinite(num) ? String.fromCharCode(num) : m;
                }
                const num = parseInt(code.slice(1), 10);
                return Number.isFinite(num) ? String.fromCharCode(num) : m;
            })
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, '&');
        return out;
    };

    let prev = null;
    let cur = value;
    for (let i = 0; i < 3 && cur !== prev; i++) {
        prev = cur;
        cur = decodeOnce(cur);
    }
    return cur;
}

exports.getList = async (req, res) => {
    try {
        const [notices] = await pool.query('SELECT * FROM notices ORDER BY importance DESC, created_at DESC');

        const siteSettings = res.locals.siteSettings || {};
        const companyName = siteSettings.company_name || '와이디몰';
        const domain = ((global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr').replace(/\/$/, '');

        const seo = {
            title: `공지사항 | ${companyName}`,
            description: `${companyName}의 최신 공지사항을 확인하세요.`,
            url: `${domain}/notices`,
            image: '',
            type: 'website',
            siteName: companyName,
            robots: 'index,follow',
            jsonLd: null
        };

        res.render('user/notices/list', {
            title: '공지사항',
            notices,
            seo
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getDetail = async (req, res) => {
    const id = req.params.id;
    try {
        await pool.query('UPDATE notices SET view_count = view_count + 1 WHERE id = ?', [id]);
        
        const [rows] = await pool.query('SELECT * FROM notices WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).render('user/404', {
                title: '공지사항을 찾을 수 없습니다',
                seo: { ...res.locals.seo, title: '공지사항을 찾을 수 없습니다', robots: 'noindex,follow' }
            });
        }

        const notice = rows[0];
        notice.content = decodeHtmlEntities(notice.content);
        
        const siteSettings = res.locals.siteSettings || {};
        const companyName = siteSettings.company_name || '와이디몰';
        const domain = ((global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr').replace(/\/$/, '');

        const seo = {
            title: `${notice.title} | 공지사항 | ${companyName}`,
            description: notice.content ? notice.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 150) : '',
            url: `${domain}/notices/${id}`,
            image: '',
            type: 'article',
            siteName: companyName,
            robots: 'index,follow',
            jsonLd: null
        };

        res.render('user/notices/detail', {
            title: notice.title,
            notice,
            seo
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
