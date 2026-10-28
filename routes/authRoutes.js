
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../server/db');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== 'string' ||
        typeof password !== 'string') {
      return res.status(400).json({
        error: 'Email and password are required.'
      });
    }

    const [rows] = await pool.query(
      `SELECT user_id, name, email, password, role, status
       FROM users WHERE email = ?`,
      [email.trim()]
    );

    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        error: 'Account is not active.'
      });
    }

    if (!['admin', 'super_admin'].includes(user.role)) {
      return res.status(403).json({
        error: 'Administrator access required.'
      });
    }

    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({
          error: 'Could not create login session.'
        });
      }

      req.session.user = {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status
      };

      req.session.save((err) => {
        if (err) {
          return res.status(500).json({
            error: 'Could not save login session.'
          });
        }

        res.json({
          message: 'Login successful',
          user: req.session.user
        });
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed.' });
    }

    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out' });
  });
});

module.exports = router;

