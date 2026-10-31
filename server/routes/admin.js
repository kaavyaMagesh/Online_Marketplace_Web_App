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

/**
 * GET /api/admin/stats
 * Overview counts and KPIs for the Admin & Super Admin Dashboards.
 */
router.get('/stats', async (req, res) => {
    try {
        const [[{ count: totalCustomers }]] = await db.query("SELECT COUNT(*) AS count FROM users WHERE role = 'customer'");
        const [[{ count: totalSellers }]]   = await db.query("SELECT COUNT(*) AS count FROM users WHERE role = 'seller'");
        const [[{ count: totalAdmins }]]    = await db.query("SELECT COUNT(*) AS count FROM users WHERE role IN ('admin', 'super_admin')");
        const [[{ count: totalProducts }]]  = await db.query("SELECT COUNT(*) AS count FROM products");
        const [[{ count: totalOrders }]]    = await db.query("SELECT COUNT(*) AS count FROM orders");
        const [[{ sum: totalRevenue }]]     = await db.query("SELECT COALESCE(SUM(total_amount), 0) AS sum FROM orders WHERE status != 'cancelled'");

        const [recentLogs] = await db.query(
            `SELECT l.log_id, l.action, l.details, l.created_at, u.name AS user_name, u.role
             FROM system_logs l
             LEFT JOIN users u ON l.user_id = u.user_id
             ORDER BY l.created_at DESC
             LIMIT 8`
        );

        res.json({
            total_customers: totalCustomers,
            total_sellers: totalSellers,
            total_admins: totalAdmins,
            total_products: totalProducts,
            total_orders: totalOrders,
            total_revenue: totalRevenue,
            recent_activity: recentLogs
        });
    } catch (err) {
        console.error('Failed to load admin stats:', err.message);
        res.status(500).json({ error: 'Unable to load dashboard statistics.' });
    }
});

/**
 * GET /api/admin/customers
 * List registered customers with order counts.
 */
router.get('/customers', async (req, res) => {
    try {
        const [customers] = await db.query(
            `SELECT
                u.user_id,
                u.name,
                u.email,
                u.phone,
                u.status,
                u.created_at,
                COUNT(o.order_id) AS total_orders,
                COALESCE(SUM(o.total_amount), 0) AS total_spent
             FROM users u
             LEFT JOIN orders o ON u.user_id = o.customer_id
             WHERE u.role = 'customer'
             GROUP BY u.user_id
             ORDER BY u.created_at DESC`
        );

        res.json({
            count: customers.length,
            customers
        });
    } catch (err) {
        console.error('Failed to list customers:', err.message);
        res.status(500).json({ error: 'Unable to retrieve customer list.' });
    }
});

/**
 * PATCH /api/admin/customers/:customerId/status
 * Block or unblock a customer account.
 */
router.patch('/customers/:customerId/status', async (req, res) => {
    try {
        const adminId = req.session.user.user_id;
        const customerId = Number(req.params.customerId);
        const { status: targetStatus } = req.body;
        const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';

        if (!['active', 'blocked'].includes(targetStatus)) {
            return res.status(400).json({ error: "Status must be 'active' or 'blocked'." });
        }

        const [users] = await db.execute('SELECT user_id, name, email, role FROM users WHERE user_id = ?', [customerId]);
        if (users.length === 0 || users[0].role !== 'customer') {
            return res.status(404).json({ error: 'Customer not found.' });
        }

        await db.execute('UPDATE users SET status = ? WHERE user_id = ?', [targetStatus, customerId]);

        logActivity(
            adminId,
            targetStatus === 'blocked' ? 'CUSTOMER_BLOCKED' : 'CUSTOMER_UNBLOCKED',
            { customer_id: customerId, email: users[0].email, new_status: targetStatus },
            clientIp
        );

        res.json({
            message: `Customer account updated to '${targetStatus}'.`,
            customer_id: customerId,
            status: targetStatus
        });
    } catch (err) {
        console.error('Failed to update customer status:', err.message);
        res.status(500).json({ error: 'Unable to update customer status.' });
    }
});

/**
 * GET /api/admin/orders
 * List all marketplace orders with line item summary.
 */
router.get('/orders', async (req, res) => {
    try {
        const [orders] = await db.query(
            `SELECT
                o.order_id,
                o.customer_id,
                u.name AS customer_name,
                u.email AS customer_email,
                o.total_amount,
                o.status,
                o.shipping_address,
                o.created_at,
                COUNT(oi.order_item_id) AS total_items
             FROM orders o
             JOIN users u ON o.customer_id = u.user_id
             LEFT JOIN order_items oi ON o.order_id = oi.order_id
             GROUP BY o.order_id
             ORDER BY o.created_at DESC`
        );

        res.json({
            count: orders.length,
            orders
        });
    } catch (err) {
        console.error('Failed to list orders:', err.message);
        res.status(500).json({ error: 'Unable to retrieve orders.' });
    }
});

/**
 * GET /api/admin/reports
 * Aggregated sales and performance reporting for admins and super admins.
 */
router.get('/reports', async (req, res) => {
    try {
        const [[summary]] = await db.query(
            `SELECT
                COUNT(DISTINCT order_id) AS total_orders,
                COALESCE(SUM(total_amount), 0) AS gross_sales,
                COALESCE(AVG(total_amount), 0) AS avg_order_value
             FROM orders
             WHERE status != 'cancelled'`
        );

        const [statusBreakdown] = await db.query(
            `SELECT status, COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total_value
             FROM orders
             GROUP BY status`
        );

        const [topProducts] = await db.query(
            `SELECT
                p.product_id,
                p.product_name,
                u.name AS seller_name,
                SUM(oi.quantity) AS units_sold,
                SUM(oi.quantity * oi.price) AS total_revenue
             FROM order_items oi
             JOIN products p ON oi.product_id = p.product_id
             JOIN users u ON p.seller_id = u.user_id
             JOIN orders o ON oi.order_id = o.order_id
             WHERE o.status != 'cancelled'
             GROUP BY p.product_id
             ORDER BY total_revenue DESC
             LIMIT 5`
        );

        res.json({
            summary,
            status_breakdown: statusBreakdown,
            top_products: topProducts
        });
    } catch (err) {
        console.error('Failed to generate admin reports:', err.message);
        res.status(500).json({ error: 'Unable to generate reports.' });
    }
});

module.exports = router;
