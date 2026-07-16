# 세션 인계 파일 (cho)

> 이 파일은 **세션 종료 시마다 최신 작업 내용으로 전면 교체**된다.
> 다음 세션은 이 파일을 먼저 읽고 이어간다. 오래된 내역은 보존하지 않음.

**최종 업데이트**: 2026-07-16

---

## 최근 세션 요약

- **한 일**: ①**히어로 영상 배너**를 스키마만 있고 화면이 없던 상태에서 렌더까지 연결 ②몰 생성에 **메뉴 구성 방식(분리형/통합형)** 축 추가 — 통합메뉴(드로어)가 프리셋에서 사라져 있었다 ③**테마 3(에디토리얼) 버그 3개** 수정(오버레이 헤더가 히어로 없는 페이지를 다 깨뜨림 · 모바일에 메뉴 진입점 없음 · 하단바 중복) ④도매꾹·도매매 자격증명 폼 정리.
- **현재 운영 상태**: 로컬 PM2(`yd-mall`) 기동, 스토어프론트 3몰(health·general·main) 200. `origin/main` 과 동기(0/0), 워킹트리 깨끗. 마이그레이션 2개는 공용 DB(`yd_mall`)에 **적용 완료**.
- **다음 할 일**: 아래 [남은 이슈](#남은-이슈--주의) 참고. 1순위는 **메인 슬라이더 관리 화면이 `theme_hero` 를 모른다**(거짓 경고 + 영상 편집 불가).

---

## 이 세션의 커밋 4개

| 커밋 | 내용 |
|---|---|
| `aba5a5b` | 히어로 영상 배너 렌더 + 메뉴 구성 방식(분리형/통합형) — 20개 파일 |
| `70ce86f` | 테마 3 + 통합형 오버레이 헤더 유지 · 메뉴 방식 표시 버그 · CSS 재빌드 |
| `09d992f` | 에디토리얼 모바일 전체메뉴·검색 (드로어를 스킨 공용으로 추출) |
| `a7df3c3` | 오버레이 헤더를 히어로 있는 페이지에서만 + 테마 3 하단바 제거 |

---

## 1. 히어로 영상 배너 — 스키마만 있고 화면이 없었다

`bbb47ff` 가 `hero_slide` 에 영상 컬럼을 넣었지만 **리졸버도 뷰도 그 컬럼을 읽지 않아** 12행이 전부 `IMAGE` 였다. 등록할 방법도, 나올 방법도 없던 상태. 세 층을 모두 이었다.

- **`views/partials/sections/hero_media.ejs` (신규)** — 이미지/영상 한 칸을 그리는 공용 파트.
  `media` 가 없으면 예전처럼 `<img>` 만 낸다 → `hero_banner` 를 같이 쓰는 **전역 `hero` 섹션**(banners 테이블, 영상 컬럼 없음)은 동작이 안 바뀐다.
  - `<source>` 는 **WebM → MP4** 순. `playsinline` 없으면 iOS 가 전체화면 플레이어로 띄운다.
  - poster 는 영상과 **같은 비율**이어야 한다 → 모바일은 `mobile_image_url` 을 먼저 쓴다.
  - 히어로는 최상단이라 **lazy 금지**(캐러셀 2·3번째가 빈 칸으로 넘어간다).
- `theme_hero` 리졸버가 영상 컬럼 SELECT(모바일 영상 포함).
- `prefers-reduced-motion` 이면 자동재생 끔(CSS 로는 재생을 못 막는다).

### 샘플 리소스도 영상을 나른다

`sample_hero_slide` 가 `image_path` 한 칸뿐이라 시더가 영상을 못 날랐다 → `hero_slide` 와 대칭을 맞춤.

- `scripts/migrate_sample_hero_media.sql` — `media_type`·영상/포스터/모바일 경로 + CHECK 2개
- `scripts/migrate_sample_hero_mobile_video.sql` — 모바일 전용 세로 영상 2칸
- **MAIN 슬라이드가 800×800 상품 사진을 1920×600 배너 자리에 쓰던 것**을 배너 자산으로 교체(상품 연결은 유지)

### 미디어 자산 규약 (`b75b0de` 스펙 — 반드시 지킬 것)

**1920 이하 · 3~5MB · 5~10초 · Poster WebP 100~300KB.** 원본을 그대로 커밋하면 저장소에 영구히 박힌다.
`public/images/sample/banners/` 에 두면 `git add -f` 없이 배포본에 실린다(`public/uploads` 는 `.gitignore`).

| 파일 | 규격 |
|---|---|
| `sample1.webp` / `.jpg` | 이미지 배너 |
| `sample2.webm`(2.0MB) / `.mp4`(2.3MB) / `-poster.webp` | PC 영상 1920×1080 |
| `sample3.webm`(1.9MB) / `.mp4`(2.3MB) / `-poster.webp` | PC 영상 1920×1080 — **4K 6MB 원본을 재인코딩함** |
| `sample_mo.webm`(711KB) / `.mp4`(1.2MB) / `-poster.webp` | **모바일 세로** 1080×1920 |

> 영상 하나에 **webm + mp4 + poster 3종이 한 세트**다. mp4 없으면 WebM 미지원 브라우저에서 배너가 안 나오고, poster 없으면 LCP·CLS 가 깨진다. 만드는 법(ffmpeg)은 `public/images/sample/README.md` 참고.

---

## 2. 메뉴 구성 방식 — 통합메뉴가 프리셋에서 사라져 있었다

프리셋 3종이 **전부 `nav_mode: 'split'`** 이라, 드로어 스킨(`compact_drawer_v1`)이 코드에 살아 있는데도 **새 몰이 통합메뉴를 받을 방법이 없었다.**

테마(룩·홈섹션)와 메뉴 구성 방식(헤더 스킨)을 **독립된 축**으로 분리했다.

```text
theme_product / theme_banner   분리형 → main_right_utility_v1   통합형 → compact_drawer_v1
theme_editorial                분리형 → editorial_overlay_v1    통합형 → editorial_overlay_v1
```

- `presets.resolveNavigation()` 이 `header_layout_type` 과 `nav_mode` 를 **항상 짝**으로 정한다. 짝이 어긋나면 "드로어 헤더인데 카테고리가 메뉴 목록에 없는" 조합이 나온다.
- **테마 3은 통합형이어도 오버레이 헤더를 유지한다** — 투명 오버레이 + 풀블리드가 이 테마의 정체성이라 드로어 스킨으로 바꾸면 "테마 3을 골랐는데 테마 3이 아닌" 화면이 된다. 안 깨지는 이유: `buildUnified` 가 `categoryButton: null` 을 주고 이 스킨은 `if (_catBtn)` 일 때만 버튼을 그린다 → 카테고리는 가운데 메뉴로 합쳐지고 버튼은 사라진다.
- 몰 생성 폼 = 테마 선택 **아래**. 몰 수정 = 프리셋 재적용 폼에도 있음.
- **재적용 시 값을 안 보내면 그 몰의 현재 방식을 유지**한다(안 그러면 통합형 몰이 재적용 한 번에 조용히 분리형이 된다).

---

## 3. 테마 3 버그 3개 (전부 수정)

### ① 오버레이 헤더가 히어로 없는 페이지를 다 깨뜨렸다 — 가장 컸다

오버레이(투명) 헤더를 **스킨만 보고** 켜서, 풀블리드 히어로가 없는 페이지(상품목록·상세·마이페이지…)에서
흰 배경 위에 흰 로고·아이콘이 얹혀 헤더가 안 보이고, `body.yd-overlay-header` 가 `main` 의 `padding-top` 을 0 으로 만들어 본문이 헤더 밑으로 파고들었다(제목과 로고가 겹침).

→ **이 페이지가 실제로 에디토리얼 히어로를 그렸을 때만** 켠다:

```js
// views/layouts/main_layout.ejs
&& typeof body === 'string' && body.indexOf('yd-ed-hero') !== -1
```

`body` 는 레이아웃이 받을 시점에 **이미 렌더된 문자열**이라 거기서 확인한다. 컨트롤러마다 플래그를 넘기게 하면 새 페이지가 생길 때마다 빠뜨린다.
오버레이가 꺼진 페이지에서는 헤더도 굳어야 한다 → `body:not(.yd-overlay-header) .yd-ed-hdr` 에서 흰 배경 sticky + 검정 글자.

### ② 모바일에 메뉴 진입점이 아예 없었다

가운데 메뉴는 `hidden md:flex`, 사람 아이콘은 `hidden sm:inline-flex`, 햄버거는 없음 → 모바일 방문자가 **어떤 메뉴에도 못 갔다.**

- **드로어를 `_drawer.ejs` 공용 파트로 추출**(`_compact_drawer` 452 → 186줄, 죽은 지역변수 11개 제거). 드로어를 두 벌 만들면 메뉴 트리·아코디언·포커스가 갈라진다.
- 에디토리얼 헤더 우측 = 사람 · 장바구니 · 검색 · [☰](`md:hidden`). 참조 구조는 `docs/사이트개선/capture/thema2_pc.png` · `thema2_mo.png`.
- **검색은 드로어를 열고 검색폼에 포커스**(`id=yd-dw-search`). 헤더에 입력창을 또 두면 드로어 안 폼과 두 벌이 된다.
- 드로어는 반드시 `<header>` **바깥** — header 가 `z-50` 으로 stacking context 를 만들어 안에 두면 백드롭이 헤더를 덮는다.

### ③ 하단 시스템 바가 중복이었다

②로 [☰] 가 생기면서 하단바(홈·카테고리·장바구니·마이)가 헤더·드로어와 두 벌이 됐다.

```text
하단바는 기본형(main_right_utility_v1 = 테마 1·2 분리형)에서만 나온다.
드로어를 가진 스킨(compact_drawer_v1 · editorial_overlay_v1)에서는 내지 않는다.
```

조건을 `<head>` 의 `_showBottomNav` 한 곳으로 모으고 **본문 여백(`padding-bottom`)도 같이 건다** — 여백만 남기면 바가 없는데 모바일 밑에 4rem 빈 칸이 생긴다.

---

## 4. 도매꾹·도매매 자격증명 폼

**도매꾹·도매매는 아이디를 공유해 API Key 하나로 양쪽이 된다.** 엔드포인트가 같고 `market` 파라미터(`dome`/`supply`)로만 갈린다. 채널을 "도매꾹·도매매" 하나로 합치고(`DOMEME` 은 `aliasOf: 'DOMEGGOOK'` 로 감춤), 폼이 채널별로 필요한 칸만 내도록 바꿨다(도매꾹 = API Key 1칸 / 온채널 = 0칸 / 네이버 = client_id + secret + 부가JSON).

- 발급: 도매꾹 로그인 → API 키 관리(`https://mobile.domeggook.com/APIs/gate`). 심사 없음, 아이디당 5개.
- **호출 제한 분당 180회 · 하루 15,000회** — Phase 2 대량 수집에 직접 걸리는 숫자다.
- **[검증]은 아직 빈칸 확인만** 한다(네이버만 실호출). 실 API 검증은 어댑터 붙인 뒤.
- Private API 승인 여부·제3자(빌더) 대행 허용 여부는 **미확인** — 계획서 Phase 0 의 D1 문의 대상.

---

## 검증 방법 (재현용)

```bash
# 서버는 WSL 로컬 PM2 로 뜬다. 포트 3006 을 node app.js 로 직접 잡으면 PM2 와 충돌한다(주의).
pm2 restart yd-mall --update-env

# ⚠️ 뷰에 Tailwind 새 클래스를 쓰면 반드시 재빌드. 안 하면 소스에 있어도 CSS 에 없다.
npm run build:css

curl -s -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:3006/?mall=main'         # 테마3 홈(오버레이 O)
curl -s -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:3006/products?mall=main' # 히어로 없는 페이지(오버레이 X)
curl -s -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:3006/?mall=general'      # 기본형 회귀
```

> ⚠️ 로컬 PM2 는 `NODE_ENV=production` 으로 뜬다. 그래서 소셜 콜백 URL 은 `*_CALLBACK_URL_PROD` 를 쓴다 —
> 로컬에서 localhost 콜백으로 테스트하려면 `NODE_ENV=development` 로 띄워야 한다(`npm run dev`).

- 몰 생성 → 확인 → 삭제가 **정상 흐름**이다. 데이터 있는 몰은 목록에서 코드 입력 후 강제삭제.
- 몰 21(`main`, 테스트몰) = 기본몰 · 테마3 · 통합형. 몰 1·2 = 테마3 · 분리형.
- 몰 생성 폼의 **"샘플 데이터 포함"은 기본 켜짐** — 카테고리 3(+미분류) · 브랜드 4 · 상품 6 · 특가 1 · 배너 3(영상 2). 샘플 상품은 건강식품이 아니라 **패션 잡화**다. 원본 교체는 `/admin/service/samples` 에서 **몰을 만들기 전에**.

---

## 남은 이슈 / 주의

### 우선순위 높음

1. **메인 슬라이더 관리(`/admin/banners/hero-slides`)가 `theme_hero` 를 모른다.**
   레거시 `site_settings.hero_variant` 로 목록을 가르는데 새 몰은 기본값이 `full_banner` 라
   전역 `banners` 목록이 뜨고 **몰별 `hero_slide`(샘플 배너)는 숨는다**(`?mode=product_showcase` 로 열면 보임).
   더 나쁜 건 *"홈에 적용돼 있지 않습니다"* 라는 **거짓 경고** — theme_hero 몰에선 그 슬라이드가 실제로 홈에 뜨고 있다.
   히어로 체계가 두 세대 공존한다: 레거시 `hero` + `hero_variant` / 신규 `theme_hero` + `config.layout`.
2. **그 화면은 영상 컬럼을 전혀 모른다**(이미지 전용). 영상 배너는 **샘플 시더가 넣는 것만** 존재하고 관리자가 몰별로 등록·수정할 수 없다. 이번에 붙인 영상 입력칸은 `/admin/service/samples`(앞으로 만들 몰의 원본) 쪽이다.

### 그 외

- **모바일 캐러셀 높이가 튄다** — 세로 영상 슬라이드(679px)와 가로 이미지 슬라이드(255/215px). 모바일 배너가 레터박스를 피하려 `h-auto` 를 쓰는 **의도적 구조**라 손대지 않았다. 나머지 슬라이드에도 세로 자산을 주거나 고정 비율로 바꿔야 한다.
- **팝업이 드로어를 덮는다** — 둘 다 `z-[70]`. 그리고 새 몰에도 전역 팝업이 뜨는데 이미지가 `/uploads/banners/*.jpg` 404 다.
- **PC 에디토리얼에서도 검색이 드로어를 연다** — 요청은 모바일 기준이었다. PC 는 별도 검색 오버레이가 어울릴 수 있음.
- **자사몰 주문이 소싱 설계서에 없다** — §1 이 *"판매 주문은 스마트스토어가 발생원"* 으로 **명시 배제**하고 §17.2 상태머신에 진입점이 없다. `sales_order.channel_type` 은 컬럼만 있고 값 정의가 없다. 부수 갭: `OWN_STOCK` 없음 · 사전검사에 "고객 취소 확인" 없음 · 자동발주 모드 플래그 없음 · 무통장 입금확인 시점 없음. **문서 미수정 — 패치 승인 대기 중.**
- **`sample3.webm` 4K 원본**은 `~/.claude/jobs/9dbffe43/tmp/sample3-4k-original.webm` 에 백업했다(잡 삭제 시 함께 사라짐).
- 이전 세션에서 넘어온 것: **비밀번호 찾기·재설정 없음**, **가입 시 이메일 인증 없음**, **로그인 레이트 리밋 없음**, `tables.sql` 드리프트.

### 함정 (이번 세션에 반복해서 물린 것)

- **Tailwind CSS 재빌드를 잊지 말 것.** `style.css` 가 07-15 빌드인데 07-16 에 추가한 `gap-7` 이 컴파일 안 돼 에디토리얼 중앙 메뉴가 다 붙어 나왔다. Tailwind 는 **빌드 시점에** 템플릿을 훑는다. 배포는 `yd-mall.sh build` 가 돌려주지만 **로컬은 수동**이다.
- **`getEdit` 류가 `SELECT * FROM mall` 만 하면 `nav_mode` 가 없다** → 폼이 항상 기본값으로 폴백한다. 목록처럼 `navigation_config` 를 조인할 것.
- 커밋 메시지에 백틱을 쓰면 셸에서 명령치환으로 잘린다. **파일로 써서 `git commit -F`**.
