
const express = require('express');
const router = express.Router();

const { requireRole } = require('../middleware/auth');

// Check whether the user is an active Admin
router.get('/check', requireRole('admin'), (req, res) => {
    res.json({
        success: true,
        role: 'admin',
        message: 'Admin access granted'
    });
});

// Check whether the user is an active Super Admin
router.get('/super/check', requireRole('super_admin'), (req, res) => {
    res.json({
        success: true,
        role: 'super_admin',
        message: 'Super Admin access granted'
    });
});

module.exports = router;
