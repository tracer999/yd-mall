# 범용 쇼핑몰 템플릿 빌더 & SaaS 미디어 커머스 플랫폼 설계안

본 문서는 두 관점을 하나로 통합한 설계안이다.

- **Part I — 기본 빌더 설계**: 신세계쇼핑, GS SHOP, SK스토아, CJ온스타일 같은 홈쇼핑몰을 그대로 복제하지 않고, 기본 레이아웃 골격을 유지한 채 카테고리·메뉴·배너·상품 전시·프로모션을 자유롭게 조합하는 **템플릿형 쇼핑몰 빌더**의 구체 설계.
- **Part II — SaaS 미디어 커머스 고도화**: 단일 브랜드용 소스를 여러 입점 브랜드(테넌트)가 독립적으로 쇼핑몰을 구축하는 **SaaS형 빌더**로 확장하기 위한 멀티테넌시·서버 드리븐 UI·비디오/O2O/AI 아키텍처.
- **Part III — 개발 및 마이그레이션 전략**: 기존 모놀리식 소스를 안전하게 점진 전환하는 단계론.
- **Part IV — 요약**: 핵심 원칙과 최종 권장 구조.

핵심 방향은 다음과 같다. 기본 골격은 범용 템플릿 빌더로 유지하면서(Part I), 4대 홈쇼핑 플랫폼이 검증한 **실시간 라이브·숏폼 비디오·O2O 하이브리드 전시·생성형 AI 쇼핑 에이전트**를 점진적으로 흡수(Part II)해 최종적으로 미디어 커머스 SaaS 빌더로 진화시킨다.

```text
고정된 쇼핑몰 화면 개발 방식이 아니라,
관리자에서 메뉴/카테고리/섹션/상품그룹/배너를 조합하여
여러 형태의 쇼핑몰을 생성할 수 있는 구조로 개선한다.
그 위에 멀티테넌시·미디어·AI 레이어를 단계적으로 얹는다.
```

즉, 홈쇼핑 전용 구조가 아니라 **일반 쇼핑몰, 브랜드몰, 기획전몰, 전문몰, 라이브/방송형 몰까지 확장 가능한 범용 구조**를 지향한다.

---

# Part I. 기본 빌더 설계

## 1. 설계 목적

본 설계안은 특정 홈쇼핑몰을 그대로 복제하는 것이 아니라, **기본적인 쇼핑몰 레이아웃 틀을 유지하면서 각 쇼핑몰의 카테고리, 메뉴, 배너, 상품 전시, 프로모션 영역을 자유롭게 구성할 수 있는 템플릿형 쇼핑몰 빌더**를 목표로 한다.

1순위 벤치마킹 대상인 **신세계라이브쇼핑**을 비롯해 **GS SHOP, SK스토아, CJ온스타일** 등 국내 대형 홈쇼핑 플랫폼은 단순 상품 나열식 인터페이스를 넘어 모바일 실시간 라이브, 1분 미만의 숏폼 비디오 커머스, 온·오프라인 O2O 하이브리드 전시, 생성형 AI 대화형 쇼핑 에이전트를 도입하고 있다. 본 빌더는 이들의 화면 구성·전시 방식을 범용 템플릿 개념으로 흡수하되, 특정 몰에 종속되지 않는다.

즉, 홈쇼핑 전용 구조가 아니라 **일반 쇼핑몰, 브랜드몰, 기획전몰, 전문몰, 라이브/방송형 몰까지 확장 가능한 범용 구조**를 지향한다.

---

## 2. 기준 화면 구조 분석

첨부 이미지 기준의 기본 화면 구조는 다음과 같다.

```text
┌───────────────────────────────────────────────┐
│ Header                                        │
│ - 로고                                        │
│ - 검색창                                      │
│ - 로그인 / 마이쇼핑 / 장바구니 / 고객센터     │
├───────────────────────────────────────────────┤
│ Global Navigation                             │
│ - 카테고리                                    │
│ - 쇼핑라이브                                  │
│ - TV편성표                                    │
│ - 오늘특가                                    │
│ - 공동구매                                    │
│ - 베스트                                      │
│ - 이벤트&혜택                                 │
├───────────────────────────────────────────────┤
│ Main Content                                  │
│ ┌───────────────────────┐ ┌───────────────┐ │
│ │ 메인 대형 배너          │ │ 우측 프로모션 │ │
│ └───────────────────────┘ └───────────────┘ │
│ ┌───────────────────────┐ ┌───────────────┐ │
│ │ 주요 상품 영역          │ │ 추천 상품 영역 │ │
│ └───────────────────────┘ └───────────────┘ │
├───────────────────────────────────────────────┤
│ Right Utility Area                            │
│ - 로그인 박스                                 │
│ - 최근 본 상품                                │
│ - 앱 다운로드 / QR                            │
│ - 출석체크 / 멤버십 / 혜택                    │
└───────────────────────────────────────────────┘
```

이 구조에서 중요한 점은 화면이 완전 자유형이 아니라 **정해진 영역을 기반으로 여러 섹션을 조합하는 구조**라는 것이다.

따라서 빌더도 다음과 같은 방향이 적합하다.

```text
완전 자유 드래그앤드롭 빌더 X
기본 골격 + 섹션 조합형 빌더 O
```

---

## 3. 최종 목표 구조

권장 구조는 **Preset Layout + Configurable Section + Data Source Mapping** 방식이다.

```text
쇼핑몰 빌더
 ├─ 몰 설정
 ├─ 테마 설정
 ├─ 메뉴 설정
 ├─ 카테고리 설정
 ├─ 페이지 템플릿 설정
 ├─ 섹션 설정
 ├─ 상품 그룹 설정
 ├─ 배너 설정
 ├─ 프로모션 설정
 └─ 발행/미리보기/롤백
```

사용자는 완전히 빈 화면에서 시작하는 것이 아니라, 기본 레이아웃을 선택하고 각 영역을 편집한다.

예시는 다음과 같다.

```text
기본 레이아웃 선택
  ↓
상단 메뉴 구성
  ↓
카테고리 구성
  ↓
메인 배너 영역 구성
  ↓
상품 전시 섹션 구성
  ↓
우측 유틸리티 영역 구성
  ↓
PC / Mobile 미리보기
  ↓
발행
```

---

## 4. 핵심 설계 개념

### 4.1 Layout

Layout은 페이지의 큰 골격이다.

예를 들어 메인 페이지는 아래와 같은 고정 골격을 가질 수 있다.

```text
Main Layout Type A
 ├─ Header
 ├─ GNB
 ├─ Hero Area
 ├─ Main Section Area
 ├─ Right Utility Area
 └─ Footer
```

관리자는 Layout 자체를 완전히 깨는 것이 아니라, 각 영역에 들어갈 섹션과 데이터를 선택한다.

### 4.2 Section

Section은 화면을 구성하는 큰 블록이다.

예시:

```text
Section
 ├─ 메인 배너
 ├─ 상품 캐러셀
 ├─ 상품 그리드
 ├─ 기획전 배너
 ├─ 베스트 상품
 ├─ 오늘특가
 ├─ 추천 상품
 ├─ 신상품
 ├─ 브랜드관
 ├─ 카테고리 바로가기
 ├─ 공동구매
 ├─ 타임딜
 ├─ 리뷰 많은 상품
 ├─ 최근 본 상품
 ├─ 로그인 안내 박스
 └─ 앱 다운로드 QR
```

각 쇼핑몰은 같은 섹션 컴포넌트를 사용하되, 노출 순서, 제목, 데이터 소스, 디자인 옵션을 다르게 설정한다.

### 4.3 Component

Component는 섹션 내부의 작은 UI 단위다.

```text
Component
 ├─ ProductCard
 ├─ PriceBox
 ├─ DiscountBadge
 ├─ CouponBadge
 ├─ DeliveryBadge
 ├─ ReviewScore
 ├─ CountdownTimer
 ├─ BannerImage
 ├─ MenuItem
 ├─ CategoryItem
 └─ QuickLinkButton
```

ProductCard 같은 컴포넌트는 모든 페이지에서 재사용되어야 한다.

### 4.4 Data Source

Data Source는 섹션에 어떤 데이터를 넣을지 결정하는 설정이다.

예시:

```text
Data Source
 ├─ 수동 상품 선택
 ├─ 특정 카테고리 상품
 ├─ 특정 브랜드 상품
 ├─ 베스트 상품
 ├─ 신상품
 ├─ 할인율 높은 상품
 ├─ 재고 있는 상품
 ├─ 운영자 추천 상품
 ├─ 최근 본 상품
 ├─ 회원 맞춤 상품
 └─ 외부 API 연동 상품
```

섹션과 데이터 소스를 분리해야 같은 디자인 섹션에 다른 상품 그룹을 자유롭게 연결할 수 있다.

---

## 5. 권장 전체 아키텍처

```text
[Storefront Frontend]
 ├─ Header Renderer
 ├─ Menu Renderer
 ├─ Page Renderer
 ├─ Section Renderer
 ├─ ProductCard Renderer
 └─ Theme Renderer

[Admin Builder]
 ├─ 몰 설정 관리
 ├─ 메뉴 관리
 ├─ 카테고리 관리
 ├─ 페이지 빌더
 ├─ 섹션 관리
 ├─ 배너 관리
 ├─ 상품 그룹 관리
 ├─ 프로모션 관리
 ├─ 미리보기
 └─ 발행 관리

[Backend API]
 ├─ Store API
 ├─ Display API
 ├─ Product API
 ├─ Category API
 ├─ Menu API
 ├─ Promotion API
 ├─ Order API
 ├─ Member API
 └─ Admin API

[Database]
 ├─ mall
 ├─ theme
 ├─ menu
 ├─ category
 ├─ page
 ├─ page_section
 ├─ section_template
 ├─ product
 ├─ product_group
 ├─ banner
 ├─ promotion
 ├─ order
 └─ member
```

---

## 6. 빌더 작동 방식

### 6.1 기본 흐름

```text
1. 쇼핑몰 생성
2. 기본 테마 선택
3. 기본 레이아웃 선택
4. 상단 메뉴 구성
5. 카테고리 트리 구성
6. 메인 페이지 섹션 구성
7. 각 섹션에 데이터 소스 연결
8. PC / Mobile 미리보기
9. 발행
```

### 6.2 페이지 렌더링 흐름

프론트엔드는 화면을 하드코딩하지 않고, API에서 받은 페이지 설정값을 기준으로 렌더링한다.

```text
사용자 접속
  ↓
Storefront가 현재 도메인 확인
  ↓
mall 설정 조회
  ↓
page 설정 조회
  ↓
page_section 목록 조회
  ↓
각 section의 data source 조회
  ↓
section renderer가 화면 출력
```

예시 API 응답:

```json
{
  "mall": {
    "id": 1,
    "name": "Sample Mall",
    "theme": "basic_home_v1"
  },
  "page": {
    "type": "home",
    "layout": "main_with_right_utility"
  },
  "sections": [
    {
      "type": "hero_banner",
      "position": "main_top",
      "sortOrder": 1,
      "dataSource": {
        "type": "banner_group",
        "id": "main_hero"
      },
      "config": {
        "height": 320,
        "autoplay": true,
        "showIndicator": true
      }
    },
    {
      "type": "product_grid",
      "position": "main_content",
      "sortOrder": 2,
      "title": "오늘 추천 상품",
      "dataSource": {
        "type": "product_group",
        "id": "recommend_today"
      },
      "config": {
        "columns": 4,
        "showReview": true,
        "showCoupon": true,
        "showDeliveryBadge": true
      }
    }
  ]
}
```

> 이 "서버가 화면 명세를 내려주고 클라이언트가 해석해 그리는" 방식이 곧 **서버 드리븐 UI(SDUI)**이며, 그 심화 아키텍처(GraphQL Union/Interface, 라이브 위젯 등)는 Part II [21. 서버 드리븐 UI 심화](#21-서버-드리븐-uisdui-및-전시-엔진-심화)에서 확장한다.

---

## 7. 레이아웃 설계

### 7.1 기본 레이아웃 타입

초기에는 아래 4개 레이아웃을 제공하는 것이 좋다.

| 레이아웃 | 용도 | 특징 |
|---|---|---|
| Main Basic | 일반 쇼핑몰 기본형 | 배너 + 상품 전시 중심 |
| Main Right Utility | 첨부 이미지 유사형 | 우측 로그인/최근본상품/혜택 영역 포함 |
| Brand Mall | 브랜드몰형 | 브랜드 스토리 + 상품 전시 중심 |
| Promotion Mall | 기획전형 | 이벤트 배너 + 상품 그룹 중심 |

### 7.2 첨부 이미지 기반 권장 레이아웃

```text
Layout: main_right_utility_v1

Header
 ├─ Logo Area
 ├─ Search Area
 └─ User Action Area

GNB
 ├─ Category Button
 └─ Main Menu Items

Content
 ├─ Hero Banner Area
 ├─ Right Promotion Banner Area
 ├─ Primary Product Section
 ├─ Secondary Product Section
 └─ Additional Sections

Right Utility
 ├─ Login Box
 ├─ Recent Products
 ├─ App Download QR
 ├─ Membership Shortcut
 └─ Top Button

Footer
 ├─ Company Info
 ├─ Policy Links
 └─ Customer Center Info
```

이 레이아웃은 홈쇼핑에 한정하지 않고, 일반 쇼핑몰에도 사용할 수 있다.

예를 들어 메뉴만 바꾸면 다음과 같이 적용 가능하다.

```text
패션몰
 ├─ 여성의류
 ├─ 남성의류
 ├─ 신발
 ├─ 가방
 ├─ 브랜드
 ├─ 베스트
 └─ 이벤트

식품몰
 ├─ 신선식품
 ├─ 가공식품
 ├─ 건강식품
 ├─ 정기배송
 ├─ 특가
 ├─ 베스트
 └─ 기획전

뷰티몰
 ├─ 스킨케어
 ├─ 메이크업
 ├─ 헤어케어
 ├─ 브랜드
 ├─ 신상품
 ├─ 베스트
 └─ 이벤트
```

### 7.3 홈쇼핑 벤치마킹 테마 모델 (전시 지향형 프리셋)

7.1의 레이아웃이 화면의 **구조적 골격**이라면, 아래 테마 모델은 신세계라이브쇼핑을 벤치마킹한 **전시 지향형 프리셋**이다. 테넌트 어드민에게 네 가지 표준 홈 전시 테마를 제공해 브랜드 맞춤형 시각 구성을 유연하게 제어하도록 한다. (레이아웃 골격 위에 이 테마 프리셋을 얹어 상품군 성격에 맞춘다.)

| 테마 모델 | 최적화 레이아웃 핵심 구성 | 권장 대상 테넌트 및 상품 카테고리 |
|---|---|---|
| **트렌디(Trendy)형** | 베스트 리뷰 상품 상위 동적 노출 / 쇼핑 스토리·숏폼 비디오 커머스 연동 극대화 / 가변 그리드 레이아웃 | 패션 Now, 트렌디 뷰티, 잡화류 등 미디어 소비가 활발한 트렌드 지향 브랜드 |
| **스토리(Story)형** | 신문·저널 구독 느낌의 레이아웃 / 주간 베스트 상품을 실시간 인기 검색어(실검) 스타일로 배치해 집중도 극대화 | 브랜드 히스토리가 강조되는 프리미엄 수제 가구, 친환경 리빙 소품, 인테리어 큐레이션 |
| **큐브(Cube)형** | 바둑판식 직사각형 격자 배치 위주 / 연관 상품·대칭형 번들 추천에 효과적인 전통적 베이직 UI | 대형 식료품, 가정 간편식(밀키트), 생필품 전문 유통, 다품종 대량 판매 마켓 |
| **심플(Simple)형** | 극도로 절제된 미니멀 그래픽 중심 배열 / 텍스트와 시그니처 단일 제품 카드의 직관적 구성 | 수입 오디오, 디자이너 소량 단독 컬렉션, 고관여 단일 플래그십 셀렉트 숍 |

---

## 8. 메뉴/카테고리 설계

### 8.1 메뉴와 카테고리는 분리

중요한 설계 포인트는 **메뉴와 카테고리를 분리하는 것**이다.

```text
카테고리 = 상품 분류 체계
메뉴 = 화면 이동/전시/이벤트 진입 구조
```

예를 들어 `패션 > 여성의류 > 원피스`는 카테고리다.

반면 `오늘특가`, `베스트`, `이벤트`, `브랜드관`은 상품 분류가 아니라 전시 메뉴다.

따라서 DB도 분리해야 한다.

```text
category
 ├─ id
 ├─ mall_id
 ├─ parent_id
 ├─ name
 ├─ depth
 ├─ sort_order
 └─ is_active

menu
 ├─ id
 ├─ mall_id
 ├─ parent_id
 ├─ name
 ├─ menu_type
 ├─ target_type
 ├─ target_id
 ├─ url
 ├─ sort_order
 └─ is_active
```

### 8.2 메뉴 타입

```text
menu_type
 ├─ category
 ├─ page
 ├─ promotion
 ├─ brand
 ├─ search_result
 ├─ external_url
 └─ custom
```

이렇게 하면 쇼핑몰마다 상단 메뉴를 다르게 구성할 수 있다.

예시:

```text
A몰 메뉴
 ├─ 카테고리
 ├─ 신상품
 ├─ 베스트
 ├─ 오늘특가
 ├─ 브랜드
 └─ 이벤트

B몰 메뉴
 ├─ 전체상품
 ├─ 공동구매
 ├─ 정기배송
 ├─ 라이브
 ├─ 리뷰랭킹
 └─ 고객혜택
```

### 8.3 동적 메뉴/부가 코너 관리

필수 기성 카테고리 외에, 개별 테넌트의 필요에 맞춰 **스페셜 기획전·상품 리뷰 이벤트 코너·Q&A(묻고 답하기)·공지사항·판매자 기본정보 및 약도 소개 이미지 코너** 등을 동적으로 활성화/비활성화할 수 있도록 **관리 콘솔과 렌더링 파이프라인을 완전히 분리**해 구축한다. 이는 8.2의 `menu_type`(특히 `page`, `custom`)과 9장의 섹션 템플릿을 조합해 구현한다.

> 판매자 소개 이미지 등 정적 리소스 등록 시에는 이미지 변환용 **서버리스 마이크로서비스**를 연동하여, 업로드 이미지를 가로 **910px**, 세로 **1,200px**, 최대 **1,500KB** 이내로 변환 처리하도록 구조적으로 규정한다.

---

## 9. 섹션 템플릿 설계

### 9.1 초기 제공 섹션

| 섹션 타입 | 설명 | 필수 여부 |
|---|---|---|
| hero_banner | 메인 대형 배너 | 필수 |
| promotion_banner | 우측 또는 중간 프로모션 배너 | 필수 |
| product_grid | 상품 그리드 | 필수 |
| product_carousel | 상품 슬라이드 | 필수 |
| category_shortcut | 카테고리 바로가기 | 권장 |
| brand_shortcut | 브랜드 바로가기 | 권장 |
| time_deal | 타임딜 | 선택 |
| best_ranking | 베스트/랭킹 | 권장 |
| new_arrival | 신상품 | 권장 |
| event_list | 이벤트 목록 | 선택 |
| review_product | 리뷰 많은 상품 | 선택 |
| right_login_box | 우측 로그인 박스 | 선택 |
| recent_product | 최근 본 상품 | 선택 |
| app_download_qr | 앱 다운로드 QR | 선택 |
| live_stream_player | 라이브/숏폼 비디오 위젯 (Part II 연동) | 선택 |
| custom_html | 제한적 커스텀 HTML | 선택 |

### 9.2 섹션 설정 항목

모든 섹션은 공통 설정과 개별 설정을 갖는다.

```text
공통 설정
 ├─ 섹션명
 ├─ 섹션 타입
 ├─ 노출 위치
 ├─ 정렬 순서
 ├─ 노출 시작일
 ├─ 노출 종료일
 ├─ PC 노출 여부
 ├─ Mobile 노출 여부
 ├─ 로그인 회원만 노출 여부
 ├─ 특정 회원등급 노출 여부
 └─ 활성/비활성
```

상품형 섹션 개별 설정:

```text
상품형 섹션 설정
 ├─ 상품 데이터 소스
 ├─ 노출 상품 수
 ├─ 정렬 기준
 ├─ 컬럼 수
 ├─ 상품명 표시 여부
 ├─ 브랜드 표시 여부
 ├─ 가격 표시 여부
 ├─ 할인율 표시 여부
 ├─ 쿠폰 표시 여부
 ├─ 리뷰 표시 여부
 ├─ 배송 배지 표시 여부
 └─ 품절 상품 표시 여부
```

배너형 섹션 개별 설정:

```text
배너형 섹션 설정
 ├─ 배너 그룹
 ├─ 이미지 비율
 ├─ 자동 슬라이드 여부
 ├─ 슬라이드 시간
 ├─ 링크 타입
 ├─ 새창 여부
 └─ 대체 텍스트
```

---

## 10. 상품 전시 구조

상품 전시는 상품 테이블에 직접 의존하지 않고, **상품 그룹**을 통해 관리하는 것이 좋다.

```text
product_group
 ├─ id
 ├─ mall_id
 ├─ name
 ├─ group_type
 ├─ selection_type
 ├─ sort_type
 ├─ filter_condition_json
 └─ is_active

product_group_item
 ├─ id
 ├─ product_group_id
 ├─ product_id
 ├─ sort_order
 └─ is_fixed
```

상품 그룹 타입 예시:

```text
수동 선택형
 └─ 운영자가 상품을 직접 선택

조건 자동형
 └─ 특정 카테고리 + 할인율 20% 이상 + 재고 있음

랭킹형
 └─ 판매량 / 조회수 / 장바구니 / 리뷰 기준

개인화형
 └─ 사용자 행동 기반 추천
```

초기에는 `수동 선택형`과 `조건 자동형`만 구현해도 충분하다. (랭킹형·개인화형은 Part II의 추천 엔진과 연계해 고도화한다.)

---

## 11. 상품 카드 표준화

상품 카드가 표준화되어야 전체 쇼핑몰의 일관성이 유지된다.

```text
ProductCard
 ├─ 상품 이미지
 ├─ 브랜드명
 ├─ 상품명
 ├─ 정상가
 ├─ 판매가
 ├─ 할인율
 ├─ 쿠폰가
 ├─ 배송 배지
 ├─ 리뷰 평점
 ├─ 리뷰 수
 ├─ 구매 수
 ├─ 찜 버튼
 ├─ 장바구니 버튼
 └─ 품절/임박/특가 배지
```

관리자에서 상품 카드 표시 옵션을 조정할 수 있어야 한다.

예시:

```json
{
  "showBrand": true,
  "showPrice": true,
  "showDiscountRate": true,
  "showCoupon": true,
  "showReview": true,
  "showDeliveryBadge": true,
  "showCartButton": false,
  "imageRatio": "1:1"
}
```

---

## 12. 우측 유틸리티 영역 설계

첨부 이미지와 유사한 쇼핑몰 구조에서는 우측 고정 유틸리티 영역이 중요하다.

다만 모든 쇼핑몰에 필요하지는 않으므로 선택형으로 설계한다.

```text
Right Utility Area
 ├─ 로그인 안내
 ├─ 회원가입 버튼
 ├─ 최근 본 상품
 ├─ 출석체크
 ├─ 멤버십 혜택
 ├─ 앱 다운로드 QR
 ├─ 고객센터 바로가기
 └─ TOP 버튼
```

설정 예시:

```json
{
  "layout": "right_utility_v1",
  "enabled": true,
  "items": [
    {
      "type": "login_box",
      "enabled": true
    },
    {
      "type": "recent_product",
      "enabled": true,
      "maxCount": 3
    },
    {
      "type": "app_qr",
      "enabled": true
    },
    {
      "type": "top_button",
      "enabled": true
    }
  ]
}
```

모바일에서는 우측 영역을 그대로 노출하지 않고, 하단 고정 메뉴 또는 마이페이지 영역으로 이동시키는 것이 좋다.

---

## 13. 테마 설계

테마는 몰의 시각적 정체성을 결정한다.

```text
Theme
 ├─ 로고
 ├─ 메인 컬러
 ├─ 보조 컬러
 ├─ 폰트
 ├─ 버튼 스타일
 ├─ 상품 카드 스타일
 ├─ 배너 라운드 여부
 ├─ 가격 강조 스타일
 ├─ GNB 스타일
 └─ Footer 스타일
```

테마 설정 예시:

```json
{
  "primaryColor": "#ff2f92",
  "secondaryColor": "#222222",
  "fontFamily": "Pretendard",
  "buttonRadius": 4,
  "productCardStyle": "basic",
  "priceStyle": "bold_large",
  "gnbStyle": "horizontal_center"
}
```

테마는 CSS 변수 기반으로 관리하는 것이 좋다.

```css
:root {
  --color-primary: #ff2f92;
  --color-secondary: #222222;
  --font-base: 'Pretendard';
  --button-radius: 4px;
}
```

---

## 14. 관리자 화면 설계

### 14.1 관리자 메뉴

```text
관리자
 ├─ 대시보드
 ├─ 몰 설정
 │   ├─ 기본 정보
 │   ├─ 도메인
 │   ├─ 로고/파비콘
 │   ├─ 테마
 │   └─ 정책
 │
 ├─ 메뉴/카테고리
 │   ├─ 상단 메뉴
 │   ├─ 전체 카테고리
 │   ├─ 푸터 메뉴
 │   └─ 퀵 메뉴
 │
 ├─ 페이지 빌더
 │   ├─ 메인 페이지
 │   ├─ 카테고리 페이지
 │   ├─ 상품 상세 페이지
 │   ├─ 기획전 페이지
 │   └─ 커스텀 페이지
 │
 ├─ 전시 관리
 │   ├─ 배너
 │   ├─ 상품 그룹
 │   ├─ 베스트
 │   ├─ 신상품
 │   ├─ 오늘특가
 │   └─ 추천 상품
 │
 ├─ 상품 관리
 ├─ 주문 관리
 ├─ 회원 관리
 ├─ 쿠폰/프로모션
 └─ 발행 이력
```

### 14.2 페이지 빌더 UX

```text
좌측 패널
 ├─ 섹션 추가
 ├─ 섹션 목록
 ├─ 순서 변경
 └─ 비활성 처리

중앙
 ├─ PC 미리보기
 ├─ Mobile 미리보기
 └─ 선택 섹션 하이라이트

우측 패널
 ├─ 섹션 제목
 ├─ 데이터 소스
 ├─ 디자인 옵션
 ├─ 노출 조건
 ├─ 노출 기간
 └─ 저장/발행
```

초기에는 완전한 드래그앤드롭보다 다음 기능을 먼저 구현하는 것이 좋다.

```text
우선 구현
 ├─ 섹션 추가
 ├─ 섹션 삭제
 ├─ 섹션 복제
 ├─ 위/아래 순서 변경
 ├─ 데이터 소스 선택
 ├─ PC/Mobile 미리보기
 ├─ 임시 저장
 └─ 발행
```

---

## 15. 데이터베이스 설계안

### 15.1 몰 설정

```sql
CREATE TABLE mall (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  domain VARCHAR(255),
  logo_url VARCHAR(500),
  theme_id BIGINT,
  status VARCHAR(30) DEFAULT 'active',
  created_at DATETIME,
  updated_at DATETIME
);
```

### 15.2 테마

```sql
CREATE TABLE theme (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  mall_id BIGINT NOT NULL,
  name VARCHAR(100),
  config_json JSON,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME,
  updated_at DATETIME
);
```

### 15.3 메뉴

```sql
CREATE TABLE menu (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  mall_id BIGINT NOT NULL,
  parent_id BIGINT NULL,
  name VARCHAR(100) NOT NULL,
  menu_type VARCHAR(50) NOT NULL,
  target_type VARCHAR(50),
  target_id BIGINT,
  url VARCHAR(500),
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME,
  updated_at DATETIME
);
```

### 15.4 카테고리

```sql
CREATE TABLE category (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  mall_id BIGINT NOT NULL,
  parent_id BIGINT NULL,
  name VARCHAR(100) NOT NULL,
  depth INT DEFAULT 1,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME,
  updated_at DATETIME
);
```

### 15.5 페이지

```sql
CREATE TABLE page (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  mall_id BIGINT NOT NULL,
  page_type VARCHAR(50) NOT NULL,
  slug VARCHAR(255),
  title VARCHAR(200),
  layout_type VARCHAR(100),
  status VARCHAR(30) DEFAULT 'draft',
  published_at DATETIME,
  created_at DATETIME,
  updated_at DATETIME
);
```

### 15.6 페이지 섹션

```sql
CREATE TABLE page_section (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  page_id BIGINT NOT NULL,
  section_type VARCHAR(100) NOT NULL,
  position VARCHAR(100),
  title VARCHAR(200),
  sort_order INT DEFAULT 0,
  data_source_type VARCHAR(100),
  data_source_id BIGINT,
  config_json JSON,
  visible_start_at DATETIME,
  visible_end_at DATETIME,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME,
  updated_at DATETIME
);
```

### 15.7 상품 그룹

```sql
CREATE TABLE product_group (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  mall_id BIGINT NOT NULL,
  name VARCHAR(200) NOT NULL,
  group_type VARCHAR(50),
  selection_type VARCHAR(50),
  sort_type VARCHAR(50),
  filter_condition_json JSON,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME,
  updated_at DATETIME
);
```

```sql
CREATE TABLE product_group_item (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  product_group_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  sort_order INT DEFAULT 0,
  is_fixed BOOLEAN DEFAULT FALSE,
  created_at DATETIME,
  updated_at DATETIME
);
```

> 멀티테넌시 SaaS로 확장 시 위 모든 테이블에 `tenant_id`(또는 `mall_id`를 테넌트 식별자로 승격)를 전역 인덱싱하고 격리 정책을 적용한다. 상세는 Part II [20. 멀티테넌시 데이터베이스](#20-멀티테넌시-데이터베이스-및-동적-라우팅-엔진-설계) 참조.

---

## 16. API 설계 예시

### 16.1 Storefront API

```text
GET /api/storefront/mall
GET /api/storefront/menu
GET /api/storefront/categories
GET /api/storefront/pages/home
GET /api/storefront/pages/{slug}
GET /api/storefront/sections/{sectionId}/data
GET /api/storefront/products/{productId}
GET /api/storefront/product-groups/{groupId}
```

### 16.2 Admin API

```text
POST /api/admin/malls
PUT /api/admin/malls/{mallId}

GET /api/admin/menus
POST /api/admin/menus
PUT /api/admin/menus/{menuId}
DELETE /api/admin/menus/{menuId}

GET /api/admin/pages
POST /api/admin/pages
PUT /api/admin/pages/{pageId}
POST /api/admin/pages/{pageId}/publish
POST /api/admin/pages/{pageId}/preview

POST /api/admin/pages/{pageId}/sections
PUT /api/admin/sections/{sectionId}
DELETE /api/admin/sections/{sectionId}
POST /api/admin/sections/{sectionId}/duplicate

GET /api/admin/product-groups
POST /api/admin/product-groups
PUT /api/admin/product-groups/{groupId}
```

---

## 17. 프론트엔드 렌더러 설계

프론트엔드는 섹션 타입별 렌더러를 갖는다.

```typescript
const sectionRendererMap = {
  hero_banner: HeroBannerSection,
  promotion_banner: PromotionBannerSection,
  product_grid: ProductGridSection,
  product_carousel: ProductCarouselSection,
  category_shortcut: CategoryShortcutSection,
  brand_shortcut: BrandShortcutSection,
  time_deal: TimeDealSection,
  best_ranking: BestRankingSection,
  right_login_box: RightLoginBoxSection,
  recent_product: RecentProductSection,
  app_download_qr: AppDownloadQrSection,
  live_stream_player: LiveStreamPlayerSection,
};
```

렌더링 흐름:

```typescript
function PageRenderer({ page }) {
  return (
    <Layout type={page.layoutType}>
      {page.sections.map((section) => {
        const SectionComponent = sectionRendererMap[section.type];
        if (!SectionComponent) return null;

        return (
          <SectionComponent
            key={section.id}
            title={section.title}
            dataSource={section.dataSource}
            config={section.config}
          />
        );
      })}
    </Layout>
  );
}
```

이 `sectionRendererMap` 방식이 곧 서버 드리븐 UI의 클라이언트 해석 계층이다. GraphQL Union/Interface로 위젯을 타입 안전하게 다형 렌더링하는 심화 규약은 Part II [21장](#21-서버-드리븐-uisdui-및-전시-엔진-심화)에서 다룬다.

---

## 18. PC/Mobile 대응

첨부 이미지 같은 구조는 PC에서는 적합하지만 모바일에서는 그대로 사용하기 어렵다.

따라서 섹션마다 PC/Mobile 노출 설정이 필요하다.

```json
{
  "visibleOnPc": true,
  "visibleOnMobile": false,
  "mobileSectionType": "bottom_sheet_menu"
}
```

모바일 구조는 다음과 같이 재배치한다.

```text
PC
 ├─ Header
 ├─ GNB
 ├─ Main Banner + Right Utility
 ├─ Product Sections
 └─ Footer

Mobile
 ├─ Mobile Header
 ├─ Search Bar
 ├─ Category Shortcut
 ├─ Main Banner
 ├─ Product Sections
 ├─ Bottom Navigation
 └─ My Page / Recent Product
```

우측 유틸리티 영역은 모바일에서 다음으로 대체한다.

```text
Right Utility → Bottom Navigation / My Page / Floating Button
```

---

## 19. 발행/버전 관리 구조

페이지 빌더는 발행 관리가 필수다.

```text
page_revision
 ├─ id
 ├─ page_id
 ├─ revision_no
 ├─ snapshot_json
 ├─ status
 ├─ created_by
 ├─ created_at
 └─ published_at
```

필수 기능:

```text
필수
 ├─ 임시 저장
 ├─ 미리보기
 ├─ 발행
 ├─ 예약 발행
 ├─ 이전 버전 복구
 └─ 발행 이력 확인
```

운영자가 실수로 메인 화면을 망가뜨릴 수 있으므로 롤백 기능은 반드시 필요하다.

---

# Part II. SaaS 미디어 커머스 고도화

Part I이 단일 몰(또는 도메인 기반 멀티몰) 기준의 빌더 설계라면, Part II는 이를 **여러 입점 브랜드(테넌트)가 독립 환경에서 직접 쇼핑몰을 구축하는 SaaS형 빌더**로 끌어올리는 아키텍처를 다룬다. 4대 홈쇼핑 플랫폼이 검증한 요소를 다음 세 축으로 흡수한다.

- 클라우드 네이티브 기반의 유연한 **멀티테넌시 데이터 레이어** (20장)
- **서버 드리븐 UI(SDUI)** 방식의 다형성 템플릿 전시 엔진 (21장)
- 대용량 미디어 파이프라인 및 **분산 인텔리전스 AI 레이어** (22~24장)

---

## 20. 멀티테넌시 데이터베이스 및 동적 라우팅 엔진 설계

단일 브랜드용 DB 구조(Part I 15장)를 다중 테넌트 SaaS로 리팩토링하는 근본 해결책은 **데이터 분리(Isolation) 아키텍처**를 정의하는 것이다. 각 입점 브랜드가 상품·고객·주문 트랜잭션을 엄격히 보호받으면서 인프라 비용과 개발 복잡도를 최적화하도록 **하이브리드형 테넌트 분리 모델**을 제안한다.

### 20.1 테넌트 격리 수준별 성능 및 경제성 분석

테넌트 성격과 비즈니스 티어(무료 보급형, 표준형, 프리미엄 엔터프라이즈형)에 따라 아래 분리 방식을 조합해 배분한다.

| 격리 방식 | 기술적 구현 메커니즘 | 물리적 보안성 | 비용 효율성 | 스케일링 기법 |
|---|---|---|---|---|
| **테이블 공유형**<br>(Shared Table) | 모든 테넌트가 동일 테이블을 공유하며, `tenant_id` 필드를 전역 인덱싱하여 구분 | 낮음: 쿼리 작성 실수 시 타사 데이터 노출 위험 잔존 | 최상: 단일 인프라 자원으로 수천 개의 소규모 테넌트 처리 가능 | DB 단의 파티셔닝(Partitioning) 및 수평적 샤딩 |
| **논리 스키마 격리형**<br>(Schema per Tenant) | 단일 DB 내에서 테넌트별 독립적인 Schema(네임스페이스)를 동적 생성 | 중간: DB 사용자 권한 제어를 통해 접근 통제 | 중간: 단일 인프라 자원을 공유하되 논리적 분할 유지 | 스키마 마이그레이션 자동화 툴링 연계 필수 |
| **물리 DB 격리형**<br>(Database per Tenant) | 테넌트별 독립된 별도의 DB 인스턴스 또는 컨테이너를 완벽 분리 프로비저닝 | 최상: 해킹 및 장애 발생 시 타 테넌트로 전파 차단 | 낮음: 테넌트 증가에 비례하여 인프라 비용 가파르게 급증 | 테넌트별 읽기/쓰기 복제본(Replica) 확장 및 전용 스토리지 할당 |

기존 단일 소스를 개선하려면 데이터 구조에 상호 격리성을 선언적으로 부여하는 **미들웨어 계층**을 먼저 구현해야 한다.

- **글로벌 쿼리 필터(Global Query Filter):** Prisma ORM이나 하부 프레임워크 쿼리 엔진에 탑재하여, 명시적 조건문이 누락되더라도 모든 `SELECT`·`UPDATE`·`DELETE` 구문에 요청 세션의 `tenant_id`가 강제 주입되도록 시스템화한다.
- **행 단위 보안(Row Level Security):** DB 레벨에서 RLS 규칙을 적용하여, 인증되지 않은 요청 주체가 다른 테넌트의 영속성 컨텍스트에 접근하는 길을 원천 차단한다.

### 20.2 에지 미들웨어 기반의 동적 도메인 해소 및 라우팅

사용자가 커스텀 도메인(`brand-a.com`) 또는 플랫폼 기본 도메인(`brand-a.platform.com`)으로 접속할 때, 게이트웨이·미들웨어 레이어가 이를 실시간으로 판별해 해당 테넌트 전용 페이지로 재라우팅한다. 이를 위해 **Next.js 에지 미들웨어(Edge Middleware)** 기반의 라우팅 레이어를 설계한다.

```
[인터넷 요청 인입: brand-a.com]
        │
        ▼
[Next.js Edge Middleware]
        │
        ├── 1. 요청 Host 헤더에서 "brand-a.com" 추출
        ├── 2. 분산 글로벌 Redis 캐시에서 매핑 테이블 조회 (Tenant ID 매치)
        │      (tenant_status == "active" 검증)
        │
        ▼
[동적 경로 재작성 (Path Rewrite)]
        │
        ├── 내부적으로 /_tenants/[tenant_id]/products 로 Rewrite 실행
        └── (브라우저 주소창의 URL은 brand-a.com으로 영구 유지)
```

이 라우팅 연산의 지연 시간은 사용자 이탈률과 직결되므로, 전체 응답 속도를 다음 수식 기준으로 최적화한다.

$$T_{\text{response}} = T_{\text{routing}} + T_{\text{fetch\_tenant}} + T_{\text{render\_page}}$$

여기서 $T_{\text{fetch\_tenant}}$를 거의 0ms에 가깝게 만들기 위해, 테넌트 상태 및 도메인 해소 캐시 데이터를 인메모리 성격의 글로벌 분산 에지 스토리지(**Cloudflare KV** 또는 **에지 배포형 Redis 클러스터**)에 저장한다.

### 20.3 신규 테넌트 온보딩 자동화

- 신규 입점 고객이 가입 폼을 제출하면 자동으로 DB 내 테넌트 메타 정보를 생성한다.
- 가입 테넌트의 테마 옵션(7.3의 4대 테마 모델)에 따라 기본 템플릿 레이아웃 데이터를 JSON 형태로 DB에 동적 적재하여, 즉각 구동 가능한 전용 스토어프론트를 발급한다.
- **Noisy Neighbor(특정 테넌트가 공용 자원을 독점해 다른 테넌트에 영향을 주는 현상)** 문제를 막기 위해 API 게이트웨이에 테넌트별 호출 빈도 제한(Rate Limiting) 정책을 적용하고, 독립된 Connection Pool을 할당·운영한다.

---

## 21. 서버 드리븐 UI(SDUI) 및 전시 엔진 심화

Part I의 6.2/17장에서 정의한 "서버가 화면 명세를 내려주고 클라이언트가 해석해 그리는" 구조를 SaaS 규모로 확장한다. 서버가 DB 템플릿 구성 데이터를 JSON 포맷으로 전달하고, 클라이언트는 이 스키마 규약만 해석해 화면을 스스로 그린다.

```
┌──────────────────────────────────────────────┐
│  백오피스 전시 에디터 (Drag & Drop 컴포넌트)  │
└──────────────────────┬───────────────────────┘
                       │ 템플릿 메타 데이터 생성
                       ▼
┌──────────────────────────────────────────────┐
│  데이터베이스 (JSON 형태의 레이아웃 명세 저장)   │
└──────────────────────┬───────────────────────┘
                       │ JSON API (GraphQL Union / Interfaces)
                       ▼
┌──────────────────────────────────────────────┐
│  Next.js Storefront (동적 위젯 렌더링 엔진)    │
│  - HLS 비디오 위젯, 숏츠 배너, 가격 등 렌더링  │
└──────────────────────────────────────────────┘
```

이 유연함을 DB 스키마와 클라이언트의 GraphQL 통신 구조에 매핑하기 위해 **컴포넌트 유니온 및 인터페이스 규약**을 수립한다. 화면 구성 요소는 공통 필드를 내장한 추상 타입으로 정의된다.

```graphql
interface Component {
  position: Int!
  margin: Int
}

type LiveStreamPlayer implements Component {
  position: Int!
  margin: Int
  streamingUrl: String!
  autoPlay: Boolean!
}

type ProductCarousel implements Component {
  position: Int!
  margin: Int
  items: [Product!]!
  scrollDirection: String!
}

union DisplayWidget = LiveStreamPlayer | ProductCarousel | SingleBanner
```

Next.js 클라이언트는 이 타입 정보를 API로 받은 뒤 **프래그먼트 온(Fragment on)** 구조를 활용해 위젯을 선언적으로 렌더링한다(17장의 `sectionRendererMap`이 이 역할을 담당). 이 방식은 클라이언트 재배포 없이도, 서버의 DB 명세 수정만으로 특정 시간 기획전 배너 배치나 실시간 라이브 플레이어 삽입을 전 테넌트 스토어에 즉시 반영한다.

---

## 22. 비디오 커머스 파이프라인 (GS SHOP · SK스토아 모델)

GS SHOP·SK스토아의 강점은 사용자 상호작용과 디바이스 특성을 잘 고려한 **미디어 인프라 구조**에 있다. 빌더가 미디어 최적화를 지원하려면 웹·하이브리드 앱 전체를 아우르는 통합 스트리밍/동적 배포 엔진이 필요하다.

### 22.1 1분 숏픽 추천 알고리즘 및 미디어 파이프라인

GS SHOP의 비디오 전용 UI **'숏픽(Shortpick)'**은 모바일 고객의 최근 클릭 로그를 추적해 협업 필터링(CF)·콘텐츠 기반 필터링(CB) 알고리즘으로 맞춤 후보 상품을 뽑은 뒤, 그중 1분 이내의 숏폼 비디오가 있는 상품을 우선 배치한다.

```
[고객의 상세 페이지 진입 / 클릭 액션 발생]
                  │
                  ▼
[최근 클릭 행동 데이터 수집 및 실시간 로그 파이프라인 전송]
                  │
                  ▼
[CF (협업 필터링) / CB (콘텐츠 기반 필터링) 추천 엔진 연산]
                  │
                  ▼
[후보 상품 리스트업 및 실시간 동영상 유무 메타데이터 대조 필터링]
                  │
                  ▼
[동영상(1분 이내 숏픽)을 보유한 최적 추천 상품을 전면 노출]
```

미디어 배포를 처리하는 빌더 솔루션의 **클라우드 트랜스코딩 아키텍처**는 다음과 같다.

```
[송출 장비 (RTMP / SRT 프로토콜)]
              │
              ▼
  [AWS Elemental MediaLive]
              │
              ├── 1. 적응형 비트레이트 HLS / DASH 트랜스코딩 실행
              ├── 2. 1080p, 720p, 480p 세그먼트 분할 생성
              │
              ▼
    [AWS S3 / Elemental MediaStore]
              │
              ▼
      [AWS CloudFront Edge]
              │
              ├── 엣지 캐싱 및 지역적 미디어 최적화 배포
              │
              ▼
     [HLS JS 비디오 플레이어]
```

- 비디오 플레이어 인프라는 Next.js 스토어프론트에서 스크롤 위치에 반응해, 화면에 들어온 숏츠만 저용량 비트레이트로 실시간 스트리밍한다.
- 백오피스 미디어 업로더 모듈은 동영상 업로드 시점에 **AWS Lambda 서버리스 워크플로우**를 트리거해, 영상을 **STT(Speech To Text)**로 해석하고, AI가 멘트가 집중되거나 핵심 상품 카드가 노출된 구간을 찾아 1분 미만의 숏픽 영상으로 분할·가공한 뒤 상품 데이터와 매핑하는 자동화를 지원한다.

### 22.2 TV·모바일 하이브리드 라이브 및 MLC 스튜디오 연계

SK스토아 아키텍처의 혁신 요소는, 사용자가 모바일 앱에서 송출·시청하는 **전용 모바일 라이브 판매 방송을 TV 메인 스크린에 오버레이 형태로 동시 송출**하는 스마트 홈쇼핑(N-Screen) 연계 모델이다.

- 빌더의 미디어 파이프라인은 단일 인코딩 아웃풋 소스를 두 갈래 프로토콜(모바일 앱 렌더러용 HLS + 스마트 TV 전용 미디어 수신기용 인코딩)로 **병렬 트랜스코딩**하여 배포 효율성을 확보한다.
- 다채널 송출용 **MLC(Mobile Live Commerce) 오케스트레이션 인터페이스**를 구성한다. 관리자가 한 번의 조작으로 본사 스토어프론트는 물론 제휴처(11번가, 카카오쇼핑라이브, 유튜브 채널 등)에 동일한 실시간 라이브 스트림과 상품 연동 API 데이터를 한꺼번에 송출·제어하는 **채널 퍼블리싱** 기능을 기본 스펙으로 구현한다.

---

## 23. CJ온스타일형 O2O 통합 전시

CJ온스타일 모델은 가전·가구·패션 의류 등 고관여 상품군의 오프라인 실물 전시 경험을 모바일 온라인 구매로 이어주는 **O2O(Online to Offline) 전시 기법**을 갖추고 있다. 빌더에 통합할 O2O 전시 프레임워크는 코엑스 홈·테이블데코페어, 리빙ON페어 등 대형 실물 팝업 공간에서 이뤄지는 온·오프라인 연계형 비즈니스를 지원한다.

```
                       [ 코엑스 오프라인 하이브리드 전시관 구역 ]
┌───────────────────────────┬───────────────────────────┬───────────────────────────┐
│     주방/다이닝 테마      │     수면 전문 침실 테마   │     인테리어 미니 컨설팅  │
│  (하이엔드 씽크볼 등 전시) │    (프리미엄 매트리스 등)  │    (라이브 부스 실시간)   │
│    [ QR코드 배너 배치 ]    │    [ QR코드 배너 배치 ]    │    [ QR코드 배너 배치 ]    │
└─────────────┬─────────────┴─────────────┬─────────────┴─────────────┬─────────────┘
              │                           │                           │
              └───────────────────────────┼───────────────────────────┘
                                          │ 오프라인 부스 QR코드 모바일 스캔 실행
                                          ▼
                         [ 모바일 앱 디바이스 (Next.js 스토어) ]
                          - 팝업 전용 초단기 기획전 모듈로 다이렉트 랜딩
                          - 자동 가입 및 오프라인 전시 구매자 전용 할인 프로모션 적용
                          - 실시간 인테리어 큐레이션 및 모바일 라이브 상담 참여
```

오프라인 전시관 내 개별 테마룸(거실·주방·침실)에 놓인 베스트 브랜드 상품마다 백오피스에서 일괄 자동 출력한 고유 QR코드를 붙인다. 고객이 QR코드를 스캔하면 Next.js 프론트엔드가 QR에 담긴 **UTM 파라미터와 테넌트 ID**를 읽어, 앱 전용 딥링크 또는 실시간 기획전 상세 화면으로 고객을 **가입 절차 없이** 자연스럽게 연결한다. 그 결과 오프라인 체험과 모바일 결제가 매끄럽게 이어진다.

---

## 24. 실시간 대용량 트랜잭션을 위한 서버리스 멀티에이전트 AI

라이브 커머스가 과열되는 시점에는 수만 명의 모바일 시청자가 한꺼번에 몰려 실시간 질문을 쏟아내며, MD 상품 재고와 카드 청구 할인가도 수시로 바뀐다. 단일 대형 언어 모델(LLM)에 모든 실시간 연산을 맡기면 지연 시간이 급증하고 인프라 비용도 크게 늘어난다. 이를 피하기 위해 CJ온스타일이 채택한 **AWS Bedrock 기반 멀티에이전트 분산 처리 시스템**을 제안한다.

전체 시스템 흐름과 자원 할당 속도는 다음 제어 방정식을 기초로 수립된다.

$$T_{\text{total}} = T_{\text{co-ordinator}} + \max(T_{\text{product\_spec\_agent}}, T_{\text{live\_inventory\_agent}}, T_{\text{promotion\_agent}}) + T_{\text{response\_synthesis}}$$

하나의 **Co-Ordinator Agent**가 들어온 질문의 성격을 임베딩 벡터로 분석한 뒤, 적절한 전문 에이전트에 작업을 빠르게 분배한다.

```
                     [ 모바일 실시간 채팅창 고객 질문 인입 ]
                                    │
                                    ▼
                          [ Co-Ordinator Agent ]
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
[ Product Spec Agent ]     [ Live Inventory Agent ]      [ Promotion Agent ]
- MD 등록 사전 정보 RAG 조회   - DynamoDB 연결 실시간 재고 갱신   - 테넌트 카드 할인 혜택 체크
- Amazon DynamoDB 정보 수집    - S3 제품 상세 속성 실시간 질의    - 가용 프로모션 정합성 수렴
        │                           │                           │
        └───────────────────────────┼───────────────────────────┘
                                    │
                                    ▼
                      [ Amazon Bedrock 응답 생성 API ]
                                    │
                                    ▼
                     [ 시청자 화면 내 맞춤형 답변 즉각 송출 ]
```

이 구조는 상품 수량·현재가처럼 시시각각 바뀌는 데이터를 NoSQL DB에서 비동기로 즉시 조회하므로, 대규모 트래픽에서도 병목 없이 빠른 자동 응대를 유지한다.

---

# Part III. 개발 및 마이그레이션 전략

## 25. 개발 단계 제안 (빌더 코어)

Part I 기준의 빌더 코어를 기존 소스에 안착시키는 5단계 순서다.

### 25.1 1단계: 기존 쇼핑몰 구조 정리

목표는 기존 소스에서 하드코딩된 화면 구조를 분리하는 것이다.

```text
작업
 ├─ Header / GNB / Footer 컴포넌트 분리
 ├─ ProductCard 표준화
 ├─ Banner 컴포넌트 표준화
 ├─ ProductGrid / ProductCarousel 컴포넌트 분리
 └─ 기존 메인 페이지를 섹션 단위로 분해
```

### 25.2 2단계: 전시 API 추가

```text
작업
 ├─ page 테이블 추가
 ├─ page_section 테이블 추가
 ├─ product_group 테이블 추가
 ├─ display API 개발
 └─ home page를 API 기반 렌더링으로 변경
```

이 단계가 끝나면 메인 화면의 섹션 순서와 상품 그룹을 DB 설정으로 바꿀 수 있다.

### 25.3 3단계: 관리자 빌더 추가

```text
작업
 ├─ 페이지 목록
 ├─ 섹션 추가/수정/삭제
 ├─ 섹션 순서 변경
 ├─ 상품 그룹 선택
 ├─ 배너 그룹 선택
 ├─ PC/Mobile 미리보기
 └─ 발행
```

### 25.4 4단계: 메뉴/카테고리 빌더 추가

```text
작업
 ├─ 메뉴 트리 관리
 ├─ 카테고리 트리 관리
 ├─ 메뉴와 대상 연결
 ├─ GNB 렌더링 API
 └─ 쇼핑몰별 메뉴 구성
```

### 25.5 5단계: 테마/멀티몰 확장

```text
작업
 ├─ mall 테이블 추가
 ├─ theme 테이블 추가
 ├─ domain 기반 mall 식별
 ├─ 테마 CSS 변수 적용
 ├─ 쇼핑몰별 로고/색상/메뉴 분리
 └─ 여러 쇼핑몰 생성 기능
```

---

## 26. 스트랭글러 피그 현대화 전략 (SaaS 전환)

25장이 빌더 코어의 기능 단계라면, 본 장은 **기존 모놀리식 소스를 미디어·멀티테넌트 SaaS로 안전하게 이주**하는 상위 전환 전략이다. 현재 소스를 일시에 교체하는 **"빅뱅 배포"**는 개발 조직의 피로도, 다운타임, 데이터 소실 위험을 수반하므로, 구식 소스를 단계별로 감싸며 대체하는 **스트랭글러 피그(Strangler Fig)** 전략을 권고한다.

### 26.1 4단계 리팩토링 마이그레이션

```
┌────────────────────────────────────────────────────────────────────────┐
│ [단계 1] 백엔드 데이터베이스 스키마 확장 및 API Gateway 레이어 안착    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ [단계 2] 프론트엔드 코드 분리 및 Next.js SSR / ISR 캐싱 전면 점유    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ [단계 3] 데이터베이스 격리 전략 실현 (RLS / Tenant DB 다원 동적 연결) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ [단계 4] 미디어 스트리밍 파이프라인 정착 및 AI 추천·쇼핑 비서 결합    │
└────────────────────────────────────────────────────────────────────────┘
```

**단계 1 — API 통로 개설 및 게이트웨이 정착**
- *실행 과제:* 기존 소스에서 데이터를 직접 조작하던 템플릿 뷰 엔진 부분을 백업 격리하고, 회원 가입·장바구니·주문 로직을 호출할 수 있는 표준 RESTful 또는 GraphQL API 엔드포인트를 우선 마련한다. (Part I 16장 API 설계와 정합)
- *인프라:* 시스템 전단에 엔터프라이즈급 API 게이트웨이를 수립하고, 모든 트래픽 인입을 게이트웨이 경유로 만들어 특정 테넌트로 라우팅할 준비를 갖춘다.

**단계 2 — 프론트엔드 분리 및 SDUI 도입**
- *실행 과제:* Next.js 기반 경량 독립형 프론트엔드 프로젝트를 신설한다. 전체 페이지를 한꺼번에 전환하는 대신, 기획전용 다이내믹 랜딩 페이지에 우선하여 SDUI 명세(21장)를 다운로드받아 그리는 구조를 이식한다.
- *성능 보장:* 상품 상세·분류 페이지 등 핵심 화면에 SSG·ISR·SSR을 적용하여 속도와 SEO 수치를 극대화한다.

**단계 3 — 데이터베이스 격리 전이 실행**
- *실행 과제:* 기존 테이블에 `tenant_id` 글로벌 인덱싱 전이를 완료하고 Row Level Security 정책을 적용하기 시작한다. (20장 격리 모델과 정합)
- *하이브리드 분할:* 트래픽이 기하급수적으로 몰리는 프리미엄 브랜드 테넌트를 자동 선별하여, 독립 스키마 DB 또는 물리 인스턴스 DB로의 실시간 복제 파이프라인을 작동하고 동적 라우팅 대상을 한 단계씩 전이한다.

**단계 4 — 미디어 및 생성형 AI 인프라 안착**
- *실행 과제:* S3 미디어 업로드 파이프라인 및 AWS Elemental MediaLive를 완전히 정합시킨다. (22장)
- *지능화 고도화:* GS SHOP 숏픽 방식의 CF/CB 하이브리드 추천 서빙 엔진과 CJ온스타일형 Bedrock 분산 멀티에이전트 상담 봇(24장)을, 전 테넌트 스토어에 위젯 스펙 형태로 선택적 확장할 수 있는 준비 단계를 완결함으로써 고성능 미디어 커머스 템플릿 쇼핑몰 빌더를 최종 완성한다.

### 26.2 25장 코어 단계와 26장 전환 전략의 매핑

| 빌더 코어 단계 (25장) | 스트랭글러 피그 전환 단계 (26장) |
|---|---|
| 1단계: 구조 정리 / 2단계: 전시 API | 단계 1: API 게이트웨이 + 단계 2: 프론트 분리·SDUI |
| 3단계: 관리자 빌더 / 4단계: 메뉴·카테고리 빌더 | 단계 2 연장(전시 CMS 안착) |
| 5단계: 테마/멀티몰 확장 | 단계 3: DB 격리(멀티테넌시) |
| — (코어 이후 고도화) | 단계 4: 미디어·AI 인프라 |

---

## 27. MVP 범위

초기 MVP는 다음 수준이면 충분하다.

```text
MVP 기능
 ├─ 몰 생성
 ├─ 로고/컬러 설정
 ├─ 상단 메뉴 설정
 ├─ 카테고리 설정
 ├─ 메인 페이지 섹션 구성
 ├─ 배너 섹션
 ├─ 상품 그리드 섹션
 ├─ 상품 캐러셀 섹션
 ├─ 상품 그룹 관리
 ├─ PC/Mobile 미리보기
 ├─ 임시 저장
 └─ 발행
```

초기 제외 가능 기능(대부분 Part II의 SaaS 고도화 영역):

```text
초기 제외
 ├─ 완전 자유형 드래그앤드롭
 ├─ 복잡한 애니메이션 빌더
 ├─ AI 추천 / 대화형 쇼핑 에이전트
 ├─ 라이브 방송 / 숏폼 비디오 파이프라인
 ├─ 복잡한 개인화
 ├─ A/B 테스트
 ├─ 물리 DB 격리형 멀티테넌시
 ├─ O2O 팝업 전시 연동
 ├─ 입점사 정산
 └─ 외부 마켓 연동
```

---

# Part IV. 요약

## 28. 추천 구현 방향 요약

가장 적합한 설계는 다음이다.

```text
섹션 기반 쇼핑몰 빌더
 = 기본 레이아웃
 + 메뉴/카테고리 설정
 + 섹션 조합
 + 데이터 소스 연결
 + 테마 설정
 + 발행 관리
 (+ 멀티테넌시 · SDUI · 미디어 · AI 를 단계적으로 흡수)
```

핵심은 다음 5가지다.

```text
1. 메뉴와 카테고리를 분리한다.
2. 페이지를 섹션 단위로 구성한다.
3. 섹션과 데이터 소스를 분리한다.
4. 상품 카드를 표준화한다.
5. 테마와 레이아웃을 설정 기반으로 관리한다.
```

SaaS로 확장할 때 추가되는 핵심은 다음 3가지다.

```text
6. 모든 데이터에 tenant_id 격리를 선언적으로 강제한다. (Global Query Filter / RLS)
7. 화면은 서버가 내려주는 JSON 명세(SDUI)로만 그린다. (무배포 즉시 반영)
8. 미디어·AI는 서버리스/분산 파이프라인으로 위젯 스펙화해 선택 확장한다.
```

## 29. 최종 권장 구조

```text
[도메인/테넌트 기반 멀티몰]
  ↓
[에지 미들웨어 라우팅 + tenant_id 격리]
  ↓
[몰별 테마/메뉴/카테고리 설정]
  ↓
[페이지 빌더]
  ↓
[섹션 조합 (SDUI JSON 명세)]
  ↓
[상품 그룹/배너/프로모션/미디어 위젯 데이터 연결]
  ↓
[Storefront 렌더링]
```

현재 기본 쇼핑몰 소스를 개선한다면 가장 먼저 해야 할 일은 다음이다.

```text
1순위: 메인 화면을 섹션 단위로 분해
2순위: 섹션 설정을 DB화
3순위: 상품 그룹 개념 추가
4순위: 관리자에서 섹션 순서/데이터 변경 가능하게 구현
5순위: 메뉴/카테고리/테마를 몰별 설정으로 분리
6순위(SaaS): tenant_id 격리 + 에지 라우팅 + SDUI 전면화
7순위(고도화): 미디어 파이프라인 + AI 에이전트 위젯 결합
```

이 방식으로 설계하면 첨부 이미지와 유사한 기본 쇼핑몰 골격을 유지하면서도, 쇼핑몰마다 메뉴·카테고리·상품 전시·배너·프로모션을 자유롭게 구성할 수 있고, 나아가 여러 입점 브랜드가 독립적으로 운영하는 미디어 커머스 SaaS 빌더로 확장할 수 있다.

## 30. 결론

기존 쇼핑몰 소스를 미디어 커머스 SaaS 빌더로 끌어올리는 과정은 **멀티테넌시의 안전한 논리적/물리적 분할**과 **Next.js 기반 프론트엔드 디커플링**에서 출발한다. 신세계라이브쇼핑의 4대 화면 디자인 테마와 실시간 반영이 쉬운 서버 드리븐 UI 전시 아키텍처를 적용해, 플랫폼 운영자와 입점 브랜드의 마케팅 자율도를 최대한 끌어올린다.

여기에 **GS SHOP**의 실시간 동영상 숏픽 알고리즘, **SK스토아**의 TV-모바일 멀티 송출 환경, **CJ온스타일**의 O2O 팝업 전시 연동과 분산 처리형 AI 상담 에이전트를 결합하면, 빌더는 단순 쇼핑몰 툴을 넘어 시장 경쟁력을 갖춘 종합 커머스 솔루션이 된다.

이 모든 것을 **스트랭글러 피그 현대화 단계론**에 따라 안전하게 점진적으로 이주하면, 기술 격차와 비즈니스 리스크를 통제하면서 국내 4대 홈쇼핑의 강점을 흡수한 **차세대 플랫폼 빌더**를 완성할 수 있다.
