const express = require('express');
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// 인증이 필요한 라우트를 등록하는 도우미 함수
const secureRoute = (method, path, handler) => {
    return router[method](path, authMiddleware.verifyToken, handler);
};

// 인증이 필요한 모든 라우트에 도우미 함수 사용
secureRoute('post', '/', orderController.createOrder);
secureRoute('get', '/', orderController.listOrders);
secureRoute('get', '/:orderId', orderController.getOrder);
secureRoute('patch', '/:orderId/status', orderController.updateOrderStatus);
secureRoute('post', '/:orderId/cancel', orderController.cancelOrder);
secureRoute('patch', '/:orderId/payment', orderController.updatePaymentStatus);

module.exports = router;
