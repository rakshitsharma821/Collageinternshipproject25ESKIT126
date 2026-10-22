import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 5000;
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:3000';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = reqUrl.pathname;

  // 1. Proxy /api/* requests to backend
  if (pathname.startsWith('/api/') || pathname === '/health') {
    try {
      const targetUrl = new URL(req.url, BACKEND_URL);
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);

      const proxyRes = await fetch(targetUrl.href, {
        method: req.method,
        headers: req.headers,
        body,
        duplex: 'half'
      });

      res.statusCode = proxyRes.status;
      for (const [key, value] of proxyRes.headers.entries()) {
        res.setHeader(key, value);
      }
      const data = await proxyRes.arrayBuffer();
      res.end(Buffer.from(data));
      return;
    } catch (err) {
      console.error(`[Frontend Proxy] Error proxying to backend:`, err.message);
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Could not connect to GadgetVerse backend. Make sure backend is running on port 3000 (node backend/server.js).'
      }));
      return;
    }
  }

  // 2. Static file serving from frontend/
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  if (!fs.existsSync(filePath) && fs.existsSync(`${filePath}.html`)) {
    filePath = `${filePath}.html`;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<h1>404 Not Found</h1><p>The requested page does not exist on GadgetVerse.</p>');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n==================================================`);
  console.log(`  GadgetVerse Frontend running at:`);
  console.log(`  > Local:   http://localhost:${PORT}`);
  console.log(`  > Proxying /api to: ${BACKEND_URL}`);
  console.log(`==================================================\n`);
});
