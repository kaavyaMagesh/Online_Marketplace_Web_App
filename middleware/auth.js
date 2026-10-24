// Authentication and Role-based Access Middleware placeholder
// Will be expanded with login checks and role verification

function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Please log in.' });
}

function requireRole(role) {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ error: 'Unauthorized: Please log in.' });
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
