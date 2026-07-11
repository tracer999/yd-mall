# 방문자 통계 (Visitors)

## 1. 개요

- **URL:** `GET /admin/visitors/stats`  
- **관련 테이블:** `visitor_logs`  
- **컨트롤러:** `controllers/admin/visitorController.js` (getStats)  
- **라우트:** `routes/admin/visitors.js` — 등록된 라우트는 `/stats` **하나뿐**  
- **뷰:** `views/admin/visitors/stats.ejs`  
- **차트:** Chart.js (CDN, 라인 차트)

사이트 방문 트래픽을 시간/일 단위로 시각화합니다. **실제 라우트는 `/admin/visitors/stats`** 이며, `/admin/visitors`만으로는 진입하지 않습니다.

---

## 2. 기간 필터 (period)

- **쿼리 파라미터:** `period` (기본값 `24h`)  
- **값:**  
  - `24h`: 최근 24시간 (시간별 24개 구간)  
  - `7d`: 최근 7일 (일별 7개 구간)  
  - `30d`: 최근 30일 (일별 30개 구간)
- 위 3개 이외의 값이 들어오면 `24h` 로 처리합니다.

---

## 3. 백엔드 데이터 처리

### 3.1 SQL

- `SELECT visited_at, ip_address FROM visitor_logs`  
- `WHERE visited_at >= NOW() - INTERVAL n DAY` (24h → `INTERVAL 1 DAY`, 7d → 7, 30d → 30)  
- `ORDER BY visited_at ASC`

### 3.2 KST 변환 및 집계

- **KST:** 컨트롤러 내 `toKST()` 헬퍼가 서버 시간대 오프셋을 제거하고 UTC+9 를 더해 변환  
- **집계:**  
  - 24h: 시간 단위 키 `YYYY-MM-DD HH`  
  - 7d/30d: 일 단위 키 `YYYY-MM-DD`  
- **중복 제거:** 같은 키에 대해 `ip_address` 를 Set 으로 모아 고유 IP 수만 카운트  
- **빈 구간:** 현재 시각(24h 는 정시, 7d/30d 는 자정)을 기준점으로 전체 구간(24 또는 7/30)을 역순 순회하며 데이터가 없는 구간은 0으로 채움 → 차트 끊김 방지

### 3.3 뷰로 전달하는 데이터

- `currentPeriod`: 선택된 period 값  
- `chartData.labels`: X축 라벨 (`HH:00` 또는 `MM-DD`)  
- `chartData.data`: 구간별 방문자 수(고유 IP 수) 배열  
- `title`: '방문자 통계', `layout`: `layouts/admin_layout`

---

## 4. 프론트엔드 (Chart.js)

- 서버가 `chartData` 를 숨김 요소 `#chart-data-container` 의 `data-stats` 속성(JSON 문자열)으로 전달  
- 클라이언트에서 `JSON.parse` 후 `#visitorChart` 캔버스에 라인 차트(단일 데이터셋 '방문자 수') 렌더  
- 기간 전환은 상단 `<select>` 의 `onchange` 가 `?period=7d` 등으로 페이지를 재요청

---

## 5. 방문 로그 수집 (visitor_logs)

- **수집 주체:** `middleware/visitorLogger.js` (스토어프론트 요청 파이프라인)  
- **중복 방지:** `visited_today` 쿠키(자정 만료)가 없을 때만 INSERT → **IP·일 단위로 이미 중복 제거된 행**이 쌓입니다  
- **제외 경로:** `/admin`, `/css`, `/js`, `/images`, `/auth`  
- **저장 값:** `ip_address`(`x-forwarded-for` 첫 값 우선), `user_agent`, `visited_date`, `visited_at`, `is_new`(해당 IP 의 기존 로그 존재 여부로 판정)  
- 로깅 실패는 요청을 막지 않습니다(에러 로그만 남김)

> 이 페이지는 `visitor_logs` 만 사용합니다. 페이지 단위 방문(`page_views`, PV·체류시간·유입 매체)은 별도 수집(`middleware/pageViewLogger.js`)이며 [대시보드](./dashboard.md)에서 다룹니다.

---

*Last Updated: 2026-07-11*
