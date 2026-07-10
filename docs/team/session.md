# 세션 인계 파일 (cho)

> 이 파일은 **세션 종료 시마다 최신 작업 내용으로 전면 교체**된다.
> 다음 세션은 이 파일을 먼저 읽고 이어간다. 오래된 내역은 보존하지 않음.

**최종 업데이트**: 2026-07-10

---

## ⚠️ 이 세션의 특수 상황 — 병렬 세션

여러 Claude 세션이 **같은 디렉토리(`/home/ikcho/dev/yd-mall`), 같은 `main` 브랜치**에서 동시에 작업했다.
워크트리 격리 없음. 실제로 겪은 일:

- 읽은 직후 남이 파일을 바꿔 `Edit` 이 "modified since read" 로 거부됨.
- 내가 만들지 않은 커밋이 `git log` 에 끼어듦.
- **다른 세션이 `git push` 하자 내 미검증 커밋까지 함께 운영에 배포됨.**
- `migrate_exhibition.sql` 을 실행하지 않았는데 `exhibition` 테이블이 DB 에 생겨 있었다.

**대응**: 푸시 전 `git log --format="%h %an %s" origin/main..main` 으로 남의 커밋이 섞였는지 확인하고,
섞였으면 `git push origin <내커밋해시>:main` 으로 **내 커밋까지만** 푸시한다(커밋 순서가 앞설 때만 가능).

---

## 최근 세션 요약

- **한 일**
  1. **mall 2(종합관) 실데이터 교체** — datapicker(CJ온스타일 수집) 기반. 카테고리 365 + 상품 9,677.
  2. **GNB 메뉴 10종 설계 문서** 작성 (`docs/사이트개선/gnb_menu_design.md`, 956줄).
  3. **0차 버그 4건 수정** — 브랜드 몰 누수·쿠폰함 컬럼 불일치·만료 특가 노출·고객센터 경로.
  4. **이벤트&혜택 모듈 신설**(E1~E12) — `/event` 의 공지사항 오연결 제거, 관리자 CRUD + 고객 목록/상세 + 응모 참여.
  5. **종합관 이벤트 샘플 6건** 시드.
  6. **헤더 Top Bar 에 몰 선택 셀렉트** 추가, 로그인·회원가입 링크 제거.
  7. **모바일 뷰 전면 개편** — 헤더(로고+검색+장바구니) + GNB 가로 슬라이더 + 하단 시스템 바 + 카테고리 전체 레이어(단계별 드릴다운).
- **현재 상태**: `main` 푸시·배포 완료. 운영 검증 완료.
- **병렬 세션이 한 일**(내 작업 아님): 기획전 모듈, 공동구매 모듈, GNB 메가메뉴 3단 캐스케이드, mall 2 브랜드 카테고리 1,354건, 쿠폰 설계 문서.

---

## 현재 상태 상세

| 항목 | 값 |
|---|---|
| 레포 경로 | `/home/ikcho/dev/yd-mall` (WSL Ubuntu) |
| 브랜치 | `main` (워크트리 미사용 — 여러 세션이 같은 체크아웃 공유) |
| 앱 포트 | **3006** (개발·상용 동일) |
| Node | v22.23.1 (`~/.nvm/versions/node/v22.23.1/bin/node`, PATH 에 없을 수 있어 절대경로 권장) |
| DB | `ydata.co.kr` / `dev_mall` — **dev·prod 공용** |
| 상품 | mall 1: 324 / mall 2: **9,677** |
| 카테고리 | mall 1: 42 / mall 2: **1,719** (NORMAL 365 + BRAND 1,354) |
| 이벤트 | mall 1: 1 / mall 2: 6 |
| 기획전 | 6 (병렬 세션) |
| 주문 | **22건** — 판매량 랭킹·구매액 등급은 계산 불가 |
| 쿠폰 | 3건 |
| GNB | 13종 전부 `module_ready=1` |

### 신설된 테이블

```text
event / event_participant / event_coupon      ← 이 세션
exhibition / exhibition_section / exhibition_product   ← 병렬 세션
group_buy / group_buy_product / group_buy_participation ← 병렬 세션
```

관리자 메뉴 `이벤트 관리`·`기획전 관리`·`공동구매 관리` 모두 `is_active=1`.

---

## 🔴 반드시 지킬 규칙

### 1. 푸시 = 즉시 운영 배포
`git push origin main` → GitHub Actions → 운영 `/data/yd-mall`. **사용자가 명시 요청할 때만 푸시.**

### 2. DB 변경은 코드 배포 **뒤에**
dev·prod 가 같은 DB 다. DB 를 먼저 바꾸면 옛 코드가 도는 운영에 즉시 반영되어 "창"이 열린다.

이 세션에서도 밟을 뻔했다 — `admin_menus` 에 '이벤트 관리' 를 `is_active=1` 로 올렸는데 `/admin/events`
라우트는 미푸시였다. (마침 병렬 세션이 푸시해서 결과적으로 무사했으나 운으로 넘긴 것이다.)
그래서 `migrate_event.sql` 은 메뉴 행을 **`is_active=0`** 으로 넣고, 라우트 배포 확인 후 수동으로 켜도록 했다.

### 3. FK 타입 함정 (두 번 걸렸다)
`products.id` · `users.id` · `coupons.id` 는 **`int`** 다. `page`·`product_group`·`custom_menu` 등
신세대 테이블은 `bigint`. **구세대를 참조하는 컬럼을 `bigint` 로 두면 FK 생성이 실패한다.**
`exhibition_product.product_id`, `event_participant.user_id`, `event_coupon.coupon_id` 전부 `int`.

### 4. 0건 폴백 (module_ready 함정)
GNB 13종이 **이미 전부 `module_ready=1`** 이다. 준비중 랜딩을 실제 목록으로 바꾸는 순간 운영에 반영된다.
목록이 0건이면 `COMING_SOON` 랜딩으로 되돌린다(`routes/feature.js` 가 `COMING_SOON` 을 export).
`eventController`·`exhibitionController` 가 이 패턴을 쓴다. mall 2 는 이벤트 0건이었기에 이 폴백이 실제로 동작했다.

### 5. 상태를 이중 관리하지 않는다
`event.status` / `exhibition.status` 는 **운영상태(DRAFT/PUBLISHED/HIDDEN)만** 저장한다.
예정·진행중·종료는 `start_at`·`end_at` 에서 **파생**한다. 기간과 상태를 둘 다 저장하면 반드시 어긋난다.

### 6. Tailwind 는 재빌드해야 한다
새 유틸리티 클래스를 뷰에 쓰면 `npm run build:css` 를 돌려야 `public/css/style.css` 에 들어간다.
안 하면 클래스가 통째로 무시된다 — 모바일 하단 바가 `grid-cols-4` 미적용으로 152px 로 쪼그라들었다.
**브라우저 캐시도 의심하라.** 재빌드 후에도 옛 CSS 를 쓰고 있을 수 있다.

### 7. 레이아웃은 curl 로 검증할 수 없다
`curl`+`grep` 은 마크업 존재만 확인한다. "하단 바가 고정되는가", "가로 스크롤이 되는가",
"본문이 가려지는가" 는 **Playwright 로 실제 뷰포트에서** 봐야 한다.
이 세션의 모바일 개편 버그 2건(하단바 붕괴, 노치 안전영역 누락)은 스크린샷으로만 잡혔다.

### 8. 프로세스 종료 주의
`pkill -f "app.js"` 는 **자기 명령줄까지 매칭해 자멸**한다. `pkill -x node` 는 claude 데몬까지 죽인다.
포트로 PID 를 특정해서 죽여라:
```bash
pid=$(ss -tlnp | grep ':3006' | grep -oE 'pid=[0-9]+' | cut -d= -f2 | head -1); kill "$pid"
```

---

## 이번 세션 산출물

### 1. mall 2 실데이터 (`scripts/seed_mall2_cjon.js`)

`/home/ikcho/dev/datapicker/data` 의 CJ온스타일 수집 데이터로 mall 2 를 **전면 교체**했다
(기존 플레이스홀더 205건 삭제). 사용자 승인 하에 이전 시드의 "남의 데이터를 복사하지 않는다" 방침을 뒤집었다.

- 카테고리 365(대14/중115/소236) — **상품이 배정된 노드와 그 조상만** 생성해 빈 리프 0.
- 상품 9,677 — best 297 + search 9,523 dedup, 가격 0·이미지 없는 125건 제외.
- `slug=cj-<product_id>`(products.slug 는 몰 구분 없이 전역 UNIQUE), `product_code`=CJ id.
- **이미지는 외부 핫링크**(`itemimage.cjonstyle.net`). CJ 가 referer 를 막거나 timestamp 를 갱신하면
  9,677건이 한꺼번에 깨진다. 로컬 다운로드는 미실행.
- 9,677건은 전체 카탈로그가 아니라 **중분류당 100건 샘플**이다(여성패션이 정확히 1000건인 이유).

### 2. GNB 메뉴 설계 (`docs/사이트개선/gnb_menu_design.md`)

10종의 화면 구성(와이어프레임·데이터소스·상태) + 개발 계획(파일·라우트·스키마·단계·검증).

핵심: **오늘특가·아울렛·베스트·신상품·랭킹은 같은 골격**이다. §2-0 에 공용 스캐폴드를 정의했다.
슬롯 3개(히어로/필터/카드오버레이)만 갈아끼운다. 이걸 안 뽑으면 같은 화면을 다섯 번 만든다.

확정 결정: 신상품=`product_badge='NEW'`, 베스트=조회수 상위 100, 이벤트=참여형 포함,
쿠폰=다운로드 수령, 멤버십=제도 소개 페이지.

§8 에 **진행 체크리스트**(35항목)가 있다. 다음 세션은 여기서 이어간다.

### 3. 0차 버그 4건 (전부 수정 완료)

| # | 버그 | 커밋 |
|---|---|---|
| B1 | `brandController` 에 `mall_id` 필터 없음 → mall 2 에 mall 1 브랜드 노출 | `a7e7861` (병렬 세션) |
| B2 | 마이페이지 쿠폰함이 없는 컬럼(`expires_at`/`min_purchase`/`c.type`) 조회 → `.catch` 폴백으로 **항상 빈 목록** | `98985fc` |
| B3 | `badge_expire_date` 를 고객 화면이 검사하지 않음 → 만료 3주 지난 상품이 오늘특가에 노출 | `98985fc` |
| B4 | `HEADER_CS` 와 `EVENT` 가 **둘 다** `/boards/notice` 를 가리킴. 전용 CS 허브 `/cs` 는 살아있는데 아무 메뉴도 안 가리킴 | `12f25f6` (DB) |

> B3 는 `/deal/today` 목록에만 적용된다. 만료돼도 `product_badge` 에서 `DEADLINE_SALE` 이 제거되지
> 않아 **다른 화면의 카드에는 여전히 '마감임박' 배지**가 붙는다. 정리 배치는 미구현.

### 4. 이벤트&혜택 모듈 (E1~E12 완료)

`/event` 가 공지사항으로 302 하던 것을 실제 모듈로 교체했다.

- 관리자 `/admin/events` — 폼 POST + EJS + redirect (저장소 표준).
- 고객 `/event` 목록(전체·진행중·예정·종료) / `/event/:slug` 상세 / `/event/view/:id` → 301.
- 참여 `POST /event/:slug/apply` — **조건부 UPDATE 의 `affectedRows` 로 슬롯을 먼저 확보**하고 참여자를 넣는다.
  애플리케이션에서 COUNT 후 INSERT 하면 동시 요청에 선착순이 초과 발급된다.
  `UNIQUE(event_id,user_id)` 위반은 rollback 하여 `issued_count` 를 되돌린다.
- 검증: 선착순 3명에 12명 동시 → ok 3 / full 9. 같은 유저 5회 동시 → ok 1 / duplicate 4, 카운터 정확.

**참여 유형은 `APPLY`(응모)만 동작한다.** 관리자 폼에도 `NOTICE`/`APPLY` 만 노출한다.
`eventService.PARTICIPABLE_TYPES` 가 화이트리스트다.

| 유형 | 막는 것 | 필요 작업 |
|---|---|---|
| `ATTENDANCE` | `UNIQUE(event_id,user_id)` 가 1인 1회만 허용 | `event_attendance(event_id,user_id,attend_date)` 별도 테이블 |
| `COUPON_PACK` | `participate()` 가 쿠폰을 지급하지 않음 | `event_coupon` → `couponController` 지급 경로 연결 |
| `PURCHASE` | 주문 검증 없음 | `order_items` 대조 |

### 5. 모바일 뷰 개편

```text
[헤더]   로고 + 검색 + 장바구니
[GNB]    일반 메뉴 가로 슬라이딩 (.yd-mgnb, 스크롤바 숨김)
[본문]
[하단바]  홈 · 카테고리 · 장바구니 · 마이   (fixed, md:hidden)
[레이어]  카테고리 단계별 드릴다운 (1뎁스→2뎁스→3뎁스) + 하단 1뎁스 이미지·설명
```

- Top Bar 는 모바일에서 숨긴다. 거기 있던 **몰 선택 셀렉트는 카테고리 레이어 상단**으로 옮겼다.
- 햄버거와 `#mobile-menu` 드롭다운 제거. 모바일 내비게이션을 두 벌 두지 않는다.
- PC 의 `category_panel.ejs` 는 **CSS hover 캐스케이드라 터치에서 열리지 않는다.** 재사용 불가 →
  `mobile_bottom_nav.ejs` 에 탭 기반 패널 스택으로 따로 구현.
- 하단 바가 fixed 라 본문·푸터를 가린다. `main` 이 아니라 **`body`** 에 여백을 준다(푸터가 main 바깥).
  여백은 `calc(4rem + 1px + env(safe-area-inset-bottom))` — 테두리 1px 과 노치(최대 34px)를 빼먹으면
  실기기에서 푸터가 가려진다.
- `#scrollTopBtn` 의 `z-index` 를 999 → 45 로 낮췄다. 999 면 카테고리 레이어(z-60)를 뚫는다.

---

## 유지해야 할 불변식 (기존 유지)

### 카테고리 계층 무결성
`services/tree/depthGuard.js` — 뎁스 초과(`assertDepthAllowed`), 순환참조(`wouldCreateCycle` 을 UPDATE **전에**),
자식 있는 부모 삭제 차단. `parent_id` 가 `ON DELETE SET NULL` 이라 막지 않으면 자식이 조용히 최상위로 승격된다.

### 몰 스코프
- 스토어프론트: `req.mallId` (`middleware/mallContext.js`) — `?mall=` → 세션 → 기본몰.
- 관리자: `req.adminMallId` (`middleware/adminMallContext.js`) — **별도 세션 키**. 혼용 금지.
- `mall_id` **없는** 테이블: `banners`, `notices`, `coupons`, `users`, `orders`, `admin_menus`.
  이벤트·쿠폰 메뉴를 이들 위에 세우면 두 몰이 데이터를 공유한다. 신규 테이블에는 처음부터 넣는다.
- `mallContext` 가 `res.locals.malls`(활성 몰 목록)도 넘긴다 — 헤더/모바일 레이어의 몰 셀렉트가 쓴다.

### 상품 목록의 서브트리 집계
`productController.getList` 는 `navigationService.getCategoryContext` 로 **서브트리 집계**한다.
부모 노드에 상품이 없어도 자식 상품이 올라온다. 단 **리프에 상품이 없으면 그 리프는 빈 목록**이다.

### GNB 커스텀 메뉴 링크 해석
`navigationService.LINK_RESOLVERS` 에 없는 `link_type` 은 렌더에서 **제외**된다(죽은 링크 차단).
`PRODUCT_GROUP` 은 아직 미등록.

---

## 다음 할 일

`docs/사이트개선/gnb_menu_design.md` §8 체크리스트 순서대로.

1. **[S1~S3] 공용 목록 스캐폴드 추출** — `views/user/products/list.ejs` 에서 정렬바·페이지네이션·빈상태를
   파티셜로 빼고, 기존 `/products` 회귀를 먼저 확인한다. **이걸 건너뛰면 같은 화면을 다섯 번 만든다.**
2. **[L1] 신상품** — `routes/feature.js` 에서 `preset({ badge: 'NEW', sort: 'new' })`. **한 줄이면 끝난다**
   (`productController` 에 `NEW` 뱃지 분기가 이미 있다).
3. **[L2] 베스트** — 조회수 상위 100 상한. 지금은 전체 카탈로그를 정렬만 해서 mall 2 에서 9,677건이다.
4. **[L3] 아울렛** — `minDiscount` 필터. mall 2 에 4,499건, **mall 1 은 0건**이라 몰별 0건 폴백 필수.
5. **[L4] 오늘특가** — 카운트다운 + 마감임박 정렬.
6. **[L5] 랭킹** — 조회수 실시간 + 카테고리 탭(`ranking_tabs` 섹션 승격). **판매량 탭은 보류**(주문 22건).
7. **[M1] 브랜드** — mall 2 에 브랜드가 1,354개다. 25개 기준으로 만든 화면이 감당 못 한다.
   초성 필터 + 페이지네이션 필요.
8. **[M3] 쿠폰** — 병렬 세션이 설계 문서를 썼다(`docs/사이트개선/coupon_design_and_development.md`).
   선행: `user_coupons` 중복 쌍 0건 확인됨 → `UNIQUE(user_id,coupon_id)` 즉시 적용 가능.

### 이번 트랙 밖 (기록만)

- mall 2 상품 이미지가 외부 핫링크다. 로컬 다운로드 미실행.
- 만료된 `DEADLINE_SALE` 뱃지 정리 배치.
- `order_items` 에 `source_type`/`source_id` — 이벤트·라이브 매출 귀속. 결제 트랜잭션을 건드린다.
- 이벤트 참여형 3종(E13~E15).
- 쇼핑라이브(`docs/사이트개선/live sales.md`).

---

## 접속 정보

| 구분 | 값 |
|---|---|
| 스토어프론트 | `https://dev-mall.ydata.co.kr/?mall=2` (종합관) / `?mall=1` (건강식품관, 기본) |
| 관리자 | `/admin/login` — `tracer999` / `NEWtec4075@@` (super_admin, 2FA 미사용) |
| 관리자 몰 전환 | 우측 상단 몰 선택기 또는 `?adminMall=2` |
| DB | `mysql -h ydata.co.kr -u ydatasvc -p'NEWtec4075@@' dev_mall` |
| 로컬 기동 | `set -a; . /etc/environment; set +a; ~/.nvm/versions/node/v22.23.1/bin/node app.js` |
