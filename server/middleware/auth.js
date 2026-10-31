const db = require('../db');

/**
 * Ensures user has an active session.
 */
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

/**
 * Requires a specific user role.
 */
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

/**
 * Requires seller role and ensures account status is active.
 */
function requireSeller(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Unauthorized: Please log in as a seller.' });
    }

    const { role, status } = req.session.user;

    if (role !== 'seller' && role !== 'admin' && role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Only registered sellers can access this endpoint.' });
    }

    if (status !== 'active') {
        return res.status(403).json({ error: 'Forbidden: Your seller account is not active or has been suspended.' });
    }

    next();
}

/**
 * Requires admin role (admin or super_admin).
 */
function requireAdmin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Unauthorized: Please log in as an administrator.' });
    }

    const { role, status } = req.session.user;

    if (role !== 'admin' && role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Admin access required.' });
    }

    if (status !== 'active') {
        return res.status(403).json({ error: 'Forbidden: Admin account is not active.' });
    }

    next();
}

/**
 * Requires Super Admin role exclusively. Ordinary admins cannot access.
 */
function requireSuperAdmin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Unauthorized: Please log in as a Super Admin.' });
    }

    const { role, status } = req.session.user;

    if (role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Super Admin access required. Ordinary administrators cannot perform this operation.' });
    }

    if (status !== 'active') {
        return res.status(403).json({ error: 'Forbidden: Super Admin account is not active.' });
    }

    next();
}

/**
 * Verifies that the admin possesses a specific permission.
 * Super Admins bypass permission checks with full administrative access.
 */
function requirePermission(permissionName) {
    return async (req, res, next) => {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ error: 'Unauthorized: Please log in.' });
        }

        const { role, status, user_id } = req.session.user;

        if (status !== 'active') {
            return res.status(403).json({ error: 'Forbidden: Account is not active.' });
        }

        // Super admins possess all permissions unconditionally
        if (role === 'super_admin') {
            return next();
        }

        if (role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden: Administrative privileges required.' });
        }

        try {
            const [rows] = await db.execute(
                'SELECT permission_id FROM admin_permissions WHERE admin_id = ? AND permission_name = ?',
                [user_id, permissionName]
            );

            if (rows.length === 0) {
                return res.status(403).json({
                    error: `Forbidden: Missing required administrative permission '${permissionName}'.`
                });
            }

            next();
        } catch (err) {
            console.error('Permission check error:', err.message);
            res.status(500).json({ error: 'Failed to verify admin permissions.' });
        }
    };
}

module.exports = {
    isAuthenticated,
    requireRole,
    requireSeller,
    requireAdmin,
    requireSuperAdmin,
    requirePermission
};
