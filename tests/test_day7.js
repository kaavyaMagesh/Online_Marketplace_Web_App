const http = require('http');
const app = require('../server/server');
const { pool } = require('../server/db');

const PORT = 5097;

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
    console.log('🚀 Starting Day 7 Seller Orders & Sales Reports Tests...\n');
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
        // 1. Login as Seller 1 (TechMart Seller, user_id = 1)
        const seller1Login = await request('POST', '/api/auth/login', {
            email: 'seller@marketplace.com',
            password: 'Marketplace@123'
        });
        assert('Seller 1 logs in successfully', seller1Login.status === 200 && seller1Login.data.user.role === 'seller');
        const seller1Cookie = seller1Login.cookie;

        // 2. Login as Seller 2 (UrbanTrends Seller, user_id = 2)
        const seller2Login = await request('POST', '/api/auth/login', {
            email: 'seller2@marketplace.com',
            password: 'Marketplace@123'
        });
        assert('Seller 2 logs in successfully', seller2Login.status === 200 && seller2Login.data.user.role === 'seller');
        const seller2Cookie = seller2Login.cookie;

        // 3. Customer places an order with products from Seller 1 and Seller 2
        const custLogin = await request('POST', '/api/auth/login', {
            email: 'customer@marketplace.com',
            password: 'Marketplace@123'
        });
        const custCookie = custLogin.cookie;

        // Product 1 belongs to Seller 1, Product 3 belongs to Seller 2
        await request('DELETE', '/api/cart', null, custCookie);
        await request('POST', '/api/cart', { product_id: 1, quantity: 1 }, custCookie);
        await request('POST', '/api/cart', { product_id: 3, quantity: 2 }, custCookie);

        const orderRes = await request('POST', '/api/orders', {
            shipping_address: '100 Brigade Road, Bengaluru'
        }, custCookie);
        assert('Customer creates multi-seller order', orderRes.status === 201 && orderRes.data.order_id);
        const orderId = orderRes.data.order_id;

        // 4. Test Seller 1 orders list
        const s1OrdersRes = await request('GET', '/api/seller/orders', null, seller1Cookie);
        assert('Seller 1 can list their orders', s1OrdersRes.status === 200 && Array.isArray(s1OrdersRes.data.orders));

        // Find the item from our order
        const s1Item = s1OrdersRes.data.orders.find(o => o.order_id === orderId);
        assert('Seller 1 sees their product (product 1) in order', s1Item && s1Item.product_id === 1);

        // Verify Seller 1 DOES NOT see product 3 (which belongs to Seller 2)
        const s1SeesS2Product = s1OrdersRes.data.orders.some(o => o.order_id === orderId && o.product_id === 3);
        assert('Seller 1 cannot view Seller 2 order items (privacy enforced)', !s1SeesS2Product);

        // 5. Test Seller 2 orders list
        const s2OrdersRes = await request('GET', '/api/seller/orders', null, seller2Cookie);
        assert('Seller 2 can list their orders', s2OrdersRes.status === 200 && Array.isArray(s2OrdersRes.data.orders));
        const s2Item = s2OrdersRes.data.orders.find(o => o.order_id === orderId);
        assert('Seller 2 sees their product (product 3) in order', s2Item && s2Item.product_id === 3);

        const s2SeesS1Product = s2OrdersRes.data.orders.some(o => o.order_id === orderId && o.product_id === 1);
        assert('Seller 2 cannot view Seller 1 order items (privacy enforced)', !s2SeesS1Product);

        // 6. Test Status Transitions
        const s1ItemId = s1Item.order_item_id;

        // Valid transition: confirmed -> processing
        const patchRes1 = await request('PATCH', `/api/seller/orders/${s1ItemId}/status`, {
            status: 'processing'
        }, seller1Cookie);
        assert('Seller 1 transitions item from confirmed to processing', patchRes1.status === 200 && patchRes1.data.status === 'processing');

        // Valid transition: processing -> shipped
        const patchRes2 = await request('PATCH', `/api/seller/orders/${s1ItemId}/status`, {
            status: 'shipped'
        }, seller1Cookie);
        assert('Seller 1 transitions item from processing to shipped', patchRes2.status === 200 && patchRes2.data.status === 'shipped');

        // Valid transition: shipped -> delivered
        const patchRes3 = await request('PATCH', `/api/seller/orders/${s1ItemId}/status`, {
            status: 'delivered'
        }, seller1Cookie);
        assert('Seller 1 transitions item from shipped to delivered', patchRes3.status === 200 && patchRes3.data.status === 'delivered');

        // Invalid transition: delivered cannot transition back to confirmed
        const invalidPatch = await request('PATCH', `/api/seller/orders/${s1ItemId}/status`, {
            status: 'confirmed'
        }, seller1Cookie);
        assert('Invalid transition from delivered is rejected with 400', invalidPatch.status === 400, JSON.stringify(invalidPatch.data));

        // 7. Security: Seller 2 attempts to change Seller 1's item status
        const unauthorizedPatch = await request('PATCH', `/api/seller/orders/${s1ItemId}/status`, {
            status: 'cancelled'
        }, seller2Cookie);
        assert('Seller 2 forbidden from changing Seller 1 item status (403)', unauthorizedPatch.status === 403, JSON.stringify(unauthorizedPatch.data));

        // 8. Test Sales Reports
        const reportRes = await request('GET', '/api/seller/reports', null, seller1Cookie);
        assert('Seller 1 can retrieve sales reports', reportRes.status === 200 && reportRes.data.summary);
        assert('Report includes completed_sales and total_orders', reportRes.data.summary.completed_sales > 0 && reportRes.data.summary.total_orders > 0);
        assert('Report includes status_breakdown and top_products', reportRes.data.status_breakdown.delivered && Array.isArray(reportRes.data.top_products));

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
