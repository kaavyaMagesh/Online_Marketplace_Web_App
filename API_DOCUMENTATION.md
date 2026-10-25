# GoodsPlatz Marketplace — Backend API & Database Reference

This document outlines the API endpoints, database column names, and security rules for all team members (Frontend, Customer, Seller, and Admin modules).

---

## 1. Database Schema Details

### `products` Table
| Column Name | Type | Constraints / Description |
|---|---|---|
| `product_id` | INT | Primary Key, Auto-increment |
| `seller_id` | INT | Foreign Key (`users.user_id`), NOT NULL |
| `category_id` | INT | Foreign Key (`categories.category_id`), Nullable |
| `product_name` | VARCHAR(200) | NOT NULL, Indexed |
| `description` | TEXT | Product details and specifications |
| `price` | DECIMAL(10,2) | NOT NULL, CHECK (`price >= 0`) |
| `stock_quantity` | INT | NOT NULL, DEFAULT 0, CHECK (`stock_quantity >= 0`) |
| `stock` | INT | Virtual alias of `stock_quantity` for backward compatibility |
| `image` | VARCHAR(500) | Relative image path or URL |
| `image_url` | VARCHAR(500) | Virtual alias of `image` for backward compatibility |
| `status` | ENUM | `'active'`, `'inactive'` (DEFAULT: `'active'`) |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP ON UPDATE |

### `categories` Table
| Column Name | Type | Constraints / Description |
|---|---|---|
| `category_id` | INT | Primary Key, Auto-increment |
| `category_name` | VARCHAR(100) | UNIQUE, NOT NULL |
| `description` | TEXT | Category description |
| `status` | ENUM | `'active'`, `'inactive'` (DEFAULT: `'active'`) |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

### `users` Table
| Column Name | Type | Constraints / Description |
|---|---|---|
| `user_id` | INT | Primary Key, Auto-increment |
| `name` | VARCHAR(100) | User full name |
| `email` | VARCHAR(150) | UNIQUE, NOT NULL |
| `password` | VARCHAR(255) | Bcrypt hashed password (never plaintext) |
| `phone` | VARCHAR(20) | Contact number |
| `role` | ENUM | `'customer'`, `'seller'`, `'admin'`, `'super_admin'` |
| `status` | ENUM | `'active'`, `'blocked'`, `'pending'` |

---

## 2. Public Product API (`/api/products`)

Accessible by customers and guests. Only displays **active products** with **stock > 0** in **active categories**.

### 2.1 List Products
- **Method**: `GET`
- **Path**: `/api/products`
- **Query Parameters**:
  - `search` *(optional string)*: Case-insensitive search on `product_name` (e.g. `?search=phone`).
  - `category` *(optional integer)*: Filter by `category_id` (e.g. `?category=1`).
- **Success Response (200 OK)**:
```json
{
  "count": 2,
  "products": [
    {
      "product_id": 1,
      "product_name": "Wireless Headphones",
      "description": "Premium noise-cancelling wireless headphones with 30hr battery life.",
      "price": "1499.00",
      "stock_quantity": 20,
      "stock": 20,
      "image": "images/headphones.jpg",
      "image_url": "images/headphones.jpg",
      "category_id": 1,
      "category_name": "Electronics"
    }
  ]
}
```
- **Error Response (400 Bad Request)**:
```json
{
  "message": "Category must be a valid positive integer."
}
```

### 2.2 Get Single Product
- **Method**: `GET`
- **Path**: `/api/products/:id`
- **URL Parameter**: `id` (Positive Integer)
- **Success Response (200 OK)**:
```json
{
  "product_id": 1,
  "product_name": "Wireless Headphones",
  "description": "Premium noise-cancelling wireless headphones with 30hr battery life.",
  "price": "1499.00",
  "stock_quantity": 20,
  "stock": 20,
  "image": "images/headphones.jpg",
  "image_url": "images/headphones.jpg",
  "category_id": 1,
  "category_name": "Electronics"
}
```
- **Error Response (400 Bad Request)**:
```json
{
  "message": "Product ID must be a valid positive integer."
}
```
- **Error Response (404 Not Found)**:
```json
{
  "message": "Product not found."
}
```

---

## 3. Seller Product Management API (`/api/seller`)

Requires an authenticated session (`req.session.user`) with `role: 'seller'` (or admin) and `status: 'active'`.

### Security Guarantees:
1. **Role Enforcement**: Customers, guests, or blocked sellers receive `401 Unauthorized` or `403 Forbidden`.
2. **Ownership Check**: A seller can ONLY view, edit, or deactivate their own products (`seller_id === req.session.user.user_id`). Attempting to modify another seller's product returns `403 Forbidden`.

### 3.1 List Seller's Products
- **Method**: `GET`
- **Path**: `/api/seller/products`
- **Response (200 OK)**: Returns only products belonging to the logged-in seller.

### 3.2 Get Single Seller Product
- **Method**: `GET`
- **Path**: `/api/seller/products/:id`
- **Response (200 OK)**: Returns the product if owned by the logged-in seller.

### 3.3 Create New Product
- **Method**: `POST`
- **Path**: `/api/seller/products`
- **Body**:
```json
{
  "product_name": "New Mechanical Keyboard",
  "description": "RGB mechanical keyboard",
  "price": 2999.00,
  "stock_quantity": 25,
  "category_id": 1,
  "image": "images/keyboard.jpg",
  "status": "active"
}
```
- **Response (201 Created)**:
```json
{
  "message": "Product created successfully.",
  "product_id": 7,
  "seller_id": 1
}
```

### 3.4 Update Product
- **Method**: `PUT`
- **Path**: `/api/seller/products/:id`
- **Body**: Any subset of (`product_name`, `description`, `price`, `stock_quantity`, `image`, `category_id`, `status`).
- **Response (200 OK)**:
```json
{
  "message": "Product updated successfully.",
  "product_id": 1
}
```
- **Error (403 Forbidden)**: If product belongs to another seller.

### 3.5 Deactivate Product
- **Method**: `DELETE`
- **Path**: `/api/seller/products/:id`
- **Response (200 OK)**: Sets `status = 'inactive'`.

---

## 4. Running Locally

```bash
# Install dependencies
npm install

# Run database setup / migration
node database/migrate_day3.js
node database/seed_data.js

# Run test suite
node test_day3.js

# Start development server
npm run dev
# Server will be listening on http://localhost:5000
```
