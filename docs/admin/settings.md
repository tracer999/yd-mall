# 사이트 설정 (Settings)

## 1. 개요

- **URL:** `GET /admin/settings`, `POST /admin/settings`, `POST /admin/settings/system`  
- **탭 구조:** `?tab=company` (기본 정보), `?tab=system` (시스템 설정)  
- **관련 테이블:** `site_settings` (id=1 고정), `system_settings`  
- **컨트롤러:** `controllers/admin/settingsController.js`  
- **뷰:** `views/admin/settings/form.ejs`  
- **로고 업로드:** Multer 필드명 `logo`, 저장 경로 `public/uploads/logo/`

회사 정보(회사명, 로고, 연락처, SNS 링크 등)와 시스템 설정(TinyMCE, OpenAI, OAuth)을 관리합니다. 약관/개인정보처리방침 본문은 **약관 및 정책 관리**(`/admin/policies`)에서 버전별로 관리합니다.

---

## 2. 설정 조회 (GET /admin/settings)

- **쿼리 파라미터:** `tab` — `company` (기본) 또는 `system`  
- **쿼리:**  
  - `site_settings` id=1  
  - `system_settings` 전체 (setting_key, setting_value) → 객체로 변환  
- **뷰 전달:** `settings`, `systemSettings`, `activeTab`, `title: '환경 설정'`

---

## 3. 회사 정보 저장 (POST /admin/settings)

- **enctype:** `multipart/form-data`, `upload.single('logo')`  
- **요청 파라미터 (body):**  
  - company_name, business_number, address, contact_email, contact_phone  
  - header_slogan, slogan, company_intro  
  - instagram_enabled, instagram_url, facebook_enabled, facebook_url, youtube_enabled, youtube_url  
  - existing_logo_url (기존 로고 유지 시)  
- **로고:** 새 파일 업로드 시 `logo_url = '/uploads/logo/' + filename`, 없으면 기존값 유지  
- **UPDATE:** site_settings id=1  
- **성공 시:** `res.redirect('/admin/settings?tab=company')`

### 3.1 폼 필드 (회사 정보 탭)

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
| instagram_enabled | checkbox | 인스타그램 사용 여부 |
| instagram_url | text | 인스타그램 URL |
| facebook_enabled | checkbox | 페이스북 사용 여부 |
| facebook_url | text | 페이스북 URL |
| youtube_enabled | checkbox | 유튜브 사용 여부 |
| youtube_url | text | 유튜브 URL |
| logo | file | 로고 이미지 (권장: 800x280) |
| existing_logo_url | hidden | 기존 로고 유지 시 |

---

## 4. 시스템 설정 저장 (POST /admin/settings/system)

- **요청 파라미터 (body):** system_settings 항목들  
- **처리:** `INSERT ... ON DUPLICATE KEY UPDATE` 로 각 항목 저장  
- **저장 후:** `loadSystemSettingsAndApplyEnv()` 호출 → DB 값을 `global.systemSettings` 및 `process.env`에 반영  
- **성공 시:** `res.redirect('/admin/settings?tab=system')`

### 4.1 system_settings 항목

| setting_key | 설명 |
|-------------|------|
| domain | 사이트 기본 도메인 (Canonical/OG/JSON-LD용) |
| tinymce_key | TinyMCE API Key |
| openai_api_key | OpenAI API Key |
| openai_timeout_ms | OpenAI 요청 타임아웃(ms) |
| openai_model | 기본 OpenAI 모델 |
| google_client_id | Google OAuth Client ID |
| google_client_secret | Google OAuth Client Secret |
| google_callback_url_dev | Google Dev Callback URL |
| google_callback_url_prod | Google Prod Callback URL |
| google_callback_url | Google 공통 Callback URL |
| kakao_client_id | Kakao OAuth Client ID |
| kakao_client_secret | Kakao OAuth Client Secret |
| kakao_callback_url_dev | Kakao Dev Callback URL |
| kakao_callback_url_prod | Kakao Prod Callback URL |
| kakao_js_key | Kakao JavaScript Key (카카오톡 공유용) |

### 4.2 config/systemSettings.js 연동

- `loadSystemSettingsAndApplyEnv()`: DB의 system_settings를 조회해 `global.systemSettings`와 `process.env` (TINYMCE_KEY, OPENAI_API_KEY 등)에 매핑  
- 시스템 설정 저장 시 호출하여 즉시 반영

---

## 5. site_settings 테이블 (참고)

| 컬럼 | 설명 |
|------|------|
| id | 1 고정 |
| company_name | 회사명 |
| logo_url | 로고 URL |
| business_number | 사업자번호 |
| address | 주소 |
| contact_email | 대표 이메일 |
| contact_phone | 대표 전화번호 |
| header_slogan, slogan, company_intro | 슬로건·회사 소개 |
| instagram_enabled, instagram_url | 인스타그램 설정 |
| facebook_enabled, facebook_url | 페이스북 설정 |
| youtube_enabled, youtube_url | 유튜브 설정 |
| terms_of_service, privacy_policy | 약관 (policy_versions와 동기화) |
| updated_at | 수정일시 |

---

*Last Updated: 2026-02-07*
