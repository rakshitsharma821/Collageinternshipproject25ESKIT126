import test from "node:test";
import assert from "node:assert/strict";
import { getSupabaseConfig } from "../lib/supabase.js";

test("getSupabaseConfig accepts the service key expected by existing deployments", () => {
  const config = getSupabaseConfig({
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_KEY: "service-secret"
  });

  assert.deepStrictEqual(config, {
    url: "https://project.supabase.co",
    serviceKey: "service-secret"
  });
});

test("getSupabaseConfig supports the Supabase secret key name as a fallback", () => {
  const config = getSupabaseConfig({
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SECRET_KEY: "secret-key"
  });

  assert.deepStrictEqual(config, {
    url: "https://project.supabase.co",
    serviceKey: "secret-key"
  });
});

test("getSupabaseConfig prefers the service key when both key names are set", () => {
  const config = getSupabaseConfig({
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_KEY: "service-secret",
    SUPABASE_SECRET_KEY: "secret-key"
  });

  assert.strictEqual(config.serviceKey, "service-secret");
});

test("getSupabaseConfig returns null when no Supabase settings are configured", () => {
  assert.strictEqual(getSupabaseConfig({}), null);
});

test("getSupabaseConfig rejects partial credentials without exposing their values", () => {
  assert.throws(
    () => getSupabaseConfig({ SUPABASE_URL: "https://project.supabase.co" }),
    /SUPABASE_URL and either SUPABASE_SERVICE_KEY or SUPABASE_SECRET_KEY/
  );
});

test("getSupabaseConfig rejects non-HTTPS project URLs", () => {
  assert.throws(
    () => getSupabaseConfig({
      SUPABASE_URL: "http://project.supabase.co",
      SUPABASE_SECRET_KEY: "secret-key"
    }),
    /valid HTTPS URL/
  );
});

test("getSupabaseConfig rejects REST endpoints instead of silently normalizing them", () => {
  assert.throws(
    () => getSupabaseConfig({
      SUPABASE_URL: "https://project.supabase.co/rest/v1/",
      SUPABASE_SERVICE_KEY: "service-secret"
    }),
    /project base URL/
  );
});

test("getSupabaseConfig rejects the documented project URL placeholder", () => {
  assert.throws(
    () => getSupabaseConfig({
      SUPABASE_URL: "https://your-project.supabase.co",
      SUPABASE_SERVICE_KEY: "service-secret"
    }),
    /template placeholder/
  );
});
