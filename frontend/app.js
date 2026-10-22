// InvoicePlate app: screens, forms and rendering. Data comes from the backend API;
// price comparison and duplicate checks live in lib/invoice-logic.js.
import {
  money, signed, num, sumMoney, norm, invTotal, fmtDate, fmtShort, fmtPct, perUnit, invLabel, plural,
  sortInvoices, dupReason, findDuplicates, analyze, alertText, parseLine, sampleInvoices,
} from './lib/invoice-logic.js';

// ?demo shows the sample invoices in memory, without reading or writing the database (for showing owners).
const DEMO = new URLSearchParams(location.search).has('demo');
const DEFAULT_SETTINGS = { alertPct: 2, restaurant: '' };
let db = { invoices: [], settings: { ...DEFAULT_SETTINGS } };
let draft;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const restaurantName = () => db.settings.restaurant || 'Your restaurant';
function today() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
function showMsg(sel, html, type) { const el = $(sel); el.className = 'msg ' + (type || ''); el.innerHTML = html; }

// ---------- server ----------
async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `The server answered ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

async function load() {
  if (DEMO) { db.invoices = sampleInvoices(); showMsg('#server-msg', ''); return; }
  try {
    db = await api('GET', '/state');
    showMsg('#server-msg', '');
  } catch (e) {
    showMsg('#server-msg', `Can't reach the InvoicePlate server, so nothing can be loaded or saved. Start it with <b>npm start</b> in the project folder, then open <b>http://localhost:3000</b>.`, 'error');
  }
}

// Applies a change: in demo mode to the in-memory data, otherwise on the server, then reloads
// what the server stored so the screen always shows the database. Returns false if it failed.
async function commit({ local, remote, msg }) {
  try {
    if (DEMO) local();
    else { await remote(); db = await api('GET', '/state'); }
    return true;
  } catch (e) {
    showMsg(msg, `Couldn't save: ${esc(e.message)}`, 'error');
    return false;
  }
}

const debounced = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const saveSettings = debounced(patch => {
  if (DEMO) return;
  api('PUT', '/settings', patch)
    .then(() => { if ('restaurant' in patch) $('#name-stamp').textContent = 'Saved'; })
    .catch(e => showMsg('#data-msg', `Couldn't save the setting: ${esc(e.message)}`, 'error'));
}, 400);

// One price change as a row: the item, the money it moved, old price to new, and the change signal.
function changeRow(e, maxImpact, showDate = true) {
  const up = e.pct > 0;
  const bar = up && maxImpact > 0 ? `<div class="bar" aria-hidden="true"><i style="width:${Math.max(2, e.impact / maxImpact * 100).toFixed(1)}%"></i></div>` : '';
  return `<li>
    <div class="r-top"><span class="r-name">${esc(e.line.item)}</span><span class="r-amt num">${signed(e.impact)}</span></div>
    ${bar}
    <div class="r-sub"><span>${esc(e.inv.supplier)}${showDate ? ' · ' + esc(fmtShort(e.inv.date)) : ''} · <span class="num">${esc(perUnit(e.prev.price, e.line.unit))} → ${esc(perUnit(e.line.price, e.line.unit))}</span></span>
      <span class="sig num ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${fmtPct(e.pct)}</span></div>
  </li>`;
}

// ---------- add / edit form ----------
const blankLine = () => ({ item: '', qty: '', unit: '', price: '' });

function resetForm() {
  draft = { id: null, lines: [blankLine(), blankLine(), blankLine()] };
  $('#supplier').value = ''; $('#invoiceNo').value = ''; $('#date').value = today();
  showMsg('#form-msg', ''); showMsg('#paste-msg', '');
  renderLines(); renderSupplierList(); renderAddSub();
}

function editInvoice(id) {
  const inv = db.invoices.find(x => x.id === id);
  if (!inv) return;
  draft = { id, lines: inv.lines.map(l => ({ item: l.item, qty: String(l.qty), unit: l.unit, price: String(l.price) })) };
  $('#supplier').value = inv.supplier; $('#invoiceNo').value = inv.invoiceNo; $('#date').value = inv.date;
  $('#saved').innerHTML = ''; showMsg('#form-msg', ''); showMsg('#paste-msg', '');
  renderLines();
  if (location.hash === '#add') renderAddSub(); else location.hash = 'add';
}

function renderAddSub() {
  if (currentView() !== 'add') return;
  const sub = $('#sub');
  sub.classList.remove('finding');
  $('#title').textContent = draft.id ? 'Edit invoice' : 'Add invoice';
  if (draft.id) {
    const inv = db.invoices.find(x => x.id === draft.id);
    sub.textContent = inv ? `${invLabel(inv)}, ${fmtDate(inv.date)}. Saving replaces the stored copy.` : '';
    return;
  }
  const n = db.invoices.length, s = new Set(db.invoices.map(i => norm(i.supplier))).size;
  sub.textContent = n
    ? `${plural(n, 'invoice')} from ${plural(s, 'supplier')} so far. Prices are compared with the last delivery when you save.`
    : 'No invoices yet. Prices on the first invoice from each supplier become the baseline.';
}

function lineTotal(l) {
  const q = String(l.qty).trim() === '' ? 1 : num(l.qty), p = num(l.price);
  return isFinite(q) && isFinite(p) ? q * p : null;
}

function renderLines() {
  $('#lines').innerHTML = draft.lines.map((l, i) => {
    const t = lineTotal(l);
    return `<div class="line" data-i="${i}">
      <input class="f-item" data-f="item" placeholder="Item" aria-label="Item" value="${esc(l.item)}">
      <input class="f-qty num" data-f="qty" inputmode="decimal" placeholder="Qty" aria-label="Quantity" value="${esc(l.qty)}">
      <input class="f-unit" data-f="unit" list="unit-list" placeholder="Unit" aria-label="Unit" value="${esc(l.unit)}">
      <input class="f-price num" data-f="price" inputmode="decimal" placeholder="Price" aria-label="Unit price" value="${esc(l.price)}">
      <span class="f-total num">${t === null ? '—' : money(t)}</span>
      <button type="button" class="rm" data-action="remove-line" data-i="${i}" aria-label="Remove line"><svg><use href="#i-x"/></svg></button>
    </div>`;
  }).join('');
  updateDraftTotal();
}

function updateDraftTotal() {
  $('#draft-total').textContent = money(sumMoney(draft.lines.map(l => lineTotal(l) || 0)));
}

function renderSupplierList() {
  const names = [...new Set(db.invoices.map(i => i.supplier))].sort();
  $('#supplier-list').innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
}

function parsePaste() {
  const rows = $('#paste').value.split(/\r?\n/);
  const added = [], failed = [];
  for (const r of rows) {
    const p = parseLine(r);
    if (p) added.push(p); else if (p === undefined) failed.push(r.trim());
  }
  if (!added.length && !failed.length) return;
  draft.lines = draft.lines.filter(l => l.item || l.qty || l.price || l.unit).concat(added);
  if (!draft.lines.length) draft.lines.push(blankLine());
  renderLines();
  $('#paste').value = failed.join('\n');
  let html = added.length ? `Added ${plural(added.length, 'line')}. Check them before saving.` : '';
  if (failed.length) html += ` Couldn't read ${plural(failed.length, 'line')} (left in the box). Use: item, qty, unit, price.`;
  showMsg('#paste-msg', html.trim(), failed.length ? 'warn' : 'ok');
}

async function saveInvoice(force) {
  const supplier = $('#supplier').value.trim(), invoiceNo = $('#invoiceNo').value.trim(), date = $('#date').value;
  if (!supplier || !date) return showMsg('#form-msg', 'Add a supplier and an invoice date.', 'error');

  const lines = [], bad = [];
  draft.lines.forEach((l, i) => {
    if (![l.item, l.qty, l.unit, l.price].some(v => String(v).trim())) return;
    const item = String(l.item).trim(), qty = String(l.qty).trim() === '' ? 1 : num(l.qty), price = num(l.price);
    if (!item || !(qty > 0) || !(price >= 0)) bad.push(i + 1);
    else lines.push({ item, qty, unit: String(l.unit).trim(), price });
  });
  if (bad.length) return showMsg('#form-msg', `Check line ${bad.join(', ')}: each line needs an item, a quantity above 0 and a price.`, 'error');
  if (!lines.length) return showMsg('#form-msg', 'Add at least one line.', 'error');

  const existing = draft.id && db.invoices.find(x => x.id === draft.id);
  const inv = { id: draft.id || uid(), supplier, invoiceNo, date, lines, createdAt: existing ? existing.createdAt : Date.now() };
  if (existing && existing.sample) inv.sample = true;

  if (!force) {
    const dups = db.invoices.filter(o => o.id !== inv.id).map(o => ({ o, reason: dupReason(inv, o) })).filter(d => d.reason);
    if (dups.length) {
      const list = dups.map(d => `<li>${esc(invLabel(d.o))}, ${esc(fmtDate(d.o.date))}, ${money(invTotal(d.o))} (${esc(d.reason.toLowerCase())})</li>`).join('');
      return showMsg('#form-msg', `<b>This may be a duplicate of an invoice already saved:</b><ul>${list}</ul>
        If it is a real second delivery, save it anyway. It will still show as a possible duplicate in the report.
        <div class="tools"><button class="btn" data-action="dismiss">Cancel</button><button class="btn primary" data-action="save-anyway">Save anyway</button></div>`, 'warn');
    }
  }

  const saved = await commit({
    local: () => { if (existing) Object.assign(existing, inv); else db.invoices.push(inv); },
    remote: () => existing ? api('PUT', '/invoices/' + inv.id, inv) : api('POST', '/invoices', inv),
    msg: '#form-msg',
  });
  if (!saved) return;
  resetForm();
  renderSaved(db.invoices.find(x => x.id === inv.id) || inv, !!existing);
  window.scrollTo(0, 0);
}

function renderSaved(inv, edited) {
  const evs = analyze(db.invoices).events.filter(e => e.inv.id === inv.id).sort((a, b) => b.impact - a.impact);
  const ups = evs.filter(e => e.pct > 0);
  const extra = sumMoney(ups.map(e => e.impact));
  const maxImpact = ups.length ? ups[0].impact : 0;
  const firstFromSupplier = !db.invoices.some(o => o.id !== inv.id && norm(o.supplier) === norm(inv.supplier) && (o.date || '') <= (inv.date || ''));
  let body;
  if (evs.length) body = `<ul class="rows">${evs.map(e => changeRow(e, maxImpact, false)).join('')}</ul>`;
  else if (firstFromSupplier) body = `<p class="empty-line">First invoice from ${esc(inv.supplier)}. These prices are the baseline for the next delivery.</p>`;
  else body = `<p class="empty-line">No price changes compared with the last delivery from ${esc(inv.supplier)}.</p>`;
  const head = ups.length ? `${plural(ups.length, 'price')} went up: <span class="num">${money(extra)}</span> more than last time` : (evs.length ? 'Prices went down on this invoice' : (edited ? 'Invoice updated' : 'Invoice saved'));
  $('#saved').innerHTML = `<div class="panel" style="margin-bottom:var(--gap)">
    <div class="panel-head"><h2>${head}</h2><a class="text-btn" href="#report">Open report</a></div>
    <p class="meta" style="margin:-8px 0 12px">${edited ? 'Updated' : 'Saved'} ${esc(invLabel(inv))}, ${esc(fmtDate(inv.date))} · ${plural(inv.lines.length, 'line')} · <span class="num">${money(invTotal(inv))}</span></p>
    ${body}</div>`;
}

// ---------- report ----------
function renderReport() {
  const el = $('#report-body'), sub = $('#sub');
  $('#title').textContent = 'Price report';
  sub.classList.add('finding');
  const t = Number(db.settings.alertPct) || 0;
  if (document.activeElement !== $('#alert-pct')) $('#alert-pct').value = t;
  $('.title-row [data-for=report]').hidden = !db.invoices.length;
  if (!db.invoices.length) {
    sub.textContent = 'No invoices yet.';
    el.innerHTML = `<div class="panel"><div class="panel-head"><h2>Where the extra went</h2></div>
      <p class="empty-line" style="margin-bottom:16px">Add two or more invoices from the same supplier and this report shows every price that moved, with what it cost on that delivery.</p>
      <div class="tools"><a class="btn primary" href="#add">Add invoice</a><a class="btn" href="?demo#report">See it with sample data</a></div></div>`;
    return;
  }
  const { events, items } = analyze(db.invoices);
  const alerts = events.filter(e => Math.abs(e.pct) >= t);
  const ups = alerts.filter(e => e.pct > 0).sort((a, b) => b.impact - a.impact);
  const downs = alerts.filter(e => e.pct < 0).sort((a, b) => a.impact - b.impact);
  const extra = sumMoney(ups.map(e => e.impact));
  const saved = sumMoney(downs.map(e => -e.impact));
  const dups = findDuplicates(db.invoices);
  const dupAmt = sumMoney(dups.map(d => invTotal(d.b)));
  const list = sortInvoices(db.invoices);
  const suppliers = new Set(list.map(i => norm(i.supplier))).size;

  if (ups.length) {
    const e = ups[0];
    sub.textContent = `${e.line.item} rose ${fmtPct(e.pct)} at ${e.inv.supplier}: ${money(e.impact)} more on the ${fmtShort(e.inv.date)} delivery than at the price before.`;
  } else if (dups.length) {
    sub.textContent = `No price rises of ${t}% or more, but ${invLabel(dups[0].b)} may have been entered twice.`;
  } else {
    sub.textContent = `No price changes of ${t}% or more across ${plural(list.length, 'invoice')}.`;
  }

  const maxImpact = ups.length ? ups[0].impact : 0;
  const upsHtml = ups.length ? `<ul class="rows">${ups.map(e => changeRow(e, maxImpact)).join('')}</ul>`
    : `<p class="empty-line">No price rises of ${t}% or more yet. A change shows once the same item appears on two invoices from one supplier.</p>`;
  const downsHtml = downs.length ? `<ul class="rows">${downs.map(e => changeRow(e, 0)).join('')}</ul>`
    : `<p class="empty-line">No prices fell by ${t}% or more.</p>`;
  const dupHtml = dups.length ? `<ul class="rows">${dups.map(d => `<li>
      <div class="r-top"><span class="r-name">${esc(invLabel(d.b))}</span><span class="r-amt num">${money(invTotal(d.b))}</span></div>
      <div class="r-sub"><span>${esc(fmtShort(d.b.date))} · ${esc(d.reason.toLowerCase())} as the ${esc(fmtShort(d.a.date))} copy</span><a class="text-btn" href="#invoices" style="font-size:12px;line-height:16px">Review</a></div>
    </li>`).join('')}</ul><p class="foot">Check with the supplier that each was only paid once.</p>`
    : `<p class="empty-line">None found. Invoices match when the supplier and invoice number, or the date and total, are the same.</p>`;

  const sortedItems = items.sort((a, b) => a.supplier.localeCompare(b.supplier) || a.item.localeCompare(b.item));
  const change = it => {
    if (it.prev === null || !(it.prev > 0) || it.latest === it.prev) return '<span class="meta">—</span>';
    const p = (it.latest - it.prev) / it.prev * 100;
    return `<span class="sig num ${p > 0 ? 'up' : 'down'}">${p > 0 ? '▲' : '▼'} ${fmtPct(p)}</span>`;
  };
  const rows = sortedItems.map(it => `<tr>
      <td class="id">${esc(it.item)}</td><td class="muted">${esc(it.supplier)}</td>
      <td class="n num">${esc(perUnit(it.latest, it.unit))}</td>
      <td class="n num muted">${it.prev === null ? '—' : esc(perUnit(it.prev, it.unit))}</td>
      <td class="n">${change(it)}</td><td class="n num">${it.count}</td></tr>`).join('');
  const phoneRows = sortedItems.map(it => `<li>
      <div class="r-top"><span class="r-name">${esc(it.item)}</span><span class="num">${esc(perUnit(it.latest, it.unit))}</span></div>
      <div class="r-sub"><span>${esc(it.supplier)} · before ${it.prev === null ? '—' : esc(perUnit(it.prev, it.unit))}</span>${change(it)}</div></li>`).join('');

  el.innerHTML = `
    <div class="strip">
      <div class="cell lead"><p class="label">Extra paid vs. previous prices</p><span class="val num ${extra ? '' : 'zero'}">${money(extra)}</span>
        <p class="note">${ups.length ? `On ${plural(ups.length, 'line')} that cost more than the delivery before` : 'No line cost more than the delivery before'}</p></div>
      <div class="cell"><div><p class="label">Price rises</p><p class="note">${t}% or more</p></div><span class="val num ${ups.length ? '' : 'zero'}">${ups.length}</span></div>
      <div class="cell"><div><p class="label">Possible duplicates</p><p class="note">${dups.length ? money(dupAmt) + ' if paid twice' : 'None found'}</p></div><span class="val num ${dups.length ? '' : 'zero'}">${dups.length}</span></div>
      <div class="cell"><div><p class="label">Invoices</p><p class="note">${plural(suppliers, 'supplier')} · ${esc(fmtShort(list[0].date))} to ${esc(fmtShort(list[list.length - 1].date))}</p></div><span class="val num">${list.length}</span></div>
    </div>
    <div class="grid cols-2-1">
      <div class="panel"><div class="panel-head"><h2>Where the extra went</h2><span class="meta">Largest first</span></div>${upsHtml}</div>
      <div class="stack">
        <div class="panel"><div class="panel-head"><h2>Possible duplicates</h2></div>${dupHtml}</div>
        <div class="panel"><div class="panel-head"><h2>Went down</h2><span class="meta num">${saved ? money(saved) + ' less' : ''}</span></div>${downsHtml}</div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Item prices</h2><span class="meta">${plural(sortedItems.length, 'item')}</span></div>
      <table class="desk-only"><thead><tr><th>Item</th><th>Supplier</th><th class="n">Latest</th><th class="n">Before</th><th class="n">Change</th><th class="n">Bought</th></tr></thead><tbody>${rows}</tbody></table>
      <ul class="rows phone-only">${phoneRows}</ul>
      <p class="foot">Items match by supplier, name and unit, so "Chicken thighs" and "Chix thigh" count as two items. Edit an invoice to fix a name.</p>
    </div>`;
}

function summaryText() {
  const t = Number(db.settings.alertPct) || 0;
  const { events } = analyze(db.invoices);
  const ups = events.filter(e => e.pct >= t).sort((a, b) => b.impact - a.impact);
  const dups = findDuplicates(db.invoices);
  const out = [`Price report for ${restaurantName()}, ${fmtDate(today())}`, ''];
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

async function copySummary() {
  const text = summaryText();
  try {
    await navigator.clipboard.writeText(text);
    showMsg('#copy-msg', 'Summary copied. Paste it into a text or an email.', 'ok');
  } catch (e) {
    showMsg('#copy-msg', `Copy wasn't allowed here. Select the text below and copy it:<textarea readonly style="margin-top:8px">${esc(text)}</textarea>`, 'warn');
  }
}

// ---------- invoices list ----------
function renderInvoices() {
  const dupIds = new Set(findDuplicates(db.invoices).flatMap(d => [d.a.id, d.b.id]));
  const list = sortInvoices(db.invoices).reverse();
  const total = sumMoney(list.map(invTotal));
  const suppliers = new Set(list.map(i => norm(i.supplier))).size;
  $('#title').textContent = 'Invoices';
  $('#sub').classList.remove('finding');
  $('#sub').textContent = list.length ? `${plural(list.length, 'invoice')} from ${plural(suppliers, 'supplier')}, ${money(total)} in all.` : 'No invoices saved yet.';
  $('#sample-setting').hidden = DEMO;
  const pills = inv => (dupIds.has(inv.id) ? '<span class="pill warn">Possible duplicate</span>' : '') + (inv.sample && !DEMO ? '<span class="pill neutral">Sample</span>' : '');
  const acts = inv => `<button class="text-btn" data-action="edit" data-id="${esc(inv.id)}">Edit</button><button class="text-btn danger" data-action="delete" data-id="${esc(inv.id)}">Delete</button>`;
  $('#invoice-list').innerHTML = list.length ? `
    <div class="panel-head"><h2>Saved invoices</h2><span class="meta">Newest first</span></div>
    <table class="desk-only"><thead><tr><th>Date</th><th>Supplier</th><th>Invoice #</th><th></th><th class="n">Lines</th><th class="n">Total</th><th></th></tr></thead><tbody>
    ${list.map(inv => `<tr><td class="num">${esc(inv.date)}</td><td class="id">${esc(inv.supplier)}</td><td class="muted">${esc(inv.invoiceNo) || '—'}</td>
      <td>${pills(inv)}</td><td class="n num">${inv.lines.length}</td><td class="n num">${money(invTotal(inv))}</td><td class="acts">${acts(inv)}</td></tr>`).join('')}
    </tbody></table>
    <ul class="rows phone-only">${list.map(inv => `<li>
      <div class="r-top"><span class="r-name">${esc(invLabel(inv))}</span><span class="r-amt num">${money(invTotal(inv))}</span></div>
      <div class="r-sub"><span>${esc(fmtDate(inv.date))} · ${plural(inv.lines.length, 'line')}</span><span>${pills(inv)}</span></div>
      <div class="tools" style="margin-top:8px;gap:20px">${acts(inv)}</div></li>`).join('')}</ul>`
    : `<div class="panel-head"><h2>Saved invoices</h2></div><p class="empty-line" style="margin-bottom:16px">Nothing saved yet. Add an invoice, or load the sample data below to see a report.</p>`;
}

// ---------- data ----------
function exportData() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `invoiceplate-backup-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    let d;
    try {
      d = JSON.parse(reader.result);
      if (!Array.isArray(d.invoices)) throw new Error('missing invoices');
    } catch (e) {
      return showMsg('#data-msg', "That file isn't an InvoicePlate backup.", 'error');
    }
    if (db.invoices.length && !confirm(`Replace the ${db.invoices.length} saved invoice(s) with the ${d.invoices.length} in the backup?`)) return;
    const settings = Object.assign({ ...DEFAULT_SETTINGS }, d.settings);
    const ok = await commit({
      local: () => { db = { invoices: d.invoices, settings }; },
      remote: async () => {
        await api('POST', '/invoices/bulk', { invoices: d.invoices, replace: true });
        await api('PUT', '/settings', { restaurant: settings.restaurant, alertPct: settings.alertPct });
      },
      msg: '#data-msg',
    });
    if (ok) { refreshAll(); showMsg('#data-msg', `Imported ${plural(d.invoices.length, 'invoice')}.`, 'ok'); }
  };
  reader.readAsText(file);
}

// ---------- wiring ----------
const VIEWS = ['add', 'report', 'invoices'];
function currentView() { const v = location.hash.slice(1); return VIEWS.includes(v) ? v : (db.invoices.length ? 'report' : 'add'); }

function renderChrome() {
  document.querySelectorAll('.scope').forEach(el => { el.textContent = restaurantName(); });
  $('#storage-note').textContent = DEMO ? 'Demo data. Nothing you enter here is saved.' : 'Saved in the InvoicePlate database on this computer.';
  if (document.activeElement !== $('#restaurant')) $('#restaurant').value = db.settings.restaurant;
}

function show() {
  const view = currentView();
  document.querySelectorAll('[data-view]').forEach(a => { if (a.dataset.view === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  VIEWS.forEach(v => { $('#view-' + v).hidden = v !== view; });
  document.querySelectorAll('.title-row [data-for]').forEach(t => { t.hidden = t.dataset.for !== view; });
  if (view === 'report') renderReport();
  if (view === 'invoices') renderInvoices();
  if (view === 'add') renderAddSub();
}

function refreshAll() { renderChrome(); renderSupplierList(); show(); }

window.addEventListener('hashchange', () => { show(); window.scrollTo(0, 0); });

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.action) {
    case 'add-line': draft.lines.push(blankLine()); renderLines(); $('#lines .line:last-child .f-item').focus(); break;
    case 'remove-line': draft.lines.splice(+b.dataset.i, 1); if (!draft.lines.length) draft.lines.push(blankLine()); renderLines(); break;
    case 'parse': parsePaste(); break;
    case 'save': saveInvoice(false); break;
    case 'save-anyway': saveInvoice(true); break;
    case 'dismiss': showMsg('#form-msg', ''); break;
    case 'reset': resetForm(); $('#saved').innerHTML = ''; break;
    case 'new': if (draft.id) resetForm(); $('#saved').innerHTML = ''; break;
    case 'copy': copySummary(); break;
    case 'edit': editInvoice(id); break;
    case 'delete': {
      const inv = db.invoices.find(x => x.id === id);
      if (!inv || !confirm(`Delete ${invLabel(inv)} from ${fmtDate(inv.date)}?`)) break;
      if (await commit({ local: () => { db.invoices = db.invoices.filter(x => x.id !== id); }, remote: () => api('DELETE', '/invoices/' + encodeURIComponent(id)), msg: '#data-msg' })) refreshAll();
      break;
    }
    case 'export': exportData(); break;
    case 'import': $('#import-file').click(); break;
    case 'sample':
      if (await commit({
        local: () => {},
        remote: async () => { await api('DELETE', '/invoices?sample'); await api('POST', '/invoices/bulk', { invoices: sampleInvoices() }); },
        msg: '#data-msg',
      })) { refreshAll(); showMsg('#data-msg', 'Sample data loaded. Open Price report to see the results.', 'ok'); }
      break;
    case 'remove-sample':
      if (await commit({ local: () => {}, remote: () => api('DELETE', '/invoices?sample'), msg: '#data-msg' })) {
        refreshAll(); showMsg('#data-msg', 'Sample data removed.', 'ok');
      }
      break;
    case 'wipe':
      if (!confirm('Delete every saved invoice? This cannot be undone. Export a backup first if you need one.')) break;
      if (await commit({ local: () => { db.invoices = []; }, remote: () => api('DELETE', '/invoices'), msg: '#data-msg' })) {
        refreshAll(); showMsg('#data-msg', 'All invoices deleted.', 'ok');
      }
      break;
  }
});

document.addEventListener('input', e => {
  const f = e.target.dataset.f;
  if (f) {
    const row = e.target.closest('.line'), l = draft.lines[+row.dataset.i];
    l[f] = e.target.value;
    const t = lineTotal(l);
    row.querySelector('.f-total').textContent = t === null ? '—' : money(t);
    updateDraftTotal();
  } else if (e.target.id === 'alert-pct') {
    const v = num(e.target.value);
    if (v >= 0 && v <= 100) { db.settings.alertPct = v; saveSettings({ alertPct: v }); renderReport(); }
  } else if (e.target.id === 'restaurant') {
    db.settings.restaurant = e.target.value.trim(); renderChrome();
    $('#name-stamp').textContent = '';
    saveSettings({ restaurant: db.settings.restaurant });
  }
});

$('#import-file').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });

await load();
resetForm();
refreshAll();
