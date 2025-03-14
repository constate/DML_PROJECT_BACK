const express = require('express');
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// 모든 라우트에 토큰 인증 적용
router.use(authMiddleware.verifyToken);

// 주문 생성
router.post('/', orderController.createOrder);

// 주문 목록 조회
router.get('/', orderController.listOrders);

// 주문 상세 조회
router.get('/:orderId', orderController.getOrder);

// 주문 상태 업데이트
router.patch('/:orderId/status', orderController.updateOrderStatus);

// 주문 취소
router.post('/:orderId/cancel', orderController.cancelOrder);

// 결제 상태 업데이트
router.patch('/:orderId/payment', orderController.updatePaymentStatus);

module.exports = router;
