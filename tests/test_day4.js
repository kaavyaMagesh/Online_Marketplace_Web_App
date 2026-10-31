const http = require('http');
const app = require('./server/server');
const db = require('./server/db');

const PORT = 5098;

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

// Low-stock status helper for verification
function getStockStatus(quantity) {
    if (quantity === 0) return "Out of stock";
    if (quantity < 5) return "Low stock";
    return "In stock";
}

async function runTests() {
    console.log('🚀 Starting Day 4 Inventory Management & Shopping Cart Tests...\n');
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

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(PORT, resolve));
    console.log(`Test server running on http://127.0.0.1:${PORT}\n`);

    try {
        // --- Setup Test Accounts Sessions ---
        // Seller 1 (TechMart Seller, user_id = 1)
        const seller1Login = await request('POST', '/api/auth/login', {
            email: 'seller@marketplace.com',
            password: 'Marketplace@123'
        });
        const seller1Cookie = seller1Login.cookie;

        // Seller 2 (UrbanTrends Seller, user_id = 2)
        const seller2Login = await request('POST', '/api/auth/login', {
            email: 'seller2@marketplace.com',
            password: 'Marketplace@123'
        });
        const seller2Cookie = seller2Login.cookie;

        // Customer (Alice Customer, user_id = 3)
        const customerLogin = await request('POST', '/api/auth/login', {
            email: 'customer@marketplace.com',
            password: 'Marketplace@123'
        });
        const customerCookie = customerLogin.cookie;

        // -------------------------------------------------------------
        // SECTION 1: INVENTORY MANAGEMENT & SELLER SECURITY
        // -------------------------------------------------------------
        console.log('--- 1. Inventory Management & Seller Access ---');

        // Test 1.1: View seller inventory (Only seller's products appear)
        const resSeller1Inv = await request('GET', '/api/seller/products', null, seller1Cookie);
        assert('View seller inventory: HTTP 200', resSeller1Inv.status === 200);
        const seller1Products = Array.isArray(resSeller1Inv.data) ? resSeller1Inv.data : (resSeller1Inv.data.products || []);
        assert('Only seller 1 products appear', seller1Products.every(p => p.seller_id === 1));

        // Test 1.2: Check ordering by stock_quantity ASC
        const stocks = seller1Products.map(p => Number(p.stock_quantity));
        const isSortedAsc = stocks.every((val, i, arr) => !i || arr[i - 1] <= val);
        assert('Seller inventory ordered by stock_quantity ASC', isSortedAsc);

        // Test 1.3: Low-stock indicator logic verification
        assert('getStockStatus(0) is "Out of stock"', getStockStatus(0) === 'Out of stock');
        assert('getStockStatus(3) is "Low stock"', getStockStatus(3) === 'Low stock');
        assert('getStockStatus(4) is "Low stock"', getStockStatus(4) === 'Low stock');
        assert('getStockStatus(5) is "In stock"', getStockStatus(5) === 'In stock');
        assert('getStockStatus(20) is "In stock"', getStockStatus(20) === 'In stock');

        // Test 1.4: Update stock to 10
        // Find product 1 (owned by Seller 1)
        const resUpdateStock10 = await request('PUT', '/api/seller/products/1', { stock_quantity: 10 }, seller1Cookie);
        assert('Update stock to 10: HTTP 200', resUpdateStock10.status === 200);

        // Verify in database that stock_quantity is 10
        const [dbCheck10] = await db.execute('SELECT stock_quantity FROM products WHERE product_id = 1');
        assert('Database shows 10 units', Number(dbCheck10[0].stock_quantity) === 10);

        // Test 1.5: Update stock to -1 (Request is rejected)
        const resUpdateNegative = await request('PUT', '/api/seller/products/1', { stock_quantity: -1 }, seller1Cookie);
        assert('Update stock to -1: Request is rejected (HTTP 400)', resUpdateNegative.status === 400);

        // Test 1.6: Try accessing / modifying another seller's inventory (Access is denied)
        // Seller 2 attempts to modify Seller 1's product 1
        const resCrossSellerUpdate = await request('PUT', '/api/seller/products/1', { stock_quantity: 100 }, seller2Cookie);
        assert('Try accessing another seller inventory: Access is denied (HTTP 403)', resCrossSellerUpdate.status === 403);

        // Test 1.7: Customer cannot access seller-only endpoints
        const resCustomerSellerAccess = await request('GET', '/api/seller/products', null, customerCookie);
        assert('Customer cannot access seller-only endpoints: HTTP 403', resCustomerSellerAccess.status === 403);

        // Test 1.8: Hide inactive products from public catalogue
        const resPublic = await request('GET', '/api/products');
        assert('Public catalogue returns active products only', resPublic.status === 200);
        const publicProducts = resPublic.data.products || [];
        assert('Inactive products hidden from public catalogue', publicProducts.every(p => p.status === 'active'));
        assert('Zero stock products hidden from public catalogue', publicProducts.every(p => p.stock_quantity > 0));

        // -------------------------------------------------------------
        // SECTION 2: CUSTOMER SHOPPING CART
        // -------------------------------------------------------------
        console.log('\n--- 2. Customer Shopping Cart Endpoints ---');

        // Clear customer cart before testing
        await request('DELETE', '/api/cart', null, customerCookie);

        // Test 2.1: Add an available product to cart
        const resAddToCart = await request('POST', '/api/cart', {
            product_id: 1, // Has stock 10
            quantity: 2
        }, customerCookie);
        assert('Add an available product to cart: HTTP 201/200', resAddToCart.status === 201 || resAddToCart.status === 200);
        assert('Item appears in cart', resAddToCart.data.product_id === 1 && resAddToCart.data.quantity === 2);

        // Test 2.2: View cart and verify calculations
        const resViewCart = await request('GET', '/api/cart', null, customerCookie);
        assert('View cart: HTTP 200', resViewCart.status === 200);
        assert('Cart contains 1 line item', resViewCart.data.item_count === 1);
        assert('Cart total quantity is 2', resViewCart.data.total_quantity === 2);
        assert('Cart subtotal is calculated correctly on server', resViewCart.data.subtotal > 0);

        const cartItemId = resViewCart.data.items[0].cart_item_id;

        // Test 2.3: Set cart quantity to 0 (Request is rejected)
        const resZeroQty = await request('PUT', `/api/cart/${cartItemId}`, { quantity: 0 }, customerCookie);
        assert('Set cart quantity to 0: Request is rejected (HTTP 400)', resZeroQty.status === 400);

        // Test 2.4: Set cart quantity negative (Request is rejected)
        const resNegQty = await request('PUT', `/api/cart/${cartItemId}`, { quantity: -5 }, customerCookie);
        assert('Set cart quantity to negative: Request is rejected (HTTP 400)', resNegQty.status === 400);

        // Test 2.5: Request more units than available (Request is rejected)
        // Product 1 currently has stock 10. Requesting 15 units should be rejected.
        const resExceedStockPut = await request('PUT', `/api/cart/${cartItemId}`, { quantity: 15 }, customerCookie);
        assert('Request more units than available (PUT): Request is rejected (HTTP 400)', resExceedStockPut.status === 400);

        const resExceedStockPost = await request('POST', '/api/cart', {
            product_id: 1,
            quantity: 20 // Available is 10, already 2 in cart
        }, customerCookie);
        assert('Request more units than available (POST): Request is rejected (HTTP 400)', resExceedStockPost.status === 400);

        // Test 2.6: Add an inactive product (Request is rejected)
        // Product 6 is inactive ('Old Prototype Cable')
        const resAddInactive = await request('POST', '/api/cart', {
            product_id: 6,
            quantity: 1
        }, customerCookie);
        assert('Add an inactive product: Request is rejected (HTTP 404/400)', resAddInactive.status === 404 || resAddInactive.status === 400);

        // Test 2.7: Update valid quantity within available stock
        const resUpdateValidQty = await request('PUT', `/api/cart/${cartItemId}`, { quantity: 5 }, customerCookie);
        assert('Update valid quantity within stock: HTTP 200', resUpdateValidQty.status === 200);

        // Verify updated cart totals
        const resViewUpdated = await request('GET', '/api/cart', null, customerCookie);
        assert('Cart total quantity updated to 5', resViewUpdated.data.total_quantity === 5);

        // Test 2.8: Remove item from cart
        const resRemoveItem = await request('DELETE', `/api/cart/${cartItemId}`, null, customerCookie);
        assert('Remove item from cart: HTTP 200', resRemoveItem.status === 200);

        const resViewAfterRemove = await request('GET', '/api/cart', null, customerCookie);
        assert('Cart is now empty after removing item', resViewAfterRemove.data.item_count === 0 && resViewAfterRemove.data.total === 0);

        console.log(`\n======================================================`);
        console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
        console.log(`======================================================\n`);

    } finally {
        server.close();
    }

    if (failed > 0) {
        process.exit(1);
    }
    process.exit(0);
}

runTests().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
});
