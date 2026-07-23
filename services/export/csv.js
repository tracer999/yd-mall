/*
 * CSV 내보내기 · 읽어들이기 공용 유틸
 *
 * 포맷을 CSV 로 통일한 이유 — 외부 의존성 없이 **엑셀에서 더블클릭하면 바로 열리고**,
 * 반대로 운영자가 엑셀에서 "다른 이름으로 저장 → CSV UTF-8" 한 파일을 그대로 받을 수 있다.
 * 대신 BOM(﻿)을 반드시 붙인다. 이게 없으면 엑셀이 한글을 깨서 연다 — CSV 한글 깨짐의 99%가 이것이다.
 *
 * 쓰는 곳: 주문 내려받기, 송장 일괄 등록, 상품 일괄 등록, 정산 리포트, 회원·포인트 내려받기.
 */

const BOM = '﻿';

/** 값 하나를 CSV 셀로 감싼다. */
function cell(value) {
    if (value === null || value === undefined) return '';
    let s = String(value);
    // 숫자로 보이는 긴 문자열(운송장·전화·우편번호)은 엑셀이 지수표기로 뭉갠다. 앞에 탭을 붙여 문자열로 고정한다.
    if (/^\d{9,}$/.test(s)) s = `\t${s}`;
    if (/[",\r\n\t]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

/**
 * 행 배열을 CSV 문자열로 만든다.
 * @param {Array<Object>} rows
 * @param {Array<{key:string, label:string, value?:Function}>} columns
 */
function toCsv(rows, columns) {
    const head = columns.map((c) => cell(c.label)).join(',');
    const body = rows.map((row) =>
        columns.map((c) => cell(c.value ? c.value(row) : row[c.key])).join(',')
    );
    return BOM + [head, ...body].join('\r\n') + '\r\n';
}

/** 파일명에 쓸 수 없는 문자를 걷어낸다. 한글은 그대로 둔다. */
function safeFilename(name) {
    return String(name).replace(/[\\/:*?"<>|]/g, '_');
}

/**
 * CSV 를 다운로드 응답으로 내려보낸다.
 * 파일명은 RFC 5987 로 한 번 더 실어 한글 파일명이 브라우저에서 깨지지 않게 한다.
 */
function sendCsv(res, filename, rows, columns) {
    const csv = toCsv(rows, columns);
    const safe = safeFilename(filename);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',
        `attachment; filename="${encodeURIComponent(safe)}"; filename*=UTF-8''${encodeURIComponent(safe)}`);
    res.send(csv);
}

/**
 * CSV 텍스트를 행 배열로 판다. 따옴표 안의 쉼표·줄바꿈·이스케이프("")를 지킨다.
 * 반환: 문자열 배열의 배열(헤더 포함).
 */
function parseCsv(text) {
    let s = String(text || '');
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // BOM 제거
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (quoted) {
            if (ch === '"') {
                if (s[i + 1] === '"') { field += '"'; i++; }   // 이스케이프된 따옴표
                else quoted = false;
            } else field += ch;
            continue;
        }
        if (ch === '"') { quoted = true; continue; }
        if (ch === ',') { row.push(field); field = ''; continue; }
        if (ch === '\r') continue;
        if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
        field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }

    // 완전히 빈 줄은 버린다(엑셀이 파일 끝에 흔히 남긴다).
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

/**
 * 헤더 행을 읽어 `{컬럼별칭 → 인덱스}` 를 만든다.
 * 운영자가 헤더의 공백·괄호주석을 조금 바꿔도 통과하도록 느슨하게 맞춘다.
 * @param {Array<string>} headerRow
 * @param {Object<string, string[]>} aliases 예) { orderNumber: ['주문번호', 'order_number'] }
 */
function mapHeader(headerRow, aliases) {
    const norm = (v) => String(v || '').replace(/\s|\(.*?\)|﻿/g, '').toLowerCase();
    const normalized = headerRow.map(norm);
    const index = {};
    for (const [key, names] of Object.entries(aliases)) {
        const pos = normalized.findIndex((h) => names.some((n) => norm(n) === h));
        index[key] = pos;   // 못 찾으면 -1
    }
    return index;
}

/** 셀 값 꺼내기 — 앞에서 붙인 탭 방지문자와 공백을 걷어낸다. */
function pick(row, idx) {
    if (idx == null || idx < 0) return '';
    return String(row[idx] == null ? '' : row[idx]).replace(/^\t/, '').trim();
}

module.exports = { toCsv, sendCsv, parseCsv, mapHeader, pick, safeFilename };
