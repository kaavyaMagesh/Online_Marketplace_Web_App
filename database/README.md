# Online Marketplace — Database Setup

## 1. About

This folder contains the MySQL database files for our Online Marketplace Web Application.

The database is named `online_marketplace` and is used by customers, sellers, admins, and super admins.

## 2. Requirements

- MySQL Server
- MySQL Workbench
- Git (to get the project files)

## 3. Database Files

| File | Purpose |
|---|---|
| `schema.sql` | Creates the database and its 12 tables. |
| `seed.sql` | Inserts sample data for testing, such as product categories. |
| `README.md` | Explains how to set up the database. |

## 4. How to Set Up the Database

Each team member must set up their own local database.

### Step 1: Get the project

Clone the GitHub repository or pull the latest changes.

### Step 2: Open MySQL Workbench

Connect to your local MySQL Server and open a new SQL query tab.

### Step 3: Run the schema

1. Open `database/schema.sql`.
2. Execute the entire SQL script.
3. Check that the `online_marketplace` database is created.

### Step 4: Insert sample data

1. Open `database/seed.sql`.
2. Execute the script.
3. Sample categories should be inserted into the database.

Run the seed file only once on a fresh database unless its instructions explicitly allow rerunning it.

### Step 5: Verify the tables

Execute:

```sql
USE online_marketplace;
SHOW TABLES;
```

The database should contain these 12 tables:

1. `users`
2. `addresses`
3. `categories`
4. `products`
5. `cart`
6. `cart_items`
7. `orders`
8. `order_items`
9. `reviews`
10. `admin_permissions`
11. `system_logs`
12. `system_settings`

### Step 6: Verify the sample categories

Execute:

```sql
SELECT * FROM categories;
```

You should see the sample categories inserted by `seed.sql`.

## 5. Important Notes

- Every team member uses their own local MySQL database.
- Database records are not automatically shared between team members.
- GitHub stores our SQL files, not the live database contents.
- If the database structure changes, update `schema.sql` and inform the team.
- If sample data changes, update `seed.sql`.
- Never commit database passwords, `.env` files, or other private credentials to GitHub.
- The `password` column in `users` must store a securely hashed password, never a plain-text password.

## 6. Database Tables

| Table | Purpose |
|---|---|
| `users` | Stores user accounts and roles. |
| `addresses` | Stores user delivery addresses. |
| `categories` | Stores product categories. |
| `products` | Stores product details, prices, and stock. |
| `cart` | Stores customer shopping carts. |
| `cart_items` | Stores products added to carts. |
| `orders` | Stores customer orders and their status. |
| `order_items` | Stores the products included in each order. |
| `reviews` | Stores product ratings and reviews. |
| `admin_permissions` | Stores administrator permissions. |
| `system_logs` | Records important system actions. |
| `system_settings` | Stores application settings. |

## 7. Team Workflow

1. Pull the latest code from GitHub.
2. Run the SQL setup files if setting up for the first time.
3. Make database changes only when needed.
4. Update the SQL files when the database structure or seed data changes.
5. Commit and push changes so the entire team can use the latest version.

**Database setup complete!** The database is ready for the Node.js backend to connect to it.
