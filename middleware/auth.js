// Authentication and Role-based Access Middleware
// Used across customer, seller, and admin routes

function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        if (req.session.user.status === 'blocked') {
            return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
        }
        if (req.session.user.status === 'pending') {
            return res.status(403).json({ error: 'Your account is pending approval.' });
        }
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Please log in.' });
}

function requireRole(role) {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ error: 'Unauthorized: Please log in.' });
        }
        if (req.session.user.status !== 'active') {
            return res.status(403).json({ error: 'Account is not active.' });
        }
        if (req.session.user.role !== role) {
            return res.status(403).json({ error: `Forbidden: Requires ${role} role.` });
        }
        next();
    };
}

module.exports = {
    isAuthenticated,
    requireRole
};
