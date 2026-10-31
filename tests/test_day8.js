const http = require('http');
const app = require('../server/server');
const { pool } = require('../server/db');

const PORT = 5096;

function request(method, path, body = null, cookie = null) {
    return new Promise((resolve, reject) => {
        const postData = body ? JSON.stringify(body) : null;
        const headers = {};
        if (postData) {
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(postData);
        }
        if (cookie) {
            headers['Cookie'] = cookie;
        }

        const options = {
            hostname: '127.0.0.1',
            port: PORT,
            path,
            method,
            headers
        };

        const req = http.request(options, (res) => {
            let data = '';
            const setCookie = res.headers['set-cookie'];
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {
                    parsed = data;
                }
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    cookie: setCookie ? setCookie[0].split(';')[0] : cookie,
                    data: parsed
                });
            });
        });

        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

async function runTests() {
    console.log('🚀 Starting Day 8 Audit Logs, Permissions & Super Admin Tests...\n');
    let passed = 0;
    let failed = 0;

    function assert(name, condition, details = '') {
        if (condition) {
            console.log(`  ✅ PASS: ${name}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${name} ${details ? '— ' + details : ''}`);
            failed++;
        }
    }

    const server = app.listen(PORT);

    try {
        // 1. Super Admin login (user_id = 4, role = 'super_admin')
        const saLogin = await request('POST', '/api/auth/login', {
            email: 'admin@marketplace.com',
            password: 'Marketplace@123'
        });
        assert('Super Admin can log in', saLogin.status === 200 && saLogin.data.user.role === 'super_admin');
        const saCookie = saLogin.cookie;

        // 2. Seller login (ordinary non-admin)
        const sellerLogin = await request('POST', '/api/auth/login', {
            email: 'seller@marketplace.com',
            password: 'Marketplace@123'
        });
        const sellerCookie = sellerLogin.cookie;

        // 3. Security: Seller cannot access Super Admin logs
        const unauthorizedLogs = await request('GET', '/api/superadmin/logs', null, sellerCookie);
        assert('Seller forbidden from accessing Super Admin logs (403)', unauthorizedLogs.status === 403);

        // 4. Super Admin can view audit logs
        const logsRes = await request('GET', '/api/superadmin/logs', null, saCookie);
        assert('Super Admin retrieves audit logs', logsRes.status === 200 && Array.isArray(logsRes.data.logs));

        // 5. Super Admin lists admins
        const adminsRes = await request('GET', '/api/superadmin/admins', null, saCookie);
        assert('Super Admin lists admin accounts', adminsRes.status === 200 && Array.isArray(adminsRes.data.admins));

        // 6. Super Admin creates a new ordinary Admin
        const newAdminEmail = `staff_admin_${Date.now()}@marketplace.com`;
        const createAdminRes = await request('POST', '/api/superadmin/admins', {
            name: 'Staff Admin',
            email: newAdminEmail,
            password: 'Marketplace@123',
            phone: '9876543299',
            permissions: ['manage_products'] // Only product permission, not sellers
        }, saCookie);
        assert('Super Admin creates new ordinary admin', createAdminRes.status === 201 && createAdminRes.data.admin.user_id);
        const newAdminId = createAdminRes.data.admin.user_id;

        // Login as newly created ordinary Admin
        const adminLogin = await request('POST', '/api/auth/login', {
            email: newAdminEmail,
            password: 'Marketplace@123'
        });
        assert('Ordinary admin logs in successfully', adminLogin.status === 200 && adminLogin.data.user.role === 'admin');
        const adminCookie = adminLogin.cookie;

        // 7. Security: Ordinary admin cannot access Super Admin endpoints
        const adminForbiddenLogs = await request('GET', '/api/superadmin/logs', null, adminCookie);
        assert('Ordinary admin blocked from Super Admin-only logs (403)', adminForbiddenLogs.status === 403);

        const adminForbiddenSettings = await request('PUT', '/api/superadmin/settings/site_name', { value: 'Hacked' }, adminCookie);
        assert('Ordinary admin blocked from Super Admin-only settings (403)', adminForbiddenSettings.status === 403);

        // 8. Permission Enforcement: Ordinary admin lacks 'manage_sellers' permission
        const blockSellerAttempt1 = await request('PATCH', '/api/admin/sellers/1/status', { status: 'blocked' }, adminCookie);
        assert('Admin without manage_sellers permission is denied (403)', blockSellerAttempt1.status === 403);

        // 9. Grant 'manage_sellers' permission to this admin
        const grantPermRes = await request('PUT', `/api/superadmin/permissions/${newAdminId}`, {
            permissions: ['manage_products', 'manage_sellers']
        }, saCookie);
        assert('Super Admin assigns manage_sellers permission to admin', grantPermRes.status === 200 && grantPermRes.data.permissions.includes('manage_sellers'));

        // 10. Admin now has 'manage_sellers' permission, should succeed
        const blockSellerAttempt2 = await request('PATCH', '/api/admin/sellers/1/status', { status: 'blocked' }, adminCookie);
        assert('Admin with granted permission successfully updates seller status', blockSellerAttempt2.status === 200 && blockSellerAttempt2.data.status === 'blocked');

        // Unblock seller back for subsequent tests
        await request('PATCH', '/api/admin/sellers/1/status', { status: 'active' }, saCookie);

        // 11. System Settings: Super Admin reads and updates settings
        const getSettingsRes = await request('GET', '/api/superadmin/settings', null, saCookie);
        assert('Super Admin can retrieve system settings', getSettingsRes.status === 200 && getSettingsRes.data.settings);

        const putSettingRes = await request('PUT', '/api/superadmin/settings/min_order_amount', {
            value: '150'
        }, saCookie);
        assert('Super Admin can update system setting', putSettingRes.status === 200 && putSettingRes.data.setting_value === '150');

        // 12. Sensitive credential safety: check that passwords are NOT logged in system_logs
        const [pwLogs] = await pool.query("SELECT * FROM system_logs WHERE details LIKE '%Marketplace@123%'");
        assert('No plaintext passwords found in system_logs', pwLogs.length === 0);

        console.log(`\n========================================`);
        console.log(`Results: ${passed} passed, ${failed} failed`);
        console.log(`========================================\n`);

    } finally {
        server.close();
        pool.end();
    }
}

runTests().catch(err => {
    console.error('Test script crashed:', err);
    process.exit(1);
});
