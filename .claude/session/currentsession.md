# spf-mall 작업 세션 (이어가기용)

> 이 파일은 "세션 저장" 요청 시 **전체 덮어쓰기**된다(히스토리 없음). "세션 로드" 시 이 파일을 읽어 연속 작업한다.
> 최종 저장: 2026-06-30

## 1. 프로젝트 개요

- **목표**: 자체 DB 없이 **Shopify를 백엔드(SoT)** 로 쓰는 **Node.js/Next.js 헤드리스 쇼핑몰** MVP.
- **앱 폴더**: `spf-mall/` (모노레포 신규 서브프로젝트, dev-mall/shopifyApp과 동급)
- **설계 문서**: `docs/develop/spf-mall/` (README + 01~09). 진행 체크리스트는 `06-dev-plan-checklist.md`.
- **스토어**: 기존 `ydatasvcmall.myshopify.com` 재사용(전용 Custom App). 마켓 4개: KR(KRW)/US(USD)/JP(JPY)/CN(CNY).

## 2. 환경/운영 (중요)

- **런타임**: Node.js **22.23.1** (nvm). 시스템 기본은 Node 18이므로 항상 nvm로 22 사용.
- **포트**: spf-mall=**3307** (`PORT=3307 next dev/start`), dev-mall=3006.
- **실행/관리**: 루트 `./pm2-apps.sh {start|restart|stop|status|logs|build}` — dev-mall+spf-mall를 PM2로 일괄 관리(spf-mall은 빌드 후 기동). 현재 PM2에 `spf-mall` online.
- **브라우저 확인**: http://localhost:3307 (홈/products/cart 동작, 마켓 전환 시 통화+UI언어 전환).
- **환경변수**: `spf-mall/.env.local`(gitignore) — `SHOPIFY_STOREFRONT_API_TOKEN` 입력됨, 스토어/버전/기본마켓 채워짐. `APP_BASE_URL=http://localhost:3307`. Customer Account API 자격증명(별도)은 **P3에서 입력 예정**.
- **Git push 주의**: Windows쪽 SSH 키는 권한 없음. **WSL에서 push** 해야 함: `wsl -d Ubuntu -- bash -lc 'cd /home/ikcho/dev/nodeWs/shopify-test && git push origin main'` (joynet3 계정).
- **셸 주의**: Git Bash↔WSL 경로변환 때문에 인라인 `for`/`$()`/긴 명령이 깨짐. **스크립트 파일로 작성 후** `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' wsl -d Ubuntu -- bash /path/script.sh` 로 실행. nvm 로드: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22`.

## 3. 지금까지 완료 (마지막 수행 내용)

- **P-1 결정**: 스토어=기존 재사용 / 배포=office.ydata.co.kr 신규 URL / Markets=적용(기존 마켓만) / Tailwind / API 2026-04.
- **P0 셋업**: Next.js 16(App Router)+TS+Tailwind v4, `lib/shopify/storefront.ts`+products/queries/types, 연결 검증 OK.
- **P1 상품**: `/products`(목록·더보기), `/products/[handle]`(상세·옵션·가격), 홈, 헤더, 마켓 셀렉터(@inContext).
- **P2 장바구니·결제**: Cart API(`lib/shopify/cart*`), `/api/cart`(GET/POST/PATCH/DELETE), `AddToCartButton`, `/cart`(CartView), 결제하기→`checkoutUrl`(Hosted Checkout), buyerIdentity.countryCode로 통화 일치. 스모크 검증 OK.
- **버그픽스**: ① 한글 handle 상세 404 → `decodeURIComponent`(Next가 param 미디코딩). ② 마켓 변경 시 목록 미갱신 → `ProductGrid key={market.country}`로 리마운트.
- **i18n A+B** (08-i18n.md):
  - A) 국가→언어 매핑(`lib/shopify/market.ts` `COUNTRY_LANGUAGE`), `/api/market`에서 언어 도출, `formatMoney(locale)`.
  - B) UI 사전 `lib/i18n/dictionaries.ts`(ko/en/ja/zh-CN) + `components/i18n/I18nProvider.tsx`(`useT`/`useLocale`). 전 컴포넌트·페이지 적용. 검증: 국가 전환 시 UI 문구+통화 동시 전환.
- **문서 추가**: 08-i18n.md, 09-shopify-apps.md(설치앱 헤드리스 활용성 검증: Search&Discovery/Translate&Adapt/Shop Pay는 동작, Smart SEO/Inbox/Pinterest/Forms는 테마앱이라 직접 임베드 필요).
- **마지막 커밋**: `d91123e` (i18n A+B + 문서). 모두 origin/main 푸시 완료.

## 4. 다음에 이어서 할 일 (우선순위)

1. **i18n C (데이터, 권장 선행)**: Shopify **Translate & Adapt**로 상품명·설명·옵션 번역 입력(자동번역 후 검수). 채우면 코드 변경 없이 `@inContext(language)`로 콘텐츠가 현지화됨. **현재는 번역 미입력이라 비-KR에서 상품 텍스트가 한국어로 폴백**됨(UI 문구는 이미 현지화됨).
2. **P3 로그인 (Customer Account API OAuth)**:
   - Customer Account API **전용 자격증명**(Storefront/Custom App과 별개) 확인 → `.env.local`의 `SHOPIFY_CUSTOMER_ACCOUNT_*` 입력. **사용자가 P3에서 확인 예정**.
   - redirect URL 등록: `{APP_BASE_URL}/api/auth/callback`.
   - 구현: `lib/auth.ts`(PKCE), `/api/auth/login|callback|logout`, `lib/session.ts`(httpOnly 세션), `middleware.ts`(`/account/**` 보호). 설계: 03 §3.3, 06 P3.
3. **P4 주문·배송 조회**: `customer.orders`/`order(id)`/`order.fulfillments`, `/account`·`/account/orders[/[id]]`. (필드명 버전 확인)
4. **P5 다듬기**: 로딩/에러 바운더리, 반응형, SEO(generateMetadata+JSON-LD; Smart SEO는 헤드리스 미적용), 빌드 회귀.
5. **마이너 후속**:
   - 페이지 `<title>`(metadata)이 하드코딩 한국어 → `generateMetadata`로 언어별 현지화.
   - 검색 기능: Search & Discovery 기반 Storefront `search`/`predictiveSearch`.
   - 배포: office.ydata.co.kr에 신규 app URL로 기동(`APP_BASE_URL` 교체, OAuth redirect 등록).

## 5. 핵심 파일 포인터

- Storefront 클라이언트: `spf-mall/lib/shopify/storefront.ts`
- 상품/쿼리/타입: `lib/shopify/products.ts`, `queries.ts`, `cart-queries.ts`, `types.ts`
- 장바구니: `lib/shopify/cart.ts`, `app/api/cart/route.ts`, `components/cart/*`
- 마켓: `lib/shopify/market.ts`, `app/api/market/route.ts`, `components/market/MarketSelector.tsx`
- i18n: `lib/i18n/dictionaries.ts`, `components/i18n/I18nProvider.tsx`
- 페이지: `app/page.tsx`, `app/(shop)/products/page.tsx`, `app/(shop)/products/[handle]/page.tsx`, `app/(shop)/cart/page.tsx`, `app/layout.tsx`
- PM2: 루트 `pm2-apps.sh`, `spf-mall/ecosystem.config.cjs`
- 연결점검: `cd spf-mall && npm run check:shopify`

## 6. 검증 방법 (회귀)

- 빌드: `cd spf-mall && npm run build` (Node 22).
- 연결: `npm run check:shopify` → 상품 1건 조회.
- 마켓/i18n: `/api/market`에 `{country}` POST 후 `/products` 응답에서 통화/UI문구 전환 확인.
- 상세 200: `/products/맥주효모-분말-500g팩` (한글 handle).
