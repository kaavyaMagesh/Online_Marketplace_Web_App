# GoodsPlatz — Online Marketplace

A full-stack, multi-role online marketplace built with **Node.js**, **Express**, **MySQL**, and **Vanilla JavaScript**.

GoodsPlatz supports three user roles — **Customer**, **Seller**, and **Admin/Super Admin** — each with dedicated workflows and a shared MySQL database.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Team Structure](#team-structure)
3. [Technology Stack](#technology-stack)
4. [Getting Started](#getting-started)
5. [Customer Guide](#customer-guide)
6. [API Reference Summary](#api-reference-summary)
7. [Database](#database)
8. [Project Structure](#project-structure)

---

## Project Overview

| Feature Area | Branch |
|---|---|
| Customer + Authentication | `feature/customer-public-pages` |
| Seller Inventory + Products | `feature/backend-seller` |
| Admin + Super Admin | `feature/admin-superadmin` |
| Shared Database Schema | `main` |

---

## Team Structure

| Teammate | Responsibility |
|---|---|
| Teammate A | Customer-facing pages, authentication, cart, checkout, orders, profile |
| Teammate B | Seller dashboard, product management, inventory stock controls |
| Teammate C | Admin panel, super admin controls, system settings |

---

## Technology Stack

- **Backend**: Node.js, Express 5
- **Database**: MySQL 8 (via `mysql2` pool)
- **Session**: `express-session` (cookie-based, `httpOnly`, 24-hour duration)
- **Password Hashing**: `bcryptjs`
- **Frontend**: Vanilla HTML, CSS, JavaScript (Fetch API, DOM manipulation)
- **Dev Server**: `nodemon`

---

## Getting Started

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [MySQL Server 8](https://dev.mysql.com/downloads/mysql/)
- [MySQL Workbench](https://dev.mysql.com/downloads/workbench/) (optional but recommended)
- Git

### 2. Clone the Repository

```bash
git clone <repository-url>
cd Online_Marketplace_Web_App
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your local values:

```bash
cp .env.example .env
```

Edit `.env`:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=online_marketplace
PORT=5000
SESSION_SECRET=choose_a_long_random_secret
```

> **Important:** Never commit your `.env` file. It is excluded via `.gitignore`.

### 5. Set Up the Database

Open MySQL Workbench (or the MySQL CLI) and run the following in order:

```sql
-- Step 1: Create tables
SOURCE database/schema.sql;

-- Step 2: Insert sample categories
SOURCE database/seed.sql;
```

See [`database/README.md`](database/README.md) for full setup instructions.

### 6. Start the Server

**Development (with auto-restart):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

The server runs on `http://localhost:5000` by default.

**Verify the server and database are connected:**
```
GET http://localhost:5000/api/health
```

---

## Customer Guide

This section covers all customer-facing features. For a step-by-step **demonstration script** suitable for a professor or evaluator, see:

📄 **[docs/customer-demo.md](docs/customer-demo.md)**

---

### Accessing the Customer Website

Open your browser and navigate to:

```
http://localhost:5000
```

All customer-facing pages are served as static HTML from the `public/` directory.

---

### Registration and Login

#### Register a New Account

1. Click **Sign Up** in the navigation bar or go to `http://localhost:5000/register.html`.
2. Fill in:
   - **Full Name** — your display name
   - **Email** — must be a valid email address (used as login credential)
   - **Mobile Number** — exactly 10 digits, no spaces or dashes
   - **Password** — minimum 8 characters
   - **Confirm Password** — must match password
3. Click **Register**.
4. On success, a green confirmation message appears. Navigate to Login to sign in.

> All accounts registered through this form are automatically assigned the **customer** role.

#### Log In

1. Click **Login** in the navigation bar or go to `http://localhost:5000/login.html`.
2. Enter your registered **Email** and **Password**.
3. Click **Login**.
4. On success, you are redirected to the homepage. The navigation bar shows your name and a Logout button.

#### Log Out

Click the **Logout** button in the top-right navigation bar. Your session is destroyed and you are redirected to the homepage.

---

### Product Browsing and Searching

#### Browse Products

- Click **Products** in the navigation bar or go to `http://localhost:5000/products.html`.
- All active, in-stock products are listed in a card grid sorted by newest first.
- Each card shows the product name, category, price, and stock status.

#### Search Products

- Type a keyword into the **Search products…** input and click the 🔍 button.
- Search matches product names and descriptions (case-insensitive, partial match).

#### Filter by Category

- Select a category from the **All Categories** dropdown.
- Search and category filter can be combined in a single request.

#### View Product Details

- Click **View Details** on any product card.
- The Product Details page shows the full description, current price, available stock, category, and an Add to Cart button (requires login).

---

### Cart and Checkout

#### Adding to Cart

1. On any product card or product details page, click **Add to Cart** (you must be logged in).
2. The cart badge in the navigation bar updates with the current item count.
3. You can add a quantity greater than 1 from the product details page.

> The server validates stock in real time on every add. You cannot add more items than the available stock.

#### Managing Cart Items

Go to **🛒 Cart** in the navigation bar (`/cart.html`):

| Action | How |
|---|---|
| Increase quantity | Click the **+** button next to any item |
| Decrease quantity | Click the **−** button (cannot go below 1 via this button) |
| Remove an item | Click the **Remove** button |
| Clear entire cart | Click **Clear Cart** |

Cart totals are always recalculated from live database prices — never from stale cached values.

#### Checking Out

1. With items in your cart, click **Proceed to Checkout** on the cart page.
2. Fill in your **Delivery & Shipping Address**:
   - Recipient Full Name
   - Mobile Phone (10 digits)
   - Street Address
   - City
   - State
   - Postal Code / PIN
3. Review the **Order Summary** panel (right side) — it shows all items, quantities, prices, and the grand total.
4. The payment method is **Cash on Delivery** — no card details are required.
5. Click **Place Order (₹X,XXX.XX)** to place your order.
6. On success, an order confirmation screen shows your order number and delivery details.

---

### Order History and Cancellation

#### View Order History

- Click **Orders** in the navigation bar (visible when logged in), or go to `/orders.html`.
- All your past and current orders are listed, newest first.
- Each order card shows: order number, date, item count, total amount, payment method, and a colour-coded status badge.

#### View Order Details

- Click **▼ View Order Details** on any order card to expand it.
- The expanded view shows your delivery address and an itemised product breakdown.
- Click **▲ Hide Details** to collapse.

#### Cancel an Order

- A **Cancel Order** button appears on orders with status **Pending** or **Confirmed**.
- Click **Cancel Order** → confirm in the dialog → the order is cancelled.
- Cancellation restores all product quantities back to inventory.
- Orders that are **Shipped** or **Delivered** cannot be cancelled.

---

### Customer Profile Management

Go to the **👤 Hi, [Your Name]** link in the navigation bar, or visit `/profile.html`.

#### Update Personal Details

- In the **Personal Information** section, edit your **Full Name** or **Mobile Number**.
- Click **Save Changes**.
- The profile overview and the navigation bar greeting update immediately (no page reload needed).
- **Email address cannot be changed** — it is your unique login credential.

#### Change Password

- In the **Change Password** section, enter your current password and choose a new password (minimum 8 characters).
- Click **Update Password**.
- The server verifies your current password before applying the change.

#### Saved Delivery Address

- Your most recent checkout delivery address is displayed in the left sidebar.
- If you have never placed an order, this section shows "No saved address yet".

---

## API Reference Summary

All API endpoints are prefixed with `/api/`.

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/api/health` | Server and database health check | No |
| `POST` | `/api/auth/register` | Register a new customer account | No |
| `POST` | `/api/auth/login` | Log in and create a session | No |
| `POST` | `/api/auth/logout` | Destroy session and log out | No |
| `GET` | `/api/auth/me` | Get current session user | No (returns null if not logged in) |
| `GET` | `/api/auth/profile` | Get full customer profile + address | Yes |
| `PUT` | `/api/auth/profile` | Update name and phone | Yes |
| `PUT` | `/api/auth/password` | Change password | Yes |
| `GET` | `/api/categories` | List active product categories | No |
| `GET` | `/api/products` | List active products (supports `?search=` and `?category=`) | No |
| `GET` | `/api/products/:id` | Get single active product | No |
| `GET` | `/api/cart` | Get cart with totals | Yes |
| `POST` | `/api/cart/items` | Add item or increase quantity | Yes |
| `PATCH` | `/api/cart/items/:productId` | Update item quantity | Yes |
| `DELETE` | `/api/cart/items/:productId` | Remove single item | Yes |
| `DELETE` | `/api/cart` | Clear entire cart | Yes |
| `POST` | `/api/orders` | Place order from cart (checkout) | Yes |
| `GET` | `/api/orders` | Get order history | Yes |
| `GET` | `/api/orders/:id` | Get single order details | Yes |
| `PATCH` | `/api/orders/:id/cancel` | Cancel an eligible order | Yes |

---

## Database

The database is named `online_marketplace`. See [`database/README.md`](database/README.md) for full setup instructions.

**Tables:**

| Table | Purpose |
|---|---|
| `users` | Customer, seller, admin accounts |
| `addresses` | Delivery addresses per user |
| `categories` | Product categories |
| `products` | Products with price, stock, seller |
| `cart` | One cart per customer |
| `cart_items` | Products in each cart |
| `orders` | Customer orders |
| `order_items` | Products per order |
| `reviews` | Product ratings and comments |
| `admin_permissions` | Admin role permissions |
| `system_logs` | Audit log of system actions |
| `system_settings` | Key-value application settings |

---

## Project Structure

```
Online_Marketplace_Web_App/
├── database/
│   ├── schema.sql          # Database and table definitions
│   ├── seed.sql            # Sample category data
│   └── README.md           # Database setup instructions
├── docs/
│   └── customer-demo.md    # Customer demonstration script (Teammate A)
├── middleware/
│   └── auth.js             # isAuthenticated + requireRole middleware
├── public/                 # Static customer-facing frontend
│   ├── index.html          # Homepage
│   ├── products.html       # Product listing
│   ├── product-details.html# Single product view
│   ├── login.html          # Login form
│   ├── register.html       # Registration form
│   ├── cart.html           # Shopping cart
│   ├── checkout.html       # Checkout and order placement
│   ├── orders.html         # Order history
│   ├── profile.html        # Customer profile management
│   ├── css/
│   │   ├── style.css       # Main stylesheet
│   │   └── auth.css        # Auth page styles
│   └── js/
│       ├── common.js       # Shared nav, footer, auth state
│       ├── auth.js         # Login and registration logic
│       ├── products.js     # Product listing and search
│       ├── product-details.js  # Single product view
│       ├── cart.js         # Cart management
│       ├── checkout.js     # Checkout flow
│       ├── orders.js       # Order history and cancellation
│       └── profile.js      # Profile management
├── routes/
│   ├── authRoutes.js       # Auth endpoints (register/login/logout/profile/password)
│   ├── productRoutes.js    # Alias to server/routes/products.js
│   └── sellerRoutes.js     # Seller route placeholder
├── server/
│   ├── db.js               # MySQL connection pool
│   ├── server.js           # Express app entry point
│   └── routes/
│       ├── cartRoutes.js   # Cart API
│       ├── orderRoutes.js  # Order and checkout API
│       └── products.js     # Product catalogue API
├── .env.example            # Environment variable template
├── .gitignore              # Excludes .env, node_modules
└── package.json            # Dependencies and scripts
```
