const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const { pool, testConnection } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Body Parser Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'marketplace_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,   // Set to true if using HTTPS
        httpOnly: true,  // Prevents JavaScript from reading the cookie
        sameSite: 'lax', // Protects against CSRF in most cases
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// Static files (frontend)
app.use(express.static(path.join(__dirname, '../public')));

// Root route
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to the Online Marketplace API',
        status: 'running'
    });
});

// Health check and database test endpoint
app.get('/api/health', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT 1 + 1 AS calculation, NOW() AS server_time');
        res.status(200).json({
            status: 'success',
            message: 'Server is running and MySQL database is connected!',
            data: rows[0]
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Server is running, but database connection failed.',
            error: error.message
        });
    }
});

// Authentication routes (register, login, me, logout)  — Day 3
app.use('/api/auth', require('../routes/authRoutes'));

// Seller routes — Day 3 (ping-only on this branch; full CRUD on feature/backend-seller)
app.use('/api/seller', require('../routes/sellerRoutes'));

// ─── Day 4: Public product catalogue endpoints ──────────────────────────────

// GET /api/categories — list active categories for the filter dropdown.
// Kept inline because it is a single, read-only query with no branching logic.
app.get('/api/categories', async (req, res) => {
    try {
        const [categories] = await pool.query(
            `SELECT category_id, category_name, description
             FROM categories
             WHERE status = 'active'
             ORDER BY category_name ASC`
        );
        res.json(categories);
    } catch (error) {
        console.error('Category listing failed:', error.message);
        res.status(500).json({ message: 'Unable to retrieve categories.' });
    }
});

// GET /api/products        — list products (supports ?search= and ?category=)
// GET /api/products/:id    — single product by ID
app.use('/api/products', require('./routes/products'));

// ─── Day 5: Customer Cart endpoints ─────────────────────────────────────────
// GET    /api/cart                  — retrieve user cart with calculated totals
// POST   /api/cart/items            — add product or increase quantity
// PATCH  /api/cart/items/:productId — update quantity
// DELETE /api/cart/items/:productId — remove product from cart
// DELETE /api/cart                  — clear user cart
app.use('/api/cart', require('./routes/cartRoutes'));

// ─── Day 6: Customer Order endpoints ────────────────────────────────────────
// POST   /api/orders                — checkout active cart and place order
// GET    /api/orders                — retrieve customer order history
// GET    /api/orders/:id            — retrieve single order details
app.use('/api/orders', require('./routes/orderRoutes'));

// ────────────────────────────────────────────────────────────────────────────

// Start the server
app.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    await testConnection();
});

module.exports = app;
