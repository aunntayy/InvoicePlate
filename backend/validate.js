// Checks request bodies before they reach the database. Anything the client sends is untrusted.
export class ValidationError extends Error {}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function cleanInvoice(input, label = 'Invoice') {
  if (!input || typeof input !== 'object') throw new ValidationError(`${label} must be an object`);
  const supplier = str(input.supplier, 200), invoiceNo = str(input.invoiceNo, 100), date = str(input.date, 10);
  if (!supplier) throw new ValidationError(`${label}: supplier is required`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ValidationError(`${label}: date must be YYYY-MM-DD`);
  if (!Array.isArray(input.lines) || !input.lines.length) throw new ValidationError(`${label}: add at least one line`);
  if (input.lines.length > 500) throw new ValidationError(`${label}: more than 500 lines`);
  const lines = input.lines.map((l, i) => {
    const item = str(l?.item, 300), unit = str(l?.unit, 20), qty = Number(l?.qty), price = Number(l?.price);
    if (!item || !(qty > 0) || !(price >= 0) || !Number.isFinite(qty) || !Number.isFinite(price)) {
      throw new ValidationError(`${label}, line ${i + 1}: needs an item, a quantity above 0 and a price`);
    }
    return { item, qty, unit, price };
  });
  const id = typeof input.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(input.id) ? input.id : null;
  const createdAt = Number.isFinite(input.createdAt) ? Math.trunc(input.createdAt) : Date.now();
  return { id, supplier, invoiceNo, date, lines, sample: input.sample === true, createdAt };
}

export function cleanInvoices(list) {
  if (!Array.isArray(list)) throw new ValidationError('invoices must be a list');
  if (list.length > 5000) throw new ValidationError('more than 5000 invoices in one request');
  return list.map((inv, i) => cleanInvoice(inv, `Invoice ${i + 1}`));
}

export function cleanSettings(input) {
  const out = {};
  if (input && 'restaurant' in input) out.restaurant = str(input.restaurant, 200);
  if (input && 'alertPct' in input) {
    const v = Number(input.alertPct);
    if (!(v >= 0 && v <= 100)) throw new ValidationError('alertPct must be between 0 and 100');
    out.alertPct = v;
  }
  return out;
}
