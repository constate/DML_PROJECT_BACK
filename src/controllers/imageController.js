const admin = require('../config/firebase');
const jwt = require('jsonwebtoken');
const path = require('path');
const os = require('os');
const fs = require('fs');

const db = admin.firestore();
const storage = admin.storage();
const bucket = storage.bucket();

exports.uploadImage = async (req, res) => {
    try {
        // 요청에 파일이 없는 경우 에러 반환
        if (!req.file) {
            return res.status(400).json({
                message: '업로드할 이미지가 없습니다.',
            });
        }

        // 파일 정보 가져오기
        const file = req.file;

        // 파일 이름 생성 (중복 방지를 위해 타임스탬프 추가)
        const fileName = `${Date.now()}_${file.originalname}`;

        // 저장 경로 설정 (예: images 폴더 아래)
        const filePath = `images/product/${fileName}`;

        // 임시 파일 경로 생성
        const tempFilePath = path.join(os.tmpdir(), fileName);

        // 업로드된 파일을 임시 파일로 저장
        fs.writeFileSync(tempFilePath, file.buffer);

        // Firebase Storage에 파일 업로드
        await bucket.upload(tempFilePath, {
            destination: filePath,
            metadata: {
                contentType: file.mimetype,
            },
        });

        // 임시 파일 삭제
        fs.unlinkSync(tempFilePath);

        // 업로드된 파일의 공개 URL 가져오기
        const fileUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

        // 옵션: Firestore에 파일 정보 저장하기
        await db.collection('images').add({
            fileName: fileName,
            filePath: filePath,
            fileUrl: fileUrl,
            contentType: file.mimetype,
            uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 성공 응답 반환
        res.status(200).json({
            message: '이미지 업로드 성공',
            fileUrl: fileUrl,
            filePath: filePath,
        });
    } catch (error) {
        console.error('이미지 업로드 오류:', error);
        res.status(400).json({
            message: '이미지 업로드 실패',
            error: error.message,
        });
    }
};
