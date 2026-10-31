const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /api/products
// List active products, with optional search and category filters.
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

    if (search && search.trim()) {
      sql += " AND p.product_name LIKE ?";
      params.push(`%${search.trim()}%`);
    }

    if (category) {
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
      count: products.length,
      products
    });
  } catch (error) {
    console.error("Product listing failed:", error.message);
    res.status(500).json({
      message: "Unable to retrieve products."
    });
  }
});

// GET /api/products/:id
// Get one active product by ID.
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
      message: "Unable to retrieve the product."
    });
  }
});

module.exports = router;
