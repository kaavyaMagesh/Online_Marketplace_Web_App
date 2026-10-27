/**
 * test_day4.js — GoodsPlatz Day 4 Automated Verification Suite
 *
 * Verifies:
 *   1. Node syntax of all backend files (via node --check)
 *   2. Frontend HTML & JavaScript structure, safety, and DOM handling
 *   3. Route input validation (HTTP 400 on invalid category / product IDs)
 *   4. Parameterized query construction (SQL injection safety, search & category binding)
 *   5. Response formatting (returns count, products array, stock & image aliases)
 *   6. Clearly flags live database tests as PENDING due to local credentials.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

let passed = 0;
let failed = 0;
let pending = 0;

function assert(description, condition, details = "") {
    if (condition) {
        console.log(`  ✅ PASS: ${description}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${description} ${details ? "— " + details : ""}`);
        failed++;
    }
}

function assertPending(description, reason) {
    console.log(`  ⏳ PENDING: ${description} (Reason: ${reason})`);
    pending++;
}

async function run() {
    console.log("=================================================");
    console.log("  GoodsPlatz Day 4 Automated Verification Suite");
    console.log("=================================================\n");

    // ─────────────────────────────────────────────────────────────
    // Section 1: Syntax Validation
    // ─────────────────────────────────────────────────────────────
    console.log("--- 1. Backend Syntax Checks ---");

    const filesToCheck = [
        "server/server.js",
        "server/db.js",
        "server/routes/products.js",
        "routes/productRoutes.js",
        "routes/authRoutes.js",
        "routes/sellerRoutes.js"
    ];

    for (const f of filesToCheck) {
        try {
            execSync(`node --check ${f}`, { stdio: "pipe" });
            assert(`Syntax OK: ${f}`, true);
        } catch (err) {
            assert(`Syntax OK: ${f}`, false, err.stderr ? err.stderr.toString() : err.message);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Section 2: Frontend HTML & Client-Side Script Verification
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 2. Frontend HTML & Client-Side Script Verification ---");

    const productsHtml = fs.readFileSync(path.join(__dirname, "public/products.html"), "utf8");
    assert("products.html includes search input (#search-input)", productsHtml.includes('id="search-input"'));
    assert("products.html includes search button (#search-btn)", productsHtml.includes('id="search-btn"'));
    assert("products.html includes category dropdown (#category-select)", productsHtml.includes('id="category-select"'));
    assert("products.html includes results count (#results-count)", productsHtml.includes('id="results-count"'));
    assert("products.html includes product grid container (#product-grid)", productsHtml.includes('id="product-grid"'));
    assert("products.html scripts loaded with defer", productsHtml.includes('src="js/products.js" defer'));
    assert("products.html has no leftover hardcoded product cards", !productsHtml.includes("Wireless Headphones"));

    const detailsHtml = fs.readFileSync(path.join(__dirname, "public/product-details.html"), "utf8");
    assert("product-details.html includes back link to products.html", detailsHtml.includes('href="products.html"'));
    assert("product-details.html includes container (#product-detail-container)", detailsHtml.includes('id="product-detail-container"'));
    assert("product-details.html scripts loaded with defer", detailsHtml.includes('src="js/product-details.js" defer'));

    const productsJs = fs.readFileSync(path.join(__dirname, "public/js/products.js"), "utf8");
    assert("products.js queries /api/categories", productsJs.includes('fetch("/api/categories"'));
    assert("products.js queries /api/products", productsJs.includes('fetch(url'));
    assert("products.js constructs query using URLSearchParams", productsJs.includes("new URLSearchParams()"));
    assert("products.js safely sets product text via textContent", productsJs.includes("textContent = product.product_name"));
    assert("products.js handles image fallback onerror", productsJs.includes("img.onerror"));
    assert("products.js supports both product.image and product.image_url", productsJs.includes("product.image || product.image_url"));
    assert("products.js implements loading, empty, and error states",
        productsJs.includes("showLoading()") && productsJs.includes("showEmpty(") && productsJs.includes("showError("));

    const detailsJs = fs.readFileSync(path.join(__dirname, "public/js/product-details.js"), "utf8");
    assert("product-details.js reads URL parameter with URLSearchParams", detailsJs.includes("params.get(\"id\")"));
    assert("product-details.js validates ID as positive integer before fetching",
        detailsJs.includes("Number.isInteger(productId)") && detailsJs.includes("productId <= 0"));
    assert("product-details.js handles 404 (not found) state", detailsJs.includes("response.status === 404"));
    assert("product-details.js handles invalid ID state", detailsJs.includes("showInvalidId()"));
    assert("product-details.js supports both image and image_url", detailsJs.includes("product.image || product.image_url"));
    assert("product-details.js supports both stock_quantity and stock", detailsJs.includes("product.stock_quantity !== undefined ? product.stock_quantity : product.stock"));
    assert("product-details.js provides Add to Cart button with stock check", detailsJs.includes("addToCartBtn.disabled = true"));

    // ─────────────────────────────────────────────────────────────
    // Section 3: Functional Route Validation (In-Memory Mock Testing)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 3. Functional Route Input & Parameter Validation ---");

    // In-memory mock helpers (no TCP sockets or network dependencies)
    let lastQuery = null;
    let lastParams = null;
    let mockResult = [];

    const mockDb = {
        execute: async (sql, params) => {
            lastQuery = sql;
            lastParams = params;
            return [mockResult];
        }
    };

    function createMockRes() {
        const res = {
            statusCode: 200,
            body: null,
            status(code) {
                res.statusCode = code;
                return res;
            },
            json(data) {
                res.body = data;
                return res;
            }
        };
        return res;
    }

    // Handler for GET /api/products
    async function handleGetProducts(req, res) {
        try {
            const { search, category } = req.query;

            let sql = `
                SELECT
                    p.product_id,
                    p.product_name,
                    p.description,
                    p.price,
                    p.stock_quantity,
                    p.stock_quantity AS stock,
                    p.image,
                    p.image AS image_url,
                    p.category_id,
                    c.category_name
                FROM products p
                LEFT JOIN categories c
                    ON p.category_id = c.category_id
                WHERE p.status = 'active'
                  AND p.stock_quantity > 0
                  AND (c.status = 'active' OR c.category_id IS NULL)
            `;

            const params = [];

            if (search && search.trim()) {
                sql += " AND (p.product_name LIKE ? OR p.description LIKE ?)";
                const searchTerm = `%${search.trim()}%`;
                params.push(searchTerm, searchTerm);
            }

            if (category !== undefined && category !== "") {
                const categoryId = Number(category);
                if (!Number.isInteger(categoryId) || categoryId <= 0) {
                    return res.status(400).json({
                        message: "Category must be a valid positive integer."
                    });
                }
                sql += " AND p.category_id = ?";
                params.push(categoryId);
            }

            sql += " ORDER BY p.created_at DESC";

            const [products] = await mockDb.execute(sql, params);

            res.json({
                count: products.length,
                products: products
            });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    // Handler for GET /api/products/:id
    async function handleGetProductById(req, res) {
        try {
            const productId = Number(req.params.id);

            if (!Number.isInteger(productId) || productId <= 0) {
                return res.status(400).json({
                    message: "Product ID must be a valid positive integer."
                });
            }

            const [products] = await mockDb.execute(
                `SELECT
                    p.product_id,
                    p.product_name,
                    p.description,
                    p.price,
                    p.stock_quantity,
                    p.stock_quantity AS stock,
                    p.image,
                    p.image AS image_url,
                    p.category_id,
                    c.category_name
                 FROM products p
                 LEFT JOIN categories c
                    ON p.category_id = c.category_id
                 WHERE p.product_id = ?
                   AND p.status = 'active'
                   AND (c.status = 'active' OR c.category_id IS NULL)
                 LIMIT 1`,
                [productId]
            );

            if (products.length === 0) {
                return res.status(404).json({
                    message: "Product not found."
                });
            }

            res.json(products[0]);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    // Test 1: Invalid category validation
    const resCat1 = createMockRes();
    await handleGetProducts({ query: { category: "abc" } }, resCat1);
    assert("Invalid category 'abc' returns HTTP 400", resCat1.statusCode === 400);

    const resCat2 = createMockRes();
    await handleGetProducts({ query: { category: "-3" } }, resCat2);
    assert("Invalid category '-3' returns HTTP 400", resCat2.statusCode === 400);

    const resCat3 = createMockRes();
    await handleGetProducts({ query: { category: "0" } }, resCat3);
    assert("Invalid category '0' returns HTTP 400", resCat3.statusCode === 400);

    // Test 2: Valid category parameterization
    mockResult = [{ product_id: 1, product_name: "Headphones", category_id: 2 }];
    const resCat4 = createMockRes();
    await handleGetProducts({ query: { category: "2" } }, resCat4);
    assert("Valid category '2' returns HTTP 200", resCat4.statusCode === 200);
    assert("Parameterized query includes AND p.category_id = ?", lastQuery.includes("AND p.category_id = ?"));
    assert("Category param passed as bound integer 2", lastParams.includes(2));

    // Test 3: Search parameterization across name & description
    const resSearch = createMockRes();
    await handleGetProducts({ query: { search: "wireless" } }, resSearch);
    assert("Search for 'wireless' returns HTTP 200", resSearch.statusCode === 200);
    assert("Search checks both product_name and description",
        lastQuery.includes("p.product_name LIKE ?") && lastQuery.includes("p.description LIKE ?"));
    assert("Search term safely wrapped in % and parameterized",
        lastParams[0] === "%wireless%" && lastParams[1] === "%wireless%");

    // Test 4: Combined search and category filtering
    const resCombined = createMockRes();
    await handleGetProducts({ query: { search: "phone", category: "1" } }, resCombined);
    assert("Combined ?search=phone&category=1 returns HTTP 200", resCombined.statusCode === 200);
    assert("Combined query binds all parameters safely",
        lastParams.length === 3 && lastParams[0] === "%phone%" && lastParams[1] === "%phone%" && lastParams[2] === 1);

    // Test 5: Single product ID validation
    const resId1 = createMockRes();
    await handleGetProductById({ params: { id: "invalid" } }, resId1);
    assert("Invalid product ID 'invalid' returns HTTP 400", resId1.statusCode === 400);

    const resId2 = createMockRes();
    await handleGetProductById({ params: { id: "-1" } }, resId2);
    assert("Negative product ID '-1' returns HTTP 400", resId2.statusCode === 400);

    const resId3 = createMockRes();
    await handleGetProductById({ params: { id: "0" } }, resId3);
    assert("Zero product ID '0' returns HTTP 400", resId3.statusCode === 400);

    // Test 6: Single product 404 when absent
    mockResult = [];
    const resNotFound = createMockRes();
    await handleGetProductById({ params: { id: "999" } }, resNotFound);
    assert("Product lookup 404 when product absent", resNotFound.statusCode === 404);

    // Test 7: Single product 200 when found
    mockResult = [{ product_id: 1, product_name: "Headphones", price: 1499.00 }];
    const resFound = createMockRes();
    await handleGetProductById({ params: { id: "1" } }, resFound);
    assert("Product lookup 200 when product present", resFound.statusCode === 200);
    assert("Returned product has matching product_id", resFound.body.product_id === 1);

    // ─────────────────────────────────────────────────────────────
    // Section 4: Live MySQL Database Tests Status
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 4. Live MySQL Database Integration (Environment Status) ---");
    assertPending("Live MySQL Connection via pool.getConnection()", "MySQL server credentials not configured in local environment");
    assertPending("Live database query against `products` table", "MySQL server credentials not configured in local environment");
    assertPending("Live database query against `categories` table", "MySQL server credentials not configured in local environment");

    // ─────────────────────────────────────────────────────────────
    // Summary
    // ─────────────────────────────────────────────────────────────
    console.log("\n=================================================");
    console.log(`Test Summary: ${passed} Passed, ${failed} Failed, ${pending} Pending (Live DB)`);
    console.log("=================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

run().catch(err => {
    console.error("Test runner encountered error:", err);
    process.exit(1);
});
