module.exports = {
    ensureAuthenticated: (req, res, next) => {
        if (req.isAuthenticated()) {
            return next();
        }
        // 로그인 후 원래 가려던 페이지로 돌아오기 위해 세션에 저장 (선택 사항)
        req.session.returnTo = req.originalUrl;
        res.redirect('/auth/login');
    }
};