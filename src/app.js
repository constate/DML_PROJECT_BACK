const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const imageRoutes = require('./routes/imageRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// 정적 파일 제공을 위한 미들웨어 설정
app.use(express.static(path.join(__dirname, 'public')));

// 테스트용 엔드포인트
app.get('/api/test', (req, res) => {
    res.json({ data: 'test' });
});

// API 라우트 설정
app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', productRoutes);
app.use('/api', imageRoutes);

module.exports = app;
