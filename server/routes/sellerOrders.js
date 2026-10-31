const express = require('express');
const router = express.Router();
const db = require('../db');
const { logActivity } = require('../utils/logger');

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

// Valid status transitions
const ALLOWED_TRANSITIONS = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped: ['delivered'],
    delivered: [],
    cancelled: []
};

/**
 * GET /api/seller/orders
 * List orders containing the logged-in seller's products.
 * Displays order details, product names, quantities, purchase prices, customer info.
 * Isolates data: Sellers CANNOT see other sellers' items.
 */
router.get('/', requireSeller, async (req, res) => {
    try {
        const sellerId = req.session.user.user_id;
        const { status, search } = req.query;

        let sql = `
            SELECT
                oi.order_item_id,
                oi.order_id,
                oi.product_id,
                oi.seller_id,
                oi.quantity,
                oi.price,
                oi.subtotal,
                oi.item_status,
                p.product_name,
                p.image,
                p.image_url,
                o.created_at AS order_date,
                o.status AS overall_order_status,
                o.payment_method,
                o.payment_status,
                u.name AS customer_name,
                u.email AS customer_email,
                u.phone AS customer_phone,
                a.address_line,
                a.city,
                a.state,
                a.postal_code,
                a.country
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.order_id
            JOIN products p ON oi.product_id = p.product_id
            LEFT JOIN users u ON o.customer_id = u.user_id
            LEFT JOIN addresses a ON o.address_id = a.address_id
            WHERE oi.seller_id = ?
        `;

        const params = [sellerId];

        if (status && status.trim()) {
            sql += ' AND oi.item_status = ?';
            params.push(status.trim());
        }

        if (search && search.trim()) {
            sql += ' AND (p.product_name LIKE ? OR oi.order_id = ?)';
            params.push(`%${search.trim()}%`, Number(search.trim()) || 0);
        }

        sql += ' ORDER BY o.created_at DESC, oi.order_item_id DESC';

        const [items] = await db.query(sql, params);

        res.json({
            count: items.length,
            seller_id: sellerId,
            orders: items
        });
    } catch (err) {
        console.error('Failed to retrieve seller orders:', err.message);
        res.status(500).json({ error: 'Unable to retrieve seller orders.' });
    }
});

/**
 * PATCH /api/seller/orders/:itemId/status
 * Update an order item's status.
 * Prevents sellers from updating items that belong to other sellers.
 * Validates transition flow (e.g. confirmed -> processing -> shipped -> delivered).
 */
router.patch('/:itemId/status', requireSeller, async (req, res) => {
    try {
        const sellerId = req.session.user.user_id;
        const itemId = Number(req.params.itemId);
        const { status: targetStatus } = req.body;
        const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';

        if (!Number.isInteger(itemId) || itemId <= 0) {
            return res.status(400).json({ error: 'Invalid order item ID.' });
        }

        if (!targetStatus || typeof targetStatus !== 'string') {
            return res.status(400).json({ error: 'New status is required.' });
        }

        const normalizedTarget = targetStatus.trim().toLowerCase();
        const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
        if (!validStatuses.includes(normalizedTarget)) {
            return res.status(400).json({
                error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }

        // 1. Fetch the order item
        const [rows] = await db.execute(
            'SELECT order_item_id, order_id, seller_id, item_status FROM order_items WHERE order_item_id = ?',
            [itemId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Order item not found.' });
        }

        const item = rows[0];

        // 2. Strict seller ownership check
        // Admins can manage any item, but sellers can only manage their own items
        const isSuperOrAdmin = req.session.user.role === 'admin' || req.session.user.role === 'super_admin';
        if (!isSuperOrAdmin && item.seller_id !== sellerId) {
            return res.status(403).json({
                error: 'Forbidden: You do not have permission to manage order items belonging to another seller.'
            });
        }

        const currentStatus = item.item_status;

        // Same status check
        if (currentStatus === normalizedTarget) {
            return res.json({
                message: 'Status is already set to ' + normalizedTarget,
                order_item_id: itemId,
                status: normalizedTarget
            });
        }

        // 3. Status transition validation
        const allowedNext = ALLOWED_TRANSITIONS[currentStatus] || [];
        if (!isSuperOrAdmin && !allowedNext.includes(normalizedTarget)) {
            return res.status(400).json({
                error: `Cannot transition status from '${currentStatus}' to '${normalizedTarget}'. Permitted next transitions: ${allowedNext.join(', ') || 'none (terminal state)'}.`
            });
        }

        // 4. Update the order item status
        await db.execute(
            'UPDATE order_items SET item_status = ? WHERE order_item_id = ?',
            [normalizedTarget, itemId]
        );

        // 5. Update overall order status if appropriate
        // If all items in this order are delivered, mark order delivered. If any shipped, mark shipped.
        const [allItems] = await db.execute(
            'SELECT item_status FROM order_items WHERE order_id = ?',
            [item.order_id]
        );

        if (allItems.length > 0) {
            const allDelivered = allItems.every(i => i.item_status === 'delivered');
            const allCancelled = allItems.every(i => i.item_status === 'cancelled');
            const anyShipped = allItems.some(i => i.item_status === 'shipped');
            const anyProcessing = allItems.some(i => i.item_status === 'processing');

            let newOrderStatus = null;
            if (allDelivered) newOrderStatus = 'delivered';
            else if (allCancelled) newOrderStatus = 'cancelled';
            else if (anyShipped) newOrderStatus = 'shipped';
            else if (anyProcessing) newOrderStatus = 'processing';

            if (newOrderStatus) {
                await db.execute('UPDATE orders SET status = ? WHERE order_id = ?', [newOrderStatus, item.order_id]);
            }
        }

        // 6. Audit log
        logActivity(
            sellerId,
            'ORDER_ITEM_STATUS_UPDATED',
            { order_item_id: itemId, order_id: item.order_id, from: currentStatus, to: normalizedTarget },
            clientIp
        );

        res.json({
            message: 'Order item status updated successfully.',
            order_item_id: itemId,
            previous_status: currentStatus,
            status: normalizedTarget
        });

    } catch (err) {
        console.error('Failed to update order item status:', err.message);
        res.status(500).json({ error: 'Unable to update order item status.' });
    }
});

module.exports = router;
