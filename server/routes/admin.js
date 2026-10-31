const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');

// Protect all routes with general admin check (admin or super_admin)
router.use(requireAdmin);

/**
 * GET /api/admin/sellers
 * List registered sellers with their account status and inventory counts.
 */
router.get('/sellers', async (req, res) => {
    try {
        const [sellers] = await db.query(
            `SELECT
                u.user_id,
                u.name,
                u.email,
                u.phone,
                u.status,
                u.created_at,
                COUNT(p.product_id) AS total_products,
                COALESCE(SUM(p.stock_quantity), 0) AS total_stock
             FROM users u
             LEFT JOIN products p ON u.user_id = p.seller_id
             WHERE u.role = 'seller'
             GROUP BY u.user_id
             ORDER BY u.created_at DESC`
        );

        res.json({
            count: sellers.length,
            sellers
        });
    } catch (err) {
        console.error('Failed to list sellers:', err.message);
        res.status(500).json({ error: 'Unable to retrieve sellers.' });
    }
});

/**
 * PATCH /api/admin/sellers/:sellerId/status
 * Block or unblock a seller account.
 * Requires 'manage_sellers' permission (or super_admin).
 */
router.patch('/sellers/:sellerId/status', requirePermission('manage_sellers'), async (req, res) => {
    try {
        const adminId = req.session.user.user_id;
        const sellerId = Number(req.params.sellerId);
        const { status: targetStatus } = req.body;
        const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';

        if (!Number.isInteger(sellerId) || sellerId <= 0) {
            return res.status(400).json({ error: 'Invalid seller ID.' });
        }

        if (!targetStatus || !['active', 'blocked', 'pending'].includes(targetStatus)) {
            return res.status(400).json({ error: "Status must be 'active', 'blocked', or 'pending'." });
        }

        const [users] = await db.execute('SELECT user_id, name, email, role, status FROM users WHERE user_id = ?', [sellerId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'Seller not found.' });
        }

        const seller = users[0];
        if (seller.role !== 'seller') {
            return res.status(400).json({ error: 'Target user is not a seller.' });
        }

        await db.execute('UPDATE users SET status = ? WHERE user_id = ?', [targetStatus, sellerId]);

        // If blocked, set seller's products to inactive; if unblocked, restore to active
        if (targetStatus === 'blocked') {
            await db.execute("UPDATE products SET status = 'inactive' WHERE seller_id = ?", [sellerId]);
        } else if (targetStatus === 'active') {
            await db.execute("UPDATE products SET status = 'active' WHERE seller_id = ?", [sellerId]);
        }

        const actionName = targetStatus === 'blocked' ? 'SELLER_BLOCKED' : (targetStatus === 'active' ? 'SELLER_UNBLOCKED' : 'SELLER_STATUS_CHANGED');
        logActivity(
            adminId,
            actionName,
            { seller_id: sellerId, seller_email: seller.email, new_status: targetStatus },
            clientIp
        );

        res.json({
            message: `Seller account status changed to '${targetStatus}'.`,
            seller_id: sellerId,
            status: targetStatus
        });

    } catch (err) {
        console.error('Failed to update seller status:', err.message);
        res.status(500).json({ error: 'Unable to update seller status.' });
    }
});

/**
 * GET /api/admin/categories
 * List all categories including inactive ones.
 */
router.get('/categories', async (req, res) => {
    try {
        const [categories] = await db.query(
            `SELECT
                c.category_id,
                c.category_name,
                c.description,
                c.status,
                c.created_at,
                COUNT(p.product_id) AS product_count
             FROM categories c
             LEFT JOIN products p ON c.category_id = p.category_id
             GROUP BY c.category_id
             ORDER BY c.category_name ASC`
        );

        res.json({
            count: categories.length,
            categories
        });
    } catch (err) {
        console.error('Failed to list categories:', err.message);
        res.status(500).json({ error: 'Unable to retrieve categories.' });
    }
});

/**
 * POST /api/admin/categories
 * Create a new product category.
 * Requires 'manage_categories' permission.
 */
router.post('/categories', requirePermission('manage_categories'), async (req, res) => {
    try {
        const adminId = req.session.user.user_id;
        const { category_name, description, status = 'active' } = req.body;
        const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';

        const cleanName = (category_name || '').trim();
        if (!cleanName) {
            return res.status(400).json({ error: 'Category name is required.' });
        }

        const [existing] = await db.execute('SELECT category_id FROM categories WHERE category_name = ?', [cleanName]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Category with this name already exists.' });
        }

        const [insertRes] = await db.execute(
            'INSERT INTO categories (category_name, description, status) VALUES (?, ?, ?)',
            [cleanName, description || null, status === 'inactive' ? 'inactive' : 'active']
        );

        logActivity(adminId, 'CATEGORY_CREATED', { category_id: insertRes.insertId, category_name: cleanName }, clientIp);

        res.status(201).json({
            message: 'Category created successfully.',
            category_id: insertRes.insertId,
            category_name: cleanName
        });

    } catch (err) {
        console.error('Failed to create category:', err.message);
        res.status(500).json({ error: 'Unable to create category.' });
    }
});

/**
 * GET /api/admin/products
 * List all products across all sellers.
 */
router.get('/products', async (req, res) => {
    try {
        const [products] = await db.query(
            `SELECT
                p.product_id,
                p.seller_id,
                u.name AS seller_name,
                p.category_id,
                c.category_name,
                p.product_name,
                p.price,
                p.stock_quantity,
                p.image,
                p.status,
                p.created_at
             FROM products p
             JOIN users u ON p.seller_id = u.user_id
             LEFT JOIN categories c ON p.category_id = c.category_id
             ORDER BY p.created_at DESC`
        );

        res.json({
            count: products.length,
            products
        });
    } catch (err) {
        console.error('Failed to list products:', err.message);
        res.status(500).json({ error: 'Unable to retrieve products.' });
    }
});

/**
 * PATCH /api/admin/products/:productId/status
 * Activate or deactivate any product.
 * Requires 'manage_products' permission.
 */
router.patch('/products/:productId/status', requirePermission('manage_products'), async (req, res) => {
    try {
        const adminId = req.session.user.user_id;
        const productId = Number(req.params.productId);
        const { status } = req.body;
        const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';

        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({ error: "Status must be 'active' or 'inactive'." });
        }

        const [prods] = await db.execute('SELECT product_id, product_name, status FROM products WHERE product_id = ?', [productId]);
        if (prods.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        await db.execute('UPDATE products SET status = ? WHERE product_id = ?', [status, productId]);

        logActivity(adminId, 'PRODUCT_STATUS_UPDATED', { product_id: productId, product_name: prods[0].product_name, new_status: status }, clientIp);

        res.json({
            message: `Product status updated to '${status}'.`,
            product_id: productId,
            status
        });

    } catch (err) {
        console.error('Failed to update product status:', err.message);
        res.status(500).json({ error: 'Unable to update product status.' });
    }
});

module.exports = router;
