// Tiny static server for the exported app (`npm run build && npm start`).
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../out/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const BASE = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
const PORT = Number(process.env.PORT || 3000);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
};

createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (BASE) { if (!path.startsWith(BASE)) { res.writeHead(404).end('Not found'); return; } path = path.slice(BASE.length) || '/'; }
  let file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { const nf = join(ROOT, '404.html'); res.writeHead(404, { 'Content-Type': TYPES['.html'] }); existsSync(nf) ? createReadStream(nf).pipe(res) : res.end('Not found'); return; }
  const headers = { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' };
  if (file.endsWith('sw.js') || file.endsWith('.html')) headers['Cache-Control'] = 'no-cache';
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`DTA Tracker on http://localhost:${PORT}${BASE}/`));
