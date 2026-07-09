---
name: deploy-check
description: |
  배포 전 상용 환경 안전 점검 스킬. PM2 상태, 에러 로그, DB 마이그레이션 누락, 환경변수 동기화를 자동 점검하여 배포 사고를 방지한다.
  사용 시점: (1) /deploy-check 명령 실행 시, (2) git push 전 안전 점검이 필요할 때, (3) PM2 재시작 전 상태 확인이 필요할 때.
triggers:
  - deploy-check
  - 배포 점검
  - 배포 전 확인
  - deploy safety
---

# 배포 전 안전 점검 (Deploy Check)

상용 서버 배포 전 아래 항목을 순서대로 점검한다.

## 점검 항목

### 1. PM2 프로세스 상태
```bash
pm2 list
```
- 모든 프로세스가 `online` 상태인지 확인
- restart 횟수가 비정상적으로 높은 프로세스 감지
- 메모리 사용량 이상 여부 확인

### 2. 최근 에러 로그 스캔
```bash
# user 앱 에러 로그 (최근 50줄)
pm2 logs KTL_user --err --lines 50 --nostream
# admin 앱 에러 로그
pm2 logs KTL_admin --err --lines 50 --nostream
# batch 워커 에러 로그
pm2 logs KTL_admin_batch --err --lines 50 --nostream
```
- `Error`, `ECONNREFUSED`, `FATAL`, `UnhandledRejection` 등 치명적 패턴 감지
- 최근 1시간 내 반복 에러 여부

### 3. Git 상태 확인
```bash
git status
git log --oneline -5
```
- 커밋되지 않은 변경사항 경고
- develop 브랜치인지 확인
- 원격과 동기화 상태

### 4. DB 스키마 동기화 확인
- `schema.sql` 파일의 최근 변경 여부 확인
- 변경이 있다면 개발 DB와 상용 DB 모두 적용되었는지 확인 안내

### 5. 환경변수 파일 점검
```bash
# .env 파일 존재 여부
ls -la user/.env.production admin/.env.production
```
- 필수 환경변수 키가 누락되지 않았는지 확인

## 출력 형식

```
## 배포 점검 결과

| 항목 | 상태 | 비고 |
|------|------|------|
| PM2 프로세스 | ✅/⚠️/❌ | 상태 설명 |
| 에러 로그 | ✅/⚠️/❌ | 최근 에러 요약 |
| Git 상태 | ✅/⚠️/❌ | 브랜치/커밋 상태 |
| DB 스키마 | ✅/⚠️/❌ | 동기화 여부 |
| 환경변수 | ✅/⚠️/❌ | 누락 키 |

### 권장 조치
- (이슈가 있을 경우 구체적 조치 안내)
```

## 중요
- 이 스킬은 **조회만** 수행한다. 프로세스 재시작이나 설정 변경은 하지 않는다.
- 문제 발견 시 사용자에게 보고하고 조치 여부를 확인받는다.
