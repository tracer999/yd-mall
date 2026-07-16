/*
 * URL 업로드 위젯 (관리자 공통)
 *
 * 파일 선택 대신 **이미지/비디오 URL 을 붙여넣으면 서버가 내려받아 우리 사이트에 저장**하고
 * 그 경로를 hidden 필드에 채운다. 외부 URL 을 DB 에 그대로 박지 않기 위한 것 —
 * 상대 사이트가 링크를 바꾸거나 핫링크를 막으면 우리 몰 이미지가 깨진다.
 *
 * 사용법(마크업만 넣으면 자동 활성화):
 *
 *   (1) 이미 있는 hidden 에 값을 넣는 경우 — 히어로 등
 *   <div data-url-upload
 *        data-target="#poster_url"            // 경로가 들어갈 hidden/text input
 *        data-dest="hero" data-kind="image" data-format="webp"
 *        data-preview="#poster_preview">
 *   </div>
 *
 *   (2) 컨테이너에 hidden 을 만들어 넣는 경우 — 상품 폼처럼 hidden 이 동적인 곳
 *   <div data-url-upload
 *        data-hidden-name="imported_main_image"      // 이 이름으로 만들거나 **교체**한다
 *        data-hidden-container="#imported-images"    // 만들어 넣을 컨테이너
 *        data-dest="products" data-kind="image">
 *   </div>
 *
 * ⚠️ (2) 를 쓰는 이유: 상품 폼의 'URL 가져오기'가 #imported-images 를 innerHTML='' 로
 *    비우고 다시 채운다. 같은 이름의 hidden 이 밖에 따로 있으면 **두 개가 전송되어
 *    req.body 가 배열이 되고 서버의 safeImported() 가 조용히 null 을 반환**한다(이미지 유실).
 *    그래서 같은 컨테이너 안에서 이름으로 교체해 항상 하나만 존재하게 한다.
 *
 * 서버: POST /admin/uploads/from-url  { url, dest, kind, format }  →  { success, path }
 * SSRF 방어·크기 상한·재인코딩은 서버(services/media/urlIngest)가 담당한다.
 */
(function () {
    'use strict';

    function build(box) {
        if (box.dataset.urlUploadReady === '1') return;
        box.dataset.urlUploadReady = '1';

        var kind = box.dataset.kind === 'video' ? 'video' : 'image';

        var wrap = document.createElement('div');
        wrap.className = 'mt-1.5 flex items-center gap-1.5';

        var input = document.createElement('input');
        input.type = 'url';
        input.placeholder = kind === 'video'
            ? '🔗 비디오 URL 을 붙여넣으면 서버에 저장됩니다'
            : '🔗 이미지 URL 을 붙여넣으면 서버에 저장됩니다';
        input.className = 'flex-1 text-sm';

        var btn = document.createElement('button');
        btn.type = 'button';   // 폼 제출 방지
        btn.className = 'shrink-0 rounded-md bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-black disabled:opacity-50';
        btn.textContent = '가져오기';

        var note = document.createElement('p');
        note.className = 'text-[11px] mt-1';

        function say(msg, ok) {
            note.textContent = msg;
            note.className = 'text-[11px] mt-1 ' + (ok ? 'text-emerald-600' : 'text-red-600');
        }

        function run() {
            var url = input.value.trim();
            if (!url) { say('URL 을 입력하세요.', false); return; }

            btn.disabled = true;
            btn.textContent = '가져오는 중…';
            note.textContent = '';

            fetch('/admin/uploads/from-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: url,
                    dest: box.dataset.dest || 'products',
                    kind: kind,
                    format: box.dataset.format || undefined,
                }),
            })
                .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
                .then(function (res) {
                    if (!res.ok || !res.j.success) throw new Error(res.j.error || '가져오지 못했습니다.');
                    var path = res.j.path;

                    // (1) 기존 input 에 값 넣기
                    var target = box.dataset.target && document.querySelector(box.dataset.target);
                    if (target) target.value = path;

                    // (2) 컨테이너 안에 이름으로 hidden 생성/교체 — 항상 하나만 존재하게 한다.
                    var hName = box.dataset.hiddenName;
                    var hBox = box.dataset.hiddenContainer && document.querySelector(box.dataset.hiddenContainer);
                    if (hName && hBox) {
                        hBox.querySelectorAll('input[name="' + hName + '"]').forEach(function (el) { el.remove(); });
                        var h = document.createElement('input');
                        h.type = 'hidden';
                        h.name = hName;
                        h.value = path;
                        hBox.appendChild(h);
                    }

                    var prev = box.dataset.preview && document.querySelector(box.dataset.preview);
                    if (prev) {
                        if (prev.tagName === 'IMG') { prev.src = path; prev.classList.remove('hidden'); }
                        else if (prev.tagName === 'VIDEO') { prev.src = path; prev.classList.remove('hidden'); }
                    }
                    say('저장됨: ' + path, true);
                    input.value = '';
                })
                .catch(function (e) { say(e.message, false); })
                .finally(function () { btn.disabled = false; btn.textContent = '가져오기'; });
        }

        btn.addEventListener('click', run);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); run(); }   // 폼 전체 제출 방지
        });

        wrap.appendChild(input);
        wrap.appendChild(btn);
        box.appendChild(wrap);
        box.appendChild(note);
    }

    function init() {
        document.querySelectorAll('[data-url-upload]').forEach(build);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
