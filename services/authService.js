const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
const firebaseConfig = require('../config/firebase');

// Firebase Admin SDK 초기화는 config/firebase.js에서 처리

exports.createUser = async ({ email, password, displayName }) => {
    try {
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

        return {
            user: {
                uid: userRecord.uid,
                email: userRecord.email,
                displayName: userRecord.displayName,
            },
            token,
        };
    } catch (error) {
        throw new Error(`회원가입 실패: ${error.message}`);
    }
};

exports.loginUser = async ({ email, password }) => {
    // Firebase 인증 로직 구현
    // ...
};
