# TradeFlow SaaS — Complete Setup Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  TENANT (e.g. Sharma Distributors)                      │
│  ├── Firm A (Main Office)                               │
│  │   ├── Vendor Ledger module                          │
│  │   └── Market Collection module                      │
│  ├── Firm B (Branch 2)                                 │
│  │   └── Vendor Ledger module                         │
│  └── Collection Boy Anil → assigned to Firm A + Firm B │
└─────────────────────────────────────────────────────────┘
```

### Tech Stack
- **Frontend**: React 18, React Router v6, Axios, Tailwind CSS
- **Backend**: Node.js + Express, JWT auth, WebSocket (ws)
- **Database**: PostgreSQL 15 (per-tenant row-level isolation)
- **Real-time**: WebSocket with room-based broadcasting
- **Deployment**: Docker + Docker Compose + Nginx

---

## Quick Start (Docker — recommended)

```bash
# 1. Clone / extract the project
cd tradeflow

# 2. Create environment file
cp backend/.env.example backend/.env
# Edit backend/.env — set JWT_SECRET to a 32+ char random string

# 3. Start everything
docker-compose up -d

# App:  http://localhost:3000
# API:  http://localhost:4000
# DB:   localhost:5432
```

---

## Deploy on Railway (GitHub)

This repo is a monorepo with 2 services:
- `backend/` (Node/Express API + WebSocket)
- `frontend/` (React build served by Nginx)

### 1) Push to GitHub
- Keep secrets in local `.env` files only (donâ€™t commit them; `.gitignore` ignores `.env`).

### 2) Create Railway project + Postgres
1) Create a new Railway project and add a PostgreSQL database.
2) Copy the Postgres `DATABASE_URL` from Railway.
3) Initialize schema (run from your laptop/PC):
```bash
psql "$DATABASE_URL" -f backend/src/config/schema.sql
```

### 3) Deploy Backend service
- **Root Directory**: `backend`
- **Variables**:
  - `DATABASE_URL` = Railway Postgres `DATABASE_URL`
  - `JWT_SECRET` = 32+ chars random
  - `NODE_ENV` = `production`
  - `FRONTEND_URL` = `https://<your-frontend-domain>`
  - (demo only) `DISABLE_PAYMENT_GATE` = `true` (lets you activate paid modules without `paymentConfirmed`)
  - (demo) `DEMO_SEED` = `true` (creates demo tenant/users/data on first start)
  - (demo) `DEMO_PASSWORD` = `Tradeflow@12345` (or set your own)

### 4) Deploy Frontend service
- **Root Directory**: `frontend`
- **Variables**:
  - `TRADEFLOW_BACKEND_ORIGIN` = `https://<your-backend-domain>`
  - (optional) `TRADEFLOW_API_URL` = `/api` (default)
  - (optional) `TRADEFLOW_WS_URL` = `wss://<your-frontend-domain>/ws` (if not set, it auto-detects ws/wss)

Notes:
- Frontend reads API/WS URLs from `runtime-config.js` at runtime (no rebuild needed for URL changes).
- In `NODE_ENV=production`, paid modules require `paymentConfirmed=true` (payment gateway integration). In development, the payment gate is bypassed for local testing.

### Demo login details (when `DEMO_SEED=true`)
Password for all users: `Tradeflow@12345` (or your `DEMO_PASSWORD`)

- Tenant Admin: `admin@tradeflow.local`
- Firm Admin: `firmadmin@tradeflow.local`
- Accountant: `accountant@tradeflow.local`
- Viewer: `viewer@tradeflow.local`
- Collection Boy: `collector@tradeflow.local`

## Manual Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 15+

### Database
```bash
createdb tradeflow
psql tradeflow < backend/src/config/schema.sql
```

### Local PostgreSQL (Windows PowerShell)
1) Install PostgreSQL 15+ and ensure `psql` is on PATH.
2) Create DB + user (PowerShell):
```powershell
psql -U postgres -c "CREATE USER tradeflow WITH PASSWORD 'changeme';"
psql -U postgres -c "CREATE DATABASE tradeflow OWNER tradeflow;"
psql -U postgres -d tradeflow -f backend/src/config/schema.sql
```
3) Backend env:
```powershell
Copy-Item backend/.env.example backend/.env
```
Set in `backend/.env`:
- `DATABASE_URL=postgresql://tradeflow:changeme@localhost:5432/tradeflow`
- `JWT_SECRET=` (32+ chars)
4) Frontend env (WebSocket in dev):
```powershell
Copy-Item frontend/.env.example frontend/.env
```

### Backend
```bash
cd backend
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET
npm install
npm run dev        # development (nodemon)
npm start          # production
```

### Frontend
```bash
cd frontend
npm install
# For development (proxies /api → localhost:4000):
npm start

# For production build:
REACT_APP_API_URL=https://yourapi.com/api npm run build
```

---

## Multi-Tenant & Multi-Firm Model

| Concept | Description |
|---|---|
| **Tenant** | One business account (e.g. Sharma Distributors) |
| **Firm** | A business entity under the tenant (e.g. Main Branch, Delhi Branch) |
| **Plan** | Controls max firms allowed; extra firm = additional charge |
| **Module** | Feature pack (Vendor Ledger / Market Collection / Reports) per tenant |
| **User** | Belongs to a tenant; assigned to one or more firms with a role |
| **Collection Boy** | A user role that can be assigned to multiple firms of same tenant |

### Firm limit enforcement
- Starter plan: 1 firm (free)
- Growth plan: 3 firms (₹199/extra firm)
- Enterprise: 10 firms (₹149/extra firm)
- API returns `FIRM_LIMIT_REACHED` (402) when limit exceeded

### Collection Boy in multiple firms
A collection boy is a `users` row with `role = 'collection_boy'`.  
Access per firm is controlled by `user_firm_access` table where `can_collect = true`.  
One user → many `user_firm_access` rows → many firms.

---

## API Reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create tenant + admin user |
| POST | `/api/auth/login` | Login, get tokens |
| POST | `/api/auth/refresh` | Rotate refresh token |
| POST | `/api/auth/logout` | Revoke refresh token |
| GET  | `/api/auth/me` | Get current user + firms + modules |

### Firms
| Method | Endpoint | Description |
|---|---|---|
| GET  | `/api/firms` | List tenant's firms |
| POST | `/api/firms` | Create firm (checks plan limit) |
| PUT  | `/api/firms/:id` | Update firm |
| GET  | `/api/firms/:id/users` | List firm users |
| POST | `/api/firms/:id/users` | Add user to firm |

### Vendor Ledger (requires `vendor_ledger` module)
| Method | Endpoint | Description |
|---|---|---|
| GET  | `/api/firms/:id/vendors` | List vendors |
| POST | `/api/firms/:id/vendors` | Create vendor |
| GET  | `/api/firms/:id/vendors/:vid/transactions` | Get ledger |
| POST | `/api/firms/:id/vendors/:vid/transactions` | Add transaction |
| DELETE | `/api/firms/:id/vendors/:vid/transactions/:tid` | Delete last txn only |

### Market Collection (requires `market_collection` module)
| Method | Endpoint | Description |
|---|---|---|
| GET  | `/api/firms/:id/retailers` | List retailers |
| POST | `/api/firms/:id/retailers` | Create retailer |
| GET  | `/api/firms/:id/collections` | List transactions |
| POST | `/api/firms/:id/collections` | Record collection |
| GET  | `/api/firms/:id/collection/agents` | Agents daily summary |
| GET  | `/api/firms/:id/collection/outstanding` | Retailer outstanding |

### Subscriptions
| Method | Endpoint | Description |
|---|---|---|
| GET  | `/api/subscriptions/plans` | List plans |
| GET  | `/api/subscriptions/my` | My subscription |
| POST | `/api/subscriptions/module` | Activate module |
| POST | `/api/subscriptions/upgrade` | Upgrade plan |

---

## Ledger Balance Formula

```
Closing = Opening + DR (advance/debit) − CR (received) + MNP
```

Transactions are stored sequentially. The closing balance of each row becomes the opening of the next. Only the **most recent transaction** can be deleted (to preserve ledger integrity).

---

## WebSocket (Real-time)

Connect to `ws://host/ws` and authenticate:
```json
{ "type": "auth", "token": "<accessToken>", "tenantId": "...", "firmId": "..." }
```

Events received:
- `collection_added` — new collection recorded by any agent
- `vendor_txn_added` — new vendor transaction added

---

## Security Features
- JWT access tokens (15m) + refresh tokens (30d, hashed + rotated)
- bcrypt password hashing (12 rounds)
- Helmet.js security headers
- Rate limiting (200 req/15min general, 20 req/15min auth)
- Tenant isolation enforced on every DB query
- Firm access checked per request via `user_firm_access`
- Module subscription checked per route
- Input validation via express-validator

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Min 32 chars random string |
| `PORT` | — | Default 4000 |
| `FRONTEND_URL` | — | For CORS (default *) |
| `NODE_ENV` | — | `development` or `production` |
