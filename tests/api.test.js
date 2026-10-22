import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../backend/app.js';
import { sampleInvoices } from '../frontend/lib/invoice-logic.js';

let server, base;
before(async () => {
  server = createApp({ dbPath: ':memory:' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));

const call = async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const invoice = { id: 'inv1', supplier: 'Valley Foodservice', invoiceNo: 'A1', date: '2026-09-28', createdAt: 1, lines: [{ item: 'Chicken thighs', qty: 40, unit: 'lb', price: 2.1 }] };

test('starts empty with default settings', async () => {
  const { status, body } = await call('GET', '/api/state');
  assert.equal(status, 200);
  assert.deepEqual(body, { settings: { restaurant: '', alertPct: 2 }, invoices: [] });
});

test('creates, updates and deletes an invoice', async () => {
  assert.equal((await call('POST', '/api/invoices', invoice)).status, 201);
  let state = (await call('GET', '/api/state')).body;
  assert.deepEqual(state.invoices, [invoice]);

  const edited = { ...invoice, lines: [{ item: 'Chicken thighs', qty: 40, unit: 'lb', price: 2.39 }, { item: 'Cilantro', qty: 1, unit: 'cs', price: 18 }] };
  assert.equal((await call('PUT', '/api/invoices/inv1', edited)).status, 200);
  state = (await call('GET', '/api/state')).body;
  assert.equal(state.invoices.length, 1);
  assert.deepEqual(state.invoices[0].lines.map(l => l.price), [2.39, 18]);

  assert.equal((await call('DELETE', '/api/invoices/inv1')).status, 204);
  assert.equal((await call('DELETE', '/api/invoices/inv1')).status, 404);
});

test('rejects invalid invoices with a reason', async () => {
  const { status, body } = await call('POST', '/api/invoices', { ...invoice, lines: [{ item: 'Chicken', qty: 0, price: 2 }] });
  assert.equal(status, 400);
  assert.match(body.error, /line 1/);
  assert.equal((await call('POST', '/api/invoices', { ...invoice, date: '10/05/2026' })).status, 400);
});

test('loads, removes and replaces sample data in bulk', async () => {
  await call('POST', '/api/invoices', invoice);
  assert.equal((await call('POST', '/api/invoices/bulk', { invoices: sampleInvoices() })).status, 200);
  assert.equal((await call('GET', '/api/state')).body.invoices.length, 6);
  await call('DELETE', '/api/invoices?sample');
  assert.deepEqual((await call('GET', '/api/state')).body.invoices.map(i => i.id), ['inv1']);
  await call('POST', '/api/invoices/bulk', { invoices: sampleInvoices(), replace: true });
  const ids = (await call('GET', '/api/state')).body.invoices.map(i => i.id);
  assert.equal(ids.length, 5);
  assert.ok(!ids.includes('inv1'));
  await call('DELETE', '/api/invoices');
  assert.equal((await call('GET', '/api/state')).body.invoices.length, 0);
});

test('saves settings', async () => {
  const { body } = await call('PUT', '/api/settings', { restaurant: 'Bistro on 9th', alertPct: 5 });
  assert.deepEqual(body, { restaurant: 'Bistro on 9th', alertPct: 5 });
  assert.equal((await call('PUT', '/api/settings', { alertPct: -1 })).status, 400);
});

test('serves the frontend and nothing outside it', async () => {
  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>InvoicePlate<\/title>/);
  assert.equal((await fetch(base + '/lib/invoice-logic.js')).headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.notEqual((await fetch(base + '/%2e%2e/package.json')).status, 200);
  assert.equal((await fetch(base + '/api/nope')).status, 404);
});
