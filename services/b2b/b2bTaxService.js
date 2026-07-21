/*
 * ── 공급가액 / 부가세 분해 (설계 §4.6, §4.7) ──
 *
 * 이 몰의 products.price 는 **부가세 포함가**다. B2B 는 "공급가 별도" 표기가 기본이라
 * 표시·주문·세금계산서에서 공급가와 부가세를 갈라야 한다.
 *
 * ⚠️ 라인마다 round(price/1.1) 을 구해 합산하면 주문 총액에서 계산한 공급가액과
 *    1~2원 어긋난다. 세금계산서 불일치의 단골 원인이다. 그래서 규칙을 하나로 고정한다:
 *
 *      총액(VAT 포함)을 고정 → 공급가액을 라인 합으로 → 부가세 = 총액 − 공급가액
 *
 *    즉 부가세를 역산하고, 잔차는 금액이 가장 큰 라인이 흡수한다. 그래야
 *      Σ line.supply = order.supply_amount
 *      order.supply_amount + order.vat_amount = order.total_amount
 *    가 항상 성립한다.
 */

const VAT_RATE = 0.1;

/** 과세 상품만 부가세를 갖는다. 면세·영세율은 공급가 = 판매가, 부가세 0. */
function isTaxable(taxType) {
    return !taxType || taxType === 'TAXABLE';
}

/**
 * 부가세 포함 금액을 공급가/부가세로 나눈다.
 * @param {number} grossAmount VAT 포함 금액
 * @param {string} taxType TAXABLE|TAX_FREE|ZERO_RATED
 */
function split(grossAmount, taxType = 'TAXABLE') {
    const gross = Math.max(0, Math.round(Number(grossAmount) || 0));
    if (!isTaxable(taxType)) return { supply: gross, vat: 0, taxFree: gross };
    const supply = Math.round(gross / (1 + VAT_RATE));
    return { supply, vat: gross - supply, taxFree: 0 };
}

/**
 * 주문 라인들의 세액을 한 번에 계산한다. 라인 합과 주문 총액이 반드시 일치한다.
 *
 * @param {Array<{price:number, quantity:number, tax_type?:string}>} items
 * @returns {{
 *   lines: Array<{supplyPrice:number, vatPrice:number, gross:number, taxable:boolean}>,
 *   supplyAmount:number, vatAmount:number, taxFreeAmount:number, grossAmount:number
 * }}
 */
function calcOrderTax(items = []) {
    const lines = (items || []).map((it) => {
        const gross = Math.max(0, Math.round(Number(it.price) || 0)) * Math.max(0, Number(it.quantity) || 0);
        const taxable = isTaxable(it.tax_type);
        const s = split(gross, it.tax_type);
        return { gross, taxable, supplyPrice: s.supply, vatPrice: s.vat };
    });

    const grossAmount = lines.reduce((sum, l) => sum + l.gross, 0);
    const taxFreeAmount = lines.filter((l) => !l.taxable).reduce((sum, l) => sum + l.gross, 0);

    // 과세분만 모아 총액 기준으로 다시 나눈다 — 이게 기준값이다.
    const taxableGross = grossAmount - taxFreeAmount;
    const supplyAmount = Math.round(taxableGross / (1 + VAT_RATE));
    const vatAmount = taxableGross - supplyAmount;

    /*
     * 라인 합을 기준값에 맞춘다. 반올림 잔차(보통 ±1~2원)를 과세 라인 중 가장 큰 것에 얹는다.
     * 작은 라인에 얹으면 단가 대비 오차율이 커 보여 CS 를 부른다.
     */
    const taxableLines = lines.filter((l) => l.taxable);
    if (taxableLines.length > 0) {
        const lineSupplySum = taxableLines.reduce((sum, l) => sum + l.supplyPrice, 0);
        const diff = supplyAmount - lineSupplySum;
        if (diff !== 0) {
            const biggest = taxableLines.reduce((a, b) => (b.gross > a.gross ? b : a));
            biggest.supplyPrice += diff;
            biggest.vatPrice = biggest.gross - biggest.supplyPrice;
        }
    }

    return { lines, supplyAmount, vatAmount, taxFreeAmount, grossAmount };
}

/** 화면 표기용 문자열 — "공급가 100,000원 + VAT 10,000원" */
function formatSplit(grossAmount, taxType = 'TAXABLE') {
    const { supply, vat } = split(grossAmount, taxType);
    const won = (n) => Number(n).toLocaleString('ko-KR');
    if (!isTaxable(taxType)) return `${won(supply)}원 (면세)`;
    return `공급가 ${won(supply)}원 + VAT ${won(vat)}원`;
}

module.exports = {
    VAT_RATE,
    isTaxable,
    split,
    calcOrderTax,
    formatSplit,
};
