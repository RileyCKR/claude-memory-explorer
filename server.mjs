import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configPath, readConfig, updateConfig } from './lib/config.mjs';
import { hostAllowed } from './lib/guard.mjs';
import { scanAll } from './lib/scan.mjs';

const PUBLIC = fileURLToPath(new URL('./public/', import.meta.url));
// Memories hold internal hostnames and customer facts, so the default bind stays
// on loopback. WSL2 forwards Windows localhost to it.
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4317);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const send = (res, status, body, type = 'text/plain') => {
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
  res.end(body);
};
const fail = (status, message) => Object.assign(new Error(message), { status });

async function readJson(req, limit = 4096) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw fail(413, 'body too large');
  }
  try {
    return JSON.parse(body);
  } catch {
    throw fail(400, 'body is not JSON');
  }
}

async function setIgnored(req, res) {
  // A JSON content type forces a cross-site page through a CORS preflight, which
  // this server never answers. The Origin check covers a browser that skips it.
  const json = /^application\/json\b/.test(req.headers['content-type'] || '');
  const origin = req.headers.origin;
  if (!json || (origin && origin !== `http://${req.headers.host}`)) return send(res, 403, 'forbidden');
  const { id, ignored } = await readJson(req);
  if (typeof id !== 'string' || !id || typeof ignored !== 'boolean') return send(res, 400, 'expected {"id": string, "ignored": boolean}');
  const config = await updateConfig((c) => ({
    ...c,
    ignore: ignored ? [...new Set([...c.ignore, id])].sort() : c.ignore.filter((x) => x !== id),
  }));
  send(res, 200, JSON.stringify(config), 'application/json');
}

async function data(res) {
  const config = await readConfig();
  const scan = await scanAll({ ignore: config.ignore });
  send(res, 200, JSON.stringify({ ...scan, config: { path: configPath(), ignore: config.ignore } }), 'application/json');
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  try {
    if (!hostAllowed(req.headers.host, HOST)) return send(res, 403, 'forbidden host');
    if (pathname === '/api/ignore') return req.method === 'POST' ? await setIgnored(req, res) : send(res, 405, 'method not allowed');
    if (req.method !== 'GET') return send(res, 405, 'method not allowed');
    if (pathname === '/api/data') return await data(res);
    const path = normalize(join(PUBLIC, pathname === '/' ? 'index.html' : decodeURIComponent(pathname)));
    if (!path.startsWith(PUBLIC.endsWith(sep) ? PUBLIC : PUBLIC + sep)) return send(res, 403, 'forbidden');
    const body = await readFile(path);
    send(res, 200, body, TYPES[extname(path)] || 'application/octet-stream');
  } catch (e) {
    if (e.status) return send(res, e.status, e.message);
    if (e.code === 'ENOENT' || e.code === 'EISDIR') return send(res, 404, 'not found');
    console.error(e);
    send(res, 500, String(e.message || e));
  }
});

server.listen(PORT, HOST, () => console.log(`memory explorer on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));
