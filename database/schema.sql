-- InvoicePlate database schema (SQLite). Applied on every start, so every statement must be idempotent.
-- Unit prices are stored as REAL dollars; totals are computed from the lines and rounded to cents in the app.

CREATE TABLE IF NOT EXISTS restaurants (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL DEFAULT '',
  alert_pct  REAL    NOT NULL DEFAULT 2,      -- flag price changes of this % or more
  created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
  id            TEXT    PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  supplier      TEXT    NOT NULL,
  invoice_no    TEXT    NOT NULL DEFAULT '',
  invoice_date  TEXT    NOT NULL,              -- YYYY-MM-DD
  is_sample     INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL               -- ms since epoch; orders invoices that share a date
);
CREATE INDEX IF NOT EXISTS invoices_by_restaurant ON invoices (restaurant_id, invoice_date);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id         INTEGER PRIMARY KEY,
  invoice_id TEXT    NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  item       TEXT    NOT NULL,
  qty        REAL    NOT NULL CHECK (qty > 0),
  unit       TEXT    NOT NULL DEFAULT '',
  unit_price REAL    NOT NULL CHECK (unit_price >= 0),
  confidence REAL                              -- 0-1 from AI extraction; NULL for lines typed by hand
);
CREATE INDEX IF NOT EXISTS lines_by_invoice ON invoice_lines (invoice_id, position);
