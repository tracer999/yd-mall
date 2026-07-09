const express = require('express');
const router = express.Router();
const policyController = require('../../controllers/admin/policyController');

// All routes here are prefixed with /admin/policies

router.get('/', policyController.getPolicies); // List versions
router.get('/create', policyController.createPolicyForm); // Create form
router.post('/create', policyController.createPolicy); // Create action
router.post('/:id/active', policyController.activatePolicy); // Toggle active action
router.get('/:id', policyController.getPolicyDetail); // View detail
router.get('/:id/edit', policyController.editPolicyForm); // Edit form
router.post('/:id/edit', policyController.updatePolicy); // Edit action

module.exports = router;
