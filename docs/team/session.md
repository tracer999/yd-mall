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
| **세션 C** | 배송비 + 쿠폰 구현 | 「세션 C」 |
| **세션 D** | 주문·배송·클레임 | 「세션 D」 |
| **세션 E** | **GNB 잔여 메뉴 정리** — 오늘특가·베스트를 **관리자 수동 큐레이션**으로 재정의 / 아울렛 = **몰내몰 모듈**로 재정의(설계문서 신설) | 맨 아래 「세션 E」 |

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

---
---

# 세션 D — 주문·배송·클레임 트랙 (2026-07-11, 세션 C 이어서)

> `주문배송관리.md`(일반론 레퍼런스)를 실제 코드에 접지시켜 **취소·반품·환불 모듈**을 만들었다.
> 신규 설계 문서 `order_claim_design_and_development.md`. 커밋 `e31fed1`, 미푸시.

## 1. 발견한 결함 두 개 (둘 다 수정)

```text
🔴 고객 주문 취소가 항상 500  — mypageController 가 없는 컬럼 orders.cancel_reason 에 UPDATE
   → 트랜잭션 롤백돼 데이터는 안전했으나 고객은 취소를 아예 못 했다.
🔴 restoreOrderResources 가 재고에 멱등하지 않았다 — stock = stock + qty 를 조건 없이 실행
   → 취소 경로가 하나뿐이라 도달 불가였는데, 클레임 승인이 두 번째 경로가 됐다.
   → orders.resources_restored_at 조건부 UPDATE 의 affectedRows 로 멱등화.
```

## 2. 상태를 네 축으로 분리

```text
orders.status          주문 전체 — 정본(옛 코드가 읽는다). 나머지가 세분화
orders.payment_status  결제 (대기·완료·취소·환불·부분환불)
orders.claim_status    취소·반품 진행 (NONE·REQUESTED·APPROVED·REJECTED·COMPLETED)
orders.refund_status   환불 (NONE·REQUESTED·COMPLETED·FAILED)
order_status_logs      모든 변경 이력 (누가·언제·무엇)
```

레퍼런스의 6축 중 fulfillment·settlement 는 안 만들었다(배송은 shipments.status, 정산은 단일 판매자).

## 3. 클레임 모듈

```text
services/order/orderStatusService.js  transition()·log()·history() — 상태 변경 한 곳
services/order/refundService.js       토스 결제 취소. payment_key 없으면 method='NONE'
services/order/claimService.js         신청·승인·거절·철회. 승인 시 복원+환불 한 트랜잭션
order_claims / order_refunds           취소·반품 / 환불 (주문 단위. 부분은 3차)
```

- **출고 전 취소는 즉시 승인**, 준비 시작(PREPARING) 후·반품은 관리자 승인.
- **귀책 자동 판정** — 불량·오배송=판매자(전액 환불), 단순 변심=고객(왕복 배송비 차감).
- **PG 실패해도 클레임을 되돌리지 않는다** — "취소됐는데 환불 안 됨"이 "재고 새는" 것보다 낫다.
  실패분은 관리자가 `/admin/claims` 상세에서 수동 환불로 마감.
- 화면: 관리자 `/admin/claims`(메뉴 1개), 고객 주문상세 취소·반품 + `/mypage/claims`.
  배송완료 처리(`delivered_at` = 반품 가능 기간 기준).

## 4. 🔴 다음 세션이 반드시 알아야 할 것

### 4-1. 배포 후 켜야 하는 메뉴가 이제 둘이다

```sql
UPDATE admin_menus SET is_active = 1 WHERE path IN ('/admin/shipping-policy', '/admin/claims');
```
라우트 배포 전에 켜면 운영 관리자에게 404 링크가 노출된다(검증 중 임시로 켰다가 껐다).

### 4-2. 🔴 PG 환불이 실주문으로 검증되지 않았다

검증 주문이 전부 `payment_key=NULL`(TEST 결제)이라 환불이 죄다 `method='NONE'` 분기만 탔다.
**실제 토스 취소(`method='PG'`)는 한 번도 안 돌았다.** 요청 형태(URL·Basic 인증·부분 cancelAmount)는
fetch 스텁으로 확인했으나, 라이브 취소는 미검증이다. 프로덕션 전에 토스 테스트 시크릿으로 1회 확인할 것.

### 4-3. 환불 fetch 가 트랜잭션 안에서 돈다 (후속 과제)

`approveInTransaction` 이 주문 행을 `FOR UPDATE` 로 잠근 채 토스 `fetch` 를 호출한다. 저트래픽(22건)엔
무해하나 올바른 형태가 아니다 — 환불 REQUESTED 커밋 → 트랜잭션 밖 PG 호출 → 짧은 2차 트랜잭션으로
COMPLETED/FAILED. 문서 §6-3 에 명시. **트래픽 늘기 전에 고친다.**

### 4-4. 취소 경로는 이제 두 개다 — 둘 다 멱등 복원을 탄다

```text
고객    POST /mypage/orders/:id/cancel   → claimService.requestClaim
관리자  POST /admin/sales/status (CANCELLED) → restoreOrderResources + refundOrder + transition
관리자  POST /admin/claims/:id/approve   → claimService.approveClaim
```
셋 다 `restoreOrderResources`(멱등) 하나를 부른다. `/admin/orders` 는 여전히 죽은 라우트다.

### 4-5. 교환·부분클레임·정산은 3차 (의도적 연기)

교환(EXCHANGE)은 신청 자체를 막았다("반품 후 재주문"). 부분 클레임은 쿠폰 할인액 배분(쿠폰 §13-3)이
선행. 정산·미수금·판매자별은 단일 판매자라 개념이 없다. 전부 문서 §6-3 에 해제 조건과 함께 기록.

## 5. 세션 D 에서 배운 것

### 5-1. 레퍼런스 문서는 "모두 작업"의 대상이 아니다

`주문배송관리.md` 는 7개 상태축·5개 클레임 도메인을 나열한 **업계 표준 문서**다. 그대로 다 만들면
과설계다. 문서 자신의 §6 MVP(주문·배송·클레임 3영역)를 목표로 잡고, 쓰지 않을 컬럼(정산·이행)은
안 만들었다. **"없으면 만든다"의 반대편 — "레퍼런스에 있어도 근거 없으면 안 만든다".**

### 5-2. 새 경로가 옛 코드의 잠복 결함을 깨운다

`restoreOrderResources` 의 비멱등 재고 복원은 세션 C 에서 멀쩡히 돌던 코드다. 취소 경로가 하나였기
때문이다. 클레임 승인을 붙이는 순간 도달 가능해졌다. **함수를 재사용할 때는 "지금 안전한 이유"가
새 호출자에게도 성립하는지 본다.** advisor 가 이걸 코드 작성 전에 짚었다.

### 5-3. 합성 가능한 해피 패스만 덮으면 진짜 위험은 안 덮인다

클레임 흐름 전체를 검증했지만 전부 `payment_key=NULL` 이라 PG 환불은 한 번도 안 돌았다 — 세션 C 의
"getComplete 를 전부 test=1 로만 검증했다"와 똑같은 함정. 외부 의존(토스)이 걸린 경로는 스텁으로라도
따로 친다. fetch 스텁으로 요청 형태(URL·인증·cancelAmount)를 검증해 malformed 요청은 막았다.

### 5-4. EJS 는 `<% %>` 짝만 본다 — 잔여 마크업은 조용히 쌓인다

`order_detail.ejs` 끝에 `}` `}` `</script>` 잔여물이 원래 있었는데(리터럴 텍스트라 무해), 내가 `if` 를
`if/else if` 로 바꾸자 짝 안 맞는 `<% } %>` 가 하나 생겨 컴파일이 깨졌다. 증상은 "Missing catch or
finally after try"(엉뚱한 메시지). **`ejs.compile()` 로 직접 컴파일해 파일을 특정**하는 게 빨랐다.

---

**세션 D 상태**: 커밋 `e31fed1` 미푸시. 클레임 0~2차 완료. PG 실주문·트랜잭션 밖 fetch·교환·부분클레임은 후속.

---

# 세션 E — GNB 잔여 메뉴 정리 트랙 (2026-07-11)

> 출발점: `frontend_dev_plan.md` 기준 미수행 작업 확인 → 사용자 지시 **"MVP 1차까지만 완료하고, 먼저 잔여 메뉴 작업"**
> → `gnb_menu_design.md` §8 체크리스트를 따라 GNB 잔여 메뉴를 하나씩 정리.
>
> **이 세션의 핵심은 코드가 아니라 재정의다.** 문서(설계)와 사용자의 실제 운영 모델이 **세 번 어긋났고**,
> 그때마다 사용자가 바로잡았다. 아래 「1. 뒤집힌 전제」가 이 세션에서 가장 중요한 인계 사항이다.

## 1. 뒤집힌 전제 ★ (다음 세션이 반드시 알아야 할 것)

`gnb_menu_design.md` 는 목록형 메뉴를 **필터/정렬 자동**으로 설계했다. **틀렸다.**
이 몰의 운영 모델은 **관리자 수동 큐레이션**이다.

| 메뉴 | 문서(낡음) | 사용자 확정 (실제) |
|---|---|---|
| **오늘특가** | `DEADLINE_SALE` 뱃지 자동 + 카운트다운 | **관리자가 상품그룹에서 지정.** 카운트다운 없음(수동 큐레이션엔 만료일 개념이 없다) |
| **베스트** | 조회수(`view_count`) 상위 100 자동 | **관리자 수동 지정.** 조회수 자동은 *0건인 몰만* 쓰는 보조 폴백으로 강등 |
| **아울렛** | `discount_rate > 0` 필터 목록 | **"몰 안의 몰"(shop-in-shop).** 전용 상품 + 자체 카테고리 + 전용 관리자 메뉴가 필요한 **신규 모듈** |

> **교훈**: 설계 문서에 "자동으로 뽑는다"가 적혀 있어도, **이 몰은 사람이 고른다**를 기본값으로 의심하라.
> 세 메뉴 연속으로 같은 방향으로 뒤집혔다.

## 2. 완료한 것

### 2-1. 신상품 `/new` ✅ (pass)
`preset({ badge:'NEW', sort:'new' })` — NEW 뱃지 상품만. 전체 카탈로그 최신순 정렬이 아니다.
실측 mall1 7건 / mall2 200건. **사용자 pass 확정.**

### 2-2. 오늘특가 `/deal/today` ✅ — 관리자 수동 큐레이션으로 전환
- **소스**: 몰별 오늘특가 manual 상품그룹(`product_group` id=4, `seed_key='ct_deal'`)
- **홈 '오늘의 특가' 캐러셀(`page_section` id=16)과 같은 그룹을 공유** → 관리자가 `/admin/product-groups` 한 곳만 관리하면 홈·GNB 동시 반영
- 카운트다운 **제거**(구현했다가 사용자 지시로 롤백). `hero_countdown.ejs` 삭제, `deadline` 정렬 제거
- 그룹 상품 0건이면 **준비중 랜딩 폴백**(`COMING_SOON['deal-today']` 신설)
- **DB 작업 수행**: id=4 를 `condition`→`manual` 전환 + 유효 특가 3건(222·223·177) 매핑.
  **상품을 먼저 INSERT 하고 전환**해 홈 캐러셀 공백을 막았다
- **부수 효과**: 만료된 특가(id=106, 06-20 만료)가 홈에서 사라졌다.
  홈 캐러셀의 condition resolve 가 `badge_expire_date` 를 안 봐서 **만료 특가가 계속 노출되던 버그**가 함께 해소됨

### 2-3. 베스트 `/best` ✅ — 관리자 수동 큐레이션으로 전환
- **조사 중 발견한 불일치**: 홈 베스트 그리드는 **이미 수동 지정**(`product_group` id=1, manual 4건)인데
  **GNB `/best` 만 조회수 자동**이라 둘이 서로 다른 상품을 보여주고 있었다
- **소스**: 몰별 '베스트' manual 상품그룹 (홈 그리드와 동일 그룹)
- **폴백**: 수동 지정이 **0건인 몰만** 조회수 상위 100 자동. 상품을 담는 순간 자동으로 수동 모드 전환
- **DB 작업 수행**: mall2 베스트 그룹(id=9)을 `condition`→`manual` 전환 + **BEST 뱃지 상품 중 무작위 50건 매핑**
  (사용자 지시). mall1 은 기존 수동 4건 유지
- 실측: mall1 4건 / mall2 50건

### 2-4. 멤버십 `/membership` ✅ — 정적 제도 소개(안 A)
`views/user/membership/index.ejs` 신설. 4등급 카드(웰컴1%/실버2%/골드3%+무료배송/VIP5%+전용쿠폰)
+ 혜택 3블록 + `/mypage/points` CTA. **등급 산정·`user_grade` 없음**(데이터 부족 — 2차).

### 2-5. 아울렛 `/outlet` ⬜ — 필터 방식 구현했다가 **전면 롤백**
`discount_rate` 필터 + 할인율 구간칩으로 구현했으나 **사용자 지시로 폐기**.
`isOutlet`·`minDiscount`·`maxDiscount`·`discount` 정렬·`hero_outlet.ejs` **전부 제거**. 준비중 랜딩 복원.
→ **[`outlet_design_and_development.md`](../사이트개선/outlet_design_and_development.md) 신설**하여 결정사항 기록.

## 3. 구현 메커니즘 — `groupId` 프리셋 (재사용 가능)

수동 큐레이션 메뉴는 **별도 뷰·컨트롤러를 만들지 않았다.** `productController.getList` 에 프리셋 하나를 추가했다.

```js
// routes/feature.js 가 주입
req.featurePreset = { groupId: <product_group.id>, menuKey: 'BEST' };

// productController.getList
if (groupId > 0) {
    query += " AND id IN (SELECT product_id FROM product_group_item WHERE product_group_id = ?)";
    params.push(groupId);
    // ORDER BY 는 관리자 큐레이션 순서(product_group_item.sort_order)를 존중
}
```
- `groupId` 는 **`req.featurePreset` 에서만** 읽는다(사용자 쿼리스트링으로 조작 불가)
- ORDER BY 서브쿼리 파라미터는 **countQuery 실행 뒤에** push 한다 → count 에 영향 없음
- 같은 방식의 `capLimit`(베스트 폴백의 상위 100 캡)도 추가돼 있다

**새 수동 큐레이션 메뉴가 필요하면 이 프리셋만 쓰면 된다.**

## 4. 하지 않기로 한 것 (재논의 방지)

### 4-1. 공용 목록 스캐폴드(S1/S2) 추출 — **스킵**
`gnb_menu_design.md` §2-0 은 "정렬바·페이지네이션·빈상태를 파티셜로 빼지 않으면 같은 코드를 다섯 번 쓴다"고 했다.
**전제가 틀렸다.** `views/user/products/list.ejs`(617줄)가 **이미** 전체상품·카테고리·브랜드·신상품·베스트·오늘특가를
모두 렌더하는 **단일 공유 뷰**다. 막으려던 중복이 애초에 발생하지 않았다.
→ 순수 코드이동은 회귀 위험만 있고 소비처가 없다. **메뉴별 차이는 조건부 include 로 처리한다.**
랭킹만 자체 뷰가 필요할 수 있다(문서도 '스캐폴드 밖'으로 명시).

### 4-2. MVP 선 (이번에 만들지 않은 것)
랭킹 집계배치(`product_view_daily`)·순위변동·기간탭 / 멤버십 등급산정 / `order_items` ALTER /
이미 1차 끝난 event·exhibition·group_buy·coupon 의 2·3차.

## 5. 다음 세션이 이어서 할 것

```text
[ ] 랭킹 /ranking   — 준비중 랜딩 상태. ranking_tabs 섹션 + GET /sections/ranking 승격.
                      ⚠️ 착수 전 사용자에게 확인할 것: 랭킹도 수동 큐레이션인가, 조회수 자동인가?
                         (오늘특가·베스트가 연속으로 수동으로 뒤집혔다 — 자동이라 가정하지 말 것)
[ ] 브랜드 /brands  — 동작 중이나 초성 필터 + 페이지네이션 미비 (mall2 브랜드 1,354개)
[ ] 아울렛          — 몰내몰 모듈. outlet_design_and_development.md §4 의 미결 사항부터 확인
[ ] 쇼핑라이브       — live sales.md 선행(테이블 6종 + 관리자 CRUD). 무거운 별도 작업
```

## 6. 주의사항 / 함정

- **`dev = prod` DB.** 이 세션에서 `product_group` 2건을 manual 전환하고 `product_group_item` 53건을 INSERT 했다 —
  **전부 운영 데이터에 즉시 반영됐다.** condition→manual 전환은 **상품을 먼저 담고 전환**해야 홈 섹션이 안 빈다.
- **다른 세션과 동시 작업 중이었다.** 워킹트리에 문서 개편(`design_guide_*`·`logs.md`·`ssl_setup.md`·`실행가이드.md`)과
  메뉴별 배너(`menuKey`/`bannerService`) 작업이 섞여 들어왔다. 같은 파일(`productController.js`·`routes/feature.js`)에
  두 세션의 변경이 공존한다. **커밋 전 `git log` 로 HEAD 이동을 확인하라.**
- **홈 섹션과 GNB 가 같은 상품그룹을 본다.** 상품그룹을 건드리면 **두 화면이 동시에 바뀐다.**
- `feature_menu` GNB 13개는 **전부 `module_ready=1`** 이라 준비중 랜딩을 실제 목록으로 바꾸는 순간 운영 반영된다.
  **0건이면 comingSoon 폴백**을 반드시 유지할 것.

## 7. 배운 것

### 7-1. "문서에 있다"가 "사용자가 원한다"는 아니다
설계 문서 3개 절(오늘특가·베스트·아울렛)을 **문서대로 구현했다가 전부 되돌렸다.** 문서는 벤치마킹 기반 추론이었고,
사용자는 자기 운영 모델을 갖고 있었다. **메뉴 하나 착수 전에 "이건 자동인가 수동인가"를 먼저 묻는 게
구현 후 롤백보다 싸다.** 세 번째(아울렛)에서야 착수 전에 물었고, 그게 유일하게 헛수고가 없었다.

### 7-2. 조사가 설계를 대체할 때가 있다
아울렛에서 "관리자 상품그룹 매핑이 어려운 구조면 별도 메뉴를 만들라"는 지시를 받고 조사해 보니
**수동 매핑 UI가 이미 완비**돼 있었다(`/admin/product-groups` — 검색·추가·벌크·순서변경·삭제).
베스트에서는 **홈이 이미 수동 지정인데 GNB만 자동**이라는 불일치를 조사로 찾았다.
**만들기 전에 이미 있는 것부터 세어라.**

### 7-3. 스캐폴드는 두 번째 소비처가 생길 때 뽑는다
S1 추출을 문서 지시대로 하려다, 대상 파일이 **이미 6개 화면의 공유 뷰**임을 확인하고 스킵했다.
추상화의 근거는 "중복이 생길 것 같다"가 아니라 **"중복이 생겼다"** 여야 한다.

---

**세션 E 상태**: 랭킹·브랜드 미착수. 아울렛·쇼핑라이브는 별도 모듈로 이관(설계문서 기록 완료).

---
---

# 세션 F — 베스트/랭킹 재설계 (2026-07-13)

> **세션 E 의 결정을 뒤집었다.** 베스트 = 관리자 수동 큐레이션 → **판매·좋아요 합산 자동 랭킹**.
> 사용자 지시: "베스트는 랭킹과 같은 기능이다. 랭킹은 추후 다른 메뉴로 구성한다."
> 커밋 `f5aa219` · `cc4365a`. **푸시·배포 완료. 배포 후 DB 절차도 전부 실행했다.**
> 설계: `docs/사이트개선/best_ranking_design_and_development.md`

## 1. 무엇이 바뀌었나

| | 세션 E (폐기) | 세션 F (현행) |
|---|---|---|
| 베스트 | 상품그룹(manual) 수동 큐레이션 | **판매×5 + 좋아요×3 + 조회×0 자동 랭킹** |
| 랭킹 | 별도 메뉴(미착수) | **베스트가 곧 랭킹.** 메뉴명 `베스트/랭킹` |
| 홈 베스트 | 수동 상품그룹(`product_group` 1·9) | **같은 랭킹 스냅샷** (`page_section` 10·39 → `best_ranking`) |
| MD 픽 | (개념 없음) | `best_pin` — 자동 위에 수동 고정 |

## 2. 🔴 자동/수동은 이분법이 아니었다 (가장 중요한 교훈)

세션 E 는 "문서는 자동인데 사용자는 수동을 원한다"로 뒤집혔고, 세션 F 는 다시 자동으로 뒤집혔다.
**정답은 "자동이 기본, 수동으로 개입할 구멍(MD 픽)"** 이었다.
다음에 "이건 자동인가 수동인가"를 물을 때는 **"둘 다면 어느 쪽이 기본인가"** 까지 물어라.

## 3. 구조

```text
best_group        탭 정의 — ALL / CATEGORY / BRAND / CUSTOM(2차 미구현)
best_score_config 몰별 가중치 (판매 5 · 좋아요 3 · 조회 0 · rank_limit 100)
best_ranking      산출 스냅샷. 배치가 쓰고 화면은 읽기만
best_pin          MD 픽. 조회 시점 병합
best_ranking_run  집계 이력

services/best/bestRankingService.js   calculate*() = 배치용 / getRanking() = 화면용
scripts/calc_best_ranking.js          배치 (cron)
controllers/bestController.js         /best · /best/tab
controllers/admin/bestGroupController.js  /admin/best-groups
services/display/resolvers/best_ranking.js  홈 섹션
```

### 3-1. 핀은 스냅샷에 굽지 않는다 — 조회 시점에 얹는다

구워 넣으면 MD 가 상품을 밀어도 **다음 배치까지 안 보인다.** 핀은 즉시 반영돼야 하는 운영 행위다.
`mergePins()` 가 매 조회마다 병합한다. 자동 랭킹의 중복은 제거하고 최종 순위를 1..N 으로 **재번호**한다.

**순위 변동(▲▼)은 `auto_rank_no`(자동 순위)로 잰다.** 노출 순위(`rank_no`)로 재면 핀 하나가
끼어드는 순간 아래가 전부 한 칸 밀려 **거짓 '하락'** 이 뜬다(`cc4365a` 에서 수정).

### 3-2. 동점은 누적 조회수로 가른다

실데이터가 거의 0점이다(PAID 11건 · **주문된 상품 1종** · 좋아요 11건).
그대로 정렬하면 **상품 id 순 나열**이 된다. 그래서 조회수를 **tie-break 에만** 쓴다
(점수에는 0 기여 — 사용자 확정 "조회 0점"을 어기지 않는다).
→ **지금 화면상 랭킹은 사실상 조회수 순이다.** 실적이 쌓이면 판매·좋아요가 상위로 올라온다.

> ⚠️ `weight_view` 를 0 보다 올리면 **일간·실시간 랭킹에도 누적 조회수가 섞인다.**
> `products.view_count` 는 누적값이고 기간별 조회 로그가 없다. `product_view_daily` 가 선행돼야 한다.

### 3-3. 성별·나이대는 구조만

`users` 에 성별 컬럼이 **없었다.** `users.gender`(기본 `UNKNOWN`)를 추가했으나 **수집 경로가 없다**
(OAuth 동의항목 필요). 배치는 `('ALL','ALL')` 한 조합만 채우고, 화면 필터는 **비활성**으로 렌더한다.
활성 여부를 코드에 박지 않았다 — `best_ranking` 에 `gender <> 'ALL'` 행이 생기면 **저절로 켜진다**
(`bestController.segmentsAvailable`).

## 4. 배포 후 실행 완료 (2026-07-13)

```text
✅ git push (cc4365a) → GitHub Actions 배포 성공
✅ node scripts/calc_best_ranking.js          (7,692행)
✅ UPDATE admin_menus SET is_active=1 WHERE path='/admin/best-groups';
✅ mysql < scripts/migrate_best_home_section.sql   (page_section 10·39 → best_ranking)
✅ 검증: 운영 홈 베스트 상위 4 = /best 상위 4 (완전 일치)
❌ cron 미등록 — 앱 서버(192.168.1.4) SSH 인증 실패. 아래 참고
```

### 4-1. 🔴 cron 이 아직 없다 — 랭킹이 갱신되지 않는다

**배치가 자동으로 돌지 않는다.** 관리자 `/admin/best-groups` 의 "지금 집계" 를 누를 때만 갱신된다.
앱 서버에서 직접 등록해야 한다(`/data/yd-mall`).

```bash
crontab -e
```
```cron
*/10 * * * *  cd /data/yd-mall && /root/.nvm/versions/node/v22.23.1/bin/node scripts/calc_best_ranking.js --period REALTIME >> logs/best_ranking.log 2>&1
5 * * * *     cd /data/yd-mall && /root/.nvm/versions/node/v22.23.1/bin/node scripts/calc_best_ranking.js --period DAILY    >> logs/best_ranking.log 2>&1
20 3 * * *    cd /data/yd-mall && /root/.nvm/versions/node/v22.23.1/bin/node scripts/calc_best_ranking.js --period WEEKLY   >> logs/best_ranking.log 2>&1
40 3 * * *    cd /data/yd-mall && /root/.nvm/versions/node/v22.23.1/bin/node scripts/calc_best_ranking.js --period MONTHLY  >> logs/best_ranking.log 2>&1
```
> `ENCRYPTION_KEY` 가 필요하다. cron 환경에는 `/etc/environment` 가 자동 로드되지 않으므로
> crontab 상단에 `BASH_ENV=/etc/environment` 를 두거나 래퍼 스크립트로 감싼다. **등록 후 로그로 확인할 것.**
> node 경로는 서버 실제 경로로 맞춘다(`which node`).

## 5. 남은 것

```text
[ ] cron 등록 (위 §4-1) — 안 하면 랭킹이 고정된다
[ ] 브랜드 탭 시드 — 타입 체계는 있으나 **브랜드 그룹이 0개**다(mall2 브랜드 1,354개라 전량 시드 안 함).
                     관리자가 노출할 브랜드만 골라 추가하는 구조. 기본 노출 여부는 사용자 확인 필요
[ ] 성별·나이대 — OAuth 동의항목으로 users.gender 수집 → 배치 확장
[ ] product_view_daily — 기간별 조회수. 조회 가중치를 실제로 쓰려면 선행
[ ] CUSTOM 그룹 — condition_json 스키마 확정 ("특정 조건 베스트 그룹")
[ ] /ranking 별도 메뉴 — 같은 엔진, 세로 순위 리스트
[ ] 급상승 랭킹 — prev_rank_no 델타는 이미 저장돼 있다. 화면만 만들면 된다
```

## 6. 병렬 세션 사고 — `git commit --amend` 가 남의 커밋을 먹었다

이 세션 내내 **다른 세션이 신상품 재설계를 같은 체크아웃에서** 진행했다. 실제로 겪은 일:

1. `routes/feature.js` 에 두 세션 변경이 **공존**했다(내 `/best` + 그쪽 `/new`).
   → HEAD 판 + 내 hunk 만으로 파일을 재구성해 스테이징하고, 커밋 후 워킹 카피를 복원했다.
2. 내가 커밋한 직후 그쪽이 커밋했고, 내 `git commit --amend` 가 **그쪽 커밋을 수정**해 버렸다.
   → `git reflog` 로 원본(`ce055f6`)을 찾아 `git reset --soft` 후 내 수정만 별도 커밋(`cc4365a`).

**교훈: 병렬 세션 환경에서 `--amend` 를 쓰지 마라.** HEAD 가 내 커밋이라는 보장이 없다.
커밋 전에는 항상 `git log --format="%h %an %s" origin/main..main` 으로 HEAD 이동을 확인한다.

> 이번 푸시는 **사용자 승인 하에** 병렬 세션 커밋 3개를 함께 배포했다
> (커밋이 엇갈려 분리 푸시 불가). 그쪽이 요구하는 `products.sale_start_date` 는 이미 적용돼 있었다.

## 7. 배운 것

### 7-1. 즉시성이 저장 위치를 정한다
핀을 스냅샷에 구울지 조회 시점에 병합할지는 성능 문제로 보이지만 **운영 문제**다.
MD 가 상품을 밀고 "왜 안 보이죠?"라고 묻게 만들면 그 기능은 실패다.

### 7-2. 200 은 정확성을 증명하지 않는다
회귀를 전부 `200 OK` 로만 봤는데, `groupFilter` 가 틀리면 **모든 탭이 같은 상품을 보여줘도 200** 이다.
카테고리 탭이 자기 카테고리 상품만 담는지 SQL 로 직접 대조해서야 "각 조건에 따른 랭킹"이 확인됐다.

### 7-3. 데이터가 없으면 정렬이 무의미해진다
"판매 5점 + 좋아요 3점"은 옳은 산식이지만 실데이터가 0이라 그대로 쓰면 id 순 나열이 된다.
가중치 0인 항목을 tie-break 에만 쓰는 지점에서 산식을 어기지 않고 빈 화면을 피했다.
