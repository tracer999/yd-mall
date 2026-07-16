/*
 * 네이버 카테고리/브랜드 참조 리소스 수집 — 배치 진입점.
 * 설계: docs/사이트개선/네이버_카테고리_리소스_설계.md
 *
 * 사용:
 *   node scripts/sync_naver_taxonomy.js              # 즉시 1회 수집(수동)
 *   node scripts/sync_naver_taxonomy.js --scheduled  # 스케줄 확인 후 주기 도래 시에만 수집(크론용)
 *
 * ⚠ 반드시 _bootstrap 을 먼저 호출한다 — system_settings→process.env 주입 및
 *   ENCRYPTION_KEY 확인. 안 하면 자격증명 복호화가 불가하다.
 */

(async () => {
    await require('./_bootstrap')();
    const pool = require('../config/db');
    const sync = require('../services/sourcing/naverTaxonomySync');

    const scheduled = process.argv.includes('--scheduled');
    let exitCode = 0;

    try {
        if (scheduled) {
            const [[sc]] = await pool.query('SELECT * FROM naver_taxonomy_schedule WHERE id = 1');
            if (!sc || !sc.enabled) {
                console.log('[naver-taxonomy] 스케줄 비활성 — 건너뜀');
                await pool.end();
                process.exit(0);
            }
            const intervalMs = (Number(sc.interval_hours) || 24) * 3600 * 1000;
            const last = sc.last_run_at ? new Date(sc.last_run_at).getTime() : 0;
            const [[{ nowMs }]] = await pool.query('SELECT UNIX_TIMESTAMP(NOW()) * 1000 AS nowMs');
            if (last && (nowMs - last) < intervalMs) {
                const mins = Math.round((intervalMs - (nowMs - last)) / 60000);
                console.log(`[naver-taxonomy] 아직 주기 전 — 약 ${mins}분 후 실행 예정. 건너뜀`);
                await pool.end();
                process.exit(0);
            }
        }

        const result = await sync.syncCategories({ triggerBy: scheduled ? 'CRON' : 'MANUAL' });
        console.log('[naver-taxonomy] 결과:', JSON.stringify(result));

        // 스케줄 마지막 실행 시각/상태 갱신(SKIPPED 도 시도한 것으로 기록해 재폭주 방지).
        if (scheduled) {
            const lastStatus = result.status === 'SUCCESS' ? 'SUCCESS'
                : (result.status === 'SKIPPED' ? 'SKIPPED' : 'FAILED');
            await pool.query(
                'UPDATE naver_taxonomy_schedule SET last_run_at = NOW(), last_status = ? WHERE id = 1',
                [lastStatus]
            );
        }
        if (result.status === 'FAILED') exitCode = 1;
    } catch (e) {
        console.error('[naver-taxonomy] 예외:', e.message);
        exitCode = 1;
    } finally {
        await pool.end();
    }
    process.exit(exitCode);
})().catch((e) => { console.error(e); process.exit(1); });
