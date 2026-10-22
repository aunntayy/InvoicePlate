// Starts InvoicePlate. Listens on localhost only by default: invoices are financial documents.
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';
let server;
try {
  server = createApp({ dbPath: process.env.DB_PATH, dbKey: process.env.DB_KEY });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

server.listen(port, host, () => {
  console.log(`InvoicePlate is running at http://localhost:${server.address().port}`);
});
