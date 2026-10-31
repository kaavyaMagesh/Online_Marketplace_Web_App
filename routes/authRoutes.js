const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { pool } = require('../server/db');
const { logActivity } = require('../server/utils/logger');

// Helpers
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidMobile(mobile) {
    return /^[0-9]{10}$/.test(mobile);
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const name     = (req.body.name     || '').trim();
    const email    = (req.body.email    || '').trim().toLowerCase();
    const phone    = (req.body.phone    || '').trim();
    const password = (req.body.password || '');
    const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';

    if (!name || !email || !phone || !password) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    if (!isValidMobile(phone)) {
        return res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' });
    }

    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    try {
        const [existing] = await pool.query(
            'SELECT user_id FROM users WHERE email = ?',
            [email]
        );

        if (existing.length > 0) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const [result] = await pool.query(
            `INSERT INTO users (name, email, password, phone, role, status)
             VALUES (?, ?, ?, ?, 'customer', 'active')`,
            [name, email, hashedPassword, phone]
        );

        logActivity(result.insertId, 'USER_REGISTERED', { email, name, role: 'customer' }, clientIp);

        return res.status(201).json({
            message: 'Registration successful. You can now log in.',
            user: {
                user_id: result.insertId,
                name:    name,
                email:   email,
                role:    'customer'
            }
        });

    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }
        console.error('Registration error:', err.message);
        return res.status(500).json({ error: 'Registration failed. Please try again later.' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const email    = (req.body.email    || '').trim().toLowerCase();
    const password = (req.body.password || '');
    const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    try {
        const [rows] = await pool.query(
            'SELECT user_id, name, email, password, phone, role, status FROM users WHERE email = ?',
            [email]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = rows[0];

        if (user.status === 'blocked') {
            return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
        }

        if (user.status === 'pending') {
            return res.status(403).json({ error: 'Your account is pending approval.' });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        req.session.user = {
            user_id: user.user_id,
            name:    user.name,
            email:   user.email,
            phone:   user.phone,
            role:    user.role,
            status:  user.status
        };

        logActivity(user.user_id, 'USER_LOGIN', { email: user.email, role: user.role }, clientIp);

        return res.status(200).json({
            message: 'Login successful.',
            user: {
                user_id: user.user_id,
                name:    user.name,
                email:   user.email,
                role:    user.role
            }
        });

    } catch (err) {
        console.error('Login error:', err.message);
        return res.status(500).json({ error: 'Login failed. Please try again later.' });
    }
});

// GET /api/auth/me
router.get('/me', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Not authenticated. Please log in.' });
    }

    return res.status(200).json({
        user: req.session.user
    });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(200).json({ message: 'You are already logged out.' });
    }

    req.session.destroy(function (err) {
        if (err) {
            console.error('Logout error:', err.message);
            return res.status(500).json({ error: 'Logout failed. Please try again.' });
        }
        res.clearCookie('connect.sid');
        return res.status(200).json({ message: 'Logged out successfully.' });
    });
});

module.exports = router;
