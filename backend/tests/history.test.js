import test from "node:test";
import assert from "node:assert";
import { queryPriceHistory } from "../api/price-history.js";

test("queryPriceHistory returns stats and timeline from mock Supabase client", async () => {
  const mockRows = [
    { id: "1", product_id: "iphone-16", store_id: "amazon", price: "79900", currency: "INR", availability: "in_stock", source_status: "verified", product_url: "https://www.amazon.in/dp/ABCDEFGHIJ", observed_at: "2026-10-01T10:00:00Z", metadata: { comparable: true, source: "test fixture", matchEvidence: { exactIdentity: true } } },
    { id: "2", product_id: "iphone-16", store_id: "flipkart", price: "76999", currency: "INR", availability: "in_stock", source_status: "verified", product_url: "https://www.flipkart.com/p/item", observed_at: "2026-10-15T12:00:00Z", metadata: { comparable: true, source: "test fixture", matchEvidence: { exactIdentity: true } } },
    { id: "3", product_id: "iphone-16", store_id: "croma", price: "1", currency: "INR", availability: "in_stock", source_status: "verified", product_url: "https://www.croma.com/p/item", observed_at: "2026-10-16T12:00:00Z", metadata: { comparable: false, source: "test fixture", matchEvidence: { exactIdentity: true } } }
  ];

  const mockSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({
                order: () => ({
                  limit: async () => ({ data: mockRows, error: null })
                })
              })
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
          eq: () => ({
            eq: () => ({
              gte: () => ({
                order: () => ({
                  limit: async () => ({ data: [], error: null })
                })
              })
            })
          })
        })
      })
    })
  };

  const res = await queryPriceHistory(mockSupabase, { productId: "unknown-gadget" });
  assert.strictEqual(res.history.length, 0);
  assert.strictEqual(res.stats, null);
  assert.ok(res.message.includes("No verified exact-product observations"));
});

test("queryPriceHistory excludes observations without verified source and availability metadata", async () => {
  const mockRows = [{
    id: "1",
    store_id: "amazon",
    price: 79900,
    currency: "INR",
    availability: "unknown",
    source_status: "verified",
    product_url: "https://www.amazon.in/dp/ABCDEFGHIJ",
    observed_at: new Date().toISOString(),
    metadata: { comparable: true, matchEvidence: { exactIdentity: true } }
  }];
  const mockSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({
                order: () => ({
                  limit: async () => ({ data: mockRows, error: null })
                })
              })
            })
          })
        })
      })
    })
  };
  const result = await queryPriceHistory(mockSupabase, { productId: "phone" });
  assert.deepEqual(result.history, []);
  assert.equal(result.stats, null);
});
