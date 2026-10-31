/*
 * server/routes/orderRoutes.js — GoodsPlatz Customer Order & Checkout API
 *
 * Responsibilities:
 *   1. Guard all order endpoints with session authentication (isAuthenticated).
 *   2. Restrict all order queries and mutations strictly to req.session.user.user_id.
 *   3. Transaction-safe checkout:
 *      - Re-verify product active status and available inventory.
 *      - Calculate total strictly from database prices.
 *      - Insert shipping address into `addresses`.
 *      - Insert order into `orders`.
 *      - Insert items into `order_items` with seller_id.
 *      - Deduct inventory from `products.stock_quantity`.
 *      - Clear purchased items from `cart_items`.
 *   4. Provide order history (`GET /api/orders`) and detailed order lookup (`GET /api/orders/:id`).
 *   5. Parameterized SQL queries exclusively.
 *
 * Endpoints:
 *   POST /api/orders     — Place an order from current cart
 *   GET  /api/orders     — List customer's orders
 *   GET  /api/orders/:id — Retrieve single order details with address and items
 */

"use strict";

const express = require("express");
const router  = express.Router();
const db      = require("../db");
const { isAuthenticated } = require("../../middleware/auth");

// All order endpoints require an authenticated, active session.
router.use(isAuthenticated);

// In-flight checkout mutex: tracks active user checkouts to prevent duplicate submissions
const activeCheckouts = new Set();

/* ─── Validation Helpers ─────────────────────────────────────── */

function isValidPhone(phone) {
    return /^[0-9]{10}$/.test(String(phone).trim());
}

function isValidPostalCode(code) {
    return /^[0-9A-Za-z\s\-]{3,10}$/.test(String(code).trim());
}

/* ─── POST /api/orders ──────────────────────────────────────────
 * Checkout endpoint: converts customer's active cart into an order.
 * Uses a MySQL transaction with row-level locks and conditional stock deductions.
 */
router.post("/", async (req, res) => {
    const userId = req.session.user.user_id;

    // Server-side duplicate prevention: reject if checkout is already in-flight for this user
    if (activeCheckouts.has(userId)) {
        return res.status(409).json({
            error: "A checkout operation is already in progress for your account. Please wait a moment."
        });
    }

    activeCheckouts.add(userId);

    // 1. Extract and validate shipping details
    const recipientName = (req.body.recipient_name || "").trim();
    const phone         = (req.body.phone || "").trim();
    const addressLine   = (req.body.address_line || "").trim();
    const city          = (req.body.city || "").trim();
    const state         = (req.body.state || "").trim();
    const postalCode    = (req.body.postal_code || "").trim();
    const paymentMethod = "Cash on Delivery"; // Enforced server-side

    if (!recipientName) {
        activeCheckouts.delete(userId);
        return res.status(400).json({ error: "Recipient name is required." });
    }

    if (!phone || !isValidPhone(phone)) {
        activeCheckouts.delete(userId);
        return res.status(400).json({ error: "Please enter a valid 10-digit mobile number." });
    }

    if (!addressLine) {
        activeCheckouts.delete(userId);
        return res.status(400).json({ error: "Street address is required." });
    }

    if (!city) {
        activeCheckouts.delete(userId);
        return res.status(400).json({ error: "City is required." });
    }

    if (!state) {
        activeCheckouts.delete(userId);
        return res.status(400).json({ error: "State is required." });
    }

    if (!postalCode || !isValidPostalCode(postalCode)) {
        activeCheckouts.delete(userId);
        return res.status(400).json({ error: "Please enter a valid postal code." });
    }

    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        // 2. Fetch customer's cart items with exclusive row locking (FOR UPDATE)
        const [cartRows] = await conn.execute(
            `SELECT
                ci.cart_item_id,
                ci.cart_id,
                ci.product_id,
                ci.quantity,
                p.product_name,
                p.price,
                p.stock_quantity,
                p.seller_id,
                p.status AS product_status
             FROM cart c
             JOIN cart_items ci ON c.cart_id = ci.cart_id
             JOIN products p ON ci.product_id = p.product_id
             WHERE c.user_id = ?
             FOR UPDATE`,
            [userId]
        );

        if (cartRows.length === 0) {
            await conn.rollback();
            conn.release();
            return res.status(400).json({ error: "Your shopping cart is empty. Please add items before placing an order." });
        }

        // 3. Real-time stock, status and price verification from database values
        let totalAmount = 0;

        for (const item of cartRows) {
            if (item.product_status !== "active") {
                await conn.rollback();
                conn.release();
                return res.status(400).json({
                    error: `"${item.product_name}" is no longer active. Please remove it from your cart before proceeding.`
                });
            }

            if (item.quantity > item.stock_quantity) {
                await conn.rollback();
                conn.release();
                return res.status(400).json({
                    error: `Insufficient stock for "${item.product_name}". Available: ${item.stock_quantity}, requested: ${item.quantity}.`
                });
            }

            const itemPrice = Number(item.price) || 0;
            totalAmount += itemPrice * item.quantity;
        }

        totalAmount = parseFloat(totalAmount.toFixed(2));

        // 4. Insert delivery address into `addresses` (matching schema: user_id, address_line, city, state, postal_code, country)
        const [addrResult] = await conn.execute(
            `INSERT INTO addresses (user_id, address_line, city, state, postal_code, country)
             VALUES (?, ?, ?, ?, ?, 'India')`,
            [userId, addressLine, city, state, postalCode]
        );
        const addressId = addrResult.insertId;

        // Optionally update user's primary phone if not currently set
        await conn.execute(
            `UPDATE users SET phone = COALESCE(phone, ?) WHERE user_id = ?`,
            [phone, userId]
        );

        // 5. Create Order record in `orders`
        // Schema enums: status DEFAULT 'pending', payment_status DEFAULT 'pending'
        const [orderResult] = await conn.execute(
            `INSERT INTO orders (customer_id, address_id, total_amount, status, payment_method, payment_status)
             VALUES (?, ?, ?, 'pending', ?, 'pending')`,
            [userId, addressId, totalAmount, paymentMethod]
        );
        const orderId = orderResult.insertId;

        // 6. Insert items into `order_items` and deduct product stock conditionally
        for (const item of cartRows) {
            const itemPrice = Number(item.price) || 0;

            await conn.execute(
                `INSERT INTO order_items (order_id, product_id, seller_id, quantity, price)
                 VALUES (?, ?, ?, ?, ?)`,
                [orderId, item.product_id, item.seller_id, item.quantity, itemPrice]
            );

            // Conditional stock deduction: ensures stock never goes negative and overselling is prevented
            const [stockResult] = await conn.execute(
                `UPDATE products
                 SET stock_quantity = stock_quantity - ?
                 WHERE product_id = ? AND stock_quantity >= ? AND status = 'active'`,
                [item.quantity, item.product_id, item.quantity]
            );

            if (stockResult.affectedRows !== 1) {
                await conn.rollback();
                conn.release();
                return res.status(409).json({
                    error: `Inventory conflict: "${item.product_name}" no longer has sufficient stock. Please review your cart.`
                });
            }
        }

        // 7. Clear customer's cart items
        const cartId = cartRows[0].cart_id;
        await conn.execute(
            "DELETE FROM cart_items WHERE cart_id = ?",
            [cartId]
        );

        // Commit transaction
        await conn.commit();
        conn.release();

        res.status(201).json({
            message: "Order placed successfully.",
            order_id: orderId,
            total_amount: totalAmount,
            status: "pending",
            payment_method: paymentMethod,
            payment_status: "pending",
            created_at: new Date()
        });
    } catch (err) {
        if (conn) {
            try { await conn.rollback(); } catch (e) { /* ignore rollback error */ }
            conn.release();
        }
        console.error("Order creation error:", err.message);
        res.status(500).json({ error: "An error occurred while placing your order. Please try again." });
    } finally {
        activeCheckouts.delete(userId);
    }
});

/* ─── GET /api/orders ───────────────────────────────────────────
 * Retrieve order history for the authenticated customer.
 */
router.get("/", async (req, res) => {
    try {
        const userId = req.session.user.user_id;

        const [orders] = await db.execute(
            `SELECT
                o.order_id,
                o.total_amount,
                o.status,
                o.payment_method,
                o.payment_status,
                o.created_at,
                COUNT(oi.order_item_id) AS item_count,
                COALESCE(SUM(oi.quantity), 0) AS total_quantity
             FROM orders o
             LEFT JOIN order_items oi ON o.order_id = oi.order_id
             WHERE o.customer_id = ?
             GROUP BY o.order_id
             ORDER BY o.created_at DESC`,
            [userId]
        );

        const formatted = orders.map(ord => ({
            order_id:       ord.order_id,
            total_amount:   Number(ord.total_amount),
            status:         ord.status,
            payment_method: ord.payment_method,
            payment_status: ord.payment_status,
            created_at:     ord.created_at,
            item_count:     Number(ord.item_count),
            total_quantity: Number(ord.total_quantity)
        }));

        res.json({
            count:  formatted.length,
            orders: formatted
        });
    } catch (err) {
        console.error("Order history retrieval error:", err.message);
        res.status(500).json({ error: "Unable to retrieve orders. Please try again." });
    }
});

/* ─── GET /api/orders/:id ───────────────────────────────────────
 * Retrieve single order details including shipping address and items.
 * Strictly limited to the order owner.
 */
router.get("/:id", async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const orderId = Number(req.params.id);

        if (!Number.isInteger(orderId) || orderId <= 0) {
            return res.status(400).json({ error: "Order ID must be a valid positive integer." });
        }

        // 1. Fetch order details with address and user info
        const [orders] = await db.execute(
            `SELECT
                o.order_id,
                o.customer_id,
                o.total_amount,
                o.status,
                o.payment_method,
                o.payment_status,
                o.created_at,
                a.address_line,
                a.city,
                a.state,
                a.postal_code,
                a.country,
                u.name AS customer_name,
                u.phone AS customer_phone,
                u.email AS customer_email
             FROM orders o
             LEFT JOIN addresses a ON o.address_id = a.address_id
             JOIN users u ON o.customer_id = u.user_id
             WHERE o.order_id = ? AND o.customer_id = ?`,
            [orderId, userId]
        );

        if (orders.length === 0) {
            return res.status(404).json({ error: "Order not found." });
        }

        const order = orders[0];

        // 2. Fetch items for this order
        const [items] = await db.execute(
            `SELECT
                oi.order_item_id,
                oi.product_id,
                oi.quantity,
                oi.price,
                oi.subtotal,
                p.product_name,
                p.image,
                p.image AS image_url,
                c.category_name
             FROM order_items oi
             LEFT JOIN products p ON oi.product_id = p.product_id
             LEFT JOIN categories c ON p.category_id = c.category_id
             WHERE oi.order_id = ?`,
            [orderId]
        );

        const formattedItems = items.map(it => ({
            order_item_id: it.order_item_id,
            product_id:    it.product_id,
            product_name:  it.product_name || "Product",
            quantity:      Number(it.quantity),
            price:         Number(it.price),
            subtotal:      Number(it.subtotal !== undefined ? it.subtotal : (Number(it.price) * Number(it.quantity))),
            image:         it.image,
            image_url:     it.image_url,
            category_name: it.category_name
        }));

        res.json({
            order_id:       order.order_id,
            total_amount:   Number(order.total_amount),
            status:         order.status,
            payment_method: order.payment_method,
            payment_status: order.payment_status,
            created_at:     order.created_at,
            customer: {
                name:  order.customer_name,
                email: order.customer_email,
                phone: order.customer_phone
            },
            shipping_address: {
                address_line: order.address_line,
                city:         order.city,
                state:        order.state,
                postal_code:  order.postal_code,
                country:      order.country || "India"
            },
            items: formattedItems
        });
    } catch (err) {
        console.error("Single order lookup error:", err.message);
        res.status(500).json({ error: "Unable to retrieve order details." });
    }
});

/* ─── Day 7: Customer Order Cancellation ────────────────────────
 * PATCH /api/orders/:id/cancel
 * Allows customer to cancel their own order if status is 'pending' or 'confirmed'.
 * Uses a MySQL transaction with SELECT ... FOR UPDATE to restock items safely.
 */
async function handleOrderCancellation(req, res) {
    const userId  = req.session.user.user_id;
    const orderId = Number(req.params.id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ error: "Order ID must be a valid positive integer." });
    }

    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        // 1. Lock the order row exclusively to prevent concurrent race conditions
        const [orders] = await conn.execute(
            `SELECT order_id, customer_id, status, payment_status, total_amount
             FROM orders
             WHERE order_id = ?
             FOR UPDATE`,
            [orderId]
        );

        if (orders.length === 0) {
            await conn.rollback();
            conn.release();
            conn = null;
            return res.status(404).json({ error: "Order not found." });
        }

        const order = orders[0];

        // 2. Ownership verification: order must belong to the logged-in customer
        if (order.customer_id !== userId) {
            await conn.rollback();
            conn.release();
            conn = null;
            return res.status(403).json({ error: "You are not authorized to cancel this order." });
        }

        // 3. Status checks
        if (order.status === "cancelled") {
            await conn.rollback();
            conn.release();
            conn = null;
            return res.status(409).json({ error: "This order has already been cancelled." });
        }

        if (order.status === "shipped") {
            await conn.rollback();
            conn.release();
            conn = null;
            return res.status(400).json({
                error: "This order cannot be cancelled as it has already been shipped and is in transit."
            });
        }

        if (order.status === "delivered") {
            await conn.rollback();
            conn.release();
            conn = null;
            return res.status(400).json({
                error: "This order cannot be cancelled as it has already been delivered."
            });
        }

        if (!["pending", "confirmed"].includes(order.status)) {
            await conn.rollback();
            conn.release();
            conn = null;
            return res.status(400).json({
                error: `Order cannot be cancelled in its current state ("${order.status}").`
            });
        }

        // 4. Fetch ordered items to restock inventory
        const [items] = await conn.execute(
            `SELECT product_id, quantity
             FROM order_items
             WHERE order_id = ?`,
            [orderId]
        );

        // 5. Restore stock for each product in the order exactly once
        for (const item of items) {
            if (item.product_id) {
                await conn.execute(
                    `UPDATE products
                     SET stock_quantity = stock_quantity + ?
                     WHERE product_id = ?`,
                    [item.quantity, item.product_id]
                );
            }
        }

        // 6. Update order status to 'cancelled'
        // Payment status stays as-is (Cash on Delivery is unpaid upon order placement; no fake refund)
        await conn.execute(
            `UPDATE orders
             SET status = 'cancelled'
             WHERE order_id = ?`,
            [orderId]
        );

        // Commit transaction
        await conn.commit();
        conn.release();
        conn = null;

        res.json({
            message: `Order #${orderId} has been cancelled successfully.`,
            order: {
                order_id:       orderId,
                status:         "cancelled",
                previous_status: order.status
            }
        });
    } catch (err) {
        if (conn) {
            try { await conn.rollback(); } catch (e) { /* ignore rollback error */ }
            try { conn.release(); } catch (e) { /* ignore release error */ }
            conn = null;
        }
        console.error("Order cancellation error:", err.message);
        res.status(500).json({ error: "Failed to cancel order. Please try again later." });
    }
}

router.patch("/:id/cancel", handleOrderCancellation);
router.post("/:id/cancel", handleOrderCancellation);

module.exports = router;
