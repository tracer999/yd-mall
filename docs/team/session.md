# 세션 인계 파일 (cho)

> 이 파일은 **세션 종료 시마다 최신 작업 내용으로 전면 교체**된다.
> 다음 세션은 이 파일을 먼저 읽고 이어간다. 오래된 내역은 보존하지 않음.

**최종 업데이트**: 2026-07-10

---

## 최근 세션 요약

- **한 일**:
  1. `CLAUDE.md`·`README.md` 를 **dev-mall 단독 저장소 기준으로 전면 재작성** (모노레포 서술 제거).
  2. 관리자 트랙 완주 — **A2 · B4 · B5 · B6 · B7 + 테마 설정 + 고객센터 FAQ** (7개 화면).
- **현재 상태**: `main` 푸시 완료, GitHub Actions 배포 성공, 운영 검증 완료. 작업 트리 clean.
- **다음 할 일**: **디자인 개선 트랙** (관리자 트랙이 끝났으므로 착수 가능). 또는 계획서 C 2차 잔여 항목.

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
| 카테고리 | NORMAL 10 / THEME 2 / BRAND 25 = 37행, 전부 depth 1 |
| `navigation_config` | `max_gnb_items=11`, `max_custom_items=3`, `category_max_depth=3` |
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

### 2. 관리자 화면 7종

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

**사용자가 다음 세션에서 가장 먼저 말할 가능성이 높은 내용**

1. **"디자인 정리하자"** → 관리자 트랙이 끝났으므로 이제 착수 가능하다. 대상은 GNB / 히어로 슬라이드쇼 / 우측 유틸레일(§12). 벤치마킹 캡처는 `docs/사이트개선/capture/`. 계획서는 `docs/사이트개선/frontend_dev_plan.md`.
2. **"C 2차 계속"** → 모바일 메뉴 설정이 가장 가깝다(컬럼은 이미 있음). 기획전은 `EXHIBITION` 모듈 자체가 없어 프론트부터 필요하다.
3. **"B3 하자"** → 후순위 지정이 풀렸는지 먼저 확인한다. `custom_menu` 스키마는 완료, `navigationService` 가 렌더 측 규칙(슬롯 제한·link_type 해석·EXTERNAL_URL 새 창 강제)을 이미 강제하고 있다. 관리자에 추가로 필요한 건 슬롯 초과 저장 거부 / 메뉴명 10자 제한 / `CATEGORY`·`BRAND` 의 `link_target` 필수 검증.
4. **"/docs 404 고쳐줘"** → `app.js:90` 한 줄. 운영에서 `/docs/**` 를 참조하는 곳이 있는지 먼저 확인.

**작업 방식**: 트랙 단위로 지시하면 중간 확인 없이 완주를 기대한다. 멈춰야 할 때는
(1) 되돌리기 어려운 동작(푸시), (2) 계획서에 없는 설계 결정, (3) 후순위 지정 항목 도달 시뿐.

> 이번 세션에서 (2)에 해당한 사례: B4 가 이미 B2 화면에 기능적으로 흡수돼 있어 "분리 vs 통합 유지"를 물었고,
> 사용자가 **분리**로 확정했다.

**계획서**: `docs/사이트개선/admin_dev_plan.md` (관리자), `docs/사이트개선/frontend_dev_plan.md` (프론트)
