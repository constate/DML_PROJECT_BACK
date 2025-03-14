const admin = require('../config/firebase');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const db = admin.firestore();
const storage = admin.storage();

// 기존 상품 생성 API
exports.addProduct = async (req, res) => {
    try {
        const { pName, pDesc, pPrice, mainImgRef, mainImgPath, detailImgPath } =
            req.body;
        const newDocRef = db.collection('DML_PRODUCT').doc();
        const mainImgRefDoc = db.collection('images').doc(mainImgRef); // Firestore DocumentReference 생성

        const productData = {
            pName,
            pDesc,
            pPrice,
            mainImgRef: mainImgRefDoc,
            // detailImgPath,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        await newDocRef.set(productData);

        res.status(201).json({
            message: '상품 추가 성공',
        });
    } catch (error) {
        console.error('상품 추가 오류:', error);
        res.status(400).json({
            message: '상품 추가 실패',
            error: error.message,
        });
    }
};

// 상품 생성
exports.createProduct = async (req, res) => {
    try {
        const uid = req.user.uid;
        const {
            name,
            basePrice,
            description,
            category,
            tags,
            thumbnail,
            images,
            status,
            mainImgRef, // 이미지 문서 ID 추가
            mainImgPath, // 이미지 경로 추가
            detailImgPath, // 상세 이미지 경로 추가
        } = req.body;

        // 필수 입력값 확인
        if (!name || !basePrice || !category) {
            return res.status(400).json({
                success: false,
                message: '필수 입력값이 누락되었습니다.',
            });
        }

        // 상품 ID 생성
        const productId = uuidv4();
        const currentTime = admin.firestore.FieldValue.serverTimestamp();

        // 이미지 문서 참조 생성 (mainImgRef가 제공된 경우)
        let mainImageReference = null;
        if (mainImgRef) {
            mainImageReference = db.collection('images').doc(mainImgRef);
        }

        // 상품 데이터 준비
        const productData = {
            productId,
            name,
            basePrice,
            description: description || '',
            category,
            tags: tags || [],
            thumbnail: thumbnail || '',
            images: images || [],
            status: status || 'active',
            createdAt: currentTime,
            updatedAt: currentTime,
            createdBy: uid,
        };

        // 이미지 관련 필드 추가
        if (mainImageReference) {
            productData.mainImgRef = mainImageReference; // Firestore DocumentReference 추가
        }

        if (mainImgPath) {
            productData.mainImgPath = mainImgPath;
        }

        if (detailImgPath) {
            productData.detailImgPath = detailImgPath;
        }

        // 트랜잭션으로 상품 생성 및 사용자-상품 연결
        await db.runTransaction(async (transaction) => {
            // 상품 생성
            const productRef = db.collection('PRODUCTS').doc(productId);
            transaction.set(productRef, productData);

            // 사용자-상품 연결
            const userProductRef = db
                .collection('USER_PRODUCTS')
                .doc(productId);
            transaction.set(userProductRef, {
                userId: uid,
                productId,
                customPrice: basePrice,
                customDescription: description || '',
                inventory: 0,
                soldCount: 0,
                isVisible: true,
                isPromoted: false,
                lastEdited: currentTime,
            });
        });

        return res.status(201).json({
            success: true,
            message: '상품이 생성되었습니다.',
            data: { productId },
        });
    } catch (error) {
        console.error('상품 생성 오류:', error);
        return res
            .status(500)
            .json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
};

// 상품 생성
exports.createProduct = async (req, res) => {
    try {
        const uid = req.user.uid;
        const {
            name,
            basePrice,
            description,
            category,
            tags,
            thumbnail,
            images,
            status,
        } = req.body;

        // 필수 입력값 확인
        if (!name || !basePrice || !category) {
            return res.status(400).json({
                success: false,
                message: '필수 입력값이 누락되었습니다.',
            });
        }

        // 상품 ID 생성
        const productId = uuidv4();
        const currentTime = admin.firestore.FieldValue.serverTimestamp();

        // 상품 데이터 준비
        const productData = {
            productId,
            name,
            basePrice,
            description: description || '',
            category,
            tags: tags || [],
            thumbnail: thumbnail || '',
            images: images || [],
            status: status || 'active',
            createdAt: currentTime,
            updatedAt: currentTime,
            createdBy: uid,
        };

        // 트랜잭션으로 상품 생성 및 사용자-상품 연결
        await db.runTransaction(async (transaction) => {
            // 상품 생성
            const productRef = db.collection('PRODUCTS').doc(productId);
            transaction.set(productRef, productData);

            // 사용자-상품 연결
            const userProductRef = db
                .collection('USER_PRODUCTS')
                .doc(productId);
            transaction.set(userProductRef, {
                userId: uid,
                productId,
                customPrice: basePrice,
                customDescription: description || '',
                inventory: 0,
                soldCount: 0,
                isVisible: true,
                isPromoted: false,
                lastEdited: currentTime,
            });
        });

        return res.status(201).json({
            success: true,
            message: '상품이 생성되었습니다.',
            data: { productId },
        });
    } catch (error) {
        console.error('상품 생성 오류:', error);
        return res
            .status(500)
            .json({ success: false, message: '서버 오류가 발생했습니다.' });
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
