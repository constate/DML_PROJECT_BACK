const express = require('express');
const { getUserInfo } = require('../controllers/userController');
const authenticateToken = require('../middlewares/auth');

const router = express.Router();

router.get('/user', authenticateToken, getUserInfo);

module.exports = router;
