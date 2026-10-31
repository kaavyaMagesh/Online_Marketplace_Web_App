const bcrypt = require('bcryptjs');
const { pool } = require('../server/db');

async function seedDatabase() {
    try {
        console.log('🌱 Seeding database...');

        // 1. Ensure Categories exist with active status
        const categories = [
            ['Electronics', 'Electronic devices and accessories', 'active'],
            ['Clothing', 'Clothes and fashion accessories', 'active'],
            ['Books', 'Books and educational materials', 'active'],
            ['Home & Kitchen', 'Home and kitchen products', 'active']
        ];

        for (const [name, desc, status] of categories) {
            await pool.query(
                `INSERT INTO categories (category_name, description, status)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE description = VALUES(description), status = VALUES(status)`,
                [name, desc, status]
            );
        }
        console.log('✅ Categories verified and updated');

        // 2. Fetch category map
        const [catRows] = await pool.query('SELECT category_id, category_name FROM categories');
        const catMap = {};
        catRows.forEach(c => { catMap[c.category_name] = c.category_id; });

        // 3. Ensure test users exist
        const hashedPassword = await bcrypt.hash('Marketplace@123', 10);

        const users = [
            ['TechMart Seller', 'seller@marketplace.com', hashedPassword, '9876543210', 'seller', 'active'],
            ['UrbanTrends Seller', 'seller2@marketplace.com', hashedPassword, '9876543211', 'seller', 'active'],
            ['Alice Customer', 'customer@marketplace.com', hashedPassword, '9876543220', 'customer', 'active'],
            ['Super Admin', 'admin@marketplace.com', hashedPassword, '9876543230', 'super_admin', 'active']
        ];

        for (const [name, email, pwd, phone, role, status] of users) {
            await pool.query(
                `INSERT INTO users (name, email, password, phone, role, status)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role), status = VALUES(status)`,
                [name, email, pwd, phone, role, status]
            );
        }
        console.log('✅ Test users verified');

        // 4. Fetch seller IDs
        const [sellers] = await pool.query("SELECT user_id, email FROM users WHERE role = 'seller'");
        const seller1Id = sellers.find(s => s.email === 'seller@marketplace.com')?.user_id;
        const seller2Id = sellers.find(s => s.email === 'seller2@marketplace.com')?.user_id;

        // 5. Seed test products if table is empty
        const [prodCount] = await pool.query('SELECT COUNT(*) AS count FROM products');
        if (prodCount[0].count === 0 && seller1Id && seller2Id) {
            const products = [
                [seller1Id, catMap['Electronics'], 'Wireless Headphones', 'Premium noise-cancelling wireless headphones with 30hr battery life.', 1499.00, 20, 'images/headphones.jpg', 'active'],
                [seller1Id, catMap['Electronics'], 'Smart Watch v2', 'Waterproof fitness tracking smartwatch with heart rate monitor.', 2499.00, 15, 'images/smartwatch.jpg', 'active'],
                [seller2Id, catMap['Clothing'], 'Travel Backpack', 'Spacious water-resistant everyday backpack for laptops and travel.', 999.00, 30, 'images/backpack.jpg', 'active'],
                [seller2Id, catMap['Books'], 'Clean Code JavaScript Guide', 'Best practices and design patterns for modern JavaScript developers.', 599.00, 12, 'images/book.jpg', 'active'],
                // Out-of-stock product (should be hidden from active public catalog)
                [seller1Id, catMap['Electronics'], 'Vintage Stereo Speakers', 'Rare vintage acoustic speakers with oak casing.', 4999.00, 0, 'images/speakers.jpg', 'active'],
                // Inactive product (should be hidden from active public catalog)
                [seller1Id, catMap['Electronics'], 'Old Prototype Cable', 'Discontinued test cable model.', 99.00, 5, 'images/cable.jpg', 'inactive']
            ];

            for (const p of products) {
                await pool.query(
                    `INSERT INTO products (seller_id, category_id, product_name, description, price, stock_quantity, image, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    p
                );
            }
            console.log('✅ Seeded 6 initial test products');
        } else {
            console.log(`ℹ️  Products table already has ${prodCount[0].count} product(s). Resetting active status for core items...`);
            await pool.query("UPDATE products SET status = 'active', stock_quantity = 20 WHERE product_id = 1");
            await pool.query("UPDATE products SET status = 'active', stock_quantity = 15 WHERE product_id = 2");
            await pool.query("UPDATE products SET status = 'active', stock_quantity = 30 WHERE product_id = 3");
            await pool.query("UPDATE products SET status = 'active', stock_quantity = 12 WHERE product_id = 4");
        }

        console.log('🎉 Database seeding complete!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding failed:', err);
        process.exit(1);
    }
}

seedDatabase();
