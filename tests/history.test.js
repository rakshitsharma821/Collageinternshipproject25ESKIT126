import test from "node:test";
import assert from "node:assert";
import { queryPriceHistory } from "../netlify/functions/price-history.mjs";

test("queryPriceHistory returns stats and timeline from mock Supabase client", async () => {
  const mockRows = [
    { id: "1", product_id: "iphone-16", store_id: "amazon", price: "79900", observed_at: "2026-10-01T10:00:00Z" },
    { id: "2", product_id: "iphone-16", store_id: "flipkart", price: "76999", observed_at: "2026-10-15T12:00:00Z" }
  ];

  const mockSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            order: () => ({
              limit: async () => ({ data: mockRows, error: null })
            })
          })
        })
      })
    })
  };

  const res = await queryPriceHistory(mockSupabase, { productId: "iphone-16", days: 30 });
  assert.strictEqual(res.history.length, 2);
  assert.strictEqual(res.stats.minPrice, 76999);
  assert.strictEqual(res.stats.maxPrice, 79900);
  assert.strictEqual(res.stats.latestPrice, 76999);
});

test("queryPriceHistory handles empty observations without fabricating synthetic data", async () => {
  const mockSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null })
            })
          })
        })
      })
    })
  };

  const res = await queryPriceHistory(mockSupabase, { productId: "unknown-gadget" });
  assert.strictEqual(res.history.length, 0);
  assert.strictEqual(res.stats, null);
  assert.ok(res.message.includes("No verified price observations"));
});
