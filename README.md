# OHS Store — Simplified Version

Online ordering for the Ottawa High School Store, with a private owner dashboard for
Mr. Setzer. It keeps the original Google Form's products, options, prices and designs,
in a cleaner, mobile-friendly layout.

- **Storefront** (`/`): shop, item customizer with a live preview, all 13 Cyclones
  designs, Accessories / Others requests, the Christmas collection, cart, checkout,
  and order tracking.
- **Customizer extras:**
  - Different designs on the front and back, with both sides previewed together and
    a "same as front" shortcut.
  - Several sizes in one go for team and group orders.
  - Optional custom text (a name, number or class year) on the back, front or a
    sleeve. It goes to Requests for approval and can be turned off in Settings.
  - A button that always shows the next step still missing.
  - "Duplicate" in the cart.
- **Owner dashboard** (`/admin`): a Command Center plus orders, customers, customer
  requests (approve or decline, set quotes), products and pricing, designs, the Christmas
  collection, store open/closed, announcements, and CSV export and backups.
  - **Command Center** (the home page): sales, orders, average order and items sold for
    Today / 7 / 30 / 90 days / all time, each compared with the previous period; money
    collected vs. still owed; a daily sales chart (hover a day for its numbers); the order
    pipeline; best sellers (by units or sales), top designs, sales by category and sizes
    ordered; latest activity; top customers; and a **Needs attention** list (requests to
    approve, new orders waiting over 2 days, unpaid ready or picked-up orders, a closed
    store, unfinished setup) with a one-click link to each.
  - **Orders:** filter by status, unpaid or needs review; sort; tick several orders to
    change their status or mark them paid in one go; or switch to the **Board** and drag
    orders between New → In progress → Ready for pickup → Picked up (arrow buttons on
    phones).
  - **Customers:** everyone who has ordered, grouped by email, with orders, items, total
    spent and anything still owed; open one to see all their orders.
  - **Quick find** in the sidebar: type an order number to jump straight to it, or a
    name, email or phone to search orders.
  - All the numbers are worked out in the browser from the orders the dashboard already
    loads, so the server and the saved data format did not change.

There is nothing to install beyond Node.js. The server has no third-party packages.

## Run it

1. Install **Node.js 22 or newer** (https://nodejs.org).
2. In this folder, run:

   ```
   node server.js
   ```

3. Open http://localhost:3000. The dashboard is at http://localhost:3000/admin.

**First-time password:** the first start prints a one-time owner password in the
terminal. Sign in with it, then change it under **Settings → Password**. To choose the
first password yourself, start with `ADMIN_PASSWORD="your password" node server.js`
instead.

**Forgot the password?** Stop the server, run
`node scripts/set-password.js "new password"`, and start it again.

**Settings:**

| Variable | What it does |
|---|---|
| `PORT` | Port to listen on (default 3000). You can also use `node server.js --port 8080`. |
| `DATA_DIR` | Where orders and settings are saved (default `./data`). |
| `TRUST_PROXY=1` | Set this when the server runs behind a hosting provider's HTTPS proxy, so client IPs and HTTPS are detected. |
| `COOKIE_SECURE=1` | Forces Secure sign-in cookies. Set it whenever the site is served over HTTPS. |

## Where the data lives

Everything is stored in `data/`:

- `data/store.json`: orders, products, prices, designs and settings. It's written
  atomically after every change.
- `data/backups/`: an automatic daily copy, keeping the last 30 days.
- `data/uploads/`: images uploaded from the dashboard (design artwork, holiday product
  photos) and reference images customers attach.

**Back up the `data/` folder.** From the dashboard you can also download all orders as
a spreadsheet (CSV) and a full backup under **Settings → Your data**.

To restore, stop the server, put a `store.json` back into `data/`, and start it again.

## How ordering works

1. **Customers place an order.** They pick items, check out with their name, email
   and phone, and get an order number such as `OHS-7K2M9Q`.
2. **The server sets the prices.** It recalculates every price from the current
   catalog and never trusts prices sent by the browser.
3. **Custom choices wait for approval.** Any "Other" color or design, Bring Your Own
   Apparel, or an Accessories / Others request appears under **Requests** for the
   owner to approve or decline. Accessories also need a price.
4. **Customers track their order.** **Track order** (order number + email) shows the
   status, what the store approved, and any message from the owner.
5. **The owner moves orders along.** Statuses go **New → In progress → Ready for
   pickup → Completed** (or Cancelled). The owner can mark orders paid and keep
   private notes, and every change is logged in the order's history.

## Security

- **Password:** the owner password is stored only as a salted scrypt hash.
- **Sign-in:** sessions are random tokens in `HttpOnly`, `SameSite=Strict` cookies that
  expire after 12 hours. Changing the password signs out every other device.
- **Lockout:** after 5 wrong passwords in 15 minutes, sign-in is locked for that
  network address. Orders, uploads and order lookups are rate-limited too.
- **Request checks:** cross-site requests are refused, and dashboard changes need a
  same-origin header.
- **Content Security Policy:** no inline scripts are allowed. All customer text is
  escaped before display.
- **Uploads:** only PNG, JPG and WebP images up to 4 MB are accepted. The file's real
  content is checked, not just its name, and SVG is refused.
- **Private files:** only the public folders (`css/`, `js/`, `images/`, `admin/`) are
  served. `data/`, `lib/` and the server code are never reachable from a browser.
- **Automated check:** `node test/api-test.js` runs 37 checks covering pricing,
  validation, access control, CSRF, uploads, rate limits and persistence. It uses a
  throwaway data folder.

## ⚠ Needs setup outside this code

These items need a decision or an account that the code can't provide:

1. **Hosting.** The site needs a computer or service that stays on, runs Node.js, and
   keeps the `data/` folder between restarts. Options:
   - A school server (talk to USD 290 IT).
   - A small VPS.
   - A host with a persistent disk, such as Render, Railway or Fly.io.

   Free "serverless" hosts that wipe files on each deploy will lose orders.
2. **HTTPS and a domain.** The owner password must only be used over HTTPS. Most hosts
   provide HTTPS automatically. Then set `COOKIE_SECURE=1` (and `TRUST_PROXY=1` when
   behind the host's proxy).
3. **District approval.** The store collects students' names, emails and phone
   numbers. Check with USD 290 IT and administration about data privacy rules before
   going live.
4. **Email notifications are not included.** Customers see updates through Track
   order, and the dashboard checks for new orders every minute. Automatic emails, such
   as "your order is ready", need an email service account (the school's Google
   Workspace SMTP, or SendGrid or Mailgun) and a small addition to the server.
5. **Online payment is not included.** The original form had no payments, so orders
   are paid in person and marked **Paid** in the dashboard. Card payments would need a
   Square or Stripe account.
6. **Artwork.** The 13 designs in `images/designs/` were rebuilt from screenshots of
   the old form. They are sharp, but the two Sam Shields lost some fine mascot detail.
   Replace any of them with the original artwork files, using the same file name, or
   upload them from **Products & pricing → Designs**.
7. **Product photos.** The old form had none, so garments appear as shaded drawings.
   Christmas collection items take real photos, uploaded from the dashboard.

## Folder map

| Path | What's in it |
|---|---|
| `server.js` | Web server and every API route |
| `lib/` | `db.js` (storage and backups), `auth.js` (passwords, sessions, rate limits), `orders.js` (pricing and validation), `seed.js` (the original catalog) |
| `index.html`, `css/`, `js/` | Storefront |
| `admin/` | Owner dashboard (`insights.js` holds the Command Center calculations) |
| `images/designs/` | Design artwork |
| `scripts/set-password.js` | Password reset |
| `test/api-test.js` | Automated end-to-end check |
| `test/insights-test.js` | Checks the Command Center math (`node test/insights-test.js`) |
| `docs/screenshots/` | Dashboard screenshots on desktop and phone, taken from a demo copy with sample orders |
| `tools/enhance-designs.py` | How the artwork was rebuilt from the screenshots |
