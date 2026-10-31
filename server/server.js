const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const { pool, testConnection } = require('./db');
const { requireRole } = require('../middleware/auth');

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

// Admin CSS and JavaScript assets
app.use(
    '/admin/css',
    express.static(path.join(__dirname, '../frontend/admin/css'))
);

app.use(
    '/admin/js',
    express.static(path.join(__dirname, '../frontend/admin/js'))
);

// Protected Admin HTML pages
const adminPages = ['dashboard', 'customers', 'sellers', 'products', 'categories'];

adminPages.forEach((page) => {
    app.get(`/admin/${page}.html`, requireRole('admin'), (req, res) => {
        res.sendFile(
            path.join(__dirname, `../frontend/admin/${page}.html`)
        );
    });
});

app.get(
    '/admin/super-dashboard.html',
    requireRole('super_admin'),
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                '../frontend/admin/super-dashboard.html'
            )
        );
    }
);

// Root route - Serve storefront
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API Info endpoint
app.get('/api', (req, res) => {
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

// GET /api/categories — list active categories for the filter dropdown
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

// Authentication routes (register, login, me, logout, profile, password)
app.use('/api/auth', require('../routes/authRoutes'));

// Seller Product routes
const sellerProductRoutes = require('./routes/sellerProducts');
app.use('/api/seller/products', sellerProductRoutes);

// Seller Order & Report routes
app.use('/api/seller/orders', require('./routes/sellerOrders'));
app.use('/api/seller/reports', require('./routes/sellerReports'));

// Seller general routes
app.use('/api/seller', require('../routes/sellerRoutes'));

// Admin check routes (from admin-superadmin branch)
app.use('/api/admin', require('../routes/adminRoutes'));

// Product catalogue routes
const productRoutes = require('./routes/products');
app.use('/api/products', productRoutes);

// Shopping cart routes (supports both /items syntax and standard cart syntax)
const cartRoutes = require('./routes/cart');
app.use('/api/cart', cartRoutes);

// Orders routes (supports checkout, order history, cancel)
const orderRoutes = require('./routes/orders');
app.use('/api/orders', orderRoutes);

// Admin & Super Admin routes (seller moderation, audit logs, system settings)
app.use('/api/admin', require('./routes/admin'));
app.use('/api/superadmin', require('./routes/superadmin'));

// Seller dashboard quick redirect
app.get('/seller', (req, res) => {
    res.redirect('/seller/dashboard.html');
});

// Start the server
if (require.main === module) {
    app.listen(PORT, async () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        await testConnection();
    });
}

module.exports = app;
