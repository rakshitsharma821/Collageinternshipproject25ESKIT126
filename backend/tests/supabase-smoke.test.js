import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseClient } from "../lib/supabase.js";
import { createDiagnosticFetch, safeDatabaseError } from "../scripts/supabase-smoke.js";

test("safeDatabaseError reports Supabase HTTP status, code, and message without secrets", () => {
  const original = {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
    secretKey: process.env.SUPABASE_SECRET_KEY
  };
  const apiKey = "test-only-api-key-value";
  const projectUrl = "https://test-project.supabase.co";
  process.env.SUPABASE_URL = projectUrl;
  process.env.SUPABASE_SERVICE_KEY = apiKey;
  delete process.env.SUPABASE_SECRET_KEY;

  try {
    const error = safeDatabaseError({
      status: 401,
      code: "PGRST301",
      message: `Invalid API key ${apiKey} at ${projectUrl}`
    });

    assert.match(error.message, /HTTP 401/);
    assert.match(error.message, /code PGRST301/);
    assert.match(error.message, /Invalid API key/);
    assert.doesNotMatch(error.message, /test-only-api-key-value/);
    assert.doesNotMatch(error.message, /test-project\.supabase\.co/);
  } finally {
    if (original.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = original.url;
    if (original.serviceKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = original.serviceKey;
    if (original.secretKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = original.secretKey;
  }
});

test("safeDatabaseError includes nested network codes and timeout details", () => {
  const cause = Object.assign(new Error("getaddrinfo ENOTFOUND test-project.supabase.co"), {
    code: "ENOTFOUND"
  });
  const error = safeDatabaseError(new TypeError("fetch failed", { cause }));

  assert.match(error.message, /fetch failed/);
  assert.match(error.message, /code ENOTFOUND/);
  assert.match(error.message, /getaddrinfo ENOTFOUND/);
  assert.doesNotMatch(error.message, /test-project\.supabase\.co/);

  const timeout = safeDatabaseError(Object.assign(new Error("The operation timed out"), {
    code: "ETIMEDOUT"
  }));
  assert.match(timeout.message, /code ETIMEDOUT/);
  assert.match(timeout.message, /timed out/);
});

test("diagnostic fetch retains transport causes while preserving request inputs", async () => {
  let requestInput;
  let requestInit;
  const fetchImpl = async (input, init) => {
    requestInput = input;
    requestInit = init;
    throw Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("getaddrinfo ENOTFOUND test-project.supabase.co"), {
        code: "ENOTFOUND"
      })
    });
  };
  const diagnosticFetch = createDiagnosticFetch(fetchImpl);

  await assert.rejects(
    diagnosticFetch("https://test-project.supabase.co/rest/v1/gadgets", {
      headers: { apikey: "test-only-key" }
    }),
    (error) => {
      const message = safeDatabaseError(Object.assign(error, { status: 0 })).message;
      assert.match(message, /no HTTP response/);
      assert.match(message, /ENOTFOUND/);
      assert.doesNotMatch(message, /test-project\.supabase\.co/);
      return true;
    }
  );
  assert.strictEqual(requestInput, "https://test-project.supabase.co/rest/v1/gadgets");
  assert.strictEqual(requestInit.headers.apikey, "test-only-key");
});

test("Supabase client targets REST table endpoints and attaches expected auth headers", async () => {
  let request;
  const client = createSupabaseClient({
    url: "https://test-project.supabase.co",
    serviceKey: "test-only-api-key-value"
  }, {
    global: {
      fetch: async (input, init) => {
        request = {
          url: new URL(input),
          headers: new Headers(init.headers)
        };
        return new Response("[]", {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  });

  const { data, error } = await client.from("gadgets").select("id").limit(1);

  assert.ifError(error);
  assert.deepStrictEqual(data, []);
  assert.strictEqual(request.url.pathname, "/rest/v1/gadgets");
  assert.strictEqual(request.url.searchParams.get("select"), "id");
  assert.strictEqual(request.url.searchParams.get("limit"), "1");
  assert.strictEqual(request.headers.get("apikey"), "test-only-api-key-value");
  assert.strictEqual(request.headers.get("authorization"), "Bearer test-only-api-key-value");
});
