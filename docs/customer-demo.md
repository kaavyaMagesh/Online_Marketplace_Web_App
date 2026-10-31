# GoodsPlatz — Customer Demonstration Guide

---

## A. Demo Prerequisites

### 1. Starting the Application

1. Open a terminal in the project root directory.
2. Install dependencies (first time only):
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
   Or use the production start command:
   ```bash
   npm start
   ```
4. Confirm the server is running — you should see:
   ```
   🚀 Server running on http://localhost:5000
   ```

### 2. Required Database Setup

Before starting the server, set up the MySQL database:

1. Open **MySQL Workbench** and connect to your local MySQL Server.
2. Open and run `database/schema.sql` — this creates the `online_marketplace` database and all 12 tables.
3. Open and run `database/seed.sql` — this inserts sample product categories.
4. Verify the setup:
   ```sql
   USE online_marketplace;
   SHOW TABLES;
   SELECT * FROM categories;
   ```

> **Note:** The `seed.sql` file inserts categories only. Products must be added by a seller account
> (via the seller panel or directly via MySQL Workbench) before the product listing page will show items.

### 3. Environment Configuration

Copy `.env.example` to `.env` and fill in your local MySQL credentials:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=online_marketplace
PORT=5000
SESSION_SECRET=your_secret_key
```

> **Security Note:** Never commit `.env` to version control. It is listed in `.gitignore`.

### 4. Accessing the Application

Open your browser and navigate to:

```
http://localhost:5000
```

### 5. Required Test Data

For a complete demonstration you need:

- **At least one product** in the database with `status = 'active'` and `stock_quantity > 0`.
  These are created by seller accounts through the seller panel (Teammate B's feature).
  If no products exist, add one directly in MySQL Workbench using:

  ```sql
  USE online_marketplace;
  -- First find a seller user_id (or create one)
  INSERT INTO products (seller_id, category_id, product_name, description, price, stock_quantity, status)
  VALUES (1, 1, 'Demo Laptop', 'A sample product for demonstration.', 49999.00, 10, 'active');
  ```

- **A customer account** — this can be registered live during the demonstration (Step 5).

### 6. Customer Account

You may register a new account during the demo, or pre-create one:

- Registration requires: Full Name, Email, 10-digit Mobile Number, Password (min 8 characters).
- All accounts created via the registration form are automatically assigned the `customer` role.
- No prior setup is needed — registration is part of the demo sequence.

---

## B. Customer Demonstration Sequence

---

### Step 1 — Opening the GoodsPlatz Homepage

| | |
|---|---|
| **Navigate to** | `http://localhost:5000` or `http://localhost:5000/index.html` |
| **Action** | Let the page load fully. |
| **Expected Result** | The GoodsPlatz homepage appears with the brand name in the navigation bar, a hero section reading "Everything you need, in one marketplace.", and an **Explore Products** call-to-action button. The footer shows "© 2026 GoodsPlatz". The navigation shows **Home**, **Products**, **🛒 Cart**, **Login**, and **Sign Up**. |

---

### Step 2 — Browsing Available Products

| | |
|---|---|
| **Navigate to** | Click **Explore Products** on the homepage, or click **Products** in the navigation bar. |
| **Action** | Wait for the product grid to load. |
| **Expected Result** | The Products page (`/products.html`) loads and fetches active, in-stock products from `/api/products`. A product grid is displayed. If products exist in the database, product cards appear showing product name, category, price, and stock. If no products exist, the grid is empty (no error is thrown — this is expected for a fresh database). The search bar and category filter dropdown are visible and functional. |

---

### Step 3 — Searching and Filtering Products

| | |
|---|---|
| **Navigate to** | Products page (`/products.html`) |
| **Action — Search** | Type a product name or keyword into the search bar (e.g., `Laptop`) and click the 🔍 search button or press Enter. |
| **Expected Result** | The product grid refreshes and displays only products matching the search term in their name or description. A result count updates (e.g., "2 products found"). |
| **Action — Filter** | Select a category from the **All Categories** dropdown. |
| **Expected Result** | The grid refreshes to show only products belonging to the selected category. The result count updates accordingly. |
| **Action — Clear** | Clear the search box and select "All Categories" again. |
| **Expected Result** | All active, in-stock products are shown again. |

---

### Step 4 — Viewing Product Details

| | |
|---|---|
| **Navigate to** | Click **View Details** on any product card on the Products page. |
| **Action** | Wait for the product details page to load. |
| **Expected Result** | The Product Details page (`/product-details.html?id=<ID>`) loads and displays: product name, full description, price, available stock, category, and product image (or a category emoji placeholder if no image is set). An **Add to Cart** button or a "Login to add to cart" prompt is displayed (depends on authentication state). A **← Back to Products** link is visible at the top. |

---

### Step 5 — Registering a Customer Account

| | |
|---|---|
| **Navigate to** | Click **Sign Up** in the navigation bar (redirects to `/register.html`). |
| **Action** | Fill in the registration form: |
| | • **Full Name**: e.g., `Demo Customer` |
| | • **Email**: e.g., `demo@goodsplatz.com` |
| | • **Mobile Number**: e.g., `9876543210` (exactly 10 digits) |
| | • **Password**: e.g., `SecurePass1` (minimum 8 characters) |
| | • **Confirm Password**: re-enter the same password |
| | Click **Register**. |
| **Expected Result** | The form submits to `POST /api/auth/register`. On success, a green confirmation message appears: "Account created successfully! You can now log in." The form resets. No automatic redirect — the customer must navigate to login. |
| **Validation demo** | Try submitting with a mismatched confirm password or a mobile number that is not 10 digits — browser-side validation immediately shows a descriptive error without a server round-trip. |

---

### Step 6 — Logging In

| | |
|---|---|
| **Navigate to** | Click **Login** in the navigation bar (redirects to `/login.html`), or click the **Log in** link at the bottom of the registration page. |
| **Action** | Enter the email and password used in Step 5. Click **Login**. |
| **Expected Result** | The form submits to `POST /api/auth/login`. On success, the server sets a session cookie and redirects the browser to the homepage (`/index.html`). The navigation bar updates to show: **Home**, **Products**, **🛒 Cart (0)**, a **👤 Hi, Demo Customer** profile link, and a **Logout** button. |
| **Failed login demo** | Try entering a wrong password — a red error message appears: "Invalid email or password." |

---

### Step 7 — Adding Products to the Cart

| | |
|---|---|
| **Prerequisite** | Logged in as a customer (Step 6 complete). At least one active product with stock > 0 exists. |
| **Navigate to** | Products page or Product Details page. |
| **Action** | Click **Add to Cart** on a product card or on the product details page. |
| **Expected Result** | A success message appears confirming the item was added. The **🛒 Cart** badge in the navigation bar updates to reflect the new item count (e.g., shows `1`). The server-side endpoint `POST /api/cart/items` validates stock before adding. |
| **Out-of-stock demo** | If a product's stock is 0, the button shows "Out of Stock" and is disabled — it cannot be added to cart. |
| **Repeat** | Add 2–3 different products to the cart for the next steps. |

---

### Step 8 — Updating Quantities and Removing Items

| | |
|---|---|
| **Navigate to** | Click **🛒 Cart** in the navigation bar (redirects to `/cart.html`). |
| **Action — View Cart** | Let the cart page load. |
| **Expected Result** | Cart items are displayed with product name, image (or emoji placeholder), unit price, quantity controls (+/−), item subtotal, and a Remove button. Cart subtotal and total are calculated server-side from live database prices. |
| **Action — Increase quantity** | Click the **+** button on any cart item. |
| **Expected Result** | The quantity increases by 1. The item subtotal and cart total update immediately. If the maximum stock limit is reached, the + button is disabled and a message indicates the stock ceiling. |
| **Action — Decrease quantity** | Click the **−** button on any cart item. |
| **Expected Result** | The quantity decreases by 1. If the quantity would fall to 0, an error message indicates to use Remove instead. |
| **Action — Remove item** | Click the **Remove** (🗑️ / Remove) button on any cart item. |
| **Expected Result** | The item is removed from the cart. If the cart becomes empty, an empty-cart message is shown with an **Explore Products** link. The cart badge in the navigation bar updates to `0`. |

---

### Step 9 — Proceeding to Checkout

| | |
|---|---|
| **Prerequisite** | Logged in, with at least one item in the cart. |
| **Navigate to** | On the Cart page, click **Proceed to Checkout**. |
| **Expected Result** | Redirects to `/checkout.html`. The checkout page loads with: a **Delivery & Shipping Address** form (left panel) and an **Order Summary** panel (right panel). The order summary shows all cart items, quantities, prices, a FREE delivery line, and the grand total. The **Recipient Full Name** and **Phone** fields are pre-filled from the customer's profile if available. The payment method is shown as **💵 Cash on Delivery (Pay upon delivery)** — no card or UPI input is required. |

---

### Step 10 — Placing an Order

| | |
|---|---|
| **Navigate to** | Checkout page (`/checkout.html`) |
| **Action** | Fill in the delivery address form: |
| | • **Recipient Full Name**: e.g., `Demo Customer` |
| | • **Mobile Phone**: e.g., `9876543210` |
| | • **Street Address**: e.g., `Flat 302, Green Valley Apartments` |
| | • **City**: e.g., `Bengaluru` |
| | • **State**: e.g., `Karnataka` |
| | • **Postal Code / PIN**: e.g., `560001` |
| | • **Country**: India (pre-filled, not editable) |
| | Click **Place Order (₹X,XXX.XX)**. |
| **Expected Result** | The order is submitted via `POST /api/orders`. The server runs a transaction that verifies stock, records the address, creates the order, creates order items, deducts product inventory, and clears the cart — all atomically. On success, a **✅ Order Placed Successfully!** confirmation screen appears showing the order number, total amount, payment status (Pending — Cash on Delivery), recipient name, and delivery address. Two action buttons appear: **View My Orders** and **Continue Shopping**. The cart badge resets to `0`. |
| **Validation demo** | Try submitting with a mobile number that is not exactly 10 digits — an inline error message appears and the form does not submit. |

---

### Step 11 — Viewing Order History and Order Details

| | |
|---|---|
| **Navigate to** | Click **View My Orders** on the confirmation screen, or click **Orders** in the navigation bar (visible when logged in). Redirects to `/orders.html`. |
| **Action** | Let the orders list load. |
| **Expected Result** | Order cards are displayed in reverse chronological order (newest first). Each card shows: order reference number, date placed, total amount, number of items, payment method ("Cash on Delivery — Pending"), and a colour-coded status badge (e.g., orange **Pending**). |
| **Action — View details** | Click **▼ View Order Details** on any order card. |
| **Expected Result** | The card expands to show: the delivery address, and an itemised product breakdown (product name, quantity, unit price, line subtotal). Product names are clickable links back to their product detail pages. The details drawer fetches from `GET /api/orders/:id`. Clicking the toggle again collapses the drawer. |

---

### Step 12 — Cancelling an Eligible Order

| | |
|---|---|
| **Prerequisite** | An order must exist with status **Pending** or **Confirmed**. The order placed in Step 10 starts with status **Pending** and is immediately eligible for cancellation. |
| **Navigate to** | Orders page (`/orders.html`) |
| **Action** | Find the order placed in Step 10. A **Cancel Order** button appears on the card (only for Pending or Confirmed orders). Click **Cancel Order**. |
| **Expected Result** | A browser confirmation dialog appears: "Are you sure you want to cancel Order #X? This will restore all items to the store inventory and mark your order as Cancelled." Click **OK**. |
| **After confirming** | The order status badge updates to **Cancelled** (red). The Cancel Order button is removed. A success message appears on the card: "Order #X has been cancelled successfully." On the backend, inventory is restored via a transaction (`PATCH /api/orders/:id/cancel`). |
| **Non-eligible orders** | Orders with status **Shipped** or **Delivered** do not show a Cancel Order button — cancellation is not available at those stages. |

---

### Step 13 — Opening and Updating the Customer Profile

| | |
|---|---|
| **Navigate to** | Click the **👤 Hi, Demo Customer** link in the navigation bar (visible when logged in). Redirects to `/profile.html`. |
| **Action — View profile** | Let the profile page load. |
| **Expected Result** | The profile page shows two columns: a left side with an account overview card (name, email, role, status, member since date) and a saved delivery address card (shows the address from the last completed checkout). The right side shows a **Personal Information** form and a **Change Password** form. |
| **Action — Update name/phone** | In the **Personal Information** form, change the Full Name (e.g., append " Jr.") or update the Mobile Number. Click **Save Changes**. |
| **Expected Result** | The form submits to `PUT /api/auth/profile`. On success, a green alert appears: "Profile updated successfully." The account overview name heading and the navigation bar greeting ("Hi, Demo Customer Jr.") both update live — without a page reload. |
| **Action — Change password** | In the **Change Password** form, enter the current password, a new password (min 8 characters), and confirm the new password. Click **Update Password**. |
| **Expected Result** | The form submits to `PUT /api/auth/password`. The server verifies the current password against the bcrypt hash. On success, a green alert appears: "Password changed successfully." The form resets. |
| **Validation demo** | Try submitting the password form with a new password shorter than 8 characters, or with mismatched confirm password — inline errors appear without a server call. |
| **No-address state** | If the customer has never completed a checkout, the saved address card shows "No saved address yet" with a **Start Shopping** link — this is intentional. |

---

### Step 14 — Logging Out

| | |
|---|---|
| **Navigate to** | Any page while logged in. |
| **Action** | Click the **Logout** button in the navigation bar (top-right). |
| **Expected Result** | A `POST /api/auth/logout` request is sent. The server destroys the session. The browser redirects to the homepage (`/index.html`). The navigation bar reverts to the signed-out state: **Home**, **Products**, **🛒 Cart**, **Login**, **Sign Up**. |
| **Session verification** | Try navigating to `/cart.html` or `/orders.html` after logout — both pages display a "Please log in" prompt with a **Log In to GoodsPlatz** button. The API endpoints return `401 Unauthorized` for unauthenticated requests, as expected. |

---

## C. Important Demonstration Notes

### Order Cancellation Prerequisites

- Only orders with status **`pending`** or **`confirmed`** can be cancelled.
- The **Cancel Order** button appears only on eligible order cards. It is automatically hidden for `shipped`, `delivered`, and already-`cancelled` orders.
- The cancellation endpoint (`PATCH /api/orders/:id/cancel`) uses a MySQL transaction with row-level locking (`SELECT ... FOR UPDATE`) to safely restore product inventory and prevent race conditions.
- Since newly placed orders start as `pending`, the order placed during the demo is immediately eligible to demonstrate cancellation.

### Payment Method

- GoodsPlatz currently supports **Cash on Delivery (COD)** only.
- Payment is collected in person upon delivery — no card, UPI, or wallet input is required.
- The payment method is enforced server-side (`paymentMethod = "Cash on Delivery"`). Even if a client sends a different value, the server ignores it.
- Order `payment_status` is `pending` when the order is placed and remains so until delivery is confirmed by a seller or admin.

### Known Limitations

| Area | Limitation |
|---|---|
| **Products** | Products are created by seller accounts only. If no seller has added products, the product listing will appear empty on a fresh database. Add test products via MySQL Workbench or a seller account. |
| **Images** | Product images depend on an image URL stored by the seller. If no image URL is set, a category emoji placeholder is displayed — this is by design. |
| **Order status progression** | Status changes beyond `pending` (e.g., `confirmed`, `shipped`, `delivered`) are managed by seller or admin panels. Customers can only read status and cancel eligible orders. |
| **Multiple addresses** | The profile page shows only the most recent delivery address (from the last checkout). Address management beyond this is not part of the customer feature scope. |
| **Reviews** | The `reviews` table exists in the schema, but a product review submission UI is not part of the Day 10 customer feature set. |
| **Live testing** | All testing for this demonstration was performed via static code review and endpoint analysis. Live browser testing requires a running MySQL instance with test data. |

### Authentication and Session Handling

- Sessions are cookie-based (`express-session`) with `httpOnly: true` and `sameSite: lax`.
- Session duration is **24 hours** (`maxAge: 1000 * 60 * 60 * 24`).
- All protected endpoints (`/api/cart`, `/api/orders`, `/api/auth/profile`, etc.) return `401 Unauthorized` for unauthenticated requests. The frontend handles this gracefully by showing a sign-in prompt — no errors are thrown to the console.
