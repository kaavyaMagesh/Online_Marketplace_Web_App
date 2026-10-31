/*
 * server/routes/products.js — GoodsPlatz public product catalogue API
 *
 * Endpoints (all public — no authentication required):
 *   GET /api/products           — list active, in-stock products
 *                                 Optional query params:
 *                                   ?search=<term>    case-insensitive match on product_name or description
 *                                   ?category=<id>    filter by category_id (positive integer)
 *   GET /api/products/:id       — fetch one active product by product_id
 *
 * Rules enforced:
 *   - Only products with status = 'active' AND stock_quantity > 0 are returned.
 *   - Products whose category is inactive are excluded (unless uncategorised).
 *   - All query parameters are validated and parameterised — no SQL injection risk.
 *   - Returns both stock_quantity/stock and image/image_url for compatibility.
 *   - Seller-only operations (create / update / delete) remain in protected seller routes.
 */

"use strict";

const express = require("express");
const router  = express.Router();
const db      = require("../db");

/* ─── GET /api/products ──────────────────────────────────────────
 * List active products, with optional search and category filters.
 * Both filters can be combined in a single request.
 */
router.get("/", async (req, res) => {
    try {
        const { search, category } = req.query;

        let sql = `
            SELECT
                p.product_id,
                p.product_name,
                p.description,
                p.price,
                p.stock_quantity,
                p.stock_quantity AS stock,
                p.image,
                p.image AS image_url,
                p.status,
                p.category_id,
                c.category_name
            FROM products p
            LEFT JOIN categories c
                ON p.category_id = c.category_id
            WHERE p.status = 'active'
              AND p.stock_quantity > 0
              AND (c.status = 'active' OR c.category_id IS NULL)
        `;

        const params = [];

        // Optional search — matches partial product names or descriptions
        if (search && search.trim()) {
            sql += " AND (p.product_name LIKE ? OR p.description LIKE ?)";
            const searchTerm = `%${search.trim()}%`;
            params.push(searchTerm, searchTerm);
        }

        // Optional category filter — must be a positive integer
        if (category !== undefined && category !== "") {
            const categoryId = Number(category);

            if (!Number.isInteger(categoryId) || categoryId <= 0) {
                return res.status(400).json({
                    message: "Category must be a valid positive integer."
                });
            }

            sql += " AND p.category_id = ?";
            params.push(categoryId);
        }

        sql += " ORDER BY p.created_at DESC";

        const [products] = await db.execute(sql, params);

        res.json({
            count:    products.length,
            products: products
        });
    } catch (error) {
        console.error("Product listing failed:", error.message);
        res.status(500).json({
            message: "Unable to retrieve products. Please try again later."
        });
    }
});

/* ─── GET /api/products/:id ─────────────────────────────────────
 * Fetch a single active product by its product_id.
 * Returns 400 for a non-integer id, 404 if not found or inactive.
 */
router.get("/:id", async (req, res) => {
    try {
        const productId = Number(req.params.id);

        if (!Number.isInteger(productId) || productId <= 0) {
            return res.status(400).json({
                message: "Product ID must be a valid positive integer."
            });
        }

        const [products] = await db.execute(
            `SELECT
                p.product_id,
                p.product_name,
                p.description,
                p.price,
                p.stock_quantity,
                p.stock_quantity AS stock,
                p.image,
                p.image AS image_url,
                p.status,
                p.category_id,
                c.category_name
             FROM products p
             LEFT JOIN categories c
                ON p.category_id = c.category_id
             WHERE p.product_id = ?
               AND p.status = 'active'
               AND (c.status = 'active' OR c.category_id IS NULL)
             LIMIT 1`,
            [productId]
        );

        if (products.length === 0) {
            return res.status(404).json({
                message: "Product not found."
            });
        }

        res.json(products[0]);
    } catch (error) {
        console.error("Product lookup failed:", error.message);
        res.status(500).json({
            message: "Unable to retrieve the product. Please try again later."
        });
    }
});

module.exports = router;
