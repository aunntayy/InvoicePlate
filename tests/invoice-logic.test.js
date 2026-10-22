import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, analyze, findDuplicates, sampleInvoices, sumMoney, alertText, summaryText } from '../frontend/lib/invoice-logic.js';

test('parseLine reads comma, tab and space formats', () => {
  assert.deepEqual(parseLine('Chicken thighs, boneless, 40, lb, 2.39'), { item: 'Chicken thighs, boneless', qty: '40', unit: 'lb', price: '2.39' });
  assert.deepEqual(parseLine('Canola oil 35lb\t2\tcs\t41.25'), { item: 'Canola oil 35lb', qty: '2', unit: 'cs', price: '41.25' });
  assert.deepEqual(parseLine('Heavy cream 12 qt $3.15'), { item: 'Heavy cream', qty: '12', unit: 'qt', price: '3.15' });
  assert.deepEqual(parseLine('Lemons, 1, 41'), { item: 'Lemons', qty: '1', unit: '', price: '41' });
  assert.equal(parseLine('   '), null);
  assert.equal(parseLine('garbage line'), undefined);
});

test('analyze finds price changes with their cost on the delivery', () => {
  const { events } = analyze(sampleInvoices());
  const chicken = events.find(e => e.line.item.startsWith('Chicken'));
  assert.equal(chicken.impact, 11.6);
  assert.equal(Math.round(chicken.pct), 14);
  assert.match(alertText(chicken), /went up 14%: \$2\.10\/lb → \$2\.39\/lb\. Extra cost on this delivery: \$11\.60\./);
  const extra = sumMoney(events.filter(e => e.pct > 0).map(e => e.impact));
  assert.equal(extra, 28.5);
});

test('the later copy of a duplicate invoice is flagged and not counted as a delivery', () => {
  const invoices = sampleInvoices();
  const dups = findDuplicates(invoices);
  assert.equal(dups.length, 1);
  assert.equal(dups[0].reason, 'Same invoice number');
  const chicken = analyze(invoices).items.find(i => i.item.startsWith('Chicken'));
  assert.equal(chicken.count, 2);
  assert.equal(chicken.prev, 2.1);
});

test('sumMoney adds the rounded cents shown on screen', () => {
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
  assert.equal(sumMoney([1.006, 1.006]), 2.02); // two lines shown as $1.01 total $2.02, not $2.01
});

test('summary lists rises over the threshold, the extra paid and the duplicate', () => {
  const text = summaryText(sampleInvoices(), { restaurant: 'Bistro on 9th', alertPct: 10 }, '2026-10-22');
  assert.match(text, /^Price report for Bistro on 9th, Oct 22, 2026/);
  assert.match(text, /Chicken thighs, boneless \(Valley Foodservice\) went up 14%/);
  assert.match(text, /Romaine hearts/);
  assert.ok(!text.includes('Heavy cream')); // 6.8% is under the 10% threshold
  assert.match(text, /Extra paid vs\. previous prices: \$20\.60/);
  assert.match(text, /Valley Foodservice #VF-10588 on Oct 5, 2026 \(\$239\.40\) matches/);
});
