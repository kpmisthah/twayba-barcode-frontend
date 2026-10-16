# Twayba Warehouse, Inventory & POS System — Requirements

Final working specification. Supersedes the client brief where they differ.

## 1. Scope

A separate web application (own frontend, backend and PostgreSQL database) for Twayba to:

- Create products, assign and print barcodes
- Know exactly where every item is stored (site → floor → room → shelf → space)
- Add, remove, transfer and count stock by scanning
- Sell at the counter (POS) with printed receipts / invoices, and process returns
- Manage delivery orders, picking by scan, drivers and deliveries
- Report on stock, sales, movements and exceptions

The existing e-commerce website is **not** modified, except (later, Stage "Online orders") a small
change in its backend to send orders to this system by webhook. Stock is **not** synced back to
the website.

Responsive: desktop (admin), tablet and phone (scanning, POS, driver).

## 2. Decisions (confirmed with client)

| Topic | Decision |
|---|---|
| Barcodes | Client has none. The system generates codes and prints labels. Supplier barcodes can be added later; a product may have several barcodes. |
| Multi-box products (kits) | Supported. Client enters kits and their boxes. |
| Location structure | Flexible tree. Sites: **Naxxar Garage, Mosta Garage 1, Mosta Garage 2, Hamrun Shop**. Garages: Site → Room → Shelf → Space. Hamrun: Site → Floor (Top, Middle, Bottom) → Room → Shelf → Space. Rooms are named by the client (e.g. "Room 1"); shelves are lettered (Shelf A, Shelf B) and spaces on a shelf use codes like A1, A2, A3 (on Shelf A), B1, B2, B3 (on Shelf B) — e.g. `Room 1 › Shelf A › A1`. Codes may repeat in different rooms. The shop display area is a location too, so stock on display is tracked. |
| VAT | Configurable tax rates + setting "prices include VAT". Client fills in. |
| POS stock source | Cashier **always chooses** the space the item was taken from (popup after each scan). |
| Printers | Decided later. Label size and receipt width are settings (defaults 50×25 mm, 80 mm). A4 PDF always available. |
| Roles | Isaac, Sulthan = Admin. Shop salesman = Cashier. Delivery boy = Driver. **Salesman and delivery boy can also add stock, remove stock, transfer stock between locations and mark items damaged** (confirmed 2026-10-10). |
| POS on phone | Salesman scans products on the phone; the invoice is shown on screen with a **Download (PDF)** button. |

## 3. Roles

| Role | Access |
|---|---|
| ADMIN | Everything, including users, settings, stock corrections and overrides |
| MANAGER | Products, inventory, orders, reports, staff (not system settings); can approve overrides |
| WAREHOUSE | Scanning, receive / transfer / count stock, picking — only in assigned locations |
| CASHIER | POS, sales, invoices, returns; scan products; add / remove / transfer stock and mark damaged |
| DRIVER | Own assigned deliveries; scan products; add / remove / transfer stock and mark damaged |
| VIEWER | Read-only: stock, orders, reports, audit history |

- Every person has an individual login; accounts are deactivated, never deleted.
- Permissions are enforced in the backend on every request (hiding buttons is not security).
- Warehouse, shop and delivery users can be limited to specific sites (Users → Edit → "Sites this
  person can change stock in"). A limited user can see stock everywhere but can only add, remove,
  transfer, count, sell and pick in their own sites. Admins and managers are never limited.

## 4. Products

Fields: name, SKU, category, brand, description, images, selling price, cost price, tax rate,
minimum stock level, status (active / inactive), optional variants (size / colour).

- Stock, SKU and barcodes are **per variant** (a product without variants has one default variant).
- If no barcode is entered, a unique internal code is generated (`TW-000123`).
- Products are never hard-deleted (history and invoices refer to them).

### Kits (multi-box products)

- A kit product is made of components (boxes), each with its own barcode (`TW-000200-A`, `-B`, `-C`).
- Quantities per kit can differ (2 × Box A + 1 × Box B).
- Stock is held **per box**; sellable kit units = min(box stock ÷ qty needed).
- Incomplete kits are reported (e.g. 10 × A, 10 × B, 7 × C → 7 sellable, 3 A and 3 B orphaned).
- Picking/selling a kit requires one scan per required box; "A, A, A" never completes a 3-box kit.
- A missing box blocks completion unless an Admin/Manager records an override with a reason.

### Barcodes and labels

- Barcode codes are unique system-wide; a code can never point to two items.
- Replaced codes are deactivated and kept in history; never reused.
- Product labels: name, variant / box, barcode (Code 128), code as text. PDF, configurable size.
- Location labels for every space / shelf / room.

## 5. Locations

- One `Location` tree: each location has a type (SITE, FLOOR, ROOM, SHELF, SPACE, plus system
  types TRANSIT, DAMAGED) and a parent.
- Full path is shown everywhere: `Hamrun › Floor 1 › Room 1 › Shelf A › A1`.
- Stock is held at the lowest level used (normally SPACE).
- System locations: **In Transit** (loaded orders), **Damaged**.

## 6. Inventory

Per variant/box per location: `onHand`, `reserved`; `available = onHand − reserved`.

Product view shows: total, available, reserved, in transit; breakdown by site, room, space.

Every change creates an **immutable movement** (type, item, qty, from, to, user, time, reason,
reference). Stock is never overwritten without a movement.

Movement types: STOCK_IN, STOCK_OUT, TRANSFER, ADJUSTMENT, RESERVE, RELEASE, PICK / LOAD,
DELIVER, RETURN, SALE, SALE_RETURN, DAMAGE.

All stock changes go through one stock service, inside a DB transaction with row locking, so two
users can never take the same last unit.

### Actions

- **Add stock**: item, location, qty, reason (New purchase, Return, Found, Other).
- **Remove stock**: reasons Damaged, Lost, Expired, Manual adjustment, Other.
  (Sales only via POS; picking only via orders.)
- **Transfer**: item, from, to, qty, reason/reference. Instant ("Update stock → Move"), or
  two-step ("Transfers"): scanned out at the source (stock goes In Transit) and scanned in at the
  destination; partial receipts allowed; what never arrives is written off by a manager with a reason.
- **Stocktake**: choose location → expected list → scan/count → variance → Admin/Manager approves
  → adjustment movements. Each item's difference is counted − what the system held *when that
  item was counted*, so sales or moves made later during the stocktake are not undone. Items not
  counted must be confirmed as "not found" (0) before submitting. One open stocktake per area.
- **Low stock**: products below minimum shown on dashboard and report.

## 7. Scanning

- Browser camera scanning via a library (ZXing); HTTPS required.
- Every scan screen also has a keyboard input so Bluetooth/USB scanners work (they type + Enter).
- Scanning a product shows: name, SKU, barcode, price, image, stock by location, and actions:
  details, add, remove, transfer, sell, history.
- Scanning a location label shows its contents.
- Success / error feedback with colour, sound and vibration.

## 8. POS / billing

- Scan or search to add items; after each scan the cashier **chooses the space** the item was
  taken from (only spaces in the POS's site with available stock; zero-stock spaces greyed out).
- Scanning the same item again asks again (it may come from another space); quantities can be split.
- Cart: product, space, qty, unit price, discount, tax, total. Tax comes from the product's tax rate
  (cashier cannot change it). Discounts above a limit need Admin/Manager approval.
- Customer optional. Payment methods: cash (with change), card, bank transfer, other; split allowed.
- On payment, in one transaction: create sale, invoice (sequential number, no gaps), payment,
  stock movements, mark completed.
- Receipt (80 mm, configurable) and A4 invoice PDF. Email later.
- Invoices are immutable. Returns create a **credit note**.
- Fiscal-receipt legal requirements (Malta) to be confirmed by the client's accountant.

## 9. Returns

Find invoice by scan/search → choose items and qty (not more than sold minus already returned) →
condition Good (back to chosen location) or Damaged (to Damaged location) → credit note, refund
method, movements.

## 10. Orders, picking, delivery

- Orders created manually, or from the website by webhook (external order ID prevents duplicates).
  Wolt later, if API access is granted.
- Order fields: customer, phone, address, map pin, items, notes, payment status, COD amount,
  time window, driver.
- Allocation: system suggests locations with available stock; Admin/Manager confirms or changes;
  stock is reserved.
- Picking list grouped by site, with images. Each scan is validated: correct item, correct box,
  correct location, not beyond quantity. Wrong location needs an override.
- Each valid pick scan loads that unit straight onto the van (Reserved → In Transit) — the
  driver's first scan; confirming delivery is the second.
- Stock lifecycle: Available → Reserved → Loaded (moved to In Transit) → Delivered (removed).
  Failed delivery stays In Transit until returned or re-delivered. Cancellation releases reservations,
  or requires a return scan if already loaded.
- Exceptions: missing/damaged box (photo, notes), partial delivery (approval), overrides — all logged.
- Driver screen: customer, phone (tap to call), address, map link, items, notes, COD, pickups, status.
- Delivery statuses: Assigned, Picked up, Out for delivery, Delivered, Failed, Returned.
- Route optimisation later (Google Maps / Mapbox), if required.

## 11. Dashboard and reports

Dashboard: total products, total stock, low stock, today's sales, today's/pending orders, ready for
delivery, active deliveries, returns, recent movements.

Reports (filter by date, product, location, user, category; Excel export): sales, POS sales, cashier
sales, product sales, inventory, stock by location, low stock, movements, returns, damaged stock,
stocktake variance, orders, deliveries, picking errors, overrides, incomplete kits.

## 12. Non-functional

- Separate PostgreSQL database; daily backups.
- Passwords hashed; JWT auth; role + location authorisation on every endpoint.
- Audit log of every create/update and every override; not deletable.
- HTTPS in production (camera requirement).
- Offline scanning: later phase (queue on phone, idempotent sync by scan UUID).

## 13. Acceptance tests

| Test | Expected |
|---|---|
| Three-box kit | A + B + C completes one unit; A + A + A is rejected |
| Wrong location | Blocked unless overridden |
| Two-stage movement | Load → In Transit; deliver → removed; failed delivery keeps it In Transit |
| Concurrent users | Two users cannot take the same last unit |
| Cancelled loaded order | Stock returns only via the return workflow |
| POS sale | Stock reduced at the chosen space; invoice number sequential |
| Return | Good → back to location; damaged → Damaged; credit note created |
| Audit | Every stock change shows who, what, when, where, why |

## 14. Technology

- Backend: NestJS, TypeScript, REST, Prisma, PostgreSQL
- Frontend: Next.js, TypeScript, Tailwind CSS (one responsive app: admin + mobile screens)
- Scanning: ZXing; barcode images: bwip-js; PDFs: pdfkit
- Background jobs (later): BullMQ + Redis

## 15. Phases

1. Auth, users, roles, permissions
2. Products, categories, variants, tax rates, barcodes, kits, label printing
3. Location tree, location labels
4. Inventory and movement ledger (with locking)
5. Mobile barcode scanning (camera + scanner input)
6. Add / remove / transfer stock
7. POS, billing, invoices, receipts
8. Returns, stocktake, low-stock alerts
9. Orders (manual + website webhook), allocation, picking, kit validation
10. Drivers, deliveries, exceptions
11. Reports, audit log, polish
12. Later: offline mode, Wolt, route planning

## 16. Open questions (not blocking)

- ~~Can the cashier/salesman also add and move stock, or only sell?~~ Yes — salesman and delivery boy can add, remove, transfer and mark damaged (2026-10-10).
- How many salesmen and drivers?
- Printer models (label and receipt).
- Fiscal receipt requirements (accountant).
