import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const threeRoot = fileURLToPath(new URL('../node_modules/three/', import.meta.url));
const portIndex = process.argv.indexOf('--port');
const port = Number(portIndex < 0 ? (process.env.BMW_PORT ?? 52259) : process.argv[portIndex + 1]);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error('Choose a port between 0 and 65535.');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const vendor = pathname.startsWith('/vendor/three/'),
      base = vendor ? threeRoot : publicRoot;
    const relative = vendor
      ? pathname.slice('/vendor/three/'.length)
      : pathname === '/'
        ? 'index.html'
        : pathname.slice(1);
    const file = resolve(base, relative);
    if (!file.startsWith(base.endsWith(sep) ? base : base + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  } catch (error) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const status =
      error.code === 'ENOENT' || error.code === 'ENOTDIR'
        ? 404
        : error instanceof URIError
          ? 400
          : 500;
    res
      .writeHead(status)
      .end(status === 404 ? 'Not found' : status === 400 ? 'Bad request' : 'Unable to read file');
  }
});
server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `Port ${port} is already in use. Choose another with npm start -- --port 0.`
      : error.message
  );
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`BMW M5 F10: http://127.0.0.1:${server.address().port}/`);
  console.log('Keep this window open. Press Control-C to stop.');
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
