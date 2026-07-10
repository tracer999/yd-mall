#!/usr/bin/env node
/**
 * GNB 메가메뉴용 카테고리 이미지·설명 시드 (멱등)
 *
 * 실행:  node scripts/seed_category_display.js
 * 제거:  node scripts/seed_category_display.js --remove
 *
 * 최상위(depth-1, parent_id NULL) NORMAL 카테고리에 description(간략 설명)과
 * logo_image_path(썸네일)를 채운다. 이름으로 매칭하며, 없는 카테고리는 건너뛴다.
 *
 * - mall 2(종합관): public/images/placeholders/*.svg 를 카테고리별로 매핑.
 * - mall 1(건강식품): 설명만 채우고 이미지는 NULL(뷰가 이니셜 원형으로 폴백 — NULL-safe 시연).
 * - --remove 는 이 스크립트가 넣은 것만 되돌린다(placeholder 경로만 NULL 처리).
 */
require('../config/env');
const pool = require('../config/db');

const IMG = (name) => `/images/placeholders/${name}.svg`;

// mall_id → { 카테고리명: { desc, img? } }
const SEED = {
    1: {
        '건강식품(기타)': { desc: '엄선한 건강식품을 한 곳에서' },
        '단백질':         { desc: '단백질 보충제 · 산양유 · WPC' },
        '영양제':         { desc: '비타민 · 미네랄 · 데일리 영양' },
        '오일/액상':      { desc: '오메가 · 착즙주스 · 액상 진액' },
        '유산균':         { desc: '장 건강을 위한 프로바이오틱스' },
        '인삼/홍삼':      { desc: '6년근 홍삼 · 산삼배양근' },
        '건강환/즙':      { desc: '건강환 · 즙 · 진액 모음' },
        '다이어트':       { desc: '체지방 관리 · 슬리밍 케어' },
        '선물세트':       { desc: '마음을 담은 건강 선물세트' },
        '콜라겐/이너뷰티':{ desc: '저분자 콜라겐 · 이너뷰티' },
    },
    2: {
        '여성패션':       { desc: '트렌디한 여성 의류 · 데일리룩', img: IMG('women') },
        '남성패션':       { desc: '캐주얼부터 정장까지 남성 패션', img: IMG('men') },
        '언더웨어':       { desc: '편안한 언더웨어 · 홈웨어', img: IMG('inner') },
        '패션잡화':       { desc: '가방 · 지갑 · 주얼리 · 액세서리', img: IMG('acc') },
        '스포츠/레저':    { desc: '운동복 · 아웃도어 · 레저용품', img: IMG('sports') },
        '뷰티':           { desc: '스킨케어 · 메이크업 · 향수', img: IMG('beauty') },
        '식품':           { desc: '신선식품 · 간편식 · 건강식품', img: IMG('food') },
        '주방용품':       { desc: '조리도구 · 그릇 · 주방가전', img: IMG('kitchen') },
        '출산/유아동':    { desc: '육아용품 · 유아동 의류 · 완구', img: IMG('baby') },
        '가구/인테리어':  { desc: '가구 · 조명 · 홈데코', img: IMG('furniture') },
        '생활용품':       { desc: '생활잡화 · 청소 · 수납', img: IMG('living') },
        '가전':           { desc: 'TV · 냉장고 · 소형가전', img: IMG('digital') },
        '렌탈/여행':      { desc: '렌탈 서비스 · 여행 상품', img: IMG('travel') },
        'TV상품':         { desc: '홈쇼핑 인기 · 방송 상품', img: IMG('luxury') },
    },
};

const isRemove = process.argv.includes('--remove');

(async () => {
    const conn = await pool.getConnection();
    let updated = 0, skipped = 0;
    try {
        for (const [mallId, map] of Object.entries(SEED)) {
            for (const [name, { desc, img }] of Object.entries(map)) {
                const [[row]] = await conn.query(
                    `SELECT id, logo_image_path FROM categories
                     WHERE mall_id = ? AND type = 'NORMAL' AND parent_id IS NULL AND name = ? LIMIT 1`,
                    [mallId, name]
                );
                if (!row) { skipped++; continue; }

                if (isRemove) {
                    // 우리가 넣은 placeholder 이미지만 되돌린다(관리자가 올린 실제 이미지는 보존).
                    const clearImg = row.logo_image_path && row.logo_image_path.startsWith('/images/placeholders/');
                    await conn.query(
                        `UPDATE categories SET description = NULL${clearImg ? ', logo_image_path = NULL' : ''} WHERE id = ?`,
                        [row.id]
                    );
                } else {
                    await conn.query(
                        `UPDATE categories SET description = ?, logo_image_path = COALESCE(?, logo_image_path) WHERE id = ?`,
                        [desc, img || null, row.id]
                    );
                }
                updated++;
            }
        }
        console.log(`${isRemove ? '되돌림' : '시드'} 완료 — 반영 ${updated}건, 스킵(미존재) ${skipped}건`);
    } catch (err) {
        console.error('❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
})();
