-- =============================================================================
-- 상품 필터(facet) Phase 2 — 필터 카탈로그 적재
-- 설계: docs/사이트개선/카테고리_브랜드_상품필터_설계.md §2, §3, §4, §10
--
-- 이 파일은 **제품의 일부**다(운영 데이터가 아니다).
-- 몰을 새로 찍어내도 필터 카탈로그는 동일해야 하므로 마이그레이션으로 배포에 싣는다.
-- 반대로 상품별 속성값(product_attribute)은 절대 여기서 넣지 않는다 — 관리자 화면에서만.
--   근거: CLAUDE.md 「사용자 전제 — 모든 기능은 관리자 화면에서 끝나야 한다」
--
-- 멱등(idempotent)하다. 여러 번 돌려도 결과가 같다.
--
-- 적용: mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < 20260722_facet_phase2_catalog.sql
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. category_facet 에 카테고리별 오버라이드 슬롯 추가
--    가격 구간 프리셋처럼 "같은 필터인데 카테고리마다 값이 다른" 경우를 담는다.
--    (식품 ~1만/1~3만 … vs 디지털·가전 ~10만/10~50만 … — §3.3)
-- -----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS `_facet_add_col`;
DELIMITER //
CREATE PROCEDURE `_facet_add_col`()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'category_facet'
                     AND COLUMN_NAME = 'meta_json') THEN
        ALTER TABLE `category_facet`
            ADD COLUMN `meta_json` json DEFAULT NULL
            COMMENT '이 카테고리에서만 적용할 오버라이드(가격 구간 프리셋 등). facet_definition.meta_json 을 덮어쓴다'
            AFTER `display_order`;
    END IF;
END //
DELIMITER ;
CALL `_facet_add_col`();
DROP PROCEDURE `_facet_add_col`;


-- -----------------------------------------------------------------------------
-- 1. Tier 0 — 공통 필터 (전 카테고리 자동 적용, category_facet 행 불필요)
--    value_source
--      COLUMN   products 컬럼을 직접 본다
--      CATEGORY 카테고리 트리에서 값을 만든다
--      DERIVED  다른 테이블/결과셋에서 값을 계산한다(브랜드 목록, 쿠폰 여부 등)
-- -----------------------------------------------------------------------------
INSERT INTO facet_definition
    (facet_code, facet_name, tier, ui_type, value_source, source_key, data_type, unit, is_multi, is_active, display_order, meta_json)
VALUES
-- 기본 펼침(is_primary_default)은 아래 UPDATE 에서 한 번에 정한다.
('CATEGORY','카테고리',0,'CHIP','CATEGORY',NULL,'STRING',NULL,1,1,10,NULL),
('PRICE','가격',0,'RANGE','COLUMN','price','RANGE','원',1,1,20,
    JSON_OBJECT('preset', JSON_ARRAY(
        JSON_OBJECT('code','P1','name','3만원 이하','min',0,'max',30000),
        JSON_OBJECT('code','P2','name','3~5만원','min',30000,'max',50000),
        JSON_OBJECT('code','P3','name','5~10만원','min',50000,'max',100000),
        JSON_OBJECT('code','P4','name','10~20만원','min',100000,'max',200000),
        JSON_OBJECT('code','P5','name','20만원 이상','min',200000,'max',NULL)))),
('BRAND','브랜드',0,'CHECKBOX','DERIVED','brand_category_id','STRING',NULL,1,1,30,
    JSON_OBJECT('searchable',true,'collapseAfter',8)),
('DISCOUNT','할인율',0,'CHECKBOX','COLUMN','discount_rate','NUMBER','%',0,1,40,
    JSON_OBJECT('preset', JSON_ARRAY(
        JSON_OBJECT('code','D10','name','10% 이상','min',10),
        JSON_OBJECT('code','D20','name','20% 이상','min',20),
        JSON_OBJECT('code','D30','name','30% 이상','min',30),
        JSON_OBJECT('code','D50','name','50% 이상','min',50)))),
('BADGE','상품 태그',0,'CHIP','COLUMN','product_badge','STRING',NULL,1,1,50,NULL),
('STOCK','재고',0,'TOGGLE','COLUMN','stock','BOOL',NULL,0,1,60,NULL),
('BENEFIT','혜택',0,'CHECKBOX','DERIVED',NULL,'STRING',NULL,1,1,70,NULL),
('DELIVERY','배송',0,'CHECKBOX','DERIVED',NULL,'STRING',NULL,1,1,80,NULL),
('CHANNEL','판매 구분',0,'CHIP','COLUMN','distribution_badge','STRING',NULL,1,1,90,NULL),
-- 리뷰가 0건이라 정의만 두고 끈다(§11 R-7). 리뷰가 쌓이면 is_active=1 로 켠다.
('RATING','평점',0,'CHIP','DERIVED',NULL,'NUMBER',NULL,0,0,100,NULL)
ON DUPLICATE KEY UPDATE
    facet_name = VALUES(facet_name), tier = VALUES(tier), ui_type = VALUES(ui_type),
    value_source = VALUES(value_source), source_key = VALUES(source_key),
    data_type = VALUES(data_type), unit = VALUES(unit), is_multi = VALUES(is_multi),
    is_active = VALUES(is_active), display_order = VALUES(display_order), meta_json = VALUES(meta_json);


-- Tier 0 중 기본으로 펼쳐 둘 것 — 가격·브랜드·할인·카테고리 넷만.
-- 나머지(상품 태그·재고·혜택·배송·판매 구분)는 접어 두고 "더보기" 로 연다.
UPDATE facet_definition SET is_primary_default = 1 WHERE facet_code IN ('CATEGORY','PRICE','BRAND','DISCOUNT');
UPDATE facet_definition SET is_primary_default = 0 WHERE facet_code NOT IN ('CATEGORY','PRICE','BRAND','DISCOUNT');


-- Tier 0 의 닫힌 값들
INSERT INTO facet_value_definition (facet_id, value_code, display_name, display_order, meta_json) VALUES
((SELECT id FROM facet_definition WHERE facet_code='BADGE'),'BEST','베스트',10,NULL),
((SELECT id FROM facet_definition WHERE facet_code='BADGE'),'NEW','신상품',20,NULL),
((SELECT id FROM facet_definition WHERE facet_code='BADGE'),'RECOMMEND','추천',30,NULL),
((SELECT id FROM facet_definition WHERE facet_code='BADGE'),'DEADLINE_SALE','마감임박',40,NULL),
((SELECT id FROM facet_definition WHERE facet_code='STOCK'),'IN_STOCK','품절 제외',10,NULL),
((SELECT id FROM facet_definition WHERE facet_code='BENEFIT'),'COUPON','쿠폰 적용',10,NULL),
((SELECT id FROM facet_definition WHERE facet_code='BENEFIT'),'DEAL','특가·딜 진행중',20,NULL),
((SELECT id FROM facet_definition WHERE facet_code='BENEFIT'),'OUTLET','아웃렛',30,NULL),
((SELECT id FROM facet_definition WHERE facet_code='DELIVERY'),'FREE','무료배송',10,NULL),
((SELECT id FROM facet_definition WHERE facet_code='DELIVERY'),'TODAY','오늘출발',20,NULL),
((SELECT id FROM facet_definition WHERE facet_code='CHANNEL'),'ONLINE_ONLY','온라인 전용',10,NULL),
((SELECT id FROM facet_definition WHERE facet_code='CHANNEL'),'OFFLINE_ONLY','오프라인 전용',20,NULL),
((SELECT id FROM facet_definition WHERE facet_code='RATING'),'R45','4.5 이상',10,JSON_OBJECT('min',4.5)),
((SELECT id FROM facet_definition WHERE facet_code='RATING'),'R40','4.0 이상',20,JSON_OBJECT('min',4.0)),
((SELECT id FROM facet_definition WHERE facet_code='RATING'),'R30','3.0 이상',30,JSON_OBJECT('min',3.0))
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), display_order = VALUES(display_order), meta_json = VALUES(meta_json);


-- -----------------------------------------------------------------------------
-- 2. Tier 1 — 그룹 필터 (여러 카테고리가 공유)
--    사이즈는 하나의 필터가 아니라 **체계별로 다른 필터**다(§3.2).
--    같은 화면에 XS~XL 과 220~290mm 를 섞어 놓으면 아무 의미가 없기 때문이다.
-- -----------------------------------------------------------------------------
INSERT INTO facet_definition
    (facet_code, facet_name, tier, ui_type, value_source, source_key, data_type, unit, is_multi, is_active, display_order, meta_json)
VALUES
('COLOR','색상',1,'COLOR_SWATCH','ATTRIBUTE','COLOR','STRING',NULL,1,1,110,NULL),
('MATERIAL','소재',1,'CHECKBOX','ATTRIBUTE','MATERIAL','STRING',NULL,1,1,120,NULL),
('GENDER','성별',1,'CHIP','ATTRIBUTE','GENDER','STRING',NULL,1,1,130,NULL),
('SIZE_ALPHA','사이즈',1,'SIZE_GRID','ATTRIBUTE','SIZE_ALPHA','STRING',NULL,1,1,140,NULL),
('SIZE_KR_W','여성 호수',1,'SIZE_GRID','ATTRIBUTE','SIZE_KR_W','STRING',NULL,1,1,141,NULL),
('SIZE_WAIST','허리',1,'SIZE_GRID','ATTRIBUTE','SIZE_WAIST','NUMBER','인치',1,1,142,NULL),
('SIZE_SHOE_MM','발 길이',1,'SIZE_GRID','ATTRIBUTE','SIZE_SHOE_MM','NUMBER','mm',1,1,143,NULL),
('SIZE_KIDS_CM','유아동 사이즈',1,'SIZE_GRID','ATTRIBUTE','SIZE_KIDS_CM','NUMBER','cm',1,1,144,NULL),
('SIZE_BED','침구 규격',1,'CHIP','ATTRIBUTE','SIZE_BED','STRING',NULL,1,1,145,NULL),
('SIZE_BAG','가방 크기',1,'CHIP','ATTRIBUTE','SIZE_BAG','STRING',NULL,1,1,146,NULL),
('CAPACITY','용량',1,'CHECKBOX','ATTRIBUTE','CAPACITY','RANGE','ml',1,1,150,NULL),
('ORIGIN','원산지',1,'CHECKBOX','ATTRIBUTE','ORIGIN','STRING',NULL,1,1,160,NULL),
('KC_CERT','KC 인증',1,'TOGGLE','ATTRIBUTE','KC_CERT','BOOL',NULL,0,1,170,NULL),
('SET_QTY','구성 수량',1,'CHIP','ATTRIBUTE','SET_QTY','STRING',NULL,1,1,180,NULL),
('SEASON','계절',1,'CHIP','ATTRIBUTE','SEASON','STRING',NULL,1,1,190,NULL)
ON DUPLICATE KEY UPDATE
    facet_name = VALUES(facet_name), tier = VALUES(tier), ui_type = VALUES(ui_type),
    value_source = VALUES(value_source), source_key = VALUES(source_key),
    data_type = VALUES(data_type), unit = VALUES(unit), is_multi = VALUES(is_multi),
    is_active = VALUES(is_active), display_order = VALUES(display_order), meta_json = VALUES(meta_json);


-- 색상 표준 20색 (§3.1). aliases 는 원본 표기를 접기 위한 사전이다.
--   "딥그린" → GREEN, "로즈골드" → GOLD, "피치핑크" → PINK
INSERT INTO facet_value_definition (facet_id, value_code, display_name, display_order, meta_json) VALUES
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'BLACK','블랙',10,JSON_OBJECT('hex','#111111','aliases',JSON_ARRAY('블랙','black','차콜','먹색','흑','검정','검은'))),
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'WHITE','화이트',20,JSON_OBJECT('hex','#FFFFFF','aliases',JSON_ARRAY('화이트','white','아이보리','오프화이트','크림','흰'))),
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'GRAY','그레이',30,JSON_OBJECT('hex','#9AA0A6','aliases',JSON_ARRAY('그레이','gray','grey','멜란지','회색'))),
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'RED','레드',40,JSON_OBJECT('hex','#E03131','aliases',JSON_ARRAY('레드','red','버건디','와인','빨강','빨간'))),
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'PINK','핑크',50,JSON_OBJECT('hex','#F06595','aliases',JSON_ARRAY('핑크','pink','로즈','피치핑크','코랄핑크'))),
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'ORANGE','오렌지',60,JSON_OBJECT('hex','#FD7E14','aliases',JSON_ARRAY('오렌지','orange','코랄','주황'))),
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'YELLOW','옐로우',70,JSON_OBJECT('hex','#FCC419','aliases',JSON_ARRAY('옐로우','yellow','머스타드','노랑','노란'))),
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'GREEN','그린',80,JSON_OBJECT('hex','#37B24D','aliases',JSON_ARRAY('그린','green','올리브','딥그린','초록'))),
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'MINT','민트',85,JSON_OBJECT('hex','#63E6BE','aliases',JSON_ARRAY('민트','mint','애플민트'))),
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'KHAKI','카키',88,JSON_OBJECT('hex','#7A6C4F','aliases',JSON_ARRAY('카키','khaki','아미'))),
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'BLUE','블루',90,JSON_OBJECT('hex','#1C7ED6','aliases',JSON_ARRAY('블루','blue','스카이블루','하늘색','파랑','파란'))),
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'NAVY','네이비',100,JSON_OBJECT('hex','#1B2A4A','aliases',JSON_ARRAY('네이비','navy','곤색','다크블루'))),
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'DENIM','데님',105,JSON_OBJECT('hex','#4C6EA5','aliases',JSON_ARRAY('데님','denim','인디고','청'))),
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'PURPLE','퍼플',110,JSON_OBJECT('hex','#7048E8','aliases',JSON_ARRAY('퍼플','purple','바이올렛','라벤더','보라'))),
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'BROWN','브라운',120,JSON_OBJECT('hex','#8B5E34','aliases',JSON_ARRAY('브라운','brown','카멜','초코','갈색'))),
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'BEIGE','베이지',130,JSON_OBJECT('hex','#E3D5C0','aliases',JSON_ARRAY('베이지','beige','샌드','크림베이지'))),
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'GOLD','골드',140,JSON_OBJECT('hex','#C9A227','aliases',JSON_ARRAY('골드','gold','로즈골드','금색'))),
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'SILVER','실버',150,JSON_OBJECT('hex','#C0C4C9','aliases',JSON_ARRAY('실버','silver','은색','메탈'))),
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'MULTI','멀티·패턴',160,JSON_OBJECT('hex',NULL,'aliases',JSON_ARRAY('멀티','투톤','랜덤','패턴','혼합'))),
((SELECT id FROM facet_definition WHERE facet_code='COLOR'),'CLEAR','투명',170,JSON_OBJECT('hex',NULL,'aliases',JSON_ARRAY('투명','클리어','clear')))
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), display_order = VALUES(display_order), meta_json = VALUES(meta_json);


-- 사이즈 체계별 값 (§3.2)
INSERT INTO facet_value_definition (facet_id, value_code, display_name, display_order, meta_json) VALUES
((SELECT id FROM facet_definition WHERE facet_code='SIZE_ALPHA'),'XS','XS',10,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_ALPHA'),'S','S',20,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_ALPHA'),'M','M',30,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_ALPHA'),'L','L',40,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_ALPHA'),'XL','XL',50,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_ALPHA'),'2XL','2XL',60,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_ALPHA'),'3XL','3XL',70,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_ALPHA'),'FREE','FREE',80,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_KR_W'),'44','44',10,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_KR_W'),'55','55',20,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_KR_W'),'66','66',30,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_KR_W'),'77','77',40,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_KR_W'),'88','88',50,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_KR_W'),'99','99',60,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_WAIST'),'26','26',10,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_WAIST'),'28','28',20,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_WAIST'),'30','30',30,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_WAIST'),'32','32',40,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_WAIST'),'34','34',50,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_WAIST'),'36','36',60,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_WAIST'),'38','38',70,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_SHOE_MM'),'220','220',10,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_SHOE_MM'),'225','225',20,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_SHOE_MM'),'230','230',30,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_SHOE_MM'),'235','235',40,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_SHOE_MM'),'240','240',50,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_SHOE_MM'),'245','245',60,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_SHOE_MM'),'250','250',70,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_SHOE_MM'),'255','255',80,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_SHOE_MM'),'260','260',90,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_SHOE_MM'),'265','265',100,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_SHOE_MM'),'270','270',110,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_SHOE_MM'),'275','275',120,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_SHOE_MM'),'280','280',130,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_SHOE_MM'),'285','285',140,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_SHOE_MM'),'290','290',150,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_KIDS_CM'),'NB','신생아',5,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_KIDS_CM'),'80','80',10,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_KIDS_CM'),'90','90',20,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_KIDS_CM'),'100','100',30,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_KIDS_CM'),'110','110',40,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_KIDS_CM'),'120','120',50,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_KIDS_CM'),'130','130',60,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_KIDS_CM'),'140','140',70,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_KIDS_CM'),'150','150',80,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_BED'),'SS','슈퍼싱글(SS)',10,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_BED'),'S','싱글(S)',20,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_BED'),'Q','퀸(Q)',30,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_BED'),'K','킹(K)',40,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_BED'),'LK','라지킹(LK)',50,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_BAG'),'MINI','미니',10,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_BAG'),'SMALL','스몰',20,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_BAG'),'MEDIUM','미디엄',30,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SIZE_BAG'),'LARGE','라지',40,NULL)
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), display_order = VALUES(display_order);


-- 나머지 Tier 1 값
INSERT INTO facet_value_definition (facet_id, value_code, display_name, display_order, meta_json) VALUES
((SELECT id FROM facet_definition WHERE facet_code='GENDER'),'WOMEN','여성',10,NULL),
((SELECT id FROM facet_definition WHERE facet_code='GENDER'),'MEN','남성',20,NULL),
((SELECT id FROM facet_definition WHERE facet_code='GENDER'),'UNISEX','공용',30,NULL),
((SELECT id FROM facet_definition WHERE facet_code='GENDER'),'KIDS','아동',40,NULL),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'COTTON','면',10,JSON_OBJECT('aliases',JSON_ARRAY('면','코튼','cotton','순면'))),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'LINEN','린넨',20,JSON_OBJECT('aliases',JSON_ARRAY('린넨','마','linen'))),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'DENIM','데님',30,JSON_OBJECT('aliases',JSON_ARRAY('데님','denim','청'))),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'KNIT','니트',40,JSON_OBJECT('aliases',JSON_ARRAY('니트','knit','아크릴'))),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'WOOL','울',50,JSON_OBJECT('aliases',JSON_ARRAY('울','wool','모','캐시미어'))),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'LEATHER','가죽',60,JSON_OBJECT('aliases',JSON_ARRAY('가죽','천연가죽','소가죽','leather'))),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'FAUX_LEATHER','인조가죽',65,JSON_OBJECT('aliases',JSON_ARRAY('인조가죽','합성피혁','pu'))),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'POLY','폴리',70,JSON_OBJECT('aliases',JSON_ARRAY('폴리','폴리에스터','poly'))),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'NYLON','나일론',80,JSON_OBJECT('aliases',JSON_ARRAY('나일론','nylon'))),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'SILK','실크',90,JSON_OBJECT('aliases',JSON_ARRAY('실크','silk','견'))),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'CANVAS','캔버스',100,JSON_OBJECT('aliases',JSON_ARRAY('캔버스','canvas'))),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'WOOD','원목',110,JSON_OBJECT('aliases',JSON_ARRAY('원목','우드','wood','자작나무'))),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'MDF','MDF·PB',120,JSON_OBJECT('aliases',JSON_ARRAY('mdf','pb','파티클보드'))),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'STEEL','철제',130,JSON_OBJECT('aliases',JSON_ARRAY('철제','스틸','steel','금속'))),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'STAINLESS','스테인리스',135,JSON_OBJECT('aliases',JSON_ARRAY('스테인리스','스텐','stainless'))),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'GLASS','유리',140,JSON_OBJECT('aliases',JSON_ARRAY('유리','글라스','glass'))),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'FABRIC','패브릭',150,JSON_OBJECT('aliases',JSON_ARRAY('패브릭','fabric','천'))),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'PLASTIC','플라스틱',160,JSON_OBJECT('aliases',JSON_ARRAY('플라스틱','abs','pp','plastic'))),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'SILICONE','실리콘',170,JSON_OBJECT('aliases',JSON_ARRAY('실리콘','silicone'))),
((SELECT id FROM facet_definition WHERE facet_code='MATERIAL'),'CERAMIC','도자기',180,JSON_OBJECT('aliases',JSON_ARRAY('도자기','세라믹','ceramic'))),
((SELECT id FROM facet_definition WHERE facet_code='ORIGIN'),'KR','국산',10,NULL),
((SELECT id FROM facet_definition WHERE facet_code='ORIGIN'),'IMPORTED','수입',20,NULL),
((SELECT id FROM facet_definition WHERE facet_code='KC_CERT'),'Y','KC 인증',10,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SET_QTY'),'Q1','1개',10,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SET_QTY'),'Q2_5','2~5개',20,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SET_QTY'),'Q6_10','6~10개',30,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SET_QTY'),'Q10P','10개 이상',40,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SEASON'),'SPRING_FALL','봄·가을',10,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SEASON'),'SUMMER','여름',20,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SEASON'),'WINTER','겨울',30,NULL),
((SELECT id FROM facet_definition WHERE facet_code='SEASON'),'ALL','사계절',40,NULL),
((SELECT id FROM facet_definition WHERE facet_code='CAPACITY'),'C30','30ml 이하',10,JSON_OBJECT('min',0,'max',30)),
((SELECT id FROM facet_definition WHERE facet_code='CAPACITY'),'C50','30~50ml',20,JSON_OBJECT('min',30,'max',50)),
((SELECT id FROM facet_definition WHERE facet_code='CAPACITY'),'C100','50~100ml',30,JSON_OBJECT('min',50,'max',100)),
((SELECT id FROM facet_definition WHERE facet_code='CAPACITY'),'C200','100~200ml',40,JSON_OBJECT('min',100,'max',200)),
((SELECT id FROM facet_definition WHERE facet_code='CAPACITY'),'C200P','200ml 이상',50,JSON_OBJECT('min',200,'max',NULL))
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), display_order = VALUES(display_order), meta_json = VALUES(meta_json);
