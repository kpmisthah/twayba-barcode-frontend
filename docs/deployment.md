# Deploying Twayba Inventory (Vercel + Render)

The **website** (Next.js) runs on **Vercel**. The **API** (NestJS) and its **PostgreSQL database** run
on **Render**. Both give you `https://` addresses automatically, which phones need for the camera.

```
 Phone / PC browser
        │  https://twayba.vercel.app            ← the only address people use
        ▼
 ┌───────────────┐   /api/*  and  /uploads/*   ┌──────────────────┐      ┌──────────────┐
 │ Vercel        │ ──────────────────────────► │ Render web       │ ───► │ Render       │
 │ Next.js app   │      (forwarded, same site)  │ NestJS API       │      │ PostgreSQL   │
 └───────────────┘                              │ + disk (photos)  │      └──────────────┘
                                                └──────────────────┘
```

The browser only ever talks to Vercel. Vercel forwards `/api/…` and `/uploads/…` to Render
(see `frontend/next.config.ts`). That means there are **no cross-site (CORS) problems** and photo
links keep working.

> **Before you start:** the code must be on GitHub (or GitLab / Bitbucket), because both Vercel and
> Render deploy from a repository. Both folders (`frontend`, `backend`) stay in the one repository.

---

## 1. Create the database (Render)

1. Render dashboard → **New +** → **PostgreSQL**.
2. Name: `twayba-db`. **Region: Frankfurt** (closest to Malta; must match the API's region).
3. Choose a **paid plan** for real use (see [Plans and costs](#plans-and-costs)).
4. Create it, wait until it says **Available**, then keep this page open. You need two addresses
   from its **Connect** menu:
   - **Internal Database URL** — for the API (fast, private).
   - **External Database URL** — only for creating the first admin from your own PC (step 3).

## 2. Deploy the API (Render)

**Easiest: use the blueprint** in the repository root (`render.yaml`).

1. Render → **New +** → **Blueprint** → connect the repository → pick the branch → **Apply**.
2. Render asks for the values marked "sync: false". Fill them in:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | The database's **Internal Database URL** |
   | `WEB_ORIGIN` | Your Vercel address, e.g. `https://twayba.vercel.app` (add it after step 4 if you don't know it yet) |
   | `SEED_ADMIN_EMAIL` | The first administrator's email |
   | `SEED_ADMIN_PASSWORD` | A strong password (they change it after first login) |
   | `WEBHOOK_SECRET` | Optional. Only if the website will send orders. Leave empty otherwise |

3. The first build takes a few minutes. When it shows **Live**, open
   `https://<your-service>.onrender.com/api/health`. You should see `{"status":"ok"}`.

<details>
<summary>Or create the service by hand instead of the blueprint</summary>

Render → **New +** → **Web Service** → pick the repository, then:

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Runtime | Node |
| Region | Frankfurt |
| Build Command | `npm ci --include=dev && npx prisma generate && npm run build` |
| Start Command | `npx prisma migrate deploy && node dist/main` |
| Health Check Path | `/api/health` |
| Disk | Name `uploads`, Mount Path `/var/data`, 1 GB |

Environment variables: `NODE_VERSION=22`, `DATABASE_URL`, `JWT_SECRET` (any long random string),
`JWT_EXPIRES_IN=12h`, `WEB_ORIGIN`, `UPLOAD_DIR=/var/data/uploads`, `TRUST_PROXY_HOPS=1`,
`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, and optionally `WEBHOOK_SECRET`.

</details>

**What happens on every deploy:** the start command runs `prisma migrate deploy`, which applies any
new database changes, and then starts the API. You never run migrations by hand.

## 3. Create the first administrator

The database is empty, so nobody can log in yet. Run the seed **once**, from your own PC, against
the **External Database URL**. Add `?sslmode=require` to the end of that URL.

PowerShell:

```powershell
cd backend
$env:DATABASE_URL = "postgresql://USER:PASSWORD@HOST.frankfurt-postgres.render.com/twayba?sslmode=require"
$env:SEED_ADMIN_EMAIL = "owner@example.com"
$env:SEED_ADMIN_PASSWORD = "a-strong-password"
npm run db:seed
```

Git Bash / macOS / Linux:

```bash
cd backend
DATABASE_URL="postgresql://USER:PASSWORD@HOST.frankfurt-postgres.render.com/twayba?sslmode=require" \
SEED_ADMIN_EMAIL="owner@example.com" SEED_ADMIN_PASSWORD="a-strong-password" \
npm run db:seed
```

It prints `Created admin …`. Running it again is harmless (it does nothing if an admin exists).
The API must have been deployed at least once first, so the tables exist.

## 4. Deploy the website (Vercel)

1. Vercel → **Add New… → Project** → import the repository.
2. **Root Directory:** `frontend` (click *Edit* next to it). Framework: **Next.js** (detected).
3. **Environment Variables** — add before deploying:

   | Name | Value |
   |---|---|
   | `BACKEND_URL` | `https://<your-service>.onrender.com` — **no trailing slash, no `/api`** |

   Add it for **Production** (and **Preview** if you use preview deployments).
4. **Deploy.** You get an address like `https://twayba.vercel.app`.

> `BACKEND_URL` is read **when the site is built**. If you ever change it, press **Redeploy**.

## 5. Connect the two

1. Back on Render → the API → **Environment** → set `WEB_ORIGIN` to the exact Vercel address
   (e.g. `https://twayba.vercel.app`, no trailing slash). Save; Render restarts the API.
   If you add a custom domain later, add it too, separated by a comma:
   `https://twayba.vercel.app,https://inventory.twayba.com`.
2. Open the Vercel address and sign in with the administrator from step 3.

## 6. Checklist — is it working?

- [ ] `https://<api>.onrender.com/api/health` shows `{"status":"ok"}`
- [ ] The Vercel address shows the sign-in page, and signing in works
- [ ] **Settings** loads, and saving a change works
- [ ] Add a product with a photo, reload, and the photo is still there
- [ ] On a phone, **Scan** opens the camera (this needs `https://`, which Vercel provides)
- [ ] Change the administrator's password under **My account**

---

## Uploaded photos

Product images and delivery photos are saved as files on the API server's disk. On Render the
normal disk is **erased on every deploy and restart**, so the API needs a **persistent disk**
(the blueprint adds one at `/var/data`, with `UPLOAD_DIR=/var/data/uploads`).

- Persistent disks are available **only on paid Render services**.
- A service with a disk runs as a **single instance** (fine for this app) and has a short pause
  while redeploying.
- On the free plan, photos would disappear regularly. If you must start free, remove the `disk`
  block and expect to re-upload photos; move to a paid plan before going live.

If the shop later outgrows one disk, the clean solution is object storage (S3, Cloudflare R2).
That is a code change in `backend/src/uploads/`; ask for it when needed.

## Plans and costs

Prices and limits change, so check [render.com/pricing](https://render.com/pricing) and
[vercel.com/pricing](https://vercel.com/pricing) before you commit. The points that matter here:

| | Free | Paid (recommended for the client) |
|---|---|---|
| **Render web service** | Goes to sleep after ~15 min idle; the next request waits about a minute to wake it. No disk. | Always on. Persistent disk available. |
| **Render PostgreSQL** | Time-limited and not meant for real data. | Backups included at paid levels. |
| **Vercel** | The **Hobby** plan is for personal, **non-commercial** use only. | Use **Pro** for a business. |

For a working shop use a paid Render web service + disk, a paid Render database, and Vercel Pro.

## Backups

- **Database:** use a Render PostgreSQL plan that includes backups, and confirm in the dashboard
  that they are on. The project requirement is a **daily backup**.
- **Photos:** keep the disk's snapshots enabled in Render, and test restoring once.
- Take a manual copy before big changes (Render → database → **Backups**).

## The website sending orders (optional)

If the e-commerce website will send orders, give its developer this address, which goes straight
to the API:

```
POST https://<your-service>.onrender.com/api/webhooks/orders
```

with the header `X-Webhook-Secret` set to your `WEBHOOK_SECRET`. The full format is in
[website-webhook.md](website-webhook.md).

## Updating the app later

Push to the branch you connected. Vercel and Render both deploy automatically (Render also applies
new database migrations). To roll back, use **Deployments → Redeploy** on an older version in
Vercel, or **Deploys → Rollback** in Render. A rollback does not undo database migrations, so
take a backup before deploying a change that alters the database.

## Troubleshooting

| What you see | Likely cause | Fix |
|---|---|---|
| Sign-in page loads, but login says "Failed to fetch" or the page keeps loading | `BACKEND_URL` is wrong or was set after the build | Check it in Vercel (no trailing slash, no `/api`), then **Redeploy** |
| `/api/health` is slow the first time | Render free plan is waking up | Use a paid plan |
| Logging in works but pages say "Not allowed" or the browser shows a CORS error | `WEB_ORIGIN` doesn't exactly match the website address | Fix it on Render (include `https://`, no trailing slash) |
| Build fails: `prisma: not found` | Dev tools weren't installed | Build command must include `--include=dev` |
| API crashes on start: `P1001 Can't reach database` | Wrong `DATABASE_URL`, or the API and database are in different regions | Use the **Internal** URL, and the same region for both |
| Seed from your PC says `P1001` or an SSL error | External URL without SSL | Add `?sslmode=require` |
| "Too many attempts" at login for several people | Rate limit shared because the server can't see real visitor addresses | Make sure `TRUST_PROXY_HOPS=1` is set on Render |
| Photos disappear after a deploy | No persistent disk | See [Uploaded photos](#uploaded-photos) |
| Camera won't open on a phone | Page isn't `https://`, or camera permission was denied | Use the `https://` address; allow the camera in the browser's site settings |

## Environment variables, in one place

**Render (API)**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection (Internal URL) |
| `JWT_SECRET` | Signs login tokens. Long and random. Changing it logs everyone out |
| `JWT_EXPIRES_IN` | How long a login lasts. Default `12h` |
| `WEB_ORIGIN` | Allowed website address(es), comma-separated |
| `UPLOAD_DIR` | Where photos are stored. `/var/data/uploads` on the disk |
| `TRUST_PROXY_HOPS` | Proxies in front of the API: `1` on Render, `0` locally |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Used only by `npm run db:seed` |
| `WEBHOOK_SECRET` | Shared secret for website orders. Empty = switched off |
| `NODE_VERSION` | `22` |

**Vercel (website)**

| Variable | Purpose |
|---|---|
| `BACKEND_URL` | The API's address. Read at build time |
