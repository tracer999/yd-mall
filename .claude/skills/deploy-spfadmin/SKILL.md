---
name: deploy-spfadmin
description: >-
  spf-admin(Shopify 자체 관리자, Spring Boot 4 / Java 21)을 상용 서버 office.ydata.co.kr에 배포하는 스킬.
  SSH 접속 → /data/shopify-test git pull → spf-admin mvn 빌드 →
  PM2(spf-admin, 싱글/fork) 재시작/기동 → 기동 검증까지 자동 수행한다.
  사용 시점: (1) /deploy-spfadmin 명령 실행 시, (2) spf-admin 코드를 푸시한 뒤 상용에 반영할 때,
  (3) 상용 spf-admin 재기동이 필요할 때.
---

# deploy-spfadmin — spf-admin 상용 배포

Shopify 자체 관리자 `spf-admin`(Spring Boot 4 / Java 21)을 상용 서버에 배포/재기동한다.
**이 스킬은 `spf-admin`만 다룬다** — 같은 서버에서 돌고 있는 다른 PM2 앱
(`dev-mall`, `spf-mall`, `KTL_admin`, `KTL_admin_batch`, `n8n` 등)은 **절대 건드리지 않는다**.

## 배포 대상 환경

| 항목 | 값 |
|------|-----|
| SSH 호스트 | `office.ydata.co.kr` |
| 계정 | `ydatasvc` |
| 비밀번호 | `NEWtec4075@@` (비공개 저장소 정책상 기재) |
| 프로젝트 경로 | `/data/shopify-test` (모노레포 루트, git 추적) |
| 앱 경로 | `/data/shopify-test/spf-admin` |
| 빌드 산출물 | `/data/shopify-test/spf-admin/target/spf-admin-0.1.0.jar` |
| Java | `/usr/lib/jvm/java-21-openjdk-amd64` (OpenJDK 21) |
| PM2 앱 이름 | `spf-admin` (fork/**싱글 인스턴스**, cluster·`-i` 금지) |
| 포트 | `8080` |
| 외부 도메인 | `https://spf-admin.ydata.co.kr` (Nginx가 SSL 종단 후 8080으로 프록시) |
| 애플리케이션 로그 | `/data/shopify-test/spf-admin/logs/spring.log` (50MB 롤링, 30일 보관) |
| PM2 로그 | `/home/ydatasvc/.pm2/logs/spf-admin-out.log` |

> 로컬에 `sshpass`가 필요하다(`apt install sshpass` / `brew install sshpass`).
> 비밀번호는 `SSHPASS` 환경변수로 전달한다.

## 사전 점검 (권장)

1. 로컬 `git status`가 깨끗하고 `origin/main`과 동기화돼 있어야 서버 `git pull`이 최신을 받는다.
   미푸시 커밋이 있으면 먼저 `git push origin main`.
2. `application-prod.yml`에 Shopify 자격증명(`client-id`, `client-secret`)이 올바르게 설정돼 있는지 확인한다.
   이 파일은 비공개 저장소 정책상 git으로 추적되므로 git pull로 함께 갱신된다.

## 배포 절차 (한 번에 실행)

아래 명령을 그대로 실행한다. `pull → mvn 빌드 → pm2 재시작/기동 → save`를 수행하며,
`spf-admin`이 이미 PM2에 있으면 `restart`, 없으면 `start` 한다.

```bash
export SSHPASS='NEWtec4075@@'
sshpass -e ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 ydatasvc@office.ydata.co.kr '
set -e
cd /data/shopify-test
echo "=== git pull ==="
git pull --ff-only origin main 2>&1 | tail -5
echo "=== Java 버전 ==="
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
$JAVA_HOME/bin/java -version 2>&1
echo "=== Maven 빌드 (테스트 제외) ==="
cd spf-admin
JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 mvn -q -DskipTests package 2>&1 | tail -5
echo "=== PM2 재시작 또는 기동 (spf-admin, 싱글/fork) ==="
if pm2 describe spf-admin >/dev/null 2>&1; then
  pm2 restart spf-admin 2>&1 | tail -3
else
  pm2 start \
    "java -jar /data/shopify-test/spf-admin/target/spf-admin-0.1.0.jar --spring.profiles.active=prod" \
    --name spf-admin 2>&1 | tail -3
fi
pm2 save 2>&1 | tail -2
'
```

> ⚠️ `--ff-only`로 pull 한다. 충돌/비-fast-forward면 멈추고 서버 git 상태를 사람에게 보고한다
> (임의로 reset/merge 하지 말 것).
>
> ⚠️ Maven 빌드는 첫 실행 시 의존성을 다운로드하므로 수 분이 걸릴 수 있다.
> 이후에는 로컬 캐시(`~/.m2`)를 재사용해 빠르게 완료된다.
>
> ⚠️ Spring Boot 기동에는 약 7~10초가 소요된다. 기동 검증은 포트가 열린 뒤 실행한다.

## 기동 검증 (배포 후 반드시 실행)

```bash
export SSHPASS='NEWtec4075@@'
sshpass -e ssh -o StrictHostKeyChecking=accept-new ydatasvc@office.ydata.co.kr '
echo "=== PM2 상태 ==="
pm2 describe spf-admin 2>/dev/null | grep -E "status|exec mode|restarts|script"
echo "=== 기동 로그 (PM2) ==="
pm2 logs spf-admin --lines 15 --nostream 2>&1 | tail -18
echo "=== 애플리케이션 로그 마지막 5줄 ==="
tail -5 /data/shopify-test/spf-admin/logs/spring.log 2>/dev/null || echo "(spring.log 없음)"
echo "=== 포트 8080 LISTEN ==="
(ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null) | grep ":8080" || echo "8080 LISTEN 안됨!"
echo "=== HTTP 응답 ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" -H "Host: spf-admin.ydata.co.kr" http://127.0.0.1:8080/
'
```

정상 기준:
- PM2 `status: online`, `exec mode: fork_mode`, `restarts`가 비정상적으로 늘지 않음
- PM2 로그 또는 spring.log 에 `Started SpfAdminApplication in X.XXX seconds`
- `8080 LISTEN` 확인
- HTTP `302` (미로그인 → `/login` 리다이렉트, 정상) 또는 직접 `/login`으로 `200`

## 흔한 문제

- **Java 21 미설치**: `java -version`이 21이 아니면 빌드 실패. `sudo apt install openjdk-21-jdk` 후 재시도.
- **Maven 미설치**: `mvn: command not found` → `sudo apt install maven`.
- **빌드 실패 (컴파일 오류)**: 소스 코드 오류. PM2 재시작 없이 멈추고 에러 메시지를 보고한다.
- **8080 포트 이미 사용 중**: `ss -ltnp | grep 8080`으로 점유 프로세스 확인. spf-admin 이중 기동이면 `pm2 restart spf-admin`.
- **DB 연결 실패**: `spring.log`에 `HikariPool ... exception` 확인. `application-prod.yml`의 DB 접속 정보 점검.
- **Shopify 토큰 발급 실패**: `spring.log`에 `ShopifyTokenManager` 오류. `application-prod.yml`의 `client-id`/`client-secret` 점검.
- **pull 충돌**: `git stash`로 임시 보존 후 pull. 의미 있는 로컬 수정이 보이면 **멈추고 사람에게 보고** (임의 reset 금지).
- **절대 금지**: `pm2 kill`, `pm2 delete all`, cluster 모드(`-i`)로 기동, 다른 앱 restart/delete.

## 비고

- Nginx(192.168.1.2)가 `spf-admin.ydata.co.kr` SSL 종단 후 `192.168.1.4:8080`으로 프록시한다.
  Nginx 설정 파일: `/etc/nginx/sites-enabled/spf-admin.ydata.co.kr.conf` (Nginx 서버에서 수정).
- Spring Boot가 `X-Forwarded-Proto: https`를 인식하도록 `server.forward-headers-strategy: NATIVE` 설정 적용 중.
  CSRF 토큰은 `CookieCsrfTokenRepository` 방식으로 동작 (Nginx 프록시 환경 대응).
- 로그인 계정: `yd_mall.admins` 테이블의 `tracer999` (비밀번호 `NEWtec4075@@`, 2FA 미사용).
- 부팅 시 자동 기동: `pm2 save` 후 `pm2 startup`으로 systemd 연동 (1회 설정).
- 롤백: 서버에서 직전 커밋으로 `git reset --hard <이전커밋>` 후 재빌드/restart (신중히, 사람 확인 후).
