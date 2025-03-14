const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

const db = admin.firestore();

// 주문 생성
exports.createOrder = async (req, res) => {
    try {
        const uid = req.user.uid;
        const { sellerId, products, paymentMethod } = req.body;

        // 필수 입력값 확인
        if (!sellerId || !products || !products.length || !paymentMethod) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: '필수 입력값이 누락되었습니다.',
                });
        }

        // 판매자 확인
        const sellerDoc = await db.collection('USERS').doc(sellerId).get();
        if (!sellerDoc.exists) {
            return res
                .status(404)
                .json({
                    success: false,
                    message: '판매자를 찾을 수 없습니다.',
                });
        }

        // 주문 ID와 주문번호 생성
        const orderId = uuidv4();
        const orderNumber = `ORD-${Date.now()
            .toString()
            .slice(-8)}-${Math.floor(Math.random() * 1000)}`;
        const currentTime = admin.firestore.FieldValue.serverTimestamp();

        // 주문 상품 검증 및 정보 수집
        const orderItems = [];
        let totalAmount = 0;

        // 모든 상품 정보 가져오기 (병렬 처리)
        const productPromises = products.map(async (product) => {
            const { productId, quantity, options } = product;

            if (!productId || !quantity || quantity <= 0) {
                throw new Error(`유효하지 않은 상품 정보: ${productId}`);
            }

            // 상품 정보 가져오기
            const productDoc = await db
                .collection('PRODUCTS')
                .doc(productId)
                .get();
            if (!productDoc.exists) {
                throw new Error(`존재하지 않는 상품: ${productId}`);
            }

            const productData = productDoc.data();

            // 판매자 확인
            if (productData.createdBy !== sellerId) {
                throw new Error(`판매자가 일치하지 않는 상품: ${productId}`);
            }

            // 상품 상태 확인
            if (productData.status !== 'active') {
                throw new Error(`비활성화된 상품: ${productId}`);
            }

            // 사용자-상품 정보 (가격, 재고 등) 가져오기
            const userProductDoc = await db
                .collection('USER_PRODUCTS')
                .doc(productId)
                .get();

            if (!userProductDoc.exists) {
                throw new Error(`사용자-상품 정보가 없음: ${productId}`);
            }

            const userProductData = userProductDoc.data();

            // 재고 확인
            if (userProductData.inventory < quantity) {
                throw new Error(
                    `재고 부족: ${productId}, 요청: ${quantity}, 가능: ${userProductData.inventory}`,
                );
            }

            // 가격 정보
            const price = userProductData.customPrice || productData.basePrice;

            // 총액 계산
            const itemTotal = price * quantity;
            totalAmount += itemTotal;

            // 주문 항목 추가
            return {
                productId,
                name: productData.name,
                price,
                quantity,
                options: options || null,
            };
        });

        // 모든 상품 정보 처리 대기
        const resolvedItems = await Promise.all(productPromises);
        orderItems.push(...resolvedItems);

        // 트랜잭션으로 주문 및 관련 정보 생성
        await db.runTransaction(async (transaction) => {
            // 주문 데이터 생성
            const orderRef = db.collection('ORDERS').doc(orderId);
            transaction.set(orderRef, {
                orderId,
                orderNumber,
                userId: uid,
                sellerId,
                status: 'pending',
                totalAmount,
                paymentMethod,
                paymentStatus: 'pending',
                createdAt: currentTime,
                updatedAt: currentTime,
            });

            // 주문 항목 생성
            orderItems.forEach((item) => {
                const orderItemRef = db.collection('ORDER_ITEMS').doc();
                transaction.set(orderItemRef, {
                    orderId,
                    ...item,
                });

                // 재고 감소
                const userProductRef = db
                    .collection('USER_PRODUCTS')
                    .doc(item.productId);
                transaction.update(userProductRef, {
                    inventory: admin.firestore.FieldValue.increment(
                        -item.quantity,
                    ),
                    soldCount: admin.firestore.FieldValue.increment(
                        item.quantity,
                    ),
                    lastEdited: currentTime,
                });
            });

            // 주문 히스토리 생성
            const historyRef = db.collection('ORDER_HISTORY').doc();
            transaction.set(historyRef, {
                historyId: uuidv4(),
                orderId,
                timestamp: currentTime,
                status: 'pending',
                message: '주문이 생성되었습니다.',
                updatedBy: uid,
            });

            // 사용자-주문 연결
            const userOrderRef = db.collection('USER_ORDERS').doc(orderId);
            transaction.set(userOrderRef, {
                userId: uid,
                orderId,
                orderNumber,
                sellerId,
                createdAt: currentTime,
                status: 'pending',
                totalAmount,
            });
        });

        return res.status(201).json({
            success: true,
            message: '주문이 성공적으로 생성되었습니다.',
            data: {
                orderId,
                orderNumber,
                totalAmount,
            },
        });
    } catch (error) {
        console.error('주문 생성 오류:', error);
        return res.status(500).json({
            success: false,
            message: error.message || '서버 오류가 발생했습니다.',
        });
    }
};

// 주문 조회
exports.getOrder = async (req, res) => {
    try {
        const uid = req.user.uid;
        const { orderId } = req.params;

        // 주문 정보 조회
        const orderDoc = await db.collection('ORDERS').doc(orderId).get();

        if (!orderDoc.exists) {
            return res
                .status(404)
                .json({ success: false, message: '주문을 찾을 수 없습니다.' });
        }

        const orderData = orderDoc.data();

        // 권한 확인 (구매자 또는 판매자만 조회 가능)
        if (orderData.userId !== uid && orderData.sellerId !== uid) {
            return res
                .status(403)
                .json({
                    success: false,
                    message: '이 주문을 조회할 권한이 없습니다.',
                });
        }

        // 주문 항목 조회
        const orderItemsSnapshot = await db
            .collection('ORDER_ITEMS')
            .where('orderId', '==', orderId)
            .get();

        const orderItems = [];
        orderItemsSnapshot.forEach((doc) => {
            orderItems.push(doc.data());
        });

        // 주문 히스토리 조회
        const historySnapshot = await db
            .collection('ORDER_HISTORY')
            .where('orderId', '==', orderId)
            .orderBy('timestamp', 'asc')
            .get();

        const orderHistory = [];
        historySnapshot.forEach((doc) => {
            orderHistory.push(doc.data());
        });

        return res.status(200).json({
            success: true,
            data: {
                order: orderData,
                items: orderItems,
                history: orderHistory,
            },
        });
    } catch (error) {
        console.error('주문 조회 오류:', error);
        return res
            .status(500)
            .json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
};

// 주문 목록 조회
exports.listOrders = async (req, res) => {
    try {
        const uid = req.user.uid;
        const { status, role = 'buyer', limit = 10, page = 1 } = req.query;

        let query = db.collection('ORDERS');

        // 구매자/판매자 구분
        if (role === 'buyer') {
            query = query.where('userId', '==', uid);
        } else if (role === 'seller') {
            query = query.where('sellerId', '==', uid);
        }

        // 상태 필터링
        if (status) {
            query = query.where('status', '==', status);
        }

        // 정렬 (최신순)
        query = query.orderBy('createdAt', 'desc');

        // 페이지네이션
        const startAt = (page - 1) * limit;
        const snapshot = await query
            .limit(parseInt(limit))
            .offset(startAt)
            .get();

        const orders = [];
        snapshot.forEach((doc) => {
            orders.push(doc.data());
        });

        // 전체 주문 수 조회
        const countSnapshot = await query.count().get();
        const total = countSnapshot.data().count;

        return res.status(200).json({
            success: true,
            data: orders,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('주문 목록 조회 오류:', error);
        return res
            .status(500)
            .json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
};

// 주문 상태 업데이트
exports.updateOrderStatus = async (req, res) => {
    try {
        const uid = req.user.uid;
        const { orderId } = req.params;
        const { status, message } = req.body;

        if (!status) {
            return res
                .status(400)
                .json({ success: false, message: '변경할 상태가 필요합니다.' });
        }

        // 유효한 상태값 확인
        const validStatuses = [
            'pending',
            'processing',
            'shipped',
            'delivered',
            'cancelled',
            'refunded',
        ];
        if (!validStatuses.includes(status)) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: '유효하지 않은 상태값입니다.',
                });
        }

        // 주문 정보 조회
        const orderDoc = await db.collection('ORDERS').doc(orderId).get();

        if (!orderDoc.exists) {
            return res
                .status(404)
                .json({ success: false, message: '주문을 찾을 수 없습니다.' });
        }

        const orderData = orderDoc.data();

        // 권한 확인 (판매자만 상태 변경 가능, 단 취소는 구매자도 가능)
        const isSeller = orderData.sellerId === uid;
        const isBuyer = orderData.userId === uid;

        if (!isSeller && !(isBuyer && status === 'cancelled')) {
            return res
                .status(403)
                .json({
                    success: false,
                    message: '이 주문의 상태를 변경할 권한이 없습니다.',
                });
        }

        // 현재 상태에서 변경 가능한지 확인
        const currentStatus = orderData.status;

        // 이미 완료된 주문은 상태 변경 불가
        if (['delivered', 'cancelled', 'refunded'].includes(currentStatus)) {
            return res.status(400).json({
                success: false,
                message: `이미 ${currentStatus} 상태인 주문은 변경할 수 없습니다.`,
            });
        }

        const currentTime = admin.firestore.FieldValue.serverTimestamp();

        // 트랜잭션으로 주문 상태 및 히스토리 업데이트
        await db.runTransaction(async (transaction) => {
            // 주문 상태 업데이트
            const orderRef = db.collection('ORDERS').doc(orderId);
            transaction.update(orderRef, {
                status,
                updatedAt: currentTime,
            });

            // 사용자-주문 상태 업데이트
            const userOrderRef = db.collection('USER_ORDERS').doc(orderId);
            transaction.update(userOrderRef, {
                status,
            });

            // 주문 히스토리 추가
            const historyRef = db.collection('ORDER_HISTORY').doc();
            transaction.set(historyRef, {
                historyId: uuidv4(),
                orderId,
                timestamp: currentTime,
                status,
                message: message || `주문 상태가 ${status}로 변경되었습니다.`,
                updatedBy: uid,
            });

            // 취소된 주문의 경우 재고 복구
            if (status === 'cancelled') {
                const orderItemsSnapshot = await db
                    .collection('ORDER_ITEMS')
                    .where('orderId', '==', orderId)
                    .get();

                const orderItems = [];
                orderItemsSnapshot.forEach((doc) => {
                    orderItems.push(doc.data());
                });

                // 각 상품의 재고 복구
                for (const item of orderItems) {
                    const userProductRef = db
                        .collection('USER_PRODUCTS')
                        .doc(item.productId);
                    transaction.update(userProductRef, {
                        inventory: admin.firestore.FieldValue.increment(
                            item.quantity,
                        ),
                        soldCount: admin.firestore.FieldValue.increment(
                            -item.quantity,
                        ),
                        lastEdited: currentTime,
                    });
                }
            }
        });

        return res.status(200).json({
            success: true,
            message: `주문 상태가 ${status}로 변경되었습니다.`,
            data: {
                orderId,
                status,
            },
        });
    } catch (error) {
        console.error('주문 상태 업데이트 오류:', error);
        return res
            .status(500)
            .json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
};

// 주문 취소
exports.cancelOrder = async (req, res) => {
    try {
        const uid = req.user.uid;
        const { orderId } = req.params;
        const { reason } = req.body;

        // 주문 정보 조회
        const orderDoc = await db.collection('ORDERS').doc(orderId).get();

        if (!orderDoc.exists) {
            return res
                .status(404)
                .json({ success: false, message: '주문을 찾을 수 없습니다.' });
        }

        const orderData = orderDoc.data();

        // 권한 확인 (구매자 또는 판매자만 취소 가능)
        if (orderData.userId !== uid && orderData.sellerId !== uid) {
            return res
                .status(403)
                .json({
                    success: false,
                    message: '이 주문을 취소할 권한이 없습니다.',
                });
        }

        // 현재 상태 확인
        if (orderData.status === 'cancelled') {
            return res
                .status(400)
                .json({ success: false, message: '이미 취소된 주문입니다.' });
        }

        if (['delivered', 'refunded'].includes(orderData.status)) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: '이 상태의 주문은 취소할 수 없습니다.',
                });
        }

        const currentTime = admin.firestore.FieldValue.serverTimestamp();
        const cancelMessage = reason || '주문이 취소되었습니다.';

        // 트랜잭션으로 주문 취소 처리
        await db.runTransaction(async (transaction) => {
            // 주문 상태 업데이트
            const orderRef = db.collection('ORDERS').doc(orderId);
            transaction.update(orderRef, {
                status: 'cancelled',
                updatedAt: currentTime,
            });

            // 사용자-주문 상태 업데이트
            const userOrderRef = db.collection('USER_ORDERS').doc(orderId);
            transaction.update(userOrderRef, {
                status: 'cancelled',
            });

            // 주문 히스토리 추가
            const historyRef = db.collection('ORDER_HISTORY').doc();
            transaction.set(historyRef, {
                historyId: uuidv4(),
                orderId,
                timestamp: currentTime,
                status: 'cancelled',
                message: cancelMessage,
                updatedBy: uid,
            });

            // 재고 복구
            const orderItemsSnapshot = await db
                .collection('ORDER_ITEMS')
                .where('orderId', '==', orderId)
                .get();

            const orderItems = [];
            orderItemsSnapshot.forEach((doc) => {
                orderItems.push(doc.data());
            });

            // 각 상품의 재고 복구
            for (const item of orderItems) {
                const userProductRef = db
                    .collection('USER_PRODUCTS')
                    .doc(item.productId);
                transaction.update(userProductRef, {
                    inventory: admin.firestore.FieldValue.increment(
                        item.quantity,
                    ),
                    soldCount: admin.firestore.FieldValue.increment(
                        -item.quantity,
                    ),
                    lastEdited: currentTime,
                });
            }
        });

        return res.status(200).json({
            success: true,
            message: '주문이 성공적으로 취소되었습니다.',
            data: {
                orderId,
                status: 'cancelled',
            },
        });
    } catch (error) {
        console.error('주문 취소 오류:', error);
        return res
            .status(500)
            .json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
};

// 결제 상태 업데이트
exports.updatePaymentStatus = async (req, res) => {
    try {
        const uid = req.user.uid;
        const { orderId } = req.params;
        const { paymentStatus, paymentDetails } = req.body;

        if (!paymentStatus) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: '변경할 결제 상태가 필요합니다.',
                });
        }

        // 유효한 결제 상태값 확인
        const validPaymentStatuses = [
            'pending',
            'completed',
            'failed',
            'refunded',
        ];
        if (!validPaymentStatuses.includes(paymentStatus)) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: '유효하지 않은 결제 상태값입니다.',
                });
        }

        // 주문 정보 조회
        const orderDoc = await db.collection('ORDERS').doc(orderId).get();

        if (!orderDoc.exists) {
            return res
                .status(404)
                .json({ success: false, message: '주문을 찾을 수 없습니다.' });
        }

        const orderData = orderDoc.data();

        // 권한 확인 (판매자 또는 시스템 관리자만 변경 가능)
        if (orderData.sellerId !== uid) {
            // 여기서 추가로 관리자 권한 확인 로직을 넣을 수 있음
            return res
                .status(403)
                .json({
                    success: false,
                    message: '이 주문의 결제 상태를 변경할 권한이 없습니다.',
                });
        }

        const currentTime = admin.firestore.FieldValue.serverTimestamp();

        // 트랜잭션으로 결제 상태 및 히스토리 업데이트
        await db.runTransaction(async (transaction) => {
            // 결제 상태 업데이트
            const orderRef = db.collection('ORDERS').doc(orderId);
            transaction.update(orderRef, {
                paymentStatus,
                updatedAt: currentTime,
            });

            // 주문 히스토리 추가
            const historyRef = db.collection('ORDER_HISTORY').doc();
            transaction.set(historyRef, {
                historyId: uuidv4(),
                orderId,
                timestamp: currentTime,
                status: orderData.status,
                message: `결제 상태가 ${paymentStatus}로 변경되었습니다.`,
                updatedBy: uid,
            });
        });

        return res.status(200).json({
            success: true,
            message: `결제 상태가 ${paymentStatus}로 변경되었습니다.`,
            data: {
                orderId,
                paymentStatus,
            },
        });
    } catch (error) {
        console.error('결제 상태 업데이트 오류:', error);
        return res
            .status(500)
            .json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
};
