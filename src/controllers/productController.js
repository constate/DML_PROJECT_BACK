const admin = require('../config/firebase');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const { COLLECTION, ERROR_AUTH } = require('../constants/firebase');

const db = admin.firestore();
const storage = admin.storage();

// 상품 생성
exports.createProduct = async (req, res) => {
    try {
        const { groupId, name, categoryIds } = req.body;

        // 유효성 체크
        if (
            !groupId ||
            !name ||
            !Array.isArray(categoryIds) ||
            categoryIds.length === 0
        ) {
            return res
                .status(400)
                .json({ message: 'Missing or invalid fields.' });
        }

        const productId = firestore.collection(COLLECTION['PRODUCTS']).doc().id;
        const productData = {
            name,
            groupId,
            categoryIds,
            createdAt: new Date(),
        };

        await firestore.runTransaction(async (tx) => {
            const productRef = firestore
                .collection(COLLECTION['PRODUCTS'])
                .doc(productId);
            const groupProductRef = firestore
                .collection(COLLECTION['GROUPS'])
                .doc(groupId)
                .collection(COLLECTION['PRODUCTS'])
                .doc(productId);

            tx.set(productRef, productData);
            tx.set(groupProductRef, productData);
        });

        res.status(201).json({
            message: 'Product created with transaction',
            productId,
        });
    } catch (error) {
        console.error('Transaction error while creating product:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// 상품 상세 조회
exports.getProduct = async (req, res) => {
    try {
        const { productId } = req.params;

        // 상품 정보 조회
        const productDoc = await db.collection('PRODUCTS').doc(productId).get();

        if (!productDoc.exists) {
            return res
                .status(404)
                .json({ success: false, message: '상품을 찾을 수 없습니다.' });
        }

        const productData = productDoc.data();

        // 사용자-상품 정보 조회 (재고, 판매량 등 추가 정보)
        const userProductDoc = await db
            .collection('USER_PRODUCTS')
            .doc(productId)
            .get();
        let userProductData = {};

        if (userProductDoc.exists) {
            userProductData = userProductDoc.data();
        }

        return res.status(200).json({
            success: true,
            data: { ...productData, ...userProductData },
        });
    } catch (error) {
        console.error('상품 조회 오류:', error);
        return res
            .status(500)
            .json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
};

// 상품 목록 조회 (페이지네이션, 필터링 포함)
exports.listProducts = async (req, res) => {
    try {
        const { category, status, limit = 10, page = 1 } = req.query;

        let query = db.collection('PRODUCTS');

        // 필터링
        if (category) {
            query = query.where('category', '==', category);
        }

        if (status) {
            query = query.where('status', '==', status);
        } else {
            // 기본적으로 활성화된 상품만 조회
            query = query.where('status', '==', 'active');
        }

        // 정렬 (최신순)
        query = query.orderBy('createdAt', 'desc');

        // 페이지네이션
        const startAt = (page - 1) * limit;
        const snapshot = await query
            .limit(parseInt(limit))
            .offset(startAt)
            .get();

        const products = [];
        snapshot.forEach((doc) => {
            products.push({ id: doc.id, ...doc.data() });
        });

        // 전체 상품 수 조회 (페이지네이션 정보용)
        const countSnapshot = await query.count().get();
        const total = countSnapshot.data().count;

        return res.status(200).json({
            success: true,
            data: products,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('상품 목록 조회 오류:', error);
        return res
            .status(500)
            .json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
};

// 상품 수정
exports.updateProduct = async (req, res) => {
    try {
        const uid = req.user.uid;
        const { productId } = req.params;
        const updateData = req.body;

        // 업데이트할 수 없는 필드 제거
        delete updateData.productId;
        delete updateData.createdAt;
        delete updateData.createdBy;

        // 상품 확인
        const productDoc = await db.collection('PRODUCTS').doc(productId).get();

        if (!productDoc.exists) {
            return res
                .status(404)
                .json({ success: false, message: '상품을 찾을 수 없습니다.' });
        }

        const productData = productDoc.data();

        // 상품 소유자 확인
        if (productData.createdBy !== uid) {
            return res.status(403).json({
                success: false,
                message: '이 상품을 수정할 권한이 없습니다.',
            });
        }

        // 업데이트 시간 추가
        updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

        // 트랜잭션으로 상품 및 사용자-상품 정보 업데이트
        await db.runTransaction(async (transaction) => {
            // 상품 업데이트
            const productRef = db.collection('PRODUCTS').doc(productId);
            transaction.update(productRef, updateData);

            // 사용자-상품 정보 업데이트 (해당되는 필드만)
            if (updateData.basePrice || updateData.description) {
                const userProductRef = db
                    .collection('USER_PRODUCTS')
                    .doc(productId);
                const userProductUpdateData = {};

                if (updateData.basePrice) {
                    userProductUpdateData.customPrice = updateData.basePrice;
                }

                if (updateData.description) {
                    userProductUpdateData.customDescription =
                        updateData.description;
                }

                userProductUpdateData.lastEdited =
                    admin.firestore.FieldValue.serverTimestamp();

                transaction.update(userProductRef, userProductUpdateData);
            }
        });

        return res.status(200).json({
            success: true,
            message: '상품이 수정되었습니다.',
            data: { productId },
        });
    } catch (error) {
        console.error('상품 수정 오류:', error);
        return res
            .status(500)
            .json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
};

// 상품 삭제 (소프트 삭제 - 상태만 변경)
exports.deleteProduct = async (req, res) => {
    try {
        const uid = req.user.uid;
        const { productId } = req.params;

        // 상품 확인
        const productDoc = await db.collection('PRODUCTS').doc(productId).get();

        if (!productDoc.exists) {
            return res
                .status(404)
                .json({ success: false, message: '상품을 찾을 수 없습니다.' });
        }

        const productData = productDoc.data();

        // 상품 소유자 확인
        if (productData.createdBy !== uid) {
            return res.status(403).json({
                success: false,
                message: '이 상품을 삭제할 권한이 없습니다.',
            });
        }

        // 트랜잭션으로 상태 변경 및 사용자-상품 정보 업데이트
        await db.runTransaction(async (transaction) => {
            // 상품 상태 변경
            const productRef = db.collection('PRODUCTS').doc(productId);
            transaction.update(productRef, {
                status: 'deleted',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // 사용자-상품 가시성 변경
            const userProductRef = db
                .collection('USER_PRODUCTS')
                .doc(productId);
            transaction.update(userProductRef, {
                isVisible: false,
                isPromoted: false,
                lastEdited: admin.firestore.FieldValue.serverTimestamp(),
            });
        });

        return res.status(200).json({
            success: true,
            message: '상품이 삭제되었습니다.',
        });
    } catch (error) {
        console.error('상품 삭제 오류:', error);
        return res
            .status(500)
            .json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
};

// 상품 재고 업데이트
exports.updateInventory = async (req, res) => {
    try {
        const uid = req.user.uid;
        const { productId } = req.params;
        const { inventory } = req.body;

        if (inventory === undefined || isNaN(parseInt(inventory))) {
            return res.status(400).json({
                success: false,
                message: '유효한 재고 수량을 입력해주세요.',
            });
        }

        // 상품 확인
        const productDoc = await db.collection('PRODUCTS').doc(productId).get();

        if (!productDoc.exists) {
            return res
                .status(404)
                .json({ success: false, message: '상품을 찾을 수 없습니다.' });
        }

        const productData = productDoc.data();

        // 상품 소유자 확인
        if (productData.createdBy !== uid) {
            return res.status(403).json({
                success: false,
                message: '이 상품의 재고를 수정할 권한이 없습니다.',
            });
        }

        // 재고 업데이트
        await db
            .collection('USER_PRODUCTS')
            .doc(productId)
            .update({
                inventory: parseInt(inventory),
                lastEdited: admin.firestore.FieldValue.serverTimestamp(),
            });

        return res.status(200).json({
            success: true,
            message: '상품 재고가 업데이트되었습니다.',
            data: {
                productId,
                inventory: parseInt(inventory),
            },
        });
    } catch (error) {
        console.error('재고 업데이트 오류:', error);
        return res
            .status(500)
            .json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
};
