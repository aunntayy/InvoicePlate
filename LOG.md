# Work log

Oldest first. One short entry per session, added at the bottom. Earlier entries are never edited.

## 2026-10-22

- Wrote CLAUDE.md with project context.
- Built the first prototype: add invoices, price-change alerts, duplicate check, price report.
- Installed skills: taste skill (design) and Vercel agent skills.
- Redesigned the screens and fixed two bugs (duplicate counted as a delivery, unit field cut off on phones).
- Split the project into frontend, backend (Node server) and database (SQLite), with tests.
- Next: commit, then encrypt stored data before real pilot invoices.

## 2026-10-22 (session 2)

- Installed Graphify (code map skill) and Node; mapped the code, nothing new found.
- Wrote the owner interview script and pilot outreach messages (docs/).
- Encrypted stored invoices and settings (key in .env via `npm run keygen`); deletions now overwrite data.
- Added encryption tests; all 13 pass.
- Next: back up DB_KEY, commit, then start booking interviews.

## 2026-10-22 (session 3)

- Reinstalled the taste skill and Vercel agent skills on this Mac (they were missing).
- Built the landing page (landing/): live invoice-line example, "Try it" report, founder letter, free pilot, FAQ, join form.
- Moved the summary text into invoice-logic.js so the app and the page share it; 14 tests pass.
- Page passes the taste inspector (0 FAIL) at desktop, tablet and phone, and the Vercel guidelines review.
- Next: add your name and photo to the letter, set up hello@invoiceplate.com, then host the page.
