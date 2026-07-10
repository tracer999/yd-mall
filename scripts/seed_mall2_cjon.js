#!/usr/bin/env node
/**
 * mall 2 (종합관) 시드 — datapicker(CJ온스타일) 수집 데이터 기반. 카테고리 3뎁스 + 상품 + GNB + 홈
 *
 * 실행:  node scripts/seed_mall2_cjon.js
 * 제거:  node scripts/seed_mall2_cjon.js --remove
 *
 * ⚠️ 운영 DB 와 개발 DB 가 동일하다. 이 스크립트는 mall 2 의 기존 데이터를 **전부 지우고**
 *    다시 만든다(사용자 승인 2026-07-10: "기존 데이터는 테스트 데이터이므로 지우고 넣을 것").
 *
 * ⚠️ 출처: display.cjonstyle.com 수집물. 상품명·브랜드명·이미지가 실제 CJ온스타일 자산이다.
 *    seed_mall2_general.js 의 "남의 데이터를 복사하지 않는다" 방침을 사용자 승인 하에 뒤집었다.
 *    mall 2 는 `?mall=2` 세션 전환으로만 도달하며 기본 몰이 아니다.
 *
 * 코드 계약(검증됨):
 *   - getList 는 navigationService.getCategoryContext 로 **서브트리 집계**한다 → 부모 노드에
 *     상품이 없어도 자식 상품이 올라온다. 단 리프에 상품이 없으면 그 리프는 빈 목록이 된다.
 *     그래서 **상품이 배정된 노드와 그 조상만** 생성한다(빈 리프 0).
 *   - 카테고리명은 CJ 트리에 76건 중복(예: '반팔'이 3곳)이 있다 → upsert 키는 name 이 아니라 slug.
 *   - getCategoryTree/loadHomeCategories 는 type='NORMAL' AND mall_id 만 GNB·홈에 올린다.
 *   - product_grid_section.ejs 는 sectionClass/badgeText/badgeClass/moreHref/moreBtnClass 를
 *     가드 없이 참조한다 → config 에 반드시 넣는다.
 *
 * 저장하지 않는 원본 필드: rating, review_count(products 에 컬럼 없음. reviews 는 실제 user_id FK 가
 * 필요해 집계값만 넣을 수 없다), free_delivery, ranking(뱃지 산출에만 사용), product_url.
 */
require('../config/env');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const MALL_ID = 2;
const DATA_DIR = '/home/ikcho/dev/datapicker/data';
const isRemove = process.argv.includes('--remove');

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));

/* ────────────────────────────── 1. 원본 로드 · 정제 ────────────────────────────── */

function buildDataset() {
  const cats = readJson('categories.json').items;
  const best = readJson('best_products.json').items;
  const search = readJson('search_products.json').items;

  const cmap = new Map(cats.map((c) => [c.category_id, c]));
  const kids = new Map();
  for (const c of cats) {
    if (!c.parent_category_id) continue;
    if (!kids.has(c.parent_category_id)) kids.set(c.parent_category_id, []);
    kids.get(c.parent_category_id).push(c);
  }

  // dedup: search 를 기준으로 두고 best 는 rating/ranking 만 얹는다.
  // best 의 category_id 는 대분류(level 1)라, 덮어쓰면 18건이 중분류 배치를 잃는다.
  const merged = new Map();
  for (const p of search) merged.set(p.product_id, { ...p });
  for (const p of best) {
    const cur = merged.get(p.product_id);
    if (cur) {
      cur.ranking = p.ranking;
      cur.rating = cur.rating ?? p.rating;
      cur.fromBest = true;
    } else {
      merged.set(p.product_id, { ...p, fromBest: true });
    }
  }

  // price NOT NULL / 이미지 없는 행 제외 (렌탈·상담 상품 등)
  const items = [...merged.values()].filter((p) => p.sale_price && p.image_url);

  // 소분류 배정: 상품명에 소분류명이 들어가면 그 리프로 내린다. 실패하면 중분류에 남긴다.
  const tokens = (n) => n.split(/[/·,]/).filter((t) => t.length >= 2);
  for (const p of items) {
    p.targetCat = p.category_id;
    const subs = kids.get(p.category_id) || [];
    if (!subs.length) continue;
    let hit = subs.find((s) => p.product_name.includes(s.category_name));
    if (!hit) hit = subs.find((s) => tokens(s.category_name).some((t) => p.product_name.includes(t)));
    if (hit) p.targetCat = hit.category_id;
  }

  // 살릴 카테고리 = 상품이 배정된 노드 + 그 조상 전부
  const keep = new Set();
  for (const p of items) {
    let cur = p.targetCat;
    while (cur) {
      keep.add(cur);
      cur = cmap.get(cur).parent_category_id;
    }
  }

  // NEW 뱃지: 등록일이 원본에 없다. product_id 가 증가 코드이므로 최신 200건을 신상품으로 본다.
  const newest = new Set(
    [...items].sort((a, b) => Number(b.product_id) - Number(a.product_id)).slice(0, 200).map((p) => p.product_id)
  );

  for (const p of items) {
    const badges = [];
    if (p.fromBest && p.ranking && p.ranking <= 20) badges.push('BEST');
    if (newest.has(p.product_id)) badges.push('NEW');
    if (p.discount_rate >= 30) badges.push('DEADLINE_SALE');
    p.badge = badges.length ? badges.join(',') : null;
  }

  return { cats, cmap, keep, items };
}

/* ────────────────────────────── 2. 제거 ────────────────────────────── */

async function removeAll(conn) {
  // hero_slide 가 products 를 FK 참조한다 → 상품보다 먼저 지운다.
  const [hs] = await conn.query('DELETE FROM hero_slide WHERE mall_id = ?', [MALL_ID]);
  await conn.query('DELETE gi FROM product_group_item gi JOIN product_group g ON g.id = gi.product_group_id WHERE g.mall_id = ?', [MALL_ID]);
  const [ps] = await conn.query('DELETE ps FROM page_section ps JOIN page pg ON pg.id = ps.page_id WHERE pg.mall_id = ?', [MALL_ID]);
  const [pg] = await conn.query('DELETE FROM page WHERE mall_id = ?', [MALL_ID]);
  const [g] = await conn.query('DELETE FROM product_group WHERE mall_id = ?', [MALL_ID]);
  const [p] = await conn.query('DELETE FROM products WHERE mall_id = ?', [MALL_ID]);
  const [c3] = await conn.query('DELETE FROM categories WHERE mall_id = ? AND depth = 3', [MALL_ID]);
  const [c2] = await conn.query('DELETE FROM categories WHERE mall_id = ? AND depth = 2', [MALL_ID]);
  const [c1] = await conn.query('DELETE FROM categories WHERE mall_id = ? AND depth = 1', [MALL_ID]);
  console.log(`  - 상품 ${p.affectedRows} / 카테고리 ${c1.affectedRows + c2.affectedRows + c3.affectedRows} / 상품그룹 ${g.affectedRows} / 페이지 ${pg.affectedRows}(섹션 ${ps.affectedRows}) / 히어로 ${hs.affectedRows}`);
}

/** 삭제해도 안전한지(주문·장바구니·찜 등 실사용 참조가 없는지) 먼저 본다. */
async function assertSafeToWipe(conn) {
  const refs = [
    ['order_items', 'order_items oi JOIN products p ON p.id = oi.product_id'],
    ['carts', 'carts c JOIN products p ON p.id = c.product_id'],
    ['likes', 'likes l JOIN products p ON p.id = l.product_id'],
    ['reviews', 'reviews r JOIN products p ON p.id = r.product_id'],
    ['recent_views', 'recent_views v JOIN products p ON p.id = v.product_id'],
    ['kakao_click_logs', 'kakao_click_logs k JOIN products p ON p.id = k.product_id'],
    ['shopify_product_mappings', 'shopify_product_mappings s JOIN products p ON p.id = s.product_id'],
  ];
  const blocking = [];
  for (const [name, from] of refs) {
    const [[r]] = await conn.query(`SELECT COUNT(*) n FROM ${from} WHERE p.mall_id = ?`, [MALL_ID]);
    if (r.n > 0) blocking.push(`${name}=${r.n}`);
  }
  if (blocking.length) {
    throw new Error(`mall ${MALL_ID} 상품에 실사용 참조가 있어 중단: ${blocking.join(', ')}`);
  }
}

/* ────────────────────────────── 3. 시드 ────────────────────────────── */

const catSlug = (cid) => `cj-${String(cid).toLowerCase()}`;
const prodSlug = (pid) => `cj-${pid}`;

async function seedCategories(conn, ds) {
  const { cats, keep } = ds;
  const idMap = new Map(); // CJ category_id → DB categories.id
  // 얕은 depth 부터 넣어야 parent_id 가 잡힌다.
  for (const level of [1, 2, 3]) {
    const rows = cats.filter((c) => c.category_level === level && keep.has(c.category_id));
    let order = 0;
    for (const c of rows) {
      order += 1;
      const parentId = c.parent_category_id ? idMap.get(c.parent_category_id) : null;
      const [r] = await conn.query(
        `INSERT INTO categories (mall_id,name,slug,parent_id,depth,type,display_order,is_active,pc_visible,mobile_visible)
         VALUES (?,?,?,?,?,'NORMAL',?,1,1,1)`,
        [MALL_ID, c.category_name, catSlug(c.category_id), parentId, level, order]
      );
      idMap.set(c.category_id, r.insertId);
    }
    console.log(`  depth ${level}: ${rows.length}개`);
  }
  return idMap;
}

async function seedProducts(conn, ds, idMap) {
  const { cmap, items } = ds;
  const COLS = '(mall_id,category_id,name,product_code,provider,short_description,price,original_price,discount_rate,stock,status,visibility,main_image,thumbnail_image,slug,product_badge)';
  const CHUNK = 500;
  let done = 0;

  for (let i = 0; i < items.length; i += CHUNK) {
    const slice = items.slice(i, i + CHUNK);
    const values = [];
    const rows = [];
    for (const p of slice) {
      const catId = idMap.get(p.targetCat);
      if (!catId) continue;
      const soldOut = p.sold_out === true;
      // 평점·리뷰수는 저장처가 없어 넣지 않는다. 브랜드·분류만 요약에 쓴다.
      const catName = cmap.get(p.targetCat).category_name;
      const summary = p.brand_name ? `${p.brand_name} · ${catName}` : catName;
      rows.push('(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      values.push(
        MALL_ID,
        catId,
        p.product_name.slice(0, 100),
        p.product_id,
        p.brand_name || null,
        summary,
        p.sale_price,
        p.normal_price || p.sale_price,
        p.discount_rate || 0,
        soldOut ? 0 : 100,
        soldOut ? 'SOLD_OUT' : 'ON',
        'PUBLIC',
        p.image_url,
        p.image_url,
        prodSlug(p.product_id),
        p.badge
      );
    }
    if (!rows.length) continue;
    await conn.query(`INSERT INTO products ${COLS} VALUES ${rows.join(',')}`, values);
    done += rows.length;
    if (done % 2000 < CHUNK) console.log(`    ... ${done}/${items.length}`);
  }
  console.log(`  상품 ${done}건`);
  return done;
}

async function seedNavigation(conn) {
  await conn.query(
    `INSERT INTO navigation_config (mall_id, header_layout_type, category_display_type, max_gnb_items, max_custom_items, category_max_depth, use_mega_menu, use_search_bar)
     VALUES (?, 'main_right_utility_v1', 'dropdown', 12, 3, 3, 0, 1)
     ON DUPLICATE KEY UPDATE category_max_depth = 3, max_gnb_items = 12`,
    [MALL_ID]
  );
  const [feats] = await conn.query(
    "SELECT feature_code, default_sort_order FROM feature_menu WHERE position IN ('gnb','header_util','right_rail') AND module_ready = 1"
  );
  for (const f of feats) {
    await conn.query(
      `INSERT INTO mall_feature_menu (mall_id, feature_code, sort_order, is_enabled, pc_visible, mobile_visible)
       VALUES (?, ?, ?, 1, 1, 1)
       ON DUPLICATE KEY UPDATE is_enabled = 1, pc_visible = 1, mobile_visible = 1`,
      [MALL_ID, f.feature_code, f.default_sort_order]
    );
  }
  console.log(`  GNB/유틸 기능 메뉴 ${feats.length}종 활성`);
}

async function seedHero(conn) {
  const [heroProds] = await conn.query(
    `SELECT id, name, main_image FROM products
     WHERE mall_id = ? AND FIND_IN_SET('BEST', product_badge) AND main_image IS NOT NULL
     ORDER BY id LIMIT 6`,
    [MALL_ID]
  );
  const labels = ['[베스트]', '[신상]', '[추천]', '[특가]', '[인기]'];
  for (let i = 0; i < heroProds.length; i++) {
    const hp = heroProds[i];
    await conn.query(
      `INSERT INTO hero_slide (mall_id, slot, label, headline, image_url, link_url, product_id, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [MALL_ID, i < 5 ? 'MAIN' : 'FEATURE', i < 5 ? labels[i] : '[프리미엄]', hp.name, hp.main_image, `/products/view/${hp.id}`, hp.id, i + 1]
    );
  }
  console.log(`  히어로 슬라이드 ${heroProds.length}종`);
  return heroProds.length;
}

async function seedHome(conn) {
  const group = async (name, sortType, filter) => {
    const [r] = await conn.query(
      "INSERT INTO product_group (mall_id,name,group_type,sort_type,filter_condition_json,is_active) VALUES (?,?,'condition',?,?,1)",
      [MALL_ID, name, sortType, JSON.stringify(filter)]
    );
    return r.insertId;
  };
  const gBest = await group('종합관 베스트', 'views', { badge: 'BEST' });
  const gNew = await group('종합관 신상품', 'newest', { badge: 'NEW' });

  const [r] = await conn.query(
    "INSERT INTO page (mall_id,page_type,slug,title,layout_type,status,published_at) VALUES (?,'home','home-general','종합관 홈','main_right_utility_v1','published',NOW())",
    [MALL_ID]
  );
  const pageId = r.insertId;

  const BADGE_CLS = 'inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white mb-2';
  const MORE_BTN = 'inline-flex items-center gap-2 px-6 py-2.5 border border-gray-300 rounded-full text-sm font-medium text-gray-700 hover:border-[var(--gh-primary)] hover:text-[var(--gh-primary)] transition';
  const sections = [
    { type: 'hero', order: 1, ds: null, cfg: { variant: 'product_showcase' } },
    { type: 'category_showcase', order: 2, ds: null, cfg: { title: '카테고리' } },
    { type: 'product_grid', order: 3, ds: gBest, cfg: { title: '종합관 베스트', maxCount: 8, sectionClass: 'py-12 bg-white', badgeText: 'BEST', badgeClass: BADGE_CLS, moreHref: '/products', moreBtnClass: MORE_BTN } },
    { type: 'product_carousel', order: 4, ds: gNew, cfg: { title: '방금 들어온 신상품', maxCount: 12, sectionClass: 'py-12 bg-[var(--gh-secondary)]', badgeText: 'NEW', moreLink: '/products', columnsPerView: 4 } },
  ];
  for (const s of sections) {
    await conn.query(
      `INSERT INTO page_section (page_id, section_type, position, title, sort_order, data_source_type, data_source_id, config_json, visible_on_pc, visible_on_mobile, is_active)
       VALUES (?, ?, 'main', ?, ?, ?, ?, ?, 1, 1, 1)`,
      [pageId, s.type, s.cfg.title || null, s.order, s.ds ? 'product_group' : null, s.ds, JSON.stringify(s.cfg)]
    );
  }
  console.log(`  홈 페이지(page id=${pageId}) + 섹션 ${sections.length}개`);
}

/* ────────────────────────────── 4. 검증 ────────────────────────────── */

async function verify(conn) {
  const [[c]] = await conn.query('SELECT COUNT(*) n, MAX(depth) d FROM categories WHERE mall_id = ?', [MALL_ID]);
  const [[p]] = await conn.query('SELECT COUNT(*) n FROM products WHERE mall_id = ?', [MALL_ID]);
  // 리프(자식 없는 노드) 중 상품 0 인 것 → 빈 카테고리 화면
  const [emptyLeaf] = await conn.query(
    `SELECT c.id, c.name FROM categories c
     WHERE c.mall_id = ?
       AND NOT EXISTS (SELECT 1 FROM categories k WHERE k.parent_id = c.id)
       AND NOT EXISTS (SELECT 1 FROM products x WHERE x.category_id = c.id)`,
    [MALL_ID]
  );
  const [[orphan]] = await conn.query(
    `SELECT COUNT(*) n FROM categories c WHERE c.mall_id = ?
       AND c.parent_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM categories k WHERE k.id = c.parent_id)`,
    [MALL_ID]
  );
  const [[badDepth]] = await conn.query(
    `SELECT COUNT(*) n FROM categories c JOIN categories pp ON pp.id = c.parent_id
     WHERE c.mall_id = ? AND c.depth <> pp.depth + 1`,
    [MALL_ID]
  );
  const [[noPrice]] = await conn.query('SELECT COUNT(*) n FROM products WHERE mall_id = ? AND (price IS NULL OR price = 0)', [MALL_ID]);
  const [[noCat]] = await conn.query('SELECT COUNT(*) n FROM products WHERE mall_id = ? AND category_id IS NULL', [MALL_ID]);
  const [[badges]] = await conn.query(
    `SELECT SUM(FIND_IN_SET('BEST', product_badge) > 0) best, SUM(FIND_IN_SET('NEW', product_badge) > 0) nw FROM products WHERE mall_id = ?`,
    [MALL_ID]
  );

  console.log(`\n  카테고리 ${c.n}개(최대 depth ${c.d}) / 상품 ${p.n}개`);
  console.log(`  뱃지: BEST ${badges.best || 0} / NEW ${badges.nw || 0}`);
  console.log(`  고아 노드 ${orphan.n} · depth 불일치 ${badDepth.n} · 가격없음 ${noPrice.n} · 카테고리없음 ${noCat.n}`);
  if (emptyLeaf.length) {
    console.log(`  ⚠️ 빈 리프 ${emptyLeaf.length}개:`);
    emptyLeaf.slice(0, 10).forEach((e) => console.log(`     #${e.id} ${e.name}`));
  } else {
    console.log('  ✓ 빈 리프 없음 (모든 말단 카테고리에 상품 있음)');
  }
  const fail = orphan.n || badDepth.n || noPrice.n || noCat.n || emptyLeaf.length;
  if (fail) throw new Error('무결성 검증 실패');
}

/* ────────────────────────────── main ────────────────────────────── */

(async () => {
  const conn = await pool.getConnection();
  try {
    if (isRemove) {
      console.log(`mall ${MALL_ID} 데이터 제거`);
      await assertSafeToWipe(conn);
      await removeAll(conn);
      console.log('\n✅ 완료');
      return;
    }

    const ds = buildDataset();
    console.log(`datapicker 원본: 카테고리 ${ds.cats.length} → 유지 ${ds.keep.size} / 상품 유효 ${ds.items.length}`);

    console.log(`\nmall ${MALL_ID} 기존 데이터 제거`);
    await assertSafeToWipe(conn);
    await removeAll(conn);

    console.log('\n카테고리 시드');
    const idMap = await seedCategories(conn, ds);

    console.log('\n상품 시드');
    await seedProducts(conn, ds, idMap);

    console.log('\n내비게이션 · 홈');
    await seedNavigation(conn);
    await seedHero(conn);
    await seedHome(conn);

    await verify(conn);
    console.log('\n✅ 완료');
  } catch (err) {
    console.error('\n❌ 실패:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
})();
