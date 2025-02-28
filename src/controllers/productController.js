const admin = require('../config/firebase');
const jwt = require('jsonwebtoken');

// Firestore 데이터베이스 참조 가져오기
const db = admin.firestore();
const storage = admin.storage();

exports.addProduct = async (req, res) => {
    try {
        const { pName, pDesc, pPrice, mainImgPath, detailImgPath } = req.body;
        const newDocRef = db.collection('DML_PRODUCT').doc();
        const productData = {
            pName,
            pDesc,
            pPrice,
            // mainImgPath,
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
