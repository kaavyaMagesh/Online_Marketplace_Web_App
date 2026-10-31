const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireSuperAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');

// Protect all routes in this file with Super Admin check
router.use(requireSuperAdmin);

/**
 * GET /api/superadmin/logs
 * View system audit logs with acting user details.
 * Supports action filtering, limit and offset pagination.
 */
router.get('/logs', async (req, res) => {
    try {
        const { action, limit = 50, offset = 0 } = req.query;

        let sql = `
            SELECT
                l.log_id,
                l.user_id,
                u.name AS user_name,
                u.email AS user_email,
                u.role AS user_role,
                l.action,
                l.details,
                l.ip_address,
                l.created_at
            FROM system_logs l
            LEFT JOIN users u ON l.user_id = u.user_id
        `;

        const params = [];

        if (action && action.trim()) {
            sql += ' WHERE l.action = ?';
            params.push(action.trim());
        }

        sql += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
        params.push(Math.min(Number(limit) || 50, 200), Number(offset) || 0);

        const [logs] = await db.query(sql, params);

        const [countRow] = await db.query('SELECT COUNT(*) AS total FROM system_logs');

        res.json({
            total_logs: countRow[0].total,
            count: logs.length,
            logs
        });
    } catch (err) {
        console.error('Failed to retrieve audit logs:', err.message);
        res.status(500).json({ error: 'Unable to retrieve audit logs.' });
    }
});

/**
 * GET /api/superadmin/admins
 * List all administrator accounts and their assigned permissions.
 */
router.get('/admins', async (req, res) => {
    try {
        const [admins] = await db.query(
            `SELECT user_id, name, email, phone, role, status, created_at, updated_at
             FROM users
             WHERE role IN ('admin', 'super_admin')
             ORDER BY role ASC, created_at DESC`
        );

        // Fetch permissions for all admins
        const [permRows] = await db.query(
            'SELECT permission_id, admin_id, permission_name, granted_by, created_at FROM admin_permissions'
        );

        const permMap = {};
        permRows.forEach(p => {
            if (!permMap[p.admin_id]) permMap[p.admin_id] = [];
            permMap[p.admin_id].push(p.permission_name);
        });

        const adminsWithPerms = admins.map(admin => ({
            ...admin,
            permissions: admin.role === 'super_admin' ? ['* (All Privileges)'] : (permMap[admin.user_id] || [])
        }));

        res.json({
            count: adminsWithPerms.length,
            admins: adminsWithPerms
        });
    } catch (err) {
        console.error('Failed to list admins:', err.message);
        res.status(500).json({ error: 'Unable to retrieve admin list.' });
    }
});

/**
 * POST /api/superadmin/admins
 * Create a new admin account or promote an existing user to admin.
 */
router.post('/admins', async (req, res) => {
    try {
        const superAdminId = req.session.user.user_id;
        const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';
        const { user_id, name, email, password, phone, permissions } = req.body;

        // Mode 1: Promote existing user
        if (user_id) {
            const userId = Number(user_id);
            const [users] = await db.execute('SELECT user_id, name, email, role, status FROM users WHERE user_id = ?', [userId]);
            if (users.length === 0) {
                return res.status(404).json({ error: 'User not found.' });
            }

            const targetUser = users[0];
            if (targetUser.role === 'super_admin') {
                return res.status(400).json({ error: 'User is already a Super Admin.' });
            }

            await db.execute("UPDATE users SET role = 'admin' WHERE user_id = ?", [userId]);

            // Assign optional initial permissions
            if (Array.isArray(permissions) && permissions.length > 0) {
                for (const perm of permissions) {
                    await db.query(
                        `INSERT INTO admin_permissions (admin_id, permission_name, granted_by)
                         VALUES (?, ?, ?)
                         ON DUPLICATE KEY UPDATE granted_by = VALUES(granted_by)`,
                        [userId, perm, superAdminId]
                    );
                }
            }

            logActivity(superAdminId, 'ADMIN_PROMOTED', { promoted_user_id: userId, email: targetUser.email }, clientIp);

            return res.status(200).json({
                message: `User ${targetUser.name} promoted to administrator.`,
                admin: { user_id: userId, name: targetUser.name, email: targetUser.email, role: 'admin' }
            });
        }

        // Mode 2: Create brand new admin
        const cleanName = (name || '').trim();
        const cleanEmail = (email || '').trim().toLowerCase();
        const cleanPhone = (phone || '').trim();

        if (!cleanName || !cleanEmail || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required to create an admin.' });
        }

        const [existing] = await db.query('SELECT user_id FROM users WHERE email = ?', [cleanEmail]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const [insertRes] = await db.execute(
            `INSERT INTO users (name, email, password, phone, role, status)
             VALUES (?, ?, ?, ?, 'admin', 'active')`,
            [cleanName, cleanEmail, hashedPassword, cleanPhone || null]
        );

        const newAdminId = insertRes.insertId;

        // Assign default or specified permissions
        const defaultPerms = ['manage_products', 'manage_categories', 'manage_sellers'];
        const permsToAssign = Array.isArray(permissions) && permissions.length > 0 ? permissions : defaultPerms;

        for (const perm of permsToAssign) {
            await db.execute(
                'INSERT INTO admin_permissions (admin_id, permission_name, granted_by) VALUES (?, ?, ?)',
                [newAdminId, perm, superAdminId]
            );
        }

        logActivity(superAdminId, 'ADMIN_CREATED', { new_admin_id: newAdminId, email: cleanEmail }, clientIp);

        res.status(201).json({
            message: 'Administrator created successfully.',
            admin: {
                user_id: newAdminId,
                name: cleanName,
                email: cleanEmail,
                role: 'admin',
                permissions: permsToAssign
            }
        });

    } catch (err) {
        console.error('Failed to create/promote admin:', err.message);
        res.status(500).json({ error: 'Unable to create/promote administrator.' });
    }
});

/**
 * GET /api/superadmin/permissions
 * List all granted admin permissions across the platform.
 */
router.get('/permissions', async (req, res) => {
    try {
        const [permissions] = await db.query(
            `SELECT
                p.permission_id,
                p.admin_id,
                u.name AS admin_name,
                u.email AS admin_email,
                p.permission_name,
                p.granted_by,
                g.name AS granted_by_name,
                p.created_at
             FROM admin_permissions p
             JOIN users u ON p.admin_id = u.user_id
             LEFT JOIN users g ON p.granted_by = g.user_id
             ORDER BY p.admin_id ASC, p.permission_name ASC`
        );

        const availablePermissions = [
            'manage_products',
            'manage_categories',
            'manage_sellers',
            'manage_orders',
            'view_reports',
            'manage_settings'
        ];

        res.json({
            available_system_permissions: availablePermissions,
            assigned_permissions_count: permissions.length,
            permissions
        });
    } catch (err) {
        console.error('Failed to list permissions:', err.message);
        res.status(500).json({ error: 'Unable to retrieve permissions.' });
    }
});

/**
 * PUT /api/superadmin/permissions/:adminId
 * Update an admin's assigned permissions (replaces existing permissions with new set).
 */
router.put('/permissions/:adminId', async (req, res) => {
    try {
        const superAdminId = req.session.user.user_id;
        const targetAdminId = Number(req.params.adminId);
        const { permissions } = req.body;
        const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';

        if (!Number.isInteger(targetAdminId) || targetAdminId <= 0) {
            return res.status(400).json({ error: 'Invalid admin ID.' });
        }

        if (!Array.isArray(permissions)) {
            return res.status(400).json({ error: 'Permissions must be provided as an array of strings.' });
        }

        // Verify target user is an admin
        const [users] = await db.execute('SELECT user_id, name, email, role FROM users WHERE user_id = ?', [targetAdminId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'Administrator not found.' });
        }

        const targetUser = users[0];
        if (targetUser.role === 'super_admin') {
            return res.status(400).json({ error: 'Super Admin automatically has all permissions and cannot be modified here.' });
        }

        // Remove old permissions
        await db.execute('DELETE FROM admin_permissions WHERE admin_id = ?', [targetAdminId]);

        // Insert new permissions
        for (const perm of permissions) {
            const cleanPerm = String(perm).trim();
            if (cleanPerm) {
                await db.execute(
                    'INSERT INTO admin_permissions (admin_id, permission_name, granted_by) VALUES (?, ?, ?)',
                    [targetAdminId, cleanPerm, superAdminId]
                );
            }
        }

        logActivity(
            superAdminId,
            'PERMISSIONS_UPDATED',
            { target_admin_id: targetAdminId, email: targetUser.email, new_permissions: permissions },
            clientIp
        );

        res.json({
            message: `Permissions updated successfully for ${targetUser.name}.`,
            admin_id: targetAdminId,
            permissions
        });

    } catch (err) {
        console.error('Failed to update admin permissions:', err.message);
        res.status(500).json({ error: 'Unable to update admin permissions.' });
    }
});

/**
 * GET /api/superadmin/settings
 * View all system configuration settings.
 */
router.get('/settings', async (req, res) => {
    try {
        const [settings] = await db.query(
            `SELECT
                s.setting_id,
                s.setting_key,
                s.setting_value,
                s.updated_by,
                u.name AS updated_by_name,
                s.updated_at
             FROM system_settings s
             LEFT JOIN users u ON s.updated_by = u.user_id
             ORDER BY s.setting_key ASC`
        );

        const settingsMap = {};
        settings.forEach(s => {
            settingsMap[s.setting_key] = s.setting_value;
        });

        res.json({
            count: settings.length,
            settings: settingsMap,
            records: settings
        });
    } catch (err) {
        console.error('Failed to retrieve settings:', err.message);
        res.status(500).json({ error: 'Unable to retrieve system settings.' });
    }
});

/**
 * PUT /api/superadmin/settings/:key
 * Update or insert a system setting key-value pair.
 */
router.put('/settings/:key', async (req, res) => {
    try {
        const superAdminId = req.session.user.user_id;
        const settingKey = (req.params.key || '').trim().toLowerCase();
        const { value } = req.body;
        const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';

        if (!settingKey) {
            return res.status(400).json({ error: 'Setting key is required.' });
        }

        if (value === undefined || value === null) {
            return res.status(400).json({ error: 'Setting value is required.' });
        }

        const stringVal = String(value);

        await db.execute(
            `INSERT INTO system_settings (setting_key, setting_value, updated_by)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
            [settingKey, stringVal, superAdminId]
        );

        logActivity(
            superAdminId,
            'SETTING_UPDATED',
            { key: settingKey, new_value: stringVal },
            clientIp
        );

        res.json({
            message: `System setting '${settingKey}' updated successfully.`,
            setting_key: settingKey,
            setting_value: stringVal
        });

    } catch (err) {
        console.error('Failed to update system setting:', err.message);
        res.status(500).json({ error: 'Unable to update system setting.' });
    }
});

module.exports = router;
