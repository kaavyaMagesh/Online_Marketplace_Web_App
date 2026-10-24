/*
 * routes/authRoutes.js — GoodsPlatz customer authentication routes
 *
 * Endpoints:
 *   POST /api/auth/register  — create a new customer account
 *   POST /api/auth/login     — log in with email + password
 *   GET  /api/auth/me        — return the signed-in user's profile
 *   POST /api/auth/logout    — clear the session and sign out
 *
 * Uses:
 *   - bcryptjs  for password hashing (already in package.json)
 *   - express-session  for maintaining auth state (already in server.js)
 *   - mysql2/promise pool from server/db.js
 *
 * Passwords are NEVER stored or returned as plaintext.
 * The client-supplied role field is IGNORED; new users always get 'customer'.
 */

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');

const { pool } = require('../server/db');

/* ─── Helpers ─────────────────────────────────────────────────── */

// Simple email regex — same pattern used on the frontend.
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Exactly 10 digits — matches the frontend mobile validation.
function isValidMobile(mobile) {
    return /^[0-9]{10}$/.test(mobile);
}

/* ─── POST /api/auth/register ─────────────────────────────────── */

router.post('/register', async (req, res) => {
    // 1. Extract and trim inputs.
    const name     = (req.body.name     || '').trim();
    const email    = (req.body.email    || '').trim().toLowerCase();
    const phone    = (req.body.phone    || '').trim();
    const password = (req.body.password || '');

    // 2. Server-side validation (the frontend validates too, but we
    //    must never trust the client alone).
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
        // 3. Check for duplicate email before hashing (saves work).
        const [existing] = await pool.query(
            'SELECT user_id FROM users WHERE email = ?',
            [email]
        );

        if (existing.length > 0) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        // 4. Hash the password. saltRounds = 10 is the recommended default.
        //    bcrypt.hash() generates a random salt internally and stores
        //    it alongside the hash — no need to store the salt separately.
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // 5. Insert the new user.
        //    Role is hardcoded to 'customer'; status defaults to 'active'.
        //    We NEVER take role or status from req.body.
        const [result] = await pool.query(
            `INSERT INTO users (name, email, password, phone, role, status)
             VALUES (?, ?, ?, ?, 'customer', 'active')`,
            [name, email, hashedPassword, phone]
        );

        // 6. Return a safe success response — no password in the body.
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
        // MySQL duplicate-entry error code is ER_DUP_ENTRY (errno 1062).
        // This is a safety net in case the pre-check and the insert race.
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }
        console.error('Registration error:', err.message);
        return res.status(500).json({ error: 'Registration failed. Please try again later.' });
    }
});

/* ─── POST /api/auth/login ────────────────────────────────────── */

router.post('/login', async (req, res) => {
    // 1. Extract inputs.
    const email    = (req.body.email    || '').trim().toLowerCase();
    const password = (req.body.password || '');

    // 2. Basic validation.
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    try {
        // 3. Look up the user by email.
        const [rows] = await pool.query(
            'SELECT user_id, name, email, password, phone, role, status FROM users WHERE email = ?',
            [email]
        );

        // Intentionally vague error — do not reveal whether the email exists.
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = rows[0];

        // 4. Enforce account status before verifying the password.
        //    (Saves bcrypt work if the account is blocked.)
        if (user.status === 'blocked') {
            return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
        }

        if (user.status === 'pending') {
            return res.status(403).json({ error: 'Your account is pending approval.' });
        }

        // 5. Verify the password against the stored hash.
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // 6. Establish the session.
        //    Store only the fields needed by middleware — never the password.
        req.session.user = {
            user_id: user.user_id,
            name:    user.name,
            email:   user.email,
            phone:   user.phone,
            role:    user.role,
            status:  user.status
        };

        // 7. Return safe user info so the frontend can redirect by role.
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

/* ─── GET /api/auth/me ────────────────────────────────────────── */

router.get('/me', (req, res) => {
    // Check whether a valid session exists.
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Not authenticated. Please log in.' });
    }

    // Return the session data — safe because we never put the password there.
    return res.status(200).json({
        user: req.session.user
    });
});

/* ─── POST /api/auth/logout ───────────────────────────────────── */

router.post('/logout', (req, res) => {
    // If already logged out, just confirm success — no error needed.
    if (!req.session || !req.session.user) {
        return res.status(200).json({ message: 'You are already logged out.' });
    }

    // Destroy the session and clear the session cookie.
    req.session.destroy(function (err) {
        if (err) {
            console.error('Logout error:', err.message);
            return res.status(500).json({ error: 'Logout failed. Please try again.' });
        }
        // Clear the session cookie from the browser.
        res.clearCookie('connect.sid');
        return res.status(200).json({ message: 'Logged out successfully.' });
    });
});

module.exports = router;
