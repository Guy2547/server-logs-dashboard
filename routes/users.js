const express = require('express');
const router  = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

router.get('/all-users', verifyToken, userController.getAllUsers);
router.get('/roles', verifyToken, userController.getRoles);
router.post('/add', verifyToken, verifyAdmin, userController.addUser);
router.put('/update-user/:userId', verifyToken, verifyAdmin, userController.updateUser);
router.put('/update-status/:userId', verifyToken, verifyAdmin, userController.updateStatus);
router.post('/verify-identity', userController.verifyIdentity);
router.post('/reset-password', userController.resetPassword);

module.exports = router;