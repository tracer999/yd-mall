#!/usr/bin/env node
/**
 * 서비스 관리 도메인 테이블 신설 (멱등)
 *
 * 실행:
 *   node scripts/migrate_service_management_tables.js          # 생성 + 기본 등급 시드
 *   node scripts/migrate_service_management_tables.js --drop   # 삭제(개발용)
 *
 * 몰 빌더 서비스 제공자(super_admin)가 다루는 두 도메인:
 *
 *   service_plan       판매 등급(플랜) — 등급별 기능 entitlement 정의.
 *                      예: 네이버 스토어 연동 / 도매(도매꾹·온채널) 연동 / AI 자동생성 / 서브몰 생성 가능 개수.
 *                      ⚠️ 스토어프론트 '메뉴' 제어(feature_menu)가 아니라 '기능 자격(entitlement)' 이다.
 *   delivery_customer  납품 고객(테넌트) 레지스트리 — 우리가 납품한 고객 명부 + 배정 등급.
 *                      고객이 만든 개별 몰은 추적하지 않는다(우리 관심사가 아님). 현재는 레지스트리만,
 *                      서브몰 개수 '강제'(몰 생성 차단)는 추후.
 */
require('../config/env');
const pool = require('../config/db');

const DROP = process.argv.includes('--drop');

const CREATE_SERVICE_PLAN = `
CREATE TABLE IF NOT EXISTS service_plan (
  id BIGINT NOT NULL AUTO_INCREMENT,
  plan_code VARCHAR(50) NOT NULL COMMENT '등급 코드(고정 식별자)',
  name VARCHAR(100) NOT NULL COMMENT '등급명',
  description VARCHAR(255) DEFAULT NULL,
  max_submalls INT NOT NULL DEFAULT 1 COMMENT '서브몰 생성 가능 개수 (0=불가)',
  feat_naver_store TINYINT(1) NOT NULL DEFAULT 0 COMMENT '네이버 스토어 연동 여부',
  feat_wholesale TINYINT(1) NOT NULL DEFAULT 0 COMMENT '도매(도매꾹·온채널) 연동 여부',
  feat_ai_generation TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'AI 자동생성 가능 여부',
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_service_plan_code (plan_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='판매 등급(플랜)별 기능 entitlement';`;

const CREATE_DELIVERY_CUSTOMER = `
CREATE TABLE IF NOT EXISTS delivery_customer (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL COMMENT '납품 고객(업체)명',
  contact_name VARCHAR(100) DEFAULT NULL,
  contact_email VARCHAR(255) DEFAULT NULL,
  contact_phone VARCHAR(50) DEFAULT NULL,
  plan_id BIGINT DEFAULT NULL COMMENT '배정 판매 등급(service_plan.id)',
  delivered_at DATE DEFAULT NULL COMMENT '납품일',
  memo VARCHAR(500) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_delivery_customer_plan (plan_id),
  CONSTRAINT fk_delivery_customer_plan FOREIGN KEY (plan_id) REFERENCES service_plan (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='납품 고객(테넌트) 레지스트리';`;

// 기본 등급 시드 (테이블이 비어 있을 때만)
const SEED_PLANS = [
    { plan_code: 'BASIC', name: '베이직', description: '기본 등급', max_submalls: 1, naver: 0, wholesale: 0, ai: 0, order: 10 },
    { plan_code: 'STANDARD', name: '스탠다드', description: '도매 연동 포함', max_submalls: 3, naver: 0, wholesale: 1, ai: 1, order: 20 },
    { plan_code: 'PREMIUM', name: '프리미엄', description: '전체 기능', max_submalls: 10, naver: 1, wholesale: 1, ai: 1, order: 30 },
];

(async () => {
    const conn = await pool.getConnection();
    try {
        if (DROP) {
            await conn.query('DROP TABLE IF EXISTS delivery_customer');
            await conn.query('DROP TABLE IF EXISTS service_plan');
            console.log('🗑  delivery_customer, service_plan 삭제 완료');
            return;
        }

        await conn.query(CREATE_SERVICE_PLAN);
        console.log('  ✔ service_plan 준비');
        await conn.query(CREATE_DELIVERY_CUSTOMER);
        console.log('  ✔ delivery_customer 준비');

        const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM service_plan');
        if (Number(n) === 0) {
            for (const p of SEED_PLANS) {
                await conn.query(
                    `INSERT INTO service_plan (plan_code, name, description, max_submalls, feat_naver_store, feat_wholesale, feat_ai_generation, sort_order)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [p.plan_code, p.name, p.description, p.max_submalls, p.naver, p.wholesale, p.ai, p.order]);
            }
            console.log(`  + 기본 등급 ${SEED_PLANS.length}종 시드`);
        } else {
            console.log(`  · service_plan 에 이미 ${n}개 등급 존재 — 시드 건너뜀`);
        }

        console.log('\n✅ 완료');
    } catch (err) {
        console.error('\n❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
})();
