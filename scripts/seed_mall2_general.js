#!/usr/bin/env node
/**
 * mall 2 (종합관) 데모 데이터 시드 — 카테고리 3뎁스 + 상품 + GNB + 홈 (멱등)
 *
 * 실행:  node scripts/seed_mall2_general.js
 * 제거:  node scripts/seed_mall2_general.js --remove
 *
 * ⚠️ 이 시드는 상품에 mall_id=2 를 넣는다. productController 의 몰 필터가 운영에 배포된
 *    뒤에만 실행해야 mall 1 화면에 새지 않는다(2026-07-10 배포 완료).
 *
 * CJ온스타일 성격의 종합몰. 데이터는 남의 것을 복사하지 않고 시장 표준 분류로 생성한다.
 * 이미지는 카테고리별 플레이스홀더(public/images/placeholders/*.svg).
 *
 * 코드 계약(검증됨):
 *   - getCategoryTree/loadHomeCategories 는 type='NORMAL' AND mall_id 만 GNB·홈에 올린다.
 *   - getList 는 category_id 직접 매칭이라 **부모 노드에도 상품**을 붙여야 빈 목록이 안 된다.
 *   - GNB 노출은 mall_feature_menu(mall 2) + navigation_config(mall 2).
 */
require('../config/env');
const pool = require('../config/db');

const MALL_ID = 2;
const TAG = ''; // 종합몰은 실제 몰처럼 보이도록 접두어 없이. mall_id 로 구분된다.
const IMG = (slug) => `/images/placeholders/${slug}.svg`;

/* 17 대분류 → 이미지 slug (public/images/placeholders 와 1:1) */
const TREE = [
  { name: '여성의류', img: 'women', subs: [
      { name: '아우터', leaf: ['니트', '원피스'] }, { name: '상의' }, { name: '팬츠/스커트' } ] },
  { name: '남성의류', img: 'men', subs: [
      { name: '아우터', leaf: ['셔츠', '니트'] }, { name: '팬츠' }, { name: '정장' } ] },
  { name: '캐주얼/스포츠', img: 'casual', subs: [ { name: '티셔츠' }, { name: '트레이닝' }, { name: '아웃도어' } ] },
  { name: '언더웨어/홈웨어', img: 'inner', subs: [ { name: '브라/팬티' }, { name: '보정속옷' }, { name: '잠옷/홈웨어' } ] },
  { name: '슈즈', img: 'shoes', subs: [ { name: '운동화' }, { name: '구두' }, { name: '부츠/샌들' } ] },
  { name: '패션잡화', img: 'acc', subs: [ { name: '가방' }, { name: '지갑/벨트' }, { name: '주얼리/시계' } ] },
  { name: '뷰티', img: 'beauty', subs: [
      { name: '스킨케어', leaf: ['에센스/세럼', '크림'] }, { name: '메이크업' }, { name: '헤어/바디' } ] },
  { name: '명품/수입', img: 'luxury', subs: [ { name: '수입 의류' }, { name: '수입 잡화' } ] },
  { name: '리빙/생활', img: 'living', subs: [ { name: '침구' }, { name: '수납/정리' }, { name: '청소/세탁' } ] },
  { name: '주방용품', img: 'kitchen', subs: [ { name: '냄비/팬' }, { name: '그릇/식기' }, { name: '조리도구' } ] },
  { name: '가구/인테리어', img: 'furniture', subs: [ { name: '침대/매트리스' }, { name: '소파/거실' }, { name: '조명/데코' } ] },
  { name: '가전/디지털', img: 'digital', subs: [
      { name: '주방가전', leaf: ['에어프라이어', '전기밥솥'] }, { name: '생활가전' }, { name: '모바일/PC' } ] },
  { name: '식품', img: 'food', subs: [ { name: '간편식/밀키트' }, { name: '신선식품' }, { name: '커피/음료' } ] },
  { name: '유아동', img: 'baby', subs: [ { name: '유아의류' }, { name: '완구' }, { name: '출산/육아용품' } ] },
  { name: '스포츠/레저', img: 'sports', subs: [ { name: '등산/캠핑' }, { name: '골프' }, { name: '헬스' } ] },
  { name: '반려동물', img: 'pet', subs: [ { name: '사료/간식' }, { name: '용품' } ] },
  { name: '여행/렌탈/e쿠폰', img: 'travel', subs: [ { name: '여행상품' }, { name: '렌탈' }, { name: '상품권/e쿠폰' } ] },
];

/* 카테고리명 → 상품명 3~4개. 실제 유통 상품군을 참고한 그럴듯한 이름(특정 상표 복사 아님). */
function productsFor(catName, big) {
  const P = (name, price, badge) => ({ name, price, badge: badge || null });
  const T = {
    '여성의류':['여성 베이직 데일리 니트','여성 플리츠 롱스커트','여성 오버핏 데님 자켓'],
    '아우터':['여성 울 블렌드 핸드메이드 코트','경량 구스다운 숏패딩','오버핏 트렌치코트'],
    '니트':['캐시미어 혼방 라운드 니트','케이블 짜임 크루넥 스웨터','슬림핏 골지 니트'],
    '원피스':['셔츠 카라 미디 원피스','플로럴 롱 원피스','니트 벨티드 원피스'],
    '상의':['코튼 베이직 티셔츠 2매','프릴 블라우스','스트라이프 셔츠'],
    '팬츠/스커트':['하이웨스트 와이드 슬랙스','스트레이트 데님 팬츠','A라인 미니스커트'],
    '남성의류':['남성 스탠다드핏 셔츠','남성 웜 플리스 집업','남성 스트레치 치노팬츠'],
    '셔츠':['옥스포드 버튼다운 셔츠','린넨 반팔 셔츠','슬림핏 드레스 셔츠'],
    '팬츠':['테이퍼드 슬랙스','조거 트레이닝 팬츠','세미 와이드 진'],
    '정장':['3버튼 슬림 수트','셋업 블레이저','정장 셔츠+타이 세트'],
    '캐주얼/스포츠':['드라이핏 기능성 티셔츠','스포츠 트랙 자켓','경량 바람막이'],
    '티셔츠':['오버핏 그래픽 티셔츠','쿨링 반팔 티 3매','롱슬리브 레이어드 티'],
    '트레이닝':['세트 트레이닝복','조거 스웨트팬츠','후드 집업 트레이닝'],
    '아웃도어':['방수 등산 자켓','경량 패딩 베스트','기능성 등산 팬츠'],
    '언더웨어/홈웨어':['무봉제 심리스 브라 세트','순면 파자마 세트','수면 잠옷'],
    '브라/팬티':['노와이어 브라렛','심리스 팬티 5매','스포츠 브라'],
    '보정속옷':['하이웨이스트 보정 팬츠','올인원 바디쉐이퍼','복부 보정 거들'],
    '잠옷/홈웨어':['모달 홈웨어 세트','극세사 수면 잠옷','린넨 원피스 잠옷'],
    '슈즈':['데일리 스니커즈','쿠션 러닝화','소가죽 로퍼'],
    '운동화':['에어 쿠션 러닝화','캔버스 스니커즈','경량 워킹화'],
    '구두':['소가죽 옥스포드','스틸레토 힐','포인티드 플랫슈즈'],
    '부츠/샌들':['첼시 앵클부츠','스트랩 샌들','털부츠'],
    '패션잡화':['데일리 크로스백','미니멀 카드지갑','스테인리스 메탈 시계'],
    '가방':['천연가죽 토트백','캔버스 에코백','백팩 15인치'],
    '지갑/벨트':['소가죽 반지갑','리버서블 벨트','장지갑'],
    '주얼리/시계':['925 실버 목걸이','메탈 미니멀 시계','큐빅 귀걸이 세트'],
    '뷰티':['수분 진정 토너','비타민 브라이트닝 세럼','데일리 선크림 SPF50'],
    '스킨케어':['히알루론산 수분크림','약산성 클렌징폼','저자극 토너 패드'],
    '에센스/세럼':['비타민C 브라이트닝 세럼','펩타이드 탄력 에센스','나이아신아마이드 세럼'],
    '크림':['세라마이드 수분크림','레티놀 나이트크림','시카 진정크림'],
    '메이크업':['롱래스팅 쿠션','매트 립스틱','아이섀도 팔레트'],
    '헤어/바디':['단백질 헤어 트리트먼트','아미노 바디워시','두피 스케일링 샴푸'],
    '명품/수입':['수입 실크 스카프','이탈리아 가죽 벨트','수입 선글라스'],
    '수입 의류':['수입 캐시미어 코트','이탈리안 니트','프렌치 원피스'],
    '수입 잡화':['수입 레더 토트백','수입 실크 머플러','수입 선글라스'],
    '리빙/생활':['호텔식 구스 이불','極세사 차렵이불 세트','논슬립 러그'],
    '침구':['알러지케어 베개 2입','사계절 차렵이불','호텔 구스 토퍼'],
    '수납/정리':['다용도 리빙박스 4P','철제 선반 랙','옷장 수납정리함'],
    '청소/세탁':['무선 핸디 청소기','극세사 물걸레 세트','드럼세탁조 클리너'],
    '주방용품':['인덕션 3중 냄비 5종','내열 유리 밀폐용기','통주물 무쇠팬'],
    '냄비/팬':['다이아몬드 코팅 프라이팬','스텐 3중 냄비 세트','편수 우유냄비'],
    '그릇/식기':['본차이나 그릇 세트','스텐 수저 4세트','유리 볼 3종'],
    '조리도구':['실리콘 주방도구 8종','원목 도마 세트','스텐 조리집게'],
    '가구/인테리어':['원목 4인 식탁','패브릭 3인 소파','LED 스탠드 조명'],
    '침대/매트리스':['모션 프레임 슈퍼싱글','포켓스프링 매트리스','수납형 침대 Q'],
    '소파/거실':['모듈형 카우치 소파','리클라이너 1인 소파','TV 거실장'],
    '조명/데코':['무드 플로어 스탠드','디자인 벽시계','인테리어 액자 세트'],
    '가전/디지털':['6L 대용량 에어프라이어','무선 스틱청소기','1200W 핸드블렌더'],
    '주방가전':['저소음 착즙기','스팀 전기밥솥 6인용','미니 에어프라이어'],
    '에어프라이어':['6.5L 대용량 에어프라이어','비주얼 윈도우 에어프라이어','2단 에어프라이어'],
    '전기밥솥':['IH 압력밥솥 6인용','미니 3인 전기밥솥','스테인리스 내솥 밥솥'],
    '생활가전':['저소음 가습기','미니 제습기','스탠드 선풍기'],
    '모바일/PC':['블루투스 무선 이어폰','기계식 게이밍 키보드','USB-C 고속 충전기'],
    '식품':['프리미엄 한우 선물세트','냉장 반찬 6종 세트','스페셜티 원두 1kg'],
    '간편식/밀키트':['밀키트 3종 세트','냉동 국물요리 5팩','즉석 컵밥 12개'],
    '신선식품':['제철 과일 박스','친환경 채소 꾸러미','손질 생선 세트'],
    '커피/음료':['스페셜티 드립백 20입','콜드브루 원액','유기농 곡물차'],
    '유아동':['오가닉 유아 내의 세트','원목 블록 완구','유아 식판 세트'],
    '유아의류':['오가닉 배냇저고리','아동 우주복','기모 상하복 세트'],
    '완구':['원목 자석 블록','역할놀이 주방놀이','대형 퍼즐 매트'],
    '출산/육아용품':['초극세사 아기 이불','휴대용 젖병소독기','아기 물티슈 10팩'],
    '스포츠/레저':['접이식 캠핑 체어','경량 등산 스틱','요가 매트 10mm'],
    '등산/캠핑':['원터치 텐트 4인','캠핑 화로대 세트','경량 침낭'],
    '골프':['골프 장갑 2매','연습용 골프공 50입','기능성 골프 티셔츠'],
    '헬스':['가변 덤벨 세트','폼롤러','저항밴드 5종'],
    '반려동물':['그레인프리 사료 2kg','고양이 자동 급수기','반려견 계단'],
    '사료/간식':['연어 그레인프리 사료','수제 트릿 간식','치석케어 껌'],
    '용품':['자동 급식기','반려동물 방석','스테인리스 급수대'],
    '여행/렌탈/e쿠폰':['제주 왕복 항공권','안마의자 렌탈','백화점 상품권 5만원'],
    '여행상품':['제주 3일 자유여행','부산 호텔 1박','동남아 패키지'],
    '렌탈':['안마의자 36개월 렌탈','정수기 렌탈','매트리스 렌탈'],
    '상품권/e쿠폰':['모바일 상품권 3만원','편의점 e쿠폰','외식 상품권'],
  };
  const names = T[catName] || [`${big} 인기상품 A`, `${big} 인기상품 B`, `${big} 인기상품 C`];
  const badges = ['BEST', 'NEW', 'RECOMMEND', null];
  return names.map((n, i) => P(n, 9900 + ((catName.length * 3137 + i * 4271) % 90) * 1000, badges[i % badges.length]));
}

const isRemove = process.argv.includes('--remove');

async function removeAll(conn) {
  const [p] = await conn.query('DELETE FROM products WHERE mall_id = ?', [MALL_ID]);
  const [ps] = await conn.query('DELETE ps FROM page_section ps JOIN page pg ON pg.id = ps.page_id WHERE pg.mall_id = ?', [MALL_ID]);
  const [pg] = await conn.query('DELETE FROM page WHERE mall_id = ?', [MALL_ID]);
  const [g] = await conn.query('DELETE FROM product_group WHERE mall_id = ?', [MALL_ID]);
  const [hs] = await conn.query('DELETE FROM hero_slide WHERE mall_id = ?', [MALL_ID]);
  // 카테고리: 깊은 것부터
  const [c3] = await conn.query('DELETE FROM categories WHERE mall_id = ? AND depth = 3', [MALL_ID]);
  const [c2] = await conn.query('DELETE FROM categories WHERE mall_id = ? AND depth = 2', [MALL_ID]);
  const [c1] = await conn.query('DELETE FROM categories WHERE mall_id = ? AND depth = 1', [MALL_ID]);
  await conn.query('DELETE FROM mall_feature_menu WHERE mall_id = ?', [MALL_ID]);
  await conn.query('DELETE FROM navigation_config WHERE mall_id = ?', [MALL_ID]);
  console.log(`  - 상품 ${p.affectedRows} / 카테고리 ${c1.affectedRows + c2.affectedRows + c3.affectedRows} / 상품그룹 ${g.affectedRows} / 페이지 ${pg.affectedRows} / 히어로 ${hs.affectedRows}`);
}

async function upsertCategory(conn, name, slug, parentId, depth, order, img) {
  const [rows] = await conn.query('SELECT id FROM categories WHERE name = ? AND mall_id = ? LIMIT 1', [name, MALL_ID]);
  if (rows.length) {
    await conn.query(
      `UPDATE categories SET parent_id=?, depth=?, type='NORMAL', slug=?, display_order=?, is_active=1, pc_visible=1, mobile_visible=1, logo_image_path=? WHERE id=?`,
      [parentId, depth, slug, order, img, rows[0].id]);
    return rows[0].id;
  }
  const [r] = await conn.query(
    `INSERT INTO categories (mall_id,name,slug,parent_id,depth,type,display_order,is_active,pc_visible,mobile_visible,logo_image_path)
     VALUES (?,?,?,?,?,'NORMAL',?,1,1,1,?)`,
    [MALL_ID, name, slug, parentId, depth, order, img]);
  return r.insertId;
}

async function upsertProducts(conn, list, categoryId, img, stats) {
  // dedup 키는 **slug**(카테고리+위치로 결정적). 이름 기준으로 dedup 하면 같은 이름이
  // 여러 카테고리에 있을 때(예: 여성/남성 '니트') 상품이 한 곳으로 옮겨져 다른 노드가 빈다.
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const slug = `g2-${categoryId}-${i + 1}`;
    const [rows] = await conn.query('SELECT id FROM products WHERE slug = ? LIMIT 1', [slug]);
    if (rows.length) {
      await conn.query(
        `UPDATE products SET category_id=?, name=?, price=?, original_price=?, stock=100, status='ON', visibility='PUBLIC', product_badge=?, main_image=?, thumbnail_image=?, mall_id=? WHERE id=?`,
        [categoryId, p.name, p.price, p.price, p.badge, img, img, MALL_ID, rows[0].id]);
      stats.updated++;
    } else {
      await conn.query(
        `INSERT INTO products (mall_id,category_id,name,product_code,provider,short_description,price,original_price,discount_rate,stock,status,visibility,main_image,thumbnail_image,slug,product_badge)
         VALUES (?,?,?,?,?,?,?,?,0,100,'ON','PUBLIC',?,?,?,?)`,
        [MALL_ID, categoryId, p.name, slug.toUpperCase(), '종합관', '종합몰 데모 상품입니다.', p.price, p.price, img, img, slug, p.badge]);
      stats.created++;
    }
  }
}

(async () => {
  const conn = await pool.getConnection();
  try {
    if (isRemove) {
      console.log('mall 2 종합관 데이터 제거');
      await removeAll(conn);
      console.log('\n✅ 완료');
      return;
    }

    console.log('mall 2 (종합관) 시드 — 카테고리 3뎁스 + 상품 + GNB + 홈');
    const stats = { created: 0, updated: 0 };

    // 1) 카테고리 트리 + 상품
    for (let i = 0; i < TREE.length; i++) {
      const big = TREE[i];
      const bigId = await upsertCategory(conn, big.name, `g2-${big.img}`, null, 1, i + 1, IMG(big.img));
      // 부모(대분류)에도 대표 상품 2개 — getList 직접 매칭이라 대분류 클릭 시 빈 목록 방지
      await upsertProducts(conn, productsFor(big.name, big.name).slice(0, 2), bigId, IMG(big.img), stats);
      for (let j = 0; j < (big.subs || []).length; j++) {
        const mid = big.subs[j];
        const midId = await upsertCategory(conn, `${big.name} ${mid.name}`, `g2-${big.img}-${j + 1}`, bigId, 2, j + 1, IMG(big.img));
        await upsertProducts(conn, productsFor(mid.name, big.name).slice(0, 3), midId, IMG(big.img), stats);
        for (let k = 0; k < (mid.leaf || []).length; k++) {
          const leafName = mid.leaf[k];
          const leafId = await upsertCategory(conn, `${big.name} ${leafName}`, `g2-${big.img}-${j + 1}-${k + 1}`, midId, 3, k + 1, IMG(big.img));
          await upsertProducts(conn, productsFor(leafName, big.name).slice(0, 3), leafId, IMG(big.img), stats);
        }
      }
    }
    console.log(`  카테고리 트리 + 상품: 생성 ${stats.created} / 갱신 ${stats.updated}`);

    // 2) navigation_config (mall 2)
    await conn.query(`
      INSERT INTO navigation_config (mall_id, header_layout_type, category_display_type, max_gnb_items, max_custom_items, category_max_depth, use_mega_menu, use_search_bar)
      VALUES (?, 'main_right_utility_v1', 'dropdown', 12, 3, 3, 0, 1)
      ON DUPLICATE KEY UPDATE category_max_depth = 3, max_gnb_items = 12`, [MALL_ID]);

    // 3) GNB 기능 메뉴 (mall 1 에서 module_ready 된 것 복제). CATEGORY 고정 + 표준 메뉴.
    const [feats] = await conn.query(
      "SELECT feature_code, default_sort_order FROM feature_menu WHERE position IN ('gnb','header_util','right_rail') AND module_ready = 1");
    for (const f of feats) {
      await conn.query(`
        INSERT INTO mall_feature_menu (mall_id, feature_code, sort_order, is_enabled, pc_visible, mobile_visible)
        VALUES (?, ?, ?, 1, 1, 1)
        ON DUPLICATE KEY UPDATE is_enabled = 1, pc_visible = 1, mobile_visible = 1`,
        [MALL_ID, f.feature_code, f.default_sort_order]);
    }
    console.log(`  GNB/유틸 기능 메뉴 ${feats.length}종 활성`);

    // 4) 히어로 슬라이드 (product_showcase 용) — mall 2 대표 상품 5 + 피처 1
    const [heroProds] = await conn.query(
      "SELECT id, name, main_image FROM products WHERE mall_id = ? AND product_badge IS NOT NULL ORDER BY id LIMIT 6", [MALL_ID]);
    await conn.query('DELETE FROM hero_slide WHERE mall_id = ?', [MALL_ID]);
    heroProds.forEach(async () => {});
    const labels = ['[베스트]', '[신상]', '[추천]', '[특가]', '[인기]'];
    for (let i = 0; i < heroProds.length; i++) {
      const hp = heroProds[i];
      const slot = i < 5 ? 'MAIN' : 'FEATURE';
      await conn.query(
        `INSERT INTO hero_slide (mall_id, slot, label, headline, image_url, link_url, product_id, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [MALL_ID, slot, i < 5 ? labels[i] : '[프리미엄]', hp.name, hp.main_image, `/products/view/${hp.id}`, hp.id, i + 1]);
    }
    console.log(`  히어로 슬라이드 ${heroProds.length}종`);

    // 5) 상품 그룹 (홈 product_grid 용) — condition 기반, mall 2
    async function upsertGroup(name, sortType, filter) {
      const [g] = await conn.query('SELECT id FROM product_group WHERE name = ? AND mall_id = ? LIMIT 1', [name, MALL_ID]);
      if (g.length) { await conn.query('UPDATE product_group SET group_type=\'condition\', sort_type=?, filter_condition_json=?, is_active=1 WHERE id=?', [sortType, JSON.stringify(filter), g[0].id]); return g[0].id; }
      const [r] = await conn.query('INSERT INTO product_group (mall_id,name,group_type,sort_type,filter_condition_json,is_active) VALUES (?,?,\'condition\',?,?,1)', [MALL_ID, name, sortType, JSON.stringify(filter)]);
      return r.insertId;
    }
    const gBest = await upsertGroup('종합관 베스트', 'views', { badge: 'BEST' });
    const gNew = await upsertGroup('종합관 신상품', 'newest', { badge: 'NEW' });

    // 6) 홈 페이지(page + page_section, published, mall 2)
    let [pg] = await conn.query("SELECT id FROM page WHERE mall_id = ? AND page_type = 'home' LIMIT 1", [MALL_ID]);
    let pageId;
    if (pg.length) { pageId = pg[0].id; await conn.query("UPDATE page SET status='published', layout_type='main_right_utility_v1' WHERE id=?", [pageId]); }
    else {
      const [r] = await conn.query(
        "INSERT INTO page (mall_id,page_type,slug,title,layout_type,status,published_at) VALUES (?,'home','home-general','종합관 홈','main_right_utility_v1','published',NOW())", [MALL_ID]);
      pageId = r.insertId;
    }
    await conn.query('DELETE FROM page_section WHERE page_id = ?', [pageId]);
    // product_grid_section.ejs 는 sectionClass/badgeText/badgeClass/moreHref/moreBtnClass 를
    // **가드 없이** 참조한다 → config 에 반드시 넣는다(mall 1 섹션과 동일 키).
    const BADGE_CLS = 'inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white mb-2';
    const MORE_BTN = 'inline-flex items-center gap-2 px-6 py-2.5 border border-gray-300 rounded-full text-sm font-medium text-gray-700 hover:border-[var(--gh-primary)] hover:text-[var(--gh-primary)] transition';
    const sections = [
      { type: 'hero',             order: 1, ds: null,  cfg: { variant: 'product_showcase' } },
      { type: 'category_showcase',order: 2, ds: null,  cfg: { title: '카테고리' } },
      { type: 'product_grid',     order: 3, ds: gBest, cfg: { title: '종합관 베스트', maxCount: 8, sectionClass: 'py-12 bg-white', badgeText: 'BEST', badgeClass: BADGE_CLS, moreHref: '/products', moreBtnClass: MORE_BTN } },
      { type: 'product_carousel', order: 4, ds: gNew,  cfg: { title: '방금 들어온 신상품', maxCount: 12, sectionClass: 'py-12 bg-[var(--gh-secondary)]', badgeText: 'NEW', moreLink: '/products', columnsPerView: 4 } },
    ];
    for (const s of sections) {
      await conn.query(
        `INSERT INTO page_section (page_id, section_type, position, title, sort_order, data_source_type, data_source_id, config_json, visible_on_pc, visible_on_mobile, is_active)
         VALUES (?, ?, 'main', ?, ?, ?, ?, ?, 1, 1, 1)`,
        [pageId, s.type, s.cfg.title || null, s.order, s.ds ? 'product_group' : null, s.ds, JSON.stringify(s.cfg)]);
    }
    console.log(`  홈 페이지(page id=${pageId}) + 섹션 ${sections.length}개`);

    // --- 무결성 확인 ---
    const [[cnt]] = await conn.query('SELECT COUNT(*) n FROM categories WHERE mall_id = ?', [MALL_ID]);
    const [[pc]] = await conn.query('SELECT COUNT(*) n FROM products WHERE mall_id = ?', [MALL_ID]);
    const [[md]] = await conn.query('SELECT MAX(depth) d FROM categories WHERE mall_id = ?', [MALL_ID]);
    const [empty] = await conn.query(
      `SELECT c.id, c.name FROM categories c WHERE c.mall_id = ? AND NOT EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id)`, [MALL_ID]);
    console.log(`\n  카테고리 ${cnt.n}개(최대 depth ${md.d}) / 상품 ${pc.n}개`);
    if (empty.length) { console.log('  ⚠️ 상품 없는 노드:'); empty.forEach(e => console.log(`     #${e.id} ${e.name}`)); }
    else console.log('  ✓ 모든 카테고리 노드에 상품 있음');

    console.log('\n✅ 완료');
  } catch (err) {
    console.error('\n❌ 실패:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
})();
