// Data access for InvoicePlate. All SQL lives here; the backend only calls these functions.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { makeCipher, newKey } from './crypto.js';

const DEFAULT_PATH = fileURLToPath(new URL('./data/invoiceplate.db', import.meta.url));
const SCHEMA = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
// One restaurant until there are logins. Every query is already scoped by restaurant_id.
const RESTAURANT_ID = 1;

// key is DB_KEY (see crypto.js). An in-memory database may omit it and gets a throwaway key.
export function openDatabase(path = DEFAULT_PATH, key) {
  const memory = path === ':memory:';
  if (!key && !memory) throw new Error('DB_KEY is not set. Run `npm run keygen` once, then start again.');
  const { seal, open } = makeCipher(key || newKey());
  if (!memory) mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  // secure_delete overwrites deleted rows, so a deletion request leaves nothing behind in the file.
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA secure_delete = ON;');
  db.exec(SCHEMA);
  db.prepare('INSERT OR IGNORE INTO restaurants (id, name) VALUES (?, ?)').run(RESTAURANT_ID, seal(''));

  const q = {
    settings: db.prepare('SELECT name, alert_pct FROM restaurants WHERE id = ?'),
    setName: db.prepare('UPDATE restaurants SET name = ? WHERE id = ?'),
    setAlertPct: db.prepare('UPDATE restaurants SET alert_pct = ? WHERE id = ?'),
    invoices: db.prepare('SELECT id, supplier, invoice_no, invoice_date, is_sample, created_at FROM invoices WHERE restaurant_id = ? ORDER BY invoice_date, created_at'),
    lines: db.prepare(`SELECT l.invoice_id, l.data FROM invoice_lines l
      JOIN invoices i ON i.id = l.invoice_id WHERE i.restaurant_id = ? ORDER BY l.invoice_id, l.position`),
    findInvoice: db.prepare('SELECT id FROM invoices WHERE id = ? AND restaurant_id = ?'),
    insertInvoice: db.prepare('INSERT INTO invoices (id, restaurant_id, supplier, invoice_no, invoice_date, is_sample, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    updateInvoice: db.prepare('UPDATE invoices SET supplier = ?, invoice_no = ?, invoice_date = ?, is_sample = ? WHERE id = ? AND restaurant_id = ?'),
    deleteLines: db.prepare('DELETE FROM invoice_lines WHERE invoice_id = ?'),
    insertLine: db.prepare('INSERT INTO invoice_lines (invoice_id, position, data) VALUES (?, ?, ?)'),
    deleteInvoice: db.prepare('DELETE FROM invoices WHERE id = ? AND restaurant_id = ?'),
    deleteAll: db.prepare('DELETE FROM invoices WHERE restaurant_id = ?'),
    deleteSamples: db.prepare('DELETE FROM invoices WHERE restaurant_id = ? AND is_sample = 1'),
  };

  const transaction = fn => {
    db.exec('BEGIN');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  };

  // Insert, or replace the header and all lines of an invoice that already exists.
  function writeInvoice(inv) {
    const id = inv.id || randomUUID();
    if (q.findInvoice.get(id, RESTAURANT_ID)) {
      q.updateInvoice.run(seal(inv.supplier), seal(inv.invoiceNo), inv.date, inv.sample ? 1 : 0, id, RESTAURANT_ID);
      q.deleteLines.run(id);
    } else {
      q.insertInvoice.run(id, RESTAURANT_ID, seal(inv.supplier), seal(inv.invoiceNo), inv.date, inv.sample ? 1 : 0, inv.createdAt);
    }
    inv.lines.forEach((l, i) => q.insertLine.run(id, i, seal({ item: l.item, qty: l.qty, unit: l.unit, price: l.price })));
    return { ...inv, id };
  }

  function getSettings() {
    const s = q.settings.get(RESTAURANT_ID);
    return { restaurant: open(s.name), alertPct: s.alert_pct };
  }

  try { getSettings(); }
  catch { db.close(); throw new Error('DB_KEY does not match this database. Use the key it was created with.'); }

  return {
    // Everything the frontend needs, in the same shape as an exported backup.
    getState() {
      const byId = new Map();
      const invoices = q.invoices.all(RESTAURANT_ID).map(r => {
        const inv = { id: r.id, supplier: open(r.supplier), invoiceNo: open(r.invoice_no), date: r.invoice_date, createdAt: Number(r.created_at), lines: [] };
        if (r.is_sample) inv.sample = true;
        byId.set(r.id, inv);
        return inv;
      });
      for (const l of q.lines.all(RESTAURANT_ID)) byId.get(l.invoice_id)?.lines.push(open(l.data));
      return { settings: getSettings(), invoices };
    },
    updateSettings(s) {
      if ('restaurant' in s) q.setName.run(seal(s.restaurant), RESTAURANT_ID);
      if ('alertPct' in s) q.setAlertPct.run(s.alertPct, RESTAURANT_ID);
      return getSettings();
    },
    saveInvoice: inv => transaction(() => writeInvoice(inv)),
    addInvoices: (list, { replace = false } = {}) => transaction(() => {
      if (replace) q.deleteAll.run(RESTAURANT_ID);
      return list.map(writeInvoice);
    }),
    deleteInvoice: id => q.deleteInvoice.run(id, RESTAURANT_ID).changes > 0,
    deleteInvoices({ sampleOnly = false } = {}) { (sampleOnly ? q.deleteSamples : q.deleteAll).run(RESTAURANT_ID); },
    close: () => db.close(),
  };
}
