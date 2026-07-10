# 세션 인계 파일 (cho)

> 이 파일은 **세션 종료 시마다 최신 작업 내용으로 전면 교체**된다.
> 다음 세션은 이 파일을 먼저 읽고 이어간다. 오래된 내역은 보존하지 않음.

**최종 업데이트**: 2026-07-10

---

## 최근 세션 요약

- **한 일**:
  1. `CLAUDE.md`·`README.md` 를 **dev-mall 단독 저장소 기준으로 전면 재작성**. 두 문서 모두 존재하지 않는 4개 서브프로젝트(spf-mall·spf-admin·shopifyApp·store-theme-Rise)의 모노레포를 설명하고 있었다.
  2. **A2** 관리자 메뉴 개명 · **B4** 시스템 메뉴 설정 신설 · **B5** Header 설정 신설.
- **현재 상태**: `main` 로컬 커밋 2건(`a97e8d5`, `5d9ccfe`) — **아직 푸시 안 함**. 작업 트리 clean.
- **다음 할 일**: **B6** 상품 그룹 관리 전용 화면 또는 **B7** 메뉴 미리보기. (B3 커스텀 메뉴는 후순위 확정)

---

## 현재 상태 상세

| 항목 | 값 |
|---|---|
| 레포 경로 | `/home/ikcho/dev/yd-mall` (WSL Ubuntu, Bash 도구가 여기서 직접 실행됨) |
| 브랜치 / HEAD | `main` @ `5d9ccfe` (작업 트리 clean, **미푸시 커밋 2건**) |
| 원격 | `https://github.com/tracer999/yd-mall.git` (HTTPS) |
| 앱 포트 | **3006** (개발·상용 동일). pm2 프로세스명 `dev-mall` |
| Node | v22.23.1 |
| DB | `ydata.co.kr` / `dev_mall` — **dev·prod 공용** (의도된 구성), 51개 테이블 |
| 카테고리 현황 | NORMAL 10 / THEME 2 / BRAND 25 = 37행, 전부 depth 1 |
| `navigation_config` | `max_gnb_items=11`, `max_custom_items=3`, `category_max_depth=3` |
| `system_settings.shopify_sync_enabled` | `0` (미사용, 코드는 유지·UI만 숨김) |

### 배포 (중요)

`git push origin main` → `.github/workflows/deploy.yml` → 운영 서버 `/data/yd-mall` 에
`git reset --hard` + `./dev-mall.sh build && start`. **푸시 = 즉시 운영 배포.**
dev 와 prod 가 같은 DB 를 보므로 로컬 검증 스크립트의 테스트 행도 운영 데이터에 그대로 들어간다.

> **미푸시 커밋이 남아 있다.** 사용자가 명시적으로 요청할 때만 푸시할 것.

> 🔴 **운영에 열린 창(window) 주의.** `scripts/migrate_admin_menu_a2_b4_b5.js` 는 **공용 DB 에 이미 실행됐고**,
> `middleware/adminMenu.js` 는 매 요청 DB 를 읽어 사이드바를 그린다(라우트 존재 여부는 보지 않는다).
> 반면 라우트 코드는 아직 미푸시다. 따라서 **운영 admin 사이드바에 '시스템 메뉴 설정'·'Header 설정' 링크가
> 이미 보이지만 클릭하면 404 다**(2026-07-10 확인: `/admin/feature-menus` 200, 나머지 2개 404).
> '관리자 메뉴 관리' 개명도 이미 반영돼 있다. **푸시하면 즉시 치유된다.**
>
> 교훈: 공용 DB + `push=deploy` 환경에서는 **코드 배포 → 마이그레이션** 순서로 갈 것.

### 이번 세션 커밋

```
5d9ccfe feat: A2 관리자 메뉴 개명 + B4 시스템 메뉴 설정 + B5 Header 설정
a97e8d5 docs: CLAUDE.md·README.md 를 dev-mall 단독 저장소 기준으로 재작성
```

---

## 이번 세션 산출물

### 1. 문서 재작성 (`a97e8d5`)

`CLAUDE.md`(얇게, 작업 지침) / `README.md`(레퍼런스) 로 역할 분리. 바로잡은 사실:

| 항목 | 기존 문서 | 실제 |
|---|---|---|
| 포트 | 개발 3000 / 상용 3006 | **둘 다 3006** |
| DB 비밀번호 | 평문 | `.env` 에선 `ENC:` AES-256-GCM. `ENCRYPTION_KEY` 없으면 `process.exit(1)` |
| PM2 | cluster | `fork`, `instances: 1` |
| Node | 18+ | 22 (`dev-mall.sh` 가 nvm 으로 선택) |
| 브랜치 | developer/main | `main` 단독 |
| 테이블 | 20+ | 51개 (`tables.sql` 은 42개만 정의) |
| Shopify API 버전 | "adminClient 기본 2026-04" | 런타임 `2026-04`(`system_settings` 주입) / 코드 폴백 admin `2025-01`·storefront `2026-04` / `syncService.adminQuery2025` 만 URL 하드코딩 |

### 2. A2 · B4 · B5 (`5d9ccfe`)

| 항목 | 경로 | 내용 |
|---|---|---|
| A2 | `/admin/menus` | `admin_menus.name` "메뉴관리" → **"관리자 메뉴 관리"**. H1·안내 링크 추가. **경로는 유지**(`requireMenuAccess` 가 `path` 로 판정) |
| B4 | `/admin/system-menus` | 헤더 유틸 5 + 우측 레일 5. `feature-menus` 는 **gnb 13종 전용**으로 좁힘 |
| B5 | `/admin/header-settings` | `navigation_config` 편집(GNB 슬롯·카테고리 뎁스·레이아웃) |

**신규/변경 파일**

| 파일 | 내용 |
|---|---|
| `controllers/admin/featureMenuController.js` | `SCREENS` 로 position 파라미터화. `getList`/`postSave`(gnb) + `getSystemList`/`postSystemSave`(header_util·right_rail) |
| `controllers/admin/headerSettingsController.js` | 신규. 화이트리스트·범위 클램프·뎁스 하향 거부 |
| `views/partials/admin/menu_editor.ejs` | 신규. B2/B4 공용 편집기 |
| `views/admin/{system-menus/list,header-settings/edit}.ejs` | 신규 |
| `routes/admin/{system-menus,header-settings}.js` | 신규. `routes/admin.js` 에 마운트 |
| `scripts/migrate_admin_menu_a2_b4_b5.js` | 멱등. A2 개명 + 메뉴 2건 등록 (**실행 완료**) |
| `scripts/init_db.js` | 시드의 '메뉴관리' → '관리자 메뉴 관리' |

---

## 반드시 유지해야 할 불변식

### 카테고리 계층 무결성 (B1)

| 경로 | 막지 않으면 | 처리 |
|---|---|---|
| 뎁스 초과 | 4단계 이상 생성 | `assertDepthAllowed` (MySQL CHECK 로는 `부모.depth + 1` 검증 불가) |
| 순환 참조 | `recalcSubtreeDepth` BFS 가 DB 오염 후 예외 | `wouldCreateCycle` 을 **UPDATE 전에** 호출 |
| 부모 삭제 | `parent_id` 가 `ON DELETE SET NULL` → 자식이 조용히 최상위 승격 | 자식 있으면 삭제 차단 |

### 메뉴 화면 분리 기준 (B4)

**필터는 `position` 이다. `is_system` 이 아니다.** 두 플래그가 어긋난다 —
`CATEGORY`(gnb)가 `is_system=1`, `RAIL_BRAND_WISHLIST`·`RAIL_RECENT` 는 `is_system=0`.
`is_system` 으로 가르면 GNB 카테고리 버튼이 시스템 화면에 끌려오고 레일 2종이 빠진다.

### Header 설정의 뎁스 하향 거부 (B5)

`navigationService.getCategoryTree` 가 `depth <= maxDepth` 로 거른다.
3뎁스 카테고리가 있는데 상한을 1로 낮추면 **하위 카테고리가 조용히 GNB 에서 사라진다.**
저장 시 `MAX(categories.depth)` 를 조회해 그보다 낮으면 거부한다.

### 렌더가 소비하지 않는 설정은 잠근다

`feature_menu.module_ready` 와 같은 원칙. Header 설정의 `header_layout_type`(1종뿐),
`category_display_type='mega'`, `use_mega_menu`, `use_search_bar` 는 UI 에서 잠그고 "미지원" 표기.
**켜도 안 바뀌는 스위치를 운영자에게 내주지 않는다.**

---

## 다음 세션 시작 시 체크리스트

```bash
# 1) 상태 확인 (Bash 도구가 WSL 에서 직접 실행됨 — wsl 래핑 불필요)
cd /home/ikcho/dev/yd-mall && git status --short && git log --oneline -3
pm2 list          # 로컬에 dev-mall 프로세스가 떠 있지 않을 수 있음

# 2) 앱 기동 (ENCRYPTION_KEY 필수. `. /etc/environment` 는 PATH 를 덮으니 아래처럼)
ENCRYPTION_KEY="$(grep -m1 '^ENCRYPTION_KEY=' /etc/environment | cut -d= -f2- | tr -d '"'"'"'')" node app.js

# 3) 일회성 검증 스크립트
#    - 반드시 `await require("./scripts/_bootstrap")()` 먼저 호출
#      (안 하면 isShopifySyncEnabled() 가 fail-open 으로 true → 진짜 Shopify API 호출)
#    - 파일명은 `_` 로 시작 (.gitignore 의 `/_*`), 끝나면 삭제

# 4) 라우트 스모크
node -e 'const h=require("http");["/","/products","/admin/feature-menus","/admin/system-menus","/admin/header-settings"].forEach(p=>h.get({host:"127.0.0.1",port:3006,path:p},r=>console.log(r.statusCode,p)))'
```

```bash
# 관리자 로그인 (curl 검증용)
curl -c c.txt -X POST http://127.0.0.1:3006/admin/login -d 'username=tracer999' -d 'password=NEWtec4075@@'
```

```sql
-- 카테고리 트리 상태
SELECT type, COUNT(*) n, MAX(depth) max_depth FROM categories GROUP BY type;
-- 고아 노드 점검 (0 이어야 정상)
SELECT COUNT(*) FROM categories c LEFT JOIN categories p ON c.parent_id = p.id
 WHERE c.parent_id IS NOT NULL AND p.id IS NULL;
```

---

## 미해결 / 검토 대상

- [ ] **B6** 상품 그룹 관리 전용 화면 (`product_group(_item)` 테이블은 있고 page-builder 에서 선택만 가능)
- [ ] **B7** 메뉴 미리보기
- [ ] **B3** 커스텀 메뉴 관리 — ⏸ 후순위 확정. 정형화된 화면·관리 완료 + 기능 테스트 후 착수
- [ ] **테마 설정 UI** — `theme` 테이블·`themeService` 는 P4 에서 완료, 관리 UI 만 없음. 저장 시 CSS 인젝션 방어 필요
- [ ] **FAQ CRUD 관리 UI** — `faq`/`faq_category` 와 `/cs` 프론트는 M8 완료. `answer` 저장 시 `htmlSanitizer.sanitize()` 필수
- [ ] **기술부채** `main_display_*` 제거 4단계: `mainController.getCategoryProducts` 의 `max_count` 의존 제거 → `/admin/display` 비활성 → 코드 제거 → 백업 후 DROP
- [ ] **디자인 개선(§12)** GNB / 히어로 슬라이드쇼 / 우측 유틸레일 — 관리자 트랙 완료 후 착수
- [ ] **P5 거래데이터 (B)분리** — 구조만 정의됨. 별도 스펙으로 나중에 정리
- [ ] `categories.slug` 컬럼은 있으나 라우팅 미적용 / 카테고리 SEO·대표이미지 미구현

### 코드 결함 (문서에만 기록, 미수정)

- [ ] **`app.js:90` 의 `/docs` 정적 서빙이 저장소 밖을 가리킨다.** `path.join(__dirname, '..', 'docs')` 는 운영 기준 `/data/docs` 이고 존재하지 않는다. `https://dev-mall.ydata.co.kr/docs/` 404 확인함(대조군 `/`, `/manual` 은 200). 고치려면 `path.join(__dirname, 'docs')`. → **`finish-and-deploy` 스킬의 "docs/ 가 /docs 로 서빙된다"는 전제가 현재 성립하지 않는다.**
- [ ] **스키마 드리프트**: `tables.sql`(42) vs 실제 DB(51). `categories.shopify_collection_id` 와 `shopify_product_mappings.shopify_inventory_item_id` 는 코드가 쓰는데 저장소의 어떤 SQL 에도 정의가 없다.
- [ ] **`/checkout/complete?test=1`** 은 Toss 승인 없이 주문을 완료시키는 결제 우회 경로.
- [ ] `seoDefaults` 가 전역 `noindex,nofollow` 강제 (테스트 서버 설정). 공개 시 해제 필요.
- [ ] Webhook 등록 스크립트 2종의 토픽이 다름(`register`=4종, `setup`=3종).

---

## 다음 세션에 전달할 컨텍스트

**사용자가 다음 세션에서 가장 먼저 말할 가능성이 높은 내용**

1. **"푸시해줘"** → 푸시 = 운영 배포. **메뉴 행은 이미 운영에 노출 중이고 없는 건 라우트다.** 즉 "배포하면 노출된다"가 아니라 "이미 노출됐고 링크가 깨져 있으니 배포로 치유한다"가 실제 상태다(위 🔴 참고). 미루면 그동안 운영 admin 이 404 를 본다.
2. **"B6/B7 진행해줘"** → 상품 그룹 관리 화면(B6) / 메뉴 미리보기(B7). B2·B4 의 `featureMenuController` + `views/partials/admin/menu_editor.ejs` 공용 패턴을 참고.
3. **"디자인 정리하자"** → 관리자 트랙에서 B6·B7 이 남았다. 사용자가 "관리자 모두 정리 후 디자인" 이라고 확정했으므로 남은 항목을 먼저 짚고 확인받는다. 벤치마킹 캡처는 `docs/사이트개선/capture/`.
4. **"/docs 404 고쳐줘"** → `app.js:90` 한 줄(`'..', 'docs'` → `'docs'`). 다만 운영에서 `/docs/**` 를 참조하는 곳이 있는지 먼저 확인.

**작업 방식**: 트랙 단위로 지시하면 중간 확인 없이 완주를 기대한다. 멈춰야 할 때는
(1) 되돌리기 어려운 동작(푸시), (2) 계획서에 없는 설계 결정, (3) 후순위 지정 항목 도달 시뿐.

> 이번 세션에서 (2)에 해당한 사례: B4 가 이미 B2 화면에 기능적으로 흡수돼 있어 "분리 vs 통합 유지"를 물었고, 사용자가 **분리**로 확정했다.

**DB 쓰기 주의**: dev·prod 공용이다. 검증용 POST/INSERT 전에 스냅샷을 뜨고, 끝나면 원복 후 대조할 것.

**계획서**: `docs/사이트개선/admin_dev_plan.md` (관리자), `docs/사이트개선/frontend_dev_plan.md` (프론트)
