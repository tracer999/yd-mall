# 매뉴얼 기준 전수 QA 리포트 (관리자 + 고객 화면)

- 테스트 일시: 2026-07-24
- 대상: `http://localhost:3006` (개발, DB=yd_mall 공용)
- 방식: Playwright(plugin) 실측 → 화면 구조(라우트·탭·버튼·필드·표헤더·동작문구) 캡처 → 매뉴얼(`docs/manual/**`) 대조 → **매뉴얼이 틀린 곳만 수정**
- 계정: `tracer999`(super_admin) · 편집몰 = 테스트몰_3(mall_id 28) / 고객 화면은 미로그인 상태
- 원칙: **읽기 전용**(생성·수정·삭제·외부 실전송 안 함), 앱 코드 무수정. "매뉴얼이 낡음"은 매뉴얼 수정, "기능이 깨짐(버그)"은 매뉴얼로 덮지 않고 별도 보고.

> 실측 근거 데이터: `.playwright-mcp/snap/OBSERVED.md` (전 화면 캡처 요약)

---

## 1. 커버리지 요약

| 구분 | 대상 | 결과 |
|---|---|---|
| 관리자 화면 | 사이드바 12그룹 + 통계 3 (약 60개 라우트) | 전수 접속 · 구조 대조 완료 |
| 고객 화면 | 홈·상품·검색·브랜드·혜택/프로모션 12종·장바구니·결제·마이·인증·B2B·CS·공지 (30여 라우트) | 전수 접속 · 구조 대조 완료 |
| 매뉴얼 | admin 40개 + user 18개 = 58개 문서 | 전수 대조 |

- 관리자 라우트: 접근한 모든 문서화 화면 **정상 로드**. `/admin/visitors`·`/admin/ga4` 404는 **정상**(독립 라우트 없음 — 실제는 각각 `/admin/visitors/stats`, `사이트 설정 내 분석&추적`).
- 고객 라우트: 전부 정상. `/specialty·/group-buy·/outlet·/live`는 내용 0건이라 **"준비 중" placeholder(200)**. 로그인 필요 화면(`/cart·/mypage·/inquiries·/b2b/*·/quotes`)은 `/auth/login`으로 정상 리다이렉트. 회원가입은 `/auth/signup`(사업자 `?type=biz`).

---

## 2. 매뉴얼 수정 내역 (13개 파일)

실측/코드와 어긋난 **사실 오류**만 정정했습니다.

### 관리자
| 파일 | 수정 | 근거 |
|---|---|---|
| `admin/index.md` | ① 로그인 랜딩 "대시보드" → "접근 가능한 첫 메뉴(보통 몰 리스트 관리)" ② 외부몰 연동 "7개 중 5개 동작" → "7개 모두 동작"(sync는 재고 전송만) ③ 서비스 그룹 표에 **샘플 데이터 관리** 행 추가 | `routes/admin.js:26-30`; `/sourcing/channel-import`·`/sync` 실동작 확인; `/admin/service/samples` 실재 |
| `admin/dashboard.md` | 방문자 통계 링크 `/admin/visitors` → `/admin/visitors/stats` | 전자는 404, 후자 200 |
| `admin/login.md` | "비밀번호 찾기 기능 없음" → 로그인 화면 **[비밀번호를 잊으셨나요?]**(→`/admin/login/forgot`) 존재 | 로그인 화면 실측 + 9장 문서 |
| `admin/operators.md` | "다른 운영자 비밀번호는 최고관리자도 못 바꿈" → **수정 화면에서 재설정 가능** | `operatorController.postEdit`(password 입력 시 갱신) |
| `admin/policies.md` | "예약 시행 없음/미래 날짜 자동 시행 안 됨" → **예약 시행 존재(10분 주기)** | `services/scheduler/index.js` 잡1 "약관 예약 시행", `app.js:370` 기동 |
| `admin/points.md` · `admin/membership.md` | 적립률·최소 사용 단위·포인트 유효기간 설정 위치 "사이트 설정(`/admin/settings`)" → **"시스템 설정(`/admin/sys-settings`)"** (8+1곳) | 실측: 해당 필드가 `/admin/sys-settings`에만 있고 `/admin/site-settings`엔 없음 |
| `admin/shipping.md` | 개별 송장 택배사 "5곳" → **"15곳"**(전체 나열) | `services/shipping/couriers.js` 15개; 문서 7-3절과도 불일치였음 |
| `admin/sourcing.md` | 상태표 화면명 "재고 연동" → **"재고·주문 가져오기"**(사이드바 라벨) | `admin_menus` 라벨 |
| `admin/products.md` | 필터표에 **사업자 상품** 행, 일괄처리표에 **카테고리 매핑·브랜드 매핑·B2B 판매등록** 3행 추가 | `views/admin/products/list.ejs` |
| `admin/recommend.md` · `admin/outlet.md` | 브레드크럼 소속 그룹 정정 → 둘 다 **"상품 관리"** | `admin_menus` 부모 메뉴 |

### 고객
| 파일 | 수정 | 근거 |
|---|---|---|
| `user/promotions.md` | `/recommend` 섹션 설명 정정: "3개 섹션" → **추천그룹 핵심 + 회원맞춤·MD추천·많이보는·최근본(조건부 노출)** | `/recommend` 실측 |

---

## 3. 앱 버그/불일치 후보 (매뉴얼 아님 — 코드 검토 권장)

매뉴얼로 덮지 않고 보고만 합니다. **앱 코드 수정 대상**입니다.

1. **[클레임 관리] 유형 필터에 `교환` 옵션 누락** — `views/admin/claims/list.ejs`의 유형 select에 `취소/반품`만 있고 **교환(EXCHANGE)이 없음**. 백엔드(`claimController`)와 목록 배지는 EXCHANGE를 정상 지원 → **뷰의 option 누락**으로 보임. (매뉴얼 `claims.md`는 교환을 언급 — 뷰를 고치는 게 맞아 매뉴얼은 미수정)
2. **재고 연동 화면 이름 불일치** — 같은 화면의 사이드바 라벨은 "재고·주문 가져오기", 페이지 제목·코드 주석은 "재고 연동"(`sourcingController.js`, `sync.ejs`, `routes/admin/sourcing.js`). 사용자 혼란 소지.
3. **GNB 개수 계산 표기 불일치** — `메뉴 미리보기`는 `GNB 13개 노출 / 상한 8 (카테고리 5개 포함)`, `일반 메뉴 관리`는 `기능 9 / 상한 8`. 카테고리 포함 여부·기준이 두 화면에서 다르게 표기됨.

---

## 4. 미문서화 화면 (참고)

상품 관리 그룹 사이드바에 실재하나 전용 매뉴얼(.md)이 없는 화면:
- **상품 필터 설정** (`/admin/products/facets`) — "카테고리 상품 필터"
- **상품 속성 추출·검수** (`/admin/products/facet-extract`)

고급/개발 도구 성격이라 index.md 표에는 넣지 않았습니다. 필요 시 전용 매뉴얼 신설 또는 `products.md`에 한 줄 안내 추가를 검토하세요.

---

## 5. 정확성 확인(수정 불필요) 주요 매뉴얼

`malls · settings · theme · email_templates · header · categories · brands · menus · page_builder · banners · exhibitions · group_buys · lives · derived-products · best · deals · coupons · events · b2b · sales · users · inquiries · reviews · notices · service · visitors · ga4 · search_logs` 및 고객 `home · products · categories · search · brands · cart · checkout · mypage · auth · b2b · cs · notices · terms_pages · ga4 · custom_menu` — 라우트·탭·필드·동작이 실측/코드와 일치.
