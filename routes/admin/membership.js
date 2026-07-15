const express = require('express');
const router = express.Router();
const c = require('../../controllers/admin/membershipController');

// 대시보드
router.get('/', c.getDashboard);

// 등급 관리
router.get('/grades', c.getGrades);
router.get('/grades/new', c.getGradeForm);
router.post('/grades', c.postGradeSave);
router.get('/grades/:id/edit', c.getGradeForm);
router.post('/grades/:id', c.postGradeSave);
router.post('/grades/:id/delete', c.postGradeDelete);

// 평가 정책 + 실행
router.get('/policy', c.getPolicy);
router.post('/policy', c.postPolicySave);
router.post('/policy/simulate', c.postSimulate);
router.post('/policy/evaluate', c.postEvaluate);

// 회원 등급 현황
router.get('/customers', c.getCustomers);
router.post('/customers/change-grade', c.postChangeGrade);
router.post('/customers/lock', c.postLock);

// 이력
router.get('/history', c.getHistory);

// 강등 예정자 (사전 안내)
router.get('/downgrade', c.getDowngradeCandidates);

module.exports = router;
