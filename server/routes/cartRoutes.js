/*
 * server/routes/cartRoutes.js — GoodsPlatz Customer Cart API
 *
 * Responsibilities:
 *   1. Enforce authentication on all cart endpoints (401 for guests).
 *   2. Associate cart data strictly with req.session.user.user_id.
 *   3. Enforce real-time inventory validation (stock_quantity > 0, status = 'active').
 *   4. Recalculate all subtotals and totals from database product prices.
 *   5. Ensure cart operations NEVER deduct or reserve inventory stock.
 *   6. Use parameterized SQL queries exclusively.
 *
 * Endpoints:
 *   GET    /api/cart                  — Retrieve current user's cart with totals
 *   POST   /api/cart/items            — Add product or increase existing quantity
 *   PATCH  /api/cart/items/:productId — Update quantity (direct number or step)
 *   DELETE /api/cart/items/:productId — Remove single product from cart
 *   DELETE /api/cart                  — Clear all items from cart
 */

"use strict";

const express = require("express");
const router  = express.Router();
const db      = require("../db");
const { isAuthenticated } = require("../../middleware/auth");

// All cart routes require an authenticated, active user session.
router.use(isAuthenticated);

/**
 * Helper: Retrieve or create a cart for the authenticated user.
 * Each user has exactly one unique cart record in the `cart` table.
 *
 * @param {number} userId
 * @returns {Promise<number>} cart_id
 */
async function getOrCreateCart(userId) {
    // 1. Check for existing cart
    const [rows] = await db.execute(
        "SELECT cart_id FROM cart WHERE user_id = ?",
        [userId]
    );

    if (rows.length > 0) {
        return rows[0].cart_id;
    }

    // 2. Create new cart if none exists
    try {
        const [result] = await db.execute(
            "INSERT INTO cart (user_id) VALUES (?)",
            [userId]
        );
        return result.insertId;
    } catch (err) {
        // If a concurrent request inserted the cart first, recover by querying
        if (err.code === "ER_DUP_ENTRY") {
            const [retryRows] = await db.execute(
                "SELECT cart_id FROM cart WHERE user_id = ?",
                [userId]
            );
            if (retryRows.length > 0) {
                return retryRows[0].cart_id;
            }
        }
        throw err;
    }
}

/* ─── GET /api/cart ──────────────────────────────────────────────
 * Retrieve the authenticated user's cart items, calculating
 * item subtotals, overall cart subtotal, and total from current DB values.
 */
router.get("/", async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const cartId = await getOrCreateCart(userId);

        const [items] = await db.execute(
            `SELECT
                ci.cart_item_id,
                ci.cart_id,
                ci.product_id,
                ci.quantity,
                ci.added_at,
                p.product_name,
                p.description,
                p.price,
                p.stock_quantity,
                p.stock_quantity AS stock,
                p.image,
                p.image AS image_url,
                p.status AS product_status,
                c.category_name
             FROM cart_items ci
             JOIN products p ON ci.product_id = p.product_id
             LEFT JOIN categories c ON p.category_id = c.category_id
             WHERE ci.cart_id = ?
             ORDER BY ci.added_at DESC`,
            [cartId]
        );

        let subtotal = 0;
        let totalItems = 0;

        const formattedItems = items.map((item) => {
            const unitPrice = Number(item.price) || 0;
            const quantity  = Number(item.quantity) || 0;
            const stockQty  = Number(item.stock_quantity) || 0;
            const itemSubtotal = parseFloat((unitPrice * quantity).toFixed(2));

            subtotal += itemSubtotal;
            totalItems += quantity;

            const isAvailable = item.product_status === "active" && stockQty > 0;
            const exceedsStock = quantity > stockQty;

            return {
                cart_item_id:   item.cart_item_id,
                product_id:     item.product_id,
                product_name:   item.product_name,
                description:    item.description,
                price:          unitPrice,
                quantity:       quantity,
                stock:          stockQty,
                stock_quantity: stockQty,
                image:          item.image,
                image_url:      item.image_url,
                category_name:  item.category_name,
                product_status: item.product_status,
                is_available:   isAvailable,
                exceeds_stock:  exceedsStock,
                subtotal:       itemSubtotal
            };
        });

        const finalSubtotal = parseFloat(subtotal.toFixed(2));
        const finalTotal    = finalSubtotal; // Free shipping in marketplace

        res.json({
            cart_id:     cartId,
            items:       formattedItems,
            item_count:  formattedItems.length,
            total_items: totalItems,
            subtotal:    finalSubtotal,
            total:       finalTotal
        });
    } catch (error) {
        console.error("Cart retrieval error:", error.message);
        res.status(500).json({ error: "Unable to retrieve cart items. Please try again." });
    }
});

/* ─── POST /api/cart/items ───────────────────────────────────────
 * Add a product to the authenticated user's cart or increase quantity
 * if already present. Enforces real-time stock limits without modifying inventory.
 */
router.post("/items", async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const { product_id, quantity } = req.body;

        // 1. Validate Product ID
        const productId = Number(product_id);
        if (!Number.isInteger(productId) || productId <= 0) {
            return res.status(400).json({ error: "Product ID must be a valid positive integer." });
        }

        // 2. Validate Quantity (default: 1)
        const addQty = quantity !== undefined ? Number(quantity) : 1;
        if (!Number.isInteger(addQty) || addQty <= 0) {
            return res.status(400).json({ error: "Quantity must be a positive integer." });
        }

        // 3. Verify product in database: must exist, be active, and in stock
        const [products] = await db.execute(
            `SELECT product_id, product_name, price, stock_quantity, status
             FROM products
             WHERE product_id = ?`,
            [productId]
        );

        if (products.length === 0) {
            return res.status(404).json({ error: "Product not found." });
        }

        const product = products[0];

        if (product.status !== "active") {
            return res.status(400).json({ error: "This product is currently inactive and cannot be added to cart." });
        }

        if (product.stock_quantity <= 0) {
            return res.status(400).json({ error: "This product is currently out of stock." });
        }

        const cartId = await getOrCreateCart(userId);

        // 4. Check if item already exists in user's cart
        const [existing] = await db.execute(
            "SELECT cart_item_id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?",
            [cartId, productId]
        );

        if (existing.length > 0) {
            const currentQty = existing[0].quantity;
            const newQty = currentQty + addQty;

            // Enforce stock ceiling
            if (newQty > product.stock_quantity) {
                return res.status(400).json({
                    error: `Cannot add ${addQty} more. Only ${product.stock_quantity} available in stock (you already have ${currentQty} in your cart).`
                });
            }

            await db.execute(
                "UPDATE cart_items SET quantity = ?, added_at = CURRENT_TIMESTAMP WHERE cart_id = ? AND product_id = ?",
                [newQty, cartId, productId]
            );

            return res.status(200).json({
                message: "Cart updated successfully.",
                cart_id: cartId,
                product_id: productId,
                product_name: product.product_name,
                quantity: newQty
            });
        } else {
            // New item addition
            if (addQty > product.stock_quantity) {
                return res.status(400).json({
                    error: `Requested quantity (${addQty}) exceeds available stock (${product.stock_quantity}).`
                });
            }

            await db.execute(
                "INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)",
                [cartId, productId, addQty]
            );

            return res.status(201).json({
                message: "Product added to cart.",
                cart_id: cartId,
                product_id: productId,
                product_name: product.product_name,
                quantity: addQty
            });
        }
    } catch (error) {
        console.error("Add to cart error:", error.message);
        res.status(500).json({ error: "Unable to add product to cart. Please try again." });
    }
});

/* ─── PATCH /api/cart/items/:productId ───────────────────────────
 * Update quantity for a specific product in the cart.
 * Supports direct quantity `{ quantity: N }` or step `{ action: "increase" | "decrease" }`.
 */
router.patch("/items/:productId", async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const productId = Number(req.params.productId);

        if (!Number.isInteger(productId) || productId <= 0) {
            return res.status(400).json({ error: "Product ID must be a valid positive integer." });
        }

        const cartId = await getOrCreateCart(userId);

        // 1. Verify item exists in user's cart
        const [existing] = await db.execute(
            `SELECT ci.cart_item_id, ci.quantity, p.product_name, p.stock_quantity, p.status
             FROM cart_items ci
             JOIN products p ON ci.product_id = p.product_id
             WHERE ci.cart_id = ? AND ci.product_id = ?`,
            [cartId, productId]
        );

        if (existing.length === 0) {
            return res.status(404).json({ error: "Product not found in your cart." });
        }

        const currentItem = existing[0];
        let targetQty;

        // 2. Resolve target quantity
        if (req.body.action === "increase") {
            targetQty = currentItem.quantity + 1;
        } else if (req.body.action === "decrease") {
            targetQty = currentItem.quantity - 1;
            if (targetQty < 1) {
                return res.status(400).json({
                    error: "Quantity cannot be less than 1. Please click Remove to remove this item."
                });
            }
        } else if (req.body.quantity !== undefined) {
            targetQty = Number(req.body.quantity);
            if (!Number.isInteger(targetQty) || targetQty <= 0) {
                return res.status(400).json({
                    error: "Quantity must be a positive integer greater than zero."
                });
            }
        } else {
            return res.status(400).json({
                error: "Please provide either a valid 'quantity' or 'action' ('increase'/'decrease')."
            });
        }

        // 3. Verify stock availability
        if (targetQty > currentItem.stock_quantity) {
            return res.status(400).json({
                error: `Cannot set quantity to ${targetQty}. Only ${currentItem.stock_quantity} units available in stock.`
            });
        }

        // 4. Update quantity
        await db.execute(
            "UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND product_id = ?",
            [targetQty, cartId, productId]
        );

        res.json({
            message: "Cart quantity updated.",
            cart_id: cartId,
            product_id: productId,
            product_name: currentItem.product_name,
            quantity: targetQty
        });
    } catch (error) {
        console.error("Update cart quantity error:", error.message);
        res.status(500).json({ error: "Unable to update cart quantity. Please try again." });
    }
});

/* ─── DELETE /api/cart/items/:productId ──────────────────────────
 * Remove a specific product from the authenticated user's cart.
 */
router.delete("/items/:productId", async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const productId = Number(req.params.productId);

        if (!Number.isInteger(productId) || productId <= 0) {
            return res.status(400).json({ error: "Product ID must be a valid positive integer." });
        }

        const cartId = await getOrCreateCart(userId);

        const [result] = await db.execute(
            "DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?",
            [cartId, productId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Item not found in your cart." });
        }

        res.json({
            message: "Item removed from cart.",
            cart_id: cartId,
            product_id: productId
        });
    } catch (error) {
        console.error("Remove cart item error:", error.message);
        res.status(500).json({ error: "Unable to remove item from cart. Please try again." });
    }
});

/* ─── DELETE /api/cart ───────────────────────────────────────────
 * Clear all items from the authenticated user's cart.
 */
router.delete("/", async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const cartId = await getOrCreateCart(userId);

        await db.execute(
            "DELETE FROM cart_items WHERE cart_id = ?",
            [cartId]
        );

        res.json({
            message: "Cart cleared successfully.",
            cart_id: cartId
        });
    } catch (error) {
        console.error("Clear cart error:", error.message);
        res.status(500).json({ error: "Unable to clear cart. Please try again." });
    }
});

module.exports = router;
