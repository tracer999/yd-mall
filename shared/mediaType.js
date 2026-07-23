/*
 * 업로드된 미디어가 영상인지 판별한다.
 *
 * 배너(banners)에는 미디어 종류 컬럼이 없다. 이미지든 영상이든 같은 *_image_url 컬럼에
 * 경로 하나로 담기므로, 렌더 시점에 <img> 로 그릴지 <video> 로 그릴지를 **확장자로** 정한다.
 * (컬럼을 늘리면 마이그레이션 + 기존 행 백필이 따라오는데, 확장자 판별로 충분하다.)
 */

/** 브라우저가 <video> 로 재생할 수 있는 확장자. mov 는 코덱에 따라 안 될 수 있으나 업로드는 허용한다. */
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v', '.ogv'];

/**
 * 이 경로/파일명이 영상인가.
 * @param {string} url 업로드 경로(/uploads/banners/...) 또는 원본 파일명
 */
function isVideoUrl(url) {
    if (!url) return false;
    // 쿼리스트링·해시가 붙어 있어도 확장자를 찾을 수 있게 잘라낸다.
    const clean = String(url).split(/[?#]/)[0].toLowerCase();
    return VIDEO_EXTENSIONS.some(ext => clean.endsWith(ext));
}

module.exports = { isVideoUrl, VIDEO_EXTENSIONS };
