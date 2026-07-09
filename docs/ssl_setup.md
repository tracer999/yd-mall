# SSL / 도메인 설정

## 현재 배포 구성

- **도메인**: `dev-mall.ydata.co.kr`
- **SSL 종단**: 외부 프록시 서버에서 처리 (앱 레벨 SSL 불필요)
- **앱 바인딩**: `0.0.0.0:3006` (HTTP)
- **프록시 → 앱**: `https://dev-mall.ydata.co.kr` → `http://192.168.1.4:3006`

앱 자체는 HTTP로만 응답하며, HTTPS 처리는 프록시 서버가 전담합니다.

## 앱 설정 요점

- `FORCE_HTTPS` 미사용 (제거됨) — 프록시가 이미 HTTPS 처리
- Canonical 도메인 리다이렉트 미사용 (제거됨)
- `trust proxy: 1` 설정으로 `X-Forwarded-For`, `X-Forwarded-Proto` 헤더 신뢰
- `system_settings.domain` = `https://dev-mall.ydata.co.kr` (SEO canonical/OG용)

## PM2 실행

```bash
cd /data/shopify-test/dev-mall
pm2 start ecosystem.config.cjs   # 앱명: dev-mall, fork 모드
pm2 logs dev-mall
pm2 restart dev-mall
pm2 stop dev-mall
```

## 크롤링 차단 (테스트 서버)

테스트 서버이므로 검색엔진 크롤링을 전면 차단합니다.

- `public/robots.txt`: `Disallow: /`
- `middleware/seoDefaults.js`: 모든 페이지 `noindex,nofollow`
- `app.js`: 모든 응답에 `X-Robots-Tag: noindex, nofollow` 헤더

운영 서버로 전환 시 세 곳을 모두 되돌려야 합니다.
