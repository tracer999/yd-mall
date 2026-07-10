# 기획전 관리 및 사용자 화면 설계/개발 설계

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

### URL

```text
/exhibitions
/promotion
/plan
```

쇼핑몰 빌더에서는 `/exhibitions` 또는 `/promotion` 중 하나를 표준으로 정하는 것이 좋다. 기존 국내 쇼핑몰과 유사하게 보이려면 `/promotion`도 가능하지만, 이벤트와 혼동을 줄이려면 내부 도메인명은 `exhibition` 또는 `planshop`으로 잡는 것이 낫다.

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

### URL

```text
/exhibitions/{exhibitionId}
/exhibitions/{slug}
/plan/planshop/detail/{id}
```

빌더에서는 SEO와 운영 편의성을 위해 `slug`를 권장한다.

```text
/exhibitions/hadalabo-moisture-special
/exhibitions/brand-week-summer-2026
```

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

커스텀 메뉴 연결 방식:

```text
custom_menu
├─ link_type = EXHIBITION
└─ link_target_id = exhibition.id
```

이 방식의 장점:

- 운영자가 잘못된 URL을 입력할 위험이 줄어든다.
- 기획전 종료 시 메뉴를 자동 숨김 처리할 수 있다.
- 기획전 권한/노출 기간과 메뉴 노출 기간을 동기화할 수 있다.
- 메뉴 클릭 통계를 기획전 성과로 연결할 수 있다.

---

## 4. 관리자 메뉴 설계

```text
관리자
└─ 페이지/전시 관리
    └─ 기획전 관리
        ├─ 기획전 목록
        ├─ 기획전 등록
        ├─ 기획전 카테고리 관리
        ├─ 기획전 상품 그룹 관리
        ├─ 기획전 배너 관리
        ├─ 기획전 노출/발행 관리
        └─ 기획전 성과 통계
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

## 7. DB 설계

## 7-1. exhibition

```sql
CREATE TABLE exhibition (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  mall_id BIGINT NOT NULL,

  title VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  summary VARCHAR(500) NULL,
  description TEXT NULL,

  exhibition_type VARCHAR(50) NOT NULL,
  category_code VARCHAR(50) NULL,

  list_thumbnail_url VARCHAR(500) NULL,
  pc_hero_image_url VARCHAR(500) NULL,
  mobile_hero_image_url VARCHAR(500) NULL,
  og_image_url VARCHAR(500) NULL,

  status VARCHAR(30) NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NULL,

  list_visible BOOLEAN DEFAULT TRUE,
  search_visible BOOLEAN DEFAULT TRUE,
  share_enabled BOOLEAN DEFAULT TRUE,

  detail_template_type VARCHAR(50) DEFAULT 'TAB_SHOP',
  display_config_json JSON NULL,

  ended_access_policy VARCHAR(30) DEFAULT 'ALLOW',
  ended_purchase_policy VARCHAR(30) DEFAULT 'ALLOW',

  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,

  UNIQUE KEY uk_exhibition_mall_slug (mall_id, slug)
);
```

## 7-2. exhibition_category

```sql
CREATE TABLE exhibition_category (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  mall_id BIGINT NOT NULL,
  category_code VARCHAR(50) NOT NULL,
  category_name VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

## 7-3. exhibition_section

```sql
CREATE TABLE exhibition_section (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  exhibition_id BIGINT NOT NULL,

  section_name VARCHAR(100) NOT NULL,
  section_code VARCHAR(100) NOT NULL,
  section_type VARCHAR(50) DEFAULT 'PRODUCT_GRID',

  sort_order INT DEFAULT 0,
  is_tab BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,

  display_config_json JSON NULL,

  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

## 7-4. exhibition_product

```sql
CREATE TABLE exhibition_product (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  exhibition_id BIGINT NOT NULL,
  section_id BIGINT NULL,
  product_id BIGINT NOT NULL,

  sort_order INT DEFAULT 0,
  is_fixed BOOLEAN DEFAULT FALSE,
  display_badge VARCHAR(50) NULL,
  display_comment VARCHAR(200) NULL,

  visible BOOLEAN DEFAULT TRUE,
  purchase_enabled BOOLEAN DEFAULT TRUE,

  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

## 7-5. exhibition_coupon

```sql
CREATE TABLE exhibition_coupon (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  exhibition_id BIGINT NOT NULL,
  coupon_id BIGINT NOT NULL,

  sort_order INT DEFAULT 0,
  is_primary BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,

  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

---

## 8. API 설계

## 8-1. 사용자 API

```http
GET /api/exhibitions
```

기획전 목록 조회.

Query:

```text
category
status
sort
page
size
```

```http
GET /api/exhibitions/{slug}
```

기획전 상세 조회.

응답 구조:

```json
{
  "id": 1001,
  "title": "하다라보 보습케어 특가",
  "summary": "속보습까지 촉촉하게",
  "status": "ACTIVE",
  "startAt": "2023-10-05T00:00:00",
  "endAt": "2028-12-31T23:59:59",
  "hero": {
    "pcImageUrl": "...",
    "mobileImageUrl": "..."
  },
  "tabs": [
    {
      "sectionId": 1,
      "name": "MD추천",
      "products": []
    }
  ],
  "coupons": [],
  "notices": []
}
```

## 8-2. 관리자 API

```http
GET    /admin/api/exhibitions
POST   /admin/api/exhibitions
GET    /admin/api/exhibitions/{id}
PUT    /admin/api/exhibitions/{id}
DELETE /admin/api/exhibitions/{id}
```

```http
POST   /admin/api/exhibitions/{id}/sections
PUT    /admin/api/exhibitions/{id}/sections/{sectionId}
DELETE /admin/api/exhibitions/{id}/sections/{sectionId}
```

```http
POST   /admin/api/exhibitions/{id}/products
PUT    /admin/api/exhibitions/{id}/products/{mappingId}
DELETE /admin/api/exhibitions/{id}/products/{mappingId}
```

---

## 9. 프론트엔드 컴포넌트 설계

```text
ExhibitionListPage
├─ ExhibitionHeroCarousel
├─ ExhibitionCategoryTabs
├─ ExhibitionStatusFilter
├─ ExhibitionSortBar
└─ ExhibitionCardGrid

ExhibitionDetailPage
├─ ExhibitionHeader
├─ ExhibitionHero
├─ ExhibitionCouponArea
├─ ExhibitionTabNav
├─ ExhibitionProductSection
│   └─ ProductCard
├─ ExhibitionNotice
└─ ShareButtons
```

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

---

## 11. 개발 우선순위

### 1차

```text
- 기획전 목록
- 기획전 상세 기본 탭형
- 관리자 기획전 등록/수정
- 기획전 상품 수동 연결
- 커스텀 메뉴에서 기획전 연결
```

### 2차

```text
- 기획전 카테고리 필터
- 예정/진행/종료 필터
- 기획전 쿠폰 연결
- 상세 템플릿 2~3종
- 성과 로그
```

### 3차

```text
- 자동 상품 그룹
- 예약 발행
- 버전 관리
- A/B 테스트
- 개인화 추천 연동
```

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
