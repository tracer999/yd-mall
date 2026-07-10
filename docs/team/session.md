# 세션 인계 파일 (cho)

> 이 파일은 **세션 종료 시마다 최신 작업 내용으로 전면 교체**된다.
> 다음 세션은 이 파일을 먼저 읽고 이어간다. 오래된 내역은 보존하지 않음.

**최종 업데이트**: 2026-07-10

---

## 최근 세션 요약

- **한 일**:
  1. `CLAUDE.md`·`README.md` 를 **dev-mall 단독 저장소 기준으로 전면 재작성** (모노레포 서술 제거).
  2. 관리자 트랙 완주 — **A2 · B4 · B5 · B6 · B7 + 테마 설정 + 고객센터 FAQ** (7개 화면).
  3. **디자인 트랙 §12 1차 완료** — 히어로 전환 · GNB 드롭다운 restyle · 우측 레일 개선.
  4. **미구현 모듈 4종 랜딩**(랭킹·아울렛·쿠폰·멤버십) + **테스트 카테고리 트리·상품 시드**(3뎁스, 존치).
- **현재 상태**: `main` 푸시·배포 완료, 운영 검증 완료. 작업 트리 clean.
- **다음 할 일**: 아래 "이번 트랙 밖" 목록 참고. 큰 트랙은 모두 닫혔다.

---

## 현재 상태 상세

| 항목 | 값 |
|---|---|
| 레포 경로 | `/home/ikcho/dev/yd-mall` (WSL Ubuntu, Bash 도구가 여기서 직접 실행됨) |
| 브랜치 / HEAD | `main` (푸시 완료, 작업 트리 clean) |
| 원격 | `https://github.com/tracer999/yd-mall.git` (HTTPS) |
| 앱 포트 | **3006** (개발·상용 동일). pm2 프로세스명 `dev-mall` |
| Node | v22.23.1 |
| DB | `ydata.co.kr` / `dev_mall` — **dev·prod 공용**, 51개 테이블 |
| 카테고리 | NORMAL 15 / THEME 2 / BRAND 25 = 42행, **최대 depth 3** (`[테스트]` 5행 포함) |
| `navigation_config` | `max_gnb_items=12`, `max_custom_items=3`, `category_max_depth=3` |
| GNB | 12종 전부 `module_ready=1` (랭킹·아울렛·쿠폰·멤버십은 '준비 중' 랜딩) |
| `shopify_sync_enabled` | `0` (미사용, 코드는 유지·UI만 숨김) |

### 🔴 배포 규칙 (반드시 지킬 것)

`git push origin main` → `.github/workflows/deploy.yml` → 운영 서버 `/data/yd-mall`.
**푸시 = 즉시 운영 배포.** 사용자가 명시적으로 요청할 때만 푸시한다.

### 🔴 DB 변경은 **항상 코드 배포 뒤에** 한다

dev·prod 가 **같은 DB** 를 본다. 그래서 DB 를 먼저 바꾸면 옛 코드가 도는 운영에 즉시 반영되어
"창(window)"이 열린다. 이 세션에서 **두 번** 밟았다.

| 사례 | 무엇이 열렸나 |
|---|---|
| A2/B4/B5 — `admin_menus` 마이그레이션 선행 | `adminMenu.js` 가 라우트 존재를 확인하지 않아 **운영 사이드바에 404 링크** |
| §12 — `site_settings.hero_variant` 선행 | 새 히어로가 운영에 떴는데 라벨 수정 코드가 없어 **썸네일 5개가 전부 '백세식품'** |

**"설정 한 줄"도 예외가 아니다.** 기능 활성화든 표현 전환이든, DB 변경은 그 값을 소비하는
코드가 운영에 올라간 **뒤에** 한다. (B6/B7·테마/FAQ 는 순서를 지켜 창이 열리지 않았다.)

또한 **검증용 POST/INSERT 전에 스냅샷을 뜨고 끝나면 원복 후 대조**한다.

---

## 이번 세션 산출물

### 1. 문서 재작성

`CLAUDE.md`(얇게, 작업 지침) / `README.md`(레퍼런스) 로 역할 분리. 바로잡은 사실:
포트(둘 다 3006) · `ENC:` 암호화(`ENCRYPTION_KEY` 없으면 기동 실패) · PM2 fork·instances 1 ·
Node 22 · 브랜치 `main` 단독 · 테이블 51개 · Shopify API 버전 3층 구분.

### 2. 디자인 트랙 §12 (1차 완료)

| 영역 | 처리 |
|---|---|
| 히어로 | `site_settings.hero_variant` → `product_showcase`. **코드 변경 없음** — `hero_showcase.ejs` 가 이미 벤치마킹 구조였다. 썸네일 라벨만 `provider` → 슬라이드 `label` |
| GNB 카테고리 | 4열 평면 그리드 → 세로 리스트 + **조건부 메가메뉴**(`category_panel.ejs` 신설) + 백드롭 |
| 우측 유틸 레일 | '바로접속 ON/OFF'(실제로 접힘, `localStorage` 저장) + 최근본 썸네일 2×2 |
| 고객센터 | **이미 정합** — M8 구현이 `capture/image copy.png` 와 일치. 손대지 않았다 |

> **GNB 조건부 메가메뉴**: 카테고리 37개가 전부 depth 1 이라 2단 메가메뉴를 만들면 우측이 항상 빈다.
> 그래서 **자식이 있는 노드에만** hover 서브패널을 띄운다. 2뎁스를 입력하면 자동으로 메가메뉴가 된다
> (임시 자식 3건으로 실제 펼쳐지는 것을 확인 후 삭제). `module_ready` 와 같은 원칙.

> **백드롭은 `<header>` 바깥에 둔다.** 헤더가 `z-50` 으로 stacking context 를 만들어,
> 안에 두면 `fixed` 백드롭이 헤더까지 덮는다(실제로 한 번 그렇게 됐다).

### 3. 미구현 모듈 랜딩 + 테스트 카탈로그

**랜딩 4종** — `/ranking` `/outlet` `/coupon` `/membership`.
기존 `exhibition`·`group-buy`·`live` 의 comingSoon 패턴을 확장했다(`routes/feature.js`).
`#` 죽은 링크 대신 실제 200 랜딩(전역 `X-Robots-Tag: noindex`)이므로 `module_ready=1` 이 정당하다.

> 왜 실기능이 아닌가(데이터 확인): **OUTLET** 은 `discount_rate>0` 상품이 0개, **MEMBERSHIP** 은
> `users` 에 등급 컬럼이 없다(`points_balance` 뿐), **COUPON** 은 다운로드 쿠폰 개념·화면이 없다.
> **RANKING** 만 `getList`의 `sort=best` 로 반쪽 구현이 가능하나 카테고리별·기간별 집계가 빠져 랜딩으로 뒀다.

`scripts/migrate_enable_coming_soon_menus.js` (멱등, `--revert`) 가 `module_ready=1` +
`is_enabled=1` + **`max_gnb_items` 자동 상향**(11→12, GNB 는 상한 초과분을 뒤에서 자른다)을 한다.

**테스트 카탈로그** — `scripts/seed_test_catalog.js` (멱등, `--remove` 로 회수).
`[테스트] 데모 카테고리` → 비타민(→ 어린이 비타민) · 오메가3 · 유산균, 상품 10개. **데모용으로 존치한다.**

> 코드 계약에 맞춘 설계: `getCategoryTree` 가 `type='NORMAL'` 만 올리므로 NORMAL 로 만들고,
> `getList` 가 `category_id` 를 **직접 매칭**(자식 상품을 끌어오지 않음)하므로 **부모 노드에도 상품**을 붙였다.
> 안 그러면 부모를 눌렀을 때 빈 목록이 된다.

### 4. 관리자 화면 7종

| 항목 | 경로 | 핵심 |
|---|---|---|
| A2 | `/admin/menus` | "관리자 메뉴 관리"로 개명. **경로는 유지**(`requireMenuAccess` 가 `path` 로 판정) |
| B4 | `/admin/system-menus` | 헤더유틸 5 + 우측레일 5. `feature-menus` 는 GNB 13종 전용으로 좁힘 |
| B5 | `/admin/header-settings` | `navigation_config` 편집. 뎁스 하향 거부 |
| B6 | `/admin/product-groups` | 삭제·**비활성** 참조 가드 + `seed_key` 보존 |
| B7 | `/admin/menu-preview` | `navigationService.getNavigation` 재사용. 제외 사유·잘림 표시 |
| — | `/admin/theme-settings` | `theme.config_json`. CSS 인젝션 방어(`themeService` 규칙 재사용) |
| — | `/admin/faqs` | FAQ CRUD. `answer` 저장 시 `htmlSanitizer.sanitize()` |

**마이그레이션 스크립트**(전부 멱등, 실행 완료):
`migrate_admin_menu_a2_b4_b5.js` · `migrate_admin_menu_b6_b7.js` · `migrate_admin_menu_theme_faq.js`

---

## 반드시 유지해야 할 불변식

### 카테고리 계층 무결성 (B1)

| 위험 | 막지 않으면 | 처리 |
|---|---|---|
| 뎁스 초과 | 4단계 이상 생성 | `assertDepthAllowed` (MySQL CHECK 로는 `부모.depth + 1` 검증 불가) |
| 순환 참조 | `recalcSubtreeDepth` BFS 가 DB 오염 후 예외 | `wouldCreateCycle` 을 **UPDATE 전에** 호출 |
| 부모 삭제 | `parent_id` 가 `ON DELETE SET NULL` → 자식이 조용히 최상위 승격 | 자식 있으면 삭제 차단 |

### 메뉴 화면 분리 기준 (B4)

**필터는 `position` 이다. `is_system` 이 아니다.** `CATEGORY`(gnb)가 `is_system=1`,
`RAIL_BRAND_WISHLIST`·`RAIL_RECENT` 는 `is_system=0` 이라 두 플래그가 어긋난다.

### 상품 그룹 참조 가드 (B6)

`page_section.data_source_id` 에 **FK 가 없다.** 게다가 `productGroupService.getById` 가
`WHERE is_active = 1` 이라 **삭제뿐 아니라 비활성화만으로도** 참조 섹션이 조용히 빈 목록이 된다.
→ 삭제와 `is_active→0` **양쪽**에 가드. 삭제만 막으면 절반이다.

`filter_condition_json` 의 `seed_key` 는 `seed_ct_sections.js` 의 식별자다. 통째로 덮으면 시드가 그룹을 중복 생성한다.
그리고 **mysql2 는 JSON 컬럼을 객체로 돌려준다** — 그 값을 그대로 UPDATE 파라미터에 재바인딩하면
`[object Object]` → `Invalid JSON text` 500. `manual` 일 땐 컬럼을 아예 건드리지 않는다.

### Header 설정의 뎁스 하향 거부 (B5)

`navigationService.getCategoryTree` 가 `depth <= maxDepth` 로 거른다.
3뎁스 카테고리가 있는데 상한을 1로 낮추면 하위 카테고리가 **조용히 GNB 에서 사라진다.**
저장 시 `MAX(categories.depth)` 를 조회해 거부한다.

### 렌더가 소비하지 않는 설정은 잠근다

`feature_menu.module_ready` 원칙. Header 설정의 `header_layout_type`(1종뿐)·`mega`·`use_search_bar`,
상품 그룹의 `is_fixed` 와 manual 의 `sort_type` 은 UI 에서 감추거나 잠갔다.
**켜도 안 바뀌는 스위치를 운영자에게 내주지 않는다.**

### 입력 검증은 렌더 규칙을 재사용한다

테마 설정은 `themeService.TOKENS[].test` / `CARD_STYLES` 를 그대로 쓴다.
저장 검증과 렌더 검증이 어긋나면 "저장은 됐는데 반영이 안 되는" 상태가 된다.
`themeService` 는 렌더 시 조용히 폴백하지만, 관리자는 **거부하고 사유를 표시**한다.

### Express 5 라우트

`path-to-regexp` v8 이라 **`:id(\d+)` 정규식 파라미터를 지원하지 않는다.**
`/new` 를 `/:id` 보다 먼저 선언하고 숫자 검증은 미들웨어(`requireNumericId`)로 한다.

---

## 다음 세션 시작 시 체크리스트

```bash
# 1) 상태 확인 (Bash 도구가 WSL 에서 직접 실행됨 — wsl 래핑 불필요)
cd /home/ikcho/dev/yd-mall && git status --short && git log --oneline -3

# 2) 앱 기동 (`. /etc/environment` 는 PATH 를 덮으니 아래처럼)
ENCRYPTION_KEY="$(grep -m1 '^ENCRYPTION_KEY=' /etc/environment | cut -d= -f2- | tr -d '\"'\''')" node app.js

# 3) 관리자 로그인 (curl 검증용)
curl -c c.txt -X POST http://127.0.0.1:3006/admin/login -d 'username=tracer999' -d 'password=NEWtec4075@@'

# 4) 앱 종료 — `pkill -f "node app.js"` 는 명령 문자열을 포함한 자기 셸까지 죽인다. PID 로 지정할 것.
for pid in $(pgrep -x node); do
  cmd=$(tr '\0' ' ' < /proc/$pid/cmdline); case "$cmd" in *app.js*) kill "$pid";; esac
done

# 5) 일회성 스크립트는 `await require("./scripts/_bootstrap")()` 를 먼저 호출
#    (안 하면 isShopifySyncEnabled() 가 fail-open 으로 true → 진짜 Shopify API 호출)
#    파일명은 `_` 로 시작 (.gitignore 의 `/_*`), 끝나면 삭제
```

```sql
-- 카테고리 트리 상태 / 고아 노드(0 이어야 정상)
SELECT type, COUNT(*) n, MAX(depth) max_depth FROM categories GROUP BY type;
SELECT COUNT(*) FROM categories c LEFT JOIN categories p ON c.parent_id = p.id
 WHERE c.parent_id IS NOT NULL AND p.id IS NULL;
```

---

## 미해결 / 검토 대상

### 후순위 확정
- [ ] **B3** 커스텀 메뉴 관리 — ⏸ 사용자 확정. 정형화된 화면·관리 완료 + 기능 테스트 후 착수

### 계획서 C 2차 잔여
- [ ] 모바일 메뉴 설정 (`pc_visible`/`mobile_visible` 컬럼만 존재)
- [ ] 카테고리 페이지 관리 / 기획전 페이지 관리 (`EXHIBITION` 모듈 자체가 없음)
- [ ] 할인·오늘특가·베스트 관리 (현재 `product_badge` 수동 지정)

### 기술부채
- [ ] **`app.js:90` 의 `/docs` 정적 서빙이 저장소 밖을 가리킨다.** `path.join(__dirname, '..', 'docs')` → 운영 기준 `/data/docs`(없음). `https://dev-mall.ydata.co.kr/docs/` 404 확인함. 고치려면 `path.join(__dirname, 'docs')`. → `finish-and-deploy` 스킬의 "docs/ 가 /docs 로 서빙된다"는 전제가 성립하지 않는다.
- [ ] **스키마 드리프트**: `tables.sql`(42) vs 실제 DB(51). `categories.shopify_collection_id` 와 `shopify_product_mappings.shopify_inventory_item_id` 는 코드가 쓰는데 저장소의 어떤 SQL 에도 정의가 없다.
- [ ] **`/checkout/complete?test=1`** 은 Toss 승인 없이 주문을 완료시키는 결제 우회 경로.
- [ ] `seoDefaults` 가 전역 `noindex,nofollow` 강제 (테스트 서버 설정). 공개 시 해제 필요.
- [ ] Webhook 등록 스크립트 2종의 토픽이 다름(`register`=4종, `setup`=3종).
- [ ] `main_display_*` 제거 4단계: `mainController.getCategoryProducts` 의 `max_count` 의존 제거 → `/admin/display` 비활성 → 코드 제거 → 백업 후 DROP
- [ ] `categories.slug` 컬럼은 있으나 라우팅 미적용 / 카테고리 SEO·대표이미지 미구현
- [ ] `/admin/visitors` 는 404 (`/stats` 하위만 존재). 인덱스 라우트를 만들거나 메뉴 경로를 맞출 것
- [ ] **P5 거래데이터 (B)분리** — 구조만 정의됨. 별도 스펙으로 나중에 정리

---

## 다음 세션에 전달할 컨텍스트

### 이번 트랙 밖 (큰 트랙은 모두 닫혔다)

| 항목 | 왜 지금 못 하나 |
|---|---|
| **실제 카탈로그의 2뎁스** | 코드·데모 데이터 모두 준비됨(`[테스트]` 트리로 메가메뉴 동작 확인). 실제 카테고리 37개에 하위 분류를 넣는 **콘텐츠 작업**만 남았다. `category_display_type='mega'` 를 쓰려면 Header 설정(B5)의 `mega` 잠금과 관리자 문서 §3.2.1 을 함께 풀어야 한다 |
| **랜딩 → 실기능 승격** | 랭킹은 `getList`+`sort=best` 로 가장 가깝다. 아울렛은 `discount_rate` 데이터, 멤버십은 등급 컬럼, 쿠폰은 다운로드 쿠폰 모델이 선행 |
| **모바일 하단 탭** | `feature_menu` 에 `mobile_quick` 행이 0개고 `menuData`·뷰가 렌더하지 않는다. **기능 신설**이라 계획서 §0-0(프론트 먼저) 순서를 따라야 한다 |
| **레일 브레이크포인트(≥1600px)** | 본문 `max-w-1400px` 와의 충돌. 참조몰처럼 좁은 화면에도 띄우려면 **본문 컨테이너 폭 정책**을 먼저 정해야 한다(§4.3, CT-7 잔여) |
| **B3 커스텀 메뉴** | 후순위 지정. 풀렸는지 먼저 확인. `custom_menu` 스키마 완료, `navigationService` 가 렌더 규칙을 이미 강제. 관리자에 필요한 건 슬롯 초과 거부 / 메뉴명 10자 / `CATEGORY`·`BRAND` 의 `link_target` 필수 검증 |
| **기획전·공동구매·멤버십** | 모듈 자체가 없다(`module_ready=0`). 관리 화면 추가가 아니라 기능 신설 |

**사용자가 다음 세션에서 가장 먼저 말할 가능성이 높은 내용**

1. **"하위 카테고리 넣자"** → `/admin/categories` 트리 화면(B1)에서 2뎁스를 입력하면 GNB 가 자동으로 메가메뉴가 된다. 코드 작업 없음.
2. **"/docs 404 고쳐줘"** → `app.js:90` 한 줄(`'..', 'docs'` → `'docs'`). 운영에서 `/docs/**` 참조처가 있는지 먼저 확인.
3. **"디자인 더 다듬자"** → 스크린샷 비교로 진행한다(§12.5). Playwright venv 는 스크래치패드에 있고, 세션이 바뀌면 다시 설치해야 한다.
4. **"C 2차 계속"** → 위 표에서 막힌 이유를 먼저 짚고 확인받는다.

**작업 방식**: 트랙 단위로 지시하면 중간 확인 없이 완주를 기대한다. 멈춰야 할 때는
(1) 되돌리기 어려운 동작(푸시), (2) 계획서에 없는 설계 결정, (3) 후순위 지정 항목 도달 시뿐.

> 이번 세션에서 (2)에 해당한 사례: B4 가 이미 B2 화면에 기능적으로 흡수돼 있어 "분리 vs 통합 유지"를 물었고,
> 사용자가 **분리**로 확정했다.

**계획서**: `docs/사이트개선/admin_dev_plan.md` (관리자), `docs/사이트개선/frontend_dev_plan.md` (프론트)
