# 로그 및 로테이션

## 로그 파일 구성

| 파일 | 생성 주체 | 내용 |
|------|-----------|------|
| `logs/pm2-out.log` | PM2 | stdout (console.log 등) |
| `logs/pm2-error.log` | PM2 | stderr (console.error 등) |
| `logs/access.log` | 앱 | HTTP 접속 로그 |

---

## 날짜별 로테이션 설정

### 1. pm2-out.log, pm2-error.log (PM2 로그)

PM2 전용 모듈 **pm2-logrotate**를 사용합니다.

```bash
# pm2-logrotate 설치
pm2 install pm2-logrotate

# 설정 확인
pm2 conf pm2-logrotate
```

**기본 설정 예시** (로그 30일 보관):

```bash
# 로테이션 주기 (cron 형식): 매일 0시
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'

# 보관 일수
pm2 set pm2-logrotate:retain 30

# 압축 저장
pm2 set pm2-logrotate:compress true

# 최대 파일 크기 (예: 10M 초과 시 로테이션)
pm2 set pm2-logrotate:max_size 10M
```

로테이션된 파일은 `logs/pm2-out.log.YYYY-MM-DD` 형식으로 생성됩니다.

---

### 2. access.log (앱 접속 로그)

PM2가 관리하지 않으므로 **logrotate**(Ubuntu 기본 포함)를 사용합니다.

#### (1) logrotate 설치 확인

```bash
# Ubuntu: 대부분 기본 설치됨
which logrotate
# 없으면 설치
sudo apt update && sudo apt install logrotate
```

#### (2) 설정 파일 생성

프로젝트 경로를 실제 배포 경로로 바꿉니다 (예: `/home/ubuntu/dev-mall`).

```bash
sudo nano /etc/logrotate.d/dev-mall
```

다음 내용 입력 (`/home/ubuntu/dev-mall`을 실제 경로로 변경):

```
/home/ubuntu/dev-mall/logs/access.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    dateext
    dateformat -%Y-%m-%d
}
```

| 옵션 | 설명 |
|------|------|
| `daily` | 매일 로테이션 |
| `rotate 30` | 30일치 보관 후 삭제 |
| `compress` | 로테이션된 파일 gzip 압축 |
| `delaycompress` | 가장 최근 1개는 압축하지 않음 |
| `missingok` | 파일 없어도 에러 없이 넘어감 |
| `notifempty` | 빈 파일은 로테이션하지 않음 |
| `copytruncate` | 파일 복사 후 원본 비움 (앱 재시작 불필요) |
| `dateext` | 날짜를 파일명에 포함 |
| `dateformat -%Y-%m-%d` | `access.log-2026-02-07` 형식 |

#### (3) 설정 검증

```bash
# 문법 검사 및 시뮬레이션 (실제 로테이션 안 함)
sudo logrotate -d /etc/logrotate.d/dev-mall
```

#### (4) 수동 실행 (테스트)

```bash
# 강제 로테이션 실행 (테스트용)
sudo logrotate -f /etc/logrotate.d/dev-mall

# 결과 확인: access.log-YYYY-MM-DD 또는 access.log.1 등 생성됨
ls -la /home/ubuntu/dev-mall/logs/
```

#### (5) 자동 실행 (cron)

Ubuntu는 `/etc/cron.daily/logrotate`로 **매일 자동 실행**됩니다. 별도 cron 등록은 필요 없습니다.

```bash
# cron.daily 실행 여부 확인 (보통 매일 06:25)
ls -la /etc/cron.daily/logrotate
cat /etc/cron.daily/logrotate
```

특정 시간(예: 0시)에 실행하려면 `/etc/cron.d/`에 직접 등록:

```bash
sudo nano /etc/cron.d/dev-mall-logrotate
```

```
# 매일 0시에 access.log 로테이션
0 0 * * * root /usr/sbin/logrotate /etc/logrotate.d/dev-mall
```

---

### 요약

| 로그 | 로테이션 도구 | 비고 |
|------|---------------|------|
| pm2-out.log, pm2-error.log | pm2-logrotate | `pm2 install pm2-logrotate` |
| access.log | logrotate | OS 표준, `/etc/logrotate.d/` 에 설정 |
