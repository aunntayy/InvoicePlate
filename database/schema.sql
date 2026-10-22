-- InvoicePlate database schema (SQLite). Applied on every start, so every statement must be idempotent.
-- Columns marked "encrypted" hold AES-256-GCM text from crypto.js, sealed and opened in db.js. Ids, dates and flags
-- stay plain so SQL can scope and sort by them. Unit prices are dollars; totals are rounded to cents in the app.

CREATE TABLE IF NOT EXISTS restaurants (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,                -- encrypted; also proves DB_KEY matches when the database opens
  alert_pct  REAL    NOT NULL DEFAULT 2,      -- flag price changes of this % or more
  created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
  id            TEXT    PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  supplier      TEXT    NOT NULL,              -- encrypted
  invoice_no    TEXT    NOT NULL,              -- encrypted
  invoice_date  TEXT    NOT NULL,              -- YYYY-MM-DD
  is_sample     INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL               -- ms since epoch; orders invoices that share a date
);
CREATE INDEX IF NOT EXISTS invoices_by_restaurant ON invoices (restaurant_id, invoice_date);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id         INTEGER PRIMARY KEY,
  invoice_id TEXT    NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  data       TEXT    NOT NULL,                 -- encrypted { item, qty, unit, price }; validate.js checks the values
  confidence REAL                              -- 0-1 from AI extraction; NULL for lines typed by hand
);
CREATE INDEX IF NOT EXISTS lines_by_invoice ON invoice_lines (invoice_id, position);
