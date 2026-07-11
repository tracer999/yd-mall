# 사이트 설정 (Settings)

## 1. 개요

설정 화면은 **4개 URL**로 분화되어 있습니다. 이 중 앞 3개는 **하나의 뷰(`views/admin/settings/form.ejs`)와 하나의 컨트롤러(`controllers/admin/settingsController.js`)** 를 공유하며, 진입 URL에 따라 탭 노출 여부와 폼 하나만 골라 렌더합니다.

| URL | 성격 | 렌더되는 폼 | 컨트롤러 액션 |
|-----|------|-------------|---------------|
| `/admin/settings` | 탭 2개(기본 정보 / 시스템 설정) | `?tab` 에 따라 하나 | `getSettings` |
| `/admin/site-settings` | 탭 없음, 기본 정보 전용 | 회사 정보 폼 | `getSiteSettings` |
| `/admin/sys-settings` | 탭 없음, 시스템 설정 전용 | 시스템 설정 폼 | `getSysSettings` |
| `/admin/theme-settings` | 별도 화면 | 테마 토큰 폼 | `themeSettingsController` |

- **라우트:** `routes/admin/settings.js`, `routes/admin/siteSettings.js`, `routes/admin/sysSettings.js`, `routes/admin/theme-settings.js` (모두 `routes/admin.js` 에서 `requireMenuAccess` 뒤에 마운트)
- **관련 테이블:** `site_settings` (몰별 1행), `system_settings` (전역 key-value), `theme` (몰별 활성 테마)
- **뷰:** `views/admin/settings/form.ejs`, `views/admin/theme-settings/edit.ejs`
- **업로드:** Multer `upload.fields([logo, kakao_share_image, favicon])` — 필드명별 저장 경로는 `middleware/upload.js:36-56`

약관/개인정보처리방침 본문은 **약관 및 정책 관리**([`policies.md`](./policies.md), `/admin/policies`)에서 버전별로 관리합니다.

### 1.1 편집 대상 몰 (multi-mall)

`routes/admin.js:16` 이 `middleware/adminMallContext.js` 를 마운트해 **`req.adminMallId`** 를 주입합니다. `site_settings`·`theme` 는 이 값으로 스코프됩니다(`settingsController.js:52`, `themeSettingsController.js:41`). `system_settings` 는 **전역**이라 몰별로 나누지 않습니다(`settingsController.js:58-59`).

---

## 2. 설정의 두 층 (.env vs system_settings)

| 층 | 담는 값 | 로딩 |
|----|---------|------|
| `.env` / `.env.{NODE_ENV}` | 서버·DB·Redis 접속 정보 (`PORT`, `DB_*`, `REDIS_*`, `MAX_UPLOAD_FILE_MB`, `FORCE_HTTPS`) | `config/env.js` |
| DB `system_settings` | 그 외 전부 (API 키·OAuth·SMTP·결제) | `config/systemSettings.js` 의 `loadSystemSettingsAndApplyEnv()` |

`loadSystemSettingsAndApplyEnv()` 는 앱 기동 시(그리고 시스템 설정 저장 직후) 다음을 수행합니다.

1. `SELECT setting_key, setting_value FROM system_settings` 전체 조회 → `global.systemSettings` 에 객체로 저장 (`systemSettings.js:5-11`)
2. `envMap` 에 등록된 키만 **`process.env` 를 덮어쓴다** (`systemSettings.js:50-54`)
3. 단, 값이 `null` 이거나 빈 문자열이면 **건너뛴다** → 이 경우에만 `.env` 값이 살아남는다

> 즉 `system_settings` 에 값이 있으면 `.env` 값과 코드의 `process.env.X || '기본값'` 폴백은 **쓰이지 않습니다.** DB 가 이깁니다.

### 2.1 세 개의 키 목록은 서로 다르다

| 목록 | 정의 위치 | 개수 |
|------|-----------|------|
| **폼에서 편집 가능** | `settingsController.js:260-287` (`updateSystemSettings` 의 `entries`) | 26 (아래 4.1) |
| **process.env 로 주입** | `systemSettings.js:13-48` (`envMap`) | 31 |
| **DB 에 실재** | `system_settings` 테이블 | 35 |

**세 목록은 포함관계가 아닙니다.** 교집합이 아닌 부분이 함정입니다.

- **폼에는 있으나 `process.env` 로 주입되지 않는 것** — `domain`, `point_accumulate_rate`, `point_min_use` (3개). `envMap` 에 없으므로 소비처는 `global.systemSettings.X` 를 직접 읽어야 합니다.
- **`process.env` 로 주입되지만 폼에 없는 것** — `session_secret` + Shopify 7종(`shopify_store_domain`, `shopify_client_id`, `shopify_client_secret`, `shopify_storefront_api_token`, `shopify_api_version`, `shopify_location_id`, `shopify_webhook_base_url`) (8개). 값을 바꾸려면 DB 를 직접 고쳐야 합니다. Shopify 키 중 폼에 있는 것은 `shopify_sync_enabled` 하나뿐입니다.
- **DB 에만 있는 것** — `coupon_restore_on_cancel`. `envMap` 에도 폼에도 없어 `global.systemSettings` 로만 읽힙니다.

---

## 3. 회사 정보 (site_settings)

- **GET:** `/admin/settings?tab=company` · `/admin/site-settings`
- **POST:** `/admin/settings` · `/admin/site-settings` → 둘 다 `settingsController.updateSettings`
- **enctype:** `multipart/form-data`
- **조회:** `SELECT * FROM site_settings WHERE mall_id = ?` — 행이 없으면 기본몰(`mall_id = 1`) 행을 폴백으로 보여줌 (`settingsController.js:52-55`)
- **저장:** `INSERT ... ON DUPLICATE KEY UPDATE` (`mall_id` 가 UNIQUE) — 새 몰이면 행을 만들고, 있으면 갱신 (`settingsController.js:205-249`)
- **리다이렉트:** `req.baseUrl` 기준. `/admin/settings` 면 `?tab=company` 를 붙이고, `/admin/site-settings` 면 그대로 (`settingsController.js:250-252`)

### 3.1 폼 필드 (회사 정보)

| name | 타입 | 설명 |
|------|------|------|
| company_name | text | 회사명 (required) |
| business_number | text | 사업자 등록번호 |
| address | text | 주소 |
| contact_email | email | 대표 이메일 |
| contact_phone | text | 대표 전화번호 |
| header_slogan | text | 헤더 슬로건 |
| slogan | textarea | 푸터 슬로건 |
| company_intro | textarea | 회사 소개 페이지 내용 |
| instagram_enabled / instagram_url | checkbox / text | 인스타그램 |
| facebook_enabled / facebook_url | checkbox / text | 페이스북 |
| youtube_enabled / youtube_url | checkbox / text | 유튜브 |
| kakao_channel_enabled / kakao_channel_url | checkbox / text | 카카오톡 채널 |
| ga4_measurement_id | text | GA4 측정 ID (대문자로 정규화, 빈 값이면 NULL) |
| brand_main_color | text | 브랜드 메인 색상 (HEX) |
| brand_dark_color | text | 브랜드 다크 색상 (HEX) |
| brand_light_color | text | 브랜드 라이트 색상 (HEX) |
| logo | file | 로고 이미지 → `public/uploads/logo/` |
| kakao_share_image | file | 카카오/OG 공유 이미지 → `public/uploads/og/` |
| favicon | file | 파비콘 원본 이미지 → `.ico` 로 변환 (3.3 참고) |
| existing_logo_url / existing_kakao_share_image_url / existing_favicon_url | hidden | 새로 올리지 않았을 때 유지할 기존 URL |

### 3.2 브랜드 색상 정규화

`buildBrandPalette()` (`settingsController.js:12-48`):

- `#RRGGBB` 6자리 HEX 만 허용, `#` 누락 시 자동 보정, 대문자로 저장
- 형식이 어긋나면 조용히 폴백: main → `#76A764`, dark/light → main 색을 각각 `-20%` / `+30%` 조정한 값으로 자동 생성
- 즉 **저장이 거부되지 않고 대체값이 들어갑니다.** (theme 토큰과 반대. 5장 참고)

### 3.3 파비콘 변환 (services/faviconService.js)

- 업로드된 이미지를 sharp 로 16/32/48px PNG 로 리사이즈 → `png-to-ico` 로 합쳐 `.ico` 생성 → `public/uploads/favicon/{timestamp}.ico`
- 중간 PNG 는 항상 삭제 (`finally` 블록)
- 변환 실패 시 예외를 삼키고 **업로드된 원본 파일 경로를 그대로** `favicon_url` 에 저장 (`settingsController.js:196-199`)
- `png-to-ico` v3+ 는 ESM 전용이라 CommonJS 에서 동적 `import()` 로 지연 로딩합니다

---

## 4. 시스템 설정 (system_settings)

- **GET:** `/admin/settings?tab=system` · `/admin/sys-settings`
- **POST:** `/admin/settings/system` · `/admin/sys-settings/system` → 둘 다 `settingsController.updateSystemSettings`
- **처리:** 트랜잭션 안에서 항목마다 `INSERT INTO system_settings (setting_key, setting_value, description) ... ON DUPLICATE KEY UPDATE`
  - `typeof value === 'undefined'` 인 항목은 **건너뜁니다** (`settingsController.js:302`) — 폼에 없는 필드는 지워지지 않음
  - `description` 도 코드에 하드코딩된 값으로 매번 덮어씁니다
- **커밋 후:** `loadSystemSettingsAndApplyEnv()` 를 호출해 현재 프로세스의 `global.systemSettings` · `process.env` 에 즉시 반영 (`settingsController.js:309`)
- **실패 시:** rollback → 500
- **리다이렉트:** `req.baseUrl` 기준 (`/admin/settings` 면 `?tab=system`)

### 4.1 폼에서 편집하는 항목 (26개)

| setting_key | 설명 |
|-------------|------|
| domain | Canonical/OG/JSON-LD 용 기본 도메인 |
| tinymce_key | TinyMCE API Key |
| shopify_sync_enabled | Shopify 동기화 사용 여부 (1/0) |
| openai_api_key | OpenAI API Key |
| openai_timeout_ms | OpenAI 요청 타임아웃(ms) |
| openai_model | 기본 OpenAI 모델 |
| google_client_id | Google OAuth Client ID |
| google_client_secret | Google OAuth Client Secret |
| google_callback_url_dev | Google Dev Callback URL |
| google_callback_url_prod | Google Prod Callback URL |
| google_callback_url | Google 공통 Callback URL (→ `process.env.CALLBACK_URL`) |
| kakao_client_id | Kakao OAuth Client ID |
| kakao_client_secret | Kakao OAuth Client Secret |
| kakao_callback_url_dev | Kakao Dev Callback URL |
| kakao_callback_url_prod | Kakao Prod Callback URL |
| kakao_js_key | Kakao JavaScript Key (카카오톡 공유용) |
| smtp_host | SMTP 서버 주소 |
| smtp_port | SMTP 포트 |
| smtp_is_gmail | 지메일 사용 여부 (1/0) |
| smtp_app_password | 지메일 앱 비밀번호 |
| smtp_password | SMTP 비밀번호 (지메일이 아닐 때) |
| smtp_sender_email | 발송자 이메일 주소 |
| tosspayments_client_key | 토스페이먼츠 클라이언트 키 (결제창) |
| tosspayments_secret_key | 토스페이먼츠 시크릿 키 (서버 승인) |
| point_accumulate_rate | 구매 적립률 (%) |
| point_min_use | 포인트 최소 사용 단위 (원) |

> `domain` 은 `envMap` 에 없어 `process.env` 로는 주입되지 않습니다. 소비처가 `global.systemSettings.domain` 을 읽습니다.

### 4.2 테스트 메일 발송 (POST /admin/settings/send-test-email)

- **라우트:** `routes/admin/settings.js:20`, `routes/admin/sysSettings.js:8`
- **핸들러:** `settingsController.sendTestEmail`
- **Body:** `test_email_to` (수신자 이메일) — 시스템 설정 폼의 버튼이 `fetch` 로 `application/x-www-form-urlencoded` POST (`views/admin/settings/form.ejs:842`)
- **동작:** 저장된 SMTP 설정으로 `services/emailService.sendEmail()` 호출 → **JSON 응답** (`{ success, message }` 또는 `{ success: false, error }`)
- **검증:** 수신자 미입력 시 400

---

## 5. 테마 설정 (/admin/theme-settings)

- **라우트:** `routes/admin/theme-settings.js`
- **컨트롤러:** `controllers/admin/themeSettingsController.js`
- **서비스:** `services/theme/themeService.js`
- **뷰:** `views/admin/theme-settings/edit.ejs`
- **테이블:** `theme` (`mall_id`, `name`, `config_json` JSON, `is_active`)

`theme.config_json` 의 스타일 토큰을 편집합니다. **이 값들은 `main_layout` 의 `<head>` 에서 CSS 커스텀 프로퍼티로 직접 삽입**되므로, 관리자 입력이라도 `}` 를 섞으면 스타일시트를 탈출하는 **CSS 인젝션**이 가능합니다. 따라서 **서버 측 화이트리스트 검증이 필수**입니다.

### 5.1 토큰과 검증 규칙 (themeService.js:17-45)

| 키 | CSS 변수 | 기본값 | 검증 |
|----|----------|--------|------|
| fontFamily | `--yd-font-family` | `'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif` | `/^[\w\s'",\-.]+$/` + 200자 이내 |
| buttonRadius | `--yd-radius-button` | `0.5rem` | `isLength` |
| cardRadius | `--yd-radius-card` | `0.5rem` | `isLength` |
| pillRadius | `--yd-radius-pill` | `9999px` | `isLength` |
| inputRadius | `--yd-radius-input` | `0.375rem` | `isLength` |
| sectionSpacing | `--yd-section-spacing` | `3rem` | `isLength` |
| containerWidth | `--yd-container-width` | `72rem` | `isLength` |
| productCardStyle | (CSS 변수 아님) | `shadow` | 열거형 `shadow` / `border` / `flat` |

`isLength` = `/^(0|\d{1,5}(\.\d{1,3})?(px|rem|em|%|vw))$/` — `0`, `12px`, `0.5rem`, `9999px`, `50%` 만 통과합니다.

### 5.2 저장 시 검증과 렌더 시 검증의 비대칭 (의도된 설계)

**같은 규칙(`themeService.TOKENS`)을 양쪽이 재사용**하되 실패 처리가 다릅니다.

- **저장(`postUpdate`)**: 규칙 위반 시 **거부**하고 사유를 모아 `?errors=...` 로 리다이렉트 (`themeSettingsController.js:102-118`)
- **렌더(`themeService.getActiveTheme`)**: 규칙 위반 시 **조용히 기본값으로 폴백** (`themeService.js:76-87`)

값을 비우고 저장하면 해당 토큰은 `DEFAULTS` 로 되돌아갑니다. UI 밖의 키는 read-modify-write 로 보존합니다(`themeSettingsController.js:92`).

### 5.3 그 외 동작

- **조회 화면:** 저장된 **원본 값**(`raw`)과 **실제 적용 중인 값**(`active`)을 함께 보여줍니다 — 운영자가 자기가 넣은 이상값을 식별할 수 있도록 (`themeSettingsController.js:60-63`)
- **몰에 활성 테마가 없으면** `INSERT INTO theme (mall_id, name, config_json, is_active) VALUES (?, '기본 테마', JSON_OBJECT(), 1)` 로 자동 생성 (`themeSettingsController.js:46-48`)
- **저장 후:** `middleware/themeData.invalidate()` 로 60초 메모리 캐시를 비워 스토어프론트에 즉시 반영. PM2 가 fork·`instances: 1` 이라 유효하며, cluster 로 늘리면 다른 워커 캐시는 최대 60초 뒤 만료됩니다.

---

## 6. site_settings 테이블

| 컬럼 | 설명 |
|------|------|
| id | PK |
| mall_id | 몰 ID (**UNIQUE** — 몰당 1행, 기본 1) |
| company_name, logo_url, favicon_url | 회사명·로고·파비콘 |
| business_number, address, contact_email, contact_phone | 사업자 정보 |
| header_slogan, hero_variant, slogan, company_intro | 슬로건·히어로 변형·회사 소개 |
| instagram_enabled / instagram_url | 인스타그램 |
| facebook_enabled / facebook_url | 페이스북 |
| youtube_enabled / youtube_url | 유튜브 |
| kakao_channel_enabled / kakao_channel_url / kakao_share_image_url | 카카오 채널·공유 이미지 |
| brand_main_color, brand_dark_color, brand_light_color | 브랜드 색상 (기본 `#76A764` / `#5A824B` / `#F0F7EE`) |
| ga4_measurement_id | GA4 측정 ID |
| terms_of_service, privacy_policy | 활성 약관 본문 사본 ([`policies.md`](./policies.md) 가 동기화) |
| updated_at | 수정일시 |

> `hero_variant` 는 이 화면의 폼에 없습니다(다른 경로에서 갱신).
> `terms_of_service` / `privacy_policy` 는 `policyController` 가 **항상 `WHERE id = 1`** 로 갱신합니다. `mall_id` 가 아니라 PK 기준이라, 몰이 늘면 어긋납니다.

---

*Last Updated: 2026-07-11*
