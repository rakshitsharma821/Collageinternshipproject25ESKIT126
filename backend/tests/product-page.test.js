import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractProductName, getRetailerForHostname, resolveProductUrl } from "../lib/compare.js";
import { parseRetailerProductPage, isRetailerPageAccessAuthorized } from "../lib/product-page.js";
import compareHandler from "../api/compare.js";

const inStockFixture = await readFile(new URL("./fixtures/authorized-product-page.test-fixture.html", import.meta.url), "utf8");
const outOfStockFixture = await readFile(new URL("./fixtures/authorized-product-page-out-of-stock.test-fixture.html", import.meta.url), "utf8");

test("authorized product-page parser extracts only exact structured new INR in-stock offers", () => {
  const observedAt = "2026-10-22T05:00:00.000Z";
  const offer = parseRetailerProductPage(
    inStockFixture,
    "https://www.amazon.in/dp/B0TEST1234",
    "amazon",
    observedAt
  );

  assert.deepEqual(offer, {
    retailerId: "amazon",
    title: "LORENZ MK-4087R Analog Watch for Men",
    price: 2499,
    currency: "INR",
    availability: "in_stock",
    productUrl: "https://www.amazon.in/dp/B0TEST1234",
    source: "Authorized retailer product-page structured data",
    observedAt,
    priceQualification: "Listed item price; delivery and checkout charges may vary."
  });
});

test("product-page parser rejects out-of-stock, unknown-condition, aggregate, invalid, and stale data", () => {
  assert.equal(parseRetailerProductPage(
    outOfStockFixture,
    "https://www.amazon.in/dp/B0TEST1234",
    "amazon"
  ), null);

  const noCondition = inStockFixture.replace(
    '"itemCondition": "https://schema.org/NewCondition"',
    ""
  );
  assert.equal(parseRetailerProductPage(
    noCondition,
    "https://www.amazon.in/dp/B0TEST1234",
    "amazon"
  ), null);

  const noAvailability = inStockFixture.replace(
    '"availability": "https://schema.org/InStock",',
    ""
  );
  assert.equal(parseRetailerProductPage(
    noAvailability,
    "https://www.amazon.in/dp/B0TEST1234",
    "amazon"
  ), null);

  const invalidCurrency = inStockFixture.replace('"priceCurrency": "INR"', '"priceCurrency": "USD"');
  assert.equal(parseRetailerProductPage(
    invalidCurrency,
    "https://www.amazon.in/dp/B0TEST1234",
    "amazon"
  ), null);

  const invalidPrice = inStockFixture.replace('"price": "2499.00"', '"price": "0"');
  assert.equal(parseRetailerProductPage(
    invalidPrice,
    "https://www.amazon.in/dp/B0TEST1234",
    "amazon"
  ), null);

  const aggregateOffer = inStockFixture.replace('"@type": "Offer"', '"@type": "AggregateOffer"');
  assert.equal(parseRetailerProductPage(
    aggregateOffer,
    "https://www.amazon.in/dp/B0TEST1234",
    "amazon"
  ), null);

  assert.equal(parseRetailerProductPage(
    inStockFixture,
    "https://www.amazon.in/dp/B0TEST1234",
    "amazon",
    new Date().toISOString(),
    86401
  ), null);
  const wrongCanonical = inStockFixture.replace(
    "https://www.amazon.in/dp/B0TEST1234",
    "https://www.flipkart.com/p/item"
  );
  assert.equal(parseRetailerProductPage(
    wrongCanonical,
    "https://www.amazon.in/dp/B0TEST1234",
    "amazon"
  ), null);
});

test("retailer page checks are disabled unless the retailer-specific authorization is true", () => {
  assert.equal(isRetailerPageAccessAuthorized("amazon", {}), false);
  assert.equal(isRetailerPageAccessAuthorized("flipkart", {
    FLIPKART_PRODUCT_PAGE_ACCESS_AUTHORIZED: "true"
  }), true);
  assert.equal(isRetailerPageAccessAuthorized("flipkart", {
    FLIPKART_PRODUCT_PAGE_ACCESS_AUTHORIZED: "1"
  }), false);
});

test("short-link host resolves to its retailer authorization setting", async () => {
  assert.equal(getRetailerForHostname("amzn.to"), "amazon");
  assert.equal(getRetailerForHostname("fkrt.it"), "flipkart");
  assert.equal(isRetailerPageAccessAuthorized("amazon", {
    AMAZON_PRODUCT_PAGE_ACCESS_AUTHORIZED: "true"
  }), true);

  const resolved = await resolveProductUrl("https://amzn.to/short", async (url) => {
    if (url === "https://amzn.to/short") {
      return new Response(null, {
        status: 302,
        headers: { Location: "https://www.amazon.in/dp/B0TEST1234" }
      });
    }
    assert.equal(url, "https://www.amazon.in/dp/B0TEST1234");
    return new Response(inStockFixture);
  });
  assert.equal(resolved.valid, true);
  assert.equal(resolved.url, "https://www.amazon.in/dp/B0TEST1234");
});

test("short links cannot redirect into a different retailer", async () => {
  let requests = 0;
  const resolved = await resolveProductUrl("https://amzn.to/short", async () => {
    requests += 1;
    return new Response(null, {
      status: 302,
      headers: { Location: "https://www.flipkart.com/product/item" }
    });
  });
  assert.equal(resolved.valid, false);
  assert.match(resolved.error, /different retailer/);
  assert.equal(requests, 1);
});

test("product name extraction follows JSON-LD mainEntity and schema.org type URLs", () => {
  assert.equal(
    extractProductName(inStockFixture),
    "LORENZ MK-4087R Analog Watch for Men"
  );
});

test("product link resolution rejects malformed Age headers", async () => {
  const result = await resolveProductUrl("https://www.amazon.in/dp/B0TEST1234", async () =>
    new Response("product", { headers: { Age: "unknown" } })
  );
  assert.equal(result.valid, false);
  assert.match(result.error, /freshness/);
});

test("compare URL path does not fetch retailer pages without explicit access authorization", async () => {
  const variable = "AMAZON_PRODUCT_PAGE_ACCESS_AUTHORIZED";
  const originalAuthorization = process.env[variable];
  const originalFetch = globalThis.fetch;
  let requests = 0;
  delete process.env[variable];
  globalThis.fetch = async () => {
    requests += 1;
    throw new Error("Unexpected retailer request.");
  };

  try {
    const response = await compareHandler(new Request(
      "https://site.test/api/compare?url=https%3A%2F%2Fwww.amazon.in%2Fdp%2FB0TEST1234"
    ));
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /AMAZON_PRODUCT_PAGE_ACCESS_AUTHORIZED=true/);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAuthorization === undefined) delete process.env[variable];
    else process.env[variable] = originalAuthorization;
  }
});

test("authorized direct product URL returns a verified offer from page structured data", async () => {
  const variable = "AMAZON_PRODUCT_PAGE_ACCESS_AUTHORIZED";
  const envNames = [
    variable,
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
    "SUPABASE_SECRET_KEY",
    "AMAZON_CREATORS_CLIENT_ID",
    "AMAZON_CREATORS_CLIENT_SECRET",
    "AMAZON_CREATORS_CREDENTIAL_VERSION",
    "AMAZON_PARTNER_TAG",
    "FLIPKART_AFFILIATE_ID",
    "FLIPKART_AFFILIATE_TOKEN",
    "CROMA_API_KEY",
    "RELIANCE_DIGITAL_API_KEY"
  ];
  const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  for (const name of envNames) delete process.env[name];
  process.env[variable] = "true";
  let requests = 0;
  globalThis.fetch = async (url) => {
    requests += 1;
    assert.equal(url, "https://www.amazon.in/dp/B0TEST1234");
    return new Response(inStockFixture, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  };

  try {
    const response = await compareHandler(new Request(
      "https://site.test/api/compare?url=https%3A%2F%2Fwww.amazon.in%2Fdp%2FB0TEST1234"
    ));
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.offers.length, 1, JSON.stringify(result));
    assert.equal(result.offers[0].store, "amazon");
    assert.equal(result.offers[0].price, 2499);
    assert.equal(result.offers[0].matchEvidence.exactIdentity, true);
    assert.equal(result.cheapest.productUrl, "https://www.amazon.in/dp/B0TEST1234");
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of envNames) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  }
});

test("direct product-page data is not offered for a different requested model", async () => {
  const variable = "AMAZON_PRODUCT_PAGE_ACCESS_AUTHORIZED";
  const envNames = [
    variable,
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
    "SUPABASE_SECRET_KEY",
    "AMAZON_CREATORS_CLIENT_ID",
    "AMAZON_CREATORS_CLIENT_SECRET",
    "AMAZON_CREATORS_CREDENTIAL_VERSION",
    "AMAZON_PARTNER_TAG",
    "FLIPKART_AFFILIATE_ID",
    "FLIPKART_AFFILIATE_TOKEN",
    "CROMA_API_KEY",
    "RELIANCE_DIGITAL_API_KEY"
  ];
  const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  for (const name of envNames) delete process.env[name];
  process.env[variable] = "true";
  globalThis.fetch = async () => new Response(inStockFixture, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });

  try {
    const response = await compareHandler(new Request(
      "https://site.test/api/compare?url=https%3A%2F%2Fwww.amazon.in%2Fdp%2FB0TEST1234&q=LORENZ%20MK-4087X%20Analog%20Watch"
    ));
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.offers.length, 0, JSON.stringify(result));
    assert.equal(result.cheapest, null);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of envNames) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  }
});
