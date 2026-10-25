
const http = require('http');
const app = require('./server/server');

const PORT = 5098;

// Test-only route. This is NOT a real login endpoint.
app.post('/api/test-admin-session', (req, res) => {
    req.session.user = req.body;
    res.json({ success: true });
});

function request(method, route, body, cookie) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;

        const req = http.request({
            hostname: '127.0.0.1',
            port: PORT,
            path: route,
            method,
            headers: {
                ...(data ? {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                } : {}),
                ...(cookie ? { Cookie: cookie } : {})
            }
        }, (res) => {
            res.resume();
            res.on('end', () => resolve({
                status: res.statusCode,
                cookie: res.headers['set-cookie']?.[0]?.split(';')[0]
            }));
        });

        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function run() {
    const server = app.listen(PORT, '127.0.0.1');

    try {
        const cases = [
            { name: 'Customer', role: 'customer', admin: 403, super: 403 },
            { name: 'Seller', role: 'seller', admin: 403, super: 403 },
            { name: 'Admin', role: 'admin', admin: 200, super: 403 },
            { name: 'Super Admin', role: 'super_admin', admin: 403, super: 200 },
            { name: 'Blocked Admin', role: 'admin', status: 'blocked', admin: 403, super: 403 }
        ];

        let failures = 0;

        const unauthAdmin = await request('GET', '/api/admin/check');
        const unauthSuper = await request('GET', '/api/admin/super/check');

        if (unauthAdmin.status !== 401 || unauthSuper.status !== 401) {
            failures++;
            console.log('FAIL: Unauthenticated access');
        } else {
            console.log('PASS: Unauthenticated access');
        }

        for (const test of cases) {
            const session = await request('POST', '/api/test-admin-session', {
                user_id: 1,
                role: test.role,
                status: test.status || 'active'
            });

            const admin = await request('GET', '/api/admin/check', null, session.cookie);
            const superAdmin = await request('GET', '/api/admin/super/check', null, session.cookie);

            const passed =
                admin.status === test.admin &&
                superAdmin.status === test.super;

            console.log(
                `${passed ? 'PASS' : 'FAIL'}: ${test.name} ` +
                `(Admin: ${admin.status}, Super Admin: ${superAdmin.status})`
            );

            if (!passed) failures++;
        }

        process.exitCode = failures ? 1 : 0;
    } finally {
        server.close();
    }
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
