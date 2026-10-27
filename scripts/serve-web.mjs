import { createServer, request as proxyRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
const root = existsSync(resolve('apps/admin/dist'))
  ? resolve('apps/admin/dist')
  : resolve('apps/web/dist');
const backend = new URL(
  process.env.API_INTERNAL_URL ?? 'http://localhost:3000',
);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://web');
    if (url.pathname.startsWith('/api/')) {
      const upstream = proxyRequest(
        {
          hostname: backend.hostname,
          port: backend.port || 80,
          path: url.pathname + url.search,
          method: req.method,
          headers: { ...req.headers, host: backend.host },
        },
        (response) => {
          res.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(res);
        },
      );
      upstream.on('error', () => {
        if (!res.headersSent)
          res.writeHead(502, { 'content-type': 'application/json' });
        res.end(
          '{"error":{"code":"API_UNAVAILABLE","message":"API unavailable; retry shortly"}}',
        );
      });
      req.on('aborted', () => upstream.destroy());
      res.on('close', () => upstream.destroy());
      req.pipe(upstream);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end();
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    let filename = resolve(root, '.' + pathname);
    if (relative(root, filename).startsWith('..')) {
      res.writeHead(400);
      res.end();
      return;
    }
    if (!extname(pathname)) filename = resolve(root, 'index.html');
    const data = await readFile(filename);
    res.writeHead(200, {
      'content-type':
        contentTypes[extname(filename)] ?? 'application/octet-stream',
      'cache-control': filename.endsWith('index.html')
        ? 'no-cache'
        : 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
      'x-frame-options': 'DENY',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
server.listen(Number(process.env.WEB_PORT ?? 5173), '0.0.0.0', () =>
  console.log('Web ready'),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => server.close(() => process.exit(0)));
