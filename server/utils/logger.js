const db = require('../db');

/**
 * Sanitize details object or string to remove sensitive information
 * like passwords, secrets, tokens, or credit cards.
 */
function sanitizeDetails(details) {
    if (!details) return null;
    if (typeof details === 'string') {
        // Redact password or secret in string
        return details.replace(/(password|secret|token|apiKey)=([^& ]+)/gi, '$1=***REDACTED***');
    }
    if (typeof details === 'object') {
        const copy = JSON.parse(JSON.stringify(details));
        const sensitiveKeys = ['password', 'confirmPassword', 'secret', 'token', 'apiKey', 'creditCard'];
        for (const key of Object.keys(copy)) {
            if (sensitiveKeys.some(s => key.toLowerCase().includes(s.toLowerCase()))) {
                copy[key] = '***REDACTED***';
            } else if (typeof copy[key] === 'object' && copy[key] !== null) {
                copy[key] = sanitizeDetails(copy[key]);
            }
        }
        return JSON.stringify(copy);
    }
    return String(details);
}

/**
 * Log administrative or system activity into system_logs table
 * @param {number|null} userId - Acting user ID
 * @param {string} action - Action identifier (e.g. 'ORDER_PLACED', 'PRODUCT_CREATED')
 * @param {string|object} details - Description or details payload (will be sanitized)
 * @param {string} ipAddress - Client IP address
 */
async function logActivity(userId, action, details = null, ipAddress = null) {
    try {
        const safeDetails = sanitizeDetails(details);
        await db.execute(
            'INSERT INTO system_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
            [userId || null, action, safeDetails, ipAddress || '127.0.0.1']
        );
    } catch (err) {
        // Non-blocking error to ensure logging failure does not halt main transaction
        console.error('Audit logger error:', err.message);
    }
}

module.exports = {
    logActivity,
    sanitizeDetails
};
