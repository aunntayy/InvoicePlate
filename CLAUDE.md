# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# InvoicePlate

## Repository state

`invoiceplate.html` is the whole prototype: one self-contained file (HTML, CSS and vanilla JS, no dependencies, no build step). Open it directly in a browser to run it. There is no linter or test suite.

How it works:
- All state is one object (`db = { invoices, settings }`) saved to `localStorage` under the key `invoiceplate.v1`. Changing its shape needs a migration in `load()` or existing pilot data breaks. Export/Import backup moves it as JSON.
- Prices are compared in `analyze()`, which walks invoices oldest to newest (by date, then `createdAt`) and compares each line with the last price for the same key: normalized supplier + item name + unit (`lineKey`). Every change is an event with `pct` and `impact` (price delta × qty). The report, the post-save summary and the "Copy summary" text all come from these events.
- Duplicates are found in `dupReason()`: same supplier plus the same invoice number, or the same date and total.
- `parseLine()` handles pasted lines in the forms "item, qty, unit, price", tab-separated spreadsheet rows and "item qty unit price". Price means unit price, not line total.
- The interview script is not in the repo yet.

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

- A working prototype page (`invoiceplate.html`): add invoice lines by typing or pasting, detect price changes against previous prices, flag possible duplicate invoices, and produce a price report. Data is stored only in the browser.
- An owner and manager interview script.

Not built yet:

- Photo or PDF extraction with the Claude API (needs a small backend, since a published page can't call the API directly).
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
