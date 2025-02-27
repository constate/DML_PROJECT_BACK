const authService = require('../services/authService');

exports.register = async (req, res, next) => {
    try {
        const { email, password, displayName } = req.body;
        const userData = await authService.createUser({
            email,
            password,
            displayName,
        });

        res.status(201).json({
            message: '회원가입 성공',
            user: userData.user,
            token: userData.token,
        });
    } catch (error) {
        next(error);
    }
};

exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const userData = await authService.loginUser({ email, password });

        res.json({
            message: '로그인 성공',
            user: userData.user,
            token: userData.token,
        });
    } catch (error) {
        next(error);
    }
};
