import test from "node:test";
import assert from "node:assert";
import { sendEmailNotification, runPriceDropCheck } from "../lib/alert-checker.js";

test("sendEmailNotification returns honest unconfigured state when RESEND_API_KEY is missing", async () => {
  const originalKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  const result = await sendEmailNotification({
    to: "buyer@example.com",
    subject: "Price drop",
    text: "Test body"
  });

  assert.strictEqual(result.delivered, false);
  assert.ok(result.reason.includes("RESEND_API_KEY"));

  if (originalKey) process.env.RESEND_API_KEY = originalKey;
});

test("runPriceDropCheck handles missing Supabase credentials cleanly", async () => {
  const origUrl = process.env.SUPABASE_URL;
  delete process.env.SUPABASE_URL;

  const result = await runPriceDropCheck();
  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes("Supabase credentials"));

  if (origUrl) process.env.SUPABASE_URL = origUrl;
});

test("runPriceDropCheck evaluates active alerts with mock Supabase client", async () => {
  const mockAlerts = [
    {
      id: "alert-1",
      product_id: "iphone-16",
      product_name: "Apple iPhone 16 (128 GB)",
      email: "shopper@example.com",
      target_price: 75000,
      notified_at: null,
      enabled: true,
      notification_status: null
    }
  ];

  const mockObservations = [
    {
      product_id: "iphone-16",
      store_id: "amazon",
      price: 72999,
      product_url: "https://www.amazon.in/dp/B0BDK62V6F",
      observed_at: new Date().toISOString(),
      source_status: "verified",
      currency: "INR",
      availability: "in_stock",
      metadata: {
        comparable: true,
        title: "Apple iPhone 16 (128 GB)",
        matchEvidence: { exactIdentity: true }
      }
    }
  ];

  const updatedRecords = [];

  const mockClient = {
    from(table) {
      if (table === "price_alerts") {
        return {
          select() {
            return {
              eq() {
                return {
                  is() {
                    return {
                      or() {
                        return { limit: async () => ({ data: mockAlerts, error: null }) };
                      }
                    };
                  }
                };
              }
            };
          },
          update(data) {
            return {
              eq(col, val) {
                updatedRecords.push({ data, col, val });
                return {
                  is() {
                    return {
                      or() {
                        return {
                          select() {
                            return { maybeSingle: async () => ({ data: { id: "alert-1" }, error: null }) };
                          }
                        };
                      }
                    };
                  },
                  then(resolve, reject) {
                    return Promise.resolve({ error: null }).then(resolve, reject);
                  }
                };
              }
            };
          }
        };
      }
      if (table === "price_observations") {
        return {
          select() {
            return {
              in() {
                return {
                  eq() {
                    return {
                      eq() {
                        return {
                          order: async () => ({ data: mockObservations, error: null })
                        };
                      }
                    };
                  }
                };
              }
            };
          }
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }
  };

  const origUrl = process.env.SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_KEY;
  process.env.SUPABASE_URL = "https://mock.supabase.co";
  process.env.SUPABASE_SERVICE_KEY = "mock-key";

  const result = await runPriceDropCheck({ supabaseClient: mockClient });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.triggeredCount, 1);
  assert.strictEqual(updatedRecords.length, 2);
  assert.strictEqual(updatedRecords[0].data.notification_status, "sending");
  assert.strictEqual(updatedRecords[1].data.notification_status, "pending_provider");

  if (origUrl) process.env.SUPABASE_URL = origUrl; else delete process.env.SUPABASE_URL;
  if (origKey) process.env.SUPABASE_SERVICE_KEY = origKey; else delete process.env.SUPABASE_SERVICE_KEY;
});

test("runPriceDropCheck ignores unverified observations and does not deliver an already-claimed alert", async () => {
  const alert = {
    id: "alert-dedup-test",
    product_id: "iphone-16",
    product_name: "Apple iPhone 16 (128 GB)",
    email: "shopper@example.com",
    target_price: 75000,
    notified_at: null,
    enabled: true,
    notification_status: null,
    updated_at: new Date().toISOString()
  };
  const validObservation = {
    product_id: alert.product_id,
    store_id: "amazon",
    price: 72999,
    product_url: "https://www.amazon.in/dp/B0BDK62V6F",
    observed_at: new Date().toISOString(),
    source_status: "verified",
    currency: "INR",
    availability: "in_stock",
    metadata: {
      comparable: true,
      source: "authorized API fixture",
      title: alert.product_name,
      matchEvidence: { exactIdentity: true }
    }
  };
  const originalEnv = {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
    secretKey: process.env.SUPABASE_SECRET_KEY
  };
  process.env.SUPABASE_URL = "https://mock.supabase.co";
  process.env.SUPABASE_SERVICE_KEY = "test-only-key";
  delete process.env.SUPABASE_SECRET_KEY;

  const createClient = (observations, claimData = { id: alert.id }) => {
    const updates = [];
    const client = {
      from(table) {
        if (table === "price_alerts") {
          return {
            select() { return this; },
            eq() { return this; },
            is() { return this; },
            or() { return this; },
            limit: async () => ({ data: [alert], error: null }),
            update(data) {
              updates.push(data);
              const builder = {
                eq() { return this; },
                is() { return this; },
                or() { return this; },
                select() { return this; },
                maybeSingle: async () => ({ data: claimData, error: null }),
                then(resolve, reject) {
                  return Promise.resolve({ error: null }).then(resolve, reject);
                }
              };
              return builder;
            }
          };
        }
        if (table === "price_observations") {
          return {
            select() { return this; },
            in() { return this; },
            eq() { return this; },
            order: async () => ({ data: observations, error: null })
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }
    };
    return { client, updates };
  };

  try {
    const unverified = createClient([{ ...validObservation, source_status: "unverified" }]);
    const ignored = await runPriceDropCheck({ supabaseClient: unverified.client });
    assert.equal(ignored.triggeredCount, 0);
    assert.equal(unverified.updates.length, 0);

    const alreadyClaimed = createClient([validObservation], null);
    const deduplicated = await runPriceDropCheck({ supabaseClient: alreadyClaimed.client });
    assert.equal(deduplicated.triggeredCount, 1);
    assert.equal(deduplicated.results.length, 0);
    assert.equal(alreadyClaimed.updates.length, 1);
    assert.equal(alreadyClaimed.updates[0].notification_status, "sending");
    assert.equal(alreadyClaimed.updates[0].notification_note, null);
  } finally {
    if (originalEnv.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalEnv.url;
    if (originalEnv.serviceKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = originalEnv.serviceKey;
    if (originalEnv.secretKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalEnv.secretKey;
  }
});
