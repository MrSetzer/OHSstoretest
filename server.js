// OHS Store server — storefront, order API and the owner dashboard.
// Zero dependencies: needs only Node.js 22 or newer.
//   node server.js            (port 3000, or PORT=xxxx)
//   node server.js --port 8737

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("./lib/db");
const auth = require("./lib/auth");
const O = require("./lib/orders");

const ROOT = __dirname;
const argPort = process.argv.indexOf("--port");
const PORT = Number(argPort > -1 ? process.argv[argPort + 1] : process.env.PORT || 3000);
const TRUST_PROXY = process.env.TRUST_PROXY === "1";   // behind a host's HTTPS proxy
const FORCE_SECURE = process.env.COOKIE_SECURE === "1";

const state = db.load();
firstRunPassword();

// ---------- helpers ----------
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".md": "text/plain; charset=utf-8", ".ico": "image/x-icon" };

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const payload = isBuf || typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": isBuf || typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(payload);
}
const ok = (res, body) => send(res, 200, body);
const err = (res, status, message) => send(res, status, { error: message });

function clientIp(req) {
  if (TRUST_PROXY && req.headers["x-forwarded-for"]) return req.headers["x-forwarded-for"].split(",")[0].trim();
  return req.socket.remoteAddress || "?";
}
const isSecure = (req) => FORCE_SECURE || (TRUST_PROXY && req.headers["x-forwarded-proto"] === "https") || req.socket.encrypted;

function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) { reject(new O.InputError("That's too large.")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch { reject(new O.InputError("Invalid request.")); }
    });
    req.on("error", reject);
  });
}

// Cross-site requests are refused: a browser always sends Origin on POSTs.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

function saveUpload(dataUrl, prefix) {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m) throw new O.InputError("Upload a PNG, JPG or WebP image.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 4 * 1024 * 1024) throw new O.InputError("Images must be 4 MB or smaller.");
  const ext = buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ? "png"
    : buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff ? "jpg"
    : buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP" ? "webp" : null;
  if (!ext) throw new O.InputError("That file isn't a valid image.");
  const name = `${prefix}-${crypto.randomBytes(12).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(db.UPLOADS, name), buf);
  return `uploads/${name}`;
}

function firstRunPassword() {
  if (state.admin) return;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString("base64url");
  state.admin = auth.hashPassword(password);
  db.save();
  if (!process.env.ADMIN_PASSWORD) {
    console.log("\n  ================================================================");
    console.log("  Owner dashboard first-time password:  " + password);
    console.log("  Sign in at /admin and change it under Settings.");
    console.log("  (Shown only once. Reset anytime: node scripts/set-password.js)");
    console.log("  ================================================================\n");
  }
}

const publicCatalog = () => {
  const c = state.catalog, active = (l) => l.filter((x) => x.active);
  return {
    catalog: { apparel: active(c.apparel), sizes: c.sizes, sizeTip: c.sizeTip, colors: active(c.colors), prints: active(c.prints),
      designs: active(c.designs), holiday: state.settings.holiday.enabled ? active(c.holiday) : [] },
    settings: { storeOpen: state.settings.storeOpen, closedMessage: state.settings.closedMessage, announcement: state.settings.announcement,
      contactEmail: state.settings.contactEmail, pickupInfo: state.settings.pickupInfo, accessoriesEnabled: state.settings.accessoriesEnabled,
      personalizationEnabled: state.settings.personalizationEnabled,
      holiday: state.settings.holiday }
  };
};

const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // keep spreadsheets from running formulas
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function ordersCsv() {
  const rows = [["Order", "Placed", "Status", "Paid", "Name", "Email", "Phone", "Item", "Details", "Qty", "Line total", "Request", "Quote (each)", "Item note", "Order notes", "Owner notes"]];
  for (const o of state.orders) for (const it of o.items) {
    rows.push([o.number, o.createdAt, o.status, o.paid ? "yes" : "no", o.contact.name, o.contact.email, o.contact.phone, it.title,
      it.details.map(([k, v]) => `${k}: ${v}`).join("; "), it.qty, it.lineTotal ?? "", it.review.status, it.review.quote ?? "", it.note, o.notes, o.adminNotes]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

// ---------- static files ----------
const STATIC_DIRS = ["css", "js", "images", "admin"];
function serveStatic(req, res, pathname) {
  let rel;
  if (pathname === "/") rel = "index.html";
  else if (pathname === "/admin" || pathname === "/admin/") rel = "admin/index.html";
  else if (pathname.startsWith("/uploads/")) {
    const name = pathname.slice(9);
    if (!/^[a-z]+-[a-f0-9]{24}\.(png|jpg|webp)$/.test(name)) return err(res, 404, "Not found");
    return file(res, path.join(db.UPLOADS, name), "public, max-age=86400");
  } else rel = decodeURIComponent(pathname.slice(1));
  const top = rel.split("/")[0];
  if (rel !== "index.html" && !STATIC_DIRS.includes(top)) return err(res, 404, "Not found");
  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(ROOT + path.sep)) return err(res, 404, "Not found");
  file(res, full, top === "images" ? "public, max-age=3600" : "no-cache");
}
function file(res, full, cache) {
  fs.stat(full, (e, st) => {
    if (e || !st.isFile()) return err(res, 404, "Not found");
    res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": TYPES[path.extname(full).toLowerCase()] || "application/octet-stream", "Cache-Control": cache, "Content-Length": st.size });
    fs.createReadStream(full).pipe(res);
  });
}

// ---------- API ----------
async function api(req, res, pathname) {
  const method = req.method;
  const ip = clientIp(req);
  if (method !== "GET" && !sameOrigin(req)) return err(res, 403, "Cross-site request refused.");

  // public
  if (pathname === "/api/catalog" && method === "GET") return ok(res, publicCatalog());

  if (pathname === "/api/orders" && method === "POST") {
    if (!auth.limit("order:" + ip, 15, 3600e3)) return err(res, 429, "Too many orders from this device. Try again later.");
    const body = await readJson(req, 64 * 1024);
    const order = O.buildOrder(body, state);
    state.orders.push(order);
    db.save();
    return send(res, 201, O.publicView(order));
  }

  if (pathname === "/api/orders/lookup" && method === "POST") {
    if (!auth.limit("lookup:" + ip, 30, 600e3)) return err(res, 429, "Too many lookups. Try again in a few minutes.");
    const body = await readJson(req, 4096);
    const number = String(body.number || "").trim().toUpperCase().replace(/^(?!OHS-)/, "OHS-");
    const email = String(body.email || "").trim().toLowerCase();
    const order = state.orders.find((o) => o.number === number && o.contact.email === email);
    if (!order) return err(res, 404, "We couldn't find an order with that number and email.");
    return ok(res, O.publicView(order));
  }

  if (pathname === "/api/uploads" && method === "POST") {
    if (!auth.limit("upload:" + ip, 20, 3600e3)) return err(res, 429, "Too many uploads. Try again later.");
    const body = await readJson(req, 6 * 1024 * 1024);
    return send(res, 201, { path: saveUpload(body.dataUrl, "ref") });
  }

  // owner
  if (pathname === "/api/admin/login" && method === "POST") {
    const key = "login:" + ip;
    if (!auth.limit(key, 5, 15 * 60e3)) return err(res, 429, "Too many attempts. Wait 15 minutes and try again.");
    const body = await readJson(req, 4096);
    if (!auth.verifyPassword(body.password, state.admin)) return err(res, 401, "That password isn't right.");
    auth.clearLimit(key);
    return send(res, 200, { ok: true }, { "Set-Cookie": auth.sessionCookie(auth.createSession(), isSecure(req)) });
  }

  if (!pathname.startsWith("/api/admin/")) return err(res, 404, "Not found");
  if (!auth.isAuthed(req)) return err(res, 401, "Please sign in.");
  // custom header: only same-origin scripts can set it
  if (method !== "GET" && req.headers["x-ohs-admin"] !== "1") return err(res, 403, "Request refused.");

  if (pathname === "/api/admin/me" && method === "GET") return ok(res, { ok: true });
  if (pathname === "/api/admin/logout" && method === "POST") {
    auth.endSession(req);
    return send(res, 200, { ok: true }, { "Set-Cookie": auth.sessionCookie("", isSecure(req)) });
  }
  if (pathname === "/api/admin/state" && method === "GET") {
    return ok(res, { catalog: state.catalog, settings: state.settings, orders: state.orders.map((o) => ({ ...o, ...O.totals(o) })) });
  }
  const m = /^\/api\/admin\/orders\/([0-9a-f-]{36})$/.exec(pathname);
  if (m) {
    const order = state.orders.find((o) => o.id === m[1]);
    if (!order) return err(res, 404, "Order not found.");
    if (method === "PATCH") {
      const log = O.applyOrderUpdate(order, await readJson(req, 64 * 1024));
      const now = new Date().toISOString();
      order.updatedAt = now;
      for (const text of log) order.history.push({ at: now, text });
      db.save();
      return ok(res, { ...order, ...O.totals(order) });
    }
    if (method === "DELETE") {
      state.orders = state.orders.filter((o) => o !== order);
      db.save();
      return ok(res, { ok: true });
    }
  }
  if (pathname === "/api/admin/catalog" && method === "PUT") {
    state.catalog = O.cleanCatalog((await readJson(req, 512 * 1024)).catalog);
    db.save();
    return ok(res, state.catalog);
  }
  if (pathname === "/api/admin/settings" && method === "PUT") {
    state.settings = O.cleanSettings((await readJson(req, 64 * 1024)).settings);
    db.save();
    return ok(res, state.settings);
  }
  if (pathname === "/api/admin/upload" && method === "POST") {
    const body = await readJson(req, 6 * 1024 * 1024);
    return send(res, 201, { path: saveUpload(body.dataUrl, "img") });
  }
  if (pathname === "/api/admin/password" && method === "POST") {
    const body = await readJson(req, 4096);
    if (!auth.verifyPassword(body.current, state.admin)) return err(res, 400, "Your current password isn't right.");
    if (typeof body.next !== "string" || body.next.length < 10) return err(res, 400, "Use at least 10 characters for the new password.");
    state.admin = auth.hashPassword(body.next);
    db.save();
    auth.endAllSessions();
    return send(res, 200, { ok: true }, { "Set-Cookie": auth.sessionCookie(auth.createSession(), isSecure(req)) });
  }
  if (pathname === "/api/admin/export/orders.csv" && method === "GET") {
    return send(res, 200, "﻿" + ordersCsv(), { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ohs-orders-${new Date().toISOString().slice(0, 10)}.csv"` });
  }
  if (pathname === "/api/admin/backup" && method === "GET") {
    const { admin, ...rest } = state;
    return send(res, 200, JSON.stringify(rest, null, 2), { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="ohs-store-backup-${new Date().toISOString().slice(0, 10)}.json"` });
  }
  return err(res, 404, "Not found");
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try { pathname = new URL(req.url, "http://x").pathname; } catch { return err(res, 400, "Bad request"); }
  try {
    if (pathname.startsWith("/api/")) return await api(req, res, pathname);
    if (req.method !== "GET" && req.method !== "HEAD") return err(res, 405, "Method not allowed");
    serveStatic(req, res, pathname);
  } catch (e) {
    if (e instanceof O.InputError) return err(res, 400, e.message);
    console.error(e);
    if (!res.headersSent) err(res, 500, "Something went wrong. Please try again.");
  }
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`\n  The OHS Store can't start: something is already using port ${PORT}.`);
    console.error("  It's probably already running in another window. Close that window and try again.\n");
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`OHS Store running at ${url}  (owner dashboard: /admin)`);
  // --open: used by the double-click start files to open the browser once ready
  if (process.argv.includes("--open") && !process.env.OHS_NO_OPEN) {
    const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
    require("child_process").exec(cmd, () => {});
  }
});
