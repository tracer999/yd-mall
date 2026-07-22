const crypto = require('crypto');
const pool = require('../../config/db');

/*
 * 헤더 톱바 — 몰별 배너(최대 3)·알림(1) 조회.
 *
 * 렌더 규칙은 여기서 정한다(뷰는 받은 대로 그린다):
 *   - 활성이고 노출 기간 안에 있는 것만 낸다.
 *   - 배너는 slot 순으로 최대 3개. **이미지가 1순위**이고, 이미지가 없으면 대체 텍스트(message)로
 *     텍스트 배너를 그린다. 이미지도 텍스트도 없는 슬롯만 배너가 아니다.
 *     (이미지 로드 실패 시의 텍스트 폴백은 뷰가 클라이언트에서 처리한다 — 서버는 알 수 없다.)
 *   - 알림·배너가 모두 없으면 **null** 을 준다 → 뷰가 바 자체를 렌더하지 않는다.
 *
 * version 은 '닫기'의 유효 범위다. 콘텐츠가 바뀌면 값이 바뀌므로,
 * 이미 닫은 사용자에게도 새 배너·새 문구는 다시 보인다(닫기가 영구 차단이 되면 안 된다).
 */

const MAX_BANNERS = 3;

/*
 * "이 헤더 스킨이 톱바를 그리는가" 는 services/menu/headerSkins.js 의 rendersTopbar 가 답한다.
 * 스킨 카탈로그와 같은 자리에 둬야 스킨을 추가할 때 함께 눈에 들어온다.
 */

async function getTopbar(mallId) {
    const [rows] = await pool.query(`
        SELECT id, kind, slot, message, image_url, link_url, new_window, updated_at
          FROM header_topbar_item
         WHERE mall_id = ?
           AND is_active = 1
           AND (start_date IS NULL OR start_date <= CURDATE())
           AND (end_date   IS NULL OR end_date   >= CURDATE())
         ORDER BY slot ASC
    `, [mallId]);

    const banners = rows
        .filter((r) => r.kind === 'BANNER' && (r.image_url || r.message))
        .slice(0, MAX_BANNERS);
    const notice = rows.find((r) => r.kind === 'NOTICE' && r.message) || null;

    if (!notice && banners.length === 0) return null;

    const seed = [notice, ...banners]
        .filter(Boolean)
        .map((r) => `${r.id}:${new Date(r.updated_at).getTime()}`)
        .join('|');
    const version = crypto.createHash('md5').update(seed).digest('hex').slice(0, 10);

    return { notice, banners, version };
}

/** 관리자 폼용 — 비활성·기간 밖 항목까지 전부. 슬롯을 키로 준다. */
async function getTopbarForAdmin(mallId) {
    const [rows] = await pool.query(
        'SELECT * FROM header_topbar_item WHERE mall_id = ? ORDER BY slot ASC', [mallId]
    );
    const banners = {};
    for (const r of rows) if (r.kind === 'BANNER') banners[r.slot] = r;
    return {
        notice: rows.find((r) => r.kind === 'NOTICE') || null,
        banners,                       // { 1: row, 2: row, 3: row } — 빈 슬롯은 없음
        slots: [1, 2, 3],
    };
}

module.exports = { getTopbar, getTopbarForAdmin, MAX_BANNERS };
