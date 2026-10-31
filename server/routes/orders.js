const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { logActivity } = require('../utils/logger');

/**
 * Helper to determine customer ID from session or default customer
 */
function getCustomerId(req) {
    if (req.session && req.session.user) {
        return req.session.user.user_id;
    }
    if (req.session && req.session.customer_id) {
        return req.session.customer_id;
    }
    // Default to test customer Alice Customer (user_id = 3) for guest/test access
    return 3;
}

/**
 * Helper to fetch or create a customer's active shopping cart
 */
async function getOrCreateCart(connection, customerId) {
    const [existing] = await connection.execute(
        'SELECT cart_id FROM cart WHERE customer_id = ? LIMIT 1',
        [customerId]
    );

    if (existing.length > 0) {
        return existing[0].cart_id;
    }

    const [insertResult] = await connection.execute(
        'INSERT INTO cart (customer_id) VALUES (?)',
        [customerId]
    );

    return insertResult.insertId;
}

/**
 * POST /api/orders
 * Transactional checkout & order processing
 * - Validates cart and shipping address
 * - Rechecks product prices and stock from DB
 * - Creates orders and order_items records (with seller_id, quantity, price)
 * - Deducts stock using MySQL transaction
 * - Rolls back on any failure
 * - Clears customer's cart
 */
router.post('/', async (req, res) => {
    let connection;
    try {
        const customerId = getCustomerId(req);
        const { address_id, shipping_address, payment_method, items: directItems } = req.body;
        const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';

        connection = await pool.getConnection();

        // 1. Resolve & Validate Shipping Address
        let resolvedAddressId = null;

        if (address_id) {
            const [addrRows] = await connection.execute(
                'SELECT address_id FROM addresses WHERE address_id = ?',
                [Number(address_id)]
            );
            if (addrRows.length === 0) {
                connection.release();
                return res.status(400).json({ message: 'Specified shipping address does not exist.' });
            }
            resolvedAddressId = addrRows[0].address_id;
        } else if (shipping_address) {
            let addrLine = '';
            let city = 'Bengaluru';
            let state = 'Karnataka';
            let postalCode = '560001';
            let country = 'India';

            if (typeof shipping_address === 'string') {
                addrLine = shipping_address.trim();
            } else if (typeof shipping_address === 'object') {
                addrLine = (shipping_address.address_line || shipping_address.address || '').trim();
                if (shipping_address.city) city = shipping_address.city.trim();
                if (shipping_address.state) state = shipping_address.state.trim();
                if (shipping_address.postal_code) postalCode = shipping_address.postal_code.trim();
                if (shipping_address.country) country = shipping_address.country.trim();
            }

            if (!addrLine) {
                connection.release();
                return res.status(400).json({ message: 'Shipping address cannot be empty.' });
            }

            const [newAddr] = await connection.execute(
                `INSERT INTO addresses (user_id, address_line, city, state, postal_code, country)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [customerId, addrLine, city, state, postalCode, country]
            );
            resolvedAddressId = newAddr.insertId;
        } else {
            // Check if user has an existing default address
            const [userAddrs] = await connection.execute(
                'SELECT address_id FROM addresses WHERE user_id = ? ORDER BY is_default DESC, address_id DESC LIMIT 1',
                [customerId]
            );
            if (userAddrs.length > 0) {
                resolvedAddressId = userAddrs[0].address_id;
            } else {
                // Create a fallback default address if none provided
                const [newAddr] = await connection.execute(
                    `INSERT INTO addresses (user_id, address_line, city, state, postal_code, country, is_default)
                     VALUES (?, '123 Market Street', 'Bengaluru', 'Karnataka', '560001', 'India', 1)`,
                    [customerId]
                );
                resolvedAddressId = newAddr.insertId;
            }
        }

        // 2. Fetch Customer Cart Items
        const cartId = await getOrCreateCart(connection, customerId);

        // If direct items provided (e.g. from frontend sync), sync into cart_items if empty
        if (Array.isArray(directItems) && directItems.length > 0) {
            const [existingInCart] = await connection.execute(
                'SELECT COUNT(*) as count FROM cart_items WHERE cart_id = ?',
                [cartId]
            );
            if (existingInCart[0].count === 0) {
                for (const item of directItems) {
                    const pId = Number(item.product_id);
                    const pQty = Number(item.quantity) || 1;
                    if (pId > 0 && pQty > 0) {
                        const [pRows] = await connection.execute('SELECT price FROM products WHERE product_id = ?', [pId]);
                        const price = pRows.length > 0 ? pRows[0].price : 0;
                        await connection.execute(
                            'INSERT INTO cart_items (cart_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                            [cartId, pId, pQty, price]
                        );
                    }
                }
            }
        }

        const [cartItems] = await connection.execute(
            `SELECT ci.cart_item_id, ci.product_id, ci.quantity
             FROM cart_items ci
             WHERE ci.cart_id = ?`,
            [cartId]
        );

        if (cartItems.length === 0) {
            connection.release();
            return res.status(400).json({ message: 'Cannot place order with an empty cart.' });
        }

        // 3. BEGIN TRANSACTION
        await connection.beginTransaction();

        let totalOrderAmount = 0;
        const processedItems = [];

        // 4. Validate Each Item against Current DB State & Lock Row
        for (const item of cartItems) {
            const [products] = await connection.execute(
                `SELECT product_id, seller_id, product_name, price, stock_quantity, status
                 FROM products
                 WHERE product_id = ?
                 FOR UPDATE`,
                [item.product_id]
            );

            if (products.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({
                    message: `Product with ID ${item.product_id} no longer exists. Checkout cancelled.`
                });
            }

            const product = products[0];

            if (product.status !== 'active') {
                await connection.rollback();
                connection.release();
                return res.status(400).json({
                    message: `Product "${product.product_name}" is currently inactive. Checkout cancelled.`
                });
            }

            if (product.stock_quantity < item.quantity) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({
                    message: `Insufficient stock for "${product.product_name}". Available: ${product.stock_quantity}, requested: ${item.quantity}. Checkout cancelled.`,
                    product_id: product.product_id,
                    available_stock: product.stock_quantity,
                    requested_quantity: item.quantity
                });
            }

            // Always use database price
            const purchasePrice = parseFloat(product.price);
            const lineSubtotal = purchasePrice * item.quantity;
            totalOrderAmount += lineSubtotal;

            processedItems.push({
                product_id: product.product_id,
                seller_id: product.seller_id,
                product_name: product.product_name,
                quantity: item.quantity,
                price: purchasePrice,
                subtotal: parseFloat(lineSubtotal.toFixed(2))
            });

            // Deduct Stock
            await connection.execute(
                'UPDATE products SET stock_quantity = stock_quantity - ? WHERE product_id = ?',
                [item.quantity, product.product_id]
            );
        }

        const effectivePaymentMethod = payment_method || 'Cash on Delivery';
        totalOrderAmount = parseFloat(totalOrderAmount.toFixed(2));

        // 5. Insert Order Record
        const [orderResult] = await connection.execute(
            `INSERT INTO orders (customer_id, address_id, total_amount, status, payment_method, payment_status)
             VALUES (?, ?, ?, 'confirmed', ?, 'pending')`,
            [customerId, resolvedAddressId, totalOrderAmount, effectivePaymentMethod]
        );

        const orderId = orderResult.insertId;

        // 6. Insert Order Items Records
        for (const pItem of processedItems) {
            await connection.execute(
                `INSERT INTO order_items (order_id, product_id, seller_id, quantity, price, item_status)
                 VALUES (?, ?, ?, ?, ?, 'confirmed')`,
                [orderId, pItem.product_id, pItem.seller_id, pItem.quantity, pItem.price]
            );
        }

        // 7. Clear Customer's Cart
        await connection.execute('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);

        // 8. Commit Transaction
        await connection.commit();

        // 9. Audit Logging (non-blocking)
        logActivity(
            customerId,
            'ORDER_PLACED',
            { order_id: orderId, total_amount: totalOrderAmount, items_count: processedItems.length },
            clientIp
        );

        connection.release();

        res.status(201).json({
            message: 'Order created successfully.',
            order_id: orderId,
            customer_id: customerId,
            total_amount: totalOrderAmount,
            status: 'confirmed',
            payment_method: effectivePaymentMethod,
            items: processedItems
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rbErr) {
                console.error('Rollback error:', rbErr.message);
            }
            connection.release();
        }
        console.error('Order creation failed:', error.message);
        res.status(500).json({ message: 'Unable to process order. Transaction rolled back.' });
    }
});

/**
 * GET /api/orders
 * List orders for the current customer
 */
router.get('/', async (req, res) => {
    try {
        const customerId = getCustomerId(req);

        const [orders] = await pool.query(
            `SELECT
                o.order_id,
                o.customer_id,
                o.total_amount,
                o.status,
                o.payment_method,
                o.payment_status,
                o.created_at,
                o.updated_at,
                a.address_line,
                a.city,
                a.state,
                a.postal_code,
                COUNT(oi.order_item_id) AS total_items
             FROM orders o
             LEFT JOIN addresses a ON o.address_id = a.address_id
             LEFT JOIN order_items oi ON o.order_id = oi.order_id
             WHERE o.customer_id = ?
             GROUP BY o.order_id
             ORDER BY o.created_at DESC`,
            [customerId]
        );

        res.json({
            count: orders.length,
            orders
        });
    } catch (error) {
        console.error('Failed to retrieve orders:', error.message);
        res.status(500).json({ message: 'Unable to retrieve customer orders.' });
    }
});

/**
 * GET /api/orders/:id
 * Retrieve specific order details with line items
 */
router.get('/:id', async (req, res) => {
    try {
        const customerId = getCustomerId(req);
        const orderId = Number(req.params.id);

        if (!Number.isInteger(orderId) || orderId <= 0) {
            return res.status(400).json({ message: 'Invalid order ID.' });
        }

        const [orders] = await pool.query(
            `SELECT
                o.order_id,
                o.customer_id,
                o.total_amount,
                o.status,
                o.payment_method,
                o.payment_status,
                o.created_at,
                o.updated_at,
                a.address_line,
                a.city,
                a.state,
                a.postal_code,
                a.country
             FROM orders o
             LEFT JOIN addresses a ON o.address_id = a.address_id
             WHERE o.order_id = ?`,
            [orderId]
        );

        if (orders.length === 0) {
            return res.status(404).json({ message: 'Order not found.' });
        }

        const order = orders[0];

        // Ensure user can only view their own order (unless admin)
        const currentUser = req.session && req.session.user;
        if (currentUser && currentUser.role !== 'admin' && currentUser.role !== 'super_admin') {
            if (order.customer_id !== currentUser.user_id) {
                return res.status(403).json({ message: 'Forbidden: Access denied to this order.' });
            }
        }

        const [items] = await pool.query(
            `SELECT
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
                u.name AS seller_name
             FROM order_items oi
             LEFT JOIN products p ON oi.product_id = p.product_id
             LEFT JOIN users u ON oi.seller_id = u.user_id
             WHERE oi.order_id = ?`,
            [orderId]
        );

        order.items = items;

        res.json(order);
    } catch (error) {
        console.error('Failed to retrieve order details:', error.message);
        res.status(500).json({ message: 'Unable to retrieve order details.' });
    }
});

module.exports = router;
