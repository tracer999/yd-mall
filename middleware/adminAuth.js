module.exports = (req, res, next) => {
    if (req.session.admin) { // Check if admin is in session
        req.user = req.session.admin; // For compatibility
        res.locals.admin = req.session.admin;
        res.locals.user = req.session.admin; // Explicitly set for layout usage
        return next();
    }
    res.redirect('/admin/login');
};
