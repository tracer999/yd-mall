# 로그 및 로테이션

운영 서버 프로젝트 경로는 **`/data/yd-mall`** 입니다. 로그는 모두 그 아래 `logs/` 에 쌓입니다.

## 로그 파일 구성

| 파일 | 생성 주체 | 내용 |
|------|-----------|------|
| `logs/pm2-out.log` | PM2 (`ecosystem.config.cjs`) | stdout (console.log 등) |
| `logs/pm2-error.log` | PM2 (`ecosystem.config.cjs`) | stderr (console.error 등) |
| `logs/access.log` | 앱 (`app.js`) | HTTP 접속 로그 (IP, 로그인 상태, 응답시간 등) |

- PM2 로그 경로·포맷은 `ecosystem.config.cjs` 의 `out_file` / `error_file` / `log_date_format` 에 정의돼 있습니다.
- `access.log` 는 `app.js` 가 `fs.createWriteStream(..., { flags: 'a' })` 로 **파일 디스크립터를 열어둔 채** 직접 씁니다. 이 때문에 로테이션 방식이 중요합니다(아래 `copytruncate` 참고).
- 프록시 뒤에 있으므로 클라이언트 IP 는 `X-Forwarded-For` 첫 항목을 사용합니다(`app.set('trust proxy', 1)`).

---

## 1. pm2-out.log, pm2-error.log — pm2-logrotate

PM2 전용 모듈 **pm2-logrotate** 를 사용합니다.

```bash
# 설치
pm2 install pm2-logrotate

# 설정 확인
pm2 conf pm2-logrotate
```

**설정 예시** (30일 보관):

```bash
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'   # 매일 0시
pm2 set pm2-logrotate:retain 30                    # 30일 보관
pm2 set pm2-logrotate:compress true                # gzip 압축
pm2 set pm2-logrotate:max_size 10M                 # 10M 초과 시 즉시 로테이션
```

로테이션된 파일은 `logs/pm2-out.log.YYYY-MM-DD` 형식으로 생성됩니다.

---

## 2. access.log — OS logrotate

PM2 가 관리하지 않으므로 **logrotate**(Ubuntu 기본 포함)를 사용합니다.

### (1) 설치 확인

```bash
which logrotate
# 없으면
sudo apt update && sudo apt install logrotate
```

### (2) 설정 파일 생성

```bash
sudo nano /etc/logrotate.d/dev-mall
```

```
/data/yd-mall/logs/access.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    dateext
    dateformat -%Y-%m-%d
    su root root
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
| **`copytruncate`** | **필수.** 앱이 파일 디스크립터를 열어둔 채 append 하므로, 파일을 rename 하면 앱은 계속 옛 inode 에 쓴다. 복사 후 원본을 비우는 방식이라야 앱 재시작 없이 로테이션된다. |
| `dateext` | 날짜를 파일명에 포함 |
| `dateformat -%Y-%m-%d` | `access.log-2026-07-11` 형식 |
| `su root root` | 로그 디렉터리 소유자가 root 가 아닐 때 권한 경고 방지 (필요 시 실제 소유자로 변경) |

### (3) 검증

```bash
# 문법 검사 + 시뮬레이션 (실제 로테이션 안 함)
sudo logrotate -d /etc/logrotate.d/dev-mall
```

### (4) 수동 실행 (테스트)

```bash
sudo logrotate -f /etc/logrotate.d/dev-mall
ls -la /data/yd-mall/logs/
```

### (5) 자동 실행

Ubuntu 는 `/etc/cron.daily/logrotate` (또는 systemd `logrotate.timer`)로 **매일 자동 실행**됩니다. 별도 cron 등록은 필요 없습니다.

```bash
ls -la /etc/cron.daily/logrotate
systemctl status logrotate.timer   # systemd 기반인 경우
```

특정 시각(예: 0시)에 돌리고 싶다면 `/etc/cron.d/` 에 직접 등록합니다.

```
# /etc/cron.d/dev-mall-logrotate
0 0 * * * root /usr/sbin/logrotate /etc/logrotate.d/dev-mall
```

---

## 3. 로그 보기

```bash
cd /data/yd-mall
./dev-mall.sh logs                  # pm2 logs dev-mall --lines 50
pm2 logs dev-mall --err             # 에러만
tail -f logs/access.log             # 접속 로그 실시간
```

---

## 요약

| 로그 | 로테이션 도구 | 비고 |
|------|---------------|------|
| `pm2-out.log`, `pm2-error.log` | pm2-logrotate | `pm2 install pm2-logrotate` |
| `access.log` | OS logrotate | `/etc/logrotate.d/dev-mall`, **`copytruncate` 필수** |
