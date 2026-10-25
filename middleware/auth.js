// Authentication and Role-based Access Middleware
const db = require('../server/db');

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
 * Inactive or blocked sellers cannot manage inventory.
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
 * Verifies that the product exists and is owned by the authenticated seller.
 * Prevents Seller B from modifying or deleting Seller A's products.
 */
async function verifyProductOwnership(req, res, next) {
    try {
        const productId = Number(req.params.id);

        if (!Number.isInteger(productId) || productId <= 0) {
            return res.status(400).json({ error: 'Product ID must be a valid positive integer.' });
        }

        const [rows] = await db.execute(
            'SELECT product_id, seller_id, status FROM products WHERE product_id = ?',
            [productId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        const product = rows[0];
        const currentUserId = req.session.user.user_id;
        const currentUserRole = req.session.user.role;

        // Admins can manage any product, sellers can only manage their own
        if (currentUserRole !== 'admin' && currentUserRole !== 'super_admin') {
            if (product.seller_id !== currentUserId) {
                return res.status(403).json({
                    error: 'Forbidden: You do not have permission to manage this product.'
                });
            }
        }

        req.product = product;
        next();
    } catch (err) {
        console.error('Ownership check error:', err.message);
        res.status(500).json({ error: 'Failed to verify product ownership.' });
    }
}

module.exports = {
    isAuthenticated,
    requireRole,
    requireSeller,
    verifyProductOwnership
};
