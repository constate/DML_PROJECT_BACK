const express = require('express');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { uploadImage } = require('../controllers/imageController');

const router = express.Router();

router.post('/image/upload', upload.single('image'), uploadImage);

module.exports = router;
