# Twayba Inventory

Warehouse, inventory, barcode scanning, POS and delivery system for Twayba.
Separate from the Twayba e-commerce website. Requirements: [docs/requirements.md](docs/requirements.md).

```
backend    NestJS + Prisma + PostgreSQL   → http://localhost:4000/api
frontend   Next.js + Tailwind             → http://localhost:3000
```

## Requirements

- Node.js 20.9+
- PostgreSQL 14+

## First-time setup

```bash
# 1. Database
createdb twayba_ims

# 2. Backend
cd backend
cp .env.example .env          # set DATABASE_URL, JWT_SECRET, SEED_ADMIN_PASSWORD
npm install
npm run db:migrate            # create tables
npm run db:seed               # create the first admin account

# 3. Frontend
cd ../frontend
cp .env.example .env.local    # NEXT_PUBLIC_API_URL
npm install
```

## Run in development

```bash
cd backend && npm run start:dev    # terminal 1
cd frontend && npm run dev        # terminal 2
```

Open http://localhost:3000 and sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
Change that password straight away under **My account**.

## Useful commands (backend)

| Command | What it does |
|---|---|
| `npm run db:migrate` | Apply schema changes in development |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:seed` | Create the first admin (only if none exists) |
| `npm run db:studio` | Browse the database |
| `npm test` | Unit tests |

## Roles

| Role | Access |
|---|---|
| Admin | Everything |
| Manager | Products, inventory, orders, reports, staff (can't manage admins/managers) |
| Warehouse | Scanning, stock, transfers, picking |
| Cashier | POS, sales, invoices, returns |
| Driver | Own deliveries |
| Viewer | Read-only |

Permissions are checked in the API on every request. Deactivated users are blocked immediately.

## Progress

- [x] Phase 1 — Auth, users, roles, audit log
- [ ] Phase 2 — Products, categories, variants, tax rates, barcodes, kits, labels
- [ ] Phase 3 — Location tree, location labels
- [ ] Phase 4 — Inventory and movement ledger
- [ ] Phase 5 — Mobile barcode scanning
- [ ] Phase 6 — Add / remove / transfer stock
- [ ] Phase 7 — POS, invoices, receipts
- [ ] Phase 8 — Returns, stocktake, low stock
- [ ] Phase 9 — Orders, allocation, picking
- [ ] Phase 10 — Drivers and deliveries
- [ ] Phase 11 — Reports and polish
