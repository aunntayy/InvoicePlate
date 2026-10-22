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
