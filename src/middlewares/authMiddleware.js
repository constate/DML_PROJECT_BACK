const admin = require('firebase-admin');

// 토큰 인증 미들웨어
exports.verifyToken = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split('Bearer ')[1];

        if (!token) {
            return res
                .status(401)
                .json({ success: false, message: '인증 토큰이 필요합니다.' });
        }

        // Firebase에서 토큰 검증
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;

        next();
    } catch (error) {
        console.error('토큰 인증 오류:', error);
        return res
            .status(401)
            .json({ success: false, message: '유효하지 않은 토큰입니다.' });
    }
};

// 역할 확인 미들웨어 (특정 역할만 접근 가능한 API용)
exports.checkRole = (roles) => {
    return async (req, res, next) => {
        try {
            const uid = req.user.uid;

            // 사용자 정보 가져오기
            const userDoc = await admin
                .firestore()
                .collection('USERS')
                .doc(uid)
                .get();

            if (!userDoc.exists) {
                return res
                    .status(404)
                    .json({
                        success: false,
                        message: '사용자를 찾을 수 없습니다.',
                    });
            }

            const userData = userDoc.data();

            // 역할 확인
            if (!roles.includes(userData.role)) {
                return res
                    .status(403)
                    .json({ success: false, message: '접근 권한이 없습니다.' });
            }

            next();
        } catch (error) {
            console.error('역할 확인 오류:', error);
            return res
                .status(500)
                .json({ success: false, message: '서버 오류가 발생했습니다.' });
        }
    };
};
