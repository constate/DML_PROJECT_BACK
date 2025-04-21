const express = require('express');
const { addProduct } = require('../controllers/productController');
const productController = require('../controllers/productController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// 모든 라우트에 토큰 인증 적용
router.use(authMiddleware.verifyToken);

// 상품 생성
router.post('/:groupId/product', productController.createProduct);

// 상품 목록 조회
router.get('/:groupId/product', productController.listProducts);

// 상품 상세 조회
router.get('/product/:productId', productController.getProduct);

// 상품 수정
router.put('/product/:productId', productController.updateProduct);

// 상품 삭제
router.delete('/product/:productId', productController.deleteProduct);

// 상품 재고 업데이트
router.patch(
    '/product/:productId/inventory',
    productController.updateInventory,
);

module.exports = router;
