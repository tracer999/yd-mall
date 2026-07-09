# dev-mall — 자체 쇼핑몰 (국내향 · 소스 오브 트루스)

건강식품 전문 B2C 이커머스 쇼핑몰. Node.js/Express 기반의 서버사이드 렌더링(EJS) 풀스택 애플리케이션으로, 사용자 쇼핑 인터페이스와 관리자 대시보드를 함께 제공합니다.

---

## 1. 개요 / 역할

이 데모 전체(`shopify-test`)는 **국내용 쇼핑몰을 운영하던 업체가 Shopify로 해외 판매를 시작한다**는 시나리오를 구현합니다. `dev-mall`은 그 시나리오에서 다음 위치를 차지합니다.

- **소스 오브 트루스(Source of Truth).** 상품·카테고리·재고·이미지의 원본은 dev-mall DB(`dev_mall` @ MySQL)에 있습니다. Shopify 쪽 상품/컬렉션/재고는 dev-mall에서 **프로그램적으로 일괄 업로드·동기화**된 사본입니다.
- **양방향 재고 정합성의 한 축.** dev-mall → Shopify 로는 상품·재고를 밀어넣고(push), Shopify → dev-mall 로는 주문·재고 변동을 **Webhook**으로 받아 반영합니다.
- **관리자 콘솔.** 상품/카테고리 등록·수정·삭제 시 백그라운드로 Shopify 동기화가 자동 트리거되며, Shopify에서 들어온 주문을 조회하는 관리 화면(`/admin/shopify-orders`)도 포함합니다.

이 저장소 안에서의 관계(요약):

| 시스템 | 역할 | dev-mall과의 관계 |
|--------|------|-------------------|
| **dev-mall** (본 폴더) | 국내향 몰 + 상품/재고 원본 | 원본 보유. Shopify로 push, Shopify에서 주문/재고 pull |
| **shopifyApp** | Shopify 공식 앱 템플릿(관리 앱 베이스) | 동일 Shopify 스토어를 다른 방식으로 관리 |
| **spf-mall** | Shopify 헤드리스 해외향 프론트(Next.js) | dev-mall이 올린 Shopify 상품을 고객에게 노출 |
| **spf-admin** | Shopify Admin 대체 자체 관리자(Spring Boot) | dev-mall과 별개로 Shopify Admin API 사용 |

> dev-mall 자체는 **관리자 페이지에 Shopify 연동 기능을 내장**한 형태입니다. 별도 앱이 아니라, 쇼핑몰 백오피스가 곧 동기화 도구입니다.

---

## 2. 기술 스택 (버전)

| 구분 | 기술 | 버전(package.json 기준) |
|------|------|------|
| Runtime | Node.js | v18+ (개발환경 권장 22) |
| Framework | Express | ^5.2.1 |
| Template | EJS + express-ejs-layouts | ^4.0.1 / ^2.5.1 |
| Styling | Tailwind CSS (CLI) | ^4.1.18 |
| DB | MySQL 8 (mysql2, raw SQL + pool) | mysql2 ^3.16.3 |
| Session | express-session + connect-redis / redis | ^1.19.0 / ^9.0.0 / redis ^5.10.0 |
| Auth | Passport (Google/Kakao OAuth) | passport ^0.7.0, passport-google-oauth20 ^2.0.0, passport-kakao ^1.0.1 |
| Email | nodemailer | ^8.0.0 |
| 이미지 처리 | sharp (리사이즈·재압축) | ^0.34.5 |
| AI(선택) | openai | ^6.18.0 |
| 파일 업로드 | multer | ^2.0.2 |
| 에디터 | tinymce | ^8.4.0 |
| 기타 | marked, sitemap, ua-parser-js, cookie-parser, png-to-ico | — |
| 개발 | nodemon, concurrently, cross-env, @tailwindcss/cli | — |
| 프로세스 관리 | PM2 (cluster, `ecosystem.config.cjs`) | 외부 설치 |

- **Shopify 연동은 별도 SDK 없이 `fetch`로 GraphQL/REST를 직접 호출**합니다(의존성에 `@shopify/*` 없음).
- 결제: 국내향 흐름은 Toss Payments 계열이나, 본 폴더 소스에서 Shopify 결제는 Shopify checkoutUrl로 위임합니다.

---

## 3. 실행 방법

### 3.1 설치

```bash
cd dev-mall
npm install
```

### 3.2 환경변수

환경 파일은 `config/env.js`가 **`.env`(공통 기본값)를 먼저 로드한 뒤 환경별 파일로 override** 합니다.
- 개발: `.env` → `.env.development` (PORT=3000)
- 상용: `.env` → `.env.production` (`NODE_ENV=production`, PORT=3006, FORCE_HTTPS=true)

비공개 저장소이므로 `.env` 계열은 git으로 추적·공유합니다. Shopify 관련 키(개발/상용 공통):

| 키 | 예시 값 | 용도 |
|----|--------|------|
| `SHOPIFY_STORE_DOMAIN` | `ydatasvcmall.myshopify.com` | 스토어 도메인(Admin/Storefront 엔드포인트 조립) |
| `SHOPIFY_CLIENT_ID` | `f7badd5c…` | 커스텀 앱 Client ID (Admin 토큰 발급) |
| `SHOPIFY_CLIENT_SECRET` | `shpss_…` | 커스텀 앱 Client Secret (client_credentials + Webhook HMAC) |
| `SHOPIFY_STOREFRONT_API_TOKEN` | `shpat_…` | Storefront 비공개 토큰 |
| `SHOPIFY_API_VERSION` | `2026-04` | 기본 API 버전(재고 mutation은 코드에서 2025-01 혼용) |
| `SHOPIFY_LOCATION_ID` | `gid://shopify/Location/…` | 재고를 올릴 로케이션 GID |
| `SHOPIFY_WEBHOOK_BASE_URL` | `https://dev-mall.ydata.co.kr` | Webhook 콜백 베이스 URL + 이미지 절대경로 base |

그 외 DB(`DB_HOST=ydata.co.kr`, `DB_NAME=dev_mall`), Redis(`REDIS_PORT=6380`), `SESSION_SECRET`, `TINYMCE_KEY`, `MAX_UPLOAD_FILE_MB` 등이 있습니다.

### 3.3 구동 명령 / 포트

```bash
# 개발: Tailwind watch + nodemon 동시 실행 (권장), 포트 3000
npm run dev:all

# 개발: 서버만, 포트 3000
npm run dev

# CSS 빌드 / 감시
npm run build:css
npm run watch:css

# 상용 실행 (NODE_ENV=production, 포트 3006)
npm run start:prod

# PM2 클러스터 (ecosystem.config.cjs)
npm run pm2:start

# DB 초기화(스키마 + 시드)
npm run init:db
```

### 3.4 Shopify 연동 준비(1회성 스크립트)

```bash
mysql ... < scripts/shopify-create-tables.sql     # 연동 테이블 3종 생성
node scripts/shopify-get-locations.js             # 로케이션 GID 확인 → SHOPIFY_LOCATION_ID
node scripts/shopify-get-markets.js               # 현재 Markets(국가/통화/언어) 확인
node scripts/shopify-add-markets.js               # KR/JP 등 Market 추가
node scripts/shopify-sync-products.js --dry-run   # 상품 일괄 업로드(미리보기)
node scripts/shopify-sync-products.js --limit=10  # 상품 일괄 업로드(10개)
node scripts/shopify-sync-collections.js          # 카테고리 → 컬렉션 동기화
node scripts/shopify-register-webhooks.js         # Webhook 등록(--list, --delete-all)
node scripts/shopify-backfill-inventory-ids.js    # variant → inventoryItem.id 백필
```

---

## 4. 폴더 / 코드 구조

```
dev-mall/
├── app.js                 # Express 진입점. 미들웨어 파이프라인 + /shopify/webhooks raw body 캡처
├── config/
│   ├── db.js              # MySQL 커넥션 풀
│   ├── env.js             # .env → .env.{env} 순차 로딩
│   ├── passport.js        # Google/Kakao OAuth
│   └── systemSettings.js  # system_settings 테이블 → process.env
├── controllers/
│   ├── productController.js       # 사용자 상품 목록/상세 (상세에서 shopify_product_mappings 조회)
│   └── admin/
│       ├── productController.js   # 상품 CRUD + 저장/삭제 시 Shopify 동기화 트리거, 일괄동기화(postShopifySync)
│       ├── categoryController.js  # 카테고리 CRUD + syncCategoryById 트리거
│       └── shopifyOrderController.js # Shopify 주문 목록/상세 조회
├── routes/
│   ├── shopify.js         # /shopify/* (webhooks, markets, cart, price 등) — 5장 참조
│   ├── admin.js           # /admin 메인 라우터 (shopify-orders 서브라우트 포함)
│   └── admin/
│       ├── products.js    # POST /admin/products/shopify-sync (일괄 동기화 AJAX)
│       └── shopify-orders.js  # /admin/shopify-orders 목록/상세
├── middleware/
│   └── shopifyContext.js  # 세션 국가/언어 → res.locals.shopifyMarket 주입
├── services/
│   └── shopify/           # ★ Shopify 연동 핵심 모듈
│       ├── index.js               # 통합 진입점(re-export)
│       ├── adminClient.js         # Admin GraphQL 클라이언트 + 토큰 발급/캐시
│       ├── storefrontClient.js    # Storefront GraphQL 클라이언트
│       ├── productService.js      # Storefront 상품 조회(@inContext 현지가격)
│       ├── cartService.js         # Storefront Cart 생성/추가/조회
│       ├── marketsService.js      # Storefront localization(국가/통화/언어)
│       ├── syncService.js         # ★ 상품 push 동기화(productSet+재고+미디어) + 삭제
│       ├── categorySync.js        # 카테고리 → Smart Collection 동기화
│       ├── imageUploader.js       # 설명 본문 <img> → Shopify Files(CDN) 업로드
│       └── webhookHandler.js      # Webhook HMAC 검증 + orders/inventory 처리
├── scripts/               # shopify-*.js 운영 스크립트 + shopify-create-tables.sql
├── views/                 # EJS (user/, admin/, layouts/, partials/)
├── public/                # Tailwind CSS, /uploads 이미지
├── tables.sql             # 자체몰 기본 스키마(20+ 테이블)
├── ecosystem.config.cjs   # PM2 설정
└── .env / .env.development / .env.production
```

### Shopify 연동 데이터 테이블 (`scripts/shopify-create-tables.sql`)

| 테이블 | 용도 |
|--------|------|
| `shopify_product_mappings` | dev-mall `products.id` ↔ Shopify product/variant/inventoryItem GID, handle 매핑 (UNIQUE, product FK ON DELETE CASCADE) |
| `shopify_orders` | Webhook으로 수신한 주문(financial/fulfillment status, raw_payload JSON) |
| `shopify_image_mappings` | 설명 본문 원본 이미지 URL(sha256) ↔ Shopify CDN URL 캐싱(중복 업로드 방지) |
| `categories.shopify_collection_id` | (기존 categories 테이블 컬럼) 카테고리 ↔ Smart Collection 매핑 |

---

## 5. 핵심 기능

### 5.1 상품 push 동기화 (`services/shopify/syncService.js`)
- 관리자에서 상품을 **등록/수정하면 백그라운드로 `syncProductById(productId)` 자동 실행**(상품 저장 성공에는 영향 없음, 실패는 로그만).
- `products` 행을 읽어 `productSet`(synchronous)로 Shopify 상품을 생성 또는 업데이트. 매핑 존재 여부로 신규/갱신 판별.
- 신규: `inventoryActivate` → `inventorySetOnHandQuantities`로 재고 세팅 → 매핑 INSERT.
- 갱신: 재고 재설정 → 매핑 UPDATE(`synced_at`).
- dev-mall status → Shopify status 매핑(`ON/SOLD_OUT/RESTOCK`→`ACTIVE`, 그 외→`DRAFT`). 가격은 `price_retail` 우선.
- 미디어: 기존 미디어 `productDeleteMedia` 후 `productCreateMedia`로 대표/썸네일 재등록.
- Shopify에서 상품이 지워졌는데 매핑이 남은 경우(`does not exist`) → 매핑 초기화 후 신규 생성으로 재시도.
- 삭제: `deleteProductById`가 상품 DB 삭제 **전에** `productDelete` 호출.
- 일괄: `syncProductsByIds([...])` → 관리자 `POST /admin/products/shopify-sync`(AJAX)에서 사용.

### 5.2 설명 본문 이미지 CDN 이관 (`services/shopify/imageUploader.js`)
- 상품 설명 HTML의 `<img src>`(국내 서버 경로)를 Shopify Files로 옮겨 **해외 로딩 속도 개선 + 외부 의존성 제거**.
- 2단계 전략: ① `fileCreate(originalSource=원본URL)`로 Shopify가 직접 가져오기 → ② 실패분(25MP/20MB 초과)은 다운로드→`sharp` 리사이즈/재압축→`stagedUploadsCreate`로 바이너리 업로드→`fileCreate`.
- `fileStatus` READY 폴링, `shopify_image_mappings`로 URL 캐싱. 필요 스코프: `write_files`, `read_files`.

### 5.3 카테고리 → 컬렉션 동기화 (`services/shopify/categorySync.js`)
- NORMAL 카테고리 → Smart Collection(rule `TYPE = 카테고리명`), BRAND → `VENDOR = 브랜드명`. THEME은 제외.
- `collectionCreate`/`collectionUpdate`/`collectionDelete`, 백필용 `collections` 조회. `categories.shopify_collection_id`로 매핑.

### 5.4 Markets / 현지화 (헤드리스 프론트용 API)
- `/shopify/markets`로 스토어 국가·통화·언어(`localization`) 조회, `/shopify/market-context`로 세션에 국가/언어 저장.
- `/shopify/price`는 handle+country로 `@inContext` 현지 가격 반환.
- `shopifyContext` 미들웨어가 세션 값을 `res.locals.shopifyMarket`으로 뷰에 주입.

### 5.5 Cart / Checkout 위임 (Storefront)
- `/shopify/cart`(variantId 기반) 및 `/shopify/cart-from-local`(dev-mall productId → 매핑 테이블로 variantId 변환)로 `cartCreate` 호출 → `checkoutUrl` 반환(결제는 Shopify로 위임). `buyerIdentity.countryCode`로 Market 반영.

### 5.6 Webhook 수신 (`services/shopify/webhookHandler.js`, `routes/shopify.js`)
- `app.js`가 `/shopify/webhooks` 경로에서만 raw body를 `req.rawBody`로 캡처 → HMAC-SHA256 검증(`SHOPIFY_CLIENT_SECRET`).
- 처리 토픽: `orders/create`(shopify_orders upsert), `orders/paid`, `orders/cancelled`(status 갱신), `inventory_levels/update`(inventoryItem GID로 매핑 조회 후 `products.stock` 갱신 = Shopify→dev-mall 재고 역동기화).

### 5.7 관리자 주문 조회
- `/admin/shopify-orders` 목록(상태/키워드 필터, 페이지네이션) + 상세(raw_payload 표시).

---

## 6. Shopify API 사용 명세

별도 SDK 없이 `fetch`로 직접 호출합니다. **Customer Account API는 미사용.**

### 6.1 Admin GraphQL API
- **엔드포인트**: `https://{SHOPIFY_STORE_DOMAIN}/admin/api/{version}/graphql.json` (`adminClient.js`는 기본 `SHOPIFY_API_VERSION`=2026-04, `syncService.js`의 재고 관련 호출은 `2025-01` 하드코딩 혼용 — 2026-04에서 inventory mutation의 `@idempotent` 요건 변경 때문).
- **인증**: **Client Credentials Grant**. `POST https://{domain}/admin/oauth/access_token`에 `client_id`/`client_secret`/`grant_type=client_credentials` → 받은 `access_token`을 요청 헤더 **`X-Shopify-Access-Token`**에 사용(토큰 24h, 만료 1분 전 자동 갱신·캐시).
- **사용 operation(소스 grep 실명)**:

| operation | 종류 | 위치 | 용도 |
|-----------|------|------|------|
| `productSet` | mutation | syncService, scripts/shopify-sync-products | 상품 생성/업데이트(synchronous) |
| `inventoryActivate` | mutation | syncService, sync-products | 로케이션 재고 활성화 |
| `inventorySetOnHandQuantities` | mutation | syncService, sync-products | 재고 수량 설정 |
| `productCreateMedia` | mutation | syncService | 대표/썸네일 이미지 등록 |
| `productDeleteMedia` | mutation | syncService | 기존 미디어 삭제 |
| `productDelete` | mutation | syncService, scripts/shopify-delete-products | 상품 삭제 |
| `collectionCreate` | mutation | categorySync, sync-collections | Smart Collection 생성 |
| `collectionUpdate` | mutation | categorySync | 컬렉션 수정 |
| `collectionDelete` | mutation | categorySync, sync-collections | 컬렉션 삭제 |
| `collections` | query | categorySync(LIST_COLLECTIONS), sync-collections | 컬렉션 목록/백필 |
| `fileCreate` | mutation | imageUploader | 본문 이미지 Shopify Files 업로드 |
| `stagedUploadsCreate` | mutation | imageUploader | 바이너리 staged 업로드 타깃 생성 |
| `nodes(ids:)` | query | imageUploader(FILE_POLL), scripts/shopify-backfill-inventory-ids | fileStatus 폴링 / variant→inventoryItem.id 조회 |
| `webhookSubscriptionCreate` | mutation | scripts/shopify-register-webhooks, shopify-setup-webhooks | Webhook 등록 |
| `webhookSubscriptionDelete` | mutation | 위 스크립트 | Webhook 삭제 |
| `webhookSubscriptions` | query | 위 스크립트 | Webhook 목록 |
| `marketCreate` | mutation | scripts/shopify-add-markets | Market(국가) 추가 |
| `markets` | query | scripts/shopify-add-markets(LIST_QUERY) | Market 목록 |
| `locations` | query | scripts/shopify-get-locations | 로케이션 GID 조회 |

### 6.2 Storefront API
- **엔드포인트**: `https://{SHOPIFY_STORE_DOMAIN}/api/{version}/graphql.json` (기본 2026-04).
- **인증**: **비공개 토큰**. 헤더 **`Shopify-Storefront-Private-Token: {SHOPIFY_STOREFRONT_API_TOKEN}`**. Markets 컨텍스트는 `Shopify-Storefront-Buyer-Country` / `Accept-Language` 헤더 및 `@inContext(country,language)` 디렉티브로 전달.
- **사용 operation(소스 grep 실명)**:

| operation | 종류 | 위치 | 용도 |
|-----------|------|------|------|
| `product(handle:)` (GetProduct, `@inContext`) | query | productService | 단일 상품 + 현지가격 |
| `products` (GetProducts, `@inContext`) | query | productService | 상품 목록(페이지네이션) |
| `cartCreate` | mutation | cartService | 장바구니 생성 → checkoutUrl |
| `cartLinesAdd` | mutation | cartService | 장바구니 라인 추가 |
| `cartLinesUpdate` | mutation | cartService | 장바구니 라인 수정 |
| `cart(id:)` (GetCart) | query | cartService | 장바구니 조회 |
| `localization` | query | marketsService, scripts/shopify-get-markets | 국가/통화/언어 목록 |

### 6.3 Admin REST(비-GraphQL) 엔드포인트
- `POST /admin/oauth/access_token` — Admin 액세스 토큰 발급(위 client_credentials). GraphQL 외 유일한 REST 호출.

### 6.4 Webhook (수신)
- **수신 경로**: `POST {SHOPIFY_WEBHOOK_BASE_URL}/shopify/webhooks`.
- **검증**: `X-Shopify-Hmac-Sha256` 헤더를 `SHOPIFY_CLIENT_SECRET` 기반 HMAC-SHA256(base64) + `timingSafeEqual`로 검증.
- **구독 토픽**: `ORDERS_CREATE`, `ORDERS_PAID`, `ORDERS_CANCELLED`, `INVENTORY_LEVELS_UPDATE` (register/setup 스크립트가 `webhookSubscriptionCreate`로 등록).

---

## 7. 다른 폴더(시스템)와의 관계 — 데이터 흐름

```
[관리자 상품/카테고리 CRUD]
        │ (백그라운드 자동 트리거)
        ▼
  dev-mall  ──productSet / inventory / collection / fileCreate──▶  Shopify 스토어
 (dev_mall DB,                                                     (product/variant/
  소스 오브 트루스)  ◀──inventory_levels/update, orders/* (Webhook)── inventory/order)
        ▲                                                                │
        │ shopify_product_mappings / shopify_orders 저장                 │ 상품/컬렉션 노출
        │                                                                ▼
        └──────────────────────────────────────────  spf-mall (Next.js 헤드리스 해외 프론트)
                                                       shopifyApp / spf-admin (동일 스토어 관리)
```

- **dev-mall → Shopify (push)**: 상품/재고/카테고리/본문이미지. dev-mall이 원본.
- **Shopify → dev-mall (pull, Webhook)**: 주문(`shopify_orders`), 재고 변동(`inventory_levels/update` → `products.stock` 갱신).
- **매핑 유지**: `shopify_product_mappings`(상품/variant/inventoryItem GID), `categories.shopify_collection_id`(컬렉션), `shopify_image_mappings`(이미지 CDN).
- **spf-mall / shopifyApp / spf-admin**은 dev-mall이 채워 넣은 **동일 Shopify 스토어**를 각각 고객 노출·관리 용도로 사용합니다. dev-mall과는 Shopify 스토어를 매개로 간접 연결됩니다(코드 직접 의존 없음).
# yd-mall
