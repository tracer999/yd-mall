---
name: add-entity
description: |
  새 콘텐츠 엔티티(travel_spot, restaurant, shopping 등)를 kotourlive 플랫폼에 추가하는 스캐폴딩 스킬.
  기존 엔티티 패턴(festival, concert, news, travel-guide)을 분석하여 DDL, service, controller, routes, views, locale, 번역 워커를 일괄 생성한다.
  사용 시점: (1) /add-entity 명령 실행 시, (2) 새 콘텐츠 타입을 추가할 때.
triggers:
  - add-entity
  - 엔티티 추가
  - 새 콘텐츠 타입
  - new entity
---

# 콘텐츠 엔티티 스캐폴딩

새 콘텐츠 엔티티를 추가할 때 기존 패턴을 따라 전체 파일셋을 생성한다.

## 사전 확인

1. 사용자에게 **엔티티 영문명** (예: `travel_spot`, `restaurant`)을 확인
2. **Admin만 / User만 / 양쪽 모두** 중 어디에 추가할지 확인
3. 필요한 테이블 종류 확인 (기본: contents, translations, seo, slug_i18n, likes, bookmarks, reviews, translation_jobs)

## 생성 순서

### Step 1: DDL 생성 (schema.sql + DB 적용)

기존 패턴 참조: `schema.sql`에서 `tb_festival_*` 또는 `tb_concert_*` 테이블 구조를 복사하여 새 엔티티명으로 변환.

기본 테이블셋:
```sql
tb_{entity}_contents          -- 언어 공통 데이터
tb_{entity}_translations      -- 다국어 번역
tb_{entity}_seo               -- SEO 메타데이터
tb_{entity}_slug_i18n         -- 언어별 URL 슬러그
tb_{entity}_likes             -- 좋아요
tb_{entity}_bookmarks         -- 찜/관심목록
tb_{entity}_reviews           -- 사용자 리뷰
tb_{entity}_translation_jobs  -- 번역 작업 큐
```

선택 테이블 (필요 시):
```sql
tb_{entity}_images            -- 이미지 (축제/콘서트 패턴)
tb_{entity}_links             -- 관련 링크
tb_{entity}_tag_map           -- 태그 매핑
tb_{entity}_comments          -- 댓글 (travel-guide/notice 패턴)
```

**중요**: `/alter-table` 스킬을 사용하여 개발 DB + 상용 DB + schema.sql 세 곳 동시 적용.

### Step 2: Admin 파일 생성

기존 패턴 참조 파일:
- Controller: `admin/controllers/admin_festival_controller.js`
- Service: `admin/services/admin_festival_service.js`
- Routes: `admin/routes/festival.js`
- Views: `admin/views/admin-pages/festivals/`

생성할 파일:
```
admin/
├── controllers/admin_{entity}_controller.js
├── services/admin_{entity}_service.js
├── routes/{entity}.js
└── views/admin-pages/{entity}s/
    ├── list.ejs
    └── detail.ejs
```

등록:
- `admin/config/routes.js`에 라우트 마운트 추가
- `admin/views/partials/sidebar.ejs`에 메뉴 항목 추가

### Step 3: User 파일 생성

기존 패턴 참조 파일:
- Controller: `user/controllers/festival_controller.js`
- Service: `user/services/festival_service.js`
- Routes: `user/routes/festival.js`
- Views: `user/views/pages/festivals/`

생성할 파일:
```
user/
├── controllers/{entity}_controller.js
├── services/{entity}_service.js
├── routes/{entity}.js
└── views/pages/{entity}/
    ├── {entity}_main.ejs
    ├── {entity}_all.ejs
    └── {entity}_detail.ejs
```

등록:
- `user/config/routes.js`에 `/:lang/` 하위 라우트 마운트 추가
- `user/views/partials/nav.ejs`에 네비게이션 항목 추가

### Step 4: Locale 키 추가 및 i18n·DB ENUM 등록

#### 4-1. 언어 파일에 엔티티 키 추가

9개 언어 파일(`user/locales/*.json`)에 새 엔티티 관련 키 추가:
```json
{
  "{entity}": {
    "title": "...",
    "description": "...",
    "list_title": "...",
    "detail_title": "...",
    "no_results": "..."
  }
}
```

**`/sync-locales` 스킬로 동기화 검증.**

#### 4-2. i18n.js `pickFromAcceptLanguage` 확인

`user/config/i18n.js`의 `pickFromAcceptLanguage()` 함수 내 `lowerMap`은 **언어 감지용**이므로 엔티티 추가 시 직접 수정할 필요는 없다.
단, **새 언어를 추가하는 경우**에는 `shared/locales.js`의 `SUPPORTED_LOCALES` 배열과 함께 이 `lowerMap`에도 매핑을 추가해야 한다:

```javascript
// user/config/i18n.js — pickFromAcceptLanguage() 내 lowerMap
const lowerMap = {
  'ko': 'ko',
  'en': 'en',
  'ja': 'ja',
  'zh-cn': 'zh-CN',
  'zh-tw': 'zh-TW',
  'th': 'th',
  'vi': 'vi',
  'fr': 'fr',
  'es': 'es',
  // 새 언어 추가 시 여기에 매핑 추가
};
```

**언어 추가 시 수정할 파일 체크리스트**:
1. `shared/locales.js` — `SUPPORTED_LOCALES` 배열 (Single Source of Truth)
2. `user/config/i18n.js` — `pickFromAcceptLanguage()` 내 `lowerMap` 객체
3. `user/locales/{new_lang}.json` — 새 언어 파일 생성
4. DB `lang_code` ENUM이 있는 테이블들 (아래 4-3 참조)

#### 4-3. DB ENUM 값 추가

새 엔티티의 페이지에 배너/통계 등 기능을 연동하려면 관련 테이블의 ENUM에 새 값을 추가해야 한다.

**배너 페이지 유형** — 새 엔티티 페이지에 배너 슬롯을 사용할 경우:
```sql
-- tb_banners.page_type에 새 엔티티 추가
-- 현재: ENUM('MAIN','FESTIVALS','CONCERTS','NEWS','TRIP','KBEAUTY','KMEDICAL','TRAVEL_GUIDE')
ALTER TABLE tb_banners
  MODIFY COLUMN page_type ENUM('MAIN','FESTIVALS','CONCERTS','NEWS','TRIP','KBEAUTY','KMEDICAL','TRAVEL_GUIDE','{ENTITY_UPPER}S') NOT NULL COMMENT '페이지 구분';
```
→ `admin/services/admin_banner_service.js`의 `SLOT_MAP`에도 새 페이지 유형 슬롯 정의 추가.

**BlogAuto 콘텐츠 타입** — BlogAuto(n8n) 자동생성 대상인 경우:
```sql
-- tb_blog_auto_tasks.content_type에 새 엔티티 추가
-- 현재: ENUM('festival','concert','travel-guide','custom')
ALTER TABLE tb_blog_auto_tasks
  MODIFY COLUMN content_type ENUM('festival','concert','travel-guide','custom','{entity}') NOT NULL COMMENT '콘텐츠 타입';
```

**lang_code ENUM** — 새 **언어** 추가 시 (엔티티가 아닌 언어):
```sql
-- lang_code ENUM을 사용하는 테이블 목록:
-- tb_affiliate_i18n, tb_concert_translations, tb_concert_seo, tb_concert_slug_i18n,
-- tb_festival_translations, tb_festival_seo, tb_festival_slug_i18n,
-- tb_{entity}_translations, tb_{entity}_seo, tb_{entity}_slug_i18n 등
-- 현재: ENUM('ko','en','ja','zh-CN','zh-TW','vi','fr','es','th')
ALTER TABLE tb_{table_name}
  MODIFY COLUMN lang_code ENUM('ko','en','ja','zh-CN','zh-TW','vi','fr','es','th','{new_lang}') NOT NULL COMMENT '언어 코드';
```

**통계/히스토리 테이블** — `content_type`이 varchar인 테이블은 ENUM 변경 불필요하지만, 서비스 코드에서 새 엔티티를 인식하도록 확인:
- `tb_user_content_history` (`content_type` varchar) — `user/services/content_history_service.js`
- `tb_stats_daily_content` (`content_type` varchar) — 통계 집계 코드
- `tb_share_clicks` (`content_type` varchar) — 공유 추적 코드

**중요**: ENUM 변경은 `/alter-table` 스킬로 개발 DB + 상용 DB + schema.sql 세 곳 동시 적용.

### Step 5: 번역 워커 등록 (Admin)

`admin/schedule/translation_worker.js`에 새 엔티티 번역 작업 등록:
- `ENTITY_CONFIGS` 배열에 새 엔티티 설정 추가
- 번역 대상 필드(title, summary, content_html 등) 정의

## 검증 체크리스트

- [ ] DDL이 개발 DB + 상용 DB + schema.sql에 모두 적용됨
- [ ] Admin CRUD (생성/조회/수정/삭제) 동작 확인
- [ ] User 리스트/상세 페이지 동작 확인
- [ ] 9개 언어 locale 파일 동기화 완료
- [ ] 번역 워커가 새 엔티티를 인식함
- [ ] 사이드바/네비게이션에 메뉴 표시됨
- [ ] DB ENUM 추가 완료 (배너 page_type, BlogAuto content_type 등 해당 시)
- [ ] 통계/히스토리 서비스가 새 엔티티 content_type을 인식함
