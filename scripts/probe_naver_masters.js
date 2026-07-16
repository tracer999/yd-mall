/*
 * 네이버 커머스 API 마스터 데이터 read-only 프로브
 * ─────────────────────────────────────────────────────────────
 * 목적: 브랜드/모델/제조사/카테고리별 속성 엔드포인트의 **실제 응답 구조**
 *       (필드명·검색 파라미터·페이징·카테고리 종속)를 확인해 설계를 확정한다.
 *
 * ⚠️ 네이버 API 는 IP 화이트리스트라 **개발서버(허용 IP)에서만** 200 을 준다.
 *    로컬에서 실행하면 토큰 발급이 403 GW.IP_NOT_ALLOWED 로 막힌다.
 *
 * 안전: **GET 만 호출. DB·네이버에 쓰기 없음.** (naver_category 는 읽기만)
 *
 * 실행(개발서버 /data/yd-mall 에서):
 *   set -a; . /etc/environment; set +a
 *   node scripts/probe_naver_masters.js            # 기본 검색어(삼성)
 *   node scripts/probe_naver_masters.js 나이키       # 검색어 지정
 *
 * 설계 문서: docs/사이트개선/네이버_마스터데이터_수신_설계.md §7
 */

const bootstrap = require('./_bootstrap');
const cred = require('../services/sourcing/credential');
const nc = require('../services/sourcing/channel/naverClient');
const pool = require('../config/db');

const KEYWORD = process.argv[2] || '삼성';

function summarize(data) {
    if (Array.isArray(data)) {
        return { shape: 'array', count: data.length, first: data[0], keys: data[0] ? Object.keys(data[0]) : [] };
    }
    if (data && typeof data === 'object') {
        const listKey = ['contents', 'data', 'list', 'items', 'brands', 'models', 'attributes', 'result']
            .find((k) => Array.isArray(data[k]));
        const list = listKey ? data[listKey] : null;
        return {
            shape: 'object', topKeys: Object.keys(data),
            listKey, count: list ? list.length : null,
            first: list ? list[0] : undefined,
            itemKeys: list && list[0] ? Object.keys(list[0]) : [],
        };
    }
    return { shape: typeof data, value: data };
}

async function main() {
    await bootstrap();

    const [rows] = await pool.query(
        "SELECT id, mall_id FROM mall_channel_credential WHERE channel='NAVER_SMARTSTORE' AND secret_enc IS NOT NULL AND status='ACTIVE' ORDER BY last_verified_at DESC, id ASC LIMIT 1"
    );
    if (!rows.length) { console.log('활성 네이버 크리덴셜 없음'); return pool.end(); }
    const c = await cred.getCredential(rows[0].mall_id, rows[0].id);

    let token;
    try {
        token = await nc.getAccessToken(c);
        console.log('토큰 발급 OK\n');
    } catch (e) {
        console.log('토큰 발급 실패:', e.message);
        console.log('→ 로컬이면 IP 차단(403 GW.IP_NOT_ALLOWED). 개발서버에서 실행하세요.');
        return pool.end();
    }

    async function GET(path) {
        const res = await fetch(`${nc.BASE_URL}${path}`, {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        const text = await res.text();
        let json = null; try { json = JSON.parse(text); } catch (_) {}
        return { status: res.status, json, text };
    }

    // 성공한 첫 변형의 {path, json} 반환(없으면 null)
    async function probe(label, paths) {
        console.log('\n══════════ ' + label + ' ══════════');
        for (const p of paths) {
            const r = await GET(p);
            if (r.status === 200) {
                console.log(`✅ ${p} → 200`);
                console.log('   구조:', JSON.stringify(summarize(r.json), null, 0).slice(0, 800));
                return { path: p, json: r.json };
            }
            console.log(`✗ ${p} → ${r.status} ${r.text.slice(0, 160)}`);
        }
        return null;
    }

    // 속성 조회용 리프 카테고리
    const [[cat]] = await pool.query('SELECT naver_category_id FROM naver_category WHERE is_leaf=1 LIMIT 1');
    const catId = cat ? cat.naver_category_id : '50000151';
    const kw = encodeURIComponent(KEYWORD);

    // 1) 브랜드 조회 — 브랜드명 검색
    await probe('브랜드 조회 /v1/product-brands (검색어=' + KEYWORD + ')', [
        `/v1/product-brands?brandName=${kw}`,
        `/v1/product-brands?name=${kw}`,
        `/v1/product-brands?searchKeyword=${kw}`,
        `/v1/product-brands?keyword=${kw}`,
        `/v1/product-brands?query=${kw}`,
        `/v1/product-brands`,
    ]);

    // 2) 카탈로그(모델) 조회 — 모델명 검색
    await probe('모델 조회 /v1/product-models (검색어=' + KEYWORD + ')', [
        `/v1/product-models?modelName=${kw}`,
        `/v1/product-models?name=${kw}`,
        `/v1/product-models?searchKeyword=${kw}`,
        `/v1/product-models?keyword=${kw}`,
    ]);

    // 3) 카테고리별 속성 조회
    const attrRes = await probe('카테고리별 속성 /v1/product-attributes (categoryId=' + catId + ')', [
        `/v1/product-attributes?categoryId=${catId}`,
        `/v1/product-attributes?leafCategoryId=${catId}`,
        `/v1/product-attributes?categoryIds=${catId}`,
        `/v1/product-attributes/${catId}`,
        `/v1/product-attributes`,
    ]);

    // 4) 카테고리별 속성값 조회 — 위 속성 응답에서 속성 id 를 뽑아 시도
    let attrId = null;
    if (attrRes && attrRes.json) {
        const list = Array.isArray(attrRes.json) ? attrRes.json
            : (attrRes.json.contents || attrRes.json.data || attrRes.json.attributes || attrRes.json.list || []);
        const first = Array.isArray(list) ? list[0] : null;
        if (first) {
            // 흔한 속성 id 필드명 후보에서 값 추출
            for (const k of ['attributeSeq', 'attributeId', 'attributeNo', 'id', 'seq', 'no']) {
                if (first[k] != null) { attrId = first[k]; break; }
            }
            console.log('   → 속성값 조회에 쓸 속성 id 후보:', attrId, '(속성 첫 항목 키:', Object.keys(first).join(','), ')');
        }
    }
    const aId = attrId != null ? encodeURIComponent(attrId) : '';
    await probe('카테고리별 속성값 /v1/product-attributes/attribute-values', [
        `/v1/product-attributes/attribute-values?categoryId=${catId}&attributeSeq=${aId}`,
        `/v1/product-attributes/attribute-values?categoryId=${catId}&attributeId=${aId}`,
        `/v1/product-attributes/attribute-values?attributeSeq=${aId}`,
        `/v1/product-attributes/attribute-values?attributeId=${aId}`,
        `/v1/product-attributes/attribute-values?categoryId=${catId}`,
        `/v1/product-attributes/attribute-values`,
    ]);

    console.log('\n── 참고: 위 성공 응답의 필드명/리스트키/페이징 여부로 naver_* 테이블 컬럼과 요청 파라미터를 확정한다.');
    await pool.end();
}

main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
