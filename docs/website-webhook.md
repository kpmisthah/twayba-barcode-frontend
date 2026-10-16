# Sending website orders to Twayba Inventory

When a customer places an order on the website, the website's backend sends it to the inventory
system with one HTTPS request. Stock is **not** synced back to the website.

## Request

```
POST https://<inventory-server>/api/webhooks/orders
Content-Type: application/json
X-Webhook-Secret: <shared secret>
```

The shared secret is the `WEBHOOK_SECRET` value in the inventory backend's `.env`. Keep it on the
website's server only — never in browser code.

```json
{
  "externalId": "10045",
  "customerName": "Maria Borg",
  "customerPhone": "+356 7900 0000",
  "address": "12, Triq il-Kbira, Hamrun",
  "latitude": 35.8847,
  "longitude": 14.4846,
  "notes": "Call before arriving",
  "paymentStatus": "PAID",
  "codAmount": null,
  "deliveryDate": "2026-10-14",
  "timeWindow": "14:00–17:00",
  "items": [
    { "sku": "CHAIR-BLK", "quantity": 4, "price": 49.5 },
    { "sku": "KIT-SHELF", "quantity": 1, "price": 120 }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `externalId` | yes | The website's order id. Sending the same id again does **not** create a second order. |
| `customerName` | yes | |
| `customerPhone`, `address`, `notes` | no | |
| `latitude`, `longitude` | no | Map pin for the driver. |
| `paymentStatus` | no | `PAID`, `UNPAID` or `COD` (cash on delivery). Default `UNPAID`. |
| `codAmount` | no | Amount the driver collects, for `COD`. |
| `deliveryDate` | no | `YYYY-MM-DD`. |
| `timeWindow` | no | Free text, e.g. `"14:00–17:00"`. |
| `items[].sku` | yes | The product's **SKU in the inventory system** (or one of its barcodes). For multi-box products use the **kit's SKU** — the system knows its boxes. |
| `items[].quantity` | yes | Whole number ≥ 1. |
| `items[].price` | no | Price charged on the website, kept for reference. |

## Responses

| Status | Meaning | What the website should do |
|---|---|---|
| `200` `{ "duplicate": false, "orderNumber": "ORD-000123", ... }` | Order created | Done. |
| `200` `{ "duplicate": true, "orderNumber": "ORD-000123", ... }` | Already received earlier | Done — safe to treat as success. |
| `401` | Wrong or missing secret | Check the secret. |
| `422` `{ "message": "Unknown SKU(s): ...", "unknownSkus": [...] }` | An item's SKU isn't in the inventory system | Fix the SKU mapping, then send again. Nothing was created. |
| `400` | Missing/invalid field | Fix the data. |
| `503` | Website orders are switched off (`WEBHOOK_SECRET` not set) | Ask the inventory admin to set it. |
| network error / `5xx` | Temporary problem | **Retry** (e.g. after 1, 5, 15 minutes). Retrying is always safe because of `externalId`. |

## Failed orders are kept

If an order can't be imported (unknown SKU, missing field…), the response is an error **and** the
order is stored in the inventory system under **Orders → Website order problems**, with the exact
data received and the reason. A manager fixes the cause (e.g. adds the SKU) and presses **Retry**,
or the website simply sends the same `externalId` again — the problem then closes by itself.
Nothing is lost and nothing changes stock until the order imports.

## Test with curl

```bash
curl -X POST https://<inventory-server>/api/webhooks/orders \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: <secret>" \
  -d '{"externalId":"TEST-1","customerName":"Test","items":[{"sku":"CHAIR-BLK","quantity":1}]}'
```

The order then appears in the inventory system under **Orders** with status *New*, ready for a
manager to allocate stock.
