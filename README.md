# yd-mall — 자체 쇼핑몰

건강식품 전문 B2C 이커머스 쇼핑몰. Node.js/Express 기반의 서버사이드 렌더링(EJS) 풀스택 애플리케이션으로, 고객 쇼핑 인터페이스와 관리자 백오피스를 함께 제공합니다.

- 운영: <https://dev-mall.ydata.co.kr>
- 작업 지침(Claude Code 용): [`CLAUDE.md`](./CLAUDE.md)
- 세션 인계: [`docs/team/session.md`](./docs/team/session.md)

---

## 1. 개요 / 역할

**이 저장소는 yd-mall 단독 프로젝트입니다.** 서브프로젝트나 워크스페이스가 없고, `app.js` 가 곧 진입점입니다.

상품·카테고리·재고·이미지의 **소스 오브 트루스(Source of Truth)** 는 이 앱의 DB(`yd_mall` @ MySQL)입니다. 여기에 더해, 국내몰을 원천으로 삼아 해외향 Shopify 스토어(`ydatasvcmall.myshopify.com`)를 여는 시나리오의 **연동 코드가 관리자에 내장**되어 있습니다.

- **push** — 관리자에서 상품/카테고리를 저장하면 백그라운드로 Shopify 에 상품(`productSet`)·재고·미디어·컬렉션을 밀어 넣고 GID 를 매핑 테이블에 기록합니다.
- **pull** — Shopify 의 주문·재고 변동을 Webhook 으로 받아 `shopify_orders` 저장과 `products.stock` 역동기화를 수행합니다.

> **현재 Shopify 동기화는 꺼져 있습니다** (`system_settings.shopify_sync_enabled = 0`). 코드·라우트·웹훅은 모두 살아 있고 매핑 데이터도 적재된 상태이며, 스위치만 내려간 상태입니다. 자세한 내용은 [7장](#7-shopify-연동-현재-비활성).
>
> 과거 이 Shopify 스토어를 소비하던 헤드리스 고객몰과 자체 관리자는 **별도 저장소**로, 이 저장소에는 없습니다. yd-mall 과는 코드 의존 없이 Shopify 스토어를 매개로 간접 연결됩니다.

---

## 2. 기술 스택

| 구분 | 기술 | 버전 (package.json 기준) |
|------|------|------|
| Runtime | Node.js | **22** (운영 서버는 `yd-mall.sh` 가 nvm 으로 선택) |
| Framework | Express | ^5.2.1 |
| Template | EJS + express-ejs-layouts | ^4.0.1 / ^2.5.1 |
| Styling | Tailwind CSS (CLI) | ^4.1.18 |
| DB | MySQL 8.4 (mysql2, raw SQL + pool) | mysql2 ^3.16.3 |
| Session | express-session + connect-redis / redis | ^1.19.0 / ^9.0.0 / redis ^5.10.0 |
| Auth | Passport (자체 가입 + Google/Kakao/Naver OAuth) | passport ^0.7.0, passport-local ^1.0.0, passport-google-oauth20 ^2.0.0, passport-kakao ^1.0.1, passport-naver-v2 ^2.0.8 |
| 비밀번호 | bcrypt (관리자 계정) | ^6.0.0 |
| Email | nodemailer | ^8.0.0 |
| 이미지 처리 | sharp (리사이즈·재압축) | ^0.34.5 |
| 파일 업로드 | multer | ^2.0.2 |
| 에디터 | tinymce | ^8.4.0 |
| AI (선택) | openai | ^6.18.0 |
| 기타 | marked, sitemap, ua-parser-js, cookie-parser, sanitize-html, png-to-ico | — |
| 개발 | nodemon, concurrently, cross-env, @tailwindcss/cli | — |
| 프로세스 관리 | PM2 (**fork 모드, `instances: 1`**) | 외부 설치 |

- **결제(Toss Payments)와 Shopify 연동 모두 SDK 없이 `fetch` 로 REST/GraphQL 을 직접 호출**합니다(의존성에 `@shopify/*`·toss 관련 패키지 없음).

---

## 3. 실행 방법

### 3.1 설치

```bash
npm install
npm run build:css
```

### 3.2 환경변수 — 두 개의 층

**층 1 — `.env` 계열** (git 추적됨, 비공개 저장소)

`config/env.js` 가 `.env`(공통 기본값)를 먼저 로드한 뒤 환경별 파일로 **override** 합니다.

| 파일 | 로드 조건 | 주요 값 |
|------|----------|--------|
| `.env` | 항상 (먼저) | `PORT=3000`, `MAX_UPLOAD_FILE_MB`, `DB_*`, `REDIS_*` |
| `.env.development` | 기본 | `PORT=3006` |
| `.env.production` | `NODE_ENV=production` | `PORT=3006`, `FORCE_HTTPS=true` |

> **포트는 개발·상용 모두 3006 입니다.** `.env` 의 `PORT=3000` 은 항상 환경별 파일이 덮어씁니다.
>
> **`DB_PASS` / `REDIS_PASSWORD` 는 AES-256-GCM 으로 암호화**되어 `ENC:` 접두어로 저장됩니다. 복호화 키 `ENCRYPTION_KEY` 는 `/etc/environment` 에 있으며, **없으면 `config/env.js` 가 `process.exit(1)`** 합니다(`shared/crypto.js`, `scripts/encrypt.js`).

**층 2 — DB `system_settings` 테이블** (그 외 전부)

앱 기동 시 `config/systemSettings.js` 의 `loadSystemSettingsAndApplyEnv()` 가 이 테이블을 읽어 `global.systemSettings` 에 담고, 매핑된 키를 **`process.env` 에 주입**합니다(빈 값은 건너뜀). 관리자 `/admin/settings`·`/admin/sys-settings` 에서 수정할 수 있습니다.

| 도메인 | 주입되는 환경변수 |
|--------|------------------|
| 세션 | `SESSION_SECRET` |
| 에디터 | `TINYMCE_KEY` |
| Shopify | `SHOPIFY_SYNC_ENABLED`, `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_STOREFRONT_API_TOKEN`, `SHOPIFY_API_VERSION`, `SHOPIFY_LOCATION_ID`, `SHOPIFY_WEBHOOK_BASE_URL` |
| AI | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_TIMEOUT_MS` |
| OAuth | `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_CALLBACK_URL_DEV/PROD`, `CALLBACK_URL`, `KAKAO_CLIENT_ID/SECRET`, `KAKAO_CALLBACK_URL_DEV/PROD`, `KAKAO_JS_KEY` |
| 메일 | `SMTP_HOST`, `SMTP_PORT`, `SMTP_IS_GMAIL`, `SMTP_APP_PASSWORD`, `SMTP_PASSWORD`, `SMTP_SENDER_EMAIL` |
| 결제 | `TOSSPAYMENTS_CLIENT_KEY`, `TOSSPAYMENTS_SECRET_KEY` |

> 결과적으로 코드의 `process.env.X || '기본값'` 폴백은 DB 에 값이 있으면 **쓰이지 않습니다.**

### 3.3 구동 명령

```bash
# 개발: Tailwind watch + nodemon 동시 실행 (권장)
npm run dev:all

# 개발: 서버만
npm run dev

# CSS 빌드 / 감시
npm run build:css
npm run watch:css

# 상용 실행 (NODE_ENV=production)
npm run start:prod

# PM2 (ecosystem.config.cjs — fork, instances: 1)
npm run pm2:start          # NODE_ENV=production
npm run pm2:start:dev      # NODE_ENV=development
npm run pm2:restart

# DB 초기화 (스키마 + 시드)
npm run init:db
```

운영 서버에서는 `yd-mall.sh` 를 씁니다. `/etc/environment` 에서 `ENCRYPTION_KEY` 를 직접 읽고 nvm 22 를 로드하므로, PAM 을 거치지 않는 CI/CD SSH 세션에서도 동작합니다.

```bash
./yd-mall.sh build          # npm install + Tailwind 빌드
./yd-mall.sh start          # PM2 기동/갱신 (상용)
./yd-mall.sh start dev      # 개발 모드로 기동
./yd-mall.sh status | logs | restart | stop | delete
```

### 3.4 일회성 스크립트 실행

```bash
set -a; . /etc/environment; set +a; node _tmp.js
```

- `/etc/environment` 를 source 하지 않으면 `ENCRYPTION_KEY` 가 없어 기동 실패합니다.
- 스크립트는 **`await require('./scripts/_bootstrap')()` 를 먼저 호출**해야 합니다. 이걸 빠뜨리면 `isShopifySyncEnabled()` 가 fail-open 으로 `true` 가 되어 **실제 Shopify API 를 호출**합니다.
- 파일명을 `_` 로 시작하면 `.gitignore` 의 `/_*` 규칙으로 추적되지 않습니다. 작업 후 삭제하세요.

---

## 4. 폴더 / 코드 구조

```
app.js                 # Express 진입점. 미들웨어 파이프라인 + /shopify/webhooks raw body 캡처
config/
  db.js                # MySQL 커넥션 풀
  env.js               # .env → .env.{env} 순차 로딩 + ENC: 복호화
  passport.js          # Local + Google/Kakao/Naver OAuth (키 없으면 소셜 전략 미등록)
  systemSettings.js    # system_settings → global.systemSettings + process.env
shared/crypto.js       # AES-256-GCM 암복호 (ENC: 접두어)
controllers/           # 고객 13개 + admin/ 관리자 21개
routes/                # 고객 라우트 + admin/ 관리자 서브라우트 22개
middleware/            # 14개 (5.3 참고)
services/
  emailService.js      # SMTP 발송
  faviconService.js    # png → ico
  display/             # SDUI 렌더 엔진 + resolvers/ 섹션 리졸버 12종
  menu/                # navigationService — 스토어프론트 내비게이션 조립
  shopify/             # Shopify 연동 10개 모듈 (7장)
  theme/               # themeService — 활성 테마 토큰(60초 캐시)
  tree/                # depthGuard — 카테고리 뎁스·순환참조 가드
views/                 # EJS — user/ admin/ auth/ layouts/ partials/ manual/
public/
  css/input.css        # Tailwind 소스 → css/style.css
  uploads/             # 상품 이미지
scripts/               # init_db.js, migrate_*.js, seed_*.js, shopify-*.js, encrypt.js, _bootstrap.js
docs/                  # 개발 문서 + 매뉴얼 소스 + 계획서
tables.sql             # DB 스키마 (42개 — 실제 49개와 차이 있음, 6장 참고)
ecosystem.config.cjs   # PM2 설정
yd-mall.sh            # 배포/기동 스크립트
.github/workflows/deploy.yml
```

---

## 5. 기능

### 5.1 고객 라우트

| URL | 파일 | 기능 |
|-----|------|------|
| `/` | `routes/index.js` | 홈, `/search` 검색, 카카오 클릭/문의/체류시간 추적 API |
| `/products` | `routes/products.js` | 상품 목록, 카테고리·브랜드별 목록, 상세(`/:slug`, `/view/:id`) |
| `/brands` | `routes/brands.js` | 브랜드 목록 |
| `/best`, `/new`, `/deal/today`, `/event` | `routes/feature.js` | 기능 메뉴 표준 URL (`productController.getList` 재사용). `/exhibition`·`/group-buy`·`/live` 는 comingSoon |
| `/sections/ranking` | `routes/sections.js` | 스토어프론트 섹션 AJAX (ranking_tabs 탭 데이터) |
| `/cart` | `routes/cart.js` | 장바구니 조회·추가·삭제·수량변경·일괄주문 |
| `/checkout` | `routes/checkout.js` | 주문 폼·생성, 결제창, Toss 성공/실패 콜백, 주문완료 |
| `/auth` | `routes/auth.js` | 로그인(이메일·비밀번호), 자체 가입폼, Google/Kakao/Naver OAuth 시작·콜백, 가입 후 상세정보, 약관 재동의, Kakao 재인증 |
| `/mypage` | `routes/mypage.js` | 찜/최근본/쿠폰/포인트/주문/프로필/회원탈퇴 (전체 `ensureAuthenticated`) |
| `/likes` | `routes/likes.js` | 상품·브랜드 찜 토글 |
| `/boards` | `routes/boards.js` | 게시판 목록/상세 |
| `/notices`, `/inquiries` | 각 파일 | 공지, 1:1 문의 |
| `/cs` | `routes/cs.js` | 고객센터 인덱스·FAQ |
| `/terms`, `/privacy`, `/about`, `/guide` | `routes/terms.js` | 약관·개인정보·소개·이용안내 |
| `/manual` | `routes/manual.js` | `docs/manual/{admin,user,coding_guide}` 마크다운을 `marked` 로 렌더 |
| `/sitemap.xml` | `routes/sitemap.js` | 사이트맵 |
| `/shopify/*` | `routes/shopify.js` | Webhook 수신 + Markets/Cart API (7장) |

### 5.2 관리자 라우트 (`/admin`)

`adminMenu`(DB 기반 사이드바) → `adminAuth`(세션) → 라우트별 `requireMenuAccess(path)`(RBAC) 순으로 가드됩니다. `/admin/login`·`/admin/logout` 만 `adminAuth` 앞에 있습니다.

| URL | 기능 |
|-----|------|
| `/admin` | 대시보드, 검색로그, 유입경로 드릴다운, 인기상품 |
| `/admin/products` | 상품 CRUD, 이미지 업로드, AI 추천·메타설명 생성, 상태 토글, SEO, Shopify 일괄 동기화 |
| `/admin/categories` | 카테고리 관리 (NORMAL/THEME/BRAND, 최대 3뎁스) |
| `/admin/menus` | 내비게이션 메뉴 관리 |
| `/admin/feature-menus` | GNB·헤더유틸·우측레일 기능 메뉴 on/off·순서 |
| `/admin/page-builder` | 페이지 빌더 (섹션 추가/순서/복제/발행/롤백) |
| `/admin/display` | 진열 — 섹션 상품 편집 |
| `/admin/banners` | 배너 관리 |
| `/admin/sales`, `/admin/shipping` | 매출·주문, 배송(송장) |
| `/admin/users`, `/admin/operators` | 회원 관리, 운영자 관리 |
| `/admin/coupons`, `/admin/points` | 쿠폰 발급·사용내역, 포인트 지급/차감 |
| `/admin/notices`, `/admin/inquiries` | 공지, 문의 답변 |
| `/admin/policies` | 정책(약관) 버전 관리 |
| `/admin/visitors` | 방문자 통계 |
| `/admin/settings`, `/admin/site-settings`, `/admin/sys-settings` | 설정 / 사이트 설정 / 시스템 설정 |
| `/admin/uploads` | TinyMCE 이미지 업로드 |
| `/admin/design-guide` | UI 컴포넌트 프리뷰 |
| `/admin/shopify-orders` | Shopify 주문 조회 (현재 메뉴 비활성) |

### 5.3 미들웨어 (14개)

| 파일 | 역할 |
|------|------|
| `adminAuth.js` | `req.session.admin` 확인, 없으면 `/admin/login` 리다이렉트 |
| `adminMenu.js` | DB 기반 관리자 사이드바 메뉴 트리(대시보드 + 7그룹, 2뎁스) 주입 |
| `adminRoleGuard.js` | `requireMenuAccess(path)` 팩토리 — `admin_menus.visible_roles` CSV 로 접근 검사 |
| `auth.js` | `ensureAuthenticated` — passport 인증 확인, returnTo 저장 |
| `cartData.js` | 장바구니 수량 합계 → `res.locals.cartCount` |
| `menuData.js` | `navigationService` 기반 GNB/우측레일/헤더유틸 주입 |
| `pageViewLogger.js` | 모든 GET 을 `page_views` 에 기록 |
| `seoDefaults.js` | canonical/robots/OG 기본값. **전역 `noindex,nofollow` 강제** |
| `shopifyContext.js` | 세션 국가/언어 → `res.locals.shopifyMarket` |
| `shopifyFlag.js` | `isShopifySyncEnabled()` → `res.locals.shopifyEnabled` (UI 노출 제어) |
| `siteSettings.js` | `site_settings` + 카테고리 목록 → `res.locals` |
| `themeData.js` | 활성 테마 토큰 → `res.locals.theme` (60초 캐시) |
| `upload.js` | multer 상품 이미지 업로드 (기본 20MB) |
| `visitorLogger.js` | `visited_today` 쿠키로 일 1회 방문 기록 |

**체인 순서** (`app.js`): `/shopify/webhooks` raw body 캡처 → body/cookie parser → static → `X-Robots-Tag` → EJS layouts → *(startServer)* `system_settings` 로드 → session → passport → access log → 전역 변수 → `siteSettings` → `themeData` → `shopifyFlag` → `visitorLogger` → `pageViewLogger` → `menuData` → `cartData` → `seoDefaults` → `shopifyContext` → routes → 404 → 에러 핸들러

### 5.4 인증

**고객 — 자체 가입 + 소셜 OAuth.** 가입 경로는 두 가지입니다.

- **자체 가입** (`passport-local`): `/auth/signup` 한 화면에서 이메일·비밀번호(bcrypt) + 주문·배송용 상세정보 + 약관 동의를 받고 `is_active=1` 로 생성 후 자동 로그인.
- **간편 가입** (`passport-google-oauth20` / `passport-kakao` / `passport-naver-v2`): 콜백에서 `is_active=0` 으로 생성 → `/auth/signup-finish` 에서 **자체 가입폼과 동일한 상세정보 폼**을 채워야 활성화. 동일 email 계정이 있으면 `google_id`/`kakao_id`/`naver_id` 를 병합합니다.

소셜 전략은 `system_settings` 의 Client ID + 콜백 URL 이 있을 때만 등록되고(`services/auth/authProviders.js`), 같은 판정으로 로그인 화면의 버튼 노출도 결정됩니다. 키를 관리자에서 바꾸면 **재기동 없이** 반영됩니다(라우트 진입 시 전략 재등록).

두 경로의 공통 로직은 `services/auth/`(`profileService` · `policyService`), 공통 화면은 `views/auth/_profile_fields.ejs` · `_terms_agreement.ejs` · `_social_buttons.ejs` 에 모여 있습니다. 상세는 [`docs/develop_guide/user/auth.md`](docs/develop_guide/user/auth.md).

**관리자 — 자체 세션 + 선택적 이메일 2FA.** passport 를 쓰지 않고 `admins` 테이블 + bcrypt 검증 후 `req.session.admin` 에 저장합니다. `admins.use_2fa` 가 켜져 있으면 6자리 코드를 `admin_verification_codes` 에 저장(5분 유효)하고 이메일로 발송합니다. 2FA 가 켜졌는데 이메일이 없으면 로그인이 차단됩니다.

### 5.5 결제 (Toss Payments)

SDK 없이 `fetch` 로 REST 를 직접 호출합니다(`controllers/checkoutController.js`).

- 승인: `POST https://api.tosspayments.com/v1/payments/confirm`
- 취소: `POST https://api.tosspayments.com/v1/payments/{paymentKey}/cancel`
- 인증: `Basic base64(secretKey + ':')`
- 키 소스: `global.systemSettings.tosspayments_*` 우선, 없으면 `process.env.TOSSPAYMENTS_*`
- 흐름: 주문서 → 쿠폰/포인트 적용 → 브라우저에서 Toss JS 위젯 → `/checkout/success`·`/checkout/fail` 콜백 → 주문 `total_amount` 와 `amount` 파라미터 일치 검증 → 재고 검증 → 승인 → 실패 시 자동 취소. 재고 차감은 트랜잭션.

### 5.6 SDUI (서버 주도 UI)

`page` / `page_section` 테이블의 섹션 정의를 `services/display/displayService.js` 가 조립해 렌더합니다. 섹션 타입 ↔ 뷰 ↔ 관리자 설정폼 스키마는 `sectionRegistry.js` 가 관장합니다.

리졸버 12종(`services/display/resolvers/`): `hero`, `value_proposition`, `product_grid`, `category_showcase`, `kakao_cta`, `product_carousel`, `brand_carousel`, `ranking_tabs`, `promotion_banner`, `benefit_bento`, `recent_product`, `custom_html`. (`quick_menu` 는 `config_json` 만으로 렌더되는 정적 섹션이라 리졸버가 없습니다.)

### 5.7 메뉴 아키텍처

`feature_menu`(전역 카탈로그, 23행) → `mall_feature_menu`(몰별 on/off·순서·기간 노출 오버라이드) + `custom_menu`(자유 메뉴) + `navigation_config`(헤더 레이아웃, `category_max_depth=3`). 관리자 백오피스 메뉴인 `admin_menus` 는 이와 별개입니다.

---

## 6. 데이터베이스

MySQL `yd_mall` @ ydata.co.kr — **개발·상용 공용**, 49개 테이블.

```bash
mysql -h ydata.co.kr -u ydatasvc -p'NEWtec4075@@' yd_mall
```

| 그룹 | 테이블 |
|------|--------|
| 사용자/인증 | `users` · `admins` · `admin_verification_codes` · `user_policy_agreements` |
| 상품 | `products` · `product_images` · `product_themes` · `product_group` · `product_group_item` · `product_recommendations` · `product_seo` · `categories` · `theme` |
| 주문/장바구니/배송 | `orders` · `order_items` · `carts` · `shipments` |
| 프로모션/포인트 | `coupons` · `user_coupons` · `point_transactions` |
| 메뉴/네비게이션 | `admin_menus` · `feature_menu` · `mall_feature_menu` · `custom_menu` · `navigation_config` |
| 디스플레이/섹션 | `banners` · `hero_slide` · `page` · `page_section` · `page_revision` |
| 게시판/CS | `notices` · `faq` · `faq_category` · `inquiries` · `reviews` · `likes` · `brand_likes` |
| 설정 | `site_settings`(싱글턴 행) · `system_settings`(key-value) · `policy_versions` |
| 로그/분석 | `page_views` · `visitor_logs` · `recent_views` · `search_logs` · `kakao_click_logs` · `kakao_inquiry_logs` |
| Shopify 연동 | `shopify_product_mappings` · `shopify_orders` · `shopify_image_mappings` |

### 6.1 `categories`

`type` enum(`NORMAL` / `THEME` / `BRAND`)과 `parent_id`·`depth` 로 최대 3뎁스 계층을 지원합니다. 현재 37행(BRAND 25 / NORMAL 10 / THEME 2)이며 전부 `depth=1`, `parent_id IS NULL` 입니다.

계층 무결성은 애플리케이션이 지켜야 합니다(`services/tree/depthGuard.js`).

| 위험 | 막지 않으면 | 처리 |
|---|---|---|
| 뎁스 초과 | 4단계 이상 생성 | `assertDepthAllowed` (MySQL CHECK 로는 `부모.depth + 1` 검증 불가) |
| 순환 참조 | `recalcSubtreeDepth` BFS 가 DB 오염 후 예외 | `wouldCreateCycle` 을 **UPDATE 전에** 호출 |
| 부모 삭제 | `parent_id` 가 `ON DELETE SET NULL` → 자식이 조용히 최상위 승격 + `depth` 불일치 | 자식 있으면 삭제 차단 |

### 6.2 스키마 드리프트 ⚠️

`tables.sql` 은 **42개 테이블만** 정의하고 있어 실제 DB(49개)와 어긋납니다.

- `tables.sql` 누락: `shopify_product_mappings`, `shopify_orders`, `shopify_image_mappings`, `product_recommendations`, `product_seo`, `recent_views`, `kakao_inquiry_logs`
- **저장소의 어떤 SQL 에도 정의가 없는 컬럼** (운영 DB 에만 존재하며 코드가 사용):
  - `categories.shopify_collection_id` — `services/shopify/categorySync.js` 가 읽고 씀
  - `shopify_product_mappings.shopify_inventory_item_id` — `services/shopify/syncService.js` 가 INSERT/UPDATE

스키마를 변경할 때는 이 드리프트를 감안하세요.

---

## 7. Shopify 연동 (현재 비활성)

### 7.1 스위치와 가드

- `system_settings.shopify_sync_enabled = 0` → `process.env.SHOPIFY_SYNC_ENABLED='0'`
- `middleware/shopifyFlag.js` 가 `res.locals.shopifyEnabled` 로 **UI 노출**을 제어
- 실제 **동작 차단**은 `syncService.isShopifySyncEnabled()` 가드와 `categorySync.withSyncGuard()` 래퍼가 담당. 가드가 걸린 함수: `syncProductById`, `syncProductsByIds`, `deleteProductById`, `syncCategoryById`, `deleteCategoryFromShopify` (`backfillCollectionIds` 는 CLI 전용이라 의도적으로 미가드)

> **⚠️ 가드는 fail-open 입니다.** `SHOPIFY_SYNC_ENABLED` 가 미설정/빈 값이면 `true`(활성)로 간주하며, `'0' | 'false' | 'off' | 'no'` 만 비활성입니다. 일회성 스크립트는 `scripts/_bootstrap.js` 로 `system_settings` 를 먼저 로드해야 실수로 실제 API 를 호출하지 않습니다.

적재된 데이터: `shopify_product_mappings` 314행(전 상품), `shopify_image_mappings` 815행, `shopify_orders` 4행.

### 7.2 API 버전 (층이 세 개)

| 층 | 값 |
|----|-----|
| **런타임 실효값** | `system_settings.shopify_api_version` = **`2026-04`** → `process.env.SHOPIFY_API_VERSION` 으로 주입되어 Admin·Storefront 양쪽에 적용 |
| 코드 폴백 | `adminClient.js` → `2025-01`, `storefrontClient.js` → `2026-04` (env 가 있으면 안 쓰임) |
| 하드코딩 | `syncService.js` 의 재고 mutation 전용 `adminQuery2025` 가 URL 에 `2025-01` 고정 (`scripts/shopify-sync-products.js` 도 동일) |

두 클라이언트 모두 요청 시점에 `process.env` 를 읽으므로, DB 값을 바꾸면 재기동 후 반영됩니다.

### 7.3 `services/shopify/` 모듈

| 파일 | 역할 |
|------|------|
| `index.js` | 통합 진입점 (re-export) |
| `adminClient.js` | Admin GraphQL 클라이언트. Client Credentials 토큰 발급·캐시(24h, 만료 60초 전 갱신) |
| `storefrontClient.js` | Storefront GraphQL 클라이언트. 비공개 토큰 + Markets 헤더 |
| `syncService.js` | 상품 push 동기화(생성/업데이트/삭제, 재고, source metafield) + `isShopifySyncEnabled` |
| `categorySync.js` | 카테고리 → Smart Collection 동기화 + `withSyncGuard` |
| `imageUploader.js` | 설명 본문 이미지 → Shopify Files(CDN) 이관 |
| `productService.js` | Storefront 상품 조회(`@inContext` 현지 가격) |
| `cartService.js` | Storefront Cart 생성/라인 수정/조회 → `checkoutUrl` |
| `marketsService.js` | Storefront `localization` 조회(10분 캐시) + 국가 유효성 검사 |
| `webhookHandler.js` | HMAC 검증 + 토픽별 처리 |

### 7.4 상품 push 동기화 (`syncService.js`)

- 관리자에서 상품을 등록/수정하면 백그라운드로 `syncProductById(productId)` 실행(상품 저장 성공에는 영향 없음, 실패는 로그만).
- `productSet`(synchronous)으로 생성 또는 업데이트. 매핑 존재 여부로 신규/갱신 판별.
- 신규: `inventoryActivate` → `inventorySetOnHandQuantities` → 매핑 INSERT. 갱신: 재고 재설정 → 매핑 UPDATE(`synced_at`).
- 상태 매핑: `ON`/`SOLD_OUT`/`RESTOCK` → `ACTIVE`, 그 외 → `DRAFT`. 가격은 `price_retail` 우선.
- 미디어: `productDeleteMedia` 후 `productCreateMedia` 로 재등록.
- Shopify 에서 상품이 지워졌는데 매핑이 남은 경우(`does not exist`) → 매핑 초기화 후 신규 생성으로 재시도.
- 삭제: `deleteProductById` 가 DB 삭제 **전에** `productDelete` 호출.
- 일괄: `syncProductsByIds([...])` → `POST /admin/products/shopify-sync` (AJAX).

### 7.5 본문 이미지 CDN 이관 (`imageUploader.js`)

상품 설명 HTML 의 `<img src>`(국내 서버 경로)를 Shopify Files 로 옮겨 해외 로딩 속도를 개선합니다. 2단계 전략: ① `fileCreate(originalSource=원본URL)` 로 Shopify 가 직접 가져오기 → ② 실패분(25MP/20MB 초과)은 다운로드 → `sharp` 리사이즈/재압축 → `stagedUploadsCreate` → `fileCreate`. `fileStatus` READY 폴링 후 `shopify_image_mappings` 로 URL 캐싱. 필요 스코프: `write_files`, `read_files`.

### 7.6 카테고리 → 컬렉션 (`categorySync.js`)

NORMAL 카테고리 → Smart Collection(rule `TYPE = 카테고리명`), BRAND → `VENDOR = 브랜드명`. THEME 은 제외. `categories.shopify_collection_id` 로 매핑.

### 7.7 `routes/shopify.js` 엔드포인트

| 메서드/경로 | 용도 |
|---|---|
| `POST /shopify/webhooks` | Webhook 수신 (HMAC 검증 → dispatch) |
| `GET /shopify/markets` | 스토어 Markets(국가/통화/언어) 조회 |
| `POST /shopify/market-context` | 세션에 국가/언어 저장 (국가 유효성 검사) |
| `GET /shopify/price` | handle + country 기준 현지화 가격 |
| `POST /shopify/cart` | variantId 배열로 Cart 생성 → `checkoutUrl` |
| `GET /shopify/cart/:cartId` | Cart 조회 |
| `POST /shopify/cart-from-local` | 로컬 productId → 매핑 variantId 변환 후 Cart 생성 |

### 7.8 Webhook 수신

- 경로: `POST {SHOPIFY_WEBHOOK_BASE_URL}/shopify/webhooks`. `app.js` 가 이 경로에서만 raw body 를 `req.rawBody` 로 캡처합니다.
- 검증: `X-Shopify-Hmac-Sha256` 헤더를 `SHOPIFY_CLIENT_SECRET` 기반 HMAC-SHA256(base64) + `crypto.timingSafeEqual` 로 비교. 실패 시 401.
- 처리 토픽: `orders/create`(`shopify_orders` upsert), `orders/paid`, `orders/cancelled`(status 갱신), `inventory_levels/update`(inventoryItem GID → 매핑 조회 → `products.stock` 갱신 = 역동기화). 미등록 토픽은 경고 로그 후 무시.

### 7.9 API 사용 명세

별도 SDK 없이 `fetch` 로 직접 호출합니다. **Customer Account API 는 미사용.**

**Admin GraphQL** — 엔드포인트 `https://{domain}/admin/api/{version}/graphql.json`.
인증은 **Client Credentials Grant**: `POST https://{domain}/admin/oauth/access_token` 에 `client_id`/`client_secret`/`grant_type=client_credentials` → 받은 `access_token` 을 `X-Shopify-Access-Token` 헤더에 사용. (GraphQL 외 유일한 REST 호출)

| operation | 종류 | 위치 |
|-----------|------|------|
| `productSet` | mutation | `syncService`, `scripts/shopify-sync-products` |
| `inventoryActivate` | mutation | `syncService`, `scripts/shopify-sync-products` |
| `inventorySetOnHandQuantities` | mutation | `syncService`, `scripts/shopify-sync-products` |
| `productCreateMedia` / `productDeleteMedia` | mutation | `syncService` |
| `productDelete` | mutation | `syncService`, `scripts/shopify-delete-products` |
| `collectionCreate` / `collectionUpdate` / `collectionDelete` | mutation | `categorySync`, `scripts/shopify-sync-collections` |
| `collections` | query | `categorySync`, `scripts/shopify-sync-collections` |
| `fileCreate` / `stagedUploadsCreate` | mutation | `imageUploader` |
| `nodes(ids:)` | query | `imageUploader`(fileStatus 폴링), `scripts/shopify-backfill-inventory-ids` |
| `metafieldsSet` | mutation | `scripts/shopify-backfill-source-metafield` |
| `webhookSubscriptionCreate` / `webhookSubscriptionDelete` / `webhookSubscriptions` | mutation·query | `scripts/shopify-register-webhooks`, `scripts/shopify-setup-webhooks` |
| `marketCreate` / `markets` | mutation·query | `scripts/shopify-add-markets` |
| `locations` | query | `scripts/shopify-get-locations` |

**Storefront GraphQL** — 엔드포인트 `https://{domain}/api/{version}/graphql.json`.
인증은 비공개 토큰 헤더 `Shopify-Storefront-Private-Token`. Markets 컨텍스트는 `Shopify-Storefront-Buyer-Country` / `Accept-Language` 헤더와 `@inContext(country, language)` 디렉티브로 전달.

| operation | 종류 | 위치 |
|-----------|------|------|
| `product(handle:)` (`GetProduct`, `@inContext`) | query | `productService` |
| `products` (`GetProducts`, `@inContext`) | query | `productService` |
| `cartCreate` / `cartLinesAdd` / `cartLinesUpdate` | mutation | `cartService` |
| `cart(id:)` (`GetCart`) | query | `cartService` |
| `localization` | query | `marketsService`, `scripts/shopify-get-markets` |

### 7.10 운영 스크립트 (`scripts/shopify-*.js`)

| 스크립트 | 용도 |
|---|---|
| `shopify-create-tables.sql` | 연동 테이블 3종 생성 DDL |
| `shopify-sync-products.js` | 상품 일괄 push (`--dry-run`, `--limit=N`) |
| `shopify-sync-collections.js` | 카테고리 → Smart Collection 일괄 동기화 |
| `shopify-delete-products.js` | Shopify 상품 삭제 |
| `shopify-register-webhooks.js` | Webhook 등록 (토픽 4종, inventory 포함) |
| `shopify-setup-webhooks.js` | Webhook 등록 (토픽 3종, **inventory 제외**) |
| `shopify-get-locations.js` | Location GID 조회 → `SHOPIFY_LOCATION_ID` |
| `shopify-get-markets.js` | 현재 Markets(국가/통화/언어) 확인 |
| `shopify-add-markets.js` | Market 추가 |
| `shopify-backfill-inventory-ids.js` | variant → `inventoryItem.id` 백필 |
| `shopify-backfill-source-metafield.js` | `devmall.source` metafield 백필 |
| `shopify-check-source-metafield.js` | metafield 현황 점검 (읽기 전용) |
| `shopify-remap-variants.js` | stale product/variant GID 재매핑 (handle 기준, DB 만 갱신) |

> `shopify-register-webhooks.js` 와 `shopify-setup-webhooks.js` 의 등록 토픽이 다릅니다(4종 vs 3종). 재고 역동기화가 필요하면 **`shopify-register-webhooks.js`** 를 쓰세요.

### 7.11 데이터 흐름

```
[관리자 상품/카테고리 CRUD]
        │ (백그라운드 자동 트리거, shopify_sync_enabled=1 일 때)
        ▼
   yd-mall  ──productSet / inventory / collection / fileCreate──▶  Shopify 스토어
  (yd_mall DB,                                                     (product / variant /
   소스 오브 트루스) ◀──inventory_levels/update, orders/* (Webhook)── inventory / order)
```

매핑 유지: `shopify_product_mappings`(상품/variant/inventoryItem GID), `categories.shopify_collection_id`(컬렉션), `shopify_image_mappings`(이미지 CDN).

---

## 8. 배포 / 인프라

### 8.1 배포 — 푸시 = 즉시 운영 배포 ⚠️

브랜치는 **`main` 하나**입니다.

```
git push origin main
  → .github/workflows/deploy.yml (GitHub Actions, appleboy/ssh-action)
  → 운영 서버 /data/yd-mall
      git fetch origin main && git reset --hard origin/main
      ./yd-mall.sh build
      ./yd-mall.sh start
```

**개발 DB 와 운영 DB 가 같습니다**(`yd_mall` @ ydata.co.kr). 로컬 검증 스크립트가 쓴 테스트 행도 운영 데이터에 그대로 들어갑니다.

### 8.2 Nginx (역방향 프록시)

SSL 종료는 별도 서버(192.168.1.2)가 담당하고, 애플리케이션 서버는 192.168.1.4 입니다.

| 도메인 | 프록시 대상 | 설정 파일 |
|--------|------------|-----------|
| `https://dev-mall.ydata.co.kr` | `http://192.168.1.4:3006` | `/etc/nginx/sites-enabled/dev-mall.ydata.co.kr.conf` |

```bash
# Nginx 서버 접속 — 외부에서
ssh tracer999@ydata.co.kr -p 10022
# 내부에서 (상용 장비 192.168.1.4 에서만)
ssh tracer999@192.168.1.2
```

와일드카드 SSL 인증서(`/data/ssl_cert/ydata.co.kr_2026/`), 프록시 헤더 `Host`·`X-Real-IP`·`X-Forwarded-For`·`X-Forwarded-Proto`·`Upgrade`·`Connection` 전달, `client_max_body_size 100M`. 앱은 `app.set('trust proxy', 1)` 로 이를 신뢰하므로 HTTPS 접속 시 Secure 쿠키가 발급됩니다.

---

## 9. 알려진 이슈

- **`app.js` 의 `/docs` 정적 서빙이 저장소 밖을 가리킵니다.** `express.static(path.join(__dirname, '..', 'docs'))` 에서 `__dirname` 은 저장소 루트이므로 대상은 상위 디렉터리(운영 서버 기준 `/data/docs`)이고, 이 디렉터리는 존재하지 않습니다. 이 저장소가 모노레포의 서브폴더였을 때의 잔재입니다(주석의 예시 URL `/docs/develop/mall/…` 도 현재 `docs/` 구조와 맞지 않음). **운영에서 `https://dev-mall.ydata.co.kr/docs/` 는 404 로 확인됐습니다**(대조군 `/`, `/manual` 은 200). 저장소 내 `docs/` 를 서빙하려면 `path.join(__dirname, 'docs')` 여야 합니다.
  - `routes/manual.js` 의 `/manual` 은 `__dirname` 이 `routes/` 라서 `../docs` 가 저장소 내 `docs/` 를 정확히 가리키며, 정상 동작합니다.
- **스키마 드리프트**: `tables.sql`(42) vs 실제 DB(49). 6.2 참고.
- **`seoDefaults` 가 전역 `noindex,nofollow` 를 강제**하고 `app.js` 도 `X-Robots-Tag: noindex, nofollow` 를 붙입니다. 테스트 서버 기준 설정이므로, 실제 공개 시 해제해야 합니다.
- **`/checkout/complete?test=1`** 은 Toss 승인 없이 `paymentMethod: 'TEST'` 로 주문을 완료시키는 결제 우회 경로입니다.
- **`isShopifySyncEnabled()` 는 fail-open** 입니다. 7.1 참고.
- **Webhook 등록 스크립트 2종의 토픽이 다릅니다**(4종 vs 3종). 7.10 참고.

---

## 10. 문서

| 경로 | 내용 |
|------|------|
| [`CLAUDE.md`](./CLAUDE.md) | Claude Code 작업 지침 |
| [`docs/team/session.md`](./docs/team/session.md) | 세션 인계 파일 (세션 시작 시 먼저 읽음) |
| `docs/사이트개선/admin_dev_plan.md` | 관리자 개선 계획서 (A·B 트랙) |
| `docs/사이트개선/frontend_dev_plan.md` | 프론트 개선 계획서 |
| `docs/develop_guide/{admin,user}/` | 개발자 문서 (화면별) |
| `docs/manual/{admin,user,coding_guide}/` | 온라인 매뉴얼 소스 — `/manual` 라우트가 렌더 |
| `docs/design_guide_admin.md`, `docs/design_guide_user.md` | 디자인 가이드 |
| `docs/실행가이드.md`, `docs/ssl_setup.md`, `docs/logs.md` | 운영 가이드 |
