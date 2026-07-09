---
name: alter-table
description: "DB 스키마 변경(ALTER/CREATE/DROP) 시 개발 DB, 상용 DB, schema.sql 파일 세 곳을 동시에 적용하는 스킬. 사용 시점: (1) /alter-table 명령 실행 시, (2) 테이블/컬럼 추가·수정·삭제가 필요할 때, (3) 새 엔티티 테이블을 생성할 때."
argument-hint: "SQL문 또는 변경 설명"
---

# DB Schema Change Skill — Kotourlive

DB 스키마 변경(테이블 생성, 컬럼 추가/수정/삭제 등)을 **개발 DB, 상용 DB, schema.sql** 세 곳에 일괄 적용한다.

## 접속 정보

| 환경 | 호스트 | 포트 | DB명 |
|------|--------|------|------|
| **개발** | ydata.co.kr | 3306 | dev_koreantourism |
| **상용** | office.ydata.co.kr | 3307 | kotourlive |

공통: user=`ydatasvc`, password=`NEWtec4075@@`

## Workflow

```
1. 입력 분석    → 사용자가 제공한 SQL 또는 변경 설명을 분석
2. SQL 생성     → 실행할 DDL SQL문 확정 (사용자 확인)
3. schema.sql   → 프로젝트 루트의 schema.sql 파일에 반영
4. 개발 DB 적용 → dev_koreantourism에 SQL 실행
5. 상용 DB 적용 → kotourlive에 SQL 실행 (사용자 확인 후)
6. CLAUDE.md    → 테이블 목록 업데이트 (새 테이블 추가 시)
7. 결과 검증    → 양쪽 DB에서 DESCRIBE/SHOW로 결과 확인
```

## Step 1: 입력 분석

사용자 입력이 SQL문이면 그대로 사용하고, 자연어 설명이면 적절한 DDL SQL을 생성한다.

**입력 예시:**
- `/alter-table ALTER TABLE tb_festival_contents ADD COLUMN venue_capacity INT DEFAULT 0`
- `/alter-table 축제 테이블에 venue_capacity 컬럼 추가해줘 (정수, 기본값 0)`
- `/alter-table 여행지(travel_spot) 엔티티 테이블 세트 생성`

## Step 2: SQL 확정 및 사용자 확인

생성된 SQL을 사용자에게 보여주고 승인을 받는다.

```
실행 예정 SQL:
  ALTER TABLE tb_festival_contents ADD COLUMN venue_capacity INT DEFAULT 0;

적용 대상:
  1. schema.sql (파일 수정)
  2. dev_koreantourism (개발 DB)
  3. kotourlive (상용 DB)

진행할까요?
```

**반드시 사용자 확인 후 진행한다.** 상용 DB에 직접 영향을 미치므로 확인 없이 실행하지 않는다.

## Step 3: schema.sql 파일 반영

프로젝트 루트의 `schema.sql` 파일을 읽고:

- **ALTER TABLE**: 해당 CREATE TABLE 문에서 컬럼/인덱스를 수정
- **CREATE TABLE**: 관련 엔티티 근처에 새 CREATE TABLE문 추가
- **DROP TABLE**: 해당 CREATE TABLE문 제거

`schema.sql`은 전체 DDL의 원본(source of truth)이다. 파일 수정 시 기존 포맷과 정렬을 유지한다.

## Step 4: 개발 DB 적용

```bash
mysql -h ydata.co.kr -P 3306 -u ydatasvc -pNEWtec4075@@ dev_koreantourism -e "SQL문"
```

실행 후 결과를 확인한다. 에러 발생 시 원인을 분석하고 사용자에게 보고한다.

## Step 5: 상용 DB 적용

```bash
mysql -h office.ydata.co.kr -P 3307 -u ydatasvc -pNEWtec4075@@ kotourlive -e "SQL문"
```

**주의사항:**
- 상용 DB는 실 서비스 데이터에 영향을 미친다
- 대량 데이터가 있는 테이블의 ALTER는 락 발생 가능성을 알린다
- DROP/TRUNCATE 등 파괴적 명령은 반드시 한 번 더 경고한다

## Step 6: CLAUDE.md 테이블 목록 업데이트

새 테이블을 생성한 경우:
1. CLAUDE.md의 "테이블 목록" 섹션에 새 테이블 추가
2. 테이블 총 개수 갱신
3. "최종 갱신" 날짜 업데이트

## Step 7: 결과 검증

양쪽 DB에서 변경 사항을 확인한다:

```bash
# 컬럼 확인
mysql -h ydata.co.kr -P 3306 -u ydatasvc -pNEWtec4075@@ dev_koreantourism -e "DESCRIBE 테이블명"
mysql -h office.ydata.co.kr -P 3307 -u ydatasvc -pNEWtec4075@@ kotourlive -e "DESCRIBE 테이블명"

# 테이블 존재 확인
mysql -h ydata.co.kr -P 3306 -u ydatasvc -pNEWtec4075@@ dev_koreantourism -e "SHOW TABLES LIKE '테이블명'"
mysql -h office.ydata.co.kr -P 3307 -u ydatasvc -pNEWtec4075@@ kotourlive -e "SHOW TABLES LIKE '테이블명'"
```

양쪽 결과가 동일한지 비교하고, 최종 결과를 요약 보고한다.

## 에러 처리

| 상황 | 대응 |
|------|------|
| 개발 DB 성공, 상용 DB 실패 | 에러 원인 분석 후 사용자에게 보고. 상용 DB만 재시도 |
| 이미 존재하는 컬럼/테이블 | `IF NOT EXISTS` 또는 사전 확인 후 스킵 |
| 외래키 제약 충돌 | 제약 조건 확인 후 순서 조정 |
| 타임아웃 | 대용량 테이블 ALTER 시 사용자에게 경고 |

## 주의사항

- **절대 DROP DATABASE를 실행하지 않는다**
- **TRUNCATE TABLE은 상용 DB에서 실행하지 않는다** (개발 DB에서만 사용자 확인 후 허용)
- 스키마 변경 후 관련 서비스 코드 수정이 필요할 수 있음을 안내한다
- **INSERT/UPDATE/DELETE(변경)**: 실행 전 반드시 사용자 승인후 실행