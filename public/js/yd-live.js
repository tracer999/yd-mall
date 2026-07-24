/*
 * yd-live.js — 화면 리프레시 없이 갱신되어야 하는 공용 조각들.
 *
 * 장바구니 뱃지는 헤더·우측레일·모바일 하단탭 등 6곳에 흩어져 있고 마크업도 제각각이다.
 * 각 화면이 따로 갱신 코드를 두면 새 헤더 스킨이 생길 때마다 빠뜨린다. 그래서
 * "뱃지는 data-cart-badge 를 달고 항상 렌더한다"는 규칙 하나만 두고, 갱신은 여기서만 한다.
 *
 * main_layout 에서 전역 로드되므로 모든 고객 화면에서 window.yd* 를 바로 쓸 수 있다.
 */
(function () {
    'use strict';

    /* ---------------------------------------------------------------- 공통 요청 */

    /**
     * 서버가 302 대신 JSON 으로 답하게 하는 헤더를 붙인 POST.
     * fetch 는 리다이렉트를 자동으로 따라가 HTML 을 받아오므로, 이 헤더가 없으면
     * .json() 이 깨진다. AJAX 로 부르는 엔드포인트는 전부 이 함수를 쓴다.
     */
    window.ydPostJson = function (url, body) {
        var init = {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        };
        if (body instanceof FormData) {
            init.body = new URLSearchParams(body);
        } else if (body instanceof URLSearchParams) {
            init.body = body;
        } else if (body && typeof body === 'object') {
            init.headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(body);
        }
        return fetch(url, init).then(function (res) {
            return res.json()
                .catch(function () { return null; })
                .then(function (data) {
                    return { status: res.status, ok: res.ok, data: data };
                });
        });
    };

    /* ---------------------------------------------------------------- 장바구니 뱃지 */

    /**
     * 화면 안의 모든 장바구니 뱃지를 n 으로 맞춘다.
     * 0 이면 숨긴다 — 뱃지 요소 자체는 항상 렌더되므로 0 → 1 전환도 잡힌다.
     * display 는 인라인 스타일로 다룬다. Tailwind 의 hidden 은 뱃지들이 이미 갖고 있는
     * flex 와 같은 레이어라 어느 쪽이 이길지 소스 순서에 좌우된다.
     */
    window.ydSetCartCount = function (n) {
        var count = Math.max(0, Number(n) || 0);
        var badges = document.querySelectorAll('[data-cart-badge]');
        for (var i = 0; i < badges.length; i++) {
            // 모바일 레일 뱃지는 99+ 로 줄여 그린다 — 서버 렌더와 같은 규칙을 지킨다.
            badges[i].textContent = count > 99 ? '99+' : String(count);
            badges[i].style.display = count > 0 ? '' : 'none';
        }
    };

    /* ---------------------------------------------------------------- 찜 하트 */

    /**
     * 같은 상품 하트가 한 화면에 여러 번 그려질 수 있다(목록 카드 + 추천 슬라이더,
     * 모바일용·PC용 분리 렌더). 하나를 눌렀으면 나머지도 같이 바뀌어야 한다.
     *
     * 훅: 버튼에 data-like-product="<상품ID>" 를 달아 두면 여기서 함께 갱신한다.
     * 색은 화면마다 달라 버튼의 data-liked-class / data-unliked-class 로 받는다(없으면 클래스는 두고 아이콘만 바꿈).
     */
    window.ydSyncLikeButtons = function (productId, liked, exceptEl) {
        var id = String(productId);
        var btns = document.querySelectorAll('[data-like-product="' + id.replace(/"/g, '') + '"]');
        for (var i = 0; i < btns.length; i++) {
            var btn = btns[i];
            if (btn === exceptEl) continue;
            applyLikeState(btn, liked);
        }
    };

    /** 버튼 하나의 찜 상태 표시를 바꾼다. 누른 버튼 자신에게도 쓴다. */
    window.ydApplyLikeState = applyLikeState;

    function applyLikeState(btn, liked) {
        var on = !!liked;
        btn.dataset.liked = on ? '1' : '0';
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (btn.title) btn.title = on ? '찜 해제' : '찜하기';

        var icon = btn.querySelector('i');
        if (icon) {
            icon.classList.toggle('bi-heart-fill', on);
            icon.classList.toggle('bi-heart', !on);
        }

        var likedCls = (btn.dataset.likedClass || '').split(' ').filter(Boolean);
        var unlikedCls = (btn.dataset.unlikedClass || '').split(' ').filter(Boolean);
        likedCls.forEach(function (c) { btn.classList.toggle(c, on); });
        unlikedCls.forEach(function (c) { btn.classList.toggle(c, !on); });
    }

    /* ---------------------------------------------------------------- 토스트 */

    /**
     * alert 은 흐름을 끊고 모바일에서 특히 거슬린다. 결과만 알리면 되는 자리에 쓴다.
     * 확인이 필요한 실패(로그인 필요 등)는 여전히 이동·모달로 다룬다.
     */
    window.ydToast = function (message, type) {
        if (!message) return;
        var host = document.getElementById('yd-toast-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'yd-toast-host';
            host.style.cssText = 'position:fixed;left:50%;bottom:88px;transform:translateX(-50%);' +
                'z-index:200;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;';
            document.body.appendChild(host);
        }

        var el = document.createElement('div');
        el.textContent = message;
        el.style.cssText = 'max-width:calc(100vw - 32px);padding:10px 18px;border-radius:9999px;' +
            'font-size:13px;font-weight:600;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.18);' +
            'opacity:0;transform:translateY(6px);transition:opacity .18s,transform .18s;' +
            'background:' + (type === 'error' ? '#dc2626' : '#111827') + ';';
        host.appendChild(el);

        requestAnimationFrame(function () {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        });
        setTimeout(function () {
            el.style.opacity = '0';
            el.style.transform = 'translateY(6px)';
            setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
        }, 2200);
    };
})();
