const express = require('express');
const router = express.Router();
const db = require('../db');

// Check that the user is a logged-in seller
function requireSeller(req, res, next) {
    const user = req.session?.user;

    if (!user) {
        return res.status(401).json({
            message: 'Please log in as a seller.',
            error: 'Unauthorized: Please log in.'
        });
    }

    if (user.role !== 'seller' && user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({
            message: 'Seller access required.',
            error: 'Forbidden: Only registered sellers can access this endpoint.'
        });
    }

    if (user.status && user.status !== 'active') {
        return res.status(403).json({
            message: 'Seller account is not active.',
            error: 'Forbidden: Your seller account is not active or has been suspended.'
        });
    }

    next();
}

/**
 * GET /api/seller/reports
 * Returns seller sales statistics:
 * - Completed sales revenue (delivered items)
 * - Gross sales (non-cancelled items)
 * - Total quantities sold
 * - Order counts
 * - Breakdown by item_status
 * - Top performing products
 * - Recent sales timeline
 */
router.get('/', requireSeller, async (req, res) => {
    try {
        const sellerId = req.session.user.user_id;

        // 1. Overall Aggregates
        const [overall] = await db.query(
            `SELECT
                COUNT(DISTINCT oi.order_id) AS total_orders,
                COUNT(oi.order_item_id) AS total_line_items,
                COALESCE(SUM(CASE WHEN oi.item_status != 'cancelled' THEN oi.quantity ELSE 0 END), 0) AS total_units_sold,
                COALESCE(SUM(CASE WHEN oi.item_status != 'cancelled' THEN oi.subtotal ELSE 0 END), 0) AS gross_revenue,
                COALESCE(SUM(CASE WHEN oi.item_status = 'delivered' THEN oi.subtotal ELSE 0 END), 0) AS completed_sales,
                COALESCE(SUM(CASE WHEN oi.item_status = 'delivered' THEN oi.quantity ELSE 0 END), 0) AS completed_units,
                COALESCE(SUM(CASE WHEN oi.item_status IN ('confirmed', 'processing', 'shipped') THEN oi.subtotal ELSE 0 END), 0) AS pending_revenue,
                COALESCE(SUM(CASE WHEN oi.item_status = 'cancelled' THEN oi.subtotal ELSE 0 END), 0) AS cancelled_revenue
             FROM order_items oi
             WHERE oi.seller_id = ?`,
            [sellerId]
        );

        const summary = overall[0] || {};

        // 2. Breakdown by status
        const [statusRows] = await db.query(
            `SELECT
                oi.item_status,
                COUNT(oi.order_item_id) AS count,
                COALESCE(SUM(oi.quantity), 0) AS total_quantity,
                COALESCE(SUM(oi.subtotal), 0) AS total_amount
             FROM order_items oi
             WHERE oi.seller_id = ?
             GROUP BY oi.item_status`,
            [sellerId]
        );

        const statusBreakdown = {
            confirmed: { count: 0, quantity: 0, amount: 0 },
            processing: { count: 0, quantity: 0, amount: 0 },
            shipped: { count: 0, quantity: 0, amount: 0 },
            delivered: { count: 0, quantity: 0, amount: 0 },
            cancelled: { count: 0, quantity: 0, amount: 0 }
        };

        statusRows.forEach(row => {
            if (statusBreakdown[row.item_status]) {
                statusBreakdown[row.item_status] = {
                    count: Number(row.count),
                    quantity: Number(row.total_quantity),
                    amount: parseFloat(Number(row.total_amount).toFixed(2))
                };
            }
        });

        // 3. Top Selling Products
        const [topProducts] = await db.query(
            `SELECT
                p.product_id,
                p.product_name,
                p.price,
                p.image,
                p.stock_quantity,
                COALESCE(SUM(oi.quantity), 0) AS units_sold,
                COALESCE(SUM(oi.subtotal), 0) AS total_revenue
             FROM order_items oi
             JOIN products p ON oi.product_id = p.product_id
             WHERE oi.seller_id = ? AND oi.item_status != 'cancelled'
             GROUP BY p.product_id
             ORDER BY units_sold DESC
             LIMIT 5`,
            [sellerId]
        );

        // 4. Recent Sales
        const [recentSales] = await db.query(
            `SELECT
                oi.order_item_id,
                oi.order_id,
                oi.product_id,
                p.product_name,
                oi.quantity,
                oi.price,
                oi.subtotal,
                oi.item_status,
                o.created_at AS order_date,
                u.name AS customer_name
             FROM order_items oi
             JOIN orders o ON oi.order_id = o.order_id
             JOIN products p ON oi.product_id = p.product_id
             LEFT JOIN users u ON o.customer_id = u.user_id
             WHERE oi.seller_id = ?
             ORDER BY o.created_at DESC
             LIMIT 10`,
            [sellerId]
        );

        res.json({
            seller_id: sellerId,
            summary: {
                total_orders: Number(summary.total_orders) || 0,
                total_units_sold: Number(summary.total_units_sold) || 0,
                gross_revenue: parseFloat(Number(summary.gross_revenue).toFixed(2)),
                completed_sales: parseFloat(Number(summary.completed_sales).toFixed(2)),
                completed_units: Number(summary.completed_units) || 0,
                pending_revenue: parseFloat(Number(summary.pending_revenue).toFixed(2)),
                cancelled_revenue: parseFloat(Number(summary.cancelled_revenue).toFixed(2))
            },
            status_breakdown: statusBreakdown,
            top_products: topProducts.map(p => ({
                product_id: p.product_id,
                product_name: p.product_name,
                price: parseFloat(p.price),
                image: p.image,
                stock_quantity: p.stock_quantity,
                units_sold: Number(p.units_sold),
                total_revenue: parseFloat(Number(p.total_revenue).toFixed(2))
            })),
            recent_sales: recentSales.map(s => ({
                order_item_id: s.order_item_id,
                order_id: s.order_id,
                product_id: s.product_id,
                product_name: s.product_name,
                quantity: s.quantity,
                price: parseFloat(s.price),
                subtotal: parseFloat(s.subtotal),
                item_status: s.item_status,
                order_date: s.order_date,
                customer_name: s.customer_name || 'Customer'
            }))
        });

    } catch (err) {
        console.error('Failed to generate seller reports:', err.message);
        res.status(500).json({ error: 'Unable to generate sales reports.' });
    }
});

module.exports = router;
