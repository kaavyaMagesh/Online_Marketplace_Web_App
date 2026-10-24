const express = require('express');
const router = express.Router();
const { pool } = require('../server/db');

// Test seller route
router.get('/ping', (req, res) => {
    res.json({ message: 'Seller route is working' });
});

module.exports = router;
