exports.getUserInfo = (req, res) => {
    res.json({
        user: {
            uid: req.user.uid,
            email: req.user.email,
            displayName: req.user.displayName,
            phoneNumber: req.user.phoneNumber,
            photoURL: req.user.photoURL,
        },
    });
};
