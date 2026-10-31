const express = require('express');
const router = express.Router();
const db = require('../db');

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
async function getOrCreateCart(customerId) {
    const [existing] = await db.execute(
        'SELECT cart_id FROM cart WHERE customer_id = ? LIMIT 1',
        [customerId]
    );

    if (existing.length > 0) {
        return existing[0].cart_id;
    }

    const [insertResult] = await db.execute(
        'INSERT INTO cart (customer_id) VALUES (?)',
        [customerId]
    );

    return insertResult.insertId;
}

/**
 * GET /api/cart
 * Retrieve customer's shopping cart items, line calculations, and total amount.
 */
router.get('/', async (req, res) => {
    try {
        const customerId = getCustomerId(req);
        const cartId = await getOrCreateCart(customerId);

        const [items] = await db.execute(
            `SELECT
                ci.cart_item_id,
                ci.cart_id,
                ci.product_id,
                ci.quantity,
                p.product_name,
                p.price AS current_price,
                ci.price AS item_price,
                p.stock_quantity,
                p.stock_quantity AS stock,
                p.image,
                p.image AS image_url,
                p.status,
                p.category_id,
                c.category_name,
                (ci.quantity * p.price) AS subtotal
            FROM cart_items ci
            JOIN products p ON ci.product_id = p.product_id
            LEFT JOIN categories c ON p.category_id = c.category_id
            WHERE ci.cart_id = ?
            ORDER BY ci.created_at ASC`,
            [cartId]
        );

        let subtotal = 0;
        let totalQuantity = 0;

        const formattedItems = items.map(item => {
            const linePrice = parseFloat(item.current_price) || 0;
            const lineSubtotal = linePrice * item.quantity;
            subtotal += lineSubtotal;
            totalQuantity += item.quantity;

            return {
                cart_item_id: item.cart_item_id,
                cart_id: item.cart_id,
                product_id: item.product_id,
                product_name: item.product_name,
                price: linePrice,
                quantity: item.quantity,
                subtotal: parseFloat(lineSubtotal.toFixed(2)),
                stock_quantity: item.stock_quantity,
                stock: item.stock_quantity,
                image: item.image,
                image_url: item.image,
                status: item.status,
                category_name: item.category_name,
                is_available: item.status === 'active' && item.stock_quantity >= item.quantity
            };
        });

        res.json({
            cart_id: cartId,
            customer_id: customerId,
            item_count: formattedItems.length,
            total_quantity: totalQuantity,
            subtotal: parseFloat(subtotal.toFixed(2)),
            total: parseFloat(subtotal.toFixed(2)),
            items: formattedItems
        });
    } catch (error) {
        console.error('Failed to retrieve cart:', error.message);
        res.status(500).json({ message: 'Unable to retrieve shopping cart.' });
    }
});

/**
 * POST /api/cart
 * Add a product to customer's cart with rigorous server-side stock and status validation.
 * Calculate prices on server from database (never trust client-supplied price).
 */
router.post('/', async (req, res) => {
    try {
        const customerId = getCustomerId(req);
        const { product_id, quantity } = req.body;

        const productId = Number(product_id);
        const reqQuantity = quantity !== undefined ? Number(quantity) : 1;

        // 1. Input Validation
        if (!Number.isInteger(productId) || productId <= 0) {
            return res.status(400).json({
                message: 'Product ID must be a valid positive integer.'
            });
        }

        if (!Number.isInteger(reqQuantity) || reqQuantity <= 0) {
            return res.status(400).json({
                message: 'Requested quantity must be a positive integer.'
            });
        }

        // 2. Fetch product from database & validate status
        const [products] = await db.execute(
            `SELECT product_id, product_name, price, stock_quantity, status
             FROM products
             WHERE product_id = ?`,
            [productId]
        );

        if (products.length === 0 || products[0].status !== 'active') {
            return res.status(404).json({
                message: 'Product not found or unavailable.'
            });
        }

        const product = products[0];
        const serverPrice = parseFloat(product.price);

        // 3. Get customer cart
        const cartId = await getOrCreateCart(customerId);

        // 4. Check existing quantity already in cart
        const [existingItems] = await db.execute(
            'SELECT cart_item_id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?',
            [cartId, productId]
        );

        const currentCartQty = existingItems.length > 0 ? existingItems[0].quantity : 0;
        const totalRequestedQty = currentCartQty + reqQuantity;

        // 5. Stock Validation
        if (totalRequestedQty > product.stock_quantity) {
            return res.status(400).json({
                message: 'Requested quantity exceeds available stock.',
                available_stock: product.stock_quantity,
                in_cart: currentCartQty
            });
        }

        let cartItemId;

        if (existingItems.length > 0) {
            // Update existing cart item
            cartItemId = existingItems[0].cart_item_id;
            await db.execute(
                'UPDATE cart_items SET quantity = ?, price = ? WHERE cart_item_id = ?',
                [totalRequestedQty, serverPrice, cartItemId]
            );
        } else {
            // Insert new cart item
            const [insertResult] = await db.execute(
                'INSERT INTO cart_items (cart_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                [cartId, productId, reqQuantity, serverPrice]
            );
            cartItemId = insertResult.insertId;
        }

        res.status(201).json({
            message: 'Product added to cart successfully.',
            cart_id: cartId,
            cart_item_id: cartItemId,
            product_id: productId,
            product_name: product.product_name,
            quantity: totalRequestedQty,
            price: serverPrice
        });
    } catch (error) {
        console.error('Failed to add product to cart:', error.message);
        res.status(500).json({ message: 'Unable to add product to cart.' });
    }
});

/**
 * PUT /api/cart/:itemId
 * Update cart item quantity with stock validation.
 */
router.put('/:itemId', async (req, res) => {
    try {
        const customerId = getCustomerId(req);
        const cartItemId = Number(req.params.itemId);
        const { quantity } = req.body;

        if (!Number.isInteger(cartItemId) || cartItemId <= 0) {
            return res.status(400).json({ message: 'Invalid cart item ID.' });
        }

        const newQuantity = Number(quantity);
        if (!Number.isInteger(newQuantity) || newQuantity <= 0) {
            return res.status(400).json({
                message: 'Quantity must be a positive integer greater than zero.'
            });
        }

        const cartId = await getOrCreateCart(customerId);

        // Fetch cart item and ensure it belongs to this customer's cart
        const [items] = await db.execute(
            `SELECT ci.cart_item_id, ci.cart_id, ci.product_id, ci.quantity,
                    p.product_name, p.price, p.stock_quantity, p.status
             FROM cart_items ci
             JOIN products p ON ci.product_id = p.product_id
             WHERE ci.cart_item_id = ? AND ci.cart_id = ?`,
            [cartItemId, cartId]
        );

        if (items.length === 0) {
            return res.status(404).json({ message: 'Cart item not found.' });
        }

        const item = items[0];

        if (item.status !== 'active') {
            return res.status(400).json({ message: 'This product is no longer active.' });
        }

        if (newQuantity > item.stock_quantity) {
            return res.status(400).json({
                message: 'Requested quantity exceeds available stock.',
                available_stock: item.stock_quantity
            });
        }

        await db.execute(
            'UPDATE cart_items SET quantity = ?, price = ? WHERE cart_item_id = ?',
            [newQuantity, item.price, cartItemId]
        );

        res.json({
            message: 'Cart quantity updated successfully.',
            cart_item_id: cartItemId,
            quantity: newQuantity,
            price: item.price
        });
    } catch (error) {
        console.error('Failed to update cart quantity:', error.message);
        res.status(500).json({ message: 'Unable to update cart quantity.' });
    }
});

/**
 * DELETE /api/cart/:itemId
 * Remove an item from the customer's cart.
 */
router.delete('/:itemId', async (req, res) => {
    try {
        const customerId = getCustomerId(req);
        const cartItemId = Number(req.params.itemId);

        if (!Number.isInteger(cartItemId) || cartItemId <= 0) {
            return res.status(400).json({ message: 'Invalid cart item ID.' });
        }

        const cartId = await getOrCreateCart(customerId);

        const [result] = await db.execute(
            'DELETE FROM cart_items WHERE cart_item_id = ? AND cart_id = ?',
            [cartItemId, cartId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Cart item not found.' });
        }

        res.json({
            message: 'Item removed from cart successfully.',
            cart_item_id: cartItemId
        });
    } catch (error) {
        console.error('Failed to remove cart item:', error.message);
        res.status(500).json({ message: 'Unable to remove cart item.' });
    }
});

/**
 * DELETE /api/cart
 * Clear all items in customer's cart.
 */
router.delete('/', async (req, res) => {
    try {
        const customerId = getCustomerId(req);
        const cartId = await getOrCreateCart(customerId);

        await db.execute('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);

        res.json({ message: 'Shopping cart cleared successfully.' });
    } catch (error) {
        console.error('Failed to clear cart:', error.message);
        res.status(500).json({ message: 'Unable to clear shopping cart.' });
    }
});

/**
 * Compatibility aliases for customer frontend (/api/cart/items...)
 */
router.post('/items', async (req, res) => {
    // Forward to POST /
    const customerId = getCustomerId(req);
    const { product_id, quantity } = req.body;
    const productId = Number(product_id);
    const reqQuantity = quantity !== undefined ? Number(quantity) : 1;

    if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ error: 'Product ID must be a valid positive integer.' });
    }
    if (!Number.isInteger(reqQuantity) || reqQuantity <= 0) {
        return res.status(400).json({ error: 'Requested quantity must be a positive integer.' });
    }

    const [products] = await db.execute(
        `SELECT product_id, product_name, price, stock_quantity, status FROM products WHERE product_id = ?`,
        [productId]
    );

    if (products.length === 0 || products[0].status !== 'active') {
        return res.status(404).json({ error: 'Product not found or unavailable.' });
    }

    const product = products[0];
    const serverPrice = parseFloat(product.price);
    const cartId = await getOrCreateCart(customerId);

    const [existingItems] = await db.execute(
        'SELECT cart_item_id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?',
        [cartId, productId]
    );

    const currentCartQty = existingItems.length > 0 ? existingItems[0].quantity : 0;
    const totalRequestedQty = currentCartQty + reqQuantity;

    if (totalRequestedQty > product.stock_quantity) {
        return res.status(400).json({
            error: 'Requested quantity exceeds available stock.',
            available_stock: product.stock_quantity,
            in_cart: currentCartQty
        });
    }

    if (existingItems.length > 0) {
        await db.execute(
            'UPDATE cart_items SET quantity = ?, price = ? WHERE cart_item_id = ?',
            [totalRequestedQty, serverPrice, existingItems[0].cart_item_id]
        );
    } else {
        await db.execute(
            'INSERT INTO cart_items (cart_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
            [cartId, productId, reqQuantity, serverPrice]
        );
    }

    res.status(201).json({
        message: 'Product added to cart successfully.',
        product_id: productId,
        quantity: totalRequestedQty
    });
});

router.patch('/items/:productId', async (req, res) => {
    const customerId = getCustomerId(req);
    const productId = Number(req.params.productId);
    const { quantity } = req.body;
    const newQty = Number(quantity);

    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(newQty) || newQty <= 0) {
        return res.status(400).json({ error: 'Invalid product ID or quantity.' });
    }

    const cartId = await getOrCreateCart(customerId);
    const [existing] = await db.execute(
        'SELECT ci.cart_item_id, p.stock_quantity, p.status FROM cart_items ci JOIN products p ON ci.product_id = p.product_id WHERE ci.cart_id = ? AND ci.product_id = ?',
        [cartId, productId]
    );

    if (existing.length === 0) {
        return res.status(404).json({ error: 'Product not in cart.' });
    }

    if (newQty > existing[0].stock_quantity) {
        return res.status(400).json({ error: 'Quantity exceeds available stock.' });
    }

    await db.execute('UPDATE cart_items SET quantity = ? WHERE cart_item_id = ?', [newQty, existing[0].cart_item_id]);
    res.json({ message: 'Cart updated successfully.', quantity: newQty });
});

router.delete('/items/:productId', async (req, res) => {
    const customerId = getCustomerId(req);
    const productId = Number(req.params.productId);
    const cartId = await getOrCreateCart(customerId);

    await db.execute('DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?', [cartId, productId]);
    res.json({ message: 'Product removed from cart successfully.' });
});

module.exports = router;
