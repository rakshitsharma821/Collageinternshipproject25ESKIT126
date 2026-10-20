import test from "node:test";
import assert from "node:assert";
import handler, {
  sanitizeSearchQuery,
  queryGadgets,
  ALLOWED_CATEGORIES
} from "../netlify/functions/gadgets.mjs";

test("ALLOWED_CATEGORIES contains expected standard categories", () => {
  assert.ok(ALLOWED_CATEGORIES.has("phone"));
  assert.ok(ALLOWED_CATEGORIES.has("laptop"));
  assert.ok(ALLOWED_CATEGORIES.has("watch"));
  assert.ok(ALLOWED_CATEGORIES.has("earbuds"));
  assert.ok(ALLOWED_CATEGORIES.has("tv"));
  assert.ok(ALLOWED_CATEGORIES.has("all"));
  assert.ok(!ALLOWED_CATEGORIES.has("invalid_category"));
});

test("sanitizeSearchQuery strips PostgREST injection characters safely", () => {
  assert.strictEqual(sanitizeSearchQuery("iphone,16"), "iphone 16");
  assert.strictEqual(sanitizeSearchQuery("macbook (pro) [m4]"), "macbook pro m4");
  assert.strictEqual(sanitizeSearchQuery("sony's \"bravia\";"), "sony s bravia");
  assert.strictEqual(sanitizeSearchQuery(""), "");
  assert.strictEqual(sanitizeSearchQuery(null), "");
});

test("queryGadgets builds query and propagates database errors without silent fallback", async () => {
  const mockError = { code: "PGRST205", message: "Could not find table 'public.gadgets'" };
  const mockClient = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: () => ({
            eq: () => ({
              or: () => Promise.resolve({ data: null, error: mockError })
            })
          })
        })
      })
    })
  };

  await assert.rejects(
    async () => {
      await queryGadgets(mockClient, { category: "phone", q: "iphone" });
    },
    (err) => {
      assert.strictEqual(err.code, "PGRST205");
      return true;
    }
  );
});

test("queryGadgets returns empty array when no rows match without fallback", async () => {
  const mockClient = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: () => Promise.resolve({ data: [], error: null })
        })
      })
    })
  };

  const results = await queryGadgets(mockClient, { category: "all" });
  assert.strictEqual(Array.isArray(results), true);
  assert.strictEqual(results.length, 0);
});

test("handler rejects non-GET and non-OPTIONS methods with 405", async () => {
  const req = new Request("http://localhost/api/gadgets", { method: "POST" });
  const res = await handler(req);
  assert.strictEqual(res.status, 405);
  const json = await res.json();
  assert.strictEqual(json.success, false);
  assert.ok(json.error.includes("Method POST not allowed"));
});

test("handler responds to OPTIONS preflight with 204", async () => {
  const req = new Request("http://localhost/api/gadgets", { method: "OPTIONS" });
  const res = await handler(req);
  assert.strictEqual(res.status, 204);
  assert.ok(res.headers.get("access-control-allow-origin"));
});

test("handler rejects invalid category filter with 400", async () => {
  const req = new Request("http://localhost/api/gadgets?category=unsupported_cat");
  const res = await handler(req);
  assert.strictEqual(res.status, 400);
  const json = await res.json();
  assert.strictEqual(json.success, false);
  assert.ok(json.error.includes("Invalid category filter"));
});

test("handler rejects oversized search queries with 400", async () => {
  const longQuery = "a".repeat(101);
  const req = new Request(`http://localhost/api/gadgets?q=${longQuery}`);
  const res = await handler(req);
  assert.strictEqual(res.status, 400);
  const json = await res.json();
  assert.strictEqual(json.success, false);
  assert.ok(json.error.includes("Search query exceeds maximum length"));
});

test("handler returns 500 when Supabase credentials are missing", async () => {
  const origUrl = process.env.SUPABASE_URL;
  const origKey = process.env.SUPABASE_ANON_KEY;
  const origRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_KEY;

  try {
    const req = new Request("http://localhost/api/gadgets");
    const res = await handler(req);
    // If fallback project URL exists, it checks for key; key is unset so it returns 500
    assert.strictEqual(res.status, 500);
    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert.ok(json.error.includes("Database configuration is missing"));
  } finally {
    if (origUrl) process.env.SUPABASE_URL = origUrl;
    if (origKey) process.env.SUPABASE_ANON_KEY = origKey;
    if (origRole) process.env.SUPABASE_SERVICE_ROLE_KEY = origRole;
  }
});
