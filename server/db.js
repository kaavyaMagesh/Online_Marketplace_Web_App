const mysql = require('mysql2/promise');
require('dotenv').config();

// Create MySQL connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'online_marketplace',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test database connection helper
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log(' Connected to MySQL database:', process.env.DB_NAME || 'online_marketplace');
        connection.release();
        return true;
    } catch (error) {
        console.error(' MySQL Connection Error:', error.message);
        return false;
    }
}

// Export pool, testConnection, and delegate query/execute for universal compatibility
module.exports = {
    pool,
    testConnection,
    query: (...args) => pool.query(...args),
    execute: (...args) => pool.execute(...args),
    getConnection: (...args) => pool.getConnection(...args)
};


