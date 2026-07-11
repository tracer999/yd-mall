# 약관 및 정책 관리 (Policies)

## 1. 개요

- **Base URL:** `/admin/policies`  
- **관련 테이블:** `policy_versions`, `site_settings`  
- **컨트롤러:** `controllers/admin/policyController.js`  
- **뷰:** `views/admin/policies/list.ejs`, `create.ejs`, `detail.ejs`, `edit.ejs`, `form.ejs`  
- **에디터:** TinyMCE (create/edit 폼의 content), `process.env.TINYMCE_KEY`

이용약관(TERMS)과 개인정보 처리방침(PRIVACY)을 **버전별**로 관리합니다. 한 타입당 하나만 '시행 중(is_active=1)'이 되며, 활성 버전 내용은 `site_settings` 테이블에 동기화됩니다.

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/policies` | getPolicies | 이용약관/개인정보 버전 목록 (탭 구분) |
| GET | `/admin/policies/create` | createPolicyForm | 새 버전 등록 폼 |
| POST | `/admin/policies/create` | createPolicy | 새 버전 등록 |
| GET | `/admin/policies/:id` | getPolicyDetail | 약관 상세 보기 |
| GET | `/admin/policies/:id/edit` | editPolicyForm | 약관 수정 폼 |
| POST | `/admin/policies/:id/edit` | updatePolicy | 약관 수정 처리 |
| POST | `/admin/policies/:id/active` | activatePolicy | 해당 버전 시행으로 활성화 |

---

## 3. 버전 목록 (GET /admin/policies)

- **쿼리:**  
  - 이용약관: `SELECT * FROM policy_versions WHERE type = 'TERMS' ORDER BY created_at DESC`  
  - 개인정보: `SELECT * FROM policy_versions WHERE type = 'PRIVACY' ORDER BY created_at DESC`  
- **뷰:** 탭으로 이용약관/개인정보 처리방침 구분, 테이블에 버전명, 시행일, 상태(시행 중/종료), 작성일, [상세] [수정] [활성화] 버튼  
- **뷰 전달:** `termsVersions`, `privacyVersions`, `title: '약관 및 정책 관리'`

---

## 4. 새 버전 등록 폼 (GET /admin/policies/create)

- **뷰 전달:** `tinymceKey` (환경변수), `title: '새 약관 등록'`  
- **폼:** type(TERMS/PRIVACY), version, effective_date, content(TinyMCE), is_active(체크 시 즉시 시행)

### 4.1 등록 폼 필드

| name | 타입 | 필수 | 설명 |
|------|------|------|------|
| type | select | - | TERMS(이용약관) / PRIVACY(개인정보 처리방침) |
| version | text | O | 버전 명 (예: 1.0, 2026-10-01 개정) |
| effective_date | date | O | 시행일 |
| content | textarea (TinyMCE) | - | 약관 본문 (HTML) |
| is_active | checkbox | - | 즉시 시행 시 체크 (기존 동일 타입 비활성화 후 이 버전 활성화) |

---

## 5. 새 버전 등록 (POST /admin/policies/create)

- **파라미터:** type, version, effective_date, content, is_active (on이면 1)  
- **트랜잭션:**  
  1. `is_active`가 1이면 `UPDATE policy_versions SET is_active = 0 WHERE type = ?`  
  2. `INSERT INTO policy_versions (type, version, effective_date, content, is_active)`  
  3. 새로 넣은 것이 활성(1)이면 `site_settings` 동기화: type이 TERMS면 terms_of_service, PRIVACY면 privacy_policy에 content 저장 (id=1)  
  4. commit  
- **실패 시:** rollback, 500  
- **성공 시:** `res.redirect('/admin/policies')`

---

## 6. 약관 상세 보기 (GET /admin/policies/:id)

- **쿼리:** `SELECT * FROM policy_versions WHERE id = ?`  
- **없을 때:** 404  
- **뷰 전달:** `policy`, `title: '약관/정책 상세 보기'`  
- **뷰:** `admin/policies/detail.ejs`

---

## 7. 약관 수정 폼 (GET /admin/policies/:id/edit)

- **쿼리:** `SELECT * FROM policy_versions WHERE id = ?`  
- **없을 때:** 404  
- **뷰 전달:** `policy`, `tinymceKey`, `title: '약관/정책 수정'`  
- **뷰:** `admin/policies/edit.ejs`

---

## 8. 약관 수정 처리 (POST /admin/policies/:id/edit)

- **파라미터:** URL `id`, body에 version, effective_date, content  
- **트랜잭션:**  
  1. 해당 id의 policy_versions 1건 조회  
  2. `UPDATE policy_versions SET version = ?, effective_date = ?, content = ? WHERE id = ?`  
  3. 해당 버전이 is_active=1이면 site_settings 동기화 (TERMS→terms_of_service, PRIVACY→privacy_policy)  
  4. commit  
- **성공 시:** `res.redirect('/admin/policies')`

---

## 9. 버전 활성화 (POST /admin/policies/:id/active)

- **파라미터:** URL `id`, body에 `type` (선택, id로 조회한 type 사용)  
- **트랜잭션:**  
  1. 해당 id의 policy_versions 1건 조회 (type, content)  
  2. 해당 type 전체 `is_active = 0`  
  3. 해당 id만 `is_active = 1`  
  4. site_settings (id=1)에 TERMS면 terms_of_service, PRIVACY면 privacy_policy를 해당 content로 UPDATE  
  5. commit  
- **실패 시:** rollback, 500  
- **성공 시:** `res.redirect('/admin/policies')`

---

## 10. DB 스키마 (policy_versions)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK | 버전 ID |
| type | ENUM('TERMS','PRIVACY') | 이용약관/개인정보 |
| version | VARCHAR(50) | 버전 명 |
| content | TEXT | 본문 |
| is_active | TINYINT 0/1 | 시행 여부 |
| effective_date | DATE | 시행일 |
| created_at | TIMESTAMP | 생성일시 |

---

*Last Updated: 2026-02-07*
