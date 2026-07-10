# 세션 인계 파일 (cho)

> ~~이 파일은 **세션 종료 시마다 최신 작업 내용으로 전면 교체**된다.~~
> **운영 방식 변경 (2026-07-10, 사용자 지시).** 이 파일은 **전면 교체하지 않고 누적**한다.
> 이전 세션 내역도 계속 인계돼야 하기 때문이다. 새 세션은 **맨 아래에 회차 섹션을 덧붙인다.**
> 다만 **낡아서 틀린 서술은 그 자리에서 정정**한다(지우지 말고 개정 표시).

**최종 업데이트**: 2026-07-10 (세션 B — 설계 문서 트랙)

## 회차 색인

| 회차 | 트랙 | 위치 |
|---|---|---|
| **세션 A** | mall 2 실데이터 · GNB 설계 · 0차 버그 · 이벤트 모듈 · 모바일 개편 | 아래 「최근 세션 요약」~「접속 정보」 |
| **세션 B** | 설계 문서 검증·신설 (GNB 체크 / 쿠폰 / 배송비) + **결제 우회 결함 발견** | 맨 아래 「세션 B」 |

> 🔴🔴 **세션 B 에서 결제 우회 결함(C3)을 발견했다. 미수정.** 신규 기능보다 먼저 처리할 것.
> 상세는 맨 아래 「세션 B」 §1.

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

> ⚠️ **이 목록은 세션 A 시점 기준이다. 세션 B 에서 순서가 바뀌었다 — 맨 아래 「세션 B」 §5 를 정본으로 본다.**
> 특히 **C3(결제 우회) 수정이 아래 모든 항목보다 앞선다.**

`docs/사이트개선/gnb_menu_design.md` §8 체크리스트 순서대로.

1. **[S1~S3] 공용 목록 스캐폴드 추출** — `views/user/products/list.ejs` 에서 정렬바·페이지네이션·빈상태를
   파티셜로 빼고, 기존 `/products` 회귀를 먼저 확인한다. **이걸 건너뛰면 같은 화면을 다섯 번 만든다.**
   → **세션 B 개정**: 골격(`index.ejs`)·슬롯 계약은 **선확정하지 않는다.** 중복이 확정된 셋만 뽑고,
   계약은 두 번째 메뉴에서 귀납한다. 랭킹(세로 순위 리스트)·베스트(100건 캡)는 스캐폴드 밖일 수 있다.
2. **[L1] 신상품** — `routes/feature.js` 에서 `preset({ badge: 'NEW', sort: 'new' })`. **한 줄이면 끝난다**
   (`productController` 에 `NEW` 뱃지 분기가 이미 있다).
3. **[L2] 베스트** — 조회수 상위 100 상한. 지금은 전체 카탈로그를 정렬만 해서 mall 2 에서 9,677건이다.
4. **[L3] 아울렛** — `minDiscount` 필터. mall 2 에 4,499건, **mall 1 은 0건**이라 몰별 0건 폴백 필수.
5. **[L4] 오늘특가** — 카운트다운 + 마감임박 정렬.
6. **[L5] 랭킹** — 조회수 실시간 + 카테고리 탭(`ranking_tabs` 섹션 승격). **판매량 탭은 보류**(주문 22건).
7. **[M1] 브랜드** — mall 2 에 브랜드가 1,354개다. 25개 기준으로 만든 화면이 감당 못 한다.
   초성 필터 + 페이지네이션 필요.
8. ~~**[M3] 쿠폰** — 병렬 세션이 설계 문서를 썼다. `UNIQUE(user_id,coupon_id)` 즉시 적용 가능.~~
   🔴 **틀린 인계였다 (세션 B 에서 확인·정정).**
   - `coupon_design_and_development.md` 는 **존재하지 않았다.** 세션 B 가 새로 작성했다.
   - `UNIQUE(user_id,coupon_id)` 는 **폐기**했다. `admin/couponController.js:259-262` 의 중복 검사가
     `used_at IS NULL` 기준이라 **사용한 쿠폰의 재발급을 허용**하는데, 전역 UNIQUE 가 이를 깨뜨린다.
     대신 다운로드 전용 `coupon_download(user_id, coupon_id)` PK 를 쓴다.
   - 쿠폰은 **스키마부터 미착수**다(`download_*` 컬럼 없음, `issued_by` 에 `DOWNLOAD` 없음).

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

---
---

# 세션 B — 설계 문서 트랙 (2026-07-10)

> **코드는 한 줄도 바꾸지 않았다.** 산출물은 문서 3종이며 **전부 미커밋**이다.
> 대신 코드·DB 를 실측하다 **결제 우회 결함**을 발견했다(§1). 이것이 이 세션의 가장 중요한 인계 사항이다.

## 1. 🔴🔴 결제 우회 결함 (C3) — 미수정, 최우선

`GET /checkout/complete` 로 **결제 없이 주문을 PAID 로 확정**할 수 있다.

```text
routes/checkout.js:21            router.get('/complete', checkoutController.getComplete)
                                 → 인증 미들웨어 없음
checkoutController.js:623-627    함수 진입부에 req.user 확인·주문 소유자 검증 없음
checkoutController.js:625        const isTest = req.query.test === '1'
                                 → 테스트 모드를 클라이언트가 켠다. NODE_ENV 게이트 아님
checkoutController.js:633-636    PENDING 주문을 order_number 하나로 조회
checkoutController.js:645-647    쿼리스트링의 coupon_discount · user_coupon_id 를 검증 없이 UPDATE
                                 → 쿠폰 소유자 확인 없음, coupons.discount_amount 대조 없음
checkoutController.js:655-657    total_amount = MAX(0, subtotal − couponDiscount − pointUseAmount)
checkoutController.js:667        completeOrderWithStockAndPaid() 호출
checkoutController.js:61-95      그 함수는 paymentKey 기본값이 null 이고
                                 Toss 결제를 대조하지 않은 채 status='PAID' UPDATE
```

**결과**: `GET /checkout/complete?orderId=<주문번호>&test=1&coupon_discount=99999999` 한 번으로

- 결제 없이 주문 완료 (재고 차감 · 적립금 정산까지 실행)
- 남의 `user_coupon_id` 를 주입해 **타인의 쿠폰을 소모**시킴 (L100-107 이 주문 행에서 읽어 `used_at` 마킹)

유일한 방어선은 `hasCouponInOrder`(L640) — 주문에 **이미 쿠폰이 있으면** 덮어쓰지 않는다. 쿠폰 미사용 주문에는 방어가 없다. 공격에 필요한 건 PENDING `order_number` 뿐이고, **자기 주문 번호는 언제나 안다.**

**조치**: `isTest` 를 클라이언트 입력에서 분리(`NODE_ENV`/`system_settings`), 쿠폰·포인트를 **PENDING 주문 행에서만** 읽기, 운영에서 불필요하면 라우트 제거.

> 이 결함은 **총액을 서버가 권위 있게 계산하지 않아서** 생겼다. 배송비를 도입할 때 같은 실수를
> 반복하기 쉽다(배송비를 폼에서 받는 것). **C3 수정이 배송비·쿠폰 모든 총액 작업의 선행이다.**

## 2. 산출물 — 문서 3종 (전부 미커밋)

| 파일 | 상태 | 내용 |
|---|---|---|
| `docs/사이트개선/gnb_menu_design.md` | **수정** | 구현 상태 검증 + 스캐폴드 접근 전환 + 낡은 표기 정정 |
| `docs/사이트개선/coupon_design_and_development.md` | **신규 829행** | 쿠폰 관리자·고객 설계 + 결함 C1~C8 + 범위 결정(§13) |
| `docs/사이트개선/shipping_fee_design_and_development.md` | **신규 336행** | 배송비 설계 — 쿠폰의 선행 과제 |

입력 레퍼런스 `docs/사이트개선/쿠폰관리.md`(일반론)는 보존했다.

> 작업 디렉터리에 `docs/사이트개선/주문배송관리.md` 가 untracked 로 있다. **세션 B 가 만든 것이 아니다.**
> 병렬 세션 또는 사용자가 넣은 것으로 보이며, 내용을 반영하지 않았다.

## 3. GNB 문서 검증 결과 (`gnb_menu_design.md`)

체크박스를 실제 코드·DB 와 대조했다. **`[x]` 표시는 전부 정확했다.**

**완료**: B1~B4 (선행 버그 4건) · E1~E12 (이벤트 APPLY형).
**미착수**: S1~S3 · L1~L5 · M1~M4 · E13~E15 · §8-5 전부.

미착수는 **두 층위**로 나뉜다 — 이걸 뭉개면 안 된다.

| 층위 | 메뉴 | 실태 |
|---|---|---|
| **동작하지만 스펙 미달** | 신상품 · 베스트 · 오늘특가 · 브랜드 | 라우트가 살아 있고 목록이 렌더된다. 정체성만 안 맞다 |
| **준비중 랜딩** | 아울렛 · 랭킹 · 쿠폰 · 멤버십 · 라이브 | `routes/feature.js:146-150` `comingSoon()`. 컨트롤러·뷰 없음 |

**문서 개정 사항 (세션 B)**

- **스캐폴드 접근 전환** — 슬롯 계약을 **선확정하지 않는다.** "다섯 메뉴는 표시 형태가 비슷할 뿐 기능이
  갈릴 수 있다"(사용자 지시). 중복이 확정된 것(정렬바·페이지네이션·빈상태)만 먼저 뽑고, 골격·계약은
  **두 번째 메뉴에서 귀납**한다. 랭킹은 세로 순위 리스트, 베스트는 100건 캡이라 **스캐폴드 밖일 수 있다.**
  → §2-0 · §2-5 · §6 · §8 · §8-2 를 함께 고쳤다(한 곳만 고치면 문서 내부가 어긋난다).
- §3 표의 B2·B3·B4 "미수정" 표기를 `✅ 수정됨` 으로 정정 (§6·§8-0 과 모순이었다).
- §1-2 신상품 정의를 `created_at 30일` → `product_badge='NEW'` 로 정정 (§7 결정 2와 모순이었다).
- §2-8 · §7-2 · §8-3 M3 에 **쿠폰 문서로 이관** 표시. `UNIQUE(user_id,coupon_id)` 폐기 명시.

## 4. 쿠폰 · 배송비 설계 요지

### 4-1. 쿠폰 현행 실태 (실측)

```text
coupons        3건. discount_amount(정액) 만 존재. code 전부 NULL. mall_id 없음
user_coupons   19건 전부 issued_by='AUTO'. 사용 0건. UNIQUE 제약 없음
orders         coupon_discount · user_coupon_id(단수) → 주문당 쿠폰 1장이 스키마 제약
```

**`coupon_type` enum 은 분류가 아니라 동작이다.** `NEW_SIGNUP` = 가입 자동발급 트리거(`auth.js:341`),
`SPECIAL` = 코드입력형(`checkoutController.js:314`). `EVENT`/`SEASON` 만 라벨.
→ 목적(`coupon_type`) · 발급방식(`issue_method`) · 혜택유형(`benefit_type`) 세 축으로 분리한다.

> **배포 함정**: `issue_method` 백필과 `auth.js` 수정을 **같은 배포에 묶어야** 한다.
> 나누면 회원가입 쿠폰 지급이 끊긴다(dev = prod DB).

### 4-2. 결함 목록

| # | 결함 | 등급 |
|---|---|---|
| C1 | **주문 취소 시 쿠폰이 복원되지 않는다** (`mypageController.js:450`, `admin/orderController.js:144-172`) | 🔴 |
| C2 | RESERVED(임시점유) 없음 → PENDING 주문 여러 건에 같은 쿠폰 중복 선택 | 🟠 |
| C3 | **결제 우회** (§1) | 🔴🔴 |
| C4 | `postForm` 재검증에서 `max_total_uses` 미검증 | 🟠 |
| C5 | 쿠폰 코드 입력 백엔드는 있으나 **고객 UI 없음** (데드 엔드포인트) | 🟡 |
| C6 | `views/user/mypage/coupons.ejs:28` 의 죽은 `percent` 분기 | 🟡 |
| C7 | 쿠폰 삭제 기능 없음 + FK `ON DELETE CASCADE` → 삭제 붙이는 순간 사용 이력 소멸 | 🟠 |
| C8 | **고지한 배송비가 청구되지 않는다** | 🟠 |

### 4-3. 배송비 — "없는 기능"이 아니라 "고지한 정책의 미구현"

```text
views/user/guide.ejs:68-84        "5만원 이상 무료, 미만 시 3,000원 / 제주 +3,000 / 도서산간 +5,000"
views/user/checkout/form.ejs:132  <span>0원</span>   ← 정적 문자열. id 없음 → JS 갱신 대상도 아님
orders                            배송비 컬럼 없음
checkoutController / cartController  배송비 계산 코드 0건
DB                                배송비 테이블 없음 (shipments 는 송장 추적 전용)
```

**배송비가 끌고 오는 비자명한 귀결**: 무료배송 쿠폰이 들어오면 **쿠폰 1장 제약이 깨진다**
(할인 쿠폰을 쓰면 무료배송 쿠폰을 못 쓴다). → `orders.shipping_coupon_id` 를 별도 컬럼으로 두어
**주문 쿠폰 1장 + 배송비 쿠폰 1장**을 허용한다. 3장 이상은 3차.

**무료배송 판정 기준은 `subtotal_amount`(쿠폰 차감 전)** 다. 결제액 기준이면 "쿠폰을 썼더니 배송비가 생겼다"가 된다.

## 5. 다음 할 일 (세션 A 목록을 대체한다)

**판정 기준: "지금 코드에 있는가"가 아니라 "쇼핑몰로서 필요한가". 없으면 만든다** (사용자 지시).

```text
0차   C3 결제 우회 차단 🔴🔴   ← 다른 모든 것보다 먼저
      C1 취소 시 쿠폰 복원 🔴
      C4 max_total_uses 재검증 · C6 죽은 percent 분기 제거
 │
 ├─▶ 0.5차  배송비 (기본료 · 무료배송 기준)      shipping_fee 문서 §8-1
 │          = 고지된 정책의 구현. C8 해결
 │
 └─▶ 1차    다운로드 쿠폰존 /coupon · RESERVED · 코드 UI · 쿠폰 상태(ENDED)
            ← 총액 계산을 건드리지 않아 0.5차와 병행 가능

     2차    정률 · 적용범위(scope_json) · 지역할증 · 무료배송 쿠폰 · 쿠폰 2장 동시적용
     3차    부분취소 → 상품쿠폰 → 다중쿠폰  (이 순서를 반드시 지킨다)

     목록형 메뉴(L1~L5) · 브랜드(M1) · 멤버십(M2) 는 총액과 무관하므로 언제든 병행 가능
```

**보류 (되살릴 조건 명시)**: 적립금 지급 쿠폰 · 사은품 · Buy X Get Y · 수량 할인 · 결제수단 할인 ·
앱 전용 채널 · 판매자 쿠폰 · 정책 엔진 5테이블. 전체 판정표는 **쿠폰 문서 §13**.

## 6. 세션 B 에서 배운 것

### 6-1. 문서를 고칠 때는 교차참조를 함께 고친다

`gnb_menu_design.md` 에서 §3 표의 낡은 "미수정" 표기를 정정했더니, 같은 유형의 모순을 **새로 하나 만들
뻔했다** — §2-0 을 "랭킹은 스캐폴드 밖"으로 바꿨는데 §2-5 · §6 은 여전히 "다섯 메뉴 전부 스캐폴드 위에
선다"고 주장하고 있었다. `grep` 으로 교차참조를 훑어 5곳을 함께 고쳤다.

**한 절만 갱신하고 끝내면 그게 다음 세션의 낡은 인계가 된다.**

### 6-2. "지운 문구 검색"은 정합성 검증이 아니다

`grep '범위 밖'` 같은 확인은 **내가 지운 게 남았나**만 본다. **새로 만든 것끼리 어긋나는지**는 못 잡는다.
실제로 배송비 단계를 "0.5차 / 배송비 1차 / 배송비 문서 1차" 세 이름으로 부르고 있었다.

### 6-3. 결정을 엉뚱한 문서에 묻으면 드리프트가 난다

쿠폰 문서 안에 배송비 전체 모델을 넣으려다 멈췄다. **배송비를 구현하는 사람은 쿠폰 문서를 안 본다.**
별도 문서로 빼고, 쿠폰 문서는 "선행 과제 + 필요한 인터페이스"만 참조한다.
같은 이유로 **배송비 쿠폰 체크박스는 쿠폰 문서(P7~P11)가 단독 소유**하고 배송비 문서는 참조만 한다.

### 6-4. 보안 단언은 코드를 직접 읽고 한다

C3 를 "결제 우회"라고 쓰기 전에 두 가지를 직접 확인했다 — (a) 진입부에 인증·소유자 가드가 있는가,
(b) `completeOrderWithStockAndPaid` 가 결제를 검증하는가. 서브에이전트 보고만으로 단언했으면
과장이 될 수 있었다. **둘 다 없음을 확인한 뒤에야 단언했다.**

### 6-5. DB 제약은 축이 다른 두 정책을 묶지 않는다

`UNIQUE(user_id, coupon_id)` 는 "다운로드 1인 1회"를 노린 제약인데, **관리자 재발급**(사용한 쿠폰 재지급)과
**월간 쿠폰팩**까지 함께 막는다. 다운로드 전용 `coupon_download` PK 로 분리했다.

---

**세션 B 상태**: 문서 3종 미커밋. 코드 변경 없음. C3 미수정.
→ **세션 C 개정**: 문서는 커밋됐고, **C3 는 수정됐다.** 아래 「세션 C」 참고.

---
---

# 세션 C — 배송비 + 쿠폰 구현 트랙 (2026-07-11)

> 세션 B 가 설계한 두 문서를 **전부 구현·검증**했다. 커밋 3개, 미푸시.
> `e8fd931`(0차 결함 + 배송비 1·2차) · `c460182`(쿠폰 1차) · `119dd1c`(쿠폰 2차)

## 1. 🔴🔴 C3 결제 우회 — **수정 완료**

`GET /checkout/complete` 가 쿼리스트링의 `coupon_discount`·`user_coupon_id`·`point_use_amount` 를
검증 없이 주문에 UPDATE 하고 `PAID` 로 확정하던 것을 막았다.

```text
1) 쿠폰·적립금·배송비는 주문 행에서만 읽는다. 요청에서 읽지 않는다.
2) test 확정 경로는 NODE_ENV 게이트. 클라이언트가 켤 수 없다.
3) 주문 소유자만 조회·확정. 비회원은 postForm 이 세션에 남긴 order_number 로 판정.
```

검증: 비소유자가 `?test=1&coupon_discount=99999999` 로 두드려도 확정되지 않고 주문번호도 노출되지 않는다.
세션을 잃은 비회원은 일반 완료 페이지를 보고(정보 노출 0), 주문은 PAID 로 남는다.

## 2. 배송비 (고지했으나 미구현이던 정책)

```text
shipping_policy(몰별 1행) · shipping_zipcode_zone · orders.shipping_fee · orders.shipping_discount
services/shipping/shippingCalculator.js   ← 서버 전용. 요청 값을 인자로 받지 않는다
```

- **무료배송 판정은 `subtotal_amount`**(쿠폰·적립금 차감 전). 결제액 기준이면 "쿠폰을 썼더니 배송비가 생겼다"가 된다.
- **지역 할증은 무료배송이어도 청구**한다(기본료만 면제 — 택배사 관행). `guide.ejs` 문구도 그에 맞게 고쳤다.
- **배송비에는 구매 적립을 주지 않는다** — 적립 기준 = `total_amount − 순배송비`. 안 막으면 배송비 내고 포인트를 번다.
- 관리자 `/admin/shipping-policy` (몰별 정책 + 우편번호 대역 편집).

## 3. 쿠폰 — 축을 셋으로 분리

```text
coupon_type    목적 라벨 (동작 분기 없음)
issue_method   AUTO_SIGNUP · ADMIN · CODE · DOWNLOAD    ← 동작을 바꾼다
benefit_type   FIXED · PERCENT · SHIPPING_FREE · SHIPPING_FIXED
status         DRAFT · ACTIVE · PAUSED · ENDED          ← 정본. is_active 는 미러
```

- 다운로드 쿠폰존 `/coupon` 신설(0건이면 준비중 폴백). 쿠폰 코드 입력을 체크아웃에서 여기로 이관.
- RESERVED 점유 — 주문 생성 시 점유, 결제 확정 시 USED, 취소 시 해제.
- **주문 쿠폰 1장 + 배송비 쿠폰 1장** 동시 적용(`orders.shipping_coupon_id`).
- 취소 시 **재고·쿠폰·적립금**을 한 트랜잭션에서 복원(`services/order/orderCancelService.js`).

## 4. 🔴 다음 세션이 반드시 알아야 할 것

### 4-1. 배포 후 켜야 하는 것

```sql
UPDATE admin_menus SET is_active = 1 WHERE path = '/admin/shipping-policy';
```
라우트가 배포되기 전에 켜면 운영 관리자에게 404 링크가 노출된다(dev DB = prod DB).

### 4-2. `max_total_uses` 의 의미가 바뀌었다

옛 코드는 이 컬럼을 **발급** 한도로 썼다(전체 `user_coupons` 행 수와 비교). 새 설계는 **사용** 한도다.
기존 쿠폰의 발급 한도는 `issue_limit` 로 옮겨 담았다(쿠폰 2번의 `5`). 운영자에게 이 구분을 알려야 한다.

### 4-3. `is_active` 를 아직 지우지 못한다

운영이 옛 코드를 돌리는 동안 그 코드가 `is_active` 를 읽는다. `status` 가 정본이고 `is_active` 는
쓰기 시 함께 갱신되는 미러다. **배포가 안정된 뒤** 별도 마이그레이션으로 제거한다.

### 4-4. 도서산간 대역은 임시다

`scripts/seed_shipping_zones.sql` 은 널리 쓰이는 목록(제주 전역 + 주요 유인도서 20대역)이다.
**실제 계약 택배사의 도서산간 목록으로 교체해야 한다.** 대역에 빠진 섬은 할증이 안 붙어 손해로 돌아온다.
`/admin/shipping-policy` 에서 편집 가능하다.

### 4-5. 취소해도 실제 환불은 일어나지 않는다 (이 작업 이전부터)

`cancelTossPayment()` 함수는 있으나 **어느 취소 경로도 호출하지 않는다.** 상태만 `CANCELLED` 가 된다.
재고·쿠폰·적립금은 되돌리지만 결제 금액은 그대로다. 별도 과제.

### 4-6. `/admin/orders` 는 죽은 라우트다

`routes/admin/orders.js` 는 `routes/admin.js` 에 **마운트돼 있지 않다.** 운영자가 실제로 쓰는 주문 취소
경로는 `/admin/sales` (`salesController.postStatus`)다. 설계 문서가 `admin/orderController` 를 가리키고
있어 하마터면 죽은 코드만 고칠 뻔했다.

## 5. 세션 C 에서 배운 것

### 5-1. 앱을 재기동하지 않으면 검증이 거짓말을 한다

쿠폰 2차 검증에서 "정률 쿠폰이 안 먹는다"는 실패가 났다. 코드는 옳았고 **앱이 1차 코드로 돌고 있었다.**
증상은 두 개였다 — GET 500(새 뷰 + 옛 컨트롤러) + 할인 0원. 앞의 것이 단서였는데 뒤의 것만 봤다.
**뷰와 컨트롤러가 함께 바뀌었으면, 500 을 먼저 읽어라.**

### 5-2. 운영 DB 를 오염시키지 않고 검증하는 법

`dev DB = prod DB` 다. 두 가지를 썼다.

```text
트랜잭션 + ROLLBACK   가짜 주문·회원을 만들고 서비스 함수를 호출한 뒤 되돌린다
                      (취소 복원 · 가입 쿠폰 지급 검증에 사용)
HTTP + 즉시 삭제       실제 주문을 만들고 값을 확인한 뒤 order_items → orders 순으로 삭제
                      (배송비 · 두 쿠폰 동시 적용 검증. 재고도 되돌린다)
```
검증이 끝날 때마다 `SELECT COUNT(*) FROM orders` 가 **22** 인지 확인했다.

### 5-3. 고객 세션이 OAuth 전용이면 세션을 직접 심는다

회원 흐름(쿠폰 선택)은 로그인 없이 테스트할 수 없었다. `connect-redis` 키(`sess:<sid>`)에 세션을 쓰고
`SESSION_SECRET` 으로 쿠키를 서명해 붙였다. `saveUninitialized:false` 라 **GET 응답에는 세션 쿠키가
없다** — 쿠키는 세션을 처음 쓰는 POST 응답에서 나온다. 이걸 몰라 비회원 소유자 검증이 거짓 실패했다.

### 5-4. 새 기능이 옛 버그를 만들 수 있다

배송비를 넣자 `total_amount` 기반 구매 적립이 **배송비에도 적립**을 주게 됐다. 문서에 없던 문제다.
**기존 계산식에 항목을 더할 때는 그 값을 읽는 모든 곳을 훑어라.**

### 5-5. 두 한도를 한 컬럼에 묶으면 의미가 갈린다

`max_total_uses` 는 발급 한도이자 사용 한도였다. C4(사용 한도 재검증)를 고치는 순간 두 의미가
코드 안에서 갈라졌다. 마이그레이션에서 `issue_limit` 로 분리하고 **다섯 발급 경로를 한 서비스로 모았다**
(`couponIssueService`). 축이 다른 정책은 축이 다른 컬럼에 둔다.

---

**세션 C 상태**: 커밋 3개 미푸시. 배송비·쿠폰 0~2차 완료. 3차(부분취소 → 상품쿠폰 → 다중쿠폰) 미착수.
