# GoodsPlatz — Online Marketplace Web Application

An end-to-end multi-vendor e-commerce platform built with Node.js, Express, and MySQL. GoodsPlatz enables customers to discover products and checkout transactionally, sellers to manage inventory and fulfillment workflows, and administrators to govern system operations with role-based access control and tamper-evident audit logging.

---

## Table of Contents
- [Project Overview](#project-overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [User Roles & Test Credentials](#user-roles--test-credentials)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [API Documentation](#api-documentation)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Team Contributions](#team-contributions)
- [Screenshots](#screenshots)

---

## Project Overview

GoodsPlatz is designed to simulate a realistic online marketplace with multiple autonomous vendors, shoppers, and site administrators. Key architectural tenets include:
- **ACID-compliant transactions**: Orders and inventory stock updates are processed within MySQL transactions, preventing overselling or partial state corruption.
- **Strict Data Isolation**: Sellers have granular access exclusively to their own products and order items; competing sellers cannot inspect or alter each other's data.
- **Administrative Accountability**: High-privilege actions (promotions, seller suspensions, system setting changes) are strictly logged with client IP addresses, actor identities, and timestamps without logging sensitive credentials.

---

## Features

### 🛍️ Customer Experience
- **Customer Registration & Authentication**: Secure account creation with email format and 10-digit mobile validation, bcrypt password hashing (10 salt rounds), and session management via `express-session`.
- **Product Catalogue & Search**: Live multi-category browsing, keyword search with debouncing, sorting (price, newest, featured), and quick-view detail modal.
- **Shopping Cart & Checkout**: Slide-out cart drawer with real-time subtotal calculation, quantity stepper, stock availability verification, and transactional order checkout with delivery address capture.

### 🏪 Seller Portal
- **Inventory Management**: Create, edit, and deactivate products with image URLs, category binding, price formatting, and live stock tracking.
- **Order Management & Fulfillment**: Multi-vendor item-level status tracking (`order_items.item_status`). Sellers transition their items through confirmed → processing → shipped → delivered.
- **Sales & Performance Analytics**: Real-time KPI summaries (completed revenue, units sold, pending revenue, total orders) and top-selling product breakdowns.

### 🛡️ Admin & Super Admin Suite
- **Role-Based Access Control (RBAC)**: Fine-grained permissions (`manage_products`, `manage_categories`, `manage_sellers`, `manage_orders`).
- **Super Admin Privileges**: Create and promote administrators, assign and revoke permissions, and modify platform settings.
- **Audit Logging**: Comprehensive, non-blocking activity logger capturing operational events (`ORDER_PLACED`, `SELLER_BLOCKED`, `ADMIN_CREATED`, `SETTING_UPDATED`) with automatic credential sanitization.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Backend Runtime** | Node.js (v18+) & Express 5.x |
| **Database** | MySQL 8.x with `mysql2/promise` connection pooling |
| **Authentication** | `express-session` (cookie-backed session store) & `bcryptjs` |
| **Frontend Architecture** | HTML5, Vanilla JavaScript (ES6+), Vanilla CSS with custom properties & glassmorphic tokens |
| **Typography & Assets** | Google Fonts (`Outfit`, `Plus Jakarta Sans`) |
| **Testing** | Node.js automated HTTP integration test harness (`tests/integration_test.js`) |

---

## User Roles & Test Credentials

The database comes pre-seeded with accounts for all user roles. All test passwords are set to `Marketplace@123`.

| Role | Name | Email | Password | Permissions / Capabilities |
|---|---|---|---|---|
| **Super Admin** | Super Admin | `admin@marketplace.com` | `Marketplace@123` | Full root access, logs, admin permissions, settings |
| **Seller 1** | TechMart Seller | `seller@marketplace.com` | `Marketplace@123` | Electronics catalog, inventory & order items fulfillment |
| **Seller 2** | UrbanTrends Seller | `seller2@marketplace.com` | `Marketplace@123` | Clothing/Books catalog, inventory & sales reports |
| **Customer** | Alice Customer | `customer@marketplace.com` | `Marketplace@123` | Public catalogue browsing, shopping cart, transactional orders |

---

## Prerequisites

Ensure you have the following installed on your machine:
- **Node.js** (v18.0.0 or higher): `node -v`
- **npm** (v9.0.0 or higher): `npm -v`
- **MySQL Server** (v8.0 or higher): `mysql --version`

---

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/kaavyaMagesh/Online_Marketplace_Web_App.git
   cd Online_Marketplace_Web_App
   ```

2. **Install project dependencies**:
   ```bash
   npm install
   ```

---

## Environment Configuration

1. Copy the example environment template:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your local database credentials:
   ```env
   # Server Configuration
   PORT=5000

   # MySQL Database Configuration
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=online_marketplace

   # Session Configuration
   SESSION_SECRET=online_marketplace_secret_key
   ```
   > **Note**: `.env` is ignored by Git in `.gitignore` to prevent sensitive credentials from ever entering version control.

---

## Database Setup

1. **Create the MySQL Database & Schema**:
   Run the schema script in your MySQL client:
   ```bash
   mysql -u root -p < database/schema.sql
   ```
   Or execute directly in MySQL shell:
   ```sql
   CREATE DATABASE IF NOT EXISTS online_marketplace;
   USE online_marketplace;
   SOURCE database/schema.sql;
   ```

2. **Run Migrations & Seed Default Data**:
   ```bash
   # Run schema column & table migrations
   npm run migrate

   # Seed default categories, test users, system settings, and products
   npm run seed
   ```

---

## Running the Application

1. **Development Mode (with auto-restart)**:
   ```bash
   npm run dev
   ```

2. **Production Mode**:
   ```bash
   npm start
   ```

3. **Access the application in your browser**:
   - **Storefront**: [http://localhost:5000/](http://localhost:5000/)
   - **Seller Inventory Central**: [http://localhost:5000/seller/dashboard.html](http://localhost:5000/seller/dashboard.html)
   - **Seller Orders & Sales Reports**: [http://localhost:5000/seller/orders.html](http://localhost:5000/seller/orders.html)
   - **Customer Sign In**: [http://localhost:5000/login.html](http://localhost:5000/login.html)
   - **System Health Status**: [http://localhost:5000/api/health](http://localhost:5000/api/health)

---

## API Documentation

### 1. Authentication (`/api/auth`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register new customer account | No |
| `POST` | `/api/auth/login` | Authenticate user & create session | No |
| `GET` | `/api/auth/me` | Inspect current session user | Yes |
| `POST` | `/api/auth/logout` | Terminate session & clear cookies | Yes |

### 2. Product Catalogue (`/api/products`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/products` | Browse active products (filters: `search`, `category`) | No |
| `GET` | `/api/products/:id` | View product details and category info | No |
| `GET` | `/api/categories` | List active product categories | No |

### 3. Shopping Cart (`/api/cart`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/cart` | View cart items, line calculations, and totals | Yes (or guest) |
| `POST` | `/api/cart` | Add product to cart with server-side stock checks | Yes (or guest) |
| `PUT` | `/api/cart/:itemId` | Update cart item quantity | Yes (or guest) |
| `DELETE` | `/api/cart/:itemId` | Remove individual line item from cart | Yes (or guest) |
| `DELETE` | `/api/cart` | Clear entire shopping cart | Yes (or guest) |

### 4. Orders & Checkout (`/api/orders`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/orders` | **Transactional checkout**: validates stock, deducts inventory, records order & line items, clears cart | Yes |
| `GET` | `/api/orders` | List customer order history | Yes |
| `GET` | `/api/orders/:id` | Retrieve specific order details | Yes |

### 5. Seller Management (`/api/seller`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/seller/products` | List products owned by authenticated seller | Seller / Admin |
| `POST` | `/api/seller/products` | Create new product in seller inventory | Seller / Admin |
| `PUT` | `/api/seller/products/:id` | Update product details (ownership verified) | Seller / Admin |
| `DELETE` | `/api/seller/products/:id` | Deactivate product (soft delete) | Seller / Admin |
| `GET` | `/api/seller/orders` | List orders containing seller's items | Seller / Admin |
| `PATCH` | `/api/seller/orders/:itemId/status`| Transition order item status (`confirmed` → `processing` → `shipped` → `delivered`) | Seller / Admin |
| `GET` | `/api/seller/reports` | View seller sales metrics, revenue, and top products | Seller / Admin |

### 6. Administration & Super Admin (`/api/admin` & `/api/superadmin`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/admin/sellers` | List registered sellers and status | Admin (`manage_sellers`) |
| `PATCH` | `/api/admin/sellers/:id/status` | Block or unblock seller account | Admin (`manage_sellers`) |
| `POST` | `/api/admin/categories` | Add product category | Admin (`manage_categories`) |
| `PATCH` | `/api/admin/products/:id/status` | Toggle product active status | Admin (`manage_products`) |
| `GET` | `/api/superadmin/logs` | Query system audit logs with actor info | Super Admin |
| `GET` | `/api/superadmin/admins` | List administrators and assigned permissions | Super Admin |
| `POST` | `/api/superadmin/admins` | Create or promote an administrator | Super Admin |
| `GET` | `/api/superadmin/permissions`| View all system permissions | Super Admin |
| `PUT` | `/api/superadmin/permissions/:id`| Assign or revoke admin permissions | Super Admin |
| `GET` | `/api/superadmin/settings` | View global system configuration | Super Admin |
| `PUT` | `/api/superadmin/settings/:key`| Update system configuration setting | Super Admin |

---

## Testing & Quality Assurance

The application features comprehensive automated integration tests covering customer, seller, cart/order transactions, and administration security.

### Running Automated Integration Tests
```bash
npm test
```
To run all test suites across Days 4, 6, 7, 8, and 9:
```bash
npm run test:all
```

### Verified Test Cases
Refer to [tests/api-checklist.md](tests/api-checklist.md) for the complete checklist. Summary of verified behaviors:
- **Transactional Consistency**: Rollback verification ensures that if stock is insufficient, zero inventory is lost and no partial order records remain.
- **Cross-Seller Security**: Verified that Seller B receives `403 Forbidden` if attempting to modify Seller A's product or change the status of another vendor's order item.
- **Administrative Privileges**: Ordinary admins cannot view Super Admin logs or alter settings without appropriate permissions.
- **Data Sanitization**: Plaintext passwords, tokens, and secrets are strictly redacted from `system_logs`.

---

## Team Contributions

| Day | Module / Milestone | Primary Focus |
|---|---|---|
| **Day 1–3** | Database & Server Foundation | MySQL schema setup, connection pooling, base REST setup |
| **Day 4–5** | Catalog & Seller Products | Product catalog filters, search, seller inventory management UI |
| **Day 6** | Transactional Checkout | `POST /api/orders`, stock deduction, MySQL transaction rollback |
| **Day 7** | Seller Orders & Sales Reports | Item-level fulfillment status tracking, sales reports analytics |
| **Day 8** | Super Admin & Audit Logging | Permissions enforcement, audit trail logging with sensitive redaction |
| **Day 9** | Full System Integration | Multi-role workflow unification, error handling, checklist verification |
| **Day 10** | Final Polish & Documentation | Deployment readiness, user guide, and demo walkthrough |

---

## Screenshots

### 1. GoodsPlatz Storefront & Shopping Cart
![GoodsPlatz Storefront](public/images/screenshots/storefront.png)

### 2. Seller Inventory Management Dashboard
![Seller Inventory Dashboard](public/images/screenshots/seller_inventory.png)

### 3. Seller Order Fulfillment & Sales Reports
![Seller Orders & Sales Reports](public/images/screenshots/seller_orders.png)

---

## License

This project is licensed under the ISC License.
