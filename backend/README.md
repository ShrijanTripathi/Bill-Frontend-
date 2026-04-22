# Balaji Billing Backend

Node.js + Express + MongoDB backend for billing/admin operations, including:
- Admin authentication (email/password and Google sign-in)
- Category and menu management
- Sales creation, listing, soft delete (offline), bulk delete with archive
- Sales analytics, export APIs, and live sales events via Server-Sent Events (SSE)

## Project Analysis Summary

### Tech Stack
- Node.js (CommonJS)
- Express 4
- MongoDB + Mongoose
- JWT auth via `jsonwebtoken`
- Password hashing via `bcryptjs`
- Validation via `express-validator`

### High-Level Architecture
- `src/server.js`: app bootstrap, middleware, routes, DB retry loop, health endpoint
- `src/config/*`: environment parsing and MongoDB connection
- `src/routes/*`: route definitions and validators
- `src/controllers/*`: request handlers and business logic
- `src/models/*`: Mongoose schemas
- `src/middleware/*`: auth guard + request validation
- `src/utils/*`: JWT helpers, analytics/date helpers, seed scripts, event bus

### Notable Runtime Behavior
- Server starts immediately, then keeps retrying DB connection every 5 seconds.
- Non-health API endpoints return `503` until DB connection is ready.
- Single-admin model is enforced (`ADMIN_EMAIL` is the only allowed admin identity).
- JWT token is stored in cookie `bjfa_admin_token` (or can be sent as Bearer token).
- Sales stream endpoint (`/api/sales/stream`) sends SSE updates and heartbeat events.

### Current Gaps / Risks
- No automated tests in repository yet.
- No lint/format script configured.
- `.env` currently exists locally; keep it untracked in Git.

## Folder Structure

```txt
src/
  config/
    db.js
    env.js
  controllers/
    authController.js
    categoryController.js
    menuController.js
    salesController.js
  middleware/
    auth.js
    validate.js
  models/
    Admin.js
    Category.js
    MenuItem.js
    Sale.js
    SaleArchive.js
  routes/
    authRoutes.js
    categoryRoutes.js
    menuRoutes.js
    salesRoutes.js
  utils/
    jwt.js
    salesAnalytics.js
    salesEvents.js
    seedAdmin.js
    seedMenu.js
  server.js
```

## Prerequisites

- Node.js 18+ (recommended)
- MongoDB instance (local or hosted)

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_secret
JWT_EXPIRY=12h
ADMIN_EMAIL=your_admin_email
ADMIN_PASSWORD=your_admin_password
GOOGLE_CLIENT_ID=your_google_client_id
ALLOWED_ORIGINS=http://localhost:3000
```

Notes:
- Required vars at startup: `MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `ALLOWED_ORIGINS`
- `ALLOWED_ORIGINS` supports comma-separated values
- If `ADMIN_PASSWORD` is empty, local-password login is disabled and Google login can be used

## Installation & Run

```bash
npm install
npm run dev
```

Production:

```bash
npm start
```

## Available Scripts

- `npm run dev` - start server with nodemon
- `npm start` - start server with node
- `npm run seed:menu` - upsert default categories and menu items

## API Overview

Base URL: `http://localhost:5000/api`

### Health
- `GET /health` - service and DB status

### Auth
- `POST /auth/login` - admin login (email/password)
- `POST /auth/google` - admin login via Google ID token
- `POST /auth/logout` - clear auth cookie
- `GET /auth/me` - current admin (auth required)

### Categories
- `GET /categories` - list categories
- `POST /categories` - create category (auth required)
- `PUT /categories/:id` - rename category + update linked menu item category names (auth required)
- `DELETE /categories/:id` - delete category if no linked menu items (auth required)

### Menu
- `GET /menu` - list menu items (`includeUnavailable`, `search`, `category`)
- `POST /menu` - create menu item (auth required)
- `PUT /menu/:id` - update menu item (auth required)
- `DELETE /menu/:id` - delete menu item (auth required)

### Sales
- `POST /sales` - create sale (online/offline)
- `GET /sales` - list sales (auth required)
- `PATCH /sales/:id/delete` - soft delete OFFLINE sale only (auth required)
- `GET /sales/stream` - SSE stream for sales events (auth required)
- `GET /sales/analytics` - aggregated analytics by `today|week|month` (auth required)
- `GET /sales/export` - export sales by time filter (auth required)
- `DELETE /sales/bulk-delete` - archive and hard-delete sales by filter (auth required)

## Authentication Details

- Cookie name: `bjfa_admin_token`
- Cookie options:
  - `httpOnly: true`
  - `sameSite: "lax"`
  - `secure: true` only when `NODE_ENV=production`
- Protected routes also accept `Authorization: Bearer <token>`

## Data Model Summary

- `Admin`: single head admin identity (`email`, `passwordHash`, `authProvider`)
- `Category`: unique category name
- `MenuItem`: item details + unique composite index on (`name`, `category`)
- `Sale`: sale header + line items + totals + soft-delete flags
- `SaleArchive`: immutable snapshot for bulk-deleted sales

## Seeding

- On startup, backend attempts admin seeding:
  - Creates initial admin when none exists
  - Uses local auth if `ADMIN_PASSWORD` exists
  - Falls back to Google auth mode when password is missing
- Optional menu seed:

```bash
npm run seed:menu
```

## Suggested Next Improvements

1. Add automated tests for auth, sales analytics, and delete/archive flows.
2. Add linting (`eslint`) and CI checks.
3. Add API documentation (OpenAPI/Swagger) for frontend integration.
