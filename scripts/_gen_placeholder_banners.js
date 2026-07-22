/*
 * 플레이스홀더 배너 이미지 생성 (일회성).
 * public/uploads/banners/ 에 ph-*.png 로 떨군다. 파일명은 실제 업로드와 구분되게 'ph-' 접두.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT_DIR = path.join(__dirname, '..', 'public', 'uploads', 'banners');
fs.mkdirSync(OUT_DIR, { recursive: true });

/** 배너 자리별 색 — 화면에서 어느 배너인지 색만 보고도 구분되게 한다. */
const PALETTE = {
    hero: ['#1e3a8a', '#3b82f6'],
    heroM: ['#1e3a8a', '#3b82f6'],
    topbar: ['#0f172a', '#334155'],
    category: ['#4338ca', '#818cf8'],
    categoryCommon: ['#047857', '#34d399'],
    brand: ['#7e22ce', '#c084fc'],
    brandCommon: ['#065f46', '#6ee7b7'],
    popup: ['#c2410c', '#fb923c'],
    menu: ['#0f766e', '#5eead4'],
    promo: ['#be185d', '#f472b6'],
};

function svg({ w, h, from, to, label, sub }) {
    const titleSize = Math.round(Math.min(w, h * 2) / 14);
    const subSize = Math.round(titleSize * 0.5);
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
    </linearGradient>
    <pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="20" height="40" fill="#ffffff" opacity="0.05"/>
    </pattern>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <rect width="${w}" height="${h}" fill="url(#p)"/>
  <rect x="8" y="8" width="${w - 16}" height="${h - 16}" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="3" stroke-dasharray="14 10"/>
  <text x="50%" y="47%" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif"
        font-size="${titleSize}" font-weight="700" fill="#ffffff" letter-spacing="2">${label}</text>
  <text x="50%" y="47%" dy="${subSize * 1.9}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif"
        font-size="${subSize}" fill="#ffffff" fill-opacity="0.8" letter-spacing="1">${sub}</text>
</svg>`);
}

async function make(name, kind, w, h, label) {
    const [from, to] = PALETTE[kind];
    const file = path.join(OUT_DIR, `${name}.png`);
    await sharp(svg({ w, h, from, to, label, sub: `PLACEHOLDER ${w}x${h}` })).png().toFile(file);
    return `/uploads/banners/${name}.png`;
}

(async () => {
    const made = [];
    const push = async (...a) => made.push(await make(...a));

    for (const i of [1, 2]) {
        await push(`ph-hero-${i}`, 'hero', 1920, 600, `MAIN HERO ${i}`);
        await push(`ph-hero-m-${i}`, 'heroM', 900, 1200, `MAIN HERO ${i} (M)`);
        await push(`ph-topbar-${i}`, 'topbar', 600, 96, `TOPBAR ${i}`);
        await push(`ph-category-${i}`, 'category', 1600, 400, `CATEGORY BANNER ${i}`);
        await push(`ph-category-common-${i}`, 'categoryCommon', 1600, 400, `CATEGORY COMMON ${i}`);
        await push(`ph-brand-${i}`, 'brand', 1600, 400, `BRAND BANNER ${i}`);
        await push(`ph-brand-common-${i}`, 'brandCommon', 1600, 400, `BRAND COMMON ${i}`);
        await push(`ph-popup-${i}`, 'popup', 520, 640, `POPUP ${i}`);
        await push(`ph-promo-${i}`, 'promo', 1280, 480, `PROMOTION ${i}`);
    }
    // 메뉴별 배너 — 메뉴마다 2장(4:3)
    const menus = process.argv.slice(2);
    for (const code of menus) {
        for (const i of [1, 2]) {
            await push(`ph-menu-${code.toLowerCase().replace(/_/g, '-')}-${i}`, 'menu', 800, 600, `MENU ${code} ${i}`);
        }
    }
    console.log(made.join('\n'));
    console.log(`\n총 ${made.length}장`);
})();
