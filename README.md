# Twayba Inventory

Warehouse, inventory, barcode scanning, POS and delivery system for Twayba.
Separate from the Twayba e-commerce website. Requirements: [docs/requirements.md](docs/requirements.md).

```
backend    NestJS + Prisma + PostgreSQL   → http://localhost:4000/api
frontend   Next.js + Tailwind             → http://localhost:3000
```

## Documentation

| For | Document |
|---|---|
| **Staff and owners** — how every job is done in the system | [docs/user-guide.md](docs/user-guide.md) |
| **Whoever hosts it** — putting it online (Vercel + Render) | [docs/deployment.md](docs/deployment.md) |
| Website developer — sending orders to the system | [docs/website-webhook.md](docs/website-webhook.md) |
| What was agreed and built | [docs/requirements.md](docs/requirements.md) |

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

The browser only ever talks to the Next.js server: it forwards `/api` and `/uploads` to the
backend (`BACKEND_URL` in `frontend/.env.local`, default `http://localhost:4000`).

## Host it online (Vercel + Render)

The website goes on **Vercel**, and the API and database on **Render**. Step-by-step instructions,
settings and troubleshooting are in [docs/deployment.md](docs/deployment.md); the API's Render
settings are ready in [render.yaml](render.yaml).

## Run in production (on your own server)

```bash
cd backend
npm ci && npm run build
npm run db:deploy             # apply migrations
node dist/main.js             # or under a process manager (pm2, systemd…)

cd ../frontend
npm ci
BACKEND_URL=http://localhost:4000 npm run build   # BACKEND_URL is fixed at build time
npm start                     # serves on port 3000
```

Put HTTPS in front (e.g. Caddy or nginx) — phones only allow the camera on `https://`.
Back up the PostgreSQL database and `backend/uploads/` every day.

### Scanning with a phone camera

Phones only allow the camera on `https://` pages. On the same Wi-Fi as this PC:

```bash
cd frontend && npm run dev:phone   # instead of npm run dev
```

The first run creates a local certificate (Windows asks to trust it — click **Yes**) and Windows
Firewall may ask to allow Node.js on private networks — allow it. Then on the phone open
`https://<this PC's IP>:3000` (find it with `ipconfig`), accept the certificate warning
("Advanced → Proceed"), sign in and tap **Scan**.

USB / Bluetooth barcode scanners work on any page with a code box — they type the code and press Enter.

## Useful commands (backend)

| Command | What it does |
|---|---|
| `npm run db:migrate` | Apply schema changes in development |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:seed` | Create the first admin (only if none exists) |
| `npm run db:studio` | Browse the database |
| `npm test` | Unit tests |

Uploaded product images and delivery photos are stored in `backend/uploads/` (set `UPLOAD_DIR` to change). Back this folder up together with the database. Files are served at `/uploads/…` under random, unguessable names.

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
- [x] Phase 2 — Products, categories, variants, tax rates, barcodes, kits, labels
- [x] Phase 3 — Location tree, location labels
- [x] Phase 4 — Inventory and movement ledger
- [x] Phase 5 — Mobile barcode scanning
- [x] Phase 6 — Add / remove / transfer stock
- [x] Phase 7 — POS, invoices, receipts
- [x] Phase 8 — Returns, stocktake, low stock
- [x] Phase 9 — Orders, allocation, picking ([website webhook](docs/website-webhook.md))
- [x] Phase 10 — Drivers and deliveries
- [x] Phase 11 — Reports (Excel export), audit log, dashboard, polish
- [x] Client-brief gaps: per-site permissions, Excel/CSV import (products and opening stock), website-order problem list with retry, two-step transfers, stock per van, daily summary by channel, "add to home screen"
- [ ] Later — offline scanning, Wolt (if API access is granted), route planning
