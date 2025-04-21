const admin = require('../config/firebase');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const { COLLECTION, ERROR_AUTH } = require('../constants/firebase');

const db = admin.firestore();
const storage = admin.storage();

// 상품 생성
exports.createProduct = async (req, res) => {
    try {
        const { groupId } = req.params;
        console.log('groupId', groupId);
        const { name, description, price, status, createdBy } = req.body;

        // 필수 입력값 검증
        if (!name || !price) {
            return res.status(400).json({
                success: false,
                message: '필수 입력값이 누락되었습니다.',
                error: 'Missing required fields',
            });
        }

        // 그룹이 존재하는지 확인
        const groupRef = admin
            .firestore()
            .collection(COLLECTION.GROUPS)
            .doc(groupId);
        const groupDoc = await groupRef.get();

        if (!groupDoc.exists) {
            return res.status(404).json({
                success: false,
                message: '존재하지 않는 그룹입니다.',
                error: 'Group not found',
            });
        }

        // 사용자가 그룹의 멤버인지 확인
        const groupData = groupDoc.data();
        if (!groupData.members.includes(createdBy)) {
            return res.status(403).json({
                success: false,
                message: '그룹에 속한 멤버만 제품을 추가할 수 있습니다.',
                error: 'User not a member of the group',
            });
        }

        // 제품 데이터 구성
        const productData = {
            name,
            description: description || '',
            price,
            imageUrl: '',
            type: 'DEFAULT',
            status: status || 'ACTIVE',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy,
        };

        // 제품 추가 및 그룹 데이터 업데이트를 트랜잭션으로 처리
        const db = admin.firestore();

        const result = await db.runTransaction(async (transaction) => {
            // 1. products 하위 컬렉션에 제품 추가
            const productRef = groupRef.collection('products').doc();
            transaction.set(productRef, productData);

            // 2. 그룹 문서의 products 배열에 제품 ID 추가 (선택적)
            // 이는 제품 ID의 빠른 참조를 위한 것이며, 필요에 따라 생략 가능
            const productIds = groupData.products || [];
            productIds.push(productRef.id);

            transaction.update(groupRef, {
                products: productIds,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // 제품 ID와 데이터 반환
            return {
                id: productRef.id,
                ...productData,
            };
        });

        // 생성된 제품 정보 반환
        res.status(201).json({
            success: true,
            message: '제품이 성공적으로 추가되었습니다.',
            data: result,
        });
    } catch (error) {
        console.error('제품 추가 중 오류 발생:', error);
        res.status(500).json({
            success: false,
            message: '제품 추가 중 오류가 발생했습니다.',
            error: error.message,
        });
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
