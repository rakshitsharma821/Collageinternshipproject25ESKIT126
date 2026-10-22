import test from "node:test";
import assert from "node:assert/strict";
import {
  extractProductName,
  resolveProductUrl,
  sortOffersByPrice,
  validateProductUrl
} from "../lib/compare.js";
import { calculateVerdict, historyForChart, productHistoryKey } from "../lib/history.js";
import compareHandler, { buildObservationId } from "../api/compare.js";
import trackHandler, { savePriceAlert } from "../api/track.js";
import { defaultRegistry } from "../lib/adapters/registry.js";
import { filterAvailableOffers } from "../../frontend/js/offer-visibility.js";

async function compareWithAmazonResult(query, amazonResult) {
  const originals = defaultRegistry.getAll();
  const envNames = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY"];
  const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  for (const name of envNames) delete process.env[name];

  for (const adapter of originals) {
    defaultRegistry.register({
      id: adapter.id,
      name: adapter.name,
      buildSearchUrl: adapter.buildSearchUrl.bind(adapter),
      search: async () => adapter.id === "amazon" ? amazonResult : {
        status: "not_configured",
        title: null,
        price: null,
        currency: "INR",
        availability: "unknown",
        productUrl: null,
        observedAt: new Date().toISOString(),
        error: "Not configured"
      }
    });
  }

  try {
    const response = await compareHandler(new Request(
      `https://site.test/api/compare?q=${encodeURIComponent(query)}`
    ));
    return { response, result: await response.json() };
  } finally {
    originals.forEach((adapter) => defaultRegistry.register(adapter));
    for (const name of envNames) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  }
}

test("product URL validation accepts only supported store and short-link hosts", () => {
  assert.equal(validateProductUrl("https://www.amazon.in/dp/ABCDEFGHIJ").valid, true);
  assert.equal(validateProductUrl("https://amzn.to/short").isShortLink, true);
  assert.equal(validateProductUrl("https://fkrt.it/short").isShortLink, true);
  assert.equal(validateProductUrl("https://dl.flipkart.com/s/short").valid, true);
  assert.equal(validateProductUrl("http://amazon.in/dp/ABCDEFGHIJ").valid, false);
  assert.equal(validateProductUrl("https://subdomain.amazon.in/dp/ABCDEFGHIJ").valid, false);
  assert.equal(validateProductUrl("https://amazon.in.evil.example/dp/ABCDEFGHIJ").valid, false);
  assert.equal(validateProductUrl("https://user:pass@amazon.in/dp/ABCDEFGHIJ").valid, false);
});

test("short links resolve only when each redirect stays on an approved host", async () => {
  const calls = [];
  const fetchMock = async (url) => {
    calls.push(url);
    if (url === "https://amzn.in/short") {
      return new Response(null, { status: 302, headers: { location: "https://www.amazon.in/dp/ABCDEFGHIJ" } });
    }
    return new Response("<title>Actual product page</title>", { status: 200 });
  };
  const resolved = await resolveProductUrl("https://amzn.in/short", fetchMock);
  assert.equal(resolved.valid, true);
  assert.equal(resolved.url, "https://www.amazon.in/dp/ABCDEFGHIJ");
  assert.equal(calls.length, 2);

  const blocked = await resolveProductUrl("https://fkrt.it/short", async () =>
    new Response(null, { status: 302, headers: { location: "https://example.org/redirect" } })
  );
  assert.equal(blocked.valid, false);
  assert.match(blocked.error, /outside the supported stores/);
});

test("product name extraction prefers JSON-LD, then Open Graph, then the page title", () => {
  const jsonLd = '<script type="application/ld+json">{"@type":"Product","name":"Actual Product"}</script><meta property="og:title" content="Open Graph name"><title>Page title</title>';
  assert.equal(extractProductName(jsonLd), "Actual Product");
  assert.equal(extractProductName('<meta property="og:title" content="Open Graph &amp; title"><title>Page title</title>'), "Open Graph & title");
  assert.equal(extractProductName("<title>Page title</title>"), "Page title");
  assert.equal(extractProductName("<main>No product identity</main>"), null);
});

test("unavailable offers sort below checked prices without receiving an invented price", () => {
  const offers = sortOffersByPrice([
    { name: "Store B", price: null },
    { name: "Store A", price: 1200 },
    { name: "Store C", price: 900 }
  ]);
  assert.deepEqual(offers.map((offer) => offer.price), [900, 1200, null]);
  assert.equal(offers[0].cheapest, true);
  assert.equal(offers[2].cheapest, false);
});

test("verdict waits for history across distinct days and then evaluates recorded prices", () => {
  const sameDay = [
    { price: 1200, observedAt: "2026-10-18T08:00:00.000Z" },
    { price: 1180, observedAt: "2026-10-18T12:00:00.000Z" }
  ];
  assert.deepEqual(historyForChart(sameDay).map((point) => point.price), [1180]);
  assert.equal(calculateVerdict(sameDay, 1100).verdict, "insufficient");
  assert.equal(calculateVerdict(sameDay, 1100).label, "Not enough data");

  const now = new Date();
  const day = (offset) => new Date(now.getTime() - offset * 86400000).toISOString();
  const sufficientHistory = [
    { price: 1200, observedAt: day(10) },
    { price: 1150, observedAt: day(5) },
    { price: 1180, observedAt: day(1) }
  ];
  const currentObservedAt = now.toISOString();
  assert.equal(calculateVerdict(sufficientHistory, 1100, { currentObservedAt }).verdict, "buy");
  assert.equal(calculateVerdict(sufficientHistory, 1300, { currentObservedAt }).verdict, "wait");
  assert.match(calculateVerdict(sufficientHistory, 1300, { currentObservedAt }).reason, /above both/);
  assert.equal(calculateVerdict(sufficientHistory, 1100, {
    currentObservedAt: day(2)
  }).verdict, "insufficient");
});

test("observation identity deduplicates same-day repeats but preserves real price changes and later dates", () => {
  const first = buildObservationId("lorenz-mk-4087r", "amazon", 2499, "2026-10-21T08:00:00.000Z");
  assert.equal(first, buildObservationId("lorenz-mk-4087r", "amazon", 2499, "2026-10-21T12:00:00.000Z"));
  assert.notEqual(first, buildObservationId("lorenz-mk-4087r", "amazon", 2399, "2026-10-21T12:00:00.000Z"));
  assert.notEqual(first, buildObservationId("lorenz-mk-4087r", "amazon", 2499, "2026-10-22T08:00:00.000Z"));
});

test("history keys group formatting variations of one model but keep model variants separate", () => {
  const hyphenated = productHistoryKey("LORENZ MK-4087R Date Dial with Magnetic Lock Strap Analog Watch - For Men");
  const spaced = productHistoryKey("Lorenz MK 4087R Date Dial Magnetic Lock Strap Analog Watch for Men");
  const withoutBrand = productHistoryKey("MK4087R Date Dial Analog Watch for Men");
  const differentModel = productHistoryKey("Lorenz MK-4087X Date Dial Magnetic Lock Strap Analog Watch for Men");
  assert.equal(hyphenated, spaced);
  assert.equal(hyphenated, withoutBrand);
  assert.notEqual(hyphenated, differentModel);
});

test("compare endpoint rejects unsupported URL hosts without fetching them", async () => {
  const response = await compareHandler(new Request("https://site.test/api/compare?url=https%3A%2F%2Fexample.org%2Fitem"));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Amazon India, Flipkart, Croma, or Reliance Digital/);
});

test("compare endpoint never exposes mock prices when retailer APIs are unavailable", async () => {
  const variableNames = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
    "AMAZON_ACCESS_KEY",
    "AMAZON_SECRET_KEY",
    "AMAZON_PARTNER_TAG",
    "AMAZON_CREATORS_CLIENT_ID",
    "AMAZON_CREATORS_CLIENT_SECRET",
    "AMAZON_CREATORS_CREDENTIAL_VERSION",
    "AMAZON_CREATOR_KEY",
    "AMAZON_CREATOR_SECRET",
    "AMAZON_CREATOR_TAG",
    "FLIPKART_AFFILIATE_ID",
    "FLIPKART_AFFILIATE_TOKEN",
    "CROMA_API_KEY",
    "RELIANCE_DIGITAL_API_KEY"
  ];
  const original = Object.fromEntries(variableNames.map((name) => [name, process.env[name]]));
  for (const name of variableNames) delete process.env[name];
  const originalFetch = globalThis.fetch;
  let networkRequests = 0;
  globalThis.fetch = async () => {
    networkRequests += 1;
    throw new Error("Unexpected network request in unavailable retailer mode");
  };

  try {
    for (const configured of [false, true]) {
      if (configured) {
        for (const name of [
          "AMAZON_ACCESS_KEY",
          "AMAZON_SECRET_KEY",
          "AMAZON_PARTNER_TAG",
          "AMAZON_CREATOR_KEY",
          "AMAZON_CREATOR_SECRET",
          "AMAZON_CREATOR_TAG"
        ]) process.env[name] = "test-only-placeholder";
      }
      const response = await compareHandler(new Request("https://site.test/api/compare?q=Gadget"));
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.success, true);
      assert.equal(result.cheapest, null);
      assert.equal(result.history.length, 0);
      assert.equal(result.verdict.verdict, "insufficient");
      assert.match(result.dataMessage, /No verified offers available right now/);
      assert.equal(result.offers.length, 0);
      assert.equal(result.retailerChecks.length, 4);
      assert.ok(result.retailerChecks.every((check) => check.status === "not_configured"));
      assert.doesNotMatch(JSON.stringify(result), /test-only-placeholder/);
    }
    assert.equal(networkRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of variableNames) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
});

test("comparison shows only the retailer with a verified exact LORENZ model match", async () => {
  const query = "LORENZ MK-4087R Date Dial with Magnetic Lock Strap Analog Watch - For Men";
  const originals = defaultRegistry.getAll();
  const now = new Date().toISOString();
  for (const adapter of originals) {
    const isExactRetailer = adapter.id === "amazon";
    defaultRegistry.register({
      id: adapter.id,
      name: adapter.name,
      buildSearchUrl: adapter.buildSearchUrl.bind(adapter),
      search: async () => isExactRetailer ? {
        status: "verified",
        title: "Lorenz MK 4087R Date Dial with Magnetic Lock Strap Analog Watch for Men",
        price: 2499,
        currency: "INR",
        availability: "in_stock",
        productUrl: "https://www.amazon.in/dp/ABCDEFGHIJ",
        source: "Fixture: authorized product feed response",
        observedAt: now
      } : {
        status: "verified",
        title: "Lorenz MK-4087X Date Dial Magnetic Lock Analog Watch for Men",
        price: 1999,
        currency: "INR",
        availability: "in_stock",
        productUrl: "https://www.flipkart.com/p/item",
        source: "Fixture: authorized product feed response",
        observedAt: now
      }
    });
  }
  try {
    const response = await compareHandler(new Request(
      `https://site.test/api/compare?q=${encodeURIComponent(query)}`
    ));
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.offers.length, 1);
    assert.equal(result.offers[0].store, "amazon");
    assert.equal(result.offers[0].price, 2499);
    assert.equal(result.offers[0].matchEvidence.exactIdentity, true);
    assert.equal(result.offers[0].matchEvidence.exactModel, true);
    assert.equal(result.cheapest.productUrl, "https://www.amazon.in/dp/ABCDEFGHIJ");
  } finally {
    originals.forEach((adapter) => defaultRegistry.register(adapter));
  }
});

test("comparison history is read back from persisted observations on refresh", async () => {
  const query = "LORENZ MK-4087R Date Dial with Magnetic Lock Strap Analog Watch - For Men";
  const productTitle = "Lorenz MK 4087R Date Dial with Magnetic Lock Strap Analog Watch for Men";
  const originals = defaultRegistry.getAll();
  const observedAt = new Date().toISOString();
  const storedRows = [];
  const supabaseClient = {
    from(table) {
      if (table === "gadgets") {
        const builder = {
          select() { return this; },
          ilike() { return this; },
          limit: async () => ({ data: [], error: null })
        };
        return builder;
      }
      if (table === "price_observations") {
        const builder = {
          select() { return this; },
          eq() { return this; },
          gte() { return this; },
          order() { return this; },
          limit: async () => ({ data: [...storedRows], error: null }),
          upsert: async (row) => {
            if (!storedRows.some((stored) => stored.id === row.id)) storedRows.push(row);
            return { error: null };
          }
        };
        return builder;
      }
      throw new Error(`Unexpected table: ${table}`);
    }
  };
  let retailerEnabled = true;
  for (const adapter of originals) {
    const isAmazon = adapter.id === "amazon";
    defaultRegistry.register({
      id: adapter.id,
      name: adapter.name,
      buildSearchUrl: adapter.buildSearchUrl.bind(adapter),
      search: async () => retailerEnabled && isAmazon ? {
        status: "verified",
        title: productTitle,
        price: 2499,
        currency: "INR",
        availability: "in_stock",
        productUrl: "https://www.amazon.in/dp/ABCDEFGHIJ",
        source: "Fixture: authorized product feed response",
        observedAt
      } : {
        status: "not_configured",
        title: null,
        price: null,
        currency: "INR",
        availability: "unknown",
        productUrl: null,
        observedAt
      }
    });
  }

  try {
    const request = () => new Request(
      `https://site.test/api/compare?q=${encodeURIComponent(query)}`
    );
    const firstResponse = await compareHandler(request(), { supabaseClient });
    const firstResult = await firstResponse.json();
    assert.equal(firstResponse.status, 200);
    assert.equal(firstResult.history.length, 1);
    assert.equal(firstResult.history[0].price, 2499);
    assert.equal(storedRows.length, 1);

    retailerEnabled = false;
    const refreshResponse = await compareHandler(request(), { supabaseClient });
    const refreshResult = await refreshResponse.json();
    assert.equal(refreshResponse.status, 200);
    assert.equal(refreshResult.offers.length, 0);
    assert.equal(refreshResult.history.length, 1);
    assert.equal(refreshResult.history[0].price, 2499);
    assert.equal(storedRows.length, 1);
  } finally {
    originals.forEach((adapter) => defaultRegistry.register(adapter));
  }
});

test("price tracking validates input and returns a clear missing-configuration response", async () => {
  const invalid = await trackHandler(new Request("https://site.test/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: "phone", productName: "Phone", targetPrice: -1, email: "a@b.com" })
  }));
  assert.equal(invalid.status, 400);

  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
  try {
    const missingConfig = await trackHandler(new Request("https://site.test/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "phone", productName: "Phone model", targetPrice: 1000, email: "a@example.com" })
    }));
    assert.equal(missingConfig.status, 503);
    assert.match((await missingConfig.json()).error, /SUPABASE_URL/);
  } finally {
    if (originalUrl) process.env.SUPABASE_URL = originalUrl;
    if (originalKey) process.env.SUPABASE_SERVICE_KEY = originalKey;
  }
});

test("price target persistence requires exact verified product history and database confirmation", async () => {
  const productName = "LORENZ MK-4087R Date Dial with Magnetic Lock Strap Analog Watch - For Men";
  const savedAlerts = [];
  const makeClient = (gadget) => ({
    from(table) {
      if (table === "gadgets") {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: gadget, error: null })
        };
      }
      if (table === "price_alerts") {
        return {
          upsert(record, options) {
            savedAlerts.push({ record, options });
            return {
              select() {
                return { single: async () => ({ data: { id: "alert-test-id" }, error: null }) };
              }
            };
          }
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }
  });
  const catalogId = "catalog-watch-1";
  const client = makeClient({ id: catalogId, name: productName });
  const result = await savePriceAlert(client, {
    productId: catalogId,
    productName,
    email: "buyer@example.com",
    targetPrice: 2500
  });
  assert.equal(result.saved, true);
  assert.equal(savedAlerts.length, 1);
  assert.equal(savedAlerts[0].record.product_id, catalogId);
  assert.equal(savedAlerts[0].options.onConflict, "product_id,email,target_price");

  const modelId = productHistoryKey(productName);
  const modelResult = await savePriceAlert(makeClient(null), {
    productId: modelId,
    productName,
    email: "buyer@example.com",
    targetPrice: 2400
  });
  assert.equal(modelResult.saved, true);

  const invalidClient = makeClient(null);
  const rejected = await savePriceAlert(invalidClient, {
    productId: "unrelated-product",
    productName,
    email: "buyer@example.com",
    targetPrice: 2500
  });
  assert.equal(rejected.saved, false);
  assert.match(rejected.error, /identified reliably/);
});

test("price tracking can persist a reliable catalog alert before the first observation", async () => {
  const productName = "PRAIZY Analog Watch for Men";
  const productId = "catalog-praizy-watch";
  let savedRecord = null;
  const supabaseClient = {
    from(table) {
      if (table === "gadgets") {
        return {
          select() { return this; },
          eq(column, value) {
            assert.equal(column, "id");
            assert.equal(value, productId);
            return this;
          },
          maybeSingle: async () => ({
            data: { id: productId, name: productName },
            error: null
          })
        };
      }
      if (table === "price_alerts") {
        return {
          upsert(record, options) {
            savedRecord = { record, options };
            return {
              select() {
                return { single: async () => ({ data: { id: "saved-alert-id" }, error: null }) };
              }
            };
          }
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }
  };
  const envNames = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY"];
  const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SERVICE_KEY = "test-only-key";
  delete process.env.SUPABASE_SECRET_KEY;

  try {
    const response = await trackHandler(new Request("https://site.test/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        productName,
        targetPrice: 1800,
        email: "buyer@example.com"
      })
    }), { supabaseClient });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.match(result.message, /Checks will begin when a verified offer is available/);
    assert.equal(savedRecord.record.product_id, productId);
    assert.equal(savedRecord.options.onConflict, "product_id,email,target_price");
  } finally {
    for (const name of envNames) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  }
});

test("comparison excludes out-of-stock, invalid, mismatched, and non-product URL results", async () => {
  const query = "LORENZ MK-4087R Date Dial Analog Watch For Men";
  const baseOffer = {
    status: "verified",
    title: "Lorenz MK 4087R Date Dial Analog Watch for Men",
    price: 2499,
    currency: "INR",
    availability: "in_stock",
    productUrl: "https://www.amazon.in/dp/ABCDEFGHIJ",
    source: "Amazon Creators API",
    observedAt: new Date().toISOString()
  };
  const invalidResults = [
    { ...baseOffer, availability: "out_of_stock" },
    { ...baseOffer, price: 0 },
    { ...baseOffer, title: "Lorenz MK-4087X Date Dial Analog Watch for Men" },
    { ...baseOffer, productUrl: "https://www.amazon.in/s?k=lorenz" }
  ];

  for (const invalidResult of invalidResults) {
    const { response, result } = await compareWithAmazonResult(query, invalidResult);
    assert.equal(response.status, 200);
    assert.deepEqual(result.offers, []);
    assert.equal(result.cheapest, null);
    assert.match(result.dataMessage, /No verified offers available right now/);
  }
});

test("frontend available-offer filter rejects retailer failures and unsafe or stale offers", () => {
  const now = Date.now();
  const validOffer = {
    status: "verified",
    currency: "INR",
    price: 2499,
    availability: "in_stock",
    title: "Lorenz MK 4087R Analog Watch for Men",
    source: "Authorized product API",
    matchEvidence: { exactIdentity: true },
    productUrl: "https://www.amazon.in/dp/ABCDEFGHIJ",
    url: "https://www.amazon.in/dp/ABCDEFGHIJ",
    asOf: new Date(now - 1000).toISOString()
  };
  const offers = [
    validOffer,
    { ...validOffer, status: "not_configured" },
    { ...validOffer, availability: "out_of_stock" },
    { ...validOffer, price: Number.NaN },
    { ...validOffer, title: "Different model" , matchEvidence: { exactIdentity: false } },
    { ...validOffer, productUrl: "https://www.amazon.in/s?k=watch", url: "https://www.amazon.in/s?k=watch" },
    { ...validOffer, asOf: new Date(now - 25 * 60 * 60 * 1000).toISOString() }
  ];
  assert.deepEqual(filterAvailableOffers(offers, now), [validOffer]);
});
