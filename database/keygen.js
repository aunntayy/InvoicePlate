// Creates the database key (DB_KEY) in .env. It never replaces an existing key: without it, the stored invoices can't be read.
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { newKey } from './crypto.js';

const ENV = fileURLToPath(new URL('../.env', import.meta.url));

if (existsSync(ENV) && /^DB_KEY=/m.test(readFileSync(ENV, 'utf8'))) {
  console.error('.env already has a DB_KEY. Keeping it: a new key could not read the existing database.');
  process.exit(1);
}
appendFileSync(ENV, `DB_KEY=${newKey()}\n`, { mode: 0o600 });
console.log('Wrote DB_KEY to .env. Back it up somewhere safe (a password manager): if it is lost, the invoices are unreadable.');
