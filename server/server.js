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

// Seller routes
app.use('/api/seller', require('../routes/sellerRoutes'));

// Product routes
const productRoutes = require('./routes/products');
app.use('/api/products', productRoutes);


// Start the server
if (require.main === module) {
    app.listen(PORT, async () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        await testConnection();
    });
}


module.exports = app;
