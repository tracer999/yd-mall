# SSL / 도메인 / 배포 구성

## 1. 현재 구성

| 항목 | 값 |
|------|-----|
| 도메인 | `https://dev-mall.ydata.co.kr` |
| SSL 종단 | **Nginx 서버(192.168.1.2)** 가 전담 — 앱 레벨 SSL 불필요 |
| 애플리케이션 서버 | 192.168.1.4, 프로젝트 경로 `/data/yd-mall` |
| 앱 바인딩 | `0.0.0.0:3006` (HTTP, 개발·상용 동일 포트) |
| 프록시 경로 | `https://dev-mall.ydata.co.kr` → `http://192.168.1.4:3006` |

앱 자체는 HTTP 로만 응답하며, HTTPS 처리는 Nginx 가 전담합니다.

## 2. Nginx (192.168.1.2)

```bash
# 외부에서 접속
ssh tracer999@ydata.co.kr -p 10022
# 내부(상용 장비 192.168.1.4)에서
ssh tracer999@192.168.1.2
```

- 설정 파일: `/etc/nginx/sites-enabled/dev-mall.ydata.co.kr.conf`
- SSL 인증서: 와일드카드 `/data/ssl_cert/ydata.co.kr_2026/_wildcard_.ydata.co.kr_2026.all.crt.pem`
- 전달 헤더: `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`, `Upgrade`, `Connection`
- 업로드 한도: `client_max_body_size 100M`

## 3. 앱 설정 요점

- `app.set('trust proxy', 1)` — `X-Forwarded-For`, `X-Forwarded-Proto` 헤더를 신뢰합니다. (접속 로그 IP, 세션 쿠키 `secure` 판정에 필요)
- Canonical 도메인 리다이렉트 미사용 — 프록시가 이미 HTTPS 처리
- `system_settings.domain` = `https://dev-mall.ydata.co.kr` (SEO canonical / OG 태그용)
- `FORCE_HTTPS` 는 `.env.production` 에 `true` 로 남아 있으나 **코드 어디서도 읽지 않는 데드 변수**입니다(HTTPS 강제 리다이렉트 로직이 제거됨). 프록시가 이미 HTTPS 를 종단하므로 필요 없습니다.

## 4. 배포

**`git push origin main` = 즉시 운영 배포입니다.**

`.github/workflows/deploy.yml` (GitHub Actions) 이 SSH 로 앱 서버에 접속해 다음을 실행합니다.

```bash
cd /data/yd-mall
git fetch origin main && git reset --hard origin/main
./dev-mall.sh build      # npm install + Tailwind CSS 빌드
./dev-mall.sh start      # PM2 기동/갱신 (앱명: dev-mall, fork 모드, instances: 1)
```

서버에서 수동으로 조작할 때:

```bash
cd /data/yd-mall
./dev-mall.sh status
./dev-mall.sh logs
./dev-mall.sh restart
./dev-mall.sh stop
```

자세한 실행 옵션은 [`실행가이드.md`](./실행가이드.md) 를 참고하세요.

## 5. 크롤링 차단 (테스트 서버)

테스트 서버이므로 검색엔진 크롤링을 전면 차단하고 있습니다.

- `public/robots.txt`: `Disallow: /`
- `middleware/seoDefaults.js`: 모든 페이지 `noindex,nofollow`
- `app.js`: 모든 응답에 `X-Robots-Tag: noindex, nofollow` 헤더

**운영(공개) 서버로 전환할 때는 위 세 곳을 모두 되돌려야 합니다.**
