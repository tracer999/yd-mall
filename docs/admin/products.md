# 상품 관리 (Products)

## 1. 개요

- **Base URL:** `/admin/products`  
- **관련 테이블:** `products` (메인), `categories` (조인/선택)  
- **컨트롤러:** `controllers/admin/productController.js`  
- **뷰:** `views/admin/products/list.ejs`, `form.ejs`, `detail.ejs`, `seo_preview.ejs`  
- **이미지 업로드:** `middleware/upload.js` (Multer), 필드: main_image, thumbnail_image, sub_images(최대 10), video_file, 저장 경로 `public/uploads/products/`

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/products` | getList | 상품 목록 |
| GET | `/admin/products/add` | getAdd | 상품 등록 폼 |
| POST | `/admin/products/add` | postAdd | 상품 등록 처리 (multipart) |
| GET | `/admin/products/detail/:id` | getDetail | 상품 상세 조회 |
| GET | `/admin/products/edit/:id` | getEdit | 상품 수정 폼 |
| POST | `/admin/products/edit` | postEdit | 상품 수정 처리 (multipart) |
| POST | `/admin/products/delete` | postDelete | 상품 삭제 |
| POST | `/admin/products/product-image-upload` | postUploadImage | 이미지 업로드 (TinyMCE/드래그용, JSON 응답) |
| POST | `/admin/products/generate-ai-recommendation` | generateAIRecommendation | AI 추천 문구 생성 (OpenAI, JSON 응답) |
| POST | `/admin/products/status/update` | postUpdateStatus | 판매 상태 일괄 변경 |
| GET | `/admin/products/seo/view/:id` | getProductSEOView | 상품 SEO 미리보기 (팝업) |

---

## 3. 목록 조회 (GET /admin/products)

- **쿼리:** `products` LEFT JOIN `categories` ON category_id, `ORDER BY p.created_at DESC`  
- **표시:** 썸네일(main_image), 상품명, 공급사(provider), 카테고리명, 재고(stock), 매입가/판매가, 판매 상태(status)  
- **뷰 전달:** `products`, `title: '상품 관리'`

---

## 4. 상품 등록/수정 폼 (GET /admin/products/add, GET /admin/products/edit/:id)

- **등록:** 카테고리 목록만 조회 후 `product: null` 로 폼 렌더링  
- **수정:** `products`에서 id 조회, 없으면 `/admin/products`로 리다이렉트. 카테고리 목록 조회 후 `product`와 함께 폼 렌더링  

### 4.1 폼 필드 (form.ejs 기준)

| name | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | hidden | 수정 시 | 상품 ID |
| old_image | hidden | 수정 시 | 기존 main_image 경로 (이미지 변경 안 할 때 유지) |
| name | text | O | 상품명 |
| category_id | select | - | 카테고리 (선택 가능) |
| provider | text | - | 공급사 |
| status | select | - | ON(판매중) / SOLD_OUT(품절) / OFF(숨김) |
| purchase_price | text | - | 매입가 (원가) |
| original_price | text | - | 정가 (소비자가) |
| discount_rate | number | - | 할인율 (%) |
| price | text | - | 판매가 (자동 계산 가능) |
| stock | number | - | 재고 수량 |
| description | textarea (TinyMCE) | - | 상품 상세 설명 (HTML) |
| main_image | file | 등록 시 | 대표 이미지 (이미지만, 5MB 제한) |
| thumbnail_image | file | - | 썸네일 이미지 |
| sub_images | file (multiple) | - | 서브 이미지 (최대 10장) |
| video_file | file | - | 동영상 파일 |

- **가격:** 뷰에서 정가·할인율 입력 시 판매가 자동 계산, 천단위 콤마 포맷팅  
- **상세 설명:** TinyMCE (CDN, `process.env.TINYMCE_KEY`) 사용, textarea id `description`  
- **TinyMCE 이미지 업로드:** `POST /admin/uploads/tinymce` 사용, JSON `{ location: '/uploads/...' }` 반환

---

## 5. 상품 등록 처리 (POST /admin/products/add)

- **enctype:** `multipart/form-data`, Multer `upload.fields([main_image, thumbnail_image, sub_images(10), video_file])`  
- **저장 경로:** 이미지 있으면 `/uploads/products/` + 파일명, 없으면 null  
- **INSERT 컬럼:** category_id, name, provider, description, main_image, thumbnail_image, sub_images(JSON 배열), video_file, purchase_price, original_price, price, discount_rate, stock, status, slug 등  
- **성공 시:** `res.redirect('/admin/products')`  
- **예외:** 500 응답

---

## 6. 상품 수정 처리 (POST /admin/products/edit)

- **파라미터:** id, old_image, 그 외 폼 필드 동일  
- **이미지:** 새 파일 있으면 `/uploads/products/` + 새 파일명으로 교체, 없으면 `old_image` 유지  
- **UPDATE:** 위와 동일 컬럼 + WHERE id  
- **성공 시:** `/admin/products`로 리다이렉트  

**참고:** 기존 이미지 파일 삭제 로직은 없음 (디스크 정리는 별도 정책 필요).

---

## 7. 상품 상세 조회 (GET /admin/products/detail/:id)

- **동작:** products JOIN categories로 상품 1건 조회, 없으면 `/admin/products` 리다이렉트  
- **뷰 전달:** `product`, `title: '상품 상세'`

---

## 8. 이미지 업로드 API (POST /admin/products/product-image-upload)

- **용도:** TinyMCE 또는 드래그 업로드 시 상품 이미지 업로드  
- **enctype:** multipart, 필드 `file`  
- **응답:** `{ location: '/uploads/products/파일명' }` (성공), 400 (실패)

---

## 9. AI 추천 문구 생성 (POST /admin/products/generate-ai-recommendation)

- **파라미터:** name, category_name, provider (body)  
- **동작:** OpenAI API로 상품 추천 문구 생성  
- **응답:** `{ content: string }` (성공), 500 (실패)

---

## 10. 판매 상태 일괄 변경 (POST /admin/products/status/update)

- **파라미터:** product_ids (배열 또는 단일), status (ON/SOLD_OUT/OFF)  
- **동작:** `UPDATE products SET status = ? WHERE id IN (?)`  
- **성공 시:** `/admin/products` 리다이렉트

---

## 11. 상품 SEO 미리보기 (GET /admin/products/seo/view/:id)

- **동작:** 상품 상세 페이지와 동일한 SEO 메타/OG/JSON-LD를 렌더링  
- **뷰:** `admin/products/seo_preview.ejs` (layout: false)

---

## 12. 상품 삭제 (POST /admin/products/delete)

- **파라미터:** `id` (body)  
- **동작:** `DELETE FROM products WHERE id = ?` 후 `/admin/products`로 리다이렉트  
- **참고:** 연관된 order_items 등은 FK 정책에 따름 (product_id SET NULL 등)

---

*Last Updated: 2026-02-07*
