import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './lib/load-env.js';

// Import migrated API handlers
import gadgetsHandler from './api/gadgets.js';
import compareHandler from './api/compare.js';
import trackHandler from './api/track.js';
import priceHistoryHandler from './api/price-history.js';
import scanHandler from './api/scan-url.js';
import assistantHandler from './api/assistant.js';

loadLocalEnv();
const PORT = Number(process.env.PORT) || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '*';

/**
 * Route table mapping pathname prefix to handler function.
 */
const ROUTES = {
  '/api/gadgets': gadgetsHandler,
  '/api/compare': compareHandler,
  '/api/track': trackHandler,
  '/api/price-history': priceHistoryHandler,
  '/api/scan-url': scanHandler,
  '/api/assistant': assistantHandler
};

/**
 * Applies standard CORS headers to outgoing Node.js ServerResponse.
 */
function applyCorsHeaders(res, origin = CORS_ORIGIN) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/**
 * Creates and starts the GadgetVerse HTTP server.
 */
export function createServer() {
  return http.createServer(async (req, res) => {
    // 1. CORS Preflight
    applyCorsHeaders(res);
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const host = req.headers['host'] || `localhost:${PORT}`;
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const requestUrl = new URL(req.url, `${protocol}://${host}`);
    const pathname = requestUrl.pathname;

    // 2. Health check endpoint for Render monitoring
    if (pathname === '/health' || pathname === '/') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        status: 'ok',
        service: 'gadgetverse-backend',
        environment: process.env.NODE_ENV || 'production',
        timestamp: new Date().toISOString()
      }));
      return;
    }

    // 3. API route lookup
    const handler = ROUTES[pathname];
    if (!handler) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: false,
        error: `Endpoint '${pathname}' not found on GadgetVerse backend.`
      }));
      return;
    }

    // 4. Adapt incoming Node.js request to Web Request standard
    try {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const bodyBuffer = chunks.length ? Buffer.concat(chunks) : undefined;

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            value.forEach((v) => headers.append(key, v));
          } else {
            headers.set(key, value);
          }
        }
      }

      const webReq = new Request(requestUrl.href, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : bodyBuffer,
        duplex: 'half'
      });

      // 5. Execute handler
      const webRes = await handler(webReq);

      // 6. Write response headers
      for (const [key, value] of webRes.headers.entries()) {
        res.setHeader(key, value);
      }
      applyCorsHeaders(res); // ensure CORS header presence

      res.statusCode = webRes.status;
      const responseData = await webRes.arrayBuffer();
      res.end(Buffer.from(responseData));
    } catch (err) {
      console.error(`[GadgetVerse Server] Error handling ${req.method} ${pathname}:`, err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        applyCorsHeaders(res);
        res.end(JSON.stringify({
          success: false,
          error: 'Internal server error processing request.'
        }));
      }
    }
  });
}

// Start server if executed directly
const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectExecution || process.env.RENDER) {
  const server = createServer();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[GadgetVerse Backend] Running on http://0.0.0.0:${PORT}`);
    console.log(`[GadgetVerse Backend] CORS origin allowed: ${CORS_ORIGIN}`);
  });

  const shutdown = () => {
    console.log('[GadgetVerse Backend] Gracefully shutting down...');
    server.close(() => {
      console.log('[GadgetVerse Backend] Closed remaining connections.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
