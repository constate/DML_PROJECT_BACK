const express = require('express');
const { createGroup, getGroup } = require('../controllers/groupController');

const router = express.Router();

router.post('/group', createGroup);
router.get('/group/:groupId', getGroup);

module.exports = router;
