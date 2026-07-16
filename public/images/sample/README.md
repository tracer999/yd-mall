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

### `banners/` — 샘플 슬라이더 / 배너 (이미지 · 영상)

| 용도 | 권장 규격 |
|---|---|
| 메인 슬라이더 (PC) | **1920 × 600** (기존 몰 관례) |
| 메인 슬라이더 (모바일, 선택) | 세로 비중 높게 (예: 750 × 600) |
| 프로모션/카테고리 배너 | **960 × 240** 또는 960 × 200 |

- 포맷: `png` · `jpg` · `webp`, 파일당 가급적 500KB 이하
- 파일명: 소문자·하이픈. 예) `hero-main-01.png`, `promo-brand-01.png`
- 메인 슬라이더는 이미지 위에 문구·버튼이 얹히므로 **좌측 또는 중앙에 여백**이 있는 이미지가 좋다.

#### 영상 배너

메인 슬라이더(`slot='MAIN'`)만 영상을 지원한다. FEATURE(우측 카드)는 이미지 전용이다(DB CHECK 로 강제).

**영상 하나에 파일 3개가 한 세트다. 하나라도 빠지면 안 된다.**

| 파일 | 왜 필요한가 |
|---|---|
| `name.webm` (VP9) | 먼저 시도된다. 같은 화질에서 MP4보다 작다 |
| `name.mp4` (H.264) | WebM 미지원 브라우저 폴백. **없으면 그 브라우저에서 배너가 안 나온다** |
| `name-poster.webp` | 영상 로드 전 화면을 채운다. 없으면 LCP·CLS 가 깨지고 모바일 폴백도 사라진다 |

- **해상도는 1920 을 넘기지 않는다.** 4K 원본을 그대로 두면 WebM 이 먼저 선택되므로 대부분의
  방문자가 수 MB 를 받는다(배너 하나로 LCP 예산이 날아간다).
- 소리는 쓰지 않는다. 브라우저가 소리 있는 autoplay 를 막아 **검은 화면**이 된다
  (`autoplay=1` 이면 `muted=1` — DB CHECK 로도 강제).
- 모바일은 영상 대신 `mobile_image_path`(보통 포스터)로 폴백한다 — 데이터·배터리.

기존 webm 에서 폴백 세트를 만드는 법:

```bash
# webm → mp4 (1920 으로 축소)
ffmpeg -i name.webm -vf scale=1920:-2 -c:v libx264 -profile:v high -preset slow \
       -crf 24 -pix_fmt yuv420p -movflags +faststart -an name.mp4
# 첫 프레임 → 포스터
ffmpeg -i name.webm -vf scale=1920:-2 -frames:v 1 -c:v libwebp -quality 82 name-poster.webp
```

경로를 DB 에 넣는 곳: **서비스 관리 → 샘플 데이터 관리**(`/admin/service/samples`) 의 히어로 표.
거기 값이 몰 생성 시 `hero_slide` 로 복제된다(`services/mall/sampleSeeder.js`).

### `products/` — 샘플 상품 이미지
정사각(예: 800 × 800) 권장.

## 주의

- 여기 있는 파일은 **모든 납품본에 그대로 복제**된다. 저작권 문제 없는 이미지만 둘 것.
- 종합관(mall 2) 상품 이미지는 `public/uploads/products/` 에 있어 **그대로 참조하면 안 된다**
  (배포에 안 실림). 샘플로 쓸 이미지는 반드시 **이 폴더로 복사**한 뒤 그 경로를 저장한다.
