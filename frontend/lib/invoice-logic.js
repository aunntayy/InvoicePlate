// Invoice logic shared by the app and the tests: parsing, price comparison, duplicates, formatting.
// No DOM and no storage here, so it runs the same in the browser and in Node.

export const money = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export const signed = n => (n < 0 ? '−' : '+') + money(Math.abs(n));
export const num = v => { const s = String(v ?? '').replace(/[$,\s]/g, ''); return s === '' ? NaN : Number(s); };
export const cents = n => Math.round(n * 100);
export const sumMoney = arr => arr.reduce((s, v) => s + cents(v), 0) / 100; // totals from the rounded parts on screen
export const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const unitKey = u => norm(u).replace(/s$/, '');
export const invTotal = inv => sumMoney(inv.lines.map(l => l.qty * l.price));
export const fmtDate = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
export const fmtShort = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
export const fmtPct = p => (Math.abs(p) < 10 ? Math.abs(p).toFixed(1) : Math.round(Math.abs(p))) + '%';
export const perUnit = (price, unit) => money(price) + (unit ? '/' + unit : '');
export const invLabel = inv => inv.supplier + (inv.invoiceNo ? ' #' + inv.invoiceNo : '');
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export const lineKey = (supplier, l) => norm(supplier) + '|' + norm(l.item) + '|' + unitKey(l.unit);
export const sortInvoices = invoices => [...invoices].sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.createdAt - b.createdAt);

export function dupReason(a, b) {
  if (norm(a.supplier) !== norm(b.supplier)) return null;
  if (a.invoiceNo && b.invoiceNo && norm(a.invoiceNo) === norm(b.invoiceNo)) return 'Same invoice number';
  const ta = invTotal(a);
  if (a.date === b.date && ta > 0 && Math.abs(ta - invTotal(b)) < 0.005) return 'Same date and total';
  return null;
}

// Every pair of possible duplicates; `a` is the earlier copy, `b` the later one.
export function findDuplicates(invoices) {
  const list = sortInvoices(invoices), out = [];
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const reason = dupReason(list[i], list[j]);
      if (reason) out.push({ a: list[i], b: list[j], reason });
    }
  return out;
}

// Walks invoices oldest to newest and compares each line with the last price paid
// for the same supplier + item + unit. The later copy of a possible duplicate is skipped:
// it is the same delivery entered twice, not a new price.
export function analyze(invoices) {
  const last = new Map(), items = new Map(), events = [];
  const copies = new Set(findDuplicates(invoices).map(d => d.b.id));
  for (const inv of sortInvoices(invoices)) {
    if (copies.has(inv.id)) continue;
    for (const l of inv.lines) {
      const k = lineKey(inv.supplier, l);
      const prev = last.get(k);
      if (prev && prev.price > 0 && l.price !== prev.price) {
        events.push({ inv, line: l, prev, pct: (l.price - prev.price) / prev.price * 100, impact: cents((l.price - prev.price) * l.qty) / 100 });
      }
      const it = items.get(k) || { supplier: inv.supplier, first: l.price, count: 0 };
      Object.assign(it, { item: l.item, unit: l.unit, latest: l.price, latestDate: inv.date, prev: prev ? prev.price : null, count: it.count + 1 });
      items.set(k, it);
      last.set(k, { price: l.price, date: inv.date, inv });
    }
  }
  return { events, items: [...items.values()] };
}

export function alertText(e) {
  const dir = e.pct > 0 ? 'went up' : 'went down';
  const cost = e.pct > 0 ? `Extra cost on this delivery: ${money(e.impact)}.` : `Saved on this delivery: ${money(-e.impact)}.`;
  return `${e.line.item} (${e.inv.supplier}) ${dir} ${fmtPct(e.pct)}: ${perUnit(e.prev.price, e.line.unit)} → ${perUnit(e.line.price, e.line.unit)}. ${cost}`;
}

// The plain-text report an owner gets by text or email ("Copy summary" in the app).
export function summaryText(invoices, { restaurant, alertPct }, date) {
  const t = Number(alertPct) || 0;
  const ups = analyze(invoices).events.filter(e => e.pct >= t).sort((a, b) => b.impact - a.impact);
  const dups = findDuplicates(invoices);
  const out = [`Price report for ${restaurant}, ${fmtDate(date)}`, ''];
  if (ups.length) {
    out.push(`Price increases (${t}% or more):`);
    ups.forEach(e => out.push(`- ${alertText(e)} (${fmtDate(e.inv.date)})`));
    out.push('', `Extra paid vs. previous prices: ${money(sumMoney(ups.map(e => e.impact)))}`);
  } else out.push('No price increases found.');
  if (dups.length) {
    out.push('', 'Possible duplicate invoices:');
    dups.forEach(d => out.push(`- ${invLabel(d.b)} on ${fmtDate(d.b.date)} (${money(invTotal(d.b))}) matches ${invLabel(d.a)} on ${fmtDate(d.a.date)}. ${d.reason}.`));
  }
  out.push('', 'Based on the invoices you sent. Lines are checked by hand, but please confirm with your supplier before acting.');
  return out.join('\n');
}

// Accepts "item, qty, unit, price", tab-separated spreadsheet rows, or "item qty unit price".
// Returns null for a blank line and undefined for a line it cannot read.
export function parseLine(raw) {
  const s = raw.trim();
  if (!s) return null;
  let parts;
  if (s.includes('\t')) parts = s.split('\t').map(p => p.trim()).filter(Boolean);
  else if (s.includes(',')) parts = s.split(',').map(p => p.trim()).filter(Boolean);
  if (parts && parts.length >= 3) {
    // item may contain commas: take the numeric/unit fields from the end
    const price = num(parts[parts.length - 1]);
    let rest = parts.slice(0, -1), unit = '', qty = NaN;
    if (rest.length >= 3 && !isFinite(num(rest[rest.length - 1]))) unit = rest.pop();
    qty = num(rest.pop());
    if (isFinite(price) && isFinite(qty) && rest.length) return { item: rest.join(', '), qty: String(qty), unit, price: String(price) };
  }
  const m = s.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*([A-Za-z#.]+)?\s+\$?(\d[\d,]*(?:\.\d+)?)$/);
  if (m) return { item: m[1].replace(/[,\s]+$/, ''), qty: m[2], unit: (m[3] || '').replace(/\.$/, ''), price: m[4].replace(/,/g, '') };
  return undefined;
}

export function sampleInvoices() {
  const mk = (supplier, invoiceNo, date, rows, offset) => ({
    id: 'sample-' + offset, supplier, invoiceNo, date, sample: true, createdAt: Date.now() + offset,
    lines: rows.map(([item, qty, unit, price]) => ({ item, qty, unit, price }))
  });
  const week2 = [['Chicken thighs, boneless', 40, 'lb', 2.39], ['Canola oil 35 lb', 2, 'cs', 41.25], ['Yellow onions 50 lb', 1, 'bag', 23.50], ['Heavy cream', 12, 'qt', 3.15]];
  return [
    mk('Valley Foodservice', 'VF-10421', '2026-09-28', [['Chicken thighs, boneless', 40, 'lb', 2.10], ['Canola oil 35 lb', 2, 'cs', 38.50], ['Yellow onions 50 lb', 1, 'bag', 24.00], ['Heavy cream', 12, 'qt', 2.95]], 1),
    mk('Wasatch Produce', 'WP-332', '2026-09-30', [['Romaine hearts', 2, 'cs', 32.00], ['Lemons 115 ct', 1, 'cs', 41.00], ['Cilantro', 1, 'cs', 18.00]], 2),
    mk('Valley Foodservice', 'VF-10588', '2026-10-05', week2, 3),
    mk('Wasatch Produce', 'WP-351', '2026-10-07', [['Romaine hearts', 2, 'cs', 36.50], ['Lemons 115 ct', 1, 'cs', 39.00], ['Cilantro', 1, 'cs', 18.00]], 4),
    mk('Valley Foodservice', 'VF-10588', '2026-10-05', week2, 5)
  ];
}
