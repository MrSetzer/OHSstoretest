/* Command Center numbers. Everything here is computed in the browser from
   the orders the dashboard already loads (/api/admin/state), so the server
   and its data format are unchanged. Cancelled orders never count toward
   sales. */

window.Insights = (function () {
  const DAY = 864e5;
  const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);
  const live = (orders) => orders.filter((o) => o.status !== "cancelled");
  const units = (o) => o.items.reduce((n, i) => n + (i.review.status === "declined" ? 0 : i.qty), 0);
  const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

  const PERIODS = { today: "Today", "7d": "7 days", "30d": "30 days", "90d": "90 days", all: "All time" };

  // { from, to, prevFrom, prevTo } in ms. "all" has no previous period.
  function range(period, orders) {
    const now = Date.now();
    const today = startOfDay(now);
    if (period === "today") return { from: today, to: now, prevFrom: today - DAY, prevTo: today, days: 1 };
    const days = { "7d": 7, "30d": 30, "90d": 90 }[period];
    if (days) {
      const from = today - (days - 1) * DAY;
      return { from, to: now, prevFrom: from - days * DAY, prevTo: from, days };
    }
    const first = orders.length ? Math.min(...orders.map((o) => Date.parse(o.createdAt))) : now;
    const from = startOfDay(first);
    return { from, to: now, prevFrom: null, prevTo: null, days: Math.max(1, Math.round((today - from) / DAY) + 1) };
  }

  const within = (orders, a, b) => orders.filter((o) => { const t = Date.parse(o.createdAt); return t >= a && t < b; });

  function metrics(list) {
    const sales = sum(list, (o) => o.total);
    return { sales, orders: list.length, items: sum(list, units), avg: list.length ? sales / list.length : 0 };
  }

  // Current period vs the one before it, plus money that isn't period-bound.
  function kpis(orders, r) {
    const cur = metrics(live(within(orders, r.from, r.to + 1)));
    const prev = r.prevFrom == null ? null : metrics(live(within(orders, r.prevFrom, r.prevTo)));
    const open = live(orders);
    return {
      cur, prev,
      collected: sum(open.filter((o) => o.paid), (o) => o.total),
      owed: sum(open.filter((o) => !o.paid), (o) => o.total),
      quotesWaiting: open.flatMap((o) => o.items).filter((i) => i.lineTotal == null && i.review.quote == null && i.review.status !== "declined").length,
    };
  }

  // Percentage change, or null when there is nothing to compare against.
  function delta(cur, prev) {
    if (prev == null) return null;
    if (prev === 0) return cur > 0 ? { text: "new", up: true } : null;
    const p = ((cur - prev) / prev) * 100;
    // Big jumps read better as a multiple ("6.5×") than as "+553%".
    if (cur / prev >= 3) return { text: `${(cur / prev).toFixed(cur / prev >= 10 ? 0 : 1)}×`, up: true };
    return { text: `${p > 0 ? "+" : ""}${Math.round(p)}%`, up: p >= 0 };
  }

  // Daily sales and order counts across the period (at most 120 points).
  function series(orders, r) {
    const days = Math.min(r.days, 120);
    const start = startOfDay(r.to) - (days - 1) * DAY;
    const buckets = [];
    for (let i = 0; i < days; i++) buckets.push({ t: start + i * DAY, key: dayKey(start + i * DAY), sales: 0, orders: 0 });
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const o of live(orders)) {
      const i = idx.get(dayKey(Date.parse(o.createdAt)));
      if (i != null) { buckets[i].sales += o.total; buckets[i].orders += 1; }
    }
    return buckets;
  }

  function tally(entries) {
    const m = new Map();
    for (const [k, units, revenue] of entries) {
      const v = m.get(k) || { name: k, units: 0, revenue: 0 };
      v.units += units; v.revenue += revenue; m.set(k, v);
    }
    return [...m.values()];
  }
  const lineRevenue = (i) => (i.review.status === "declined" ? 0 : i.lineTotal != null ? i.lineTotal : (i.review.quote || 0) * i.qty);
  const periodItems = (orders, r) => live(within(orders, r.from, r.to + 1)).flatMap((o) => o.items).filter((i) => i.review.status !== "declined");

  function bestSellers(orders, r) {
    return tally(periodItems(orders, r).map((i) => [i.title, i.qty, lineRevenue(i)]));
  }

  // Designs come from the item details the server recorded at order time.
  function topDesigns(orders, r) {
    const rows = [];
    for (const i of periodItems(orders, r)) {
      for (const [k, v] of i.details) if (/design/i.test(k) && !/^Other:/.test(v)) rows.push([v, i.qty, 0]);
    }
    return tally(rows).sort((a, b) => b.units - a.units);
  }

  function sizes(orders, r, order) {
    const rows = [];
    for (const i of periodItems(orders, r)) for (const [k, v] of i.details) if (k === "Size") rows.push([v, i.qty, 0]);
    const list = tally(rows);
    return list.sort((a, b) => (order.indexOf(a.name) - order.indexOf(b.name)) || b.units - a.units);
  }

  function categoryMix(orders, r) {
    const out = { apparel: 0, holiday: 0, accessories: 0 };
    for (const i of periodItems(orders, r)) out[i.category] = (out[i.category] || 0) + lineRevenue(i);
    return out;
  }

  // One row per customer email.
  function customers(orders) {
    const m = new Map();
    for (const o of orders) {
      const k = o.contact.email;
      const c = m.get(k) || { email: k, name: o.contact.name, phone: o.contact.phone, orders: 0, items: 0, spent: 0, owed: 0, last: o.createdAt, first: o.createdAt };
      c.orders += 1;
      if (o.status !== "cancelled") {
        c.items += units(o);
        c.spent += o.total;
        if (!o.paid) c.owed += o.total;
      }
      if (o.createdAt > c.last) { c.last = o.createdAt; c.name = o.contact.name; c.phone = o.contact.phone; }
      if (o.createdAt < c.first) c.first = o.createdAt;
      m.set(k, c);
    }
    return [...m.values()];
  }

  // Things the owner should act on, most urgent first.
  function attention(S) {
    const list = [];
    const now = Date.now();
    const open = S.orders.filter((o) => o.status !== "cancelled");
    const pendingItems = open.flatMap((o) => o.items).filter((i) => i.review.status === "pending").length;
    if (pendingItems) list.push({ tone: "red", n: pendingItems, text: `custom request${pendingItems === 1 ? "" : "s"} waiting for your approval`, href: "#requests", action: "Review" });
    const stale = open.filter((o) => o.status === "new" && now - Date.parse(o.createdAt) > 2 * DAY);
    if (stale.length) list.push({ tone: "amber", n: stale.length, text: `new order${stale.length === 1 ? " has" : "s have"} waited more than 2 days`, href: "#orders/new", action: "Start them" });
    const readyUnpaid = open.filter((o) => o.status === "ready" && !o.paid);
    if (readyUnpaid.length) list.push({ tone: "amber", n: readyUnpaid.length, text: `ready order${readyUnpaid.length === 1 ? " is" : "s are"} still unpaid; collect at pickup`, href: "#orders/ready", action: "View" });
    const doneUnpaid = open.filter((o) => o.status === "completed" && !o.paid);
    if (doneUnpaid.length) list.push({ tone: "amber", n: doneUnpaid.length, text: `picked-up order${doneUnpaid.length === 1 ? " is" : "s are"} marked unpaid`, href: "#orders/unpaid", action: "Check" });
    if (!S.settings.storeOpen) list.push({ tone: "red", n: null, text: "The store is closed. Customers can't place orders.", href: "#settings", action: "Open it" });
    const setup = [];
    if (!S.settings.contactEmail) setup.push("contact email");
    if (!S.settings.pickupInfo) setup.push("pickup information");
    if (S.catalog.designs.some((d) => d.active && !d.image)) setup.push("artwork for every design");
    if (S.settings.holiday.enabled && !S.catalog.holiday.some((h) => h.active)) setup.push("holiday items");
    if (S.catalog.holiday.some((h) => h.active && !h.image)) setup.push("photos for holiday items");
    if (setup.length) list.push({ tone: "blue", n: null, text: `Finish setup: add ${setup.join(", ")}.`, href: "#settings", action: "Fix" });
    return list;
  }

  // Latest events across all orders.
  function activity(orders, limit = 12) {
    return orders.flatMap((o) => o.history.map((h) => ({ at: h.at, text: h.text, number: o.number, id: o.id, name: o.contact.name })))
      .sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }

  return { PERIODS, range, kpis, delta, series, bestSellers, topDesigns, sizes, categoryMix, customers, attention, activity, units, DAY };
})();
