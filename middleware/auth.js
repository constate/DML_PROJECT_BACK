const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');

module.exports = async (req, res, next) => {
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
        res.status(403).json({ message: '유효하지 않은 토큰입니다' });
    }
};
