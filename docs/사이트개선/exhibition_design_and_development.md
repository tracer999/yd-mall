# 기획전 관리 및 사용자 화면 설계/개발 설계

> **개정 2026-07-10 — dev-mall 저장소 실정 반영.**
> 최초 문서는 일반적인 쇼핑몰 빌더를 전제로 쓰였다. 이 저장소(Express 5 + EJS SSR, 멀티몰)에
> 그대로 적용하면 깨지는 부분이 있어 아래를 개정했다. 개정 근거는 각 절에 인라인으로 적었다.
>
> | 항목 | 최초안 | 개정 | 사유 |
> |---|---|---|---|
> | 목록 URL | `/exhibitions` | **`/exhibition`** | `feature_menu.EXHIBITION.default_path='/exhibition'` 이 이미 `module_ready=1` 로 GNB 에 떠 있다. 복수형으로 바꾸면 살아있는 메뉴가 404 된다 |
> | 커스텀 메뉴 컬럼 | `link_target_id` | **`link_target`** | 실제 `custom_menu` 컬럼명 |
> | FK 타입 | 전부 `BIGINT` | **products/coupons/categories 참조는 `int`** | `products.id`·`coupons.id` 가 `int`. 타입이 다르면 FK 생성 자체가 실패한다 |
> | 관리자 API | REST JSON `/admin/api/...` | **폼 POST + EJS + redirect** | 이 저장소 관리자 표준 패턴(page-builder 만 예외적으로 JSON) |
> | 사용자 API | REST JSON `/api/exhibitions` | **SSR EJS 라우트** | 헤드리스가 아니다 |
> | `status` | 예정/진행중/종료/숨김 저장 | **운영상태(DRAFT/PUBLISHED/HIDDEN)만 저장**, 예정/진행중/종료는 `start_at`·`end_at` 에서 파생 | 기간과 상태를 이중 관리하면 반드시 어긋난다 |
> | 1차 테이블 | 5종 | **3종**(`exhibition`, `exhibition_section`, `exhibition_product`) | 카테고리 필터는 2차, 쿠폰은 고객용 다운로드 UX 자체가 없다 |
> | 성과 측정 | `order_item.source_type/source_id` | **2차로 미룸**(`order_items` ALTER 필요) | 1차 범위 밖 |
>
> **배포 순서 주의.** `feature_menu.EXHIBITION.module_ready` 는 **이미 1** 이라 GNB 에 메뉴가 노출 중이고
> 현재는 `routes/feature.js` 의 준비중 랜딩으로 간다. 관리자에서 기획전을 1건도 만들지 않은 채
> 고객 라우트를 실제 목록으로 바꾸면 **운영에 빈 목록이 뜬다**. 반드시 `관리자 → 기획전 1건 등록 →
> 고객 라우트 교체` 순서로 가거나, 목록이 0건이면 준비중 랜딩으로 폴백해야 한다.
> (개발·운영 DB 가 동일하므로 이 순서가 곧 운영 노출 순서다.)

## 0. 설계 전제

본 문서는 쇼핑몰 빌더에서 **기획전(Plan Shop / Promotion Collection)** 기능을 별도 도메인으로 설계하기 위한 문서이다.

기획전은 이벤트와 유사해 보이지만, 실제 서비스 구조에서는 다음 이유로 **이벤트와 분리 관리**하는 것이 적절하다.

- 이벤트는 응모, 쿠폰, 출석체크, 룰렛, 사은품 지급 등 **참여/혜택 중심**이다.
- 기획전은 특정 테마, 브랜드, 시즌, 콜라보, 상품군을 묶어 판매하는 **상품 전시/판매 중심**이다.
- 기획전 상세 화면은 단순 공지형 이벤트 페이지가 아니라, 상품 카테고리/탭/상품 카드/구매 연결이 있는 **쇼핑 메뉴형 랜딩 페이지**에 가깝다.
- 기획전은 전체 목록 메뉴에서도 진입하지만, 특정 기획전은 `xxx와 콜라보`, `브랜드 위크`, `시즌 특가전` 같은 커스텀 메뉴에서 직접 진입할 수 있어야 한다.

참고 화면 기준:

- 쇼핑엔티 기획전 목록은 “지금 인기있는 기획전”, 카테고리 필터, 전체/진행중/종료 상태 필터 구조를 가진다.
- SK스토아 기획전 목록은 기획전 카드 목록과 카테고리 필터를 제공한다.
- SK스토아 기획전 상세는 기획전 제목, 기간, 공유, 대표 이미지, 내부 탭, 상품 목록, 가격/혜택/평점 등이 포함된 쇼핑형 화면이다.

---

## 1. 기획전과 이벤트의 분리 기준

### 1-1. 이벤트

```text
이벤트
├─ 쿠폰팩
├─ 룰렛
├─ 출석체크
├─ 구매 인증
├─ 사은품 응모
├─ 경품 이벤트
├─ 회원가입 혜택
└─ 카드/멤버십 혜택 안내
```

### 1-2. 기획전

```text
기획전
├─ 브랜드 기획전
├─ 시즌 기획전
├─ 카테고리 기획전
├─ 콜라보 기획전
├─ MD 추천전
├─ 방송 연계 기획전
├─ 특정 상품군 모음전
└─ 가격/혜택 중심 상품 전시
```

### 1-3. 최종 판단

```text
이벤트 = 참여/혜택/공지 중심
기획전 = 상품 전시/판매 중심
```

따라서 관리자 메뉴도 다음처럼 분리하는 것이 맞다.

```text
관리자
├─ 이벤트 관리
└─ 기획전 관리
```

---

## 2. 기획전 사용자 화면 구조

## 2-1. 기획전 목록 화면

### URL (개정: `/exhibition` 단수 확정)

```text
/exhibition          ← 표준. 변경 불가
```

**이 저장소에서는 선택지가 없다.** `feature_menu` 테이블에 다음 행이 이미 있고 `module_ready=1` 이라
스토어프론트 GNB 에 "기획전" 메뉴가 노출 중이다.

```text
feature_code=EXHIBITION, default_name=기획전, default_path=/exhibition, position=gnb, module_ready=1
```

`default_path` 는 운영자가 바꿀 수 없는 표준 URL 이다(`feature_menu.default_path` 주석). 복수형
`/exhibitions` 로 만들면 살아있는 GNB 메뉴가 404 가 된다. 현재 `/exhibition` 은
`routes/feature.js:130` 의 `comingSoon('exhibition')` 준비중 랜딩을 렌더한다 — 이 핸들러를
실제 목록 렌더로 교체하는 것이 1차 작업이다.

### 화면 구성

```text
[Header / GNB]

[페이지 타이틀]
기획전

[상단 추천 기획전]
- 대표 배너형 카드 1~2개
- 오늘의 추천 기획전
- 브랜드/시즌 핵심 기획전

[카테고리 필터]
전체 | TV쇼핑 | 의류 | 잡화 | 뷰티 | 식품 | 건강 | 가전 | 주방 | 선물하기 ...

[상태 필터]
전체 | 진행중 | 종료 | 예정

[정렬]
최신순 | 인기순 | 종료임박순 | MD추천순

[기획전 카드 리스트]
- 썸네일
- 기획전명
- 짧은 설명
- 기간
- 배지
- 카테고리
- 진행 상태

[페이지네이션 또는 무한스크롤]
```

### 기획전 카드 표시 항목

| 항목 | 설명 | 필수 |
|---|---|---:|
| 썸네일 이미지 | 목록 카드 이미지 | 필수 |
| 기획전명 | 예: 하다라보 보습케어 특가 | 필수 |
| 설명 | 한 줄 요약 | 권장 |
| 기간 | 시작일~종료일 | 필수 |
| 상태 | 예정/진행중/종료 | 필수 |
| 카테고리 | 뷰티, 식품 등 | 권장 |
| 배지 | HOT, NEW, 단독, 콜라보 | 선택 |
| 연결 상품 수 | 상세 진입 유도 | 선택 |

---

## 2-2. 기획전 상세 화면

### URL (개정)

```text
/exhibition/{slug}          ← 정규 URL (SEO)
/exhibition/view/{id}       ← id 진입 시 301 → slug
```

`slug` 를 정규 URL 로 쓰되, id 로도 진입 가능해야 한다. 커스텀 메뉴가 `link_target`(숫자 id)만
들고 있어서, id → slug 301 리다이렉트가 없으면 `navigationService` 가 메뉴를 그릴 때마다
`exhibition` 테이블을 조인해 slug 를 끌어와야 한다. 이는 `products` 가 이미 쓰는 방식이다
(`/products/view/754` → 301 → `/products/cj-2054879853`).

```text
/exhibition/hadalabo-moisture-special
/exhibition/brand-week-summer-2026
```

slug 유니크는 **몰 스코프**다: `UNIQUE KEY (mall_id, slug)`. `products.slug` 가 전역 유니크라
몰 간 충돌을 일으키는 것과 달리, 기획전은 처음부터 몰별로 같은 slug 를 허용한다.

### 상세 화면 기본 구조

```text
[Header / GNB]

[기획전 헤더]
- 기획전명
- 기간
- 공유 버튼
- 관심/찜
- 상태 배지

[대표 비주얼]
- PC 대표 이미지
- Mobile 대표 이미지
- 설명 문구
- CTA 버튼 선택 가능

[기획전 내부 탭]
전체 | MD추천 | 브랜드 A | 브랜드 B | 세트상품 | 단품상품 ...

[상품 섹션]
섹션 1: MD추천
섹션 2: 베스트
섹션 3: 카테고리별 상품
섹션 4: 브랜드별 상품

[상품 카드]
- 이미지
- 브랜드
- 상품명
- 할인율
- 판매가
- 정상가
- 배송비
- 멤버십/카드 혜택
- 평점/리뷰수
- 좋아요
- 새창/상세 이동

[기획전 안내]
- 혜택 조건
- 쿠폰 조건
- 배송/반품 안내
- 이벤트 유의사항

[Footer]
```

### 상세 화면의 핵심 원칙

기획전 상세는 이벤트 상세처럼 이미지 한 장을 보여주는 페이지가 아니다. 반드시 **상품 전시와 구매 전환**이 중심이어야 한다.

```text
잘못된 방식:
기획전 상세 = HTML 이미지 배너 + 텍스트

권장 방식:
기획전 상세 = 대표 배너 + 내부 탭 + 상품 그룹 + 구매 가능한 상품 카드
```

---

## 3. 커스텀 메뉴와 기획전 연결

기획전은 일반 메뉴의 “기획전” 목록에서 들어갈 수도 있지만, 특정 기획전은 커스텀 메뉴에서 직접 연결되어야 한다.

예시:

```text
Header 커스텀 메뉴
├─ 산리오 콜라보
├─ 하다라보 특가
├─ 여름 뷰티위크
└─ 브랜드 대전
```

커스텀 메뉴 연결 방식 (개정: 컬럼명 `link_target`):

```text
custom_menu
├─ link_type   = 'EXHIBITION'   -- 이미 스키마 주석에 정의된 값
└─ link_target = exhibition.id  -- link_target_id 아님
```

**스키마는 이미 준비돼 있다.** `custom_menu.link_type` 주석에
`INTERNAL_PAGE / EXTERNAL_URL / CATEGORY / BRAND / EXHIBITION / PRODUCT_GROUP` 가 명시돼 있고
`link_target` 컬럼도 존재한다. 막혀 있는 곳은 **`services/menu/navigationService.js` 의
`LINK_RESOLVERS` 맵 하나**다.

```js
// services/menu/navigationService.js — 현재 상태
const LINK_RESOLVERS = {
    INTERNAL_PAGE: (m) => m.linkUrl || null,
    EXTERNAL_URL:  (m) => m.linkUrl || null,
    CATEGORY:      (m) => (m.linkTarget ? `/products/category/${m.linkTarget}` : null),
    BRAND:         (m) => (m.linkTarget ? `/products/brand/${m.linkTarget}` : null),
    // EXHIBITION, PRODUCT_GROUP: 모듈 미구현 → 의도적으로 미등록
};
```

리졸버가 없는 link_type 은 `getCustomMenus` 루프에서 `continue` 로 **렌더에서 제외**된다
(죽은 링크 구조적 차단). 따라서 관리자가 지금 EXHIBITION 커스텀 메뉴를 저장해도 GNB 에 뜨지 않는다.
1차 작업에서 아래 한 줄을 추가하면 열린다.

```js
    EXHIBITION: (m) => (m.linkTarget ? `/exhibition/view/${m.linkTarget}` : null),
```

id URL 로 보내고 상세 라우트가 slug 로 301 하는 이유는 §2-2 참고 — navigationService 가
slug 를 얻으려 조인하지 않게 하기 위함이다.

이 방식의 장점:

- 운영자가 잘못된 URL을 입력할 위험이 줄어든다.
- 기획전 종료 시 메뉴를 자동 숨김 처리할 수 있다(`custom_menu.visible_start_at`/`visible_end_at` 활용).
- 기획전 권한/노출 기간과 메뉴 노출 기간을 동기화할 수 있다.
- 메뉴 클릭 통계를 기획전 성과로 연결할 수 있다(2차).

---

## 4. 관리자 메뉴 설계 (개정: 기존 메뉴 트리에 편입)

`admin_menus` 테이블에 **이미 "페이지/전시 관리"(id=31) 그룹 행**이 있고 그 아래
"페이지 빌더"(id=21), "전시관리"(id=19)가 붙어 있다. 기획전은 여기에 형제로 추가한다.

```text
관리자
└─ 페이지/전시 관리                (admin_menus.id=31, path=NULL 그룹 행)
    ├─ 페이지 빌더                 /admin/page-builder
    ├─ 전시관리                    /admin/display
    └─ 기획전 관리 ★신규           /admin/exhibitions
```

**RBAC.** `routes/admin.js` 마운트 시 `requireMenuAccess('/admin/exhibitions')` 를 끼우고,
`admin_menus` 에 `path='/admin/exhibitions'`, `visible_roles='super_admin,admin,content_admin'`
행을 넣는다(형제 메뉴와 동일). 메뉴 행이 없으면 `middleware/adminRoleGuard.js` 가 `admin` 만 허용한다.

```js
// routes/admin.js — 형제 라우트와 동일 패턴
router.use('/exhibitions', requireMenuAccess('/admin/exhibitions'), require('./admin/exhibitions'));
```

**1차 화면은 아래 3개로 한정한다.** 카테고리/배너/성과 통계는 2·3차.

```text
기획전 관리
├─ 기획전 목록 (검색·상태 필터)
├─ 기획전 등록/수정 (기본정보 + 이미지 + 섹션 + 상품 연결)
└─ 기획전 삭제
```

---

## 4-1. 기획전 목록 관리

### 목록 컬럼

| 컬럼 | 설명 |
|---|---|
| ID | 기획전 ID |
| 썸네일 | 목록 이미지 |
| 기획전명 | 제목 |
| 카테고리 | 뷰티, 식품 등 |
| 상태 | 예정/진행중/종료/숨김 |
| 시작일 | 노출 시작 |
| 종료일 | 노출 종료 |
| 목록 노출 | 기획전 목록 노출 여부 |
| 커스텀 메뉴 연결 | 연결된 메뉴 여부 |
| 상품 수 | 연결 상품 수 |
| 매출 | 기획전 매출 |
| 수정 | 관리 버튼 |

### 필터

```text
- 상태
- 카테고리
- 기간
- 노출 여부
- 커스텀 메뉴 연결 여부
- 키워드
```

---

## 4-2. 기획전 등록/수정 항목

### 기본 정보

| 항목 | 설명 |
|---|---|
| 기획전명 | 사용자 화면 제목 |
| slug | SEO URL |
| 짧은 설명 | 목록 카드/상세 헤더 요약 |
| 상세 설명 | 상세 상단 설명 |
| 기획전 유형 | 브랜드/시즌/카테고리/콜라보/방송연계 |
| 카테고리 | 기획전 분류 |
| 상태 | 예정/진행중/종료/숨김 |
| 시작일 | 노출 시작 |
| 종료일 | 노출 종료 |
| 목록 노출 여부 | 기획전 목록에 표시할지 |
| 검색 노출 여부 | 사이트 검색 결과 노출 |
| 공유 허용 여부 | 카카오/페이스북/URL 공유 |

### 이미지

| 항목 | 설명 |
|---|---|
| 목록 썸네일 | 기획전 리스트 카드 |
| PC 대표 이미지 | 상세 상단 배너 |
| Mobile 대표 이미지 | 모바일 상세 배너 |
| OG 이미지 | 공유용 이미지 |

### 전시 설정

| 항목 | 설명 |
|---|---|
| 상세 템플릿 | 기본형/탭형/브랜드형/이미지형 |
| 내부 탭 사용 여부 | 전체, MD추천 등 |
| 상품 정렬 기본값 | 추천순/판매순/낮은가격순 |
| 품절 상품 노출 | 노출/숨김 |
| 종료 후 접근 | 접근 허용/차단/종료 안내 |
| 종료 후 구매 | 허용/차단 |

---

## 5. 기획전 상세 템플릿 유형

### 5-1. 기본 탭형

가장 권장하는 표준 템플릿.

```text
대표 배너
→ 내부 탭
→ 탭별 상품 그룹
→ 안내/유의사항
```

적합한 경우:

- 브랜드 기획전
- 상품군 모음전
- 시즌 특가전

### 5-2. 이미지 스토리형 + 상품 섹션

```text
대표 이미지
→ 설명 이미지/콘텐츠
→ 관련 상품 그룹
```

적합한 경우:

- 콜라보 기획전
- 브랜드 캠페인
- 스토리텔링형 상품전

주의:

- 상세 이미지만 길게 나열하지 말고, 상품 섹션을 반드시 포함해야 한다.

### 5-3. 카테고리 매장형

```text
대표 배너
→ 카테고리 탭
→ 카테고리별 상품 리스트
```

적합한 경우:

- 뷰티 모음전
- 식품 모음전
- 생활용품 모음전

### 5-4. 브랜드관형

```text
브랜드 소개
→ 브랜드 혜택
→ 대표 상품
→ 전체 상품
```

적합한 경우:

- 브랜드 위크
- 단독 브랜드전
- 콜라보 브랜드전

---

## 6. 상품 연결 설계

기획전 상품은 상품 자체가 아니라 **전시 매핑**으로 관리해야 한다.

```text
product
└─ exhibition_product
```

### 상품 연결 방식

| 방식 | 설명 |
|---|---|
| 수동 선택 | 운영자가 상품 직접 선택 |
| 조건 자동 | 카테고리/브랜드/태그/가격 조건 |
| 혼합형 | 자동 그룹 + 수동 고정 상품 |
| CSV 업로드 | 대량 상품 연결 |

### 섹션별 상품 구성

```text
exhibition_section
├─ MD추천
├─ 베스트
├─ 세트상품
├─ 단품상품
├─ 브랜드별
└─ 가격대별
```

---

## 7. DB 설계 (개정: 타입·컨벤션 정합)

### 7-0. 최초안에서 반드시 고쳐야 했던 것

| 문제 | 최초안 | 결과 | 개정 |
|---|---|---|---|
| **FK 타입 불일치** | `product_id BIGINT`, `coupon_id BIGINT` | `products.id`·`coupons.id` 가 `int` 라 **FK 생성이 실패**한다 | 참조 컬럼을 `int` 로 |
| BOOLEAN | `BOOLEAN DEFAULT TRUE` | MySQL 이 `tinyint(1)` 로 바꾸지만 저장소 표기와 어긋남 | `tinyint(1) NOT NULL DEFAULT 1` |
| 타임스탬프 | `DATETIME NOT NULL` (기본값 없음) | INSERT 마다 값을 넣어야 함 | `datetime DEFAULT CURRENT_TIMESTAMP` |
| FK·인덱스 | 없음 | 고아 행 발생, `mall_id` 조회 풀스캔 | 명시적 FK + `(mall_id, …)` 인덱스 |
| `status` | 예정/진행중/종료/숨김 저장 | 기간과 이중 관리 → 반드시 어긋남 | 운영상태만 저장, 노출상태는 파생 |

**`exhibition.id` 계열은 `bigint` 를 유지한다.** `page`·`product_group`·`custom_menu` 등
신규 세대 테이블이 모두 `bigint` 이고, 이들끼리만 참조하므로 불일치가 없다.
`products`·`coupons`·`categories` 는 구세대 `int` 라 **이들을 참조할 때만 `int`** 를 쓴다.

### 7-1. status 의 의미 (개정)

```text
exhibition.status  = 운영자가 정하는 상태   : DRAFT | PUBLISHED | HIDDEN
노출 상태(예정/진행중/종료) = start_at·end_at 에서 파생 (컬럼 없음)
```

```sql
-- 고객 화면 노출 조건
status = 'PUBLISHED' AND list_visible = 1
  AND start_at <= NOW()
  AND (end_at IS NULL OR end_at >= NOW())     -- '진행중'

-- 파생 규칙
NOW() <  start_at                        → 예정
start_at <= NOW() <= end_at (or NULL)    → 진행중
NOW() >  end_at                          → 종료
```

### 7-2. exhibition

```sql
CREATE TABLE exhibition (
  id                    bigint       NOT NULL AUTO_INCREMENT,
  mall_id               bigint       NOT NULL DEFAULT 1 COMMENT '몰 ID',

  title                 varchar(200) NOT NULL COMMENT '기획전명',
  slug                  varchar(200) NOT NULL COMMENT 'SEO URL 슬러그(몰 스코프 유니크)',
  summary               varchar(500) DEFAULT NULL COMMENT '목록 카드·상세 헤더 한 줄 요약',
  description           text         COMMENT '상세 상단 설명(HTML 허용 → 렌더 시 새니타이즈)',

  exhibition_type       varchar(50)  NOT NULL DEFAULT 'THEME' COMMENT 'BRAND/SEASON/CATEGORY/COLLAB/BROADCAST/THEME',

  list_thumbnail_url    varchar(500) DEFAULT NULL COMMENT '목록 카드 썸네일',
  pc_hero_image_url     varchar(500) DEFAULT NULL COMMENT '상세 PC 대표 이미지',
  mobile_hero_image_url varchar(500) DEFAULT NULL COMMENT '상세 모바일 대표 이미지',
  og_image_url          varchar(500) DEFAULT NULL COMMENT '공유용 OG 이미지',

  status                varchar(30)  NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/HIDDEN. 예정·진행중·종료는 기간에서 파생',
  start_at              datetime     NOT NULL COMMENT '노출 시작',
  end_at                datetime     DEFAULT NULL COMMENT '노출 종료(NULL=무기한)',

  list_visible          tinyint(1)   NOT NULL DEFAULT 1 COMMENT '기획전 목록 노출',
  search_visible        tinyint(1)   NOT NULL DEFAULT 1 COMMENT '사이트 검색 노출',
  share_enabled         tinyint(1)   NOT NULL DEFAULT 1 COMMENT '공유 버튼 노출',

  detail_template_type  varchar(50)  NOT NULL DEFAULT 'TAB_SHOP' COMMENT 'TAB_SHOP/STORY/CATEGORY_SHOP/BRAND_SHOP',
  display_config_json   json         DEFAULT NULL COMMENT '템플릿별 추가 설정',

  ended_access_policy   varchar(30)  NOT NULL DEFAULT 'ALLOW' COMMENT '종료 후 접근: ALLOW/BLOCK/NOTICE',
  ended_purchase_policy varchar(30)  NOT NULL DEFAULT 'ALLOW' COMMENT '종료 후 구매: ALLOW/BLOCK',

  view_count            int          NOT NULL DEFAULT 0 COMMENT '상세 조회수',
  created_at            datetime     DEFAULT CURRENT_TIMESTAMP,
  updated_at            datetime     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_exhibition_mall_slug (mall_id, slug),
  KEY idx_exhibition_mall_status (mall_id, status, start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='기획전';
```

> `mall_id` 에 FK 를 걸지 않는 이유: `page`·`product_group`·`custom_menu` 등 기존 몰 스코프
> 테이블 어디에도 `mall` FK 가 없다. 관례를 따른다.

### 7-3. exhibition_section

```sql
CREATE TABLE exhibition_section (
  id                  bigint       NOT NULL AUTO_INCREMENT,
  exhibition_id       bigint       NOT NULL,

  section_name        varchar(100) NOT NULL COMMENT '탭·섹션 표시명 (예: MD추천)',
  section_code        varchar(100) NOT NULL COMMENT '기획전 내 식별자 (예: md-pick)',
  section_type        varchar(50)  NOT NULL DEFAULT 'PRODUCT_GRID' COMMENT 'PRODUCT_GRID/PRODUCT_CAROUSEL/HTML',

  sort_order          int          NOT NULL DEFAULT 0,
  is_tab              tinyint(1)   NOT NULL DEFAULT 1 COMMENT '내부 탭으로 노출',
  is_active           tinyint(1)   NOT NULL DEFAULT 1,

  display_config_json json         DEFAULT NULL,

  created_at          datetime     DEFAULT CURRENT_TIMESTAMP,
  updated_at          datetime     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_exh_section_code (exhibition_id, section_code),
  KEY idx_exh_section_sort (exhibition_id, sort_order),
  CONSTRAINT fk_exh_section_exhibition FOREIGN KEY (exhibition_id) REFERENCES exhibition (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='기획전 내부 섹션(탭)';
```

### 7-4. exhibition_product

```sql
CREATE TABLE exhibition_product (
  id               bigint       NOT NULL AUTO_INCREMENT,
  exhibition_id    bigint       NOT NULL,
  section_id       bigint       DEFAULT NULL COMMENT 'NULL=섹션 미배정(전체 탭에만 노출)',
  product_id       int          NOT NULL COMMENT 'products.id 가 int 다. BIGINT 로 두면 FK 실패',

  sort_order       int          NOT NULL DEFAULT 0,
  is_fixed         tinyint(1)   NOT NULL DEFAULT 0 COMMENT '자동 그룹에서도 상단 고정',
  display_badge    varchar(50)  DEFAULT NULL COMMENT '카드 위 노출 배지(기획전 한정)',
  display_comment  varchar(200) DEFAULT NULL COMMENT 'MD 코멘트',

  visible          tinyint(1)   NOT NULL DEFAULT 1,
  purchase_enabled tinyint(1)   NOT NULL DEFAULT 1,

  created_at       datetime     DEFAULT CURRENT_TIMESTAMP,
  updated_at       datetime     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_exh_product (exhibition_id, section_id, product_id),
  KEY idx_exh_product_sort (exhibition_id, section_id, sort_order),
  KEY idx_exh_product_product (product_id),
  CONSTRAINT fk_exh_product_exhibition FOREIGN KEY (exhibition_id) REFERENCES exhibition (id) ON DELETE CASCADE,
  CONSTRAINT fk_exh_product_section    FOREIGN KEY (section_id)    REFERENCES exhibition_section (id) ON DELETE CASCADE,
  CONSTRAINT fk_exh_product_product    FOREIGN KEY (product_id)    REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='기획전 상품 전시 매핑';
```

> `uk_exh_product` 에 `section_id` 가 NULL 이면 MySQL 유니크 제약이 걸리지 않는다(NULL≠NULL).
> 즉 섹션 미배정 상품은 중복 등록될 수 있으므로 **애플리케이션에서 막는다**.
>
> `product_id` FK 를 `ON DELETE CASCADE` 로 둔 이유: 상품이 사라지면 전시 매핑도 의미가 없다.
> `SET NULL` 은 `product_id NOT NULL` 과 충돌한다.

### 7-5. (2차) exhibition_category · exhibition_coupon

1차에서는 만들지 않는다.

- **`exhibition_category`** — 목록의 카테고리 필터용. 필터 자체가 2차 범위다. 1차는
  `exhibition_type` 만으로 충분하다.
- **`exhibition_coupon`** — `coupons` 테이블은 있으나 **고객이 받아가는 '다운로드 쿠폰' 개념과
  화면이 이 저장소에 없다**(`routes/feature.js` 의 COUPON 준비중 사유와 동일). 테이블만 만들면
  아무 데도 쓰이지 않는다. 쿠폰 다운로드 UX 가 생긴 뒤에 붙인다.
  만들 때는 `coupon_id int`(= `coupons.id` 타입).

---

## 8. 라우트 설계 (개정: REST JSON API → SSR)

**이 저장소는 헤드리스가 아니다.** 고객 화면은 Express 5 + EJS 서버사이드 렌더이고, 관리자 화면은
`POST` 폼 + `res.redirect` 가 표준이다(`menuController`, `featureMenuController`, `displayController`
전부 동일). REST JSON API 를 쓰는 곳은 신형 `pageBuilderController` 하나뿐이며, 그것도 에디터 셸은
EJS 이고 섹션 조작만 `fetch` 한다.

최초안의 `/api/exhibitions`·`/admin/api/exhibitions` 는 이 저장소에 존재하지 않는 관례다. 아래로 대체한다.

### 8-1. 고객 라우트 (SSR)

| 메서드 | 경로 | 컨트롤러 | 렌더 |
|---|---|---|---|
| GET | `/exhibition` | `exhibitionController.getList` | `user/exhibition/list.ejs` |
| GET | `/exhibition/view/:id` | `exhibitionController.redirectToSlug` | 301 → `/exhibition/{slug}` |
| GET | `/exhibition/:slug` | `exhibitionController.getDetail` | `user/exhibition/detail.ejs` |

쿼리스트링: `status`(예정/진행중/종료), `sort`(최신순/종료임박순), `page`.
`?tab={section_code}` 로 상세 내부 탭을 선택한다(탭 전환은 서버 렌더 + 앵커, JS 없이도 동작).

`/exhibition` 은 현재 `routes/feature.js:130` 의 `comingSoon('exhibition')` 이 잡고 있다.
이 라우트를 실제 컨트롤러로 옮기되, **목록이 0건이면 기존 준비중 랜딩으로 폴백**한다
(운영 GNB 에 빈 목록이 뜨는 것을 막는다 — 문서 상단 '배포 순서 주의' 참고).

### 8-2. 관리자 라우트 (폼 POST + EJS)

`routes/admin/exhibitions.js` 를 새로 만들고 `routes/admin.js` 에서
`requireMenuAccess('/admin/exhibitions')` 와 함께 마운트한다.

| 메서드 | 경로 | 액션 | 결과 |
|---|---|---|---|
| GET | `/admin/exhibitions` | `getList` | 목록 EJS(검색·상태 필터) |
| GET | `/admin/exhibitions/add` | `getAdd` | 등록 폼 |
| POST | `/admin/exhibitions/add` | `postAdd` | redirect → 수정 폼 |
| GET | `/admin/exhibitions/:id/edit` | `getEdit` | 수정 폼(섹션·상품 포함) |
| POST | `/admin/exhibitions/:id/edit` | `postEdit` | redirect `?saved=1` |
| POST | `/admin/exhibitions/:id/delete` | `postDelete` | redirect → 목록 |
| POST | `/admin/exhibitions/:id/sections` | `postSaveSections` | redirect(섹션 일괄 저장) |
| POST | `/admin/exhibitions/:id/products` | `postSaveProducts` | redirect(상품 매핑 일괄 저장) |
| GET | `/admin/exhibitions/product-search` | `getProductSearch` | **JSON** (상품 선택 모달용) |

마지막 하나만 JSON 이다. `displayController.getProductSearch` 가 같은 목적으로 이미 존재하므로
그 응답 형태를 따른다.

컨트롤러 액션명은 이 저장소의 가장 흔한 조합(`getList`/`getAdd`/`postAdd`/`getEdit`/`postEdit`/`postDelete`)을
그대로 쓴다.

### 8-3. 몰 스코프 불변식

```text
고객   : req.mallId       (middleware/mallContext.js)
관리자 : req.adminMallId  (middleware/adminMallContext.js)  ← 별도 세션 키. 혼용 금지
```

`exhibition` 의 모든 읽기·쓰기 쿼리에 `WHERE mall_id = ?` 를 건다. 하드코딩 `1` 금지,
없을 때만 `|| 1` 폴백. slug 조회도 `WHERE mall_id = ? AND slug = ?` 여야 한다
(몰 스코프 유니크이므로 slug 만으로는 행이 특정되지 않는다).

---

## 9. 화면 구성 (개정: React 컴포넌트 → EJS 파티셜)

이 저장소에는 React 가 없다. 컴포넌트 트리는 EJS 파티셜로 옮긴다.

```text
views/user/exhibition/
├─ list.ejs                      기획전 목록
└─ detail.ejs                    기획전 상세

views/partials/exhibition/
├─ card.ejs                      목록 카드 (썸네일·제목·기간·상태 배지)
├─ status_filter.ejs             전체/예정/진행중/종료
├─ hero.ejs                      상세 대표 비주얼 (PC/모바일 분기)
├─ tab_nav.ejs                   내부 탭 (?tab=section_code)
├─ product_section.ejs           섹션별 상품 그리드
└─ notice.ejs                    안내·유의사항
```

**상품 카드는 새로 만들지 않는다.** `views/partials/product_card.ejs` 를 그대로 재사용한다.

```ejs
<%- include('../product_card', { product: p, opts: { showBrand: true, showDiscountBadge: true } }) %>
```

이 파티셜은 `product` 객체(필수)와 `opts`(선택, 미전달 시 기본값)를 받는다. `exhibition_product` 의
`display_badge`·`display_comment` 는 카드 바깥에서 덧그린다 — 공용 파티셜을 기획전 전용으로
오염시키지 않는다.

**HTML 새니타이즈.** `exhibition.description` 과 `section_type='HTML'` 섹션은 운영자 입력 HTML 이다.
`services/display/` 가 `custom_html` 섹션에 쓰는 기존 새니타이저를 반드시 통과시킨다.

---

## 10. 성과 측정

### 이벤트 로그

```text
EXHIBITION_LIST_VIEW
EXHIBITION_DETAIL_VIEW
EXHIBITION_PRODUCT_CLICK
EXHIBITION_COUPON_DOWNLOAD
EXHIBITION_CART_CLICK
EXHIBITION_BUY_CLICK
EXHIBITION_ORDER_COMPLETE
CUSTOM_MENU_TO_EXHIBITION_CLICK
```

### 분석 지표

```text
- 기획전 목록 조회 수
- 기획전 상세 조회 수
- 상품 클릭 수
- 쿠폰 다운로드 수
- 장바구니 수
- 주문 수
- 매출
- 커스텀 메뉴 유입 수
- 카테고리별 성과
```

주문 아이템에는 출처를 남긴다.

```text
order_item.source_type = EXHIBITION
order_item.source_id = exhibition.id
```

> **개정: 2차로 미룬다.** `order_items` 에는 `source_type`·`source_id` 컬럼이 **없다**.
> 추가하려면 ALTER 가 필요하고, `checkoutController` 의 주문 생성 트랜잭션까지 손대야 한다.
> 결제 정합성이 걸린 경로라 기획전 1차와 분리한다.
>
> ```sql
> -- 2차에서 수행
> ALTER TABLE order_items
>   ADD COLUMN source_type varchar(30) DEFAULT NULL COMMENT '유입 출처: EXHIBITION 등',
>   ADD COLUMN source_id   bigint      DEFAULT NULL COMMENT '출처 리소스 id',
>   ADD KEY idx_order_items_source (source_type, source_id);
> ```
>
> 1차에서 조회수만 필요하면 `exhibition.view_count` 컬럼(§7-2)으로 충분하다.
> 방문 로그는 기존 `page_views`·`visitor_logs` 가 이미 전 페이지를 기록한다.

---

## 11. 개발 우선순위 (개정: 1차 범위 축소 + 배포 순서 고정)

### 1차 — 테이블 3종

```text
DB      exhibition · exhibition_section · exhibition_product  (3종만)
관리자   목록 / 등록·수정 / 삭제 / 섹션 편집 / 상품 수동 연결
고객     /exhibition 목록, /exhibition/{slug} 상세(TAB_SHOP 템플릿)
연결     navigationService LINK_RESOLVERS 에 EXHIBITION 추가
메뉴     admin_menus 에 '기획전 관리' 행 추가 (parent_id=31)
```

**배포 순서(고정).** `feature_menu.EXHIBITION.module_ready` 가 이미 1 이라 GNB 메뉴가 살아 있고,
개발 DB 와 운영 DB 가 같다. 순서를 어기면 운영에 빈 화면이 뜬다.

```text
1. CREATE TABLE  (3종)
2. 관리자 화면 배포 → 기획전 최소 1건 등록·발행
3. 고객 라우트 교체 (/exhibition → 실제 목록)
4. navigationService LINK_RESOLVERS 추가
```

3번을 2번보다 먼저 하면 안 된다. 안전장치로 **목록 0건이면 준비중 랜딩으로 폴백**하는 코드를
넣어두면 순서가 어긋나도 운영이 깨지지 않는다.

### 2차

```text
- exhibition_category 테이블 + 목록 카테고리 필터
- 예정/진행/종료 필터 (start_at·end_at 파생)
- 상세 템플릿 STORY / CATEGORY_SHOP / BRAND_SHOP
- order_items 에 source_type·source_id ALTER + checkoutController 연동
- 성과 로그·통계 화면
```

### 3차

```text
- exhibition_coupon (고객 쿠폰 다운로드 UX 가 생긴 뒤)
- 자동 상품 그룹 (product_group 의 condition 필터 재사용)
- 예약 발행 · 버전 관리 (page_revision 패턴 참고)
- A/B 테스트 · 개인화 추천 연동
```

### 재사용할 기존 자산

| 필요 | 이미 있는 것 | 위치 |
|---|---|---|
| 상품 카드 | `product_card.ejs` | `views/partials/` |
| 상품 검색(모달) | `getProductSearch` JSON | `controllers/admin/displayController.js` |
| 자동 상품 그룹 | `filter_condition_json` 화이트리스트(`badge`/`category_id`/`min_discount`/`in_stock`) | `services/display/productGroupService.js` |
| HTML 새니타이즈 | `custom_html` 섹션 새니타이저 | `services/display/` |
| 발행 스냅샷 | `page_revision` | `services/display/displayService.js` |
| 이미지 업로드 | multer → `public/uploads/` | `middleware/upload.js` |

---

## 12. 최종 권장안

기획전은 이벤트 관리 안에 넣지 말고 별도 관리한다.

```text
이벤트 관리 = 응모/혜택/공지
기획전 관리 = 상품 전시/판매 랜딩
```

사용자 화면은 다음 두 축으로 구성한다.

```text
기획전 목록 = 카드형 리스트 + 카테고리/상태 필터
기획전 상세 = 쇼핑형 상세 화면 + 내부 탭 + 상품 카드 + 구매 연결
```

커스텀 메뉴는 특정 기획전으로 직접 연결 가능하게 하되, URL 직접 입력보다 `EXHIBITION` 타입으로 내부 리소스 연결하는 방식을 권장한다.

---

## 13. 참고한 공개 화면

- 쇼핑엔티 기획전 목록: https://www.shoppingntmall.com/spex/spexMain
- SK스토아 기획전 목록: https://www.skstoa.com/promotion
- SK스토아 기획전 상세: https://www.skstoa.com/plan/planshop/detail/2023078278
