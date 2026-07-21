/*
 * 견적서 PDF (설계 §8.4, §8.5).
 *
 * 생성 수단은 **pdfmake** 다. puppeteer 를 쓰지 않는 이유:
 *  · 앱서버에 Chromium 시스템 의존성을 깔아야 하고, 패키지가 ~300MB 다.
 *  · PM2 가 fork·instances:1 이라 브라우저 프로세스가 메인과 메모리를 다툰다.
 *  · 견적서는 고정 레이아웃 표 문서라 브라우저 렌더러가 과잉이다.
 *
 * 한글 폰트는 public/fonts/ 의 나눔고딕을 파일 경로로 등록한다(브라우저용 vfs 는 쓰지 않는다).
 * 폰트는 저장소에 커밋돼 있어 배포 서버가 git 으로 함께 받아간다.
 *
 * 발행한 PDF 는 storage/quote/ (public 밖)에 남기고 quote_revision.pdf_path 로 되짚는다 —
 * "그때 보낸 문서" 가 그대로 보존돼야 분쟁이 없다.
 */

const fs = require('fs');
const path = require('path');
const PdfPrinter = require('pdfmake');
const pool = require('../../config/db');
const quoteService = require('./quoteService');

const FONT_DIR = path.join(__dirname, '../../public/fonts');
const OUT_DIR = path.join(__dirname, '../../storage/quote');

// 폰트 파싱은 무겁다 — 모듈 로드 시 1회만 만든다.
let printer = null;
function getPrinter() {
    if (printer) return printer;
    printer = new PdfPrinter({
        NanumGothic: {
            normal: path.join(FONT_DIR, 'NanumGothic-Regular.ttf'),
            bold: path.join(FONT_DIR, 'NanumGothic-Bold.ttf'),
            italics: path.join(FONT_DIR, 'NanumGothic-Regular.ttf'),
            bolditalics: path.join(FONT_DIR, 'NanumGothic-Bold.ttf'),
        },
    });
    return printer;
}

const won = (n) => Number(n || 0).toLocaleString('ko-KR');
const dateStr = (v) => (v ? new Date(v).toLocaleDateString('ko-KR') : '-');

/** 견적 데이터 → pdfmake 문서 정의. */
function buildDocDefinition({ quote, items }, siteSettings = {}) {
    const supplier = {
        name: siteSettings.company_name || '와이디몰',
        bizNo: siteSettings.business_number || '',
        ceo: siteSettings.ceo_name || '',
        addr: siteSettings.company_address || '',
        tel: siteSettings.company_phone || '',
    };

    const body = [[
        { text: 'No', style: 'th', alignment: 'center' },
        { text: '품목', style: 'th' },
        { text: '규격', style: 'th' },
        { text: '수량', style: 'th', alignment: 'right' },
        { text: '단가', style: 'th', alignment: 'right' },
        { text: '공급가', style: 'th', alignment: 'right' },
        { text: '부가세', style: 'th', alignment: 'right' },
    ]];

    let supplySum = 0;
    let vatSum = 0;
    items.forEach((it, idx) => {
        const unit = quoteService.effectiveUnitPrice(it);
        const gross = unit * it.quantity;
        const taxable = !it.tax_type_snapshot || it.tax_type_snapshot === 'TAXABLE';
        const supply = taxable ? Math.round(gross / 1.1) : gross;
        const vat = taxable ? gross - supply : 0;
        supplySum += supply;
        vatSum += vat;

        body.push([
            { text: String(idx + 1), alignment: 'center' },
            { text: it.product_name_snapshot || '' },
            { text: it.sku_snapshot || '-', fontSize: 8, color: '#666' },
            { text: won(it.quantity), alignment: 'right' },
            { text: won(unit), alignment: 'right' },
            { text: won(supply), alignment: 'right' },
            { text: won(vat), alignment: 'right' },
        ]);
    });

    const shipping = Number(quote.shipping_amount) || 0;
    const discount = Number(quote.discount_amount) || 0;
    const grandTotal = Math.max(0, supplySum + vatSum + shipping - discount);

    return {
        pageSize: 'A4',
        pageMargins: [40, 50, 40, 50],
        defaultStyle: { font: 'NanumGothic', fontSize: 9, lineHeight: 1.2 },
        styles: {
            title: { fontSize: 22, bold: true, alignment: 'center', margin: [0, 0, 0, 4] },
            th: { bold: true, fontSize: 9, fillColor: '#f3f4f6' },
            label: { fontSize: 8, color: '#666' },
        },
        content: [
            { text: '견 적 서', style: 'title' },
            {
                columns: [
                    { text: `견적번호  ${quote.quote_number}`, fontSize: 9 },
                    { text: `발행일  ${dateStr(new Date())}   (v${quote.version})`, fontSize: 9, alignment: 'right' },
                ],
                margin: [0, 0, 0, 12],
            },
            {
                columns: [
                    {
                        width: '50%',
                        stack: [
                            { text: '수신', style: 'label' },
                            { text: quote.company_name || '', bold: true, fontSize: 11 },
                            { text: `사업자등록번호  ${quote.business_number || '-'}`, fontSize: 8 },
                            { text: `대표  ${quote.representative_name || '-'}`, fontSize: 8 },
                            { text: `담당  ${quote.requester_name || '-'}`, fontSize: 8 },
                        ],
                    },
                    {
                        width: '50%',
                        stack: [
                            { text: '공급자', style: 'label' },
                            { text: supplier.name, bold: true, fontSize: 11 },
                            { text: `사업자등록번호  ${supplier.bizNo || '-'}`, fontSize: 8 },
                            { text: `대표  ${supplier.ceo || '-'}`, fontSize: 8 },
                            { text: supplier.addr || '', fontSize: 8 },
                            { text: supplier.tel ? `TEL  ${supplier.tel}` : '', fontSize: 8 },
                        ],
                    },
                ],
                margin: [0, 0, 0, 16],
            },
            {
                table: { headerRows: 1, widths: [18, '*', 70, 40, 55, 60, 50], body },
                layout: {
                    hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5),
                    hLineColor: (i) => (i <= 1 ? '#333' : '#e5e7eb'),
                    vLineWidth: () => 0,
                    paddingTop: () => 5,
                    paddingBottom: () => 5,
                },
                margin: [0, 0, 0, 12],
            },
            {
                columns: [
                    { width: '*', text: '' },
                    {
                        width: 220,
                        table: {
                            widths: ['*', 90],
                            body: [
                                [{ text: '공급가액', fontSize: 9 }, { text: `${won(supplySum)}원`, alignment: 'right' }],
                                [{ text: '부가세', fontSize: 9 }, { text: `${won(vatSum)}원`, alignment: 'right' }],
                                [{ text: '배송비', fontSize: 9 }, { text: `${won(shipping)}원`, alignment: 'right' }],
                                [{ text: '할인', fontSize: 9 }, { text: `-${won(discount)}원`, alignment: 'right' }],
                                [
                                    { text: '합계 금액', bold: true, fontSize: 11 },
                                    { text: `${won(grandTotal)}원`, bold: true, fontSize: 11, alignment: 'right' },
                                ],
                            ],
                        },
                        layout: {
                            hLineWidth: (i, node) => (i === node.table.body.length - 1 || i === node.table.body.length ? 1 : 0.5),
                            hLineColor: () => '#e5e7eb',
                            vLineWidth: () => 0,
                        },
                    },
                ],
                margin: [0, 0, 0, 16],
            },
            {
                table: {
                    widths: [70, '*'],
                    body: [
                        [{ text: '유효기간', style: 'label' }, { text: dateStr(quote.valid_until), fontSize: 9 }],
                        [{ text: '결제 조건', style: 'label' }, { text: quote.payment_terms || '선결제(무통장 입금)', fontSize: 9 }],
                        [{ text: '납기', style: 'label' }, { text: quote.delivery_terms || (quote.requested_delivery_date ? dateStr(quote.requested_delivery_date) : '협의'), fontSize: 9 }],
                    ],
                },
                layout: 'noBorders',
            },
            {
                text: '※ 본 견적서는 위 유효기간 내에서만 효력이 있습니다. 금액은 부가세를 포함한 기준입니다.',
                fontSize: 8, color: '#666', margin: [0, 16, 0, 0],
            },
        ],
        footer: (currentPage, pageCount) => ({
            text: `${currentPage} / ${pageCount}`,
            alignment: 'center', fontSize: 8, color: '#999', margin: [0, 10, 0, 0],
        }),
    };
}

/** PDF 바이트를 만든다(파일로 저장하지 않는 경로 — 즉시 다운로드용). */
function renderBuffer(data, siteSettings) {
    return new Promise((resolve, reject) => {
        try {
            const doc = getPrinter().createPdfKitDocument(buildDocDefinition(data, siteSettings));
            const chunks = [];
            doc.on('data', (c) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * 발행 — PDF 를 파일로 저장하고 현재 리비전에 경로를 기록한다.
 * @returns {Promise<{ok:boolean, filePath?:string, error?:string}>}
 */
async function issue(quoteId, siteSettings = {}) {
    const data = await quoteService.findFull(quoteId);
    if (!data) return { ok: false, error: '견적을 찾을 수 없습니다.' };

    const buf = await renderBuffer(data, siteSettings);
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    // 리비전 번호를 파일명에 넣어 "그때 보낸 문서" 가 덮이지 않게 한다.
    const rev = Math.max(1, Number(data.quote.version) - 1);
    const fileName = `${data.quote.quote_number}_v${rev}.pdf`;
    const filePath = path.join(OUT_DIR, fileName);
    fs.writeFileSync(filePath, buf);

    const rel = path.relative(path.join(__dirname, '../..'), filePath);
    await pool.query(
        'UPDATE quote_revision SET pdf_path = ? WHERE quote_id = ? AND revision_number = ?',
        [rel, quoteId, rev]
    );
    return { ok: true, filePath, relativePath: rel, fileName, buffer: buf };
}

module.exports = { renderBuffer, issue, buildDocDefinition, OUT_DIR };
