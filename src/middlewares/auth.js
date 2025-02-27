const jwt = require('jsonwebtoken');
const admin = require('../config/firebase');

const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ message: '인증 토큰이 필요합니다' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userRecord = await admin.auth().getUser(decoded.uid);

        req.user = userRecord;
        next();
    } catch (error) {
        console.error('토큰 인증 오류:', error);
        return res.status(403).json({ message: '유효하지 않은 토큰입니다' });
    }
};

module.exports = authenticateToken;
