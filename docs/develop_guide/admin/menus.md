# 관리자 메뉴 (Admin Menus)

## 1. 개요

- **Base URL:** `/admin/menus`  
- **관련 테이블:** `admin_menus`  
- **컨트롤러:** `controllers/admin/menuController.js`  
- **뷰:** `views/admin/menus/list.ejs`  
- **접근 권한:** `ensureMenuAdmin` — super_admin 또는 admin 역할만 접근 가능

관리자 사이드바 메뉴의 순서, 경로, 아이콘, 역할별 표시(visible_roles)를 DB에서 관리합니다. 메뉴 정의는 `adminMenu` 미들웨어와 `requireMenuAccess`에서 사용됩니다.

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/menus` | getMenus | 메뉴 설정 폼/목록 |
| POST | `/admin/menus/save` | saveMenus | 메뉴 설정 저장 |

---

## 3. 메뉴 목록 (GET /admin/menus)

- **쿼리:** `SELECT ... FROM admin_menus WHERE parent_id IS NULL ORDER BY display_order ASC, id ASC`
- **뷰 전달:** `menus` (배열), `title: '메뉴 관리'`
- **표시:** 각 메뉴의 name, path, icon_class, display_order, visible_roles 등

---

## 4. 메뉴 저장 (POST /admin/menus/save)

### 4.1 요청 파라미터 (body, 배열 형태)

| name | 타입 | 설명 |
|------|------|------|
| id | number (optional) | 기존 메뉴 ID (없으면 신규) |
| name | string | 메뉴명 |
| path | string | 클릭 시 이동 URL (예: /admin/products) |
| icon_class | string | 아이콘 클래스 (Bootstrap Icons 등) |
| visible_roles | string | 표시할 역할 (콤마 구분, 비어 있으면 전체 표시) |

- 단일 값으로 전송되면 배열로 변환하여 처리
- 행 순서가 `display_order`가 됨 (1부터 순차)

### 4.2 처리 로직

1. 트랜잭션 시작
2. 각 행에 대해:
   - `name` 또는 `path`가 비어 있으면 해당 행 무시
   - `id`가 있으면: `UPDATE admin_menus SET name=?, path=?, icon_class=?, display_order=?, visible_roles=? WHERE id=?`
   - `id`가 없으면: `INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles) VALUES (...)`
3. commit 후 `/admin/menus`로 리다이렉트

---

## 5. DB 스키마 (admin_menus)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK | 메뉴 ID |
| name | VARCHAR(50) | 메뉴명 |
| path | VARCHAR(255) | 클릭 시 이동 URL |
| icon_class | VARCHAR(100) | 아이콘 클래스 |
| display_order | INT | 표시 순서 (오름차순) |
| parent_id | INT FK NULL | 부모 메뉴 ID (NULL이면 1차 메뉴) |
| is_active | TINYINT 0/1 | 활성 여부 |
| visible_roles | VARCHAR(100) | 표시할 역할 (콤마 구분, NULL=전체) |

---

## 6. 연동

- **adminMenu.js:** `admin_menus`에서 `is_active=1`인 메뉴를 로드해 `res.locals.adminMenus`에 저장, 역할별 필터링
- **adminRoleGuard.js:** `requireMenuAccess(menuPath)`에서 해당 path의 `visible_roles`로 접근 제어

---

*Last Updated: 2026-02-07*
