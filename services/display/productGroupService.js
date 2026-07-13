const pool = require('../../config/db');
const newArrival = require('../catalog/newArrival');

/*
 * 상품 그룹 해석 서비스 (P1 렌더 엔진)
 *  - manual   : product_group_item에 수동 등록된 상품
 *  - condition: filter_condition_json 화이트리스트 조건으로 products 동적 조회
 * 조건/정렬은 화이트리스트만 허용해 SQL 인젝션을 차단한다.
 */

const STATUS = "p.status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')";

function visibilityClause(hasUser) {
  return hasUser ? "p.visibility IN ('PUBLIC','MEMBER_ONLY')" : "p.visibility = 'PUBLIC'";
}

function parseCond(v) {
  if (!v) return {};
  if (typeof v === 'object') return v; // mysql2 JSON 컬럼은 파싱된 객체로 반환
  try { return JSON.parse(v); } catch (e) { return {}; }
}

const ORDER_MAP = {
  manual: 'p.created_at DESC',
  newest: 'p.created_at DESC',
  // 판매 시작일 최신순 — 신상품 그룹용. newest(적재순)와 다르다.
  sale_start: 'p.sale_start_date IS NULL ASC, p.sale_start_date DESC, p.id DESC',
  discount: 'p.discount_rate DESC, p.created_at DESC',
  price_asc: 'p.price ASC',
  price_desc: 'p.price DESC',
  views: 'p.view_count DESC'
};

async function getById(id) {
  if (!id) return null;
  const [rows] = await pool.query('SELECT * FROM product_group WHERE id = ? AND is_active = 1', [id]);
  return rows[0] || null;
}

async function resolve(group, { hasUser = false, limit = 8 } = {}) {
  if (!group) return [];
  const vis = visibilityClause(hasUser);
  const lim = Number(limit) > 0 ? Math.min(Number(limit), 60) : 8;
  // P5 몰 스코프 — 그룹이 속한 몰의 상품만. 없으면(레거시) 1.
  const mallId = Number(group.mall_id) || 1;

  if (group.group_type === 'manual') {
    const [rows] = await pool.query(
      `SELECT p.* FROM product_group_item pgi
       JOIN products p ON p.id = pgi.product_id
       WHERE pgi.product_group_id = ? AND p.mall_id = ? AND ${STATUS} AND ${vis}
       ORDER BY pgi.sort_order ASC, pgi.id ASC
       LIMIT ?`,
      [group.id, mallId, lim]
    );
    return rows;
  }

  // condition (화이트리스트 필터만 허용)
  const cond = parseCond(group.filter_condition_json);
  const where = [`p.mall_id = ?`, STATUS, vis];
  const params = [mallId];
  if (cond.badge) { where.push('FIND_IN_SET(?, p.product_badge)'); params.push(String(cond.badge)); }
  // 신상품(판매 시작일 기준 자동 + NEW 뱃지 강제) — 판정은 services/catalog/newArrival 이 단독으로 정의한다.
  if (cond.isNew) { const np = newArrival.newProductPredicate('p'); where.push(np.sql); params.push(...np.params); }
  if (cond.category_id) { where.push('p.category_id = ?'); params.push(Number(cond.category_id)); }
  if (cond.min_discount) { where.push('p.discount_rate >= ?'); params.push(Number(cond.min_discount)); }
  if (cond.in_stock) { where.push('p.stock > 0'); }
  const order = ORDER_MAP[group.sort_type] || ORDER_MAP.newest;

  const [rows] = await pool.query(
    `SELECT p.* FROM products p WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ?`,
    [...params, lim]
  );
  return rows;
}

module.exports = { getById, resolve };
