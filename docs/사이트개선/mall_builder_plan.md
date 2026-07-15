# 몰 빌더 설계서 — 몰 생성 · 구성 · 디자인 관리

> **이 문서는 잔여 과제만 남긴 축약본입니다.** (정리: 2026-07-15)
> 완료 기능의 정본은 `docs/develop_guide/` (개발자) 와 `docs/manual/` (운영자) 입니다.
> 원문의 as-is 조사·설계 산문·DDL은 이관 후 삭제했습니다.

---

## 완료되어 이관된 항목

| P | 항목 | 이관된 문서 |
|---|---|---|
| P1 | 스키마 — `navigation_config.nav_mode`, `mall.preset_key` | `develop_guide/admin/malls.md` |
| P2 | `navigationService` 공통 노드 shape + `buildSplit` / `buildUnified`, `menuData.toViewItem` 의 `children` 재귀 매핑 | `develop_guide/admin/storefront_menus.md` |
| P3 | 헤더 디스패처 + 스킨 2종 (`_main_right_utility` / 드로어형) + 재귀 GNB 노드 파셜 | `develop_guide/user/layout.md` |
| P4 | 프리셋 & 몰 프로비저닝 (`services/mall/presets.js`, `mallProvisioner.js`) | `develop_guide/admin/malls.md` |
| P6 | 메뉴 미리보기 확장 (`nav_mode` 자동 분기) | `develop_guide/admin/storefront_menus.md` |

**설계와 달라진 확정 사항 (구현이 정답)**

| 설계서 | 실제 |
|---|---|
| 프리셋 키 `large_mall` / `small_mall` | **`split_gnb` / `drawer_gnb`** — 몰의 "규모" 축은 폐기했다. 상품 1만 개인 몰이 드로어형을 쓸 수도 있다 |
| 프로비저닝 모드 `fill` / `overwrite` | **`create` / `reapply`** |
| `mall.mall_type` 컬럼 추가 | **도입하지 않기로 확정** (§0 정정대로). 소스 오브 트루스는 `navigation_config` 다 |
| 소형몰 인라인 스킨 `compact_inline_v1` | 만들었다가 폐기. **스킨은 2종 고정** (`main_right_utility_v1` + `compact_drawer_v1`) |
| — | **계획 초과 달성**: 홈 섹션 데이터 소스 동반 생성 (`product_group`·`best_group` + 초기 랭킹 집계). 새 몰이 만들어지는 즉시 홈이 채워진다 |

---

## 잔여 과제

| # | 과제 | 현재 상태 |
|---|---|---|
| 1 | **[P5] 몰 구성 탭 허브** — `/admin/malls/:id` 6탭 (기본정보 / 프리셋 / 헤더·GNB / 메뉴 / 디자인 / 메인화면) | **유일한 미구현 P.** 지금은 몰 하나를 구성하려면 `malls` → `header-settings` → `menus` → `custom-menus` → `theme-settings` → `page-builder` 6개 화면을 떠돌아야 한다. "어느 몰을 편집 중인지"가 화면마다 흩어진다 |
| 2 | **`navigation_config.config_json` 레이아웃 세부 옵션** (`dropdown_trigger` hover/click 등) | 컬럼만 있고 **아무도 안 읽는다**. 새 컬럼을 늘리지 말고 여기에 담는다는 원칙만 남아 있다 |
| 3 | **대시보드·매출 몰 스코프** | `dashboardController`·`salesController` 가 `adminMallId` 를 안 쓴다. 편집 몰을 바꿔도 숫자가 전 몰 합산으로 나온다. 근본 원인은 **`orders`·`carts` 에 `mall_id` 가 없다**는 것 |
| 4 | **sitemap 이 기본 몰만 수록** | `routes/sitemap.js` 가 `is_default=1` 몰만 본다. 몰 2의 상품 9,677건이 SEO 에서 통째로 빠진다 |
| 5 | **모바일 하단바 하드코딩** | `feature_menu(position='mobile_quick')` 스키마와 `nav.mobileQuick` 출력이 있는데 `mobile_bottom_nav.ejs` 가 안 읽고 홈/카테고리/장바구니/마이를 하드코딩한다 |
| 6 | **도메인 기반 몰 라우팅** | `mall.domain` 컬럼만 존재. 아직 안 쓴다. 현재는 셀렉트 박스 + 세션 방식 |

**P5 착수 시 주의** — 허브에서 진입할 땐 `adminMallContext` 를 URL 의 `:id` 로 **강제**해야 한다. 상단 몰 셀렉트와 편집 대상이 어긋나는 사고를 막는 유일한 장치다. 기존 6개 화면은 그대로 두고, 허브는 "그 몰로 스코프가 고정된 진입점"으로만 만든다.

---

## 알려진 결함

| # | 결함 | 영향 |
|---|---|---|
| 1 | **프리셋 재적용 시 아울렛·공동구매·쇼핑라이브 메뉴가 꺼진다** | `services/mall/presets.js` 의 `featureMenus` 배열에 이 3종이 **없다**. `reapply` 하면 프리셋 목록에 없는 메뉴가 `is_enabled=0` 이 된다 |
| 2 | **몰 삭제 검사가 여전히 `categories`/`products` 만 본다** | 정리 DELETE 대상은 7종으로 확대됐으나 **가드는 안 넓혔다.** `mall_id` 를 가진 테이블에 FK 가 하나도 없어서, 쿠폰·기획전만 있는 몰이 검사를 통과해 삭제된다 |
| 3 | **모바일 하단바 카테고리 링크 불일치** | 하단바는 `/products?categoryId=`, GNB·PC 패널은 `/products/category/:id` 로 같은 카테고리를 다른 URL 로 보낸다. `/products/category/:id` 로 통일해야 한다 |
| 4 | **`deal.mall_id`/`deal_category.mall_id` 만 `int`** | 나머지 몰 스코프 테이블은 `bigint`, `mall.id` 도 `bigint` |

---

## 이 저장소 특유의 함정 (몰 빌더 작업 시 계속 유효)

- 🔴 **`page_revision` 스냅샷 우선.** `displayService.getPageSections()` 는 발행 스냅샷(`page_revision.snapshot_json`)이 있으면 그것을 렌더하고, 없을 때만 라이브 `page_section` 으로 폴백한다. 프로비저너가 `page_section` 만 갈아끼우면 **이미 발행 이력이 있는 페이지는 옛 스냅샷이 계속 나간다.** `reapply` 는 섹션 교체 후 반드시 새 리비전을 발행해야 한다.
- **`featureMenuSync` 재사용.** `mall_feature_menu` 시딩 로직을 새로 짜지 말 것. 스토어프론트는 `INNER JOIN`, 관리자는 `LEFT JOIN` 으로 읽어서 행이 없으면 "관리자엔 보이는데 몰엔 안 뜨는" 버그가 이미 한 번 났다.
- **`category_max_depth` 하향 가드.** drawer(`unified`) 모드에선 카테고리가 GNB **본체**라 뎁스를 낮추면 메뉴가 통째로 사라진다.
- **DB 공용 + 몰 2는 크다.** 프로비저닝 테스트는 버릴 수 있는 테스트 몰로 하고, 몰 1·2 에 `reapply` 를 함부로 돌리지 않는다.
- **EJS 캐시.** `.ejs` 수정 후 서버 재시작 필수.
