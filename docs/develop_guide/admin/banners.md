# 배너 관리 (Banners)

## 1. 개요

- **Base URL:** `/admin/banners`  
- **관련 테이블:** `banners`, `categories`  
- **컨트롤러:** `controllers/admin/bannerController.js`  
- **뷰:** `views/admin/banners/list.ejs`, `views/admin/banners/form.ejs`  
- **이미지 업로드:** Multer 필드명 `banner_image`, 저장 경로 `public/uploads/banners/`

메인 배너, 카테고리 배너, 팝업 배너를 등록·수정·삭제합니다.

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/banners` | getList | 배너 목록 (type 쿼리: MAIN/CATEGORY/POPUP) |
| GET | `/admin/banners/add` | getAdd | 배너 등록 폼 |
| POST | `/admin/banners/add` | postAdd | 배너 등록 처리 (multipart, `upload.fields`) |
| GET | `/admin/banners/edit/:id` | getEdit | 배너 수정 폼 |
| POST | `/admin/banners/edit/:id` | postEdit | 배너 수정 처리 (multipart, `upload.fields`) |
| POST | `/admin/banners/delete` | postDelete | 배너 삭제 |

---

## 3. 목록 조회 (GET /admin/banners)

- **쿼리 파라미터:** `type` (기본 MAIN) — MAIN / CATEGORY / POPUP
- **쿼리:** `banners` LEFT JOIN `categories` (카테고리명), `WHERE banner_type = ?`, `ORDER BY display_order ASC, created_at DESC`  
- **표시:** 썸네일(image_url), 제목(title), 배너 타입(메인/카테고리/팝업), 대상 카테고리명, 링크 URL, 사용중/중지 뱃지, 수정/삭제 버튼  
- **뷰 전달:** `banners`, `currentType`, `title: '배너 관리'`

---

## 4. 배너 등록 폼 (GET /admin/banners/add)

- **동작:** 카테고리 목록 조회 후 `banner: null`, `categories` 와 함께 폼 렌더링  
- **뷰:** `admin/banners/form.ejs`

### 4.1 폼 필드

| name | 타입 | 필수 | 설명 |
|------|------|------|------|
| banner_type | radio | - | MAIN(메인 배너) / CATEGORY(카테고리 배너) / POPUP(팝업 배너), 기본 MAIN |
| category_id | select | CATEGORY일 때 | 카테고리 선택 (카테고리 배너일 때만 노출) |
| title | text | - | 배너 제목 |
| banner_image | file | O | 배너 이미지 (PC) |
| mobile_banner_image | file | - | 모바일용 배너 이미지 (없으면 PC 이미지 사용) |

> **권장 사이즈 & 비율 요약**
>
> - 메인 배너: 1920×600px (가로:세로 3.2:1), 2배 해상도 작업 시 3840×1200px
> - 카테고리 배너: 900×200px (가로:세로 약 4.5:1), 2배 해상도 작업 시 1800×400px
> - 팝업 배너: 960×960px (가로:세로 1:1, 정사각형), 2배 해상도 작업 시 1920×1920px
> - **모바일 배너 (메인용):** 800×1200px (가로:세로 2:3, 세로형), 2배 해상도 작업 시 1600×2400px
>
> 해상도는 배율(1배/2배 등)에 따라 키워도 되지만, **각 배너의 가로:세로 비율은 유지**해서 제작해 주세요.
| link_url | text | - | 클릭 시 이동 URL (내부 경로 또는 외부 URL) |
| display_order | number | - | 노출 순서, 기본 0 |
| start_date | date | - | 게시 시작일 |
| end_date | date | - | 게시 종료일 |
| is_active | checkbox | - | 활성화 여부 (1/0) |

- **저장 시:** banner_type이 CATEGORY가 아니면 category_id는 null로 저장  
- **이미지:** `banner_image`, `mobile_banner_image` 필드명으로 Multer가 `public/uploads/banners/`에 저장, DB에는 `/uploads/banners/파일명` 형태로 저장

---

## 5. 배너 등록 처리 (POST /admin/banners/add)

- **enctype:** `multipart/form-data`, `upload.fields([...])`  
- **로직:**  
  - `banner_type === 'CATEGORY'` 이면 type='CATEGORY', category_id 사용  
  - 아니면 type='MAIN', category_id=null  
  - `image_url`, `mobile_image_url` = 업로드 파일 있으면 `/uploads/banners/` + 파일명  
- **INSERT 컬럼:** banner_type, category_id, title, image_url, mobile_image_url, link_url, display_order, is_active(0/1), start_date, end_date  
- **성공 시:** `res.redirect('/admin/banners')`

---

## 6. 배너 수정 폼 (GET /admin/banners/edit/:id)

- **동작:** 해당 id의 배너 1건 조회, 없으면 `/admin/banners`로 리다이렉트. 카테고리 목록 조회 후 `banner`, `categories`, `currentType`과 함께 폼 렌더링  
- **뷰:** `admin/banners/form.ejs` (등록과 동일한 폼, banner 값 채워서 사용)

---

## 7. 배너 수정 처리 (POST /admin/banners/edit/:id)

- **enctype:** `multipart/form-data`, `upload.fields([...])`  
- **파라미터:** URL `id`, body에 title, link_url, display_order, is_active, banner_type, category_id, start_date, end_date  
- **이미지:** 새 파일 있으면 교체, 없으면 기존 `image_url`, `mobile_image_url` 유지  
- **성공 시:** `res.redirect('/admin/banners?type=' + type)`

---

## 8. 배너 삭제 (POST /admin/banners/delete)

- **파라미터:** `id` (body)  
- **동작:** `DELETE FROM banners WHERE id = ?` 후 `/admin/banners`로 리다이렉트  
- **뷰:** 삭제 전 `confirm('삭제하시겠습니까?')` 실행

---

## 9. DB 스키마 (banners)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK | 배너 ID |
| banner_type | ENUM('MAIN','CATEGORY','POPUP') | 메인/카테고리/팝업 |
| category_id | INT FK NULL | 카테고리 배너일 때만 |
| title | VARCHAR(100) | 제목 |
| image_url | VARCHAR(255) | 이미지 경로 |
| mobile_image_url | VARCHAR(255) | 모바일용 이미지 경로 |
| link_url | VARCHAR(255) | 링크 URL |
| display_order | INT DEFAULT 0 | 노출 순서 |
| is_active | TINYINT 0/1 | 활성화 |
| start_date, end_date | DATE NULL | 게시 기간 |
| created_at | TIMESTAMP | 생성일시 |

---

*Last Updated: 2026-02-07*
