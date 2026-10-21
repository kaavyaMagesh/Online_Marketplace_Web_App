
# MarketHub

## Project Overview

MarketHub is a role-based marketplace supporting four user roles: Customers, Sellers, Admins, and Super Admins. Each role has specific functionalities and permissions to ensure secure and efficient marketplace management.

## Team Members and Responsibilities

- **Varshni** — Customer frontend, authentication, and cart APIs.
- **Kaavyashri** — MySQL schema, Express server, seller features, and order backend.
- **Mahalakshmi** — Admin and Super Admin interfaces, APIs, permissions, reports, and logs.

## Technology Stack

- **Frontend:** HTML, CSS, JavaScript, DOM, and Fetch API
- **Backend:** Node.js and Express.js
- **Database:** MySQL
- **Version Control:** Git and GitHub

## Planned Features

### Customer
- Browse and search products
- Add products to the cart
- Checkout and place orders
- View order history
- Manage profile

### Seller
- Manage inventory and product listings
- Update product information
- View and manage orders
- Access sales reports

### Admin
- Manage customers and sellers
- Manage products and categories
- Manage orders
- Generate reports

### Super Admin
- Manage administrator accounts
- Manage roles and permissions
- Access system logs
- Configure system settings

## Project Structure

- `public/` — Frontend files, including HTML, CSS, and JavaScript.
- `server/` — Express.js server, API routes, middleware, and backend logic.
- `database/` — MySQL schema, table definitions, and database scripts.
- `tests/` — Test cases for application functionality and APIs.

## Security and Role Permissions

- Authentication and authorization must be enforced server-side.
- Role-based access control restricts users to authorized features and resources.
- Super Admin-only actions must be protected using dedicated middleware.
- API endpoints must validate user permissions before performing sensitive operations.

## Progress and Contributions

The project is being developed collaboratively, with each team member responsible for their assigned features.

Individual contributions and development progress can be tracked through the [GitHub commit history](../../commits/).
