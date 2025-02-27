const express = require('express');
const cors = require('cors');
require('dotenv').config();
const routes = require('./routes');
const errorMiddleware = require('./middleware/error');

const app = express();

// 미들웨어
app.use(cors());
app.use(express.json());

// 라우트
app.use('/api', routes);

// 에러 핸들링 미들웨어
app.use(errorMiddleware);

module.exports = app;
