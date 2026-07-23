/*
 * 앱 내장 주기 작업 러너
 *
 * ── 왜 cron 이 아니라 앱 안인가
 * 이 제품은 **납품받은 일반 사용자**가 운영한다. 서버에 접속해 crontab 을 등록하는 일은
 * 그 사용자가 할 수 없다. 배포마다 사람이 크론을 심어야 하는 기능은 "여기선 되는데 고객 몰에선
 * 안 되는" 기능이 된다. 그래서 앱이 뜨면 스스로 돌게 한다.
 *
 * 안전한 이유 — PM2 가 **fork 모드 · instances: 1** 이라 프로세스가 하나다(ecosystem.config.cjs).
 * cluster 로 늘리면 잡이 중복 실행되므로, 그때는 여기 잠금 장치를 넣거나 크론으로 빼야 한다.
 *
 * ── 잡 설계 규칙
 *   1. **멱등**하다. 두 번 돌아도 결과가 같다. 실패하면 다음 회차가 다시 시도한다.
 *   2. 한 잡이 터져도 다른 잡을 막지 않는다(각각 try/catch).
 *   3. 설정값이 0/미설정이면 **끈 것**으로 본다. 기본은 전부 꺼짐이라, 아무 설정도 하지 않은
 *      새 몰에서 갑자기 포인트가 사라지거나 주문 상태가 바뀌는 일이 없다.
 */

const pool = require('../../config/db');

const INTERVAL_MS = 10 * 60 * 1000;   // 10분마다
const FIRST_RUN_DELAY_MS = 30 * 1000; // 기동 직후 30초 뒤 첫 실행(부팅 부하와 겹치지 않게)

let timer = null;
let running = false;

/** system_settings 값을 숫자로 읽는다. 미설정·빈값·0 이면 0(=꺼짐). */
function numSetting(key) {
    const raw = global.systemSettings ? global.systemSettings[key] : null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/* ── 잡 1: 약관 예약 시행 ───────────────────────────────────────
 * `policy_versions.effective_date` 가 오늘이거나 지났는데 아직 활성이 아닌 버전을 활성화한다.
 * 같은 종류(TERMS/PRIVACY)의 이전 버전은 자동으로 내린다 — 두 버전이 동시에 시행 중일 수 없다.
 * 운영자가 자정에 버튼을 누르려고 기다리지 않아도 된다.
 */
async function runPolicyActivation() {
    const [due] = await pool.query(`
        SELECT id, type, version FROM policy_versions
        WHERE is_active = 0 AND effective_date <= CURDATE()
          AND id = (
              SELECT MAX(p2.id) FROM policy_versions p2
              WHERE p2.type = policy_versions.type AND p2.effective_date <= CURDATE()
          )
    `);
    let activated = 0;
    for (const row of due) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            // 이미 활성인 같은 종류를 먼저 내린다.
            await conn.query('UPDATE policy_versions SET is_active = 0 WHERE type = ? AND is_active = 1', [row.type]);
            await conn.query('UPDATE policy_versions SET is_active = 1 WHERE id = ?', [row.id]);
            await conn.commit();
            activated++;
            console.log(`[scheduler] 약관 예약 시행: ${row.type} ${row.version} (id=${row.id})`);
        } catch (e) {
            await conn.rollback();
            console.error('[scheduler] 약관 시행 실패:', e.message);
        } finally {
            conn.release();
        }
    }
    return { activated };
}

/* ── 잡 2: 배송완료 자동 처리 ───────────────────────────────────
 * 발송 후 N일이 지난 `배송중` 주문을 배송완료로 넘긴다.
 * 택배사 API 계약이 없어도 주문이 배송중에 영원히 머물지 않게 하는 안전장치다.
 * `auto_deliver_days` 가 0/미설정이면 돌지 않는다.
 */
async function runAutoDeliver() {
    const days = numSetting('auto_deliver_days');
    if (!days) return { skipped: true };
    const { autoCompleteDelivered } = require('../shipping/deliveryService');
    const r = await autoCompleteDelivered(days);
    if (r.done) console.log(`[scheduler] 배송완료 자동 처리: ${r.done}건 (발송 ${days}일 경과)`);
    return r;
}

/* ── 잡 3: 포인트 소멸 ─────────────────────────────────────────
 * 유효기간이 지난 적립분을 소멸시킨다. `point_expiry_months` 가 0/미설정이면 돌지 않는다.
 */
async function runPointExpiry() {
    if (!numSetting('point_expiry_months')) return { skipped: true };
    const { expireDuePoints } = require('../point/pointExpiryService');
    const r = await expireDuePoints();
    if (r.expired) console.log(`[scheduler] 포인트 소멸: ${r.users}명 / ${r.expired}P`);
    return r;
}

/* ── 잡 4: 구매확정 자동 처리 ───────────────────────────────────
 * 배송완료 후 N일이 지나도 고객이 확정하지 않은 주문을 자동으로 확정한다.
 * **적립금은 구매확정 때 지급되므로**, 이 잡이 꺼져 있고 고객도 버튼을 누르지 않으면
 * 포인트가 영영 지급되지 않는다. 그래서 이 항목만은 기본값이 켜져 있다(배송완료 7일).
 */
async function runAutoConfirm() {
    const { autoConfirmDue } = require('../order/purchaseConfirmService');
    const r = await autoConfirmDue();
    if (r.done) console.log(`[scheduler] 구매확정 자동 처리: ${r.done}건 (배송완료 ${r.days}일 경과)`);
    return r;
}

const JOBS = [
    { name: '약관 예약 시행', fn: runPolicyActivation },
    { name: '배송완료 자동 처리', fn: runAutoDeliver },
    { name: '구매확정 자동 처리', fn: runAutoConfirm },
    { name: '포인트 소멸', fn: runPointExpiry },
];

/** 한 회차 실행. 잡 하나가 터져도 나머지는 돈다. */
async function tick() {
    if (running) return;   // 이전 회차가 아직 안 끝났으면 건너뛴다(겹쳐 돌지 않게)
    running = true;
    for (const job of JOBS) {
        try {
            await job.fn();
        } catch (err) {
            console.error(`[scheduler] '${job.name}' 실패:`, err.message);
        }
    }
    running = false;
}

function start() {
    if (timer) return;
    setTimeout(() => { tick(); }, FIRST_RUN_DELAY_MS);
    timer = setInterval(tick, INTERVAL_MS);
    // 이 타이머 때문에 프로세스가 종료되지 못하는 일이 없도록 한다.
    if (timer.unref) timer.unref();
    console.log(`[scheduler] 주기 작업 시작 (${INTERVAL_MS / 60000}분 간격): ${JOBS.map((j) => j.name).join(', ')}`);
}

function stop() {
    if (timer) clearInterval(timer);
    timer = null;
}

module.exports = { start, stop, tick, runPolicyActivation, runAutoDeliver, runPointExpiry };
