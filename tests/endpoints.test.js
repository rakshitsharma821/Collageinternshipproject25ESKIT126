import test from "node:test";
import assert from "node:assert";
import scanHandler from "../netlify/functions/scan-url.mjs";
import assistantHandler from "../netlify/functions/assistant.mjs";
import historyHandler from "../netlify/functions/price-history.mjs";

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

test("assistantHandler parses valid prompt and returns structured criteria", async () => {
  const req = new Request("http://localhost/api/assistant?q=phone%20under%2025000%20with%20good%20camera");
  const res = await assistantHandler(req);
  assert.strictEqual(res.status, 200);
  const json = await res.json();
  assert.strictEqual(json.success, true);
  assert.strictEqual(json.parsedCriteria.budgetMax, 25000);
  assert.strictEqual(json.parsedCriteria.category, "phone");
  assert.ok(json.parsedCriteria.priorityFeatures.includes("camera"));
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
