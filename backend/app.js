// InvoicePlate backend: serves the frontend folder and a small JSON API over the database.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../database/db.js';
import { ValidationError, cleanInvoice, cleanInvoices, cleanSettings } from './validate.js';

const FRONTEND = fileURLToPath(new URL('../frontend/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};
const MAX_BODY = 2_000_000;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Body is not valid JSON'); }
}

function send(res, status, body) {
  if (body === undefined) { res.writeHead(status).end(); return; }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(body));
}

// Routes:
//   GET    /api/state                  settings and every invoice with its lines
//   PUT    /api/settings               { restaurant?, alertPct? }
//   POST   /api/invoices               create (or replace, if the id exists)
//   PUT    /api/invoices/:id           replace one invoice
//   DELETE /api/invoices/:id           delete one invoice
//   POST   /api/invoices/bulk          { invoices, replace? }  import a backup or load sample data
//   DELETE /api/invoices[?sample]      delete all invoices, or only the sample ones
async function handleApi(store, req, res, url) {
  const [resource, id, extra] = url.pathname.split('/').filter(Boolean).slice(1);
  const method = req.method;
  if (extra === undefined) {
    if (resource === 'state' && !id && method === 'GET') return send(res, 200, store.getState());
    if (resource === 'settings' && !id && method === 'PUT') return send(res, 200, store.updateSettings(cleanSettings(await readJson(req))));
    if (resource === 'invoices') {
      if (!id && method === 'POST') return send(res, 201, store.saveInvoice(cleanInvoice(await readJson(req))));
      if (!id && method === 'DELETE') { store.deleteInvoices({ sampleOnly: url.searchParams.has('sample') }); return send(res, 204); }
      if (id === 'bulk' && method === 'POST') {
        const body = await readJson(req);
        return send(res, 200, store.addInvoices(cleanInvoices(body.invoices), { replace: body.replace === true }));
      }
      if (id && id !== 'bulk' && method === 'PUT') return send(res, 200, store.saveInvoice(cleanInvoice({ ...(await readJson(req)), id })));
      if (id && id !== 'bulk' && method === 'DELETE') {
        if (!store.deleteInvoice(id)) throw new HttpError(404, 'No such invoice');
        return send(res, 204);
      }
    }
  }
  throw new HttpError(404, 'No such endpoint');
}

async function serveFrontend(req, res, url) {
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = normalize(join(FRONTEND, rel));
  if (!file.startsWith(FRONTEND)) throw new HttpError(403, 'Forbidden');
  let body;
  try { body = await readFile(file); }
  catch { throw new HttpError(404, 'Not found'); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(req.method === 'HEAD' ? undefined : body);
}

export function createApp({ dbPath, dbKey } = {}) {
  const store = openDatabase(dbPath, dbKey);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(store, req, res, url);
      else if (req.method === 'GET' || req.method === 'HEAD') await serveFrontend(req, res, url);
      else throw new HttpError(405, 'Method not allowed');
    } catch (err) {
      const status = err instanceof ValidationError ? 400 : err.status || 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) send(res, status, { error: status === 500 ? 'Server error' : err.message });
    }
  });
  server.on('close', () => store.close());
  return server;
}
