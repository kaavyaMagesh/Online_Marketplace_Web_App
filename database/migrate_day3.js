const { pool } = require('../server/db');

async function migrate() {
    try {
        console.log('Running Day 3 schema updates...');

        // 1. Ensure categories has status column
        const [catCols] = await pool.query("SHOW COLUMNS FROM categories LIKE 'status'");
        if (catCols.length === 0) {
            await pool.query("ALTER TABLE categories ADD COLUMN status ENUM('active', 'inactive') NOT NULL DEFAULT 'active'");
            console.log('✅ Added status column to categories');
        } else {
            console.log('ℹ️  status column already exists on categories');
        }

        // 2. Ensure products has stock_quantity (and alias/virtual stock)
        const [stockQtyCols] = await pool.query("SHOW COLUMNS FROM products LIKE 'stock_quantity'");
        if (stockQtyCols.length === 0) {
            // Check if 'stock' is a regular column
            const [stockCols] = await pool.query("SHOW COLUMNS FROM products LIKE 'stock'");
            if (stockCols.length > 0 && stockCols[0].Extra !== 'VIRTUAL GENERATED') {
                try {
                    await pool.query("ALTER TABLE products DROP CHECK products_chk_2");
                } catch (e) {
                    // Ignore if constraint name differs
                }
                await pool.query("ALTER TABLE products CHANGE COLUMN stock stock_quantity INT NOT NULL DEFAULT 0");
                await pool.query("ALTER TABLE products ADD CONSTRAINT products_chk_stock CHECK (stock_quantity >= 0)");
                console.log('✅ Renamed stock to stock_quantity in products');
            } else {
                await pool.query("ALTER TABLE products ADD COLUMN stock_quantity INT NOT NULL DEFAULT 0");
                console.log('✅ Added stock_quantity to products');
            }
        } else {
            console.log('ℹ️  stock_quantity column already exists on products');
        }


        // Ensure virtual stock column exists for backwards-compatibility
        const [stockCols] = await pool.query("SHOW COLUMNS FROM products LIKE 'stock'");
        if (stockCols.length === 0) {
            await pool.query("ALTER TABLE products ADD COLUMN stock INT GENERATED ALWAYS AS (stock_quantity) VIRTUAL");
            console.log('✅ Added virtual stock column to products');
        }

        // 3. Ensure products has image (and alias/virtual image_url)
        const [imgCols] = await pool.query("SHOW COLUMNS FROM products LIKE 'image'");
        if (imgCols.length === 0) {
            const [urlCols] = await pool.query("SHOW COLUMNS FROM products LIKE 'image_url'");
            if (urlCols.length > 0 && urlCols[0].Extra !== 'VIRTUAL GENERATED') {
                await pool.query("ALTER TABLE products CHANGE COLUMN image_url image VARCHAR(500)");
                console.log('✅ Renamed image_url to image in products');
            } else {
                await pool.query("ALTER TABLE products ADD COLUMN image VARCHAR(500)");
                console.log('✅ Added image to products');
            }
        } else {
            console.log('ℹ️  image column already exists on products');
        }

        // Ensure virtual image_url exists for backwards-compatibility
        const [urlCols] = await pool.query("SHOW COLUMNS FROM products LIKE 'image_url'");
        if (urlCols.length === 0) {
            await pool.query("ALTER TABLE products ADD COLUMN image_url VARCHAR(500) GENERATED ALWAYS AS (image) VIRTUAL");
            console.log('✅ Added virtual image_url column to products');
        }

        // 4. Ensure cart has customer_id column (and backwards-compatible user_id virtual column)
        const [custCols] = await pool.query("SHOW COLUMNS FROM cart LIKE 'customer_id'");
        if (custCols.length === 0) {
            // Find existing foreign key on user_id if any
            const [fks] = await pool.query(
                "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cart' AND COLUMN_NAME = 'user_id' AND REFERENCED_TABLE_NAME IS NOT NULL"
            );
            for (const fk of fks) {
                try {
                    await pool.query(`ALTER TABLE cart DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`);
                } catch (e) {
                    // Ignore if already dropped
                }
            }
            const [userCols] = await pool.query("SHOW COLUMNS FROM cart LIKE 'user_id'");
            if (userCols.length > 0 && userCols[0].Extra !== 'VIRTUAL GENERATED') {
                try {
                    await pool.query("ALTER TABLE cart DROP INDEX user_id");
                } catch (e) {
                    // Ignore if index name differs
                }
                await pool.query("ALTER TABLE cart CHANGE COLUMN user_id customer_id INT NOT NULL UNIQUE");
                await pool.query("ALTER TABLE cart ADD CONSTRAINT fk_cart_customer FOREIGN KEY (customer_id) REFERENCES users(user_id) ON DELETE CASCADE");
                await pool.query("ALTER TABLE cart ADD COLUMN user_id INT GENERATED ALWAYS AS (customer_id) VIRTUAL");
                console.log('✅ Updated cart table to use customer_id with user_id virtual column');
            } else {
                await pool.query("ALTER TABLE cart ADD COLUMN customer_id INT NOT NULL UNIQUE");
                await pool.query("ALTER TABLE cart ADD CONSTRAINT fk_cart_customer FOREIGN KEY (customer_id) REFERENCES users(user_id) ON DELETE CASCADE");
                console.log('✅ Added customer_id to cart');
            }
        } else {
            console.log('ℹ️  customer_id column already exists on cart');
        }

        // 5. Ensure cart_items has price, created_at, and updated_at
        const [priceCols] = await pool.query("SHOW COLUMNS FROM cart_items LIKE 'price'");
        if (priceCols.length === 0) {
            await pool.query("ALTER TABLE cart_items ADD COLUMN price DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER quantity");
            await pool.query("ALTER TABLE cart_items ADD CONSTRAINT cart_items_chk_price CHECK (price >= 0)");
            console.log('✅ Added price column to cart_items');
        } else {
            console.log('ℹ️  price column already exists on cart_items');
        }

        const [createdCols] = await pool.query("SHOW COLUMNS FROM cart_items LIKE 'created_at'");
        if (createdCols.length === 0) {
            const [addedCols] = await pool.query("SHOW COLUMNS FROM cart_items LIKE 'added_at'");
            if (addedCols.length > 0 && addedCols[0].Extra !== 'VIRTUAL GENERATED') {
                await pool.query("ALTER TABLE cart_items CHANGE COLUMN added_at created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
                await pool.query("ALTER TABLE cart_items ADD COLUMN added_at TIMESTAMP GENERATED ALWAYS AS (created_at) VIRTUAL");
                console.log('✅ Renamed added_at to created_at and added virtual added_at in cart_items');
            } else {
                await pool.query("ALTER TABLE cart_items ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
                console.log('✅ Added created_at to cart_items');
            }
        } else {
            console.log('ℹ️  created_at column already exists on cart_items');
        }

        const [updatedCols] = await pool.query("SHOW COLUMNS FROM cart_items LIKE 'updated_at'");
        if (updatedCols.length === 0) {
            await pool.query("ALTER TABLE cart_items ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
            console.log('✅ Added updated_at to cart_items');
        } else {
            console.log('ℹ️  updated_at column already exists on cart_items');
        }

        // 6. Ensure order_items has item_status column
        const [statusCols] = await pool.query("SHOW COLUMNS FROM order_items LIKE 'item_status'");
        if (statusCols.length === 0) {
            await pool.query(
                "ALTER TABLE order_items ADD COLUMN item_status ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled') NOT NULL DEFAULT 'confirmed' AFTER subtotal"
            );
            console.log('✅ Added item_status column to order_items');
        } else {
            console.log('ℹ️  item_status column already exists on order_items');
        }

        // 7. Seed initial system settings if empty
        const [settingsCount] = await pool.query("SELECT COUNT(*) AS count FROM system_settings");
        if (settingsCount[0].count === 0) {
            await pool.query(`
                INSERT INTO system_settings (setting_key, setting_value) VALUES
                ('site_name', 'GoodsPlatz Marketplace'),
                ('maintenance_mode', 'false'),
                ('min_order_amount', '100'),
                ('currency', 'INR'),
                ('free_shipping_threshold', '499')
            `);
            console.log('✅ Seeded default system settings');
        }

        console.log('🎉 Database schema migrations completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
