/*
 * 리소스 관리 (몰 관리 하위, super_admin) — 몰 빌더의 "기본 리소스" 조회.
 * 설계: docs/사이트개선/네이버_카테고리_리소스_설계.md §5
 *
 * 보여주는 것(조회 전용):
 *   1) 네이버 수집 카테고리 리소스 — 통계 + [지금 업데이트](수동 수집) + 리프 검색
 *   2) 네이버 수집 브랜드 리소스 — 통계(골격)
 *   3) 샘플 상품 — 선택 몰(기본: 기본몰)의 상품 미리보기
 *
 * ⚠ 이 화면은 리소스를 "보는" 곳이다. 네이버 [지금 업데이트] 외에는 변경하지 않는다.
 *   네이버 카테고리는 몰 categories 에 자동 반영되지 않는다(참조 리소스).
 */

const pool = require('../../config/db');
const naverTaxonomy = require('../../services/sourcing/naverTaxonomySync');

const BASE = '/admin/resources';
const SAMPLE_LIMIT = 24;

async function getDefaultMallId() {
    const [[row]] = await pool.query(
        'SELECT id FROM mall WHERE is_default = 1 ORDER BY id ASC LIMIT 1'
    );
    return row ? row.id : 1;
}

exports.getIndex = async (req, res) => {
    try {
        const [malls] = await pool.query('SELECT id, code, name, is_default FROM mall ORDER BY is_default DESC, id ASC');

        const defaultMallId = await getDefaultMallId();
        const requested = Number(req.query.mall);
        const selectedMallId = malls.some((m) => Number(m.id) === requested) ? requested : defaultMallId;

        const [naverStatus, [[brandCount]], [[productCount]], [sampleProducts]] = await Promise.all([
            naverTaxonomy.getStatus(),
            pool.query("SELECT COUNT(*) AS n FROM naver_brand WHERE is_active = 1"),
            pool.query('SELECT COUNT(*) AS n FROM products WHERE mall_id = ?', [selectedMallId]),
            pool.query(
                `SELECT p.id, p.name, p.price, p.status, p.thumbnail_image, p.main_image,
                        c.name AS category_name
                   FROM products p
                   LEFT JOIN categories c ON c.id = p.category_id
                  WHERE p.mall_id = ?
                  ORDER BY p.id DESC
                  LIMIT ?`,
                [selectedMallId, SAMPLE_LIMIT]
            ),
        ]);

        res.render('admin/resources/index', {
            layout: 'layouts/admin_layout',
            title: '리소스 관리',
            subtitle: '몰 빌더가 상품 등록·구성에 쓰는 기본 리소스입니다. (네이버 수집 카테고리/브랜드 · 샘플 상품)',
            naverStatus,
            naverBrandCount: (brandCount && brandCount.n) || 0,
            malls,
            selectedMallId,
            sampleProducts,
            sampleTotal: (productCount && productCount.n) || 0,
            sampleLimit: SAMPLE_LIMIT,
            msg: req.query.msg || '',
            error: req.query.error || '',
        });
    } catch (e) {
        console.error('[resources] getIndex:', e.message);
        res.status(500).send('리소스 관리 화면을 불러오지 못했습니다: ' + e.message);
    }
};

// 네이버 카테고리 "지금 업데이트" — 수동 수집(백그라운드) 후 리다이렉트.
exports.postNaverRefresh = async (req, res) => {
    naverTaxonomy.syncCategories({ triggerBy: 'MANUAL' })
        .then((r) => console.log('[resources] 네이버 수동 수집 결과:', JSON.stringify(r)))
        .catch((e) => console.error('[resources] 네이버 수동 수집 실패:', e.message));
    res.redirect(`${BASE}?msg=` + encodeURIComponent('네이버 카테고리 수집을 시작했습니다. 잠시 후 새로고침해 결과를 확인하세요.'));
};

// 네이버 리프 카테고리 검색(JSON) — 이 화면의 브라우징 검색용.
exports.getNaverSearch = async (req, res) => {
    try {
        const rows = await naverTaxonomy.searchLeafCategories(req.query.q, req.query.limit);
        res.json({ success: true, data: rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};
