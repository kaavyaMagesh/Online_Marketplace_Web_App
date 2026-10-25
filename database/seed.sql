USE online_marketplace;

-- 1. Insert Categories
INSERT INTO categories (category_name, description, status)
VALUES
('Electronics', 'Electronic devices and accessories', 'active'),
('Clothing', 'Clothes and fashion accessories', 'active'),
('Books', 'Books and educational materials', 'active'),
('Home & Kitchen', 'Home and kitchen products', 'active')
ON DUPLICATE KEY UPDATE description = VALUES(description), status = VALUES(status);

-- 2. Insert Test Users (Passwords hashed for 'Marketplace@123')
INSERT INTO users (user_id, name, email, password, phone, role, status)
VALUES
(1, 'TechMart Seller', 'seller@marketplace.com', '$2a$10$wK1.V/l/W3Qk8o1sF7w7Ie9R71MkV5l1z8K8z8k9n7h6a5c4b3d2e', '9876543210', 'seller', 'active'),
(2, 'UrbanTrends Seller', 'seller2@marketplace.com', '$2a$10$wK1.V/l/W3Qk8o1sF7w7Ie9R71MkV5l1z8K8z8k9n7h6a5c4b3d2e', '9876543211', 'seller', 'active'),
(3, 'Alice Customer', 'customer@marketplace.com', '$2a$10$wK1.V/l/W3Qk8o1sF7w7Ie9R71MkV5l1z8K8z8k9n7h6a5c4b3d2e', '9876543220', 'customer', 'active'),
(4, 'Super Admin', 'admin@marketplace.com', '$2a$10$wK1.V/l/W3Qk8o1sF7w7Ie9R71MkV5l1z8K8z8k9n7h6a5c4b3d2e', '9876543230', 'super_admin', 'active')
ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role), status = VALUES(status);

-- 3. Insert Sample Products
INSERT INTO products (
    product_id,
    seller_id,
    category_id,
    product_name,
    description,
    price,
    stock_quantity,
    image,
    status
)
VALUES
(1, 1, 1, 'Wireless Headphones', 'Premium noise-cancelling wireless headphones with 30hr battery life.', 1499.00, 20, 'images/headphones.jpg', 'active'),
(2, 1, 1, 'Smart Watch v2', 'Waterproof fitness tracking smartwatch with heart rate monitor.', 2499.00, 15, 'images/smartwatch.jpg', 'active'),
(3, 2, 2, 'Travel Backpack', 'Spacious water-resistant everyday backpack for laptops and travel.', 999.00, 30, 'images/backpack.jpg', 'active'),
(4, 2, 3, 'Clean Code JavaScript Guide', 'Best practices and design patterns for modern JavaScript developers.', 599.00, 12, 'images/book.jpg', 'active'),
(5, 1, 1, 'Vintage Stereo Speakers', 'Rare vintage acoustic speakers with oak casing.', 4999.00, 0, 'images/speakers.jpg', 'active'),
(6, 1, 1, 'Old Prototype Cable', 'Discontinued test cable model.', 99.00, 5, 'images/cable.jpg', 'inactive')
ON DUPLICATE KEY UPDATE product_name = VALUES(product_name), price = VALUES(price), stock_quantity = VALUES(stock_quantity);