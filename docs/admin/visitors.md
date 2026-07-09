# 방문자 통계 (Visitors)

## 1. 개요

- **URL:** `GET /admin/visitors/stats`  
- **관련 테이블:** `visitor_logs`  
- **컨트롤러:** `controllers/admin/visitorController.js`  
- **뷰:** `views/admin/visitors/stats.ejs`  
- **차트:** Chart.js (라인 차트)

사이트 방문 트래픽을 시간/일 단위로 시각화합니다. **실제 라우트는 `/admin/visitors/stats`** 이며, `/admin/visitors`만으로는 진입하지 않습니다.

---

## 2. 기간 필터 (period)

- **쿼리 파라미터:** `period` (기본값 `24h`)  
- **값:**  
  - `24h`: 최근 24시간 (시간별 24개 구간)  
  - `7d`: 최근 7일 (일별 7개 구간)  
  - `30d`: 최근 30일 (일별 30개 구간)

---

## 3. 백엔드 데이터 처리

### 3.1 SQL

- `WHERE visited_at >= NOW() - INTERVAL n DAY` (또는 1 DAY)  
- `ORDER BY visited_at ASC`  
- 조회 컬럼: `visited_at`, `ip_address`

### 3.2 KST 변환 및 집계

- **KST:** UTC 기준 저장값을 한국 시간(UTC+9)으로 변환하는 헬퍼 사용  
- **집계:**  
  - 24h: 시간 단위 키 `YYYY-MM-DD HH`  
  - 7d/30d: 일 단위 키 `YYYY-MM-DD`  
- **중복 제거:** 같은 키에 대해 `ip_address`를 Set으로 모아 고유 IP 수만 카운트  
- **빈 구간:** 루프로 전체 구간(24 또는 7/30)을 순회하며 데이터가 없는 구간은 0으로 채움 → 차트 끊김 방지

### 3.3 뷰로 전달하는 데이터

- `currentPeriod`: 선택된 period 값  
- `chartData.labels`: X축 라벨 (예: "00:00"~"23:00" 또는 "MM-DD")  
- `chartData.data`: 구간별 방문자 수(고유 IP 수) 배열  

---

## 4. 프론트엔드 (Chart.js)

- 서버에서 `chartData`를 JSON 또는 data attribute 등으로 전달  
- 클라이언트에서 파싱 후 라인 차트로 시각화  
- 기간 전환 시 같은 URL에 `?period=7d` 등으로 재요청

---

*Last Updated: 2026-02-05*
