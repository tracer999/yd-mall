/** hero — 컨트롤러가 만든 heroData(슬라이드/피처/LNB)를 그대로 주입한다. */
async function resolve({ shared, locals }) {
    return Object.assign(locals, shared.heroData || {});
}

module.exports = { resolve };
