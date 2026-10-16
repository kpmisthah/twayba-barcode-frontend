# Twayba Inventory — User Guide

This guide explains how the system works and how to do each job in it. You do not need any
technical knowledge. Read **sections 1–3** to understand the idea, then use the rest as a reference
for the job you are doing.

**Contents**

1. [What the system does](#1-what-the-system-does)
2. [Getting started](#2-getting-started)
3. [Who can do what](#3-who-can-do-what)
4. [Words used in the system](#4-words-used-in-the-system)
5. [Setting up (first time only)](#5-setting-up-first-time-only)
6. [Daily stock work](#6-daily-stock-work)
7. [Selling at the counter](#7-selling-at-the-counter)
8. [Orders and deliveries](#8-orders-and-deliveries)
9. [Reports, dashboard and history](#9-reports-dashboard-and-history)
10. [Rules the system enforces](#10-rules-the-system-enforces)
11. [A typical day, by job](#11-a-typical-day-by-job)
12. [Questions and problems](#12-questions-and-problems)

---

## 1. What the system does

Twayba Inventory is one place to:

- **Know exactly where every item is** — which site, room, shelf and space.
- **Scan barcodes** with a phone camera or a barcode scanner instead of typing.
- **Add, remove, move and count stock**, with a permanent record of who did it and why.
- **Sell at the counter** and print or download invoices and receipts.
- **Handle customer returns**, with a credit note.
- **Prepare and deliver orders**, from picking the items to the driver handing them over.
- **See reports** on sales, stock, deliveries and mistakes, and download them to Excel.

It is a separate system from the Twayba website. Orders placed on the website can arrive here
automatically (section 8.2).

### The idea that makes it all work

Stock is never just a number that someone types over. Every change is a **movement** with a
**who, what, when, where and why**, and movements can never be edited or deleted. If a number is
wrong, you can always see exactly how it got there.

An item moves through these stages when it is delivered to a customer:

```
 Available  ──►  Reserved  ──►  In Transit  ──►  Delivered
 (on a shelf)   (set aside      (loaded on       (left the
                for an order)    the van)         business)
```

- **Available** — on a shelf and free to sell.
- **Reserved** — set aside for an order. Nobody else can sell it.
- **In Transit** — picked, scanned and loaded on a van.
- **Delivered** — handed to the customer. It is gone from stock.

If a delivery fails, the item stays **In Transit** until it is delivered again or scanned back into
a shelf. Nothing can disappear on the way.

---

## 2. Getting started

### Signing in

1. Open the system's web address (your administrator will give it to you).
2. Enter your **email or phone** and your **password**, then press **Sign in**.
3. Change your password straight away: open **My account** and fill in the **Change password**
   card. A coloured bar shows how strong your new password is.

Everyone has their own login. Never share yours: every action is recorded under your name.

### Using it on a phone

The system works on computers, tablets and phones. On a phone, shortcuts sit at the bottom of the
screen (for example **Dashboard, Scan, Sell, Deliveries**, depending on your job) with a **Menu**
button for everything else.

To put it on the phone's home screen like an app:

- **iPhone (Safari):** tap the Share button → **Add to Home Screen**.
- **Android (Chrome):** tap the ⋮ menu → **Add to Home screen** (or **Install app**).

**Camera scanning** asks permission the first time. Tap **Allow**. If you tapped *Block* by
mistake, open the browser's site settings and allow the camera for this site.

### Barcode scanners

- **Phone camera:** tap the scan button (the square-corners icon) next to any code box.
- **USB or Bluetooth scanner:** click in the code box and scan. The scanner types the code and
  presses Enter by itself.
- **No barcode available?** You can always type a name, SKU or code instead.

### Finding your way around

The menu is on the left (on a phone, tap **Menu**). It shows only what your job allows.

| Menu group | Pages |
|---|---|
| (top) | Dashboard, Scan |
| **Sell** | POS / Sell, Sales, Returns |
| **Deliveries** | Deliveries, Orders |
| **Stock** | Update stock, Transfers, Products, Categories, Locations, Stocktake, Low stock, Stock history |
| **Admin** | Reports, Import from Excel, Audit log, Users, Settings |
| **Account** | My account |

---

## 3. Who can do what

Each person has one **role**. The system checks the role on every action, so a button that is
missing for you is not an oversight.

| Role | Typical person | Can do |
|---|---|---|
| **Admin** | Owners | Everything, including settings and users |
| **Manager** | Supervisors | Products, stock, orders, reports, staff (not other admins or managers); approves exceptions |
| **Warehouse** | Stock handlers | Scan, add / remove / move stock, picking orders, print labels |
| **Cashier** | Shop salesperson | Sell, returns, sales list; also add / remove / move stock and mark items damaged |
| **Driver** | Delivery person | Their own assigned deliveries; also add / remove / move stock and mark items damaged |
| **Viewer** | Accountant, owner's view | Read only: stock, orders, reports, history |

**Limiting someone to certain sites.** An admin or manager can restrict a person to specific sites
(Users → edit the person → *Sites this person can change stock in*). That person can still **see**
stock everywhere, but can only **change** stock in their own sites.

**Manager approval.** Some actions need a manager or admin to approve on the spot by typing *their*
email or phone and password (not the signed-in person's): picking from an unexpected shelf,
finishing an order with items missing, delivering only part of an order, and a discount above the
limit. The approval and the reason are recorded.

---

## 4. Words used in the system

| Word | Meaning |
|---|---|
| **Site** | A place with its own stock: Naxxar Garage, Mosta Garage 1, Mosta Garage 2, Hamrun Shop |
| **Location / space** | Somewhere inside a site where stock sits. Shown as a path, e.g. `Hamrun › Floor 1 › Room 1 › Shelf A › A1`. The last part is the **space** |
| **Product** | What you sell, e.g. "Shelf unit" |
| **Variant** | A version of a product (colour or size). A product with no versions has one default variant |
| **Kit** | A product that comes in several **boxes** (A, B, C). It is sold as one item, but every box has its own barcode and its own stock |
| **SKU** | Your own short product code |
| **Barcode** | The code scanned. The system creates one for every product (`TW-000123`; kit boxes `TW-000200-A`, `-B`, `-C`). A product can also carry its supplier's barcode |
| **Available** | Free to sell: on hand minus reserved |
| **Reserved** | Set aside for an order |
| **In Transit** | Loaded on a van, or sent by a transfer and not yet received |
| **Damaged** | A special place holding broken items. They cannot be sold |
| **Movement** | One recorded stock change |
| **Invoice** | The record of a sale. It can never be edited |
| **Credit note** | The record of a return. It is attached to the original invoice |
| **COD** | Cash on delivery: the driver collects the money at the door |

**How kits work.** A kit with boxes A, B and C is only *sellable* when all three are in stock. If
you have 10 × A, 10 × B and 7 × C, you can sell **7** kits and have 3 spare A and 3 spare B. The
**Incomplete kits** report lists spare boxes. When selling or picking a kit you scan **every box**;
scanning A three times never completes a three-box kit.

---

## 5. Setting up (first time only)

Do these in order. Admins and managers do most of them.

### 5.1 Settings (Admin → Settings)

- **General:** business name, currency (3 letters, e.g. EUR), and whether prices you type
  **include VAT** or have VAT added on top.
- **Invoices & receipts:** address, phone, VAT number and a footer message (for example a returns
  policy). The paper width is 80 mm by default (58 mm is the other common size). **Max discount
  without approval** is the percentage a cashier may give before a manager has to approve.
- **Barcode labels:** the sticker size of your label printer, and whether to print the price.
- **Tax rates:** add your VAT rates (for example *Standard 18%*) **before creating products**, and
  mark one as the default.

When you change anything, the changed fields are marked **Edited** and a bar at the bottom shows
**Save changes** and **Discard**. Nothing is saved until you press **Save changes**. If you try to
leave with unsaved changes, the browser warns you.

### 5.2 Locations (Stock → Locations)

Build the map of your business once: sites, then floors, rooms, shelves and spaces inside them.
For example `Naxxar Garage › Room 1 › Shelf A › A1`.

- The shop's **display area** is a location too, so stock on display is counted.
- **Print a label for each space** and stick it on the shelf. Scanning that label later shows what
  is stored there, and it saves typing when adding or moving stock.
- Two special places exist automatically: **In Transit** and **Damaged**.

### 5.3 Categories (Stock → Categories)

Groups such as *Chairs*, *Shelving*, *Electronics*. They help you search and filter reports.

### 5.4 Products (Stock → Products → Add product)

Fill in the name, category, selling price, cost price, VAT rate, and a **minimum stock** level (the
system warns you when stock falls below it). Barcodes are created for you when you save.

- **Product with versions:** add one row for each colour or size, each with its own price.
- **Multi-box kit:** choose the **Multi-box kit** option, set one **kit price** (the customer pays
  for the complete kit; boxes have no price of their own), then add each **box**: what is inside,
  and **Boxes per kit** (how many of that box make one kit). The form shows the result, for example
  *One kit = 2 × Box A + 1 × Box B*. Each box gets its own barcode label.
- **Supplier barcode:** optional. Enter it if the item already has one.

After saving, press **Print labels** to make a PDF of barcode stickers for the items or boxes.
Products are never deleted, only made inactive, because old invoices refer to them.

### 5.5 Loading many products or your current stock (Admin → Import from Excel)

1. Choose **Products** or **Opening stock** and download the template.
2. Fill it in with Excel.
3. Upload it. The system **checks** the file first and shows any problem rows. Fix them and upload
   again, then confirm the import.

### 5.6 People (Admin → Users)

Create a login for each person and choose their role. When someone leaves, **deactivate** them
instead of deleting: they are blocked immediately and the history keeps their name.

---

## 6. Daily stock work

### 6.1 Scanning (Scan)

Scan a **product** to see its name, price, photo, stock in every location, and shortcut buttons:
**+ Add**, **Remove**, **Move**, **Details & history**, **Sell (POS)**. Scan a **location label** to
see what is stored there.

A short beep and vibration confirms a good scan. A different sound and an error message mean the
code is not recognised.

### 6.2 Adding, removing and moving stock (Stock → Update stock)

There are three tabs. Pick the item first (scan it or search by name). A panel beside the form shows
where that item is right now and updates after every save.

| Tab | Use it for | Choose |
|---|---|---|
| **Add** | Stock arriving: a supplier delivery, a return, found items | The location, quantity, a reason (*New purchase, Return, Found, Other*), optional reference such as the supplier invoice number |
| **Remove** | Stock leaving for any reason **other than a sale** | The location it is taken from, quantity, a reason (*Damaged, Lost, Expired, Manual adjustment, Other*). *Damaged* moves it to the Damaged location. *Other* and *Damaged* need a note |
| **Move** | Moving stock from one place to another, e.g. garage → shop display | From, To and quantity. It happens immediately |

Notes:

- You cannot remove or move more than is available in that place.
- For a **kit**, every box is added, moved or removed together.
- Sales are done in **POS**, and order items are taken by **picking**. Do not use *Remove* for those.

### 6.3 Sending stock to another site, step by step (Stock → Transfers)

Use this when stock travels between sites.

1. **Send:** press **+ Send stock**, choose **From (where it is now)** and **To (where it is
   going)**, add the items, and press **Send — items leave stock here**. The items leave the shelf
   and show as **on the way** (In Transit). They are not counted at either end.
2. **Receive:** open the transfer at the destination and scan each item as it arrives (or type the
   numbers), then confirm.
3. If only part arrives, the rest stays on the way. A manager can write off what never arrives,
   with a reason.

### 6.4 Counting stock (Stock → Stocktake)

1. Choose **Count this location (and everything inside it)**, then press **Start counting**. The
   system lists what it expects there. Only one stocktake can be open per area.
2. Scan or count what is really on the shelves.
3. Items you did not count must be confirmed as **not found** (counted as 0) before you can submit.
4. An **admin or manager reviews the differences and presses Approve & correct stock**. Only then
   are the corrections made, each as its own recorded movement. They can also reopen the count if
   something looks wrong.

Selling or moving something while a count is in progress is handled correctly: each item's
difference is measured from what the system held *at the moment that item was counted*.

### 6.5 Low stock (Stock → Low stock)

Lists products where the **available** quantity is below the product's minimum. Kits count
complete kits. The count also shows on the dashboard.

### 6.6 Stock history (Stock → Stock history)

Every movement ever made: what, how many, from where to where, who and when. Filter by type. It
cannot be edited or deleted.

---

## 7. Selling at the counter

### 7.1 Making a sale (Sell → POS / Sell)

1. At the top, check **Selling from** shows your shop. (It is locked once the basket has items.)
2. **Scan** each item, or press **Search by name instead**.
3. A window asks **"Taken from which space?"** Tap the space you took the item from. Spaces show how
   many are left; empty ones are greyed out. If an item has none at this shop, the window says so
   and tells you which other sites have it. Move it here first (section 6.2 or 6.3).
4. The item appears in the basket. Use **−** and **+** to change the quantity (**+** asks for the
   space again, since the extra one may come from another shelf).
5. Optionally enter a **Discount %** for a line. Above the limit set in Settings, a manager must
   approve it.
6. For a **kit**, scan every box. The line shows which boxes are done (✓) and which are missing
   (○). **Charge** stays disabled — it reads "Scan all boxes first" — until the kit is complete.
7. Press **Charge** at the bottom. It shows VAT and the total.
8. In **Payment**, choose how the customer pays (cash with change, card, bank transfer, other; a
   payment can be split) and confirm.

The **Sale complete** window shows the invoice. Press **Download (PDF)** to save it, or print the
receipt. Invoice numbers are sequential (`INV-000001`, `INV-000002`, …) with no gaps, and an
invoice can never be changed.

Stock is reduced at the exact space you chose, in the same moment the sale is recorded.

### 7.2 Looking up a sale (Sell → Sales)

Lists every invoice. Open one to see the items, VAT and payment, and to download the PDF.

### 7.3 Customer returns (Sell → Returns → New return)

1. Find the invoice: scan the barcode at the bottom of the receipt, or type the invoice number.
2. Choose the items and quantities coming back. You cannot return more than was sold minus what has
   already been returned.
3. Choose the **condition** for each line:
   - **Good — back to stock** — choose the space it goes back to (it starts on the shelf it was
     sold from). It becomes available again.
   - **Damaged** — it goes to the Damaged location.
4. Choose how the customer is refunded.
5. The system creates a **credit note** attached to the invoice. The invoice itself is not changed.

---

## 8. Orders and deliveries

### 8.1 The whole journey

| Step | Who | Where | Order status afterwards |
|---|---|---|---|
| 1. Create the order | Admin / Manager | Orders → New order | **New** |
| 2. Reserve stock | Admin / Manager | The order → **Reserve stock…** | **Allocated** |
| 3. Pick and load | Warehouse (or anyone with stock rights) | The order → **Start picking** | **Picking**, then **Loaded** |
| 4. Assign a driver | Admin / Manager | The order → **Driver** list | (unchanged) |
| 5. Start delivery | Driver | Deliveries → the order → **Start delivery** | **Out for delivery** |
| 6. Deliver | Driver | The same screen → **Delivered** | **Delivered** |
| If it fails | Driver | **Couldn't deliver** | **Failed** → later **Returned** |

### 8.2 Creating an order

**Manually:** Orders → **New order**. Enter the customer's name, phone, address (and a map link if
you have one), delivery date and time window, a note for the driver, and how they pay (**Paid**,
**Not paid**, or **COD** with the amount to collect). Add the items by scanning or searching. Kits
are ordered as a whole kit, never a single box.

**From the website:** orders arrive automatically and look the same as manual ones. If one cannot
be imported (usually because a product's SKU does not match), nothing is lost. It appears under
**Orders → Website order problems** with the reason. Fix the cause (for example add the SKU), then
press **Retry**.

### 8.3 Reserving stock

Open the order and press **Reserve stock…**. The system suggests where to take each item from. It
prefers sites that can cover more of the order, so the driver visits fewer places. You can accept
the suggestion or choose different spaces, then confirm. The stock becomes **Reserved** and the
order's **Pick list** appears.

Made a mistake? Press **Change reservation** (possible until picking starts).

### 8.4 Picking and loading

This is the warehouse step: collecting the items and putting them on the van, scanning each one.

1. On the order, press **Start picking** (or **Continue picking**). The Pick page opens. The counter
   at the top (for example **1/3**) and the progress bar show how much is done.
2. The list is grouped by site and shows the item, its photo and its shelf.
3. In **I'm at**, choose the place where you are standing.
4. In **Scan each item / box**, scan the item (or use the camera button). The row's count goes up
   and finally shows ✓.
5. When every row has a ✓ the page says **"All picked and loaded — the items are now In Transit"**
   and the order becomes **Loaded**.

**What the system will stop you doing**

| You scan | The system says |
|---|---|
| Something not on the order | *Wrong item* |
| A box from a different kit | *Wrong box* |
| More than the order needs | *Already picked* |
| The right item from the wrong shelf | *Wrong location*, with a **Manager override…** button. A manager types their login and password and a reason, and the stock records are corrected |

Every refused scan is saved and appears in the **Picking errors** report.

**If something is truly missing:** once at least one item is picked, **Something is missing —
finish without it (manager)** appears. A manager approves it with a reason. The order is marked
**Loaded** with fewer items and the missing items' reservations are released.

### 8.5 Assigning a driver

On the order, choose the person in the **Driver** list. A driver sees only the orders assigned to
them. The driver can be changed until the order is finished.

### 8.6 The driver's day (Deliveries)

**Deliveries** is the driver's to-do list, grouped as **To collect**, **On the van** and **Failed**.
Tap an order to open its screen. It shows:

- **Call** (rings the customer) and **Directions** (opens the map),
- the address, phone number and any **note for the driver**,
- the payment: for COD a red panel says **Collect €…**,
- what to **collect** and what is **on the van**.

Then:

1. Press **Start delivery**. The status becomes *Out for delivery*.
2. At the door, press **Delivered**. A window asks for:
   - **Cash collected** (required for COD),
   - **Received by** (optional), a **photo** (optional) and a note (optional),
   - you can also scan items as you hand them over, as a check.
3. Confirm. The items leave stock and the order is **Delivered**.

**If the customer takes only part of the order:** untick what they did not take. A **manager must
approve** (their email or phone and password) and a reason is required. The rest stays on the van
until it is returned.

**If you cannot deliver:** press **Couldn't deliver** and choose *Customer not home*, *Customer
refused* or *Wrong / can't find address*, with a note and optional photo. The order becomes
**Failed** and the goods **stay on the van**. Then either:

- press **Try again — out for delivery**, or
- bring the goods back and scan each one in (next section).

**Any problem on the road** (a missing or damaged box, anything else): press **Report a problem**.
Add a note and a photo. It is saved permanently and does not change the order's status.

### 8.7 Bringing items back

For a failed, cancelled or partly delivered order, a **return scanner** appears on the delivery
screen. Scan each item still on the van and choose:

- **Good** — and the shelf it goes back to, or
- **Damaged** — it goes to the Damaged location.

When the last item of a failed order is scanned back, the order becomes **Returned**.

### 8.8 Cancelling an order

Press **Cancel order** and give a reason. Reservations are released immediately. **Anything already
loaded on a van stays In Transit until it is scanned back in** — it never silently reappears on a
shelf.

---

## 9. Reports, dashboard and history

### 9.1 Dashboard

The home page shows today's sales, low-stock items, number of products and units in store, today's
orders and how many are waiting to be picked, orders ready for delivery, orders out for delivery,
failed deliveries, and the latest stock movements. A red banner appears if website orders could not
be imported.

### 9.2 Reports (Admin → Reports)

Filter by date, product, location, person or category, and press the download button to get an
**Excel** file.

| Group | Reports |
|---|---|
| **Sales** | Sales (invoices) · POS sales by day · Daily summary by channel · Sales by cashier · Sales by product · Returns |
| **Stock** | Inventory · Stock by location · Low stock · Stock movements · Damaged stock · Stocktake differences · Incomplete kits |
| **Orders & deliveries** | Orders · On the vans / in transit · Deliveries (including cash collected against expected) |
| **Control** | Picking errors · Overrides & approvals |

### 9.3 Audit log (Admin → Audit log)

Every change and every approval: who, what and when. It cannot be edited or deleted.

---

## 10. Rules the system enforces

These protect your stock and your records. They are not bugs.

- **Nothing is deleted.** Products become inactive, people are deactivated, and orders are
  cancelled. History always remains.
- **Movements and invoices can never be edited.** Corrections are new records (a credit note, an
  adjustment), so there is a trail.
- **Two people cannot take the same last unit.** The system locks the stock while it is being
  changed.
- **You cannot remove, move or sell more than is there.**
- **Exceptions need a manager and a reason.** Wrong shelf, missing items, a partial delivery and a
  large discount are all logged with who approved them.
- **A cancelled order's loaded items come back only by scanning them in.**
- **Each person is limited by role, and optionally by site.**

---

## 11. A typical day, by job

### Cashier / salesperson

1. Sign in, open **POS / Sell**, check **Selling from**.
2. Scan each item, choose the space, set quantities, press **Charge**, take payment, **Download
   (PDF)** or print the receipt.
3. For a return, use **Returns → New return** and scan the receipt's barcode.
4. If stock arrives or moves, use **Update stock**.

### Warehouse

1. Open **Orders** and find the ones that are **Allocated**.
2. Press **Start picking**, choose **I'm at**, scan each item until every row has a ✓.
3. Receive transfers and add arriving stock with **Update stock**.
4. When asked, run a **Stocktake** of a shelf or room.

### Driver

1. Open **Deliveries**. Check **To collect** and **On the van**.
2. For each stop: **Call** or **Directions**, **Start delivery**, then **Delivered** (enter the cash
   for COD) or **Couldn't deliver**.
3. Report any problem with **Report a problem**, with a photo.
4. At the end of the day, scan back anything still on the van.

### Manager / admin

1. Check the **Dashboard**: low stock, orders waiting, failed deliveries, website order problems.
2. Create orders, **Reserve stock…**, and assign drivers.
3. Approve exceptions when staff ask (override, missing items, partial delivery, discount).
4. Approve stocktake differences.
5. Review **Reports** and the **Audit log**; manage **Users** and **Settings**.

---

## 12. Questions and problems

**The POS says "None in stock at [shop]" after I scan.**
That item has no stock recorded at the shop you are selling from. The message also lists the other
sites that have it. Move it to your shop (Update stock → Move, or Transfers) or add the stock
(Update stock → Add), then scan again. If you are selling from the wrong shop, change **Selling
from** before adding items.

**A product shows zero everywhere.**
A new product has no stock until you add some: **Update stock → Add** → choose the location.

**I scanned the wrong thing in POS.**
Press **Remove** on that basket line (or **−**) before charging. After the sale, use a return.

**The camera won't open.**
Check the address begins with `https://`, and that camera permission is allowed for the site in
the browser's settings.

**A scan says the code is unknown.**
The code is not on any product. Check the label is from this system, or add the supplier's barcode
to the product.

**I can't see a menu item or button that someone else can.**
Your role does not allow it (section 3). Ask an admin if you need more access.

**A box is missing from an order.**
In picking, scan what you can, then use **Something is missing — finish without it (manager)**. A
manager approves it and the missing item is released. Also use **Report a problem** so the loss is
recorded.

**The customer wants a different quantity at the door.**
Use **Delivered** with only the items they accept; a manager must approve a partial delivery.

**Stock on the screen doesn't match the shelf.**
Run a **Stocktake** for that area. Differences are corrected only after a manager approves, and the
correction is recorded.

**I forgot my password.**
An admin or manager can set a new one for you under **Users**.

**Something looks wrong with a number.**
Open **Stock history** or **Audit log** and look at the movements for that item. They show exactly
who changed what, when, and why.
