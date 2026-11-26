'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const file = path.normalize(path.join(ROOT, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));

  if (!file.startsWith(ROOT + path.sep) || file.includes(`${path.sep}node_modules${path.sep}`)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(file, (error, body) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  });
});

server.listen(PORT, () => console.log(`Pulsefield Morse Studio → http://localhost:${PORT}`));
