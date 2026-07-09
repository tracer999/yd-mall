const express = require('express');
const router = express.Router();
const operatorController = require('../../controllers/admin/operatorController');

// Middleware to ensure only super_admin can access
const requireSuperAdmin = (req, res, next) => {
    if (req.session.admin && (req.session.admin.role === 'super_admin' || req.session.admin.role === 'admin')) {
        return next();
    }
    res.status(403).send('Access Denied');
};

router.use(requireSuperAdmin);

router.get('/', operatorController.getList);
router.get('/form', operatorController.getForm);
router.post('/add', operatorController.postAdd);
router.post('/edit', operatorController.postEdit);
router.post('/delete', operatorController.deleteOperator);

module.exports = router;
