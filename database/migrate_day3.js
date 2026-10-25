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

        console.log('🎉 Day 3 schema updates completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
