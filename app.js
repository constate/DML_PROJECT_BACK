// 필요한 패키지 설치:
// npm install express firebase-admin jsonwebtoken cors dotenv

// .env 파일 생성 (프로젝트 루트에):
// FIREBASE_PROJECT_ID=your-firebase-project-id
// FIREBASE_PRIVATE_KEY=your-firebase-private-key
// FIREBASE_CLIENT_EMAIL=your-firebase-client-email
// JWT_SECRET=your-jwt-secret

// app.js
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Firebase Admin SDK 초기화
admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
});

const app = express();
app.use(cors());
app.use(express.json());

// JWT 토큰 검증 미들웨어
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ message: '인증 토큰이 필요합니다' });
        }

        // JWT 토큰 검증
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Firebase에서 해당 유저 정보 확인
        const userRecord = await admin.auth().getUser(decoded.uid);

        // 요청 객체에 사용자 정보 추가
        req.user = userRecord;
        next();
    } catch (error) {
        console.error('토큰 인증 오류:', error);
        return res.status(403).json({ message: '유효하지 않은 토큰입니다' });
    }
};

// 회원가입 API
app.post('/api/signup', async (req, res) => {
    try {
        const { email, password, displayName } = req.body;

        // Firebase에 새 사용자 생성
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName,
        });

        // JWT 토큰 생성
        const token = jwt.sign(
            { uid: userRecord.uid },
            process.env.JWT_SECRET,
            { expiresIn: '1h' },
        );

        res.status(201).json({
            message: '회원가입 성공',
            user: {
                uid: userRecord.uid,
                email: userRecord.email,
                displayName: userRecord.displayName,
            },
            token,
        });
    } catch (error) {
        console.error('회원가입 오류:', error);
        res.status(400).json({
            message: '회원가입 실패',
            error: error.message,
        });
    }
});

// 로그인 API
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Firebase Client SDK를 통해 인증해야 합니다
        // 여기서는 admin SDK로 사용자 조회만 수행
        const userRecord = await admin.auth().getUserByEmail(email);

        // 실제 환경에서는 Firebase Authentication REST API를 사용하여 이메일/비밀번호 인증을 처리해야 합니다
        // 간단한 데모를 위해 사용자가 존재하면 토큰을 발급합니다

        // JWT 토큰 생성
        const token = jwt.sign(
            { uid: userRecord.uid },
            process.env.JWT_SECRET,
            { expiresIn: '1h' },
        );

        res.json({
            message: '로그인 성공',
            user: {
                uid: userRecord.uid,
                email: userRecord.email,
                displayName: userRecord.displayName,
            },
            token,
        });
    } catch (error) {
        console.error('로그인 오류:', error);
        res.status(401).json({ message: '로그인 실패', error: error.message });
    }
});

// 보호된 API 예시
app.get('/api/protected', authenticateToken, (req, res) => {
    res.json({
        message: '인증된 요청 성공',
        user: {
            uid: req.user.uid,
            email: req.user.email,
            displayName: req.user.displayName,
        },
    });
});

// 사용자 정보 조회 API
app.get('/api/user', authenticateToken, (req, res) => {
    res.json({
        user: {
            uid: req.user.uid,
            email: req.user.email,
            displayName: req.user.displayName,
            phoneNumber: req.user.phoneNumber,
            photoURL: req.user.photoURL,
        },
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다`);
});
