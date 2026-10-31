const http = require('http');
const app = require('../server/server');
const { pool } = require('../server/db');

const PORT = 5099;

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
    console.log('🚀 Starting Day 6 Checkout & Transactional Order Tests...\n');
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
        // Customer login
        const loginRes = await request('POST', '/api/auth/login', {
            email: 'customer@marketplace.com',
            password: 'Marketplace@123'
        });
        assert('Customer can login', loginRes.status === 200 && loginRes.data.user, JSON.stringify(loginRes.data));
        const customerCookie = loginRes.cookie;

        // Clear existing cart items for clean test
        await request('DELETE', '/api/cart', null, customerCookie);

        // Check initial stock of product 1
        const [prodBefore] = await pool.query('SELECT stock_quantity, price, seller_id FROM products WHERE product_id = 1');
        const initialStock = prodBefore[0].stock_quantity;
        const initialPrice = parseFloat(prodBefore[0].price);
        console.log(`  ℹ️ Initial stock for product 1: ${initialStock}, price: ${initialPrice}`);

        // Add 2 units of product 1 to cart
        const addRes = await request('POST', '/api/cart', { product_id: 1, quantity: 2 }, customerCookie);
        assert('Product 1 added to cart', addRes.status === 201, JSON.stringify(addRes.data));

        // Attempt checkout with valid shipping address
        const checkoutRes = await request('POST', '/api/orders', {
            shipping_address: '42 MG Road, Indiranagar, Bengaluru, 560038',
            payment_method: 'Cash on Delivery'
        }, customerCookie);

        assert('Checkout creates order successfully', checkoutRes.status === 201 && checkoutRes.data.order_id, JSON.stringify(checkoutRes.data));
        const orderId = checkoutRes.data.order_id;

        // Verify stock deduction in products table
        const [prodAfter] = await pool.query('SELECT stock_quantity FROM products WHERE product_id = 1');
        const afterStock = prodAfter[0].stock_quantity;
        assert('Stock correctly deducted by 2 units', afterStock === initialStock - 2, `Expected ${initialStock - 2}, got ${afterStock}`);

        // Verify orders table record
        const [orderRows] = await pool.query('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        assert('Order record exists with confirmed status', orderRows.length === 1 && orderRows[0].status === 'confirmed', JSON.stringify(orderRows[0]));

        // Verify order_items record
        const [itemRows] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
        assert('Order item record saved with seller_id and price', itemRows.length >= 1 && itemRows[0].seller_id === prodBefore[0].seller_id && parseFloat(itemRows[0].price) === initialPrice, JSON.stringify(itemRows[0]));
        assert('Order item has item_status confirmed', itemRows[0].item_status === 'confirmed', `Got: ${itemRows[0].item_status}`);

        // Verify customer cart is cleared
        const cartRes = await request('GET', '/api/cart', null, customerCookie);
        assert('Customer cart cleared after successful checkout', cartRes.status === 200 && cartRes.data.items.length === 0, JSON.stringify(cartRes.data));

        // Test Transaction Rollback: Try checking out quantity > available stock
        // First add product 1 with quantity 1
        await request('POST', '/api/cart', { product_id: 1, quantity: 1 }, customerCookie);
        // Artificially change cart item quantity directly to exceed stock
        const [cartRecord] = await pool.query('SELECT cart_id FROM cart WHERE customer_id = 3');
        const cartId = cartRecord[0].cart_id;
        await pool.query('UPDATE cart_items SET quantity = 99999 WHERE cart_id = ? AND product_id = 1', [cartId]);

        const stockBeforeFailedOrder = (await pool.query('SELECT stock_quantity FROM products WHERE product_id = 1'))[0][0].stock_quantity;

        const failedOrderRes = await request('POST', '/api/orders', {
            shipping_address: 'Test Address'
        }, customerCookie);

        assert('Failed checkout rejected with 400', failedOrderRes.status === 400, JSON.stringify(failedOrderRes.data));

        // Check that stock was untouched
        const stockAfterFailedOrder = (await pool.query('SELECT stock_quantity FROM products WHERE product_id = 1'))[0][0].stock_quantity;
        assert('Transaction rolled back: stock unchanged after failed order', stockAfterFailedOrder === stockBeforeFailedOrder, `Before: ${stockBeforeFailedOrder}, After: ${stockAfterFailedOrder}`);

        // Check that no orphaned order was inserted
        const [orphaned] = await pool.query('SELECT COUNT(*) as count FROM orders WHERE total_amount > 1000000');
        assert('No orphaned order record created on failure', orphaned[0].count === 0);

        // Clean up cart
        await request('DELETE', '/api/cart', null, customerCookie);

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
