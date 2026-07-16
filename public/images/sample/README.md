# 샘플 데이터 이미지 (납품본에 함께 나가는 자산)

몰 최초 생성 시 주입되는 **샘플 데이터**가 참조하는 이미지 파일을 둔다.

## 왜 `public/uploads/` 가 아니라 여기인가

`.gitignore:44` 가 **`/public/uploads/` 전체를 제외**한다. 배포·납품은 git 기반이라
`uploads/` 에 넣은 이미지는 **납품 시스템에 실리지 않는다**(DB 경로만 남고 이미지는 깨짐).

`public/images/` 는 정상 추적되고 `app.js:86` 의 `express.static(public)` 이 웹 루트로 서빙한다.
따라서 여기 넣으면 **`git add -f` 없이** 배포본에 자동 포함된다.
(이 규약은 `services/mall/sampleSeeder.js:17-18` 주석에서 이미 확립됨.)

| 디스크 경로 | 웹 URL |
|---|---|
| `public/images/sample/banners/hero-01.png` | `/images/sample/banners/hero-01.png` |
| `public/images/sample/products/item-01.png` | `/images/sample/products/item-01.png` |

## 이웃 폴더와의 구분

| 경로 | 용도 |
|---|---|
| `public/images/placeholders/sample/` | **SVG 플레이스홀더** — 도형 스탠드인(brand/cat/hero/prod). 현행 sampleSeeder 가 사용 |
| `public/images/sample/` (여기) | **실제 큐레이션된 샘플 자산** — 종합관에서 추려온 배너·상품 이미지 |

## 폴더

### `banners/` — 샘플 슬라이더 / 배너 이미지

| 용도 | 권장 규격 |
|---|---|
| 메인 슬라이더 (PC) | **1920 × 600** (기존 몰 관례) |
| 메인 슬라이더 (모바일, 선택) | 세로 비중 높게 (예: 750 × 600) |
| 프로모션/카테고리 배너 | **960 × 240** 또는 960 × 200 |

- 포맷: `png` 또는 `jpg`, 파일당 가급적 500KB 이하
- 파일명: 소문자·하이픈. 예) `hero-main-01.png`, `promo-brand-01.png`
- 메인 슬라이더는 이미지 위에 문구·버튼이 얹히므로 **좌측 또는 중앙에 여백**이 있는 이미지가 좋다.

### `products/` — 샘플 상품 이미지
정사각(예: 800 × 800) 권장.

## 주의

- 여기 있는 파일은 **모든 납품본에 그대로 복제**된다. 저작권 문제 없는 이미지만 둘 것.
- 종합관(mall 2) 상품 이미지는 `public/uploads/products/` 에 있어 **그대로 참조하면 안 된다**
  (배포에 안 실림). 샘플로 쓸 이미지는 반드시 **이 폴더로 복사**한 뒤 그 경로를 저장한다.
