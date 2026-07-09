# Kotourlive 프로젝트 특화 체크리스트

## 1. 보안 (CRITICAL)

### SQL Injection
- `query(sql, params)`의 `?` 플레이스홀더 사용 필수
- 문자열 연결/템플릿 리터럴로 SQL 구성 금지
- `LIKE` 절: `LIKE ?` + `%${value}%`가 아닌 `LIKE CONCAT('%', ?, '%')` 사용

```javascript
// BAD
const sql = `SELECT * FROM tb_events WHERE title LIKE '%${keyword}%'`;

// GOOD
const sql = `SELECT * FROM tb_events WHERE title LIKE CONCAT('%', ?, '%')`;
const [rows] = await query(sql, [keyword]);
```

### XSS (EJS 뷰)
- 사용자 입력 데이터: `<%= %>` (이스케이프 출력) 사용
- `<%- %>` (비이스케이프)는 신뢰된 HTML만 (에디터 콘텐츠 등)
- URL 파라미터를 직접 뷰에 삽입하지 않음

### 인증/인가
- admin 라우트: `isAuthenticated` 미들웨어 필수
- admin API: `X-Client-ID` / `X-Secret-Key` 헤더 검증
- user 보호 라우트: Passport.js `isAuthenticated` 체크

### 시크릿 관리
- API 키, DB 비밀번호는 `.env.*` 파일 또는 `ENC:` 암호화 형식으로만
- 코드에 직접 하드코딩 금지
- 커밋 대상에 `.env`, `credentials` 파일 포함 금지

---

## 2. DB 패턴 (HIGH)

### 쿼리 패턴
- `infrastructure/db.js`의 `query()` 함수만 사용
- 트랜잭션: `pool.getConnection()` → `beginTransaction()` → `commit()/rollback()`
- mysql2 반환값: `const [rows] = await query(sql, params)` 패턴 확인

### 엔티티 테이블 구조
- 새 엔티티는 표준 테이블 세트 준수: `_contents`, `_translations`, `_seo`, `_slug_i18n` 등
- `schema.sql` + 개발 DB + 상용 DB 세 곳 동시 업데이트

### 페이징
- `LIMIT ? OFFSET ?` 패턴
- `page`/`pageSize` 파라미터 정수 변환 확인

---

## 3. 다국어 (HIGH)

### Locale 파일 동기화
- UI 텍스트 변경 시 9개 locale 파일 모두 업데이트: ko, en, ja, zh-CN, zh-TW, th, vi, fr, es
- 경로: `user/locales/{lang}.json`
- 키 구조가 모든 언어에서 동일해야 함

### 라우팅
- user 앱 새 페이지: `/:lang/` 하위에 마운트
- `config/routes.js`에 등록

### DB 콘텐츠 폴백
- 요청 언어 → en → 첫 번째 가용 언어 순서

---

## 4. 아키텍처 패턴 (MEDIUM)

### MVC + Service Layer
- 컨트롤러에 직접 SQL 쿼리 금지 → 서비스 레이어를 통해야 함
- 서비스 함수는 비즈니스 로직 + SQL 쿼리 담당
- 컨트롤러는 요청 파싱 + 서비스 호출 + 응답 포맷만

### 네이밍 컨벤션
- admin 컨트롤러: `admin_*_controller.js`
- user 컨트롤러: `*_controller.js`
- 서비스: `*_service.js` (admin은 `admin_*_service.js`)
- 변수/함수: camelCase, 클래스: PascalCase

### 무한스크롤 패턴
- `?json=true` 쿼리 파라미터로 JSON 응답 분기
- 첫 렌더: EJS 전체 페이지, 이후: JSON으로 아이템만

---

## 5. 워커 (schedule/) (MEDIUM)

### 안전성
- 무한루프 내 에러가 프로세스를 죽이지 않도록 try-catch 필수
- 에러 발생 시 적절한 대기(`sleep`) 후 재시도
- 리소스 정리 (DB 커넥션 반환, 파일 핸들 닫기)

### Puppeteer 브라우저 풀
- `infrastructure/browser_pool.js` 사용
- 직접 `puppeteer.launch()` 호출 금지

---

## 6. 이미지/파일 (LOW)

### S3 업로드
- `infrastructure/s3.js` 또는 관련 서비스 함수 사용
- 파일 확장자/MIME 타입 검증
- 업로드 크기 제한 확인

---

## 7. 코드 품질 기준

| 항목 | 기준 | 비고 |
|------|------|------|
| 함수 길이 | 50줄 이하 | 초과 시 분리 권장 |
| 파일 길이 | 800줄 이하 | 초과 시 모듈 분리 |
| 중첩 깊이 | 4단계 이하 | early return으로 평탄화 |
| async 에러 처리 | try-catch 필수 | 컨트롤러/서비스 진입점 |
| console.log | 제거 필수 | logger 사용 또는 제거 |
