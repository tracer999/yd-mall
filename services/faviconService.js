const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

// png-to-ico v3+는 ESM 전용이므로 CommonJS에서는 동적 import로 지연 로딩한다.
let pngToIcoPromise;
function loadPngToIco() {
    if (!pngToIcoPromise) {
        pngToIcoPromise = import('png-to-ico').then((mod) => mod.default || mod);
    }
    return pngToIcoPromise;
}

function makePublicUrlFromAbsolute(absPath) {
    const normalized = absPath.replace(/\\/g, '/');
    const marker = '/public/';
    const idx = normalized.indexOf(marker);
    if (idx === -1) return normalized;
    return normalized.substring(idx + '/public'.length);
}

async function generateIcoFromImage(uploadedAbsPath) {
    const outputDir = path.join(process.cwd(), 'public', 'uploads', 'favicon');
    await fs.mkdir(outputDir, { recursive: true });

    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const png16 = path.join(outputDir, `${stamp}-16.png`);
    const png32 = path.join(outputDir, `${stamp}-32.png`);
    const png48 = path.join(outputDir, `${stamp}-48.png`);
    const icoPath = path.join(outputDir, `${stamp}.ico`);

    try {
        const image = sharp(uploadedAbsPath).rotate();
        await Promise.all([
            image.clone().resize(16, 16, { fit: 'cover' }).png().toFile(png16),
            image.clone().resize(32, 32, { fit: 'cover' }).png().toFile(png32),
            image.clone().resize(48, 48, { fit: 'cover' }).png().toFile(png48)
        ]);

        const pngToIco = await loadPngToIco();
        const icoBuffer = await pngToIco([png16, png32, png48]);
        await fs.writeFile(icoPath, icoBuffer);

        return makePublicUrlFromAbsolute(icoPath);
    } catch (err) {
        await fs.unlink(icoPath).catch(() => {});
        throw err;
    } finally {
        await Promise.all([
            fs.unlink(png16).catch(() => {}),
            fs.unlink(png32).catch(() => {}),
            fs.unlink(png48).catch(() => {})
        ]);
    }
}

module.exports = {
    generateIcoFromImage
};
