/* OHS Store owner dashboard: command center, orders, customers, requests,
   products & pricing, designs, holiday collection and store settings. */

(function () {
  const root = document.getElementById("root");
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "$" + Number(n || 0).toFixed(Number(n) % 1 ? 2 : 0);
  const when = (iso) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  const STATUS = { new: "New", in_progress: "In progress", ready: "Ready for pickup", completed: "Completed", cancelled: "Cancelled" };
  const REVIEW = { pending: "Needs review", approved: "Approved", declined: "Declined" };

  let S = null;          // { catalog, settings, orders }
  let draft = null;      // working copy of catalog + settings on the Products/Settings pages
  let dirty = false;

  // ---------- server ----------
  async function api(method, url, body) {
    const res = await fetch(url, {
      method, credentials: "same-origin",
      headers: { "X-OHS-Admin": "1", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && url !== "/api/admin/login") { showLogin(); throw new Error("Please sign in again."); }
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }
  async function refresh() { S = await api("GET", "/api/admin/state"); }

  function toast(msg, bad) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "show" + (bad ? " bad" : "");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.className = ""), 3200);
  }

  // ---------- login ----------
  function showLogin() {
    document.body.classList.add("login-page");
    root.innerHTML = `
      <main class="login">
        <form class="login-card" id="login" autocomplete="on">
          <img src="/images/designs/cyclone-3.png" alt="" class="login-logo">
          <h1>OHS Store</h1>
          <p class="muted">Owner dashboard</p>
          <label class="field"><span>Password</span>
            <input type="password" name="password" autocomplete="current-password" required autofocus></label>
          <p class="login-err" id="login-err" hidden></p>
          <button class="btn btn-primary btn-block" type="submit">Sign in</button>
          <a class="muted small" href="/">← Back to the store</a>
        </form>
      </main>`;
    $("#login").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("#login-err");
      err.hidden = true;
      try {
        await api("POST", "/api/admin/login", { password: e.target.password.value });
        document.body.classList.remove("login-page");
        await start();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
  }

  // ---------- shell ----------
  const NAV = [
    ["overview", "Command center", "M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z"],
    ["orders", "Orders", "M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4"],
    ["customers", "Customers", "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8"],
    ["requests", "Requests", "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"],
    ["products", "Products & pricing", "M4 7l8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10"],
    ["settings", "Settings", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"]
  ];

  const pendingReviews = () => S.orders.filter((o) => o.status !== "cancelled")
    .flatMap((o) => o.items.map((it, index) => ({ o, it, index }))).filter((x) => x.it.review.status === "pending");

  function shell() {
    root.innerHTML = `
      <div class="layout">
        <aside class="side">
          <a class="side-brand" href="#overview"><img src="/images/designs/cyclone-3.png" alt=""><span><strong>OHS Store</strong><small>Owner dashboard</small></span></a>
          <form class="side-search" id="side-search" role="search"><input type="search" name="q" placeholder="Find an order or customer…" aria-label="Find an order or customer"></form>
          <nav class="side-nav">${NAV.map(([id, label, d]) => `<a href="#${id}" data-nav="${id}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg><span>${label}</span><b class="count" data-count="${id}" hidden></b></a>`).join("")}</nav>
          <div class="side-foot">
            <a href="/" target="_blank" rel="noopener">View store ↗</a>
            <button type="button" id="logout">Sign out</button>
          </div>
        </aside>
        <main class="main" id="main" tabindex="-1"></main>
      </div>`;
    $("#logout").addEventListener("click", async () => { await api("POST", "/api/admin/logout"); showLogin(); });
    $("#side-search").addEventListener("submit", (e) => {
      e.preventDefault();
      const q = e.target.q.value.trim();
      if (!q) return;
      const exact = S.orders.find((o) => o.number.toLowerCase() === q.toLowerCase());
      if (exact) { location.hash = "#orders/" + exact.id; return; }
      orderQuery = q; orderFilter = "all"; orderView = "list";
      if (location.hash === "#orders/all") route(); else location.hash = "#orders/all";
    });
  }

  function updateCounts() {
    const c = { orders: S.orders.filter((o) => o.status === "new").length, requests: pendingReviews().length };
    $$("[data-count]").forEach((el) => { const n = c[el.dataset.count]; el.textContent = n; el.hidden = !n; });
  }

  // ---------- router ----------
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
  window.addEventListener("hashchange", () => route());

  async function route() {
    const [page = "overview", sub] = location.hash.replace(/^#/, "").split("/");
    if (dirty && !["products", "settings"].includes(page)) {
      if (!confirm("You have unsaved changes. Leave without saving?")) { history.back(); return; }
      dirty = false; draft = null;
    }
    $$("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === page));
    updateCounts();
    const main = $("#main");
    main.onclick = main.oninput = main.onchange = main.onkeydown = null;
    ({ overview, orders, customers, requests, products, settings }[page] || overview)(main, sub);
    main.focus({ preventScroll: true });
  }

  // ---------- command center ----------
  let period = "30d", bestBy = "units";
  const PIPE = [["new", "New"], ["in_progress", "In progress"], ["ready", "Ready for pickup"], ["completed", "Picked up"]];

  function overview(main) {
    const I = window.Insights;
    const r = I.range(period, S.orders);
    const k = I.kpis(S.orders, r);
    const pts = I.series(S.orders, r);
    const attention = I.attention(S);
    const best = I.bestSellers(S.orders, r).sort((a, b) => b[bestBy] - a[bestBy]).slice(0, 6);
    const designs = I.topDesigns(S.orders, r).slice(0, 6);
    const sizes = I.sizes(S.orders, r, S.catalog.sizes);
    const mix = I.categoryMix(S.orders, r);
    const people = I.customers(S.orders).sort((a, b) => b.spent - a.spent).slice(0, 5);
    const feed = I.activity(S.orders, 10);
    const label = I.PERIODS[period];
    const design = (name) => S.catalog.designs.find((d) => d.name === name);

    const kpi = (title, value, cur, prev, hint) => {
      const d = I.delta(cur, prev);
      return `<div class="kpi"><span class="kpi-label">${title}</span><strong>${value}</strong>
        <span class="kpi-foot">${d ? `<b class="delta ${d.up ? "up" : "down"}">${d.up ? "▲" : "▼"} ${d.text}</b> vs previous ${period === "today" ? "day" : label.toLowerCase()}` : esc(hint || "")}</span></div>`;
    };

    main.innerHTML = `
      <header class="page-top cc-top"><div><span class="eyebrow">Command center</span><h1>${greeting()}</h1>
        <p class="muted">${S.settings.storeOpen ? `<span class="dot on"></span>Store is open for orders` : `<span class="dot"></span>Store is closed`} · updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p></div>
        <div class="seg" role="tablist" aria-label="Time period">${Object.entries(I.PERIODS).map(([p, l]) => `<button role="tab" data-period="${p}" class="${p === period ? "on" : ""}" aria-selected="${p === period}">${l}</button>`).join("")}</div>
      </header>

      ${attention.length ? `<section class="attention" aria-label="Needs attention">${attention.map((a) => `
        <a class="att att-${a.tone}" href="${a.href}"><span class="att-icon" aria-hidden="true">${a.tone === "blue" ? "i" : "!"}</span>
          <span class="att-text">${a.n != null ? `<b>${a.n}</b> ` : ""}${esc(a.text)}</span><span class="att-go">${esc(a.action)} →</span></a>`).join("")}</section>`
        : `<section class="attention"><div class="att att-green"><span class="att-icon" aria-hidden="true">✓</span><span class="att-text">All caught up. Nothing needs your attention right now.</span></div></section>`}

      <div class="kpis">
        ${kpi("Sales", money(k.cur.sales), k.cur.sales, k.prev && k.prev.sales, label)}
        ${kpi("Orders", k.cur.orders, k.cur.orders, k.prev && k.prev.orders, label)}
        ${kpi("Average order", money(k.cur.avg), k.cur.avg, k.prev && k.prev.avg, label)}
        ${kpi("Items sold", k.cur.items, k.cur.items, k.prev && k.prev.items, label)}
      </div>
      <div class="money-strip">
        <a href="#orders/all"><span>Collected</span><b>${money(k.collected)}</b></a>
        <a href="#orders/unpaid"><span>Still owed</span><b class="${k.owed ? "owe" : ""}">${money(k.owed)}</b></a>
        <a href="#requests"><span>Items waiting for a quote</span><b>${k.quotesWaiting}</b></a>
        <a href="#customers"><span>Customers</span><b>${I.customers(S.orders).length}</b></a>
      </div>

      <div class="cc-grid">
        <section class="card chart-card">
          <div class="card-head"><h2>Sales trend</h2><span class="chart-readout" id="readout">${label}: <b>${money(k.cur.sales)}</b> · ${k.cur.orders} order${k.cur.orders === 1 ? "" : "s"}</span></div>
          ${chart(pts)}
        </section>
        <section class="card">
          <div class="card-head"><h2>Order pipeline</h2><a class="link" href="#orders/board">Board →</a></div>
          <ol class="pipeline">${PIPE.map(([st, l], i) => {
            const n = S.orders.filter((o) => o.status === st).length;
            const total = S.orders.filter((o) => o.status !== "cancelled").length || 1;
            return `<li><a href="#orders/${st}"><span class="pipe-step">${i + 1}</span><span class="pipe-name">${l}</span><b>${n}</b>
              <i class="pipe-bar"><i style="width:${Math.round((n / total) * 100)}%"></i></i></a></li>`;
          }).join("")}</ol>
          <p class="muted small">${S.orders.filter((o) => o.status === "cancelled").length} cancelled · all time</p>
        </section>
      </div>

      <div class="cc-grid cc-grid-3">
        <section class="card">
          <div class="card-head"><h2>Best sellers</h2>
            <div class="seg seg-sm">${[["units", "Units"], ["revenue", "Sales"]].map(([b, l]) => `<button data-best="${b}" class="${b === bestBy ? "on" : ""}">${l}</button>`).join("")}</div></div>
          ${best.length ? `<div class="bars">${best.map((x) => `<div class="bar-row"><span title="${esc(x.name)}">${esc(x.name)}</span>
            <div class="bar"><i style="width:${Math.max(4, (x[bestBy] / (best[0][bestBy] || 1)) * 100)}%"></i></div><b>${bestBy === "units" ? x.units : money(x.revenue)}</b></div>`).join("")}</div>`
            : empty(`No sales in ${label.toLowerCase()} yet.`)}
        </section>
        <section class="card">
          <div class="card-head"><h2>Top designs</h2></div>
          ${designs.length ? `<ol class="design-rank">${designs.map((x, i) => { const d = design(x.name); return `<li><span class="rank">${i + 1}</span>
            ${d && d.image ? `<img src="/${esc(d.image)}" alt="">` : `<span class="noimg"></span>`}<span class="dn">${esc(x.name)}</span><b>${x.units}</b></li>`; }).join("")}</ol>`
            : empty("Design picks show up once apparel sells.")}
        </section>
        <section class="card">
          <div class="card-head"><h2>Sales by category</h2></div>
          ${donut(mix)}
          ${sizes.length ? `<h3 class="mini-h">Sizes ordered</h3><div class="size-bars">${sizes.map((x) => `<div><i style="height:${Math.max(6, (x.units / Math.max(...sizes.map((s) => s.units))) * 100)}%"></i><b>${x.units}</b><span>${esc(x.name)}</span></div>`).join("")}</div>` : ""}
        </section>
      </div>

      <div class="cc-grid">
        <section class="card">
          <div class="card-head"><h2>Latest activity</h2><a href="#orders" class="link">All orders →</a></div>
          ${feed.length ? `<ol class="feed">${feed.map((f) => `<li><a href="#orders/${f.id}"><span class="feed-dot"></span>
            <span><b>${esc(f.number)}</b> · ${esc(f.text)}<small>${esc(f.name)} · ${when(f.at)}</small></span></a></li>`).join("")}</ol>`
            : empty("Order activity will show up here.")}
        </section>
        <section class="card">
          <div class="card-head"><h2>Top customers</h2><a href="#customers" class="link">All customers →</a></div>
          ${people.length ? `<div class="mini-list">${people.map((c) => `<a class="mini-row" href="#customers/${encodeURIComponent(c.email)}">
            <span class="avatar" aria-hidden="true">${esc(initials(c.name))}</span>
            <span class="grow"><strong>${esc(c.name)}</strong><small>${c.orders} order${c.orders === 1 ? "" : "s"} · ${c.items} items</small></span>
            <span class="mini-right"><b>${money(c.spent)}</b>${c.owed ? `<small class="owe">${money(c.owed)} owed</small>` : ""}</span></a>`).join("")}</div>`
            : empty("Customers appear after the first order.")}
        </section>
      </div>`;

    main.onclick = (e) => {
      const p = e.target.closest("[data-period]");
      if (p) { period = p.dataset.period; overview(main); return; }
      const b = e.target.closest("[data-best]");
      if (b) { bestBy = b.dataset.best; overview(main); }
    };
    // Hovering the chart shows that day's numbers.
    const readout = $("#readout");
    const base = readout.innerHTML;
    main.querySelectorAll(".chart [data-day]").forEach((el) => {
      el.addEventListener("mouseenter", () => {
        const d = pts[Number(el.dataset.day)];
        readout.innerHTML = `${new Date(d.t).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}: <b>${money(d.sales)}</b> · ${d.orders} order${d.orders === 1 ? "" : "s"}`;
        el.classList.add("hover");
      });
      el.addEventListener("mouseleave", () => { readout.innerHTML = base; el.classList.remove("hover"); });
    });
  }

  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  }
  const initials = (name) => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

  // Area chart of daily sales. Each day has an invisible hover column.
  function chart(pts) {
    const W = 640, H = 200, P = { l: 44, r: 10, t: 12, b: 26 };
    const max = Math.max(10, ...pts.map((p) => p.sales));
    const nice = Math.ceil(max / 10 ** Math.floor(Math.log10(max))) * 10 ** Math.floor(Math.log10(max));
    const x = (i) => P.l + (pts.length === 1 ? (W - P.l - P.r) / 2 : (i / (pts.length - 1)) * (W - P.l - P.r));
    const y = (v) => P.t + (1 - v / nice) * (H - P.t - P.b);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.sales).toFixed(1)}`).join(" ");
    const area = `${line} L${x(pts.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;
    const grid = [0, .5, 1].map((f) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(nice * f)}" y2="${y(nice * f)}" class="grid"/><text x="${P.l - 8}" y="${y(nice * f) + 4}" text-anchor="end">${money(nice * f)}</text>`).join("");
    const colW = (W - P.l - P.r) / Math.max(1, pts.length - 1);
    const fmt = (t) => new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
    const ticks = pts.length > 1 ? [0, Math.floor((pts.length - 1) / 2), pts.length - 1] : [0];
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily sales">
      <defs><linearGradient id="cc-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#c8102e" stop-opacity=".28"/><stop offset="1" stop-color="#c8102e" stop-opacity="0"/></linearGradient></defs>
      ${grid}
      <path d="${area}" fill="url(#cc-fill)"/><path d="${line}" class="line"/>
      ${pts.map((p, i) => (p.sales ? `<circle cx="${x(i)}" cy="${y(p.sales)}" r="3.5" class="pt"/>` : "")).join("")}
      ${ticks.map((i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}">${fmt(pts[i].t)}</text>`).join("")}
      ${pts.map((p, i) => `<rect data-day="${i}" x="${x(i) - colW / 2}" y="${P.t}" width="${colW}" height="${H - P.t - P.b}" class="hit"/>`).join("")}
    </svg>`;
  }

  // Donut of sales split by apparel / holiday / accessories.
  function donut(mix) {
    const parts = [["apparel", "Apparel", "#c8102e"], ["holiday", "Christmas", "#141414"], ["accessories", "Accessories", "#9a9aa2"]];
    const total = parts.reduce((s, [k]) => s + (mix[k] || 0), 0);
    if (!total) return empty("Category split shows once there are sales.");
    const C = 2 * Math.PI * 42;
    let off = 0;
    const rings = parts.filter(([k]) => mix[k] > 0).map(([k, , color]) => {
      const len = (mix[k] / total) * C;
      const s = `<circle r="42" cx="60" cy="60" fill="none" stroke="${color}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"/>`;
      off += len;
      return s;
    }).join("");
    return `<div class="donut"><svg viewBox="0 0 120 120" role="img" aria-label="Sales by category"><circle r="42" cx="60" cy="60" fill="none" stroke="#efeff2" stroke-width="16"/>${rings}
      <text x="60" y="57" text-anchor="middle" class="d-total">${money(total)}</text><text x="60" y="73" text-anchor="middle" class="d-sub">sales</text></svg>
      <ul>${parts.map(([k, l, color]) => `<li><i style="background:${color}"></i>${l}<b>${money(mix[k] || 0)}</b><small>${Math.round(((mix[k] || 0) / total) * 100)}%</small></li>`).join("")}</ul></div>`;
  }

  const statusPill = (st) => `<span class="pill st-${st}">${STATUS[st]}</span>`;
  const empty = (text) => `<p class="empty">${esc(text)}</p>`;

  // ---------- orders ----------
  let orderFilter = "all", orderQuery = "", orderSort = "newest", orderView = "list";
  const selected = new Set();
  const FILTERS = { all: "All", ...STATUS, unpaid: "Unpaid", review: "Needs review" };
  const matches = (o, f) => f === "all" || o.status === f || (f === "unpaid" && !o.paid && o.status !== "cancelled")
    || (f === "review" && o.items.some((i) => i.review.status === "pending"));

  function orders(main, sub) {
    if (sub && S.orders.some((o) => o.id === sub)) return orderDetail(main, sub);
    if (sub === "board") orderView = "board";
    else if (sub && FILTERS[sub]) { orderFilter = sub; orderView = "list"; }
    main.innerHTML = `
      <header class="page-top"><div><h1>Orders</h1><p class="muted">${S.orders.length} total · ${S.orders.filter((o) => o.status === "new").length} new</p></div>
        <div class="top-actions"><div class="seg" role="tablist" aria-label="View">
          <button data-view="list" class="${orderView === "list" ? "on" : ""}">List</button><button data-view="board" class="${orderView === "board" ? "on" : ""}">Board</button></div>
          <a class="btn btn-outline" href="/api/admin/export/orders.csv">Export CSV</a></div></header>
      <div id="order-body"></div>`;
    const body = $("#order-body");
    const visible = () => {
      const q = orderQuery.trim().toLowerCase();
      const list = S.orders.filter((o) => !q || [o.number, o.contact.name, o.contact.email, o.contact.phone].join(" ").toLowerCase().includes(q));
      const sorters = { newest: (a, b) => b.createdAt.localeCompare(a.createdAt), oldest: (a, b) => a.createdAt.localeCompare(b.createdAt), total: (a, b) => b.total - a.total };
      return list.sort(sorters[orderSort]);
    };

    const drawList = () => {
      const list = visible().filter((o) => matches(o, orderFilter));
      for (const id of [...selected]) if (!list.some((o) => o.id === id)) selected.delete(id);
      body.innerHTML = `
        <div class="toolbar">
          <div class="chips">${Object.entries(FILTERS).map(([f, l]) => `<button class="chip ${orderFilter === f ? "active" : ""}" data-filter="${f}">${l} <b>${S.orders.filter((o) => matches(o, f)).length}</b></button>`).join("")}</div>
          <div class="toolbar-right"><input type="search" class="search" id="q" placeholder="Search name, email, phone or order #" value="${esc(orderQuery)}">
            <select id="sort" aria-label="Sort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="total">Highest total</option></select></div>
        </div>
        <div class="bulkbar" id="bulkbar" ${selected.size ? "" : "hidden"}>
          <b id="bulk-n">${selected.size} selected</b>
          <label>Set status <select id="bulk-status"><option value="">Choose…</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
          <button class="btn btn-sm btn-outline" data-bulk-paid="1">Mark paid</button><button class="btn btn-sm btn-outline" data-bulk-paid="0">Mark unpaid</button>
          <button class="btn btn-sm btn-ghost" data-bulk-clear>Clear</button>
        </div>
        ${list.length ? `<table class="table">
          <thead><tr><th class="cb"><input type="checkbox" id="all" aria-label="Select all" ${list.every((o) => selected.has(o.id)) ? "checked" : ""}></th><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Paid</th></tr></thead>
          <tbody>${list.map((o) => {
            const reviews = o.items.filter((i) => i.review.status === "pending").length;
            return `<tr data-open="${o.id}" tabindex="0" class="${selected.has(o.id) ? "sel" : ""}">
              <td class="cb" data-l=""><input type="checkbox" data-pick="${o.id}" aria-label="Select ${esc(o.number)}" ${selected.has(o.id) ? "checked" : ""}></td>
              <td data-l="Order"><strong>${esc(o.number)}</strong><small>${when(o.createdAt)}</small></td>
              <td data-l="Customer">${esc(o.contact.name)}<small>${esc(o.contact.email)}</small></td>
              <td data-l="Items">${Insights.units(o)} ${reviews ? `<span class="pill rv-pending">${reviews} to review</span>` : ""}</td>
              <td data-l="Total"><strong>${money(o.total)}</strong>${o.pending ? "<small>+ quotes</small>" : ""}</td>
              <td data-l="Status">${statusPill(o.status)}</td>
              <td data-l="Paid">${o.paid ? `<span class="pill paid">Paid</span>` : `<span class="pill unpaid">Unpaid</span>`}</td></tr>`;
          }).join("")}</tbody></table>`
          : empty(S.orders.length ? "No orders match." : "No orders yet.")}`;
      $("#sort").value = orderSort;
    };

    const drawBoard = () => {
      const list = visible();
      const cols = [["new", "New"], ["in_progress", "In progress"], ["ready", "Ready for pickup"], ["completed", "Picked up"]];
      body.innerHTML = `
        <div class="toolbar"><p class="muted small">Drag a card to another column, or use the arrows, to move an order along.</p>
          <input type="search" class="search" id="q" placeholder="Filter cards" value="${esc(orderQuery)}"></div>
        <div class="board">${cols.map(([st, l], ci) => {
          const items = list.filter((o) => o.status === st);
          return `<section class="col" data-col="${st}"><header><h2>${l}</h2><b>${items.length}</b></header>
            <div class="col-cards">${items.map((o) => `<article class="kcard" draggable="true" data-card="${o.id}">
              <a href="#orders/${o.id}" class="kc-top"><strong>${esc(o.number)}</strong><span>${money(o.total)}${o.pending ? "+" : ""}</span></a>
              <p>${esc(o.contact.name)}</p>
              <small>${Insights.units(o)} item${Insights.units(o) === 1 ? "" : "s"} · ${when(o.createdAt)}</small>
              <div class="kc-foot">${o.paid ? `<span class="pill paid">Paid</span>` : `<span class="pill unpaid">Unpaid</span>`}
                ${o.items.some((i) => i.review.status === "pending") ? `<span class="pill rv-pending">Review</span>` : ""}
                <span class="kc-move">${ci > 0 ? `<button class="icon" data-move-to="${cols[ci - 1][0]}" data-id="${o.id}" aria-label="Move back to ${cols[ci - 1][1]}">←</button>` : ""}
                ${ci < cols.length - 1 ? `<button class="icon" data-move-to="${cols[ci + 1][0]}" data-id="${o.id}" aria-label="Move to ${cols[ci + 1][1]}">→</button>` : ""}</span></div>
            </article>`).join("") || `<p class="col-empty">Nothing here</p>`}</div></section>`;
        }).join("")}</div>
        ${list.some((o) => o.status === "cancelled") ? `<p class="muted small">${list.filter((o) => o.status === "cancelled").length} cancelled order(s) are hidden from the board. <a class="link" href="#orders/cancelled">Show them</a></p>` : ""}`;
      // drag and drop between columns
      $$("[data-card]", body).forEach((c) => c.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", c.dataset.card); c.classList.add("dragging"); }));
      $$("[data-card]", body).forEach((c) => c.addEventListener("dragend", () => c.classList.remove("dragging")));
      $$("[data-col]", body).forEach((col) => {
        col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("over"); });
        col.addEventListener("dragleave", () => col.classList.remove("over"));
        col.addEventListener("drop", (e) => { e.preventDefault(); col.classList.remove("over"); moveOrders([e.dataTransfer.getData("text/plain")], { status: col.dataset.col }); });
      });
    };

    const draw = () => (orderView === "board" ? drawBoard() : drawList());
    const syncBulk = () => {
      $("#bulkbar").hidden = !selected.size;
      $("#bulk-n").textContent = `${selected.size} selected`;
    };

    async function moveOrders(ids, change) {
      try {
        for (const id of ids) await api("PATCH", "/api/admin/orders/" + id, change);
        await refresh(); updateCounts(); draw();
        const what = change.status ? STATUS[change.status] : change.paid ? "paid" : "unpaid";
        toast(`${ids.length} order${ids.length === 1 ? "" : "s"} → ${what}.`);
      } catch (ex) { toast(ex.message, true); }
    }

    draw();
    main.onclick = async (e) => {
      const v = e.target.closest("[data-view]");
      if (v) { orderView = v.dataset.view; $$("[data-view]", main).forEach((b) => b.classList.toggle("on", b === v)); draw(); return; }
      const chip = e.target.closest("[data-filter]");
      if (chip) { orderFilter = chip.dataset.filter; draw(); return; }
      const mv = e.target.closest("[data-move-to]");
      if (mv) return moveOrders([mv.dataset.id], { status: mv.dataset.moveTo });
      const bp = e.target.closest("[data-bulk-paid]");
      if (bp) return moveOrders([...selected], { paid: bp.dataset.bulkPaid === "1" });
      if (e.target.closest("[data-bulk-clear]")) { selected.clear(); draw(); return; }
      if (e.target.closest(".cb")) return; // checkbox cells don't open the order
      const row = e.target.closest("[data-open]");
      if (row) location.hash = "#orders/" + row.dataset.open;
    };
    main.onchange = (e) => {
      const t = e.target;
      if (t.dataset.pick) { t.checked ? selected.add(t.dataset.pick) : selected.delete(t.dataset.pick); t.closest("tr").classList.toggle("sel", t.checked); syncBulk(); }
      else if (t.id === "all") { $$("[data-pick]", main).forEach((c) => { c.checked = t.checked; t.checked ? selected.add(c.dataset.pick) : selected.delete(c.dataset.pick); c.closest("tr").classList.toggle("sel", t.checked); }); syncBulk(); }
      else if (t.id === "sort") { orderSort = t.value; draw(); }
      else if (t.id === "bulk-status" && t.value) {
        if (confirm(`Set ${selected.size} order(s) to “${STATUS[t.value]}”?`)) moveOrders([...selected], { status: t.value });
        else t.value = "";
      }
    };
    main.onkeydown = (e) => { const row = e.target.closest("[data-open]"); if (row && e.key === "Enter" && !e.target.closest(".cb")) location.hash = "#orders/" + row.dataset.open; };
    main.oninput = (e) => {
      if (e.target.id !== "q") return;
      orderQuery = e.target.value;
      const pos = e.target.selectionStart;
      draw();
      const q = $("#q"); q.focus(); q.setSelectionRange(pos, pos);
    };
  }

  function itemBlock(it, index, editable) {
    const rv = it.review;
    const price = it.lineTotal != null ? `${money(it.lineTotal)} <small>${it.qty} × ${money(it.unitPrice)}</small>`
      : rv.quote != null ? `${money(rv.quote * it.qty)} <small>${it.qty} × ${money(rv.quote)} quoted</small>` : `<span class="muted">Needs a quote</span>`;
    return `<div class="item ${rv.status === "declined" ? "declined" : ""}">
      <div class="item-top"><h3>${esc(it.title)} <span class="muted">× ${it.qty}</span></h3><strong>${price}</strong></div>
      <dl class="kv">${it.details.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}
        ${it.note ? `<dt>Customer note</dt><dd>${esc(it.note)}</dd>` : ""}</dl>
      ${it.refImage ? `<a class="ref" href="/${esc(it.refImage)}" target="_blank" rel="noopener"><img src="/${esc(it.refImage)}" alt="Customer reference image"><span>Reference image ↗</span></a>` : ""}
      ${rv.status !== "none" && editable ? `
        <div class="review" data-review="${index}">
          <div class="review-head"><strong>Custom request</strong><span class="pill rv-${rv.status}">${REVIEW[rv.status]}</span></div>
          <div class="review-grid">
            <label class="field"><span>Decision</span><select data-r="status">
              ${["pending", "approved", "declined"].map((s) => `<option value="${s}" ${rv.status === s ? "selected" : ""}>${REVIEW[s]}</option>`).join("")}</select></label>
            ${it.lineTotal == null ? `<label class="field"><span>Price each ($)</span><input data-r="quote" type="number" min="0" step="0.5" value="${rv.quote ?? ""}" placeholder="e.g. 15"></label>` : ""}
            <label class="field grow"><span>Message to customer <em>(shown when they track the order)</em></span>
              <input data-r="note" value="${esc(rv.note)}" placeholder="e.g. Approved — we'll use black Gildan hoodie"></label>
          </div>
        </div>` : ""}
    </div>`;
  }

  function orderDetail(main, id) {
    const o = S.orders.find((x) => x.id === id);
    main.innerHTML = `
      <a class="back" href="#orders">← All orders</a>
      <header class="page-top"><div><h1>${esc(o.number)}</h1><p class="muted">Placed ${new Date(o.createdAt).toLocaleString()}</p></div>
        <div class="top-actions"><button class="btn btn-outline" id="print">Print</button><button class="btn btn-ghost-danger" id="del">Delete</button></div></header>
      <div class="detail">
        <div>
          <section class="card"><div class="card-head"><h2>Items</h2><strong class="total">${money(o.total)}${o.pending ? " + quotes" : ""}</strong></div>
            ${o.items.map((it, i) => itemBlock(it, i, true)).join("")}</section>
          ${o.notes ? `<section class="card"><h2>Customer's order notes</h2><p class="quote">${esc(o.notes)}</p></section>` : ""}
        </div>
        <div>
          <section class="card">
            <h2>Status</h2>
            <label class="field"><span>Order status</span><select id="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
            <label class="switch"><input type="checkbox" id="paid" ${o.paid ? "checked" : ""}><span></span>Paid</label>
            <label class="field"><span>Private notes <em>(only you see these)</em></span><textarea id="admin-notes" rows="3">${esc(o.adminNotes)}</textarea></label>
            <button class="btn btn-primary btn-block" id="save">Save changes</button>
          </section>
          <section class="card"><h2>Customer</h2>
            <p class="contact"><strong>${esc(o.contact.name)}</strong>
              <a href="mailto:${esc(o.contact.email)}?subject=${encodeURIComponent("Your OHS Store order " + o.number)}">${esc(o.contact.email)}</a>
              <a href="tel:${esc(o.contact.phone.replace(/[^\d+]/g, ""))}">${esc(o.contact.phone)}</a></p></section>
          <section class="card"><h2>History</h2><ol class="history">${[...o.history].reverse().map((h) => `<li><span>${esc(h.text)}</span><small>${when(h.at)}</small></li>`).join("")}</ol></section>
        </div>
      </div>`;

    $("#print").onclick = () => window.print();
    $("#del").onclick = async () => {
      if (!confirm(`Delete order ${o.number}? This can't be undone.`)) return;
      await api("DELETE", "/api/admin/orders/" + o.id);
      await refresh(); toast("Order deleted."); location.hash = "#orders";
    };
    $("#save").onclick = async () => {
      const reviews = $$("[data-review]", main).map((el) => ({
        index: Number(el.dataset.review), status: $('[data-r="status"]', el).value,
        quote: $('[data-r="quote"]', el) ? $('[data-r="quote"]', el).value : null, note: $('[data-r="note"]', el).value
      }));
      try {
        await api("PATCH", "/api/admin/orders/" + o.id, { status: $("#status").value, paid: $("#paid").checked, adminNotes: $("#admin-notes").value, reviews });
        await refresh(); updateCounts(); orderDetail(main, id); toast("Order saved.");
      } catch (ex) { toast(ex.message, true); }
    };
  }

  // ---------- customers ----------
  let custQuery = "", custSort = "spent";
  function customers(main, sub) {
    const all = Insights.customers(S.orders);
    if (sub) {
      const email = decodeURIComponent(sub);
      const c = all.find((x) => x.email === email);
      if (c) return customerDetail(main, c);
    }
    main.innerHTML = `
      <header class="page-top"><div><h1>Customers</h1><p class="muted">${all.length} people have ordered · grouped by email</p></div></header>
      <div class="toolbar"><input type="search" class="search" id="cq" placeholder="Search name, email or phone" value="${esc(custQuery)}">
        <select id="csort" aria-label="Sort"><option value="spent">Most spent</option><option value="orders">Most orders</option><option value="recent">Most recent</option><option value="owed">Owes the most</option><option value="name">Name A–Z</option></select></div>
      <div id="cust-list"></div>`;
    const draw = () => {
      const q = custQuery.trim().toLowerCase();
      const sorters = { spent: (a, b) => b.spent - a.spent, orders: (a, b) => b.orders - a.orders, recent: (a, b) => b.last.localeCompare(a.last), owed: (a, b) => b.owed - a.owed, name: (a, b) => a.name.localeCompare(b.name) };
      const list = all.filter((c) => !q || [c.name, c.email, c.phone].join(" ").toLowerCase().includes(q)).sort(sorters[custSort]);
      $("#cust-list").innerHTML = list.length ? `<table class="table">
        <thead><tr><th>Customer</th><th>Phone</th><th>Orders</th><th>Items</th><th>Spent</th><th>Owes</th><th>Last order</th></tr></thead>
        <tbody>${list.map((c) => `<tr data-cust="${esc(encodeURIComponent(c.email))}" tabindex="0">
          <td data-l="Customer"><span class="who"><span class="avatar" aria-hidden="true">${esc(initials(c.name))}</span><span>${esc(c.name)}<small>${esc(c.email)}</small></span></span></td>
          <td data-l="Phone">${esc(c.phone)}</td><td data-l="Orders">${c.orders}</td><td data-l="Items">${c.items}</td>
          <td data-l="Spent"><strong>${money(c.spent)}</strong></td>
          <td data-l="Owes">${c.owed ? `<span class="owe">${money(c.owed)}</span>` : `<span class="muted">—</span>`}</td>
          <td data-l="Last order">${when(c.last)}</td></tr>`).join("")}</tbody></table>`
        : empty(all.length ? "No customers match." : "Customers appear after the first order.");
      $("#csort").value = custSort;
    };
    draw();
    const open = (row) => { location.hash = "#customers/" + row.dataset.cust; };
    main.onclick = (e) => { const row = e.target.closest("[data-cust]"); if (row) open(row); };
    main.onkeydown = (e) => { const row = e.target.closest("[data-cust]"); if (row && e.key === "Enter") open(row); };
    main.onchange = (e) => { if (e.target.id === "csort") { custSort = e.target.value; draw(); } };
    main.oninput = (e) => { if (e.target.id === "cq") { custQuery = e.target.value; draw(); const q = $("#cq"); q.focus(); } };
  }

  function customerDetail(main, c) {
    const list = S.orders.filter((o) => o.contact.email === c.email).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    main.innerHTML = `
      <a class="back" href="#customers">← All customers</a>
      <header class="page-top"><div class="who who-lg"><span class="avatar" aria-hidden="true">${esc(initials(c.name))}</span>
        <div><h1>${esc(c.name)}</h1><p class="muted">Customer since ${new Date(c.first).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</p></div></div>
        <div class="top-actions"><a class="btn btn-outline" href="mailto:${esc(c.email)}">Email</a><a class="btn btn-outline" href="tel:${esc(c.phone.replace(/[^\d+]/g, ""))}">Call</a></div></header>
      <div class="money-strip">
        <div><span>Orders</span><b>${c.orders}</b></div><div><span>Items</span><b>${c.items}</b></div>
        <div><span>Spent</span><b>${money(c.spent)}</b></div><div><span>Owes</span><b class="${c.owed ? "owe" : ""}">${money(c.owed)}</b></div>
      </div>
      <section class="card"><div class="card-head"><h2>Orders</h2><span class="muted small">${esc(c.email)} · ${esc(c.phone)}</span></div>
        <div class="mini-list">${list.map((o) => `<a class="mini-row" href="#orders/${o.id}">
          <span class="grow"><strong>${esc(o.number)}</strong><small>${when(o.createdAt)} · ${o.items.map((i) => esc(i.title)).join(", ")}</small></span>
          <span class="mini-right">${statusPill(o.status)}<b>${money(o.total)}</b></span></a>`).join("")}</div></section>`;
  }

  // ---------- requests ----------
  function requests(main) {
    const list = pendingReviews();
    const done = S.orders.flatMap((o) => o.items.map((it, index) => ({ o, it, index })))
      .filter((x) => x.it.review.status === "approved" || x.it.review.status === "declined").slice(-10).reverse();
    main.innerHTML = `
      <header class="page-top"><div><h1>Customer requests</h1>
        <p class="muted">Custom designs, custom text, Other colors, bring-your-own apparel and accessory requests wait here for your OK${list.length ? "" : " — you're all caught up"}.</p></div></header>
      ${list.length ? list.map(({ o, it, index }) => `
        <section class="card request" data-order="${o.id}" data-index="${index}">
          <div class="card-head"><div><a href="#orders/${o.id}" class="link">${esc(o.number)}</a> · <strong>${esc(o.contact.name)}</strong>
            <small class="muted">${when(o.createdAt)}</small></div>
            <a href="mailto:${esc(o.contact.email)}" class="link">Email customer</a></div>
          ${itemBlock(it, index, false)}
          <div class="review-grid">
            ${it.lineTotal == null ? `<label class="field"><span>Price each ($)</span><input data-q type="number" min="0" step="0.5" value="${it.review.quote ?? ""}" placeholder="Required to approve"></label>` : ""}
            <label class="field grow"><span>Message to customer <em>(optional)</em></span><input data-n value="${esc(it.review.note)}"></label>
          </div>
          <div class="request-actions"><button class="btn btn-primary" data-act="approved">Approve</button><button class="btn btn-outline" data-act="declined">Decline</button></div>
        </section>`).join("") : `<section class="card">${empty("Nothing waiting for review.")}</section>`}
      ${done.length ? `<h2 class="sub-h">Recently decided</h2><section class="card">${done.map(({ o, it }) => `<a class="mini-row" href="#orders/${o.id}">
        <span><strong>${esc(it.title)}</strong><small>${esc(o.number)} · ${esc(o.contact.name)}</small></span>
        <span class="mini-right"><span class="pill rv-${it.review.status}">${REVIEW[it.review.status]}</span></span></a>`).join("")}</section>` : ""}`;

    main.onclick = async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const card = btn.closest(".request");
      const o = S.orders.find((x) => x.id === card.dataset.order);
      const index = Number(card.dataset.index);
      const q = $("[data-q]", card);
      if (btn.dataset.act === "approved" && q && q.value === "") { q.focus(); return toast("Enter a price before approving.", true); }
      try {
        await api("PATCH", "/api/admin/orders/" + o.id, { reviews: [{ index, status: btn.dataset.act, quote: q ? q.value : null, note: $("[data-n]", card).value }] });
        await refresh(); updateCounts(); requests(main);
        toast(btn.dataset.act === "approved" ? "Request approved." : "Request declined.");
      } catch (ex) { toast(ex.message, true); }
    };
  }

  // ---------- products ----------
  const TABS = [
    ["apparel", "Apparel"], ["prints", "Print options"], ["colors", "Colors & sizes"], ["designs", "Designs"], ["holiday", "Christmas collection"]
  ];
  const FIELDS = {
    apparel: [["name", "Name", "text"], ["price", "Price", "money"], ["shape", "Preview shape", "select", { tee: "T-shirt", long: "Long sleeve", crew: "Crewneck", hoodie: "Hoodie" }],
      ["note", "Note shown to customers", "text", null, "wide"], ["byo", "Customer brings their own (charges print only)", "toggle"], ["popular", "Show “Popular” badge", "toggle"], ["active", "For sale", "toggle"]],
    prints: [["name", "Name", "text"], ["dims", "Size", "text"], ["price", "Added price", "money"],
      ["front", "Front print", "select", { "": "None", chest: "Chest patch", full: "Full front" }], ["back", "Includes back print", "toggle"], ["active", "Available", "toggle"]],
    colors: [["name", "Name", "text"], ["hex", "Color", "color"], ["custom", "Customer describes it (special order)", "toggle"], ["active", "Available", "toggle"]],
    designs: [["image", "Artwork", "image"], ["name", "Name", "text"], ["group", "Group", "select", { classic: "Classic", sports: "Sports", holiday: "Holiday" }],
      ["front", "Front / chest", "toggle"], ["back", "Back", "toggle"], ["active", "Shown", "toggle"]],
    holiday: [["image", "Photo", "image"], ["name", "Name", "text"], ["price", "Price", "money"], ["description", "Description", "text", null, "wide"],
      ["sizes", "Customer picks a size", "toggle"], ["active", "For sale", "toggle"]]
  };
  const BLANK = {
    apparel: { name: "New item", price: 0, shape: "tee", note: "", byo: false, popular: false, active: false },
    prints: { name: "New print option", dims: "", price: 0, front: "full", back: false, active: false },
    colors: { name: "New color", hex: "#000000", custom: false, active: false },
    designs: { name: "New design", image: "", group: "classic", front: true, back: true, active: false },
    holiday: { name: "New holiday item", price: 0, description: "", image: "", sizes: true, active: false }
  };

  function ensureDraft() {
    if (!draft) draft = { catalog: structuredClone(S.catalog), settings: structuredClone(S.settings) };
  }
  function markDirty() {
    dirty = true;
    const bar = $("#savebar"); if (bar) bar.hidden = false;
  }

  function products(main, tab = "apparel") {
    if (!TABS.some(([k]) => k === tab)) tab = "apparel";
    ensureDraft();
    const c = draft.catalog;
    const listHtml = (key) => `
      <div class="rows">${c[key].map((row, i) => rowHtml(key, row, i)).join("") || empty("Nothing here yet.")}</div>
      <button class="btn btn-outline" data-add="${key}">+ Add ${{ apparel: "apparel item", prints: "print option", colors: "color", designs: "design", holiday: "holiday item" }[key]}</button>`;
    let body = "";
    if (tab === "colors") {
      body = `<section class="card"><h2>Sizes</h2>
          <label class="field"><span>Sizes offered, in order (comma separated)</span><input data-sizes value="${esc(c.sizes.join(", "))}"></label>
          <label class="field"><span>Sizing tip shown to customers</span><input data-sizetip value="${esc(c.sizeTip)}"></label></section>
        <section class="card"><h2>Colors</h2>${listHtml("colors")}</section>`;
    } else if (tab === "holiday") {
      const h = draft.settings.holiday;
      body = `<section class="card"><h2>Collection</h2>
          <label class="switch"><input type="checkbox" data-hol="enabled" ${h.enabled ? "checked" : ""}><span></span>Show the collection in the store</label>
          <label class="field"><span>Title</span><input data-hol="title" value="${esc(h.title)}"></label>
          <label class="field"><span>Message</span><input data-hol="message" value="${esc(h.message)}"></label></section>
        <section class="card"><h2>Items</h2>${listHtml("holiday")}</section>`;
    } else {
      body = `<section class="card">${tab === "designs" ? `<p class="muted">Upload PNG artwork with a transparent background for the sharpest result. Hidden designs stay on past orders.</p>` : ""}${listHtml(tab)}</section>`;
    }
    main.innerHTML = `
      <header class="page-top"><div><h1>Products & pricing</h1><p class="muted">Changes go live in the store as soon as you save. Past orders keep the prices they were placed at.</p></div></header>
      <nav class="tabs">${TABS.map(([k, l]) => `<a href="#products/${k}" class="${k === tab ? "active" : ""}">${l}</a>`).join("")}</nav>
      ${body}
      ${saveBar()}`;
    bindEditor(main, () => products(main, tab));
  }

  function rowHtml(key, row, i) {
    const fields = FIELDS[key].map(([k, label, type, opts, wide]) => {
      const v = row[k];
      const name = `data-f="${key}.${i}.${k}"`;
      if (type === "toggle") return `<label class="switch small"><input type="checkbox" ${name} ${v ? "checked" : ""}><span></span>${label}</label>`;
      if (type === "select") return `<label class="field"><span>${label}</span><select ${name}>${Object.entries(opts).map(([ov, ol]) => `<option value="${ov}" ${v === ov ? "selected" : ""}>${ol}</option>`).join("")}</select></label>`;
      if (type === "money") return `<label class="field"><span>${label}</span><div class="money"><i>$</i><input type="number" min="0" step="0.5" ${name} value="${esc(v)}"></div></label>`;
      if (type === "color") return `<label class="field"><span>${label}</span><input type="color" ${name} value="${esc(v || "#ffffff")}" ${row.custom ? "disabled" : ""}></label>`;
      if (type === "image") return `<div class="img-field">${v ? `<img src="/${esc(v)}" alt="">` : `<span class="no-img">No image</span>`}
        <label class="btn btn-outline btn-sm">${v ? "Replace" : "Upload"}<input type="file" accept="image/png,image/jpeg,image/webp" data-img="${key}.${i}" hidden></label></div>`;
      return `<label class="field ${wide ? "wide" : ""}"><span>${label}</span><input ${name} value="${esc(v)}"></label>`;
    }).join("");
    return `<div class="row ${row.active ? "" : "inactive"}">
      <div class="row-fields">${fields}</div>
      <div class="row-tools">
        <button class="icon" data-move="${key}.${i}.-1" aria-label="Move up" title="Move up">↑</button>
        <button class="icon" data-move="${key}.${i}.1" aria-label="Move down" title="Move down">↓</button>
        <button class="icon danger" data-del="${key}.${i}" aria-label="Delete" title="Delete">✕</button>
      </div></div>`;
  }

  const saveBar = () => `<div class="savebar" id="savebar" ${dirty ? "" : "hidden"}><span>You have unsaved changes</span>
    <button class="btn btn-outline" data-discard>Discard</button><button class="btn btn-primary" data-save>Save changes</button></div>`;

  function bindEditor(main, rerender) {
    main.oninput = main.onchange = (e) => {
      const t = e.target;
      if (t.dataset.f) {
        const [key, i, k] = t.dataset.f.split(".");
        const row = draft.catalog[key][Number(i)];
        row[k] = t.type === "checkbox" ? t.checked : t.type === "number" ? Number(t.value) : t.value;
        if (t.type === "checkbox" && e.type === "change") { markDirty(); if (k === "active" || k === "custom") rerender(); return; }
        markDirty();
      } else if (t.dataset.sizes !== undefined) {
        draft.catalog.sizes = t.value.split(",").map((s) => s.trim()).filter(Boolean); markDirty();
      } else if (t.dataset.sizetip !== undefined) {
        draft.catalog.sizeTip = t.value; markDirty();
      } else if (t.dataset.hol) {
        draft.settings.holiday[t.dataset.hol] = t.type === "checkbox" ? t.checked : t.value; markDirty();
      } else if (t.dataset.s) {
        draft.settings[t.dataset.s] = t.type === "checkbox" ? t.checked : t.value; markDirty();
      } else if (t.dataset.img && e.type === "change" && t.files[0]) {
        upload(t.files[0]).then((path) => {
          const [key, i] = t.dataset.img.split(".");
          draft.catalog[key][Number(i)].image = path; markDirty(); rerender(); toast("Image uploaded — remember to save.");
        }).catch((ex) => toast(ex.message, true));
      }
    };
    main.onclick = async (e) => {
      const add = e.target.closest("[data-add]");
      if (add) { draft.catalog[add.dataset.add].push(structuredClone(BLANK[add.dataset.add])); markDirty(); rerender(); return; }
      const mv = e.target.closest("[data-move]");
      if (mv) {
        const [key, i, d] = mv.dataset.move.split("."); const list = draft.catalog[key]; const a = Number(i), b = a + Number(d);
        if (b < 0 || b >= list.length) return;
        [list[a], list[b]] = [list[b], list[a]]; markDirty(); rerender(); return;
      }
      const del = e.target.closest("[data-del]");
      if (del) {
        const [key, i] = del.dataset.del.split(".");
        const row = draft.catalog[key][Number(i)];
        if (!confirm(`Delete “${row.name}”? Tip: switching it off hides it without deleting.`)) return;
        draft.catalog[key].splice(Number(i), 1); markDirty(); rerender(); return;
      }
      if (e.target.closest("[data-discard]")) { draft = null; dirty = false; rerender(); toast("Changes discarded."); return; }
      if (e.target.closest("[data-save]")) {
        const btn = e.target.closest("[data-save]"); btn.disabled = true;
        try {
          await api("PUT", "/api/admin/catalog", { catalog: draft.catalog });
          await api("PUT", "/api/admin/settings", { settings: draft.settings });
          await refresh(); draft = null; dirty = false; rerender(); toast("Saved — the store is updated.");
        } catch (ex) { btn.disabled = false; toast(ex.message, true); }
      }
    };
  }

  async function upload(file) {
    if (file.size > 4 * 1024 * 1024) throw new Error("Images must be 4 MB or smaller.");
    const dataUrl = await new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = j; fr.readAsDataURL(file); });
    return (await api("POST", "/api/admin/upload", { dataUrl })).path;
  }

  // ---------- settings ----------
  function settings(main) {
    ensureDraft();
    const s = draft.settings;
    main.innerHTML = `
      <header class="page-top"><div><h1>Settings</h1></div></header>
      <section class="card"><h2>Store</h2>
        <label class="switch"><input type="checkbox" data-s="storeOpen" ${s.storeOpen ? "checked" : ""}><span></span>Store is open for orders</label>
        <label class="field"><span>Message shown while closed</span><input data-s="closedMessage" value="${esc(s.closedMessage)}"></label>
        <label class="field"><span>Announcement banner <em>(leave empty to hide)</em></span><input data-s="announcement" value="${esc(s.announcement)}" placeholder="e.g. Orders placed by Friday are ready next Wednesday"></label>
        <label class="switch"><input type="checkbox" data-s="accessoriesEnabled" ${s.accessoriesEnabled ? "checked" : ""}><span></span>Accept Accessories / Others requests</label>
        <label class="switch"><input type="checkbox" data-s="personalizationEnabled" ${s.personalizationEnabled ? "checked" : ""}><span></span>Let customers add custom text (names, numbers) — sent to Requests for your OK</label>
        <label class="field"><span>Pickup information <em>(shown at checkout and on confirmations)</em></span><input data-s="pickupInfo" value="${esc(s.pickupInfo)}" placeholder="e.g. Pick up in Room 114 after school"></label>
        <label class="field"><span>Contact email shown to customers</span><input type="email" data-s="contactEmail" value="${esc(s.contactEmail)}"></label>
      </section>
      <section class="card"><h2>Password</h2>
        <form id="pw" class="pw-grid">
          <label class="field"><span>Current password</span><input type="password" name="current" autocomplete="current-password" required></label>
          <label class="field"><span>New password <em>(10+ characters)</em></span><input type="password" name="next" autocomplete="new-password" minlength="10" required></label>
          <label class="field"><span>Repeat new password</span><input type="password" name="again" autocomplete="new-password" required></label>
          <button class="btn btn-outline" type="submit">Change password</button>
        </form>
      </section>
      <section class="card"><h2>Your data</h2>
        <p class="muted">Orders are saved on the server and backed up automatically every day. You can also keep your own copies.</p>
        <div class="btn-row"><a class="btn btn-outline" href="/api/admin/export/orders.csv">Download orders (CSV)</a>
          <a class="btn btn-outline" href="/api/admin/backup">Download full backup</a></div>
      </section>
      ${saveBar()}`;
    bindEditor(main, () => settings(main));
    $("#pw").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      if (f.next.value !== f.again.value) return toast("The new passwords don't match.", true);
      try { await api("POST", "/api/admin/password", { current: f.current.value, next: f.next.value }); f.reset(); toast("Password changed. Other devices were signed out."); }
      catch (ex) { toast(ex.message, true); }
    });
  }

  // ---------- start ----------
  async function start() {
    await refresh();
    shell();
    route();
    // keep the order list fresh while the dashboard is open
    setInterval(async () => {
      if (dirty || document.hidden) return;
      const before = S.orders.length;
      try { await refresh(); } catch { return; }
      updateCounts();
      if (S.orders.length > before) {
        toast(`New order received (${S.orders.length - before}).`);
        const page = location.hash.replace(/^#/, "").split("/")[0] || "overview";
        if (["overview", "orders", "requests"].includes(page) && !location.hash.includes("-")) route();
      }
    }, 60000);
  }

  fetch("/api/admin/me", { credentials: "same-origin" })
    .then((r) => (r.ok ? start() : showLogin()))
    .catch(() => showLogin());
})();
