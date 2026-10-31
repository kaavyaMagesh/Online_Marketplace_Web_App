const http = require('http');
const app = require('../server/server');
const { pool } = require('../server/db');

const PORT = 5095;

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

async function runIntegrationSuite() {
    console.log('🚀 Running Marketplace Full Integration Test Suite (Day 9)...\n');
    let passed = 0;
    let failed = 0;

    function assert(testName, condition, details = '') {
        if (condition) {
            console.log(`  ✅ PASS: ${testName}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${testName} ${details ? '— ' + details : ''}`);
            failed++;
        }
    }

    const server = app.listen(PORT);

    try {
        console.log('--- 1. Authentication & Session Security ---');
        // Register new customer
        const testEmail = `integ_cust_${Date.now()}@example.com`;
        const regRes = await request('POST', '/api/auth/register', {
            name: 'Integration Customer',
            email: testEmail,
            phone: '9876543210',
            password: 'SecurePassword123'
        });
        assert('Registration succeeds with valid details', regRes.status === 201 && regRes.data.user.email === testEmail);

        // Duplicate registration rejection
        const dupRes = await request('POST', '/api/auth/register', {
            name: 'Integration Customer',
            email: testEmail,
            phone: '9876543210',
            password: 'SecurePassword123'
        });
        assert('Duplicate email is rejected with 409', dupRes.status === 409);

        // Invalid login rejection
        const badLogin = await request('POST', '/api/auth/login', {
            email: testEmail,
            password: 'WrongPassword'
        });
        assert('Invalid login is rejected with 401', badLogin.status === 401);

        // Valid login
        const loginRes = await request('POST', '/api/auth/login', {
            email: testEmail,
            password: 'SecurePassword123'
        });
        assert('Valid login succeeds', loginRes.status === 200 && loginRes.data.user);
        const custCookie = loginRes.cookie;

        // Verify session /me
        const meRes = await request('GET', '/api/auth/me', null, custCookie);
        assert('GET /api/auth/me returns current session user', meRes.status === 200 && meRes.data.user.email === testEmail);

        // Logout
        const logoutRes = await request('POST', '/api/auth/logout', null, custCookie);
        assert('Logout works and clears session', logoutRes.status === 200);

        console.log('\n--- 2. Product Catalog, Searching & Filtering ---');
        // List products
        const prodListRes = await request('GET', '/api/products');
        assert('Active products are listed', prodListRes.status === 200 && Array.isArray(prodListRes.data.products));

        // Search products
        const searchRes = await request('GET', '/api/products?search=Headphones');
        assert('Product search works by name', searchRes.status === 200 && searchRes.data.products.some(p => p.product_name.includes('Headphones')));

        // Category filter
        const catRes = await request('GET', '/api/products?category=1');
        assert('Category filtering returns category products', catRes.status === 200 && catRes.data.products.every(p => p.category_id === 1));

        // Product details
        const prodDetailRes = await request('GET', '/api/products/1');
        assert('Single product lookup succeeds', prodDetailRes.status === 200 && prodDetailRes.data.product_id === 1);

        console.log('\n--- 3. Seller Product Management & Ownership Security ---');
        // Login as Seller 1
        const s1Login = await request('POST', '/api/auth/login', {
            email: 'seller@marketplace.com',
            password: 'Marketplace@123'
        });
        const s1Cookie = s1Login.cookie;

        // Login as Seller 2
        const s2Login = await request('POST', '/api/auth/login', {
            email: 'seller2@marketplace.com',
            password: 'Marketplace@123'
        });
        const s2Cookie = s2Login.cookie;

        // Seller 1 creates a product
        const createProdRes = await request('POST', '/api/seller/products', {
            product_name: 'Seller 1 Test Device',
            description: 'Created during integration test',
            price: 799.00,
            stock_quantity: 25,
            category_id: 1,
            status: 'active'
        }, s1Cookie);
        assert('Seller can create a product', createProdRes.status === 201 && createProdRes.data.product_id);
        const createdProdId = createProdRes.data.product_id;

        // Seller 1 can edit their product
        const editProdRes = await request('PUT', `/api/seller/products/${createdProdId}`, {
            price: 849.00,
            stock_quantity: 30
        }, s1Cookie);
        assert('Seller can edit their own product', editProdRes.status === 200);

        // Security: Seller 2 CANNOT edit Seller 1's product
        const crossEditRes = await request('PUT', `/api/seller/products/${createdProdId}`, {
            price: 1.00
        }, s2Cookie);
        assert('Seller cannot edit another seller product (403)', crossEditRes.status === 403);

        // Seller deactivates product
        const deactRes = await request('DELETE', `/api/seller/products/${createdProdId}`, null, s1Cookie);
        assert('Seller can deactivate product', deactRes.status === 200);

        console.log('\n--- 4. Shopping Cart & Transactional Checkout ---');
        // Re-login customer
        const custRelogin = await request('POST', '/api/auth/login', {
            email: testEmail,
            password: 'SecurePassword123'
        });
        const activeCustCookie = custRelogin.cookie;

        // Add to cart
        const addCartRes = await request('POST', '/api/cart', {
            product_id: 1,
            quantity: 3
        }, activeCustCookie);
        assert('Product can be added to cart', addCartRes.status === 201);

        // Excessive quantity rejected
        const excessiveCartRes = await request('POST', '/api/cart', {
            product_id: 1,
            quantity: 999999
        }, activeCustCookie);
        assert('Invalid/excessive quantities are rejected', excessiveCartRes.status === 400);

        // Check stock before checkout
        const [prodStockBefore] = await pool.query('SELECT stock_quantity FROM products WHERE product_id = 1');
        const stockBefore = prodStockBefore[0].stock_quantity;

        // Checkout
        const checkoutRes = await request('POST', '/api/orders', {
            shipping_address: '42 Integration Way, Bengaluru, 560001'
        }, activeCustCookie);
        assert('Checkout creates an order successfully', checkoutRes.status === 201 && checkoutRes.data.order_id);
        const orderId = checkoutRes.data.order_id;

        // Stock deduction check
        const [prodStockAfter] = await pool.query('SELECT stock_quantity FROM products WHERE product_id = 1');
        const stockAfter = prodStockAfter[0].stock_quantity;
        assert('Stock is deducted correctly after checkout', stockAfter === stockBefore - 3);

        // Cart is emptied
        const verifyCartRes = await request('GET', '/api/cart', null, activeCustCookie);
        assert('Cart is cleared after successful checkout', verifyCartRes.status === 200 && verifyCartRes.data.items.length === 0);

        console.log('\n--- 5. Seller Order Management & Reports ---');
        // Seller 1 views orders
        const s1Orders = await request('GET', '/api/seller/orders', null, s1Cookie);
        const s1OrderItem = s1Orders.data.orders.find(o => o.order_id === orderId);
        assert('Seller can view order items containing their products', s1OrderItem && s1OrderItem.product_id === 1);

        // Status update
        const patchStatusRes = await request('PATCH', `/api/seller/orders/${s1OrderItem.order_item_id}/status`, {
            status: 'processing'
        }, s1Cookie);
        assert('Seller can update order item status', patchStatusRes.status === 200 && patchStatusRes.data.status === 'processing');

        // Seller reports
        const s1Reports = await request('GET', '/api/seller/reports', null, s1Cookie);
        assert('Seller can view sales statistics reports', s1Reports.status === 200 && s1Reports.data.summary);

        console.log('\n--- 6. Super Admin, Permissions & Audit Logs ---');
        // Super admin login
        const saLogin = await request('POST', '/api/auth/login', {
            email: 'admin@marketplace.com',
            password: 'Marketplace@123'
        });
        const saCookie = saLogin.cookie;

        // View logs
        const auditLogsRes = await request('GET', '/api/superadmin/logs', null, saCookie);
        assert('Super Admin can view audit logs', auditLogsRes.status === 200 && auditLogsRes.data.logs.length > 0);

        // View system settings
        const settingsRes = await request('GET', '/api/superadmin/settings', null, saCookie);
        assert('Super Admin can view system settings', settingsRes.status === 200 && settingsRes.data.settings);

        // Update setting
        const updateSettingRes = await request('PUT', '/api/superadmin/settings/site_name', {
            value: 'GoodsPlatz Marketplace 2026'
        }, saCookie);
        assert('Super Admin can update system settings', updateSettingRes.status === 200);

        // Verify unauthorized access rejected
        const unauthorizedSettings = await request('PUT', '/api/superadmin/settings/site_name', {
            value: 'Hacked'
        }, activeCustCookie);
        assert('Unauthorized customer blocked from Super Admin endpoints (403)', unauthorizedSettings.status === 403);

        console.log(`\n========================================`);
        console.log(`Day 9 Integration Results: ${passed} passed, ${failed} failed`);
        console.log(`========================================\n`);

        return { passed, failed };
    } finally {
        server.close();
        pool.end();
    }
}

runIntegrationSuite().then(({ passed, failed }) => {
    if (failed > 0) process.exit(1);
    process.exit(0);
}).catch(err => {
    console.error('Integration suite crashed:', err);
    process.exit(1);
});
