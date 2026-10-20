import test from "node:test";
import assert from "node:assert";
import { BaseStoreAdapter } from "../lib/adapters/base.js";
import { AmazonAdapter } from "../lib/adapters/amazon.js";
import { FlipkartAdapter } from "../lib/adapters/flipkart.js";
import { CromaAdapter } from "../lib/adapters/croma.js";
import { StoreRegistry } from "../lib/adapters/registry.js";

test("BaseStoreAdapter verifies required environment variables", () => {
  const adapter = new BaseStoreAdapter({
    id: "test_store",
    name: "Test Store",
    requiredEnvVars: ["TEST_API_KEY_12345"]
  });

  assert.strictEqual(adapter.isConfigured(), false);
  process.env.TEST_API_KEY_12345 = "secret";
  assert.strictEqual(adapter.isConfigured(), true);
  delete process.env.TEST_API_KEY_12345;
});

test("AmazonAdapter returns not_configured status when official credentials are unset", async () => {
  delete process.env.AMAZON_ACCESS_KEY;
  delete process.env.AMAZON_SECRET_KEY;
  delete process.env.AMAZON_PARTNER_TAG;

  const adapter = new AmazonAdapter();
  assert.strictEqual(adapter.isConfigured(), false);

  const result = await adapter.search("iPhone 16");
  assert.strictEqual(result.store, "amazon");
  assert.strictEqual(result.status, "not_configured");
  assert.strictEqual(result.price, null);
  assert.ok(result.error.includes("PA-API v5"));
  assert.ok(result.url.includes("amazon.in/s?k=iPhone%2016"));
});

test("AmazonAdapter parses valid HTML when mock fetch is supplied", async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    text: async () => `
      <h2><span>Apple iPhone 16 (128 GB) - Teal</span></h2>
      <span class="a-price-whole">76,999</span>
    `
  });

  const adapter = new AmazonAdapter({ fetchImpl: mockFetch });
  const result = await adapter.search("iPhone 16", { timeoutMs: 2000 });
  assert.strictEqual(result.status, "verified");
  assert.strictEqual(result.price, 76999);
  assert.strictEqual(result.currency, "INR");
  assert.strictEqual(result.formattedPrice, "₹76,999");
});

test("FlipkartAdapter returns not_configured when credentials missing", async () => {
  delete process.env.FLIPKART_AFFILIATE_ID;
  delete process.env.FLIPKART_AFFILIATE_TOKEN;

  const adapter = new FlipkartAdapter();
  assert.strictEqual(adapter.isConfigured(), false);

  const result = await adapter.search("MacBook Air");
  assert.strictEqual(result.status, "not_configured");
  assert.ok(result.url.includes("flipkart.com/search?q=MacBook%20Air"));
});

test("CromaAdapter transparently reports SPA client rendering requirement", async () => {
  const adapter = new CromaAdapter({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => "<!doctype html><html><body><div id='root'></div></body></html>"
    })
  });

  const result = await adapter.search("Sony TV", { allowScrapeFallback: true });
  assert.strictEqual(result.status, "unavailable");
  assert.ok(result.error.includes("client-side JavaScript"));
});

test("StoreRegistry manages adapters and coordinates multi-store comparison", async () => {
  const mockAmazon = {
    id: "amazon",
    name: "Amazon",
    mark: "A",
    color: "#ff9900",
    buildSearchUrl: (q) => `https://amazon.in/s?k=${q}`,
    search: async () => ({
      store: "amazon",
      name: "Amazon",
      status: "verified",
      title: "Apple iPhone 16 (128 GB)",
      price: 76999,
      formattedPrice: "₹76,999",
      currency: "INR",
      url: "https://amazon.in/dp/example",
      availability: "in_stock",
      observedAt: new Date().toISOString()
    })
  };

  const mockFlipkart = {
    id: "flipkart",
    name: "Flipkart",
    mark: "F",
    color: "#2874f0",
    buildSearchUrl: (q) => `https://flipkart.com/search?q=${q}`,
    search: async () => ({
      store: "flipkart",
      name: "Flipkart",
      status: "verified",
      title: "Apple iPhone 16 (128 GB)",
      price: 79999,
      formattedPrice: "₹79,999",
      currency: "INR",
      url: "https://flipkart.com/p/example",
      availability: "in_stock",
      observedAt: new Date().toISOString()
    })
  };

  const registry = new StoreRegistry([mockAmazon, mockFlipkart]);
  assert.strictEqual(registry.getAll().length, 2);

  const result = await registry.compare("iPhone 16");
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.query, "iPhone 16");
  assert.strictEqual(result.cheapest.store, "amazon");
  assert.strictEqual(result.cheapest.price, 76999);
  assert.strictEqual(result.cheapest.youSave, 3000); // 79999 - 76999
});

test("StoreRegistry rejects non-comparable accessory from cheapest pick", async () => {
  const mockAmazon = {
    id: "amazon",
    name: "Amazon",
    buildSearchUrl: (q) => `https://amazon.in/s?k=${q}`,
    search: async () => ({
      store: "amazon",
      name: "Amazon",
      status: "verified",
      title: "Clear Case for iPhone 16", // Accessory
      price: 499,
      currency: "INR",
      url: "https://amazon.in/dp/case",
      observedAt: new Date().toISOString()
    })
  };

  const mockFlipkart = {
    id: "flipkart",
    name: "Flipkart",
    buildSearchUrl: (q) => `https://flipkart.com/search?q=${q}`,
    search: async () => ({
      store: "flipkart",
      name: "Flipkart",
      status: "verified",
      title: "Apple iPhone 16 (128 GB)", // Real phone
      price: 79999,
      currency: "INR",
      url: "https://flipkart.com/p/phone",
      observedAt: new Date().toISOString()
    })
  };

  const registry = new StoreRegistry([mockAmazon, mockFlipkart]);
  const result = await registry.compare("iPhone 16");

  // Flipkart must be chosen as cheapest because Amazon is an accessory
  assert.strictEqual(result.cheapest.store, "flipkart");
  assert.strictEqual(result.cheapest.price, 79999);
});
