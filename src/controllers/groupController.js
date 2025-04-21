const admin = require('../config/firebase');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const { COLLECTION, ERROR_AUTH } = require('../constants/firebase');

const db = admin.firestore();
const storage = admin.storage();

/**
 * 그룹 생성 API
 * 그룹을 생성하고 생성자(owner)의 groups 배열에 그룹 ID를 추가합니다.
 * 사용자가 이미 그룹을 가지고 있으면(userGroups.length > 0) 500 에러를 반환합니다.
 */
exports.createGroup = async (req, res) => {
    try {
        const { name, description, owner } = req.body;

        // 필수 입력값 검증
        if (!name || !owner) {
            return res
                .status(400)
                .json({ error: '필수 입력값이 누락되었습니다.' });
        }

        // owner가 유효한 사용자인지 확인
        const userRef = admin
            .firestore()
            .collection(COLLECTION.USERS)
            .doc(owner);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res
                .status(404)
                .json({ error: '유효하지 않은 사용자입니다.' });
        }

        // 사용자 데이터에서 groups 배열 확인
        const userData = userDoc.data();
        const userGroups = userData.groups || [];

        // 추가된 부분: 사용자가 이미 그룹을 가지고 있는지 확인
        if (userGroups.length > 0) {
            return res.status(500).json({
                success: false,
                message: '이미 그룹을 가지고 있는 사용자입니다.',
                error: 'User already has groups',
            });
        }

        // 그룹 데이터 구성
        const groupData = {
            createdAt: admin.firestore.FieldValue.serverTimestamp(), // 그룹 생성 시각
            name: name, // 그룹 이름
            type: 'NORMAL', // 그룹 종류
            status: 'ACTIVE', // 그룹의 상태
            description: description, // 그룹 설명
            categories: [], // 그룹 상품 카테고리
            createdBy: owner, // 사용자 ID
            owner: owner, // 사용자 ID (소유자)
            members: [owner], // 소속된 유저 (기본적으로 소유자 포함)
            products: [], // 상품 컬렉션의 문서명을 키로 갖는 객체
            mainImagePath: '',
        };

        // Firestore에 그룹 추가 및 사용자 정보 업데이트를 트랜잭션으로 처리
        const db = admin.firestore();

        // 트랜잭션 시작
        const result = await db.runTransaction(async (transaction) => {
            // 1. 그룹 추가
            const groupRef = db.collection(COLLECTION.GROUPS).doc();
            transaction.set(groupRef, groupData);

            // 2. 사용자의 groups 배열에 그룹 ID 추가
            // (이 시점에서는 userGroups가 빈 배열임이 확인됨)
            userGroups.push(groupRef.id);

            // 사용자 문서 업데이트
            transaction.update(userRef, { groups: userGroups });

            // 그룹 ID와 그룹 데이터 반환
            return {
                id: groupRef.id,
                ...groupData,
            };
        });

        // 생성된 그룹 정보 반환
        res.status(201).json({
            success: true,
            message: '그룹이 성공적으로 생성되었습니다.',
            data: result,
        });
    } catch (error) {
        console.error('그룹 생성 중 오류 발생:', error);
        res.status(500).json({
            success: false,
            message: '그룹 생성 중 오류가 발생했습니다.',
            error: error.message,
        });
    }
};

exports.getGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        const groupDoc = await db.collection('groups').doc(groupId).get();

        if (!groupDoc.exists) {
            return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
        }

        res.status(200).json({
            success: true,
            data: {
                id: groupDoc.id,
                ...groupDoc.data(),
            },
        });
    } catch (error) {
        console.error('그룹 조회 중 오류 발생:', error);
        res.status(500).json({
            success: false,
            message: '그룹 조회 중 오류가 발생했습니다.',
            error: error.message,
        });
    }
};
