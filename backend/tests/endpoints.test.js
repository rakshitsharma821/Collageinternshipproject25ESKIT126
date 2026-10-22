import test from "node:test";
import assert from "node:assert";
import scanHandler from "../api/scan-url.js";
import assistantHandler from "../api/assistant.js";
import historyHandler from "../api/price-history.js";

test("scanHandler rejects non-GET and non-POST methods with 405", async () => {
  const req = new Request("http://localhost/api/scan-url", { method: "DELETE" });
  const res = await scanHandler(req);
  assert.strictEqual(res.status, 405);
});

test("scanHandler blocks SSRF attack targets with 400", async () => {
  const req = new Request("http://localhost/api/scan-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://169.254.169.254/secret" })
  });
  const res = await scanHandler(req);
  assert.strictEqual(res.status, 400);
  const json = await res.json();
  assert.strictEqual(json.success, false);
  assert.ok(json.error.includes("private or local"));
});

test("assistantHandler validates prompt lengths with 400", async () => {
  // Empty prompt
  const req1 = new Request("http://localhost/api/assistant?q=");
  const res1 = await assistantHandler(req1);
  assert.strictEqual(res1.status, 400);

  // Oversized prompt
  const longPrompt = "a".repeat(305);
  const req2 = new Request(`http://localhost/api/assistant?q=${longPrompt}`);
  const res2 = await assistantHandler(req2);
  assert.strictEqual(res2.status, 400);
});

test("assistantHandler does not return recommendations when the real catalog is unconfigured", async () => {
  const original = {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
    secretKey: process.env.SUPABASE_SECRET_KEY
  };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;

  try {
    const req = new Request("http://localhost/api/assistant?q=phone%20under%2025000%20with%20good%20camera");
    const res = await assistantHandler(req);
    assert.strictEqual(res.status, 503);
    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert.match(json.error, /catalog is unavailable/i);
    assert.strictEqual("recommendations" in json, false);
  } finally {
    if (original.url) process.env.SUPABASE_URL = original.url;
    if (original.serviceKey) process.env.SUPABASE_SERVICE_KEY = original.serviceKey;
    if (original.secretKey) process.env.SUPABASE_SECRET_KEY = original.secretKey;
  }
});

test("historyHandler validates missing and oversized productId", async () => {
  const req1 = new Request("http://localhost/api/price-history");
  const res1 = await historyHandler(req1);
  assert.strictEqual(res1.status, 400);

  const longId = "p".repeat(105);
  const req2 = new Request(`http://localhost/api/price-history?productId=${longId}`);
  const res2 = await historyHandler(req2);
  assert.strictEqual(res2.status, 400);
});
