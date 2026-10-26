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
        secure: false, // Set to true if using HTTPS
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

const bcrypt = require('bcryptjs');

// Categories endpoint
app.get('/api/categories', async (req, res) => {
    try {
        const [categories] = await pool.query(
            "SELECT category_id, category_name, description FROM categories WHERE status = 'active' ORDER BY category_name ASC"
        );
        res.json(categories);
    } catch (error) {
        console.error('Category listing failed:', error.message);
        res.status(500).json({ message: 'Unable to retrieve categories.' });
    }
});

// Authentication helper endpoints for session management
app.get('/api/auth/me', (req, res) => {
    if (req.session && req.session.user) {
        return res.json({ authenticated: true, user: req.session.user });
    }
    res.json({ authenticated: false, user: null });
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required.' });
        }
        const [users] = await pool.query(
            'SELECT user_id, name, email, password, role, status FROM users WHERE email = ?',
            [email.trim()]
        );
        if (users.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }
        const user = users[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }
        req.session.user = {
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status
        };
        res.json({ message: 'Login successful.', user: req.session.user });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Login failed.' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ message: 'Could not log out.' });
        res.clearCookie('connect.sid');
        res.json({ message: 'Logged out successfully.' });
    });
});

// Seller Product routes
const sellerProductRoutes = require('./routes/sellerProducts');
app.use('/api/seller/products', sellerProductRoutes);

// Seller general routes
app.use('/api/seller', require('../routes/sellerRoutes'));

// Product routes
const productRoutes = require('./routes/products');
app.use('/api/products', productRoutes);

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
