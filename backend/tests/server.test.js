import test from 'node:test';
import assert from 'node:assert';
import { createServer } from '../server.js';

test('backend server returns 200 for health check', async () => {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    assert.strictEqual(data.service, 'gadgetverse-backend');
  } finally {
    server.close();
  }
});

test('backend server handles CORS preflight OPTIONS request with 204', async () => {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/compare`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://gadgetverse.vercel.app',
        'Access-Control-Request-Method': 'GET'
      }
    });
    assert.strictEqual(res.status, 204);
    assert.ok(res.headers.get('access-control-allow-origin'));
    assert.ok(res.headers.get('access-control-allow-methods'));
  } finally {
    server.close();
  }
});

test('backend server returns 404 for unknown endpoints', async () => {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/nonexistent`);
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.success, false);
  } finally {
    server.close();
  }
});
