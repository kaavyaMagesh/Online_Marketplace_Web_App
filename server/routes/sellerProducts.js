const express = require("express");
const router = express.Router();
const db = require("../db");

// Check that the user is a logged-in seller
function requireSeller(req, res, next) {
  const user = req.session?.user;

  if (!user) {
    return res.status(401).json({
      message: "Please log in.",
      error: "Unauthorized: Please log in."
    });
  }

  if (user.role !== "seller" && user.role !== "admin" && user.role !== "super_admin") {
    return res.status(403).json({
      message: "Seller access required.",
      error: "Forbidden: Only registered sellers can access this endpoint."
    });
  }

  if (user.status && user.status !== "active") {
    return res.status(403).json({
      message: "Seller account is not active.",
      error: "Forbidden: Your seller account is not active or has been suspended."
    });
  }

  next();
}

// GET: Fetch active categories for product form dropdown
router.get("/categories", requireSeller, async (req, res) => {
  try {
    const [categories] = await db.execute(
      "SELECT category_id, category_name, description FROM categories WHERE status = 'active' ORDER BY category_name ASC"
    );
    res.json(categories);
  } catch (error) {
    console.error("Could not load categories:", error);
    res.status(500).json({ message: "Could not load categories." });
  }
});

// GET: View this seller's products
router.get("/", requireSeller, async (req, res) => {
  try {
    const sellerId = req.session.user.user_id;

    const [products] = await db.execute(
      `SELECT p.product_id, p.seller_id, p.product_name, p.description, p.price,
              p.stock_quantity, p.image, p.category_id, c.category_name, p.status, p.created_at
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.category_id
       WHERE p.seller_id = ?
       ORDER BY p.created_at DESC`,
      [sellerId]
    );

    res.json(products);
  } catch (error) {
    console.error("Could not load products:", error);
    res.status(500).json({ message: "Could not load products." });
  }
});

// GET: View a single product owned by this seller
router.get("/:id", requireSeller, async (req, res) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: "Invalid product ID." });
    }

    const [products] = await db.execute(
      `SELECT p.product_id, p.seller_id, p.product_name, p.description, p.price,
              p.stock_quantity, p.image, p.category_id, c.category_name, p.status, p.created_at
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.category_id
       WHERE p.product_id = ?`,
      [productId]
    );

    if (products.length === 0) {
      return res.status(404).json({ message: "Product not found." });
    }

    const isOwner = products[0].seller_id === req.session.user.user_id;
    const isAdmin = req.session.user.role === "admin" || req.session.user.role === "super_admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        message: "Product not owned by you.",
        error: "Forbidden: You do not have permission to manage this product."
      });
    }

    res.json(products[0]);
  } catch (error) {
    console.error("Could not load product:", error);
    res.status(500).json({ message: "Could not load product." });
  }
});

// POST: Add a product
router.post("/", requireSeller, async (req, res) => {
  try {
    const {
      product_name,
      description,
      price,
      stock_quantity,
      stock,
      category_id,
      image,
      image_url,
      status
    } = req.body;

    const effectiveStock = stock_quantity !== undefined ? stock_quantity : stock;
    const effectiveImage = image !== undefined ? image : image_url;

    if (
      typeof product_name !== "string" ||
      !product_name.trim() ||
      price === undefined ||
      !Number.isFinite(Number(price)) ||
      Number(price) < 0 ||
      !Number.isInteger(Number(effectiveStock)) ||
      Number(effectiveStock) < 0 ||
      !Number.isInteger(Number(category_id)) ||
      Number(category_id) <= 0
    ) {
      return res.status(400).json({
        message: "Enter a valid name, price, stock quantity and category."
      });
    }

    const [categories] = await db.execute(
      "SELECT category_id FROM categories WHERE category_id = ? AND status = 'active'",
      [category_id]
    );

    if (categories.length === 0) {
      return res.status(400).json({ message: "Invalid or inactive category." });
    }

    const initialStatus = status === "inactive" ? "inactive" : "active";

    const [result] = await db.execute(
      `INSERT INTO products
       (seller_id, category_id, product_name, description, price,
        stock_quantity, image, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.session.user.user_id,
        Number(category_id),
        product_name.trim(),
        description || null,
        Number(price),
        Number(effectiveStock),
        effectiveImage || null,
        initialStatus
      ]
    );

    res.status(201).json({
      message: "Product added successfully.",
      product_id: result.insertId,
      seller_id: req.session.user.user_id
    });
  } catch (error) {
    console.error("Could not add product:", error);
    res.status(500).json({ message: "Could not add product." });
  }
});

// PUT: Update a product owned by this seller
router.put("/:id", requireSeller, async (req, res) => {
  try {
    const productId = Number(req.params.id);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: "Invalid product ID." });
    }

    // Verify product exists and belongs to this seller
    const [existing] = await db.execute(
      "SELECT product_id, seller_id, category_id, product_name, description, price, stock_quantity, image, status FROM products WHERE product_id = ?",
      [productId]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        message: "Product not found or not owned by you.",
        error: "Product not found."
      });
    }

    const current = existing[0];
    const isOwner = current.seller_id === req.session.user.user_id;
    const isAdmin = req.session.user.role === "admin" || req.session.user.role === "super_admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        message: "Product not found or not owned by you.",
        error: "Forbidden: You do not have permission to manage this product."
      });
    }

    const {
      product_name,
      description,
      price,
      stock_quantity,
      stock,
      category_id,
      image,
      image_url,
      status
    } = req.body;

    const targetName = product_name !== undefined ? product_name : current.product_name;
    const targetDesc = description !== undefined ? description : current.description;
    const targetPrice = price !== undefined ? price : current.price;
    const rawStock = stock_quantity !== undefined ? stock_quantity : (stock !== undefined ? stock : current.stock_quantity);
    const rawCategory = category_id !== undefined ? category_id : current.category_id;
    const targetImage = image !== undefined ? image : (image_url !== undefined ? image_url : current.image);
    const targetStatus = status !== undefined ? status : current.status;

    if (
      typeof targetName !== "string" ||
      !targetName.trim() ||
      targetPrice === undefined ||
      !Number.isFinite(Number(targetPrice)) ||
      Number(targetPrice) < 0 ||
      !Number.isInteger(Number(rawStock)) ||
      Number(rawStock) < 0 ||
      !Number.isInteger(Number(rawCategory)) ||
      Number(rawCategory) <= 0
    ) {
      return res.status(400).json({ message: "Invalid product details." });
    }

    if (status !== undefined && !["active", "inactive"].includes(status)) {
      return res.status(400).json({ message: "Status must be active or inactive." });
    }

    const [categories] = await db.execute(
      "SELECT category_id FROM categories WHERE category_id = ? AND status = 'active'",
      [rawCategory]
    );

    if (categories.length === 0) {
      return res.status(400).json({ message: "Invalid or inactive category." });
    }

    const [result] = await db.execute(
      `UPDATE products
       SET product_name = ?, description = ?, price = ?,
           stock_quantity = ?, category_id = ?, image = ?, status = ?
       WHERE product_id = ? AND seller_id = ?`,
      [
        targetName.trim(),
        targetDesc || null,
        Number(targetPrice),
        Number(rawStock),
        Number(rawCategory),
        targetImage || null,
        targetStatus,
        productId,
        current.seller_id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Product not found or not owned by you."
      });
    }

    res.json({ message: "Product updated successfully.", product_id: productId });
  } catch (error) {
    console.error("Could not update product:", error);
    res.status(500).json({ message: "Could not update product." });
  }
});

// DELETE: Soft-delete by deactivating the product
router.delete("/:id", requireSeller, async (req, res) => {
  try {
    const productId = Number(req.params.id);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: "Invalid product ID." });
    }

    const [existing] = await db.execute(
      "SELECT product_id, seller_id FROM products WHERE product_id = ?",
      [productId]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        message: "Product not found or not owned by you.",
        error: "Product not found."
      });
    }

    const isOwner = existing[0].seller_id === req.session.user.user_id;
    const isAdmin = req.session.user.role === "admin" || req.session.user.role === "super_admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        message: "Product not found or not owned by you.",
        error: "Forbidden: You do not have permission to manage this product."
      });
    }

    const [result] = await db.execute(
      `UPDATE products
       SET status = 'inactive'
       WHERE product_id = ? AND seller_id = ?`,
      [productId, existing[0].seller_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Product not found or not owned by you."
      });
    }

    res.json({ message: "Product deactivated successfully.", product_id: productId });
  } catch (error) {
    console.error("Could not deactivate product:", error);
    res.status(500).json({ message: "Could not deactivate product." });
  }
});

module.exports = router;
