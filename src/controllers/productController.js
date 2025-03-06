const admin = require('../config/firebase');
const jwt = require('jsonwebtoken');

const db = admin.firestore();
const storage = admin.storage();

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

exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params; // 삭제할 상품의 ID
        const productRef = db.collection('DML_PRODUCT').doc(id);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
            return res.status(404).json({
                message: '상품을 찾을 수 없습니다.',
            });
        }

        await productRef.delete();

        res.status(200).json({
            message: '상품 삭제 성공',
        });
    } catch (error) {
        console.error('상품 삭제 오류:', error);
        res.status(400).json({
            message: '상품 삭제 실패',
            error: error.message,
        });
    }
};
