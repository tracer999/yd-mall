# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 응답 언어

- **이 저장소에서 사용자에게 보내는 모든 답변은 한국어로 작성한다.** (코드·식별자·명령어 등 원문 유지가 필요한 부분은 예외)

## 프로젝트 단계 (중요)

- **이 프로젝트는 전 과정이 개발 단계입니다. 상용(운영/프로덕션) 배포라는 상황은 존재하지 않습니다.**
- `git push origin main` 으로 서버에 반영되는 것도 **개발 서버 배포**이며, "상용 배포"가 아닙니다.
- 따라서 "상용에 나간다", "프로덕션 영향" 같은 전제를 깔고 판단하지 마세요. 배포·마이그레이션·데이터 변경은 **개발 환경 기준**으로 다룹니다.
- 사용자가 **명시적으로 "상용 적용"·"프로덕션 배포"라고 말하기 전까지는 상용 전제를 두지 않습니다.**

## 제품 성격 (중요) — 몰 빌더 솔루션

- **이 프로젝트의 목적은 "특정 쇼핑몰 하나를 운영"하는 것이 아닙니다.** 쇼핑몰이 필요한 사용자에게 **몰을 만들어(빌드해) 포팅해 주는 "몰 빌더(mall builder)" 솔루션**입니다.
- 즉 목표는 운영이 아니라 **"쉽게 몰을 찍어내는 것"** 이며, 몰을 **만들고 → 확인하고 → 지우고 → 다시 만드는** 반복 작업이 정상 흐름입니다.
- 앱은 하나의 인스턴스 안에서 **여러 몰(멀티몰)** 을 정의합니다(`mall` 테이블 + `mall_id` 스코핑, `?mall=<코드>` 로 스토어 분기). 화면에 보이는 건강식품관·종합관 등도 운영 데이터가 아니라 **빌더가 만들어 낸 예시 몰**입니다.
- 이 성격 때문에 **기본몰이 아닌 몰은 데이터가 있어도 강제 삭제**할 수 있습니다(`controllers/admin/mallController.js` + `services/mall/mallEraser.js`). 기본몰만 삭제 불가(해석기 폴백).
- 몰을 새로 만들려는 사람을 위한 **몰 빌더 가이드**가 `/manual/mall_builder` (진입 별칭 `/doc`, `/doc/manual`) 로 제공됩니다. 소스: `docs/manual/mall_builder/`.

## 사용자 전제 (중요) — 모든 기능은 관리자 화면에서 끝나야 한다

**이 제품의 최종 사용자는 납품받은 일반 사용자입니다. 프로그램을 직접 다루거나 프로그램적 입력을 할 수 없는 사람입니다.**

따라서 다음을 **모든 개발의 전제**로 삼습니다.

- **기능은 관리자 화면(UI)에서 완결되어야 합니다.** 운영에 필요한 작업 중 "터미널에서 스크립트를 돌려야 하는 것"이 남아 있으면 그 기능은 **미완성**입니다. 개발자가 대신 해 줄 수 있다는 전제를 두지 마세요.
- **일회성 스크립트로 데이터를 미리 만들어 두지 마세요.** 로컬 검증 편의로 데이터를 채워 두면 지금 이 인스턴스만 동작하고, **납품되는 다른 몰에서는 그 상태가 존재하지 않습니다.** "여기선 되는데 고객 몰에선 안 되는" 기능이 됩니다.
  - 예: 상품에 네이버 카테고리를 스크립트로 일괄 지정 ❌ → 관리자 화면의 [일괄 지정] 버튼으로 사용자가 직접 ⭕
- **JSON·코드·식별자를 사용자에게 입력시키지 마세요.** 구조화된 값이 필요하면 **선택·검색·조회 UI** 로 받고, 조립은 서버가 합니다. 관리자 화면에 JSON textarea 를 새로 만들지 않습니다. (사례: `docs/사이트개선/네이버_스마트스토어_연동.md` §6.4)
- **외부 코드값은 자유 입력 대신 select 로** 받습니다(택배사 코드, 카테고리 ID 등). 오타 하나가 외부 API 400 으로 돌아옵니다.
- 다른 화면에 이미 입력한 값은 **자동으로 가져옵니다**(예: A/S 전화 ← 사이트 설정). 같은 내용을 두 번 적게 하지 않습니다.
- 마이그레이션 SQL(`scripts/migrate_*.sql`)처럼 **스키마·카탈로그를 배포에 싣는 것은 예외**입니다. 이건 제품의 일부이지 운영 데이터가 아닙니다. 반대로 **몰별 운영 데이터를 스크립트로 넣는 것은 금지**입니다.
- **테스트 데이터는 사용자가 "테스트 데이터 만들어줘"라고 명시적으로 요청할 때만 생성합니다.** 요청받지 않았다면 개발·검증 편의로도 만들지 않습니다. 기능이 "데이터가 하나도 없는 상태"에서 정상 동작하는지가 곧 납품 가능 여부이므로, 빈 상태로 동작하는 것을 먼저 확인하세요.
  - 요청받아 만든 테스트 데이터도 **어떤 테이블에 무엇을 몇 건 넣었는지 보고**하고, 지울 방법을 함께 알려 주세요.

> 검증이 필요해 개발 중 임시로 데이터를 넣었다면 **반드시 원복**하고, 그 사실을 보고하세요.

### 외부 연동 테스트 규모 제한 (중요)

외부몰(네이버 스마트스토어 등)에 **실제로 등록·전송하는 테스트는 1건이 기본이며, 여러 건이 필요해도 최대 5건까지만** 합니다.

- **대량 등록 테스트는 하지 않습니다.** 되돌리는 비용이 크고(상품 삭제·검수 이력), 외부 호출 한도를 태웁니다.
- 대량 처리 로직은 코드 검증·드라이런으로 확인하고, 실전송은 소량으로만 확인합니다.
- 읽기(GET) 호출은 이 제한의 대상이 아닙니다.

## 프로젝트 개요

**yd-mall** — 건강식품 전문 B2C 이커머스 쇼핑몰(국내향)을 표준 예시로 삼는 몰 빌더. Node.js/Express 5 기반의 서버사이드 렌더링(EJS) 풀스택 애플리케이션으로, 고객 쇼핑 인터페이스와 관리자 백오피스를 함께 제공합니다. **이 저장소는 yd-mall 단독 프로젝트**입니다(서브프로젝트 없음).

상품·카테고리·재고·이미지의 **소스 오브 트루스**는 이 앱의 DB(`yd_mall` @ MySQL)입니다. 과거 이 몰을 원천으로 삼아 Shopify 스토어(`ydatasvcmall.myshopify.com`)로 상품을 push 하고 주문·재고를 Webhook 으로 pull 하는 해외몰 연동 데모가 함께 구성됐고, 그 **연동 코드는 `services/shopify/` 에 그대로 살아 있으나 현재는 꺼져 있습니다**(아래 [Shopify 연동](#shopify-연동-현재-비활성) 참고). 당시 Shopify 스토어를 소비하던 헤드리스 프론트·자체 관리자는 **별도 저장소**이며 이 저장소에는 없습니다.

## 저장소 운영 정책

- **이 저장소는 비공개(private) 저장소입니다.** 그래서 `.env` 계열과 아래 접속 정보를 문서·git 으로 공유합니다.
- `.env`, `.env.development`, `.env.production` 은 **git 으로 추적**합니다(`.gitignore` 에서 `!` 로 해제). 개인용 로컬 오버라이드(`.env.local`, `.env.*.local`)는 추적하지 않습니다.
- `.env` 안의 `DB_PASS` / `REDIS_PASSWORD` 는 **AES-256-GCM 으로 암호화**되어 `ENC:` 접두어로 저장됩니다. 평문이 아닙니다.
- 비공개 저장소라도 외부 공개로 전환하거나 fork 할 경우 시크릿이 노출되므로 주의하세요.
- **커밋 메시지는 한국어로 작성합니다.**

### 브랜치 · 배포 (중요)

- 브랜치는 **`main` 하나**입니다.
- `git push origin main` → `.github/workflows/deploy.yml` (GitHub Actions) → 개발 서버 `/data/yd-mall` 에서 `git reset --hard origin/main` 후 `./yd-mall.sh build && ./yd-mall.sh start`.
- 즉 **푸시 = 즉시 개발 서버 반영**입니다(상용 배포 아님). 그래도 푸시는 사용자가 명시적으로 요청할 때만 수행하세요.
- **DB 는 로컬·서버 공용 한 벌입니다**(`yd_mall` @ ydata.co.kr). 로컬에서 돌린 검증 스크립트가 넣은 테스트 행도 그대로 남으니 쓰기 작업은 신중히. 다만 이는 **개발 데이터**이지 상용 데이터가 아닙니다.

## 기술 스택

- **Runtime**: Node.js 22 (배포 서버는 `yd-mall.sh` 가 nvm 으로 22 선택)
- **Framework**: Express 5.x (MVC 패턴)
- **Database**: MySQL 8.4 (mysql2, ORM 없이 raw SQL + connection pool)
- **Template**: EJS + express-ejs-layouts
- **Styling**: Tailwind CSS 4.x (`@tailwindcss/cli`)
- **Auth**: 고객은 Passport.js — 자체 가입(이메일+비밀번호, bcrypt) + 소셜 OAuth(Google, Kakao, Naver) / 관리자는 자체 세션 + bcrypt + 선택적 이메일 2FA
- **Session**: Redis (`REDIS_HOST` 설정 시) / MemoryStore 폴백
- **Payment**: Toss Payments (SDK 없이 `fetch` 로 REST 직접 호출)
- **Email**: nodemailer (Gmail 앱 비밀번호 / SMTP)
- **AI**: OpenAI API (상품 설명·메타 생성, 선택적)
- **Image**: sharp (리사이즈·재압축), multer (업로드)
- **Process Manager**: PM2 (**fork 모드, `instances: 1`** — cluster 아님)

## 실행

> **포트는 로컬·배포 서버 모두 3006 입니다.** (`.env` 의 `PORT=3000` 은 환경별 파일이 항상 덮어씀)
> **환경 파일 로딩**(`config/env.js`): `.env`(공통 기본값) 로드 후 `NODE_ENV` 에 따라 `.env.development` 또는 `.env.production` 을 **override** 로 덮어씀. 공통값은 `.env`, 환경별 차이는 각 파일에 둔다.
> **`ENCRYPTION_KEY` 가 없으면 앱이 기동하지 않습니다.** `.env` 의 `ENC:` 값을 복호화하지 못하면 `config/env.js` 가 `process.exit(1)` 합니다. 키는 `/etc/environment` 에 있습니다.

```bash
# 개발 (Tailwind watch + nodemon 동시 실행, 권장)
npm run dev:all

# 개발 (서버만)
npm run dev

# CSS 빌드 / 감시 모드
npm run build:css
npm run watch:css

# production 모드 실행 (NODE_ENV=production — 배포 서버 기동용 플래그일 뿐, 상용 환경 아님)
npm run start:prod

# PM2 (ecosystem.config.cjs, fork 모드)
npm run pm2:start          # NODE_ENV=production
npm run pm2:start:dev      # NODE_ENV=development

# 배포 서버에서 쓰는 통합 스크립트 (ENCRYPTION_KEY 자동 로드 + nvm 22)
./yd-mall.sh build        # npm install + Tailwind 빌드
./yd-mall.sh start        # PM2 기동/갱신
./yd-mall.sh status | logs | restart | stop

# DB 초기화 (스키마 + 시드)
npm run init:db
```

일회성 검증 스크립트를 돌릴 때는 `/etc/environment` 를 먼저 source 해야 하고(`ENCRYPTION_KEY`), `await require('./scripts/_bootstrap')()` 를 먼저 호출해야 합니다. 부트스트랩 없이 실행하면 `isShopifySyncEnabled()` 가 fail-open 으로 `true` 가 되어 **실제 Shopify API 를 호출**합니다. 파일명은 `_` 로 시작하면(`.gitignore` 의 `/_*`) 추적되지 않습니다.

```bash
set -a; . /etc/environment; set +a; node _tmp.js
```

## 환경 변수 / 설정 관리

설정은 **두 층**입니다.

1. **`.env` 계열** — 서버·DB·Redis 접속 정보만. `PORT`, `MAX_UPLOAD_FILE_MB`, `DB_*`, `REDIS_*`, (상용) `FORCE_HTTPS`.
2. **DB `system_settings` 테이블** — 그 외 전부. 앱 기동 시 `config/systemSettings.js` 의 `loadSystemSettingsAndApplyEnv()` 가 읽어 `global.systemSettings` 에 담고, 매핑된 키를 **`process.env` 에 덮어씁니다**(빈 값은 건너뜀). 관리자 `/admin/settings`·`/admin/sys-settings` 에서 수정 가능.

`system_settings` 가 주입하는 것들: `SESSION_SECRET`, `TINYMCE_KEY`, `SHOPIFY_*`(8종), `OPENAI_*`, `GOOGLE_*`/`KAKAO_*` OAuth, `SMTP_*`, `TOSSPAYMENTS_*`.

> 따라서 코드 안의 `process.env.X || '기본값'` 폴백은 `system_settings` 에 값이 있으면 **쓰이지 않습니다**. 예: `adminClient.js` 의 폴백 `'2025-01'` 은 DB 의 `shopify_api_version=2026-04` 에 가려집니다.

## DB 접근 규칙

- **DB 조회/조작 시 반드시 `mysql` CLI 클라이언트(mysql-client)를 사용**할 것 (node mysql2 직접 실행 금지)
- `yd_mall` (@ydata.co.kr) 이 이 프로젝트의 DB이자 소스 오브 트루스입니다. **로컬·배포 서버 공용 한 벌**(49개 테이블) — 전부 개발 데이터입니다.

```bash
mysql -h ydata.co.kr -u ydatasvc -p'NEWtec4075@@' yd_mall
# 단발 쿼리
mysql -h ydata.co.kr -u ydatasvc -p'NEWtec4075@@' yd_mall -e "SELECT ... ;"
```

> `.env` 에는 이 비밀번호가 `ENC:` 로 암호화되어 있습니다. 위 평문은 CLI 접속 편의를 위해 여기에만 기재합니다.

### 테스트용 관리자 로그인 (`/admin/login`)

| 구분 | 값 |
|------|-----|
| URL | `http://localhost:3006/admin/login` |
| 아이디 | `tracer999` |
| 비밀번호 | `NEWtec4075@@` |
| 권한 | `super_admin`, 2FA 미사용(바로 로그인) |

> `admin2`, `bsfkorea` 계정도 `super_admin` 입니다(비밀번호 별도 관리). 비밀번호는 `admins` 테이블에 bcrypt(rounds=10)로 저장됩니다. 2FA 를 켠 계정은 `admin_verification_codes` 에 6자리 코드를 저장하고 이메일로 발송(5분 유효)합니다.

## 프로젝트 구조

```
app.js                    # Express 진입점 (미들웨어 파이프라인 + /shopify/webhooks raw body 캡처)
config/
  db.js                   # MySQL 커넥션 풀
  env.js                  # .env → .env.{env} 순차 로딩 + ENC: 복호화 (키 없으면 즉시 종료)
  passport.js             # Local + OAuth 전략 (Google, Kakao, Naver) — 키 없으면 소셜 전략 미등록
  systemSettings.js       # system_settings 테이블 → global.systemSettings + process.env
shared/
  crypto.js               # AES-256-GCM 암복호 (ENC: 접두어 처리)
controllers/              # 고객 13개
  mainController · productController · cartController · checkoutController
  mypageController · likeController · boardController · brandController
  csController · inquiryController · noticeController · sectionController · termsController
controllers/admin/        # 관리자 21개
  authController · dashboardController · productController · categoryController
  couponController · orderController · userController · noticeController · bannerController
  pointController · policyController · operatorController · settingsController
  pageBuilderController · featureMenuController · menuController
  salesController · shippingController · shopifyOrderController · visitorController · inquiryController
routes/                   # 고객 라우트 + routes/admin/ 하위 22개 관리자 서브라우트
middleware/               # 14개 — 아래 미들웨어 체인 참고
services/
  auth/                   # 가입 공통 계층 — authProviders(소셜 활성 판정) · profileService(상세정보) · policyService(약관)
  emailService.js         # SMTP 발송
  faviconService.js       # png → ico
  display/                # SDUI 렌더 엔진 (섹션 조립, 페이지 빌더, 배너, 상품그룹, HTML 새니타이즈)
    resolvers/            # 섹션 리졸버 12종 (hero, product_grid, ranking_tabs, custom_html …)
  menu/navigationService.js   # 스토어프론트 내비게이션(GNB/우측레일/헤더유틸) 조립
  shopify/                # Shopify 연동 (현재 비활성 — 아래 참고)
  theme/themeService.js   # 활성 테마 토큰
  tree/depthGuard.js      # 카테고리 계층 뎁스·순환참조 가드
views/                    # EJS — user/ admin/ auth/ layouts/ partials/ manual/
public/
  css/input.css           # Tailwind 소스 → css/style.css (빌드 결과)
  uploads/                # 상품 이미지 업로드
scripts/                  # init_db.js, migrate_*.js, seed_*.js, shopify-*.js, encrypt.js, _bootstrap.js
docs/                     # 개발 문서 + 온라인 매뉴얼 소스 + 사이트개선 계획서
tables.sql                # DB 스키마 (42개 테이블 — 실제 DB 49개와 차이 있음)
ecosystem.config.cjs      # PM2 설정 (fork, instances: 1)
yd-mall.sh               # 배포 서버 배포/기동 스크립트
```

## 아키텍처 패턴

- **MVC**: routes → controllers → DB(raw SQL) → views(EJS)
- **미들웨어 체인** (`app.js`): `/shopify/webhooks` raw body 캡처 → body parser → cookie parser → static → `X-Robots-Tag: noindex` → EJS layouts → *(startServer)* `system_settings` 로드 → session → passport → access log(`logs/access.log`) → 전역 변수 → `siteSettings` → `themeData` → `shopifyFlag` → `visitorLogger` → `pageViewLogger` → `menuData` → `cartData` → `seoDefaults` → `shopifyContext` → routes → 404 → 에러 핸들러
- **관리자 접근 제어**: `/admin` 마운트 시 `adminMenu`(DB 기반 사이드바 메뉴 트리) → `adminAuth`(세션 체크) → 라우트별 `requireMenuAccess(path)`(`admin_menus.visible_roles` CSV 기반 RBAC)
- **SDUI**: `page` / `page_section` 테이블의 섹션 정의를 `services/display/` 가 조립해 렌더. 섹션 타입 ↔ 뷰 ↔ 관리자 설정폼 스키마는 `sectionRegistry.js` 가 관장하고, 실제 데이터는 `resolvers/` 12종이 채움
- **메뉴 아키텍처**: `feature_menu`(전역 카탈로그) → `mall_feature_menu`(몰별 on/off·순서 오버라이드) + `custom_menu`(자유 메뉴) + `navigation_config`(헤더 레이아웃·`category_max_depth`)
- **SEO**: 상품 slug URL(`/products/{slug}`), JSON-LD, OG 태그. 단 `seoDefaults` 가 **전역 `noindex,nofollow`** 를 강제하는 테스트 서버 상태
- **이미지 업로드**: multer → `public/uploads/` 로컬 저장

## 코드 컨벤션

- **DB 컬럼**: snake_case (`created_at`, `user_id`)
- **URL 경로**: kebab-case (`/admin/site-settings`)
- **JS 파일/변수**: camelCase (`productController.js`)
- **SQL**: 파라미터화된 쿼리 (`pool.query('SELECT * FROM x WHERE id = ?', [id])`)
- **비동기**: async/await + try-catch
- **트랜잭션**: 결제 처리 등 정합성이 필요한 곳
- **컨트롤러 액션명**: `get*` = 조회/폼 렌더, `post*` = 변경. 가장 흔한 조합은 `getList` / `getDetail` / `getAdd` · `getEdit` / `postAdd` · `postEdit` / `postDelete`. 다만 도메인 동사형(`createPolicy`, `deleteUser`, `updateStatus`, `saveMenus`)도 병존하므로, **새 코드는 수정 중인 컨트롤러의 기존 규칙을 따르세요.**

## DB 스키마

전체 49개 테이블. **그룹별 목록은 [`README.md`](./README.md) 6장** 참고. 여기서는 스키마를 건드릴 때 반드시 알아야 할 것만 적습니다.

> ⚠️ **스키마 드리프트.** `tables.sql` 은 42개만 정의해 실제 DB(49개)와 어긋납니다. 누락: `shopify_*` 3종, `product_recommendations`, `product_seo`, `recent_views`, `kakao_inquiry_logs`. 또한 `categories.shopify_collection_id` 와 `shopify_product_mappings.shopify_inventory_item_id` 는 코드가 사용하지만 **저장소의 어떤 SQL 에도 정의가 없습니다**(운영 DB 에만 존재).

`categories` 는 `type` enum(`NORMAL` 10 / `THEME` 2 / `BRAND` 25 = 37행)과 `parent_id`·`depth` 로 최대 3뎁스 계층을 지원합니다(현재 데이터는 전부 depth 1). 계층 무결성은 애플리케이션이 지켜야 하며(`services/tree/depthGuard.js`), 아래 3가지는 반드시 유지하세요.

| 위험 | 막지 않으면 | 처리 |
|---|---|---|
| 뎁스 초과 | 4단계 이상 생성 | `assertDepthAllowed` (MySQL CHECK 로는 `부모.depth + 1` 검증 불가) |
| 순환 참조 | `recalcSubtreeDepth` BFS 가 DB 오염 후 예외 | `wouldCreateCycle` 을 **UPDATE 전에** 호출 |
| 부모 삭제 | `parent_id` 가 `ON DELETE SET NULL` → 자식이 조용히 최상위 승격 + `depth` 불일치 | 자식 있으면 삭제 차단 |

## Shopify 연동 (현재 비활성)

`system_settings.shopify_sync_enabled = 0` 입니다. `middleware/shopifyFlag.js` 가 UI 노출을 끄고, 실제 동작 차단은 `syncService.isShopifySyncEnabled()` 가드(+ `categorySync.withSyncGuard`)가 담당합니다. **라우트·웹훅·서비스 코드는 전부 살아 있고**, 매핑 데이터도 적재된 상태입니다(상품 314건 전건).

> ⚠️ **가드는 fail-open 입니다.** `SHOPIFY_SYNC_ENABLED` 가 미설정/빈 값이면 `true`(활성)로 간주하며 `'0' | 'false' | 'off' | 'no'` 만 비활성입니다. 일회성 스크립트에서 `scripts/_bootstrap.js` 를 먼저 호출하지 않으면 **실제 Shopify API 를 호출**합니다.

연동 흐름·API 버전·operation 표·운영 스크립트 목록은 [`README.md`](./README.md) 7장 참고.

## 인프라

역방향 프록시(SSL 종료)는 별도 Nginx 서버(192.168.1.2)가 담당합니다. 애플리케이션 서버는 192.168.1.4(`/data/yd-mall`)입니다.

```bash
# Nginx 서버 접속 — 외부에서
ssh tracer999@ydata.co.kr -p 10022
# 패스워드: NEWtec4075@!
# 내부에서(앱 서버 192.168.1.4 에서만)
ssh tracer999@192.168.1.2
```

| 도메인 | 프록시 대상 | 설정 파일 |
|--------|------------|-----------|
| `https://dev-mall.ydata.co.kr` | `http://192.168.1.4:3006` | `/etc/nginx/sites-enabled/dev-mall.ydata.co.kr.conf` |

SSL 은 와일드카드 인증서(`/data/ssl_cert/ydata.co.kr_2026/_wildcard_.ydata.co.kr_2026.all.crt.pem`). 프록시 헤더 `Host`·`X-Real-IP`·`X-Forwarded-For`·`X-Forwarded-Proto`·`Upgrade`·`Connection` 전달, `client_max_body_size 100M`. 앱은 `app.set('trust proxy', 1)` 로 이를 신뢰합니다.

## 문서

| 경로 | 내용 |
|------|------|
| [`README.md`](./README.md) | 전체 레퍼런스 — 기능·라우트·Shopify API 명세·DB |
| `docs/team/session.md` | **세션 인계 파일**. 세션 시작 시 먼저 읽고, 종료 시 최신 내용으로 전면 교체 |
| `docs/사이트개선/네이버_스마트스토어_연동.md` | **네이버 스마트스토어 연동 단일 관리 문서** — 인증·상품등록·호출제한·고시·매핑·운영. 네이버 관련 내용은 전부 여기에 누적한다 |
| `docs/사이트개선/admin_dev_plan.md` | 관리자 개선 계획서 (A·B 트랙) |
| `docs/사이트개선/frontend_dev_plan.md` | 프론트 개선 계획서 |
| `docs/manual/` | 온라인 매뉴얼 소스(마크다운) — `/manual` 라우트가 `marked` 로 렌더 |
| `docs/develop_guide/{admin,user}/` | 개발자 문서 (화면별) |
| `docs/design_guide_admin.md`, `docs/design_guide_user.md` | 디자인 가이드 |

## 테스트

테스트 프레임워크 미설정. 수동 테스트 방식:

- `/admin/design-guide` (UI 컴포넌트 프리뷰)
- 브라우저 개발자 도구 + Postman
- 라우트 스모크: `node -e 'const h=require("http");["/","/products","/admin/categories"].forEach(p=>h.get({host:"127.0.0.1",port:3006,path:p},r=>console.log(r.statusCode,p)))'`

## 주의사항

- **이 프로젝트에 상용 배포는 없습니다.** 모든 단계가 개발이며, 사용자가 명시적으로 "상용 적용"을 요청하기 전까지 상용 전제를 두지 않습니다.
- **푸시 = 즉시 개발 서버 반영.** 로컬과 서버가 같은 DB 를 봅니다(둘 다 개발 데이터).
- `ENCRYPTION_KEY`(`/etc/environment`) 없으면 앱이 기동하지 않습니다.
- `system_settings` 값이 `.env` 값을 오버라이드합니다.
- PM2 는 fork·`instances: 1`. cluster 로 늘리려면 Redis 세션이 필수입니다(`app.js` 가 경고).
- `isShopifySyncEnabled()` 는 fail-open 입니다. 스크립트에서 `scripts/_bootstrap.js` 를 먼저 호출하세요.
- 상품 이미지는 로컬 파일 시스템(`public/uploads/`)에 저장됩니다.
- 커밋 메시지는 한국어로 작성합니다.
