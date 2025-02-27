const admin = require('../config/firebase');
const jwt = require('jsonwebtoken');

exports.signup = async (req, res) => {
    try {
        const { email, password, displayName } = req.body;
        const userRecord = await admin
            .auth()
            .createUser({ email, password, displayName });

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
        const userRecord = await admin.auth().getUserByEmail(email);

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
};
