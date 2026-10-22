import test from "node:test";
import assert from "node:assert";
import { BaseStoreAdapter } from "../lib/adapters/base.js";
import { AmazonAdapter, parseAmazonCreatorsResponse } from "../lib/adapters/amazon.js";
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
  delete process.env.AMAZON_CREATORS_CLIENT_ID;
  delete process.env.AMAZON_CREATORS_CLIENT_SECRET;
  delete process.env.AMAZON_CREATORS_CREDENTIAL_VERSION;
  delete process.env.AMAZON_PARTNER_TAG;

  const adapter = new AmazonAdapter();
  assert.strictEqual(adapter.isConfigured(), false);

  const result = await adapter.search("iPhone 16");
  assert.strictEqual(result.store, "amazon");
  assert.strictEqual(result.status, "not_configured");
  assert.strictEqual(result.price, null);
  assert.match(result.error, /AMAZON_CREATORS_CLIENT_ID/);
  assert.ok(result.url.includes("amazon.in/s?k=iPhone%2016"));
});

test("legacy PA-API variables do not activate the Amazon Creators API", async () => {
  const names = [
    "AMAZON_ACCESS_KEY",
    "AMAZON_SECRET_KEY",
    "AMAZON_PARTNER_TAG",
    "AMAZON_CREATOR_KEY",
    "AMAZON_CREATOR_SECRET",
    "AMAZON_CREATOR_TAG",
    "AMAZON_CREATORS_CLIENT_ID",
    "AMAZON_CREATORS_CLIENT_SECRET",
    "AMAZON_CREATORS_CREDENTIAL_VERSION"
  ];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  process.env.AMAZON_ACCESS_KEY = "obsolete-test-value";
  process.env.AMAZON_SECRET_KEY = "obsolete-test-value";
  process.env.AMAZON_PARTNER_TAG = "obsolete-test-value";
  let requestCount = 0;
  const adapter = new AmazonAdapter({ fetchImpl: async () => {
    requestCount += 1;
    throw new Error("An obsolete credential must not activate a request.");
  } });

  try {
    assert.strictEqual(adapter.isConfigured(), false);
    const result = await adapter.search("iPhone 16");
    assert.strictEqual(result.status, "not_configured");
    assert.strictEqual(requestCount, 0);
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
});

test("Amazon Creators API authenticates and returns only exact new INR offers", async () => {
  const names = [
    "AMAZON_CREATORS_CLIENT_ID",
    "AMAZON_CREATORS_CLIENT_SECRET",
    "AMAZON_CREATORS_CREDENTIAL_VERSION",
    "AMAZON_PARTNER_TAG"
  ];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.AMAZON_CREATORS_CLIENT_ID = "test-client-id";
  process.env.AMAZON_CREATORS_CLIENT_SECRET = "test-client-secret";
  process.env.AMAZON_CREATORS_CREDENTIAL_VERSION = "3.2";
  process.env.AMAZON_PARTNER_TAG = "test-20";
  const calls = [];
  const response = (body) => new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
  const mockFetch = async (url, options) => {
    calls.push({ url, options });
    if (url === "https://api.amazon.co.uk/auth/o2/token") {
      return response({ access_token: "fixture-access-token", token_type: "bearer", expires_in: 3600 });
    }
    return response({
      searchResult: {
        items: [
          {
            asin: "B0L0R12345",
            detailPageURL: "https://www.amazon.in/dp/B0L0R12345?tag=test-20",
            itemInfo: { title: { displayValue: "Lorenz MK 4087R Date Dial with Magnetic Lock Strap Analog Watch for Men" } },
            offersV2: { listings: [
              {
                condition: { value: "New" },
                availability: { type: "IN_STOCK" },
                price: { money: { amount: 2549, currency: "INR" } },
                merchantInfo: { name: "Amazon.in" }
              },
              {
                condition: { value: "Used" },
                availability: { type: "IN_STOCK" },
                price: { money: { amount: 1, currency: "INR" } }
              }
            ] }
          },
          {
            asin: "B0L0R12346",
            detailPageURL: "https://www.amazon.in/dp/B0L0R12346",
            itemInfo: { title: { displayValue: "Lorenz MK 4087X Date Dial with Magnetic Lock Strap Analog Watch for Men" } },
            offersV2: { listings: [{
              condition: { value: "New" },
              availability: { type: "IN_STOCK" },
              price: { money: { amount: 10, currency: "INR" } }
            }] }
          }
        ]
      }
    });
  };

  try {
    const adapter = new AmazonAdapter({ fetchImpl: mockFetch });
    assert.strictEqual(adapter.isConfigured(), true);
    const query = "LORENZ MK-4087R Date Dial with Magnetic Lock Strap Analog Watch - For Men";
    const result = await adapter.search(query);
    assert.strictEqual(result.status, "verified");
    assert.strictEqual(result.title, "Lorenz MK 4087R Date Dial with Magnetic Lock Strap Analog Watch for Men");
    assert.strictEqual(result.price, 2549);
    assert.strictEqual(result.currency, "INR");
    assert.strictEqual(result.availability, "in_stock");
    assert.strictEqual(result.productUrl, "https://www.amazon.in/dp/B0L0R12345?tag=test-20");
    assert.strictEqual(result.source, "Amazon Creators API");
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].url, "https://api.amazon.co.uk/auth/o2/token");
    assert.strictEqual(calls[1].url, "https://creatorsapi.amazon/catalog/v1/searchItems");
    assert.strictEqual(calls[1].options.headers.Authorization, "Bearer fixture-access-token");
    assert.strictEqual(calls[1].options.headers["x-marketplace"], "www.amazon.in");
    assert.strictEqual(JSON.parse(calls[1].options.body).partnerTag, "test-20");
    assert.deepEqual(JSON.parse(calls[1].options.body).resources, [
      "itemInfo.title",
      "offersV2.listings.price",
      "offersV2.listings.availability",
      "offersV2.listings.condition"
    ]);
    const mismatch = parseAmazonCreatorsResponse({
      searchResult: {
        items: [{
          detailPageURL: "https://www.amazon.in/dp/B0L0R12345",
          itemInfo: { title: { displayValue: "Lorenz MK 4087R Date Dial with Magnetic Lock Strap Analog Watch for Men" } },
          offersV2: { listings: [{
            condition: { value: "New" },
            availability: { type: "IN_STOCK" },
            price: { money: { amount: 2549, currency: "INR" } }
          }] }
        }]
      }
    }, "LORENZ MK-4087X Date Dial with Magnetic Lock Strap Analog Watch - For Men");
    assert.strictEqual(mismatch.status, "no_results");
    assert.strictEqual(mismatch.price, null);
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
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

test("RelianceDigitalAdapter reports unconfigured status honestly with valid search URL", async () => {
  const { RelianceDigitalAdapter } = await import("../lib/adapters/reliance.js");
  const adapter = new RelianceDigitalAdapter();
  assert.strictEqual(adapter.isConfigured(), false);
  const result = await adapter.search("iPhone 16");
  assert.strictEqual(result.store, "reliance");
  assert.strictEqual(result.status, "not_configured");
  assert.strictEqual(result.integrationStatus, "missing_credentials");
  assert.ok(result.searchUrl.includes("reliancedigital.in/search?q=iPhone%2016"));
});
