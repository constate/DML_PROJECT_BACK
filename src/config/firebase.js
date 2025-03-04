const admin = require('firebase-admin');
const dotenv = require('dotenv');
dotenv.config();

admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
    storageBucket: 'gs://dml-project-5acf1.firebasestorage.app',
});

module.exports = admin;
