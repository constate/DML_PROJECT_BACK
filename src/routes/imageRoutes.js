const express = require('express');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { uploadProductImage } = require('../controllers/imageController');

const router = express.Router();

router.post('/image/upload', upload.single('image'), uploadProductImage);

module.exports = router;
