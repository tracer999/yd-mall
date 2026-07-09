# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 응답 언어

- **이 저장소에서 사용자에게 보내는 모든 답변은 한국어로 작성한다.** (코드·식별자·명령어 등 원문 유지가 필요한 부분은 예외)

## 프로젝트 개요

**국내용 쇼핑몰을 운영하던 업체가 Shopify로 해외몰을 여는 과정**을 end-to-end로 보여주는 데모 모노레포입니다.
하나의 실제 Shopify 스토어(`ydatasvcmall.myshopify.com`)를 가운데 두고, 서로 다른 언어·역할의 **4개 시스템**이
상품·주문·재고를 프로그램적으로 올리고(push)·동기화하고(pull)·고객에게 노출하고·운영자가 관리합니다.

- `dev-mall` (Node.js): 국내용 자체 쇼핑몰. **상품·카테고리·재고·이미지의 소스 오브 트루스(원천)**. 관리자에 Shopify **동기화(push)** 와 주문·재고 **Webhook(pull)** 이 내장돼 있음.
- `shopifyApp` (React Router/Polaris): Shopify **공식 앱 템플릿**. 임베디드 관리/동기화 앱의 인증·구조 베이스(현재는 템플릿 데모 상태).
- `spf-mall` (Next.js): Shopify를 백엔드로만 쓰는 **헤드리스 고객몰**(해외향). 테마가 아닌 자체 UI/기능을 직접 구현. 상품/블로그는 Storefront API로 읽고, 로그인/주문내역은 Customer Account API로 처리.
- `spf-admin` (Spring Boot 4): **Shopify Admin을 대체하는 자체 관리자**. Admin GraphQL API로 상품·재고·주문·블로그·컬렉션을 실시간 관리. 로그인은 `dev-mall`의 `admins` 계정을 재사용.

> 데이터 흐름: **dev-mall(원천) → (Admin API push) → Shopify 스토어 → (Storefront/Customer Account) spf-mall 고객 노출**,
> 그리고 **Shopify → (Webhook) → dev-mall** 로 주문·재고 역동기화. 운영은 spf-admin(Admin API)이 담당.
> 전체 아키텍처·데이터 흐름·**Shopify API 사용 지도**는 루트 [`README.md`](./README.md)에 정리되어 있으니 먼저 참고할 것.

> **언어가 시스템마다 다른 이유(의도된 예시)**: dev-mall은 자체몰이 PHP·Java·Node 등으로 흔히 만들어져 언어 선택에 특별한 의미 없음, 헤드리스 프론트는 최신 인기인 Next.js, spf-admin은 한국 중대형이 아직 Java(Spring Boot)를 많이 써서 이식성·유행 반영으로 일부러 Spring Boot 4.

## 모노레포 구조

```
shopify-test/
├── dev-mall/     # 국내몰·소스 오브 트루스 (Node.js / Express 5 / EJS / MySQL) — 포트 3000/3006
├── shopifyApp/   # Shopify 공식 앱 템플릿 (React Router, Polaris, Admin GraphQL, Prisma)
├── spf-mall/     # 헤드리스 고객몰 (Next.js 16 / React 19 / Storefront·Customer Account API) — 포트 3007
├── spf-admin/    # 자체 관리자 (Java 21 / Spring Boot 4 / Thymeleaf / Admin GraphQL) — 포트 8080
└── docs/          # 개발 문서(shopify-app, plan 등) + 검토 리포트(HTML, index.html)
```

각 서브프로젝트는 독립 실행합니다(각자 `package.json` 또는 `pom.xml`). 작업 시 해당 서브폴더로 이동해 명령을 실행하세요. 루트에는 빌드 매니페스트가 없습니다(서브프로젝트별 관리). **각 폴더의 `README.md`가 그 시스템의 상세 설명서(스택·실행·구조·Shopify API 명세)입니다.**

**런타임 버전**: Node 계열(`dev-mall`/`shopifyApp`/`spf-mall`)은 **Node 22** 권장(`shopifyApp`·`spf-mall`이 `>=20.19 <22 || >=22.12` 요구, `dev-mall`은 18+). `spf-admin`은 **Java 21(Temurin)** + Maven.

## 저장소 운영 정책

- **이 저장소는 비공개(private) 저장소입니다.**
- 따라서 `dev-mall/.env`, `dev-mall/.env.development`, `dev-mall/.env.production`은 **git으로 추적·동기화**합니다(루트 `.gitignore`의 `.env` 무시 규칙을 `dev-mall/.gitignore`에서 해제). DB·Redis 등 환경별 설정을 팀이 공유하기 위함입니다.
- 단, 개인용 로컬 오버라이드(`.env.local`, `.env.*.local`)와 `shopifyApp`의 `.env*`는 계속 추적하지 않습니다.
- 비공개 저장소라도 외부 공개로 전환하거나 fork할 경우 시크릿이 노출되므로 주의하세요.

## 인프라 접속 정보

### Nginx 서버 (역방향 프록시)

도메인(`spf-admin.ydata.co.kr`, `spf-mall.ydata.co.kr` 등)의 SSL 종료 및 역방향 프록시 역할을 담당하는 별도 서버.

```bash
# 외부 접속 (어디서든 가능)
ssh tracer999@ydata.co.kr -p 10022
# 패스워드: NEWtec4075@!

# 내부 접속 (현재 상용 장비 192.168.1.4에서만 가능)
ssh tracer999@192.168.1.2
# 포트 22, 패스워드 동일: NEWtec4075@!
```

- Nginx 설정 작업 시 이 서버에 SSH 접속하여 수행한다.
- 상용 장비(`/data/shopify-test`가 있는 서버, 192.168.1.4)와는 **별개의 서버**(192.168.1.2)이다.
- 내부 접속(192.168.1.2)은 상용 장비에서만 가능하며 외부에서는 ydata.co.kr:10022 를 사용한다.

### 시스템별 Nginx 도메인 설정

설정 파일 위치: `/etc/nginx/sites-enabled/` (Nginx 서버, 192.168.1.2)
SSL 인증서: `/data/ssl_cert/ydata.co.kr_2026/_wildcard_.ydata.co.kr_2026.all.crt.pem` (와일드카드)

| 시스템 | 도메인 | 프록시 대상 | 설정 파일 |
|--------|--------|------------|-----------|
| `dev-mall` | `https://dev-mall.ydata.co.kr` | `http://192.168.1.4:3006` | `dev-mall.ydata.co.kr.conf` |
| `spf-mall` | `https://spf-mall.ydata.co.kr` | `http://192.168.1.4:3007` | `spf-mall.ydata.co.kr.conf` |
| `spf-admin` | `https://spf-admin.ydata.co.kr` | `http://192.168.1.4:8080` | `spf-admin.ydata.co.kr.conf` |

공통 프록시 헤더: `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`, `Upgrade`, `Connection`
- `X-Forwarded-Proto: $scheme` 이 전달되므로 Spring Boot(`spf-admin`)의 `forward-headers-strategy: NATIVE` 가 올바르게 작동함.
- `client_max_body_size 100M` (전 시스템 공통), `spf-admin`은 업로드 타임아웃 300s 추가 설정.

## 연동 구현 현황

- **상품/컬렉션/이미지 push**: dev-mall이 소스 오브 트루스. 관리자에서 상품 등록/수정 시 `productSet`·재고·`productCreateMedia`·컬렉션을 Shopify로 밀어 넣고 `shopify_product_mappings`로 GID 매핑. (dev-mall)
- **주문/재고 pull**: `orders/*`·`inventory_levels/update` **Webhook**을 HMAC 검증 후 수신 → 주문 저장·`products.stock` 역동기화. (dev-mall)
- **고객 노출**: `spf-mall`이 Storefront API로 상품/블로그 읽기 + Customer Account API 로그인, 결제는 Shopify Checkout 위임.
- **운영**: `spf-admin`이 Admin GraphQL로 상품/재고/주문/블로그/컬렉션 관리(자체 비즈니스 DB 없음).
- 시스템별 상세·API 명세: 각 폴더 `README.md` / 전체 지도: 루트 [`README.md`](./README.md).
- 설계 배경 문서: [`docs/shopify-app/08-shopify-integration-architecture.md`](./docs/shopify-app/08-shopify-integration-architecture.md), [`docs/plan/spf-admin/`](./docs/plan/spf-admin/).

## 리포트 문서 작성 (docs/)

`docs/`에는 "자체구축몰을 Shopify와 연동·확장하는 방법"을 다루는 **검토 리포트**(HTML)를 작성한다(`index.html`이 허브, `session1-*`/`session2-*` 하위 폴더). 작성 시 다음을 지킨다.

- **작성 전 반드시 [`docs/README.md`](./docs/README.md)를 먼저 읽고 그 규칙을 따른다.** (목적·독자·구성·디자인 시스템·체크리스트가 모두 거기에 정의되어 있다.)
- **새 장은 `docs/template.html`을 복사**해서 만들고, 공유 `report.css`/`report.js`를 그대로 link 한다(색·컴포넌트를 문서마다 새로 만들지 않는다).
- **일반화 원칙**: 리포트 본문에는 `dev-mall` 등 내부 프로젝트명·특정 스택/DB/벤더/시크릿을 노출하지 않는다. 대신 **"자체구축몰"**(Java·Node.js·PHP 등) 일반 개념으로 서술한다.
- **서술 방식**: 새 개념마다 *비유 → 정확한 정의 → 시사점* 순으로 풀어, Shopify 사전지식이 없어도 이해되게 쓴다. 요금제·API·정책 등 바뀌기 쉬운 사실은 공식 문서로 확인 후 작성한다.
- 전체 목차의 기준(허브)은 `docs/index.html`이다.

> 참고: 위 일반화 원칙은 **`docs/`의 리포트(HTML)에만** 적용된다. `docs/shopify-app/` 등 사내 개발 문서에는 dev-mall 등 실제 명칭을 그대로 사용한다.

---

## shopifyApp (Shopify 앱)

상세 개발 문서는 `docs/shopify-app/`에 한국어로 정리되어 있습니다.

- [개발 문서 인덱스](./docs/shopify-app/README.md)
- [01. 아키텍처 개요](./docs/shopify-app/01-architecture.md)
- [02. 개발 환경 / 실행](./docs/shopify-app/02-getting-started.md)
- [03. 라우팅과 인증](./docs/shopify-app/03-routing-and-auth.md)
- [04. Admin GraphQL 연동](./docs/shopify-app/04-admin-graphql.md)
- [05. UI: Polaris 웹 컴포넌트](./docs/shopify-app/05-ui-polaris.md)
- [06. 데이터와 Prisma](./docs/shopify-app/06-data-and-prisma.md)
- [07. 설정과 배포](./docs/shopify-app/07-config-and-deploy.md)
- [08. Shopify 통합 아키텍처](./docs/shopify-app/08-shopify-integration-architecture.md)

---

## store-theme-Rise (Shopify 테마 — spf-mall UI 트윈)

> **`store-theme-Rise/` 작업 시 반드시 [`store-theme-Rise/guide_for_claude.md`](./store-theme-Rise/guide_for_claude.md)를 먼저 읽고 그 규칙을 따른다.** (Stack·컨벤션·명령·File Map·Guardrails·Workflow가 거기에 정의됨.)

- **정체**: Shopify OS 2.0 테마(Rise `#189002809626`, unpublished)를 헤드리스몰 `spf-mall`의 UI와 **쌍둥이**로 맞추는 프로젝트. 스토어 `ydatasvcmall.myshopify.com`.
- **핵심 규칙**: 새 CSS는 **px만**(Rise는 `html{font-size:62.5%}` → 1rem=10px). 하드코딩 텍스트 금지(`t:` 키). 라이브 테마 직접 push 금지. `theme check` 통과 후 진행. 임시파일(`*.tmp.*`) 정리(안 하면 `theme dev` 500).
- **로컬 구동**: `cd store-theme-Rise && shopify theme dev --store ydatasvcmall.myshopify.com` → `http://127.0.0.1:9292`.
- **AI Toolkit**: 테마 작업 시 Shopify AI Toolkit 플러그인 활성 상태여야 함(`/plugin list`, 미적용 시 `/reload-plugins`) — `shopify-plugin:shopify-liquid` 스킬 + MCP `validate_theme_codeblocks`로 Liquid 검증.

---

## spf-mall (헤드리스 고객몰)

> 상세: [`spf-mall/README.md`](./spf-mall/README.md). `spf-mall/` 작업 시 적용.

- **스택/포트**: Next.js 16(App Router, RSC) · React 19 · TS · Tailwind 4. 개발 `npm run dev`(3007), 상용 PM2 fork(3007).
- **Shopify API**: **Storefront API**(상품/블로그/장바구니 — `Shopify-Storefront-Private-Token` + `@inContext`), **Customer Account API**(로그인/주문내역 — OAuth Authorization Code + PKCE). Admin API 미사용. 결제는 Shopify Checkout(`cart.checkoutUrl`) 위임. 자체 DB 없음.
- **i18n/Markets 2축**: UI 언어(`ui_lang`, 기본 en)와 마켓 국가/통화(`market`, 기본 US/USD)를 독립 관리. env 없이도 코드 fallback으로 영문 기본 유지.
- **시크릿**: `spf-mall/.env.local`은 **git 미추적**(`SHOPIFY_STOREFRONT_API_TOKEN` 등). 서버에 직접 존재해야 함.
- **상용 배포**: `/deploy-spfmall` 스킬 사용(office.ydata.co.kr, `https://spf-mall.ydata.co.kr`). spf-mall만 다루고 다른 PM2 앱은 건드리지 않음.

---

## spf-admin (자체 관리자 — Shopify Admin 대체)

> 상세: [`spf-admin/README.md`](./spf-admin/README.md), 설계: [`docs/plan/spf-admin/`](./docs/plan/spf-admin/). `spf-admin/` 작업 시 적용.

- **스택/포트**: Java 21 · Spring Boot 4.0 · Spring MVC(블로킹, `RestClient`) · Thymeleaf + Bootstrap 5 · Spring Security(폼 로그인·`@PreAuthorize`) · MyBatis · MySQL 8 · Flyway. 내장 톰캣 **8080**.
- **실행**: `mvn -q -DskipTests package` → `java -jar target/spf-admin-0.1.0.jar --spring.profiles.active=prod`. 설정은 `application.yml`(기본) + `application-prod.yml`(prod 오버라이드, 시크릿 평문). **`.env` 미사용.**
- **Shopify API**: **Admin GraphQL API 2026-07**. 인증은 `client_credentials` 그랜트 토큰을 JVM 내부에서 자동 발급·캐시·갱신(`ShopifyTokenManager`, OS 무관). 모든 호출은 `ShopifyAdminClient.query()` 단일 경유, 쿼리/뮤테이션 상수는 `ShopifyQueries.java`.
- **기능**: 대시보드 · 상품(편집·TinyMCE) · 재고 콘솔(변형×로케이션, `inventorySetQuantities @idempotent`) · 주문 · 블로그(CRUD·대표이미지·TinyMCE) · 컬렉션(2026-07 sources 모델, 상품 추가/제거).
- **로그인**: 자체 사용자 테이블 없이 **`dev_mall.admins`를 읽기 전용으로 재사용**(BCrypt, dev-mall과 동일 해시). 자체 DB `spf_admin` 스키마엔 `audit_log` 등 부수 데이터만. → DB 접근은 아래 dev-mall 규칙과 동일하게 **mysql CLI** 사용.

---

## dev-mall (자체 쇼핑몰)

> 아래 내용은 `dev-mall/` 디렉터리에서 작업할 때 적용됩니다. 사용자 문서는 [`dev-mall/README.md`](./dev-mall/README.md) 참고.

### Project Overview

건강식품 전문 B2C 이커머스 쇼핑몰. 사용자 쇼핑 인터페이스와 관리자 대시보드로 구성된 풀스택 서버사이드 렌더링 애플리케이션.

### Branch Strategy

- **developer**: 개발 브랜치 (모든 개발 작업은 이 브랜치에서 진행)
- **main**: 상용 브랜치 (배포용, developer에서 검증 후 머지)

### Tech Stack

- **Runtime**: Node.js v18+
- **Framework**: Express 5.x (MVC 패턴)
- **Database**: MySQL 8 (mysql2, ORM 없이 raw SQL + connection pool)
- **Template**: EJS + express-ejs-layouts
- **Styling**: Tailwind CSS 4.x (커스텀 테마: green-theme #2e7d32)
- **Auth**: Passport.js (Google OAuth 2.0, Kakao OAuth)
- **Session**: Redis (분산 배포) / MemoryStore (단일 인스턴스 폴백)
- **Payment**: Toss Payments API
- **Email**: nodemailer (Gmail / SMTP)
- **AI**: OpenAI API (상품 설명 생성, 선택적)
- **Process Manager**: PM2 (cluster mode)

### Common Commands

> **포트**: 개발(`npm run dev` / `dev:all`)은 **3000**, 상용(`start:prod` / PM2)은 **3006**.
> **환경 파일 로딩**(`config/env.js`): 먼저 `.env`(기본값)를 로드한 뒤 환경별 파일을 override로 덮어쓴다. 개발은 `.env → .env.development`, 상용(`NODE_ENV=production`)은 `.env → .env.production` 순. 즉 공통값은 `.env`, 환경별 차이는 `.env.development`/`.env.production`에 둔다.

```bash
# 개발 (Tailwind watch + nodemon 동시 실행, 권장)
npm run dev:all

# 개발 (서버만, .env 사용, 포트 3000)
npm run dev

# CSS 빌드
npm run build:css

# CSS 감시 모드
npm run watch:css

# 프로덕션 실행
npm start

# PM2 클러스터 모드 실행
npm run pm2:start

# DB 초기화 (테이블 생성 + 시드 데이터)
npm run init:db

# DB 접근 (mysql-client 사용, node mysql2 사용 금지)
mysql -h $DB_HOST -u $DB_USER -p"$DB_PASS" $DB_NAME
```

### Database Access Rules

- **DB 조회/조작 시 반드시 `mysql` CLI 클라이언트(mysql-client)를 사용**할 것 (node mysql2 직접 실행 금지)
- 접속 정보는 `dev-mall/.env`(개발) / `dev-mall/.env.production`(상용)을 참조
- 현재 개발 DB 접속 (MySQL 8.4 @ ydata.co.kr):

  ```bash
  mysql -h ydata.co.kr -u ydatasvc -p'NEWtec4075@@' dev_mall
  # 단발 쿼리
  mysql -h ydata.co.kr -u ydatasvc -p'NEWtec4075@@' dev_mall -e "SELECT ... ;"
  ```

- `dev_mall`(@ydata.co.kr)이 이 프로젝트의 DB이자 소스 오브 트루스다. (초기 데이터는 과거 외부 소스에서 1회 덤프·이관, 35개 테이블 — 해당 소스 서버는 현재 이 프로젝트와 무관)

#### 테스트용 관리자 로그인 (`/admin/login`)

개발/테스트 편의를 위한 계정입니다. (비공개 저장소이므로 여기에 기재)

| 구분 | 값 |
|------|-----|
| URL | `http://localhost:3000/admin/login` |
| 아이디 | `tracer999` |
| 비밀번호 | `NEWtec4075@@` |
| 권한 | `super_admin`, 2FA 미사용(바로 로그인) |

> 그 외 `admin2`, `bsfkorea` 계정도 `super_admin`으로 존재합니다(비밀번호는 별도 관리). 비밀번호는 `admins` 테이블에 bcrypt(rounds=10)로 저장됩니다.

### Project Structure

```
app.js                    # Express 서버 진입점 (미들웨어 파이프라인)
config/
  db.js                   # MySQL 커넥션 풀 (10 connections)
  passport.js             # OAuth 전략 (Google, Kakao)
  systemSettings.js       # DB system_settings → process.env 로딩
controllers/
  mainController.js       # 홈페이지
  productController.js    # 상품 목록/상세
  cartController.js       # 장바구니 (routes/cart.js에 인라인)
  checkoutController.js   # 주문/결제
  noticeController.js     # 공지사항
  admin/                  # 관리자 컨트롤러 (15+개)
routes/
  index.js                # / (홈, 검색)
  auth.js                 # /auth (OAuth 로그인/회원가입)
  products.js             # /products
  cart.js                 # /cart
  checkout.js             # /checkout (Toss Payments)
  admin.js                # /admin (메인 라우터)
  admin/                  # /admin 서브라우트 (15+개)
middleware/
  adminAuth.js            # 관리자 세션 체크
  adminRoleGuard.js       # 역할 기반 메뉴 접근 제어
  adminMenu.js            # DB 기반 동적 사이드바 메뉴
  siteSettings.js         # 사이트 설정 → res.locals 주입
  cartData.js             # 장바구니 아이템 수
  menuData.js             # 테마 카테고리 네비게이션
  visitorLogger.js        # 방문자 추적
  upload.js               # Multer 파일 업로드 설정
services/
  emailService.js         # SMTP 이메일 발송
views/
  layouts/                # main_layout, admin_layout, manual_layout
  user/                   # 사용자 페이지 (14+개)
  admin/                  # 관리자 페이지 (20+개)
  partials/               # 공통 컴포넌트
public/
  css/input.css           # Tailwind 소스
  css/style.css           # Tailwind 컴파일 결과
  uploads/                # 상품 이미지 업로드 디렉토리
scripts/
  init_db.js              # DB 스키마 초기화
docs/                     # 개발자 문서 + 온라인 매뉴얼 소스
tables.sql                # 전체 DB 스키마 (20+ 테이블)
ecosystem.config.cjs      # PM2 클러스터 설정
```

### Database Schema (Key Tables)

| 테이블 | 용도 |
|--------|------|
| `users` | 소셜 로그인 사용자 (Google/Kakao) |
| `admins` | 관리자 계정 (bcrypt, 2FA) |
| `products` | 상품 마스터 (가격, 재고, SEO slug) |
| `categories` | 카테고리 (NORMAL/THEME 계층 구조) |
| `orders` / `order_items` | 주문 (Toss Payments 연동) |
| `carts` | 장바구니 |
| `coupons` / `user_coupons` | 쿠폰 시스템 |
| `point_transactions` | 포인트 적립/차감 원장 |
| `site_settings` | 사이트 설정 (회사정보, 브랜드 색상, GA4) |
| `system_settings` | 시스템 설정 (API 키, OAuth, SMTP, 결제) |
| `admin_menus` | 관리자 사이드바 메뉴 (역할별 노출) |
| `banners` | 배너 (메인/카테고리/팝업) |
| `visitor_logs` | 방문자 통계 |
| `search_logs` | 검색어 분석 |

### Code Conventions

- **컨트롤러 액션명**: `getList`, `getDetail`, `postForm`, `postUpdate`, `postDelete`
- **DB 컬럼**: snake_case (`created_at`, `user_id`)
- **URL 경로**: kebab-case (`/admin/site-settings`)
- **JS 파일/변수**: camelCase (`productController.js`)
- **SQL**: 파라미터화된 쿼리 사용 (`pool.query('SELECT * FROM x WHERE id = ?', [id])`)
- **비동기**: async/await 패턴 + try-catch 에러 처리
- **트랜잭션**: 결제 처리 등 데이터 정합성이 필요한 곳에서 사용

### Architecture Patterns

- **MVC**: routes → controllers → DB(raw SQL) → views(EJS)
- **미들웨어 체인**: 요청 → body parser → session → passport → logging → global vars → site settings → visitor log → menu data → cart data → routes → error handler
- **설정 관리**: `.env` 기본값 + `system_settings` 테이블 오버라이드 (관리자 페이지에서 변경 가능)
- **인증**: 사용자(OAuth only) / 관리자(ID/PW + 선택적 2FA 이메일)
- **접근 제어**: `adminAuth` → `adminMenu` → `adminRoleGuard` 미들웨어 체인
- **SEO**: 상품 slug URL (`/products/{slug}`), JSON-LD, OG 태그
- **이미지 업로드**: Multer → `/public/uploads/` 로컬 저장

### Environment Variables

비공개 저장소이므로 `.env` 계열은 git으로 추적·공유한다([저장소 운영 정책](#저장소-운영-정책) 참고). 파일별 용도:

- `dev-mall/.env` — 공통 기본값 (항상 먼저 로드됨)
- `dev-mall/.env.development` — 개발 오버라이드 (`npm run dev`, 포트 3000). `.env` 다음에 로드되어 덮어씀
- `dev-mall/.env.production` — 상용 오버라이드 (`NODE_ENV=production`, 포트 3006). `.env` 다음에 로드되어 덮어씀

현재 `.env`(개발) 핵심 값:

```
PORT=3000

# DB (MySQL 8.4 @ ydata.co.kr)
DB_HOST=ydata.co.kr
DB_USER=ydatasvc
DB_PASS=NEWtec4075@@
DB_NAME=dev_mall

# Redis
REDIS_HOST=ydata.co.kr
REDIS_PORT=6380
REDIS_PASSWORD=NEWtec4075@

# Session
SESSION_SECRET=maill-NEWtec4075@@
```

추가 설정(OAuth, SMTP, Toss Payments, OpenAI 등)은 DB `system_settings` 테이블에서 관리하며, 관리자 페이지 `/admin/settings`에서 수정 가능(`.env` 값을 오버라이드).

### Key Workflows

- **상품 등록**: `/admin/products/new` → 이미지 업로드(Multer) → DB INSERT → SEO slug 자동 생성
- **결제 흐름**: 주문서 → 쿠폰/포인트 적용 → Toss Payments 위젯 → 결제 확인 → 재고 차감(트랜잭션)
- **회원 가입**: OAuth 로그인 → signup-finish (전화/주소) → 약관 동의 → is_active=1 → 신규가입 쿠폰 자동 지급
- **관리자 로그인**: ID/PW → 2FA 활성화 시 이메일 인증코드(5분) → 세션 생성

### Testing

테스트 프레임워크 미설정. 수동 테스트 방식:
- `/admin/design-guide` (UI 컴포넌트 프리뷰)
- 브라우저 개발자 도구 + Postman

### Notes

- PM2 클러스터 모드 사용 시 Redis 필수 (세션 공유)
- `system_settings` 테이블 값이 `.env` 값을 오버라이드
- 상품 이미지는 로컬 파일 시스템(`/public/uploads/`)에 저장
- 커밋 메시지는 한국어로 작성
