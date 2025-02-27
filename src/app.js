const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// 라우트 설정
app.use('/api', authRoutes);
app.use('/api', userRoutes);

// 테스트용 엔드포인트
app.get('/api/test', (req, res) => {
    res.json({ data: 'test' });
});

module.exports = app;
