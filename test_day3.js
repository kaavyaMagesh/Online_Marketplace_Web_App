const http = require('http');
const app = require('./server/server');

const PORT = 5099;

// Add a test-only route to set session state for testing auth scenarios
app.post('/api/test-session', (req, res) => {
    req.session.user = req.body;
    res.json({ session_set: true, user: req.session.user });
});

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
    console.log('🚀 Starting Comprehensive Day 3 Verification Tests...\n');
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
        // --- 1. Server & Database Health ---
        console.log('--- 1. Server & Database Health ---');
        const resRoot = await request('GET', '/');
        assert('Root endpoint returns HTTP 200', resRoot.status === 200);
        assert('Root endpoint reports running status', resRoot.data.status === 'running');

        const resHealth = await request('GET', '/api/health');
        assert('Health check returns HTTP 200', resHealth.status === 200);
        assert('MySQL connection verified via server', resHealth.data.status === 'success');

        // --- 2. Public Product API ---
        console.log('\n--- 2. Public Product API ---');
        const resProducts = await request('GET', '/api/products');
        assert('GET /api/products returns HTTP 200', resProducts.status === 200);
        assert('Returns JSON count and products array', Array.isArray(resProducts.data.products) && typeof resProducts.data.count === 'number');
        assert('Excludes out-of-stock items (stock_quantity > 0)', resProducts.data.products.every(p => p.stock_quantity > 0));
        assert('Excludes inactive items (status === active)', resProducts.data.products.every(p => p.status === 'active' || p.status === undefined));

        // Search filter
        const resSearch = await request('GET', '/api/products?search=Headphones');
        assert('GET /api/products?search=Headphones returns 200', resSearch.status === 200);
        assert('Finds matching product name', resSearch.data.products.some(p => p.product_name.includes('Headphones')));

        // Category filter
        const resCat = await request('GET', '/api/products?category=1');
        assert('GET /api/products?category=1 returns 200', resCat.status === 200);
        assert('All returned items belong to category 1', resCat.data.products.every(p => p.category_id === 1));

        // Invalid category
        const resInvalidCat = await request('GET', '/api/products?category=invalid');
        assert('GET /api/products?category=invalid returns HTTP 400', resInvalidCat.status === 400);

        // Single product lookup
        const testProdId = resProducts.data.products[0].product_id;
        const resSingle = await request('GET', `/api/products/${testProdId}`);
        assert(`GET /api/products/${testProdId} returns HTTP 200`, resSingle.status === 200);
        assert('Single product contains expected fields', resSingle.data.product_id === testProdId && resSingle.data.product_name && resSingle.data.price);

        // Invalid product ID
        const resInvalidId = await request('GET', '/api/products/abc');
        assert('GET /api/products/abc returns HTTP 400', resInvalidId.status === 400);

        // Missing/Non-existent product ID
        const resNotFound = await request('GET', '/api/products/999999');
        assert('GET /api/products/999999 returns HTTP 404', resNotFound.status === 404);

        // --- 3. Seller Security & Ownership Enforcement ---
        console.log('\n--- 3. Seller Security & Ownership Enforcement ---');

        // Unauthenticated access
        const resUnauth = await request('GET', '/api/seller/products');
        assert('Unauthenticated request to /api/seller/products returns HTTP 401', resUnauth.status === 401);

        // Customer attempting seller endpoint
        const sessCustomer = await request('POST', '/api/test-session', { user_id: 3, role: 'customer', status: 'active' });
        const resCustomerAccess = await request('GET', '/api/seller/products', null, sessCustomer.cookie);
        assert('Customer role blocked with HTTP 403 Forbidden', resCustomerAccess.status === 403);

        // Blocked seller attempting access
        const sessBlockedSeller = await request('POST', '/api/test-session', { user_id: 1, role: 'seller', status: 'blocked' });
        const resBlockedAccess = await request('GET', '/api/seller/products', null, sessBlockedSeller.cookie);
        assert('Blocked seller blocked with HTTP 403 Forbidden', resBlockedAccess.status === 403);

        // Active Seller 1 (Owner of product 1)
        const sessSeller1 = await request('POST', '/api/test-session', { user_id: 1, role: 'seller', status: 'active' });
        const resSeller1List = await request('GET', '/api/seller/products', null, sessSeller1.cookie);
        assert('Seller 1 receives own products list with HTTP 200', resSeller1List.status === 200);
        assert('Seller 1 only sees products where seller_id === 1', resSeller1List.data.products.every(p => p.seller_id === 1));

        // Seller 1 updating own product (product 1)
        const resUpdateOwn = await request('PUT', '/api/seller/products/1', { price: 1549.00 }, sessSeller1.cookie);
        assert('Seller 1 can update own product (HTTP 200)', resUpdateOwn.status === 200);

        // Active Seller 2 (Owner of product 3, NOT product 1)
        const sessSeller2 = await request('POST', '/api/test-session', { user_id: 2, role: 'seller', status: 'active' });

        // Cross-seller ownership check: Seller 2 attempts to modify Seller 1's product
        const resCrossUpdate = await request('PUT', '/api/seller/products/1', { price: 10.00 }, sessSeller2.cookie);
        assert('Seller 2 cannot update Seller 1 product (HTTP 403 Forbidden)', resCrossUpdate.status === 403);
        assert('Returns ownership restriction error', resCrossUpdate.data.error && resCrossUpdate.data.error.includes('Forbidden'));

        // Cross-seller ownership check: Seller 2 attempts to delete Seller 1's product
        const resCrossDelete = await request('DELETE', '/api/seller/products/1', null, sessSeller2.cookie);
        assert('Seller 2 cannot delete Seller 1 product (HTTP 403 Forbidden)', resCrossDelete.status === 403);

        // Seller 2 updating Seller 2's own product (product 3)
        const resSeller2Own = await request('PUT', '/api/seller/products/3', { stock_quantity: 35 }, sessSeller2.cookie);
        assert('Seller 2 can update own product (HTTP 200)', resSeller2Own.status === 200);

        console.log(`\n=================================================`);
        console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
        console.log(`=================================================\n`);

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
