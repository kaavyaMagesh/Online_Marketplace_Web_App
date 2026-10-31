
# Admin API Requirements

## Overview

This document defines the API endpoints required for
the Admin and Super Admin interfaces.

All management endpoints must enforce authentication
and role-based permissions on the backend.

## 1. Product Management

GET /api/admin/products
- List all products, including inactive and out-of-stock.
- Support optional search and status filters.
- Return product_id, product_name, seller_id,
  category_id, price, stock_quantity and status.

PATCH /api/admin/products/:id
- Update permitted product fields.
- Validate all inputs.
- Require Admin authorization.

DELETE /api/admin/products/:id
- Soft-delete by changing status to inactive.
- Do not permanently delete product records.

## 2. Category Management

GET /api/admin/categories
- List all categories, including inactive categories.
- Support optional search.

POST /api/admin/categories
- Create a category.
- Required: category_name.
- Optional: description.
- Default status: active.
- Reject duplicate category names.

PUT /api/admin/categories/:id
- Update category name, description or status.
- Validate category ID and inputs.

DELETE /api/admin/categories/:id
- Soft-delete by changing status to inactive.
- Preserve existing product-category relationships.

## 3. Customer and Seller Management

GET /api/admin/customers
- List customers and account statuses.

GET /api/admin/sellers
- List sellers and approval statuses.

PATCH /api/admin/users/:id/status
- Allow permitted status changes.
- Validate status against the users table enum.

## 4. Super Admin Management

GET /api/admin/super/admins
POST /api/admin/super/admins
PATCH /api/admin/super/admins/:id
GET /api/admin/super/logs

- Require Super Admin authorization.
- Validate permission changes on the server.

## 5. Security Requirements

- All endpoints require an authenticated session.
- Admin routes require the admin role.
- Super Admin routes require the super_admin role.
- Reject blocked and pending users.
- Use parameterized SQL queries.
- Validate input on the server.
- Never trust frontend role checks alone.

## 6. Existing Backend

The project already contains:

- middleware/auth.js
- routes/adminRoutes.js
- server/routes/products.js
- server/db.js
- database/schema.sql

The public product endpoints are separate from
Admin management endpoints.

## 7. Implementation Status

- Admin and Super Admin access-check APIs: implemented.
- Product and Category frontend skeletons: implemented.
- Product and Category management APIs: planned.
- Real login integration: pending.
- Database-backed CRUD operations: pending.
