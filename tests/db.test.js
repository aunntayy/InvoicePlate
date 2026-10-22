import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../database/db.js';
import { newKey } from '../database/crypto.js';

const dir = mkdtempSync(join(tmpdir(), 'invoiceplate-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const invoice = { id: 'inv1', supplier: 'Valley Foodservice', invoiceNo: 'A1', date: '2026-09-28', createdAt: 1, lines: [{ item: 'Chicken thighs', qty: 40, unit: 'lb', price: 2.1 }] };
// Every byte SQLite wrote: the database plus its WAL and shared-memory files.
const fileText = path => readdirSync(dir).filter(f => f.startsWith(path.split('/').pop())).map(f => readFileSync(join(dir, f), 'latin1')).join('');

test('stores supplier, invoice number, lines and name encrypted, and reads them back', () => {
  const path = join(dir, 'a.db'), key = newKey();
  let store = openDatabase(path, key);
  store.saveInvoice(invoice);
  store.updateSettings({ restaurant: 'Bistro on 9th' });
  store.close();
  for (const secret of ['Valley Foodservice', 'Chicken thighs', 'Bistro on 9th']) assert.ok(!fileText(path).includes(secret), secret);

  store = openDatabase(path, key);
  assert.deepEqual(store.getState(), { settings: { restaurant: 'Bistro on 9th', alertPct: 2 }, invoices: [invoice] });
  store.close();
});

test('refuses a missing or wrong key', () => {
  const path = join(dir, 'b.db');
  assert.throws(() => openDatabase(path), /DB_KEY is not set/);
  assert.throws(() => openDatabase(path, 'too-short'), /32 random bytes/);
  openDatabase(path, newKey()).close();
  assert.throws(() => openDatabase(path, newKey()), /does not match/);
});

test('deleting invoices leaves no trace of them in the file', () => {
  const path = join(dir, 'c.db'), key = newKey();
  const store = openDatabase(path, key);
  const sealed = () => fileText(path).match(/v1:[A-Za-z0-9+/=]+/g) || [];
  const before = sealed();
  store.saveInvoice(invoice);
  const added = sealed().filter(s => !before.includes(s));
  assert.ok(added.length > 0);
  store.deleteInvoices();
  store.close();
  for (const s of added) assert.ok(!fileText(path).includes(s));
});
