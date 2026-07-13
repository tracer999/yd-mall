# 세션 인계 파일 (cho)

> 이 파일은 **세션 종료 시마다 최신 작업 내용으로 전면 교체**된다.
> 다음 세션은 이 파일을 먼저 읽고 이어간다. 오래된 내역은 보존하지 않음.

**최종 업데이트**: 2026-07-13

---

## 최근 세션 요약

- **한 일**: 메인 화면 캐러셀(상품·특가·브랜드)이 모바일에서 자유 스크롤로 동작하던 것을 **한 스와이프 = 한 페이지 슬라이드 + 도트 인디케이터**로 교체. 공용 `views/partials/sections/_carousel_base.ejs` 단일 파일 수정.
- **현재 운영 상태**: 작업 트리 clean, `origin/main` 과 동기. 마지막 푸시 `c489fb7` → GitHub Actions 로 개발 서버(192.168.1.4:3006) 자동 반영됨.
- **다음 할 일**: 실기기(iOS Safari / Android Chrome)에서 스와이프 감도·세로 스크롤 간섭 육안 확인. 필요 시 임계값 조정.

---

## 이번 세션 커밋

| 커밋 | 내용 |
|------|------|
| `dd9abca` | 모바일 캐러셀 슬라이드 — 스와이프 1회에 2페이지 밀리던 것 수정 + `touchcancel` 빈 `changedTouches` 가드 |
| `c489fb7` | 배너 관리 — 저장·삭제 후 보던 탭으로 복귀 + 상품 캐러셀 공존 안내 (**병렬 세션 작업분**, 사용자 지시로 함께 푸시) |

> 슬라이드 **본체**(터치 드래그 핸들러 + 도트 인디케이터 CSS/DOM)는 직전 커밋 `f974fc3` 에 이미 포함돼 있었다. `dd9abca` 는 그 위의 버그 수정이다.

---

## 현재 상태 상세

### 캐러셀 구조 (`views/partials/sections/_carousel_base.ejs`)

| 구간 | 동작 |
|------|------|
| **PC (≥1024px)** | **변경 없음**. `overflow-x: auto` 자유 스크롤 + `scroll-snap` + 좌우 화살표(`--yd-per-view` 단위 이동). 도트 숨김 |
| **모바일 (≤1023px)** | `overflow-x: hidden` + `scroll-snap: none` + `touch-action: pan-y`. 터치 드래그를 JS 가 받아 `scrollLeft` 직접 제어. 손 떼면 **1페이지(2열, 390px 뷰포트 기준 378px)** 단위 스냅. 하단 도트 표시(클릭 이동 가능) |

- 페이지 전환 임계: 플릭 속도 `> 0.4 px/ms` **또는** 이동량 `> track.clientWidth * 0.2`. 미달이면 원위치.
- 세로 스와이프: 첫 6px 이동 방향으로 판별 → 세로 우세면 브라우저에 양보(페이지 세로 스크롤 정상).
- 모바일에서는 `scroll` 이벤트로 index 를 **역산하지 않는다**. 드래그 중 `scrollLeft` 변화가 index 를 +1 하고 `touchend` 가 또 +1 해서 **2페이지가 밀리던 버그**의 원인이었다. PC 에서만 역산.
- 도트는 JS 가 트랙 뒤에 삽입(`track.insertAdjacentElement('afterend', dots)`). 페이지 수 = `ceil(items / perView)`.
- 초기화 가드: `window.__ydCarouselInit` — 여러 섹션이 include 해도 1회만 바인딩.
- **외부 라이브러리 없음.** Swiper 는 `views/user/index.ejs` 에서만 CDN 로드되므로, 공용 `_carousel_base` 를 Swiper 로 바꾸면 다른 페이지가 깨진다. 그래서 순수 JS 로 구현했다.

**이 파일을 include 하는 뷰 (3개)**
- `views/partials/sections/product_carousel.ejs`
- `views/partials/sections/deal_carousel.ejs`
- `views/partials/sections/brand_carousel.ejs`

> `views/partials/storefront/menu_showcase.ejs` 는 주석에서만 언급할 뿐 **include 하지 않는다**(자체 슬라이드 스크립트 보유, 마크업 계약 다름). `grep -rl _carousel_base views/` 결과에 잡히지만 소비자가 아니다.

### 홈 상단 히어로는 이미 슬라이드다 (혼동 주의)

`page_section` 의 `hero(8)` 은 `config_json = NULL` → variant 기본값 `full_banner` → `hero_banner.ejs` → **Swiper 11 슬라이드**. 원래부터 정상이었고 이번 수정 대상이 아니다. "메인 캐러셀이 스크롤된다"는 신고의 실체는 상품·특가·브랜드 캐러셀 3개였다.

### 홈 페이지 섹션 순서 (`page_section`, page=home)

```
hero(8) → value_proposition(9) → best_ranking(10) → product_carousel(15) → product_grid(11)
→ deal_carousel(16) → quick_menu(21) → benefit_bento(20) → promotion_banner(19)
→ ranking_tabs(18) → brand_carousel(17) → category_showcase(12) → recent_product(22)
→ custom_html(23) → kakao_cta(13)
```

---

## 다음 세션 시작 시 체크리스트

```bash
# 1) 상태 확인 — c489fb7 이 top, 트리 clean 이어야 함
git -C /home/ikcho/dev/yd-mall log --oneline -3
git status --short

# 2) 서버 기동 (포트 3006 고정)
(set -a; . /etc/environment; set +a; exec env NODE_ENV=development \
  /home/ikcho/.nvm/versions/node/v22.23.1/bin/node app.js)

# 3) 모바일 캐러셀 확인 — 개발자도구 390x844 + 터치 에뮬레이션 ON
#    http://localhost:3006/  → 'MD 추천 상품' / '특가' / '브랜드관' 섹션
#    기대: 스와이프 1회 = 2열 1페이지, 도트 활성 위치 1칸 이동, 카드가 딱 정렬
```

### 검증 결과 (Playwright, 390×844 터치 에뮬레이션)

| 캐러셀 | 아이템 | 페이지 폭 | 도트 | 스와이프 1회 이동 | JS 에러 |
|--------|--------|-----------|------|-------------------|---------|
| product_carousel | 12 | 378px | 6 | 378px = 1페이지 | 0 |
| deal_carousel | 12 | 378px | 6 | 378px = 1페이지 | 0 |
| brand_carousel | 17 | 378px | 9 | 378px = 1페이지 | 0 |

- 짧은 드래그(30px)는 원위치 복귀 확인. 카드 경계 정렬 확인.
- PC 1440px: `overflow-x: auto` 유지, 도트 `display:none`, 다음 버튼 1108px(4열) 이동 — **기존 동작 보존** 확인.

---

## 이 환경의 함정 (다음 세션 시간 절약용)

| 함정 | 실제 동작 |
|------|-----------|
| **포트** | `PORT=3007` 로 줘도 `.env.development` 가 덮어써서 **항상 3006** 으로 뜬다 |
| **EJS 캐시** | `.ejs` 수정 후 **서버 재시작 필수**. 재시작 안 하면 옛 뷰가 계속 나간다 (이것 때문에 "수정이 안 먹는다"고 두 번 헛짚었다) |
| **`/etc/environment` source** | PATH 가 덮여 `node: command not found` → **절대경로** 사용: `/home/ikcho/.nvm/versions/node/v22.23.1/bin/node` |
| **`pkill -f "app.js"`** | 패턴이 자기 bash 명령줄에도 매칭돼 **자신을 죽인다**(exit 143/144). `pkill -f "app\.js"` 로 이스케이프 |
| **Playwright** | 프로젝트에 미설치. 브라우저 바이너리(`~/.cache/ms-playwright`)만 있음 → `npm i playwright-core` 후 `chromium.launch({ channel: 'chromium' })` |
| **Playwright MCP** | 다른 프로세스가 프로필 점유 시 `Browser is already in use` 로 실패 → node 스크립트로 우회 |
| **foreground `sleep`** | 차단됨. 서버 기동 대기는 `curl --retry N --retry-delay 2 --retry-connrefused` 로 |
| **병렬 세션** | 같은 디렉토리·같은 `main` 에서 다른 세션이 동시에 작업한다. 커밋 전 `git log --format="%h %an %s" origin/main..main` 으로 남의 커밋이 섞였는지 확인. **`git commit --amend` 금지**(HEAD 가 내 커밋이라는 보장 없음) |

---

## 미해결 / 검토 대상

- [ ] 🔴 **결제 우회 결함(C3) — 미수정.** 이전 세션에서 발견된 이래 아직 고치지 않았다. 신규 기능보다 먼저 처리할 것. (이번 세션에서 건드리지 않음)
- [ ] **캐러셀 실기기 미검증.** 검증은 Playwright 합성 터치 이벤트로만 했다. iOS Safari 의 고무줄/관성 스크롤, Android Chrome 의 `touch-action` 해석은 실기기에서 다를 수 있다.
- [ ] 스와이프 임계값(`0.4 px/ms`, `20%`)이 실사용 감도에 맞는지 확인 필요.
- [ ] PC 는 여전히 자유 스크롤이다. PC 도 페이지 단위로 통일할지는 미결정(현재는 의도된 UX 로 보고 건드리지 않음).
- [ ] 홈 외 SDUI 페이지에서 `product_carousel` / `deal_carousel` / `brand_carousel` 섹션이 렌더되는 경우도 같은 변경 영향을 받는다 — 해당 페이지 육안 확인 안 함.

---

## 다음 세션에 전달할 컨텍스트

**사용자가 다음 세션에서 가장 먼저 말할 가능성이 높은 내용**

1. **"실기기에서 보니 스와이프가 뻑뻑하다 / 너무 민감하다"**
   → `_carousel_base.ejs` 의 `endDrag()` 임계값 조정.
   `var flick = Math.abs(dx) / dt > 0.4;` (속도), `var far = Math.abs(dx) > track.clientWidth * 0.2;` (거리).
   뻑뻑하면 낮추고(예: 0.3 / 0.15), 민감하면 올린다.

2. **"모바일에서 1개씩만 / 3개씩 보이게 해달라"**
   → CSS `grid-auto-columns: calc((100% - 1.25rem) / 2)` 가 모바일 2열 고정. **이 값만 바꾸면 된다.**
   `perView()` 는 `round(clientWidth / step)` 로 자동 계산되므로 JS 수정 불필요.

3. **"자동 재생(autoplay) 넣어달라"**
   → 현재 없음. `goTo(index + 1)` 을 `setInterval` 로 돌리고 `touchstart` 에서 clear. 루프가 필요하면 `pageCount()` 로 wrap.

4. **"PC 도 도트 보이게 / PC 도 페이지 단위로"**
   → CSS `.yd-carousel__dots` 의 `@media (max-width: 1023px)` 제약 해제 + `syncFromScroll()` 의 `isMobile()` 분기 재검토.
