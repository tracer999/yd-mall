# 이메일 템플릿 관리 (Email Templates)

## 1. 개요

- **Base URL:** `/admin/email-templates`
- **관련 테이블:** `email_template` (오버라이드 전용), `system_settings.admin_email`, `site_settings`, `mall`
- **컨트롤러:** `controllers/admin/emailTemplateController.js`
- **라우트:** `routes/admin/email-templates.js` (마운트: `routes/admin.js`)
- **뷰:** `views/admin/email-templates/list.ejs`, `form.ejs`
- **서비스:**
  - `services/email/emailTemplateRegistry.js` — 템플릿 카탈로그 + **기본 제목·본문**(코드가 소유)
  - `services/email/emailTemplateService.js` — 로드·저장·렌더(토큰 치환·레이아웃 적용)·발송
  - `services/email/orderMailer.js` — 이벤트별 진입점(주문 데이터 → 토큰)
- **에디터:** TinyMCE 6 (`process.env.TINYMCE_KEY`, 없으면 plain textarea 로 폴백)

주문·배송 도메인에서 나가는 모든 안내 메일의 제목·본문을 **몰별로** 오버라이드한다.

> ⚠️ **기본값은 DB 가 아니라 코드에 있다.** 이 제품은 몰 빌더라, 템플릿을 시드로 깔면 시드를 넣은 인스턴스에서만 메일이 나가고 새로 찍어낸 몰에서는 조용히 아무것도 안 나간다. 그래서 `email_template` 에는 **관리자가 실제로 고친 행만** 쌓이고, 행이 없으면 registry 의 `defaultSubject` / `defaultBody` 로 발송한다. 마이그레이션에 기본 템플릿 INSERT 를 넣지 말 것.

---

## 2. 데이터 모델

```sql
CREATE TABLE email_template (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  mall_id      BIGINT NOT NULL DEFAULT 1,
  template_key VARCHAR(60) NOT NULL,   -- registry 의 key
  subject      VARCHAR(255) DEFAULT NULL,  -- NULL = 코드 기본값
  body         TEXT,                       -- NULL = 코드 기본값
  is_enabled   TINYINT(1) NOT NULL DEFAULT 1,
  updated_by   INT DEFAULT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_email_template_mall_key (mall_id, template_key)
);
```

마이그레이션: `scripts/migrate_email_template.sql` (테이블 + `admin_menus` 행). 메뉴는 `is_active = 0` 으로 들어가므로 **코드 배포 후** 아래로 켠다.

```sql
UPDATE admin_menus SET is_active = 1 WHERE path = '/admin/email-templates';
```

### 2.1 해석 규칙 (`resolveWith`)

| 상황 | subject / body |
|---|---|
| 행 없음 | 코드 기본값, `isEnabled = true`, `isCustomized = false` |
| 행 있고 컬럼이 NULL/공백 | 코드 기본값 (그 컬럼만) |
| 행 있고 값 있음 | DB 값, `isCustomized = true` |

`saveTemplate` 은 **기본값과 동일한 내용이면 NULL 로 저장**한다. 기본 문구가 코드에서 개선되면 손대지 않은 몰이 자동으로 따라가게 하기 위해서다.

테이블이 없으면(`ER_NO_SUCH_TABLE`) `loadOverrides` 가 빈 Map 을 돌려주고 경고만 남긴다 — 마이그레이션 전에도 메일 발송이 멈추지 않는다.

---

## 3. 템플릿 카탈로그 (registry)

키는 `services/email/emailTemplateRegistry.js` 의 `TEMPLATES` 배열이 소유한다. 현재 **17종**.

| 그룹 | key | 발송 지점 |
|---|---|---|
| COMMON | `_layout` | 모든 메일을 감싸는 틀. `{{content}}` 자리에 본문이 들어감 |
| B2C | `b2c_order_paid` | `checkoutController.completeOrderWithStockAndPaid` 커밋 후 |
| B2C | `b2c_order_shipped` | `admin/shippingController.postTracking` |
| B2C | `b2c_order_delivered` | `admin/shippingController.postDelivered` |
| B2C | `b2c_claim_requested` | `mypageController.cancelOrder` |
| B2C | `b2c_claim_approved` | `admin/claimController.postApprove` |
| B2C | `b2c_claim_rejected` | `admin/claimController.postReject` |
| B2B | `b2b_order_requested` | `checkoutController` (B2B 접수) → `b2bOrderService.notify` |
| B2B | `b2b_order_approved` | `b2bOrderService.approve` |
| B2B | `b2b_order_paid` | `b2bOrderService.confirmDeposit` |
| B2B | `b2b_order_shipped` | `b2bOrderService.ship` |
| B2B | `b2b_order_delivered` | `b2bOrderService.markDelivered` |
| B2B | `b2b_order_rejected` | `b2bOrderService.cancel` (반려·기한초과 자동취소 포함) |
| B2B | `b2b_claim_approved` | `admin/b2bClaimController.postApprove` |
| B2B | `b2b_claim_rejected` | `admin/b2bClaimController.postReject` |
| B2B | `b2b_claim_refunded` | `admin/b2bClaimController.postRefundComplete` |
| ADMIN | `admin_claim_requested` | `mypageController.cancelOrder` (운영자 수신) |

### 3.1 템플릿 정의 필드

```js
{
  key, group,               // group: COMMON | B2C | B2B | ADMIN
  label, description, when, // 관리자 화면 표기
  recipient,                // 받는 사람 설명 (선택)
  variables: ['order_number', ...],  // VAR_CATALOG 의 토큰 키
  defaultSubject,           // 레이아웃은 null
  defaultBody,
}
```

### 3.2 토큰

`VAR_CATALOG` 가 토큰 → `{ label, sample, raw? }` 를 관장한다. 치환 시 값은 **기본적으로 HTML 이스케이프**되고, `raw: true` 인 토큰(`item_table`, `content`)만 그대로 삽입된다.

새 토큰을 추가할 때는 `VAR_CATALOG` 에 정의를 넣고, 해당 템플릿의 `variables` 배열에 키를 넣고, `orderMailer` 가 값을 채우도록 세 곳을 함께 고쳐야 한다.

---

## 4. 라우트

| 메서드 | URL | 핸들러 | 설명 |
|---|---|---|---|
| GET | `/admin/email-templates` | getList | 그룹별 목록 (`?mall=` 로 몰 전환) |
| POST | `/admin/email-templates/admin-email` | postAdminEmail | 운영자 알림 수신 주소 저장 |
| GET | `/admin/email-templates/:key` | getEdit | 편집 폼 |
| POST | `/admin/email-templates/:key` | postEdit | 저장 |
| POST | `/admin/email-templates/:key/reset` | postReset | 오버라이드 행 삭제 (기본값 복원) |
| POST | `/admin/email-templates/:key/toggle` | postToggle | 발송 on/off |
| POST | `/admin/email-templates/:key/preview` | postPreview | **편집 중 내용**을 샘플 값으로 렌더 (JSON) |
| POST | `/admin/email-templates/:key/test` | postTest | 편집 중 내용으로 실제 테스트 발송 |

`preview` / `test` 는 저장된 값이 아니라 **요청 body 의 subject/body** 를 렌더한다 — 저장 전에 확인하는 게 목적이기 때문.

RBAC: `requireMenuAccess('/admin/email-templates')` → `admin_menus.visible_roles = 'super_admin,admin'`.

---

## 5. 렌더 파이프라인

```
orderMailer.notifyXxx(orderId)
  → buildOrderVars(orderId)         # orders + order_items + shipments + site_settings → 토큰 맵
  → emailTemplateService.sendTemplateMail({ mallId, key, to, vars })
      → renderTemplate(mallId, key, vars)
          ├ 본문:   renderString(tpl.body, vars)            # 이스케이프 O
          ├ 제목:   renderString(tpl.subject, vars, {escape:false})
          └ 레이아웃: renderString(layout.body, {...vars, content: 본문})
      → emailService.sendEmail({ to, subject, html })
```

- 레이아웃이 `is_enabled = 0` 이면 본문만 발송한다.
- 템플릿이 `is_enabled = 0` 이면 `{ skipped: true }` 로 조용히 끝난다.
- `sendTemplateMail` 은 **예외를 삼킨다**. 메일 실패가 주문·배송 처리를 되돌리면 안 된다. 모든 호출부도 `.catch()` 로 감싸 fire-and-forget 한다.

### 5.1 몰 폴백 (`resolveMallId`)

주문의 `mall_id` 가 **이미 삭제된 몰**을 가리킬 수 있다 — 몰 빌더라 몰을 만들고 지우는 게 정상 흐름이고 주문 행은 남는다. `orderMailer.resolveMallId()` 가 `mall` 테이블에 없는 id 를 기본몰로 폴백해서, 그런 주문도 기본몰 이름·템플릿으로 나간다.

### 5.2 수신자 결정

| 대상 | 우선순위 |
|---|---|
| B2C | `orders.buyer_email` → `users.email` |
| B2B | `users.email`(주문 계정) → `business_profile.tax_invoice_email` → `orders.buyer_email` |
| 운영자 | `system_settings.admin_email` → `site_settings.contact_email` → (없으면 미발송) |

> `business_profile` 에는 담당자 메일 컬럼이 없다(계산서 수신 주소만 있다). 그래서 계정 메일이 1순위다.

`emailService` 의 예약 도메인 차단(`example.com`, `*.test` 등)이 그대로 적용된다 — 개발 계정으로 실제 발송이 나가는 사고를 막는다.

---

## 6. 새 안내 메일을 추가하려면

1. `emailTemplateRegistry.js` 의 `TEMPLATES` 에 항목 추가 (key·group·label·when·variables·defaultSubject·defaultBody)
2. 새 토큰이 필요하면 `VAR_CATALOG` 에 추가
3. `orderMailer.js` 에 `notifyXxx()` 진입점 추가 — 토큰을 채워 `sendTemplateMail` 호출
4. 발송 지점(컨트롤러·서비스)에서 `.catch()` 로 감싸 호출
5. **DB 작업 없음.** 관리자 화면에 자동으로 뜨고, 기본 문구로 즉시 발송된다

---

## 7. 관련 문서

- [`settings.md`](./settings.md) — SMTP 설정(`system_settings.smtp_*`), 전역 발송 스위치 `email_enabled`
- [`shipping.md`](./shipping.md) — 송장 등록·배송완료 (배송 메일 발송 지점)
- [`claims.md`](./claims.md) — 클레임 승인·반려
- [`b2b_orders.md`](./b2b_orders.md) — B2B 주문 단계별 처리
