# API Integration Test Checklist

This checklist documents the complete integration test coverage for the GoodsPlatz Online Marketplace application, covering all teammates' modules across Customer, Seller, and Admin / Super Admin roles.

---

## 1. Authentication & Session Security

- [x] **Registration succeeds with valid details**
  - **Method / Endpoint**: `POST /api/auth/register`
  - **Payload**: `{ name, email, phone, password }`
  - **Result**: `201 Created` — User record created with hashed bcrypt password, role defaulted to `customer`, sensitive data omitted from response.
- [x] **Duplicate email is rejected**
  - **Method / Endpoint**: `POST /api/auth/register`
  - **Result**: `409 Conflict` with message `An account with this email already exists.`
- [x] **Invalid login is rejected**
  - **Method / Endpoint**: `POST /api/auth/login`
  - **Result**: `401 Unauthorized` for incorrect password or non-existent email without disclosing user existence.
- [x] **Active session verification works**
  - **Method / Endpoint**: `GET /api/auth/me`
  - **Result**: `200 OK` returns user identity, role, and active status from express session cookie.
- [x] **Logout works**
  - **Method / Endpoint**: `POST /api/auth/logout`
  - **Result**: `200 OK` destroys session and clears `connect.sid` cookie.

---

## 2. Products & Catalogue Management

- [x] **Active products are listed**
  - **Method / Endpoint**: `GET /api/products`
  - **Result**: `200 OK` lists active products with stock > 0 in active categories.
- [x] **Product search works**
  - **Method / Endpoint**: `GET /api/products?search=Headphones`
  - **Result**: `200 OK` returns case-insensitive query matches.
- [x] **Product category filtering works**
  - **Method / Endpoint**: `GET /api/products?category=1`
  - **Result**: `200 OK` returns items filtered by `category_id`.
- [x] **Single product lookup succeeds**
  - **Method / Endpoint**: `GET /api/products/:id`
  - **Result**: `200 OK` returns product details and category name; returns `404` for non-existent IDs.
- [x] **Seller can add a product**
  - **Method / Endpoint**: `POST /api/seller/products`
  - **Result**: `201 Created` assigns product to logged-in seller with price and stock validation.
- [x] **Seller can edit their own product**
  - **Method / Endpoint**: `PUT /api/seller/products/:id`
  - **Result**: `200 OK` updates product fields.
- [x] **Seller cannot edit another seller's product**
  - **Method / Endpoint**: `PUT /api/seller/products/:id`
  - **Result**: `403 Forbidden` strictly blocks cross-seller modifications.
- [x] **Seller can deactivate product**
  - **Method / Endpoint**: `DELETE /api/seller/products/:id`
  - **Result**: `200 OK` sets product status to `inactive`.

---

## 3. Cart and Orders (Transactional Checkout)

- [x] **Product can be added to cart**
  - **Method / Endpoint**: `POST /api/cart`
  - **Result**: `201 Created` inserts or increments quantity in customer's cart.
- [x] **Invalid/excessive quantities are rejected**
  - **Method / Endpoint**: `POST /api/cart`
  - **Result**: `400 Bad Request` if requested quantity exceeds available database stock.
- [x] **Checkout creates an order**
  - **Method / Endpoint**: `POST /api/orders`
  - **Result**: `201 Created` initiates MySQL transaction, records order and individual `order_items`.
- [x] **Stock is deducted correctly**
  - **Method / Endpoint**: `POST /api/orders`
  - **Result**: Product inventory stock decreased by exact purchased quantities.
- [x] **Failed checkout does not leave partial data (Rollback consistency)**
  - **Method / Endpoint**: `POST /api/orders`
  - **Result**: If any product is inactive or lacks stock, MySQL transaction is rolled back; zero partial orders or stock changes occur.
- [x] **Cart is cleared after successful checkout**
  - **Method / Endpoint**: `GET /api/cart`
  - **Result**: `200 OK` with 0 cart items remaining.

---

## 4. Seller Order Management & Reports

- [x] **Seller can view order items containing their products**
  - **Method / Endpoint**: `GET /api/seller/orders`
  - **Result**: `200 OK` returns order items for the authenticated seller.
- [x] **Seller privacy isolation enforced**
  - **Result**: Sellers cannot view products/items belonging to competing sellers in the same customer order.
- [x] **Seller can update order item status**
  - **Method / Endpoint**: `PATCH /api/seller/orders/:itemId/status`
  - **Result**: Valid status transitions (`confirmed` → `processing` → `shipped` → `delivered`) accepted.
- [x] **Invalid status transitions rejected**
  - **Result**: `400 Bad Request` for invalid transition sequences (e.g. from `delivered` or skipping stages).
- [x] **Seller B cannot change Seller A's item status**
  - **Result**: `403 Forbidden` enforces item-level seller ownership.
- [x] **Seller sales reports calculated accurately**
  - **Method / Endpoint**: `GET /api/seller/reports`
  - **Result**: `200 OK` aggregates completed sales revenue, total units sold, gross sales, and top selling products.

---

## 5. Admin & Super Admin Permissions

- [x] **Admin can perform authorized actions**
  - **Method / Endpoint**: `GET /api/admin/sellers`, `PATCH /api/admin/sellers/:id/status`
  - **Result**: `200 OK` when admin holds `manage_sellers` permission.
- [x] **Unauthorized actions are rejected**
  - **Result**: `403 Forbidden` when admin lacks required permission (e.g. attempting seller blocking without permission).
- [x] **Super Admin permissions are enforced**
  - **Method / Endpoint**: `GET /api/superadmin/logs`, `GET /api/superadmin/admins`, `PUT /api/superadmin/settings/:key`
  - **Result**: Accessible exclusively to `role = 'super_admin'`; ordinary admins receive `403 Forbidden`.
- [x] **Audit logs are recorded without credential leakage**
  - **Method / Endpoint**: `GET /api/superadmin/logs`
  - **Result**: Important actions (`ORDER_PLACED`, `SELLER_BLOCKED`, `ADMIN_CREATED`, `SETTING_UPDATED`) logged with IP address and timestamp; passwords and secret tokens are sanitized and redacted.

---

## Test Execution Summary

All tests executed via automated script:
```bash
node tests/integration_test.js
```
**Total Test Cases**: 26  
**Passed**: 26  
**Failed**: 0  
**Status**: All integration tests PASSED.
