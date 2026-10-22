# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# InvoicePlate

## Repository state

A Node app with no npm dependencies and no build step. It needs Node 22.13 or newer for the built-in `node:sqlite`.

- `npm start` runs the server at http://localhost:3000. `npm run dev` restarts it when files change.
- `npm test` runs every `*.test.js` file with `node:test`. To run one file: `node --test tests/api.test.js`. To run one test: `node --test --test-name-pattern="saves settings"`.
- Environment variables: `PORT`, `HOST` (default `127.0.0.1`, so localhost only), `DB_PATH` (default `database/data/invoiceplate.db`, ignored by git) and `DB_KEY` (the encryption key). Point `DB_PATH` at a scratch file when testing by hand.
- `npm run keygen` writes `DB_KEY` to `.env` (ignored by git), which `npm start` and `npm run dev` load. The server won't open a database file without the key, and it never replaces an existing key: a lost key means unreadable data.

Layout:
- `frontend/`: static files served by the backend. `index.html` holds the markup, `styles.css` the design, and `app.js` the screens, forms and API calls. `lib/invoice-logic.js` holds the pure logic (parsing, price comparison, duplicates, formatting). It has no DOM access, so the browser and the tests both import it.
- `backend/`: `server.js` starts the app. `app.js` serves `frontend/` plus the JSON API (the routes are listed in a comment above `handleApi`). `validate.js` checks every request body before it reaches the database.
- `database/`: `schema.sql` is applied on every start, so its statements must be idempotent. `db.js` holds all the SQL. There is one restaurant (`RESTAURANT_ID = 1`) until logins exist, but every query is already scoped by `restaurant_id`. `invoice_lines.confidence` is reserved for AI extraction. `crypto.js` encrypts the restaurant name, supplier, invoice number and each line (AES-256-GCM, sealed in `db.js`). Ids, dates and flags stay plain so SQL can scope and sort them. `secure_delete` is on, so deleted rows are overwritten.
- `landing/`: the public landing page (static `index.html`, `styles.css`, `main.js`, pictures and their credits in `assets/`). `main.js` imports `../frontend/lib/invoice-logic.js`, so its live examples use the real price logic; deploy the repo root, or copy that file next to it. Built with the taste skill's "product performs" direction; check it with `inspect.mjs landing/index.html`.
- `tests/`: `invoice-logic.test.js` covers the pure logic. `api.test.js` starts the app on an in-memory database. `db.test.js` checks encryption, key handling and deletion on real files.
- `docs/`: `interview-script.md` (owner interviews) and `pilot-outreach.md` (messages asking for interviews and pilots).

How it works:
- The backend only stores data. All analysis runs in the browser from `GET /api/state` (settings plus every invoice with its lines, in the same shape as an exported backup). Each change calls the API, then reloads state (`commit()` in `app.js`).
- Prices are compared in `analyze()`, which walks invoices oldest to newest (by date, then `createdAt`) and compares each line with the last price for the same key: normalized supplier + item name + unit (`lineKey`). Every change is an event with `pct` and `impact` (price delta × qty). The report, the post-save summary and the "Copy summary" text all come from these events.
- Duplicates are found in `dupReason()`: same supplier plus the same invoice number, or the same date and total.
- Screens are hash routes: `#add`, `#report` and `#invoices` (`show()` switches them and sets the one shared `h1`). Adding `?demo` to the address shows the sample invoices in memory, without reading or writing the database. Use it to show owners, and for screenshots.
- The visual design follows the `design-taste-frontend` skill's app-screen rules, in the "achromatic ledger" style. The interface itself has no color. The one blue (`--hue`) goes only on the "Where the extra went" bars, and red ▲ / green ▼ only on price changes. Check visual changes with the skill's `inspect.mjs --app` against `http://localhost:3000/?demo#report` (and the other routes). Its output goes to `.taste-skill/`, which git ignores.
- A possible duplicate (the later copy) is skipped in `analyze()`, so a delivery entered twice doesn't change prices or the "Bought" count.
- `parseLine()` handles pasted lines in the forms "item, qty, unit, price", tab-separated spreadsheet rows and "item qty unit price". Price means unit price, not line total.
- `LOG.md` is the daily work log. At the end of each session, add a new entry at the bottom (a second session on the same day is "YYYY-MM-DD (session 2)"): 3-6 one-line bullets on what was done, plus a "Next:" line. Never edit or merge earlier entries. Keep it short and plain.

## What this project is

InvoicePlate (invoiceplate.com) is a SaaS product for independent restaurants. Owners snap or forward supplier invoices, and InvoicePlate extracts the line items, flags price increases, short deliveries and duplicate charges, and shows what they cost. The goal is food-cost visibility at a much lower price than established tools.

## Who it's for

- Primary: owner-operated, single-location, full-service restaurants (about $700K-$2M in sales) using spreadsheets or nothing, who are priced out of $330+/month tools.
- Secondary: small groups of 2-4 locations without a finance team.
- Channel: bookkeepers and accountants who serve restaurants and can bring many clients at once.
- Test market: start with Salt Lake City, one cuisine type if possible.

## Founder context

Solo founder with a CS background and a fintech master's. Works as a server, so has direct access to restaurant owners and kitchen knowledge. Building part-time while keeping the day job.

## Positioning

- Lead with dollars recovered, not software features.
- Alerts first, dashboards second: a text or weekly summary that says "chicken thighs went up 14%, here is the cost."
- Cheaper and faster to set up than MarginEdge, Restaurant365, MarketMan and similar tools. Forward 20 invoices, get a first report the same day.
- Price hypothesis (to test, not proven): $79-$99/month Starter, $149-$199/month Plus, $25-$40 per client entity per month for bookkeepers.

## Current stage: concierge MVP

The product is manual-assisted. AI reads the invoice, the founder reviews low-confidence lines, and the owner gets a real report. Do not over-automate before validation.

What exists:

- A working prototype app: add invoice lines by typing or pasting, detect price changes against previous prices, flag possible duplicate invoices, and produce a price report. Data is stored in a local SQLite database, with invoice fields encrypted (see Guardrails).
- An owner and manager interview script and pilot outreach messages, in `docs/`.

Not built yet:

- Photo or PDF extraction with the Claude API. It belongs in `backend/`, behind one function, and writes `invoice_lines.confidence`.
- Intake by email forwarding or upload form.
- Item matching across suppliers and naming variations.
- POS and accounting integrations, recipe costing, logins, payments.

## Two-month goal (go/no-go)

- Month 1: 15-20 owner and manager interviews, and 3-5 restaurants sending real invoices for a free pilot. At least one owner says the report showed them something new.
- Month 2: extraction accuracy of about 90%+ on real invoices (98%+ after review), under about 3 minutes of founder time per invoice, and 2-3 pilots agree to pay $79-$99/month.
- Decide thresholds before starting. If only one restaurant pays, extend the pilot rather than build more. If there is interest but no payment, test a lower or savings-based price, and stop if the answer is "nice to have."

## Build priorities, in order

1. Pilot outreach message and the interview script (non-code, blocks month 1).
2. Concierge back office: invoice photo or PDF in, Claude extracts lines with a confidence score, founder reviews low-confidence lines, cleaned lines feed the price report.
3. Intake flow: a dedicated email address for forwarding, then a simple upload form.
4. Landing page, once there are findings and a case study.

## Technical guidelines

- Keep the AI/extraction layer behind one function so the model provider can be swapped.
- Extraction returns strict JSON with a confidence score per line. Low-confidence lines go to human review before they count.
- Items are matched by supplier and name. Item matching is the hardest technical problem, so do it by hand with the first customers and learn from corrections.
- Track these numbers from the first pilot: extraction accuracy, founder minutes per invoice, findings per restaurant, and whether owners keep sending invoices without reminders.
- Keep the frontend simple and mobile-friendly. Owners will use phones, often in a busy kitchen.

## Guardrails

- No money movement. Do not build bill payment or anything that triggers money-transmission rules. Stay read-only on finances.
- Use invoices owners send. Do not scrape supplier portals, which can violate their terms.
- Privacy and security. Invoices are financial documents. Encrypt stored data, tell pilots what is stored, and offer deletion on request.
- Don't overpromise accuracy. Say each report is reviewed and show confidence flags.
- Avoid unsourced numbers in customer-facing material. Mark estimates as estimates.

## Competitors to keep in mind

MarginEdge (about $330/month per location, the market leader), Restaurant365 (from about $435/month), MarketMan (about $239/month), Ottimate (formerly Plate IQ), xtraCHEF (owned by Toast), Craftable, Apicbase, Supy. Indirect: QuickBooks and generic bill capture, spreadsheets, bookkeepers, and distributor portals. Pricing here comes from public pages and may have changed, so re-check before using it in sales material.

## Working style

- Be direct and practical. The founder is a student and part-time builder, so keep scope small and say what to do next.
- Prefer the smallest thing that tests the riskiest assumption.
- When asked to build, state assumptions in one line and proceed. Ask before anything hard to undo.
