# 대시보드 (Dashboard)

## 1. 개요

- **URL:** `GET /admin`  
- **컨트롤러:** `controllers/admin/dashboardController.js`  
- **뷰:** `views/admin/dashboard.ejs` (레이아웃: `layouts/admin_layout`)  
- **관련 테이블:** `users`, `products`, `inquiries`, `orders`, `visitor_logs`, `page_views`, `search_logs`, `kakao_click_logs`, `kakao_inquiry_logs`  
- **파생 라우트:** `/admin/search-logs`, `/admin/traffic-sources`, `/admin/traffic-sources/drill`, `/admin/popular-products` (모두 같은 컨트롤러)

관리자 로그인 후 가장 먼저 보이는 요약 페이지입니다. 8개 섹션의 데이터를 **20개 쿼리를 `Promise.all` 로 병렬 실행**해 한 번에 채웁니다.

### 1.1 쿼리 파라미터

| name | 기본값 | 값 | 영향 |
|------|--------|-----|------|
| `search_range` | `30d` | `24h` / `7d` / `30d` | ⑥ 검색통계 집계 기간 |
| `chart_period` | `30d` | `7d` / `30d` / `90d` | ④ 추이 차트 기간 |

---

## 2. UI 구성 및 데이터 소스

### 2.1 ① 운영 현황 — 비즈니스 지표

| 카드 | 데이터 소스 |
|------|-------------|
| 회원 수 | `users` 전체 COUNT + 당일 신규(`DATE(created_at) = CURDATE()`) |
| 총 상품 | `products` 전체 COUNT + 당일 신규 |
| 문의 | `inquiries` 미답변(`is_answered = 0`) + 오늘 접수 |
| 가입 전환율 | 당일 가입 수 ÷ 오늘 UV × 100 |

- **뷰 전달:** `businessMetrics.{userTotal, userTodayNew, productTotal, productTodayNew, inquiryUnanswered, inquiryTodayNew, todaySignups, conversionRate}`

### 2.2 ② 방문 & 행동 — 트래픽 지표

| 지표 | 산식 |
|------|------|
| UV(오늘) | `SELECT COUNT(*) FROM visitor_logs WHERE visited_date = CURDATE()` — 행 자체가 IP·일 단위로 중복 제거되어 들어옴([visitors.md](./visitors.md) 참고) |
| 신규/재방문 | 같은 쿼리의 `SUM(is_new)` / `SUM(1 - is_new)` |
| PV(오늘) | `page_views` 당일 행 수 |
| PV/UV | PV ÷ UV |
| 평균 체류시간 | 오늘 `page_views` 를 `session_id` 로 묶어 `SUM(duration)` 한 뒤 세션 평균. 어제 값과의 차이를 `avgDurationDelta` 로 함께 전달 |
| 이탈률 | 오늘 세션 중 **PV 1건 + 첫·마지막 PV 간격 4초 미만**인 세션 비율 |

- **뷰 전달:** `trafficMetrics.{uv, newVisitors, returningVisitors, pv, pvPerUv, avgDuration, avgDurationDelta, bounceRate}`
- `page_views.duration` 은 프론트 비콘(`POST /api/pv-duration`, `routes/index.js`)이 채웁니다.

### 2.3 ③ 주문 현황

- `orders` 를 `status IN ('PENDING','PAID','PREPARING','SHIPPED','CANCELLED')` 로 GROUP BY
- 라벨: 대기 / 결제완료 / 배송준비 / 배송중 / 취소
- 각 카드는 `/admin/sales?status={status}` 로 링크
- **뷰 전달:** `orderStats` (배열: `{status, label, count}`)

### 2.4 ④ 방문 & 가입 추이 / 디바이스 비중

- **추이 차트:** 재귀 CTE(`WITH RECURSIVE dates`)로 `chart_period` 일수만큼 날짜를 생성한 뒤 `page_views`(PV) · `visitor_logs`(UV) · `users`(가입)를 LEFT JOIN → **빈 날짜도 0으로 채워짐**
- **뷰 전달:** `trendChart.{labels, pvData, uvData, signupData}`, `chartPeriod`
- **디바이스 비중:** 오늘 `page_views` 를 `device_type`(desktop/mobile/tablet) 으로 GROUP BY → `deviceBreakdown.{desktop, mobile, tablet, total}`

### 2.5 ⑤ 유입 매체 & 외부 검색 키워드

- **유입 매체 TOP 10 (`topReferers`):** 최근 30일 `page_views.referer_host` GROUP BY. `localhost`/`127.0.0.1`/빈값 제외 + 자사 호스트(`req.hostname`) 필터. `hostNameMap` 으로 한글 라벨(네이버 검색, 구글 검색, 인스타그램 …) 부여
- **외부 검색 키워드 (`externalKeywords`):** 최근 30일 검색엔진 referer(구글·네이버·다음·Bing·야후, 최대 5000행)의 URL 쿼리스트링에서 `q` / `query` / `keyword` / `search_query` / `text` 파라미터를 파싱해 상위 10개 집계
- **상세보기:** `/admin/traffic-sources` (4장)

### 2.6 ⑥ 사이트 내 검색통계

- **쿼리 파라미터:** `search_range` (기본 `30d`) — `24h` / `7d` / `30d`
- **인기 검색어 (`topSearchKeywords`):** `search_logs` 기간 내 검색어별 집계(`keyword`, `search_count`, `last_searched_at`, `zero_result_count`), `ORDER BY search_count DESC, last_searched_at DESC LIMIT 10`
- **검색 결과 없음 키워드 (`zeroResultKeywords`):** `result_count = 0` 인 검색만 집계, `ORDER BY search_count DESC, last_searched_at DESC LIMIT 10`
- **뷰 전달:** `topSearchKeywords`, `zeroResultKeywords`, `searchStatsRange: { value, label }`
- **상세보기:** `/admin/search-logs` → [search_logs.md](./search_logs.md)

### 2.7 ⑦ 인기 상품 TOP 10

- **카드 데이터(`popularProducts`)의 기준은 `products.view_count`** 입니다. `status = 'ON'` 상품을 `view_count DESC` 로 10건 뽑고, `kakao_click_logs` 의 상품별 클릭수를 LEFT JOIN 해 함께 보여줍니다.
- **뷰 전달:** `popularProducts` (`{id, name, slug, image, viewCount, kakaoClicks}`)
- **상세보기:** `/admin/popular-products` (5장) — 이 상세 페이지는 **`page_views` 기반 PV** 로 다시 계산하므로 대시보드 카드의 순위와 다를 수 있습니다.

> 뷰의 섹션 제목은 "상품 상세 PV 기준"이라고 적혀 있으나, 실제 카드 쿼리(Q16)는 `view_count` 를 씁니다.

### 2.8 ⑧ 카카오톡 문의 접수 경로 통계

- `kakao_inquiry_logs` 최근 30일 기준
- **경로별(`sources`):** `source`, `source_label` GROUP BY
- **요약:** 30일 총건수, 직전 30일 대비 증감(`delta`), 일 평균(`dailyAvg`)
- **분포:** 시간대별 24칸(`hourly`, `hourlyMax`), 요일별 7칸(`dow`, `dowMax`, `dowLabels` = 일~토, MySQL `DAYOFWEEK` 기준)
- **뷰 전달:** `kakaoInquiryStats`

---

## 3. 컨트롤러 로직 요약 (getDashboard)

1. `search_range` → `rangeFilter` SQL 조각 + `searchRangeLabel`, `chart_period` → `days`(7/30/90) 결정  
2. 20개 쿼리(Q1~Q20)를 `Promise.all` 로 병렬 실행  
3. 가공: 전환율·PV/UV·체류시간 델타·이탈률 계산, 주문 상태 라벨 매핑, 추이 차트 배열화, 디바이스 합계, referer 한글 매핑 및 자사 호스트 제외, 외부 검색 키워드 파싱, 카카오 시간/요일 버킷 채우기  
4. `res.render('admin/dashboard', { businessMetrics, trafficMetrics, orderStats, trendChart, chartPeriod, deviceBreakdown, topReferers, externalKeywords, topSearchKeywords, zeroResultKeywords, searchStatsRange, popularProducts, kakaoInquiryStats })`  
5. 예외 시 `res.status(500).send('Server Error')`

---

## 4. 유입 매체 상세 (GET /admin/traffic-sources)

- **핸들러:** `dashboardController.getTrafficSources`  
- **뷰:** `views/admin/traffic_sources_detail.ejs`

### 4.1 쿼리 파라미터

| name | 기본값 | 값 |
|------|--------|-----|
| `period` | `1m` | `today`(1일) / `7d` / `15d` / `1m`(30) / `3m`(90) / `1y`(365) / `custom` |
| `start`, `end` | - | `period=custom` 일 때 일수 계산에 사용 |
| `device` | `all` | `all` / `desktop` / `mobile` / `tablet` |
| `type` | `all` | `search` / `social` / `direct` / `viral` / `referral` |
| `sort` | `uv` | `uv` / `bounce` / `duration` |

### 4.2 데이터

- **매체 목록(`sources`, 최대 20건):** `page_views` 를 `referer_host` 로 GROUP BY. `referer_host IS NULL` → `__direct__`(직접 접속)로 묶고, 자사 도메인(`dev-mall.ydata.co.kr`, `ydata.co.kr`, `localhost`, `127.0.0.1`, `req.hostname`)은 제외  
  - 컬럼: UV(`COUNT(DISTINCT session_id)`), PV, 평균 체류시간, 이탈률(1PV·4초 미만 세션 비율), 신규/재방문 비율(`visitor_logs.is_new` 를 IP+날짜로 조인)
- **매체 유형(`classifyHost`)**: `search` / `social` / `viral`(네이버 카페·블로그) / `direct` / `referral`
- **요약(`summary`)**: 총 UV, 직전 동일 기간 대비 증감률(`uvDeltaPct`), 평균 이탈률, 기간 내 가입 수, 가입 전환율, **최고 매체(`bestMedia`) = 이탈률이 가장 낮은 매체**(매체별 전환 데이터가 없어 대용 지표를 씀)
- **유형별 비중(`typeBreakdown`)**: 검색/직접/SNS/바이럴/레퍼럴 UV 백분율 + 색상
- **추이 차트(`trendChart`)**: UV 상위 3개 매체의 일별 UV

### 4.3 드릴다운 (GET /admin/traffic-sources/drill)

- **핸들러:** `getTrafficSourceDrill` — **JSON 응답**(AJAX 전용, 뷰 없음)
- **쿼리:** `host`(필수, `__direct__` 이면 `referer_host IS NULL`), `days`(기본 30)
- **응답:** `{ pages: [{url, uv}] (진입 URL TOP 5), trend: [{date, uv}] (일별 UV), keywords: [{keyword, count}] (referer 파싱 TOP 5) }`
- 예외가 나도 500 대신 빈 배열 JSON 을 반환합니다.

---

## 5. 인기 상품 상세 (GET /admin/popular-products)

- **핸들러:** `dashboardController.getPopularProducts`  
- **뷰:** `views/admin/popular_products_detail.ejs`

### 5.1 쿼리 파라미터

| name | 기본값 | 값 |
|------|--------|-----|
| `period` | `30d` | `today` / `7d` / `30d` / `3m` / `custom`(+`start`, `end`) |
| `category` | - | 카테고리 ID (`categories.type = 'NORMAL'`) |
| `inquiryFilter` | `all` | `all` / `zero`(문의 0건) / `nonzero` |
| `sort` | `pv` | `pv` / `inquiry` / `duration` / `bounce` |

### 5.2 데이터 처리

- **PV 산출:** `page_views.page_url` 을 상품 URL 과 매칭 — `/products/{slug}`, `/products/view/{id}`, `/products/{slug}?…`. 대상 상품 상태는 `ON`, `SOLD_OUT`, `COMING_SOON`, `RESTOCK`. 상위 50건을 뽑은 뒤 필터·정렬을 적용하고 **최종 10건**으로 자릅니다.
- **문의 수:** `kakao_inquiry_logs` 중 `source = 'product_detail'` 인 건을 상품별 집계
- **이탈률:** 해당 상품 페이지를 본 세션 중 1PV·4초 미만 비율
- **스파크라인:** 최근 7일 상품별 일별 PV(`trend`, `trendMax`)
- **요약(`summary`)**: 총 PV, 총 문의 수, 문의 0건 상품 수, 상품당 평균 PV, 문의 전환율(문의÷PV), 1위 상품
- **경고 배너:** 문의 0건 상품 목록(`zeroInquiryProducts`)

---

## 6. 관련 링크

- 검색 로그 상세 목록: [search_logs.md](./search_logs.md) (`GET /admin/search-logs`)
- 방문자 통계: [visitors.md](./visitors.md) (`GET /admin/visitors/stats`)

---

*Last Updated: 2026-07-11*
