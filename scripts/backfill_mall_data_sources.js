/*
 * 이미 만들어진 몰의 홈 섹션 데이터 소스 백필
 *
 * 배경: mallProvisioner 는 홈 섹션(product_grid, best_ranking …)을 심으면서 그 섹션이 먹고 살
 * 데이터(product_group / best_group)는 만들지 않았다. 리졸버는 0건이면 섹션을 조용히 버리므로,
 * 그렇게 태어난 몰은 **빌더 목록에는 있고 화면에는 없는** 섹션을 안은 채 살아 있다.
 * 프로비저너는 고쳤지만(신규 몰은 정상), 이미 만들어진 몰은 이 스크립트로 되살린다.
 *
 * 하는 일 (몰마다, 전부 멱등):
 *   1. 조건형 상품 그룹(추천 상품 / 신상품) 없으면 생성
 *   2. 'ALL' 베스트 그룹 없으면 생성 + 랭킹 초기 집계
 *   3. 데이터 소스가 비어 있는 product_grid / product_carousel 섹션에 '추천 상품' 그룹 연결
 *   4. 바뀐 페이지는 재발행(스토어프론트는 발행 스냅샷을 렌더한다)
 *
 * 실행:
 *   set -a; . /etc/environment; set +a
 *   node scripts/backfill_mall_data_sources.js            # 전 몰
 *   node scripts/backfill_mall_data_sources.js 6          # 특정 몰
 */
const bootstrap = require('./_bootstrap');

(async () => {
    await bootstrap();

    const pool = require('../config/db');
    const provisioner = require('../services/mall/mallProvisioner');
    const pageBuilderService = require('../services/display/pageBuilderService');
    const bestRankingService = require('../services/best/bestRankingService');

    const only = Number(process.argv[2]) || null;
    const [malls] = await pool.query(
        only ? 'SELECT id, name FROM mall WHERE id = ?' : 'SELECT id, name FROM mall ORDER BY id',
        only ? [only] : []
    );
    if (!malls.length) {
        console.error(only ? `몰 ${only} 을(를) 찾을 수 없습니다.` : '몰이 없습니다.');
        process.exit(1);
    }

    for (const mall of malls) {
        console.log(`\n── 몰 ${mall.id} (${mall.name})`);

        const conn = await pool.getConnection();
        let groupIdByKey;
        try {
            await conn.beginTransaction();
            groupIdByKey = await provisioner.applyProductGroups(conn, mall.id);
            await provisioner.applyBestGroups(conn, mall.id);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            console.error('  그룹 생성 실패:', err.message);
            conn.release();
            continue;
        } finally {
            conn.release();
        }
        console.log(`  상품 그룹: 추천=${groupIdByKey.recommend}, 신상품=${groupIdByKey.new} · 베스트 'ALL' 그룹 확보`);

        // 데이터 소스가 빈 상품 섹션에 '추천 상품' 그룹을 물린다.
        const [linked] = await pool.query(`
            UPDATE page_section s
              JOIN page p ON p.id = s.page_id
               SET s.data_source_type = 'product_group', s.data_source_id = ?
             WHERE p.mall_id = ?
               AND s.section_type IN ('product_grid', 'product_carousel')
               AND s.data_source_id IS NULL`,
            [groupIdByKey.recommend, mall.id]);
        console.log(`  데이터 소스 연결: ${linked.affectedRows} 개 섹션`);

        try {
            const r = await bestRankingService.calculateAllPeriods(mall.id);
            console.log('  베스트 랭킹 집계 완료', r && r.groups != null ? `(그룹 ${r.groups})` : '');
        } catch (err) {
            console.error('  베스트 집계 실패:', err.message);
        }

        // 스토어프론트는 발행 스냅샷을 본다 — 재발행하지 않으면 위 변경이 화면에 안 나온다.
        const [pages] = await pool.query('SELECT id, title FROM page WHERE mall_id = ?', [mall.id]);
        for (const page of pages) {
            const no = await pageBuilderService.publish(page.id, 'backfill');
            console.log(`  발행: page ${page.id} (${page.title}) → 리비전 #${no}`);
        }
    }

    console.log('\n완료.');
    process.exit(0);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
