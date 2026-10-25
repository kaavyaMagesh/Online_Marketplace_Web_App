const express = require('express');
const router = express.Router();
const db = require('../server/db');
const { requireSeller, verifyProductOwnership } = require('../middleware/auth');

// Public test route
router.get('/ping', (req, res) => {
    res.json({ message: 'Seller route is working' });
});

/**
 * GET /api/seller/products
 * List products belonging to the logged-in seller.
 * Sellers cannot see or manage competitors' products here.
 */
router.get('/products', requireSeller, async (req, res) => {
    try {
        const sellerId = req.session.user.user_id;

        const [products] = await db.execute(
            `SELECT
                p.product_id,
                p.seller_id,
                p.product_name,
                p.description,
                p.price,
                p.stock_quantity,
                p.stock_quantity AS stock,
                p.image,
                p.image AS image_url,
                p.status,
                p.category_id,
                c.category_name,
                p.created_at,
                p.updated_at
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            WHERE p.seller_id = ?
            ORDER BY p.created_at DESC`,
            [sellerId]
        );

        res.json({
            count: products.length,
            seller_id: sellerId,
            products
        });
    } catch (err) {
        console.error('Failed to fetch seller products:', err.message);
        res.status(500).json({ error: 'Unable to retrieve seller products.' });
    }
});

/**
 * GET /api/seller/products/:id
 * Retrieve a specific product owned by the seller.
 */
router.get('/products/:id', requireSeller, verifyProductOwnership, async (req, res) => {
    try {
        const productId = Number(req.params.id);

        const [products] = await db.execute(
            `SELECT
                p.product_id,
                p.seller_id,
                p.product_name,
                p.description,
                p.price,
                p.stock_quantity,
                p.stock_quantity AS stock,
                p.image,
                p.image AS image_url,
                p.status,
                p.category_id,
                c.category_name,
                p.created_at,
                p.updated_at
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            WHERE p.product_id = ?
            LIMIT 1`,
            [productId]
        );

        res.json(products[0]);
    } catch (err) {
        console.error('Failed to get seller product:', err.message);
        res.status(500).json({ error: 'Unable to retrieve product.' });
    }
});

/**
 * POST /api/seller/products
 * Create a new product for the authenticated seller.
 */
router.post('/products', requireSeller, async (req, res) => {
    try {
        const sellerId = req.session.user.user_id;
        const { product_name, description, price, stock_quantity, stock, image, image_url, category_id, status } = req.body;

        const name = (product_name || '').trim();
        const effectivePrice = Number(price);
        const effectiveStock = Number(stock_quantity !== undefined ? stock_quantity : stock);
        const effectiveImage = image || image_url || null;
        const effectiveCategory = category_id ? Number(category_id) : null;
        const effectiveStatus = status === 'inactive' ? 'inactive' : 'active';

        if (!name) {
            return res.status(400).json({ error: 'Product name is required.' });
        }

        if (isNaN(effectivePrice) || effectivePrice < 0) {
            return res.status(400).json({ error: 'Price must be a valid non-negative number.' });
        }

        if (!Number.isInteger(effectiveStock) || effectiveStock < 0) {
            return res.status(400).json({ error: 'Stock quantity must be a non-negative integer.' });
        }

        const [result] = await db.execute(
            `INSERT INTO products (seller_id, category_id, product_name, description, price, stock_quantity, image, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [sellerId, effectiveCategory, name, description || null, effectivePrice, effectiveStock, effectiveImage, effectiveStatus]
        );

        res.status(201).json({
            message: 'Product created successfully.',
            product_id: result.insertId,
            seller_id: sellerId
        });
    } catch (err) {
        console.error('Failed to create product:', err.message);
        res.status(500).json({ error: 'Unable to create product.' });
    }
});

/**
 * PUT /api/seller/products/:id
 * Update an existing product.
 * Ownership check ensures Seller A cannot update Seller B's product.
 */
router.put('/products/:id', requireSeller, verifyProductOwnership, async (req, res) => {
    try {
        const productId = Number(req.params.id);
        const { product_name, description, price, stock_quantity, stock, image, image_url, category_id, status } = req.body;

        const updates = [];
        const params = [];

        if (product_name !== undefined) {
            if (!product_name.trim()) return res.status(400).json({ error: 'Product name cannot be empty.' });
            updates.push('product_name = ?');
            params.push(product_name.trim());
        }

        if (description !== undefined) {
            updates.push('description = ?');
            params.push(description);
        }

        if (price !== undefined) {
            const p = Number(price);
            if (isNaN(p) || p < 0) return res.status(400).json({ error: 'Price must be non-negative.' });
            updates.push('price = ?');
            params.push(p);
        }

        const stockVal = stock_quantity !== undefined ? stock_quantity : stock;
        if (stockVal !== undefined) {
            const s = Number(stockVal);
            if (!Number.isInteger(s) || s < 0) return res.status(400).json({ error: 'Stock must be a non-negative integer.' });
            updates.push('stock_quantity = ?');
            params.push(s);
        }

        const imgVal = image !== undefined ? image : image_url;
        if (imgVal !== undefined) {
            updates.push('image = ?');
            params.push(imgVal);
        }

        if (category_id !== undefined) {
            const catId = category_id === null ? null : Number(category_id);
            updates.push('category_id = ?');
            params.push(catId);
        }

        if (status !== undefined) {
            if (!['active', 'inactive'].includes(status)) {
                return res.status(400).json({ error: 'Status must be active or inactive.' });
            }
            updates.push('status = ?');
            params.push(status);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields provided to update.' });
        }

        params.push(productId);
        await db.execute(`UPDATE products SET ${updates.join(', ')} WHERE product_id = ?`, params);

        res.json({
            message: 'Product updated successfully.',
            product_id: productId
        });
    } catch (err) {
        console.error('Failed to update product:', err.message);
        res.status(500).json({ error: 'Unable to update product.' });
    }
});

/**
 * DELETE /api/seller/products/:id
 * Deactivates or removes a product with ownership check.
 */
router.delete('/products/:id', requireSeller, verifyProductOwnership, async (req, res) => {
    try {
        const productId = Number(req.params.id);

        // Soft delete by setting status to inactive
        await db.execute("UPDATE products SET status = 'inactive' WHERE product_id = ?", [productId]);

        res.json({
            message: 'Product deactivated successfully.',
            product_id: productId
        });
    } catch (err) {
        console.error('Failed to delete product:', err.message);
        res.status(500).json({ error: 'Unable to delete product.' });
    }
});

module.exports = router;
