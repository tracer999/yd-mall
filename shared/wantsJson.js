/*
 * 이 요청이 "화면 이동" 대신 "JSON 응답"을 원하는가.
 *
 * 인라인 갱신(fetch)으로 부르는 엔드포인트는 302 를 내면 안 된다 — fetch 가 리다이렉트를
 * 따라가 HTML 을 받아오고 .json() 이 깨진다. 폼 전송(비 JS)은 예전처럼 리다이렉트로 답한다.
 * 판정 규칙이 컨트롤러마다 갈라지면 한쪽만 JSON 을 내는 사고가 나므로 여기 한 곳에 둔다.
 */
module.exports = function wantsJson(req) {
    return req.xhr || String(req.get('accept') || '').includes('application/json');
};
