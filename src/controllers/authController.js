const admin = require('../config/firebase');
const jwt = require('jsonwebtoken');
const UAParser = require('ua-parser-js');

const { COLLECTION } = require('../constants/firebase');

// Firestore 데이터베이스 참조 가져오기
const db = admin.firestore();
const storage = admin.storage();

exports.signup = async (req, res) => {
    try {
        const { username, email, password, phone } = req.body;

        // 1. Firebase Authentication에 사용자 생성
        const userRecord = await admin
            .auth()
            .createUser({ email, password, displayName: username });
        console.log(userRecord);

        // IP 주소 및 User-Agent 정보 가져오기
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const parser = new UAParser(req.headers['user-agent']);
        const deviceInfo = parser.getResult();
        const plainDeviceInfo = JSON.parse(JSON.stringify(deviceInfo));

        // 2. Firestore에 사용자 데이터 저장
        const userData = {
            uid: userRecord.uid,
            role: 'SELLER',
            email: userRecord.email,
            displayName: username,
            phone,
            createdIpAddress: ip,
            createdDeviceInfo: plainDeviceInfo,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        };

        // DML_USERS 컬렉션에 사용자 문서 생성 (문서 ID를 uid로 설정)
        await db
            .collection(COLLECTION['USERS'])
            .doc(userRecord.uid)
            .set(userData);

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
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Firebase Authentication에서 사용자 이메일로 조회
        const userRecord = await admin.auth().getUserByEmail(email);

        // 2. Firestore에서 사용자 데이터 조회
        const userDoc = await db
            .collection(COLLECTION['USERS'])
            .doc(userRecord.uid)
            .get();

        // 3. 사용자 데이터가 없으면 새로 생성
        if (!userDoc.exists) {
            await db.collection(COLLECTION['USERS']).doc(userRecord.uid).set({
                uid: userRecord.uid,
                email: userRecord.email,
                displayName: userRecord.displayName,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastLogin: admin.firestore.FieldValue.serverTimestamp(),
            });
        } else {
            // 4. 마지막 로그인 시간 업데이트
            await db
                .collection(COLLECTION['USERS'])
                .doc(userRecord.uid)
                .update({
                    lastLogin: admin.firestore.FieldValue.serverTimestamp(),
                });
        }

        // 사용자 데이터 가져오기
        const userData = userDoc.exists ? userDoc.data() : null;

        // JWT 토큰 생성
        const token = jwt.sign(
            { uid: userRecord.uid },
            process.env.JWT_SECRET,
            { expiresIn: '1h' },
        );

        // const accessToken = await admin
        //     .auth()
        //     .createCustomToken(userRecord.uid);

        // Refresh Token은 일반적으로 Firebase에서 직접 제공하지 않으므로, DB 또는 자체 로직으로 관리 필요
        const refreshToken = `dummy-refresh-token-${userRecord.uid}`; // 여기에 DB 연동 로직 추가 가능

        // **Refresh Token을 HttpOnly Cookie에 저장**
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true, // JavaScript에서 접근 불가 → XSS 방지
            secure: false, // HTTPS에서만 전송 (운영 환경에서는 true로 변경)
            sameSite: 'Lax', // CSRF 방지
            path: '/', // 쿠키가 모든 경로에서 전송되도록 설정,
            maxAge: 60 * 60 * 24 * 30 * 1000, // 30일
        });

        res.json({
            message: '로그인 성공',
            user: {
                uid: userRecord.uid,
                email: userRecord.email,
                displayName: userRecord.displayName,
                // Firestore에서 가져온 추가 데이터
                ...userData,
            },
            token,
        });
    } catch (error) {
        console.error('로그인 오류:', error);
        res.status(401).json({ message: '로그인 실패', error: error.message });
    }
};

// 사용자 정보 조회 메서드 (옵션)
exports.getUserProfile = async (req, res) => {
    try {
        const { uid } = req.user; // 미들웨어에서 전달된 인증된 사용자 정보

        // Firestore에서 사용자 데이터 조회
        const userDoc = await db.collection(COLLECTION['USERS']).doc(uid).get();

        if (!userDoc.exists) {
            return res
                .status(404)
                .json({ message: '사용자를 찾을 수 없습니다' });
        }

        res.json({
            message: '사용자 정보 조회 성공',
            user: userDoc.data(),
        });
    } catch (error) {
        console.error('사용자 정보 조회 오류:', error);
        res.status(500).json({
            message: '사용자 정보 조회 실패',
            error: error.message,
        });
    }
};

// 로그아웃 메서드 (옵션 - 클라이언트 측에서 토큰을 삭제하는 것만으로도 로그아웃 처리 가능)
exports.logout = (req, res) => {
    // 서버에서 세션을 관리하는 경우에만 필요
    res.json({ message: '로그아웃 성공' });
};

// 모든 유저 가져오기
exports.getAllUsers = async (req, res) => {
    try {
        const snapshot = await db.collection(COLLECTION['USERS']).get(); // users 컬렉션의 모든 문서 가져오기
        console.log(snapshot);
        snapshot.forEach((doc) => {
            console.log(`문서 ID: ${doc.id}, 데이터:`, doc.data());
        });

        res.json({
            message: '사용자 정보 조회 성공',
            data: snapshot,
        });
    } catch (error) {
        console.error('사용자 정보 조회 오류:', error);
        res.status(500).json({
            message: '사용자 정보 조회 실패',
            error: error.message,
        });
    }
};
