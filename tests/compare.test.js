import test from "node:test";
import assert from "node:assert";
import handler, {
  parseAmazon,
  parseFlipkart,
  parseCroma,
  scrapeStore,
  MIN_QUERY_LENGTH,
  MAX_QUERY_LENGTH
} from "../netlify/functions/compare.mjs";
import { getStoreById } from "../lib/stores.js";

test("parseAmazon extracts valid price and title from search snippet", () => {
  const html = `
    <div data-component-type="s-search-result">
      <h2><a href="#"><span>Apple iPhone 16 (128 GB) - Ultramarine</span></a></h2>
      <span class="a-price"><span class="a-offscreen">₹76,999.00</span><span class="a-price-whole">76,999<span class="a-price-decimal">.</span></span></span>
    </div>
  `;
  const result = parseAmazon(html, "iPhone 16");
  assert.ok(result);
  assert.strictEqual(result.price, 76999);
  assert.strictEqual(result.title, "Apple iPhone 16 (128 GB) - Ultramarine");
});

test("parseAmazon detects anti-bot challenge correctly", () => {
  const html = "<html><body><h4>Robot Check</h4><p>Type the characters you see in this image</p></body></html>";
  const result = parseAmazon(html, "iPhone 16");
  assert.ok(result);
  assert.ok(result.error);
  assert.ok(result.error.includes("anti-bot"));
});

test("parseAmazon returns null when no price elements are present", () => {
  const html = "<div><h2><span>Out of stock item</span></h2></div>";
  const result = parseAmazon(html, "iPhone 16");
  assert.strictEqual(result, null);
});

test("parseFlipkart extracts valid price and title from listing snippet", () => {
  const html = `
    <div class="cPHDOP">
      <div class="KzDlHZ">Apple iPhone 16 (Black, 128 GB)</div>
      <div class="QiMO5r"><div class="hZ3P6w DeU9vF">₹74,999</div></div>
    </div>
  `;
  const result = parseFlipkart(html, "iPhone 16");
  assert.ok(result);
  assert.strictEqual(result.price, 74999);
  assert.strictEqual(result.title, "Apple iPhone 16 (Black, 128 GB)");
});

test("parseFlipkart returns null when no prices are matched", () => {
  const html = "<div><p>No products found for this search</p></div>";
  const result = parseFlipkart(html, "unknown gadget");
  assert.strictEqual(result, null);
});

test("parseCroma reports client-side SPA rendering requirement accurately", () => {
  const html = "<!doctype html><html><head><title>Search undefined | Croma</title></head><body><div id='root'></div></body></html>";
  const result = parseCroma(html, "MacBook Pro");
  assert.ok(result);
  assert.ok(result.error);
  assert.ok(result.error.includes("client-side JavaScript"));
});

test("scrapeStore parses successful response with valid timestamp and price", async () => {
  const store = getStoreById("amazon");
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    text: async () => `
      <h2><span>MacBook Pro 16 M4</span></h2>
      <span class="a-price-whole">2,49,900</span>
    `
  });

  const offer = await scrapeStore(store, "MacBook Pro 16", mockFetch, 2000);
  assert.strictEqual(offer.store, "amazon");
  assert.strictEqual(offer.name, "Amazon");
  assert.strictEqual(offer.price, 249900);
  assert.ok(offer.observedAt);
  assert.ok(!isNaN(Date.parse(offer.observedAt)));
});

test("scrapeStore handles HTTP 503 error safely with URL preserved", async () => {
  const store = getStoreById("flipkart");
  const mockFetch = async () => ({
    ok: false,
    status: 503,
    text: async () => "Service Unavailable"
  });

  const offer = await scrapeStore(store, "iPhone 16", mockFetch, 2000);
  assert.strictEqual(offer.store, "flipkart");
  assert.ok(offer.error && offer.error.includes("503"));
  assert.strictEqual(offer.url, store.buildSearchUrl("iPhone 16"));
  assert.ok(offer.observedAt);
});

test("scrapeStore handles timeout errors safely", async () => {
  const store = getStoreById("croma");
  const mockFetch = async () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    throw err;
  };

  const offer = await scrapeStore(store, "Sony Bravia", mockFetch, 100);
  assert.strictEqual(offer.store, "croma");
  assert.strictEqual(offer.error, "Request timed out");
  assert.ok(offer.observedAt);
});

test("compare handler validates missing, short, and long queries", async () => {
  const reqEmpty = new Request("http://localhost/api/compare");
  const resEmpty = await handler(reqEmpty);
  assert.strictEqual(resEmpty.status, 400);

  const reqShort = new Request("http://localhost/api/compare?q=a");
  const resShort = await handler(reqShort);
  assert.strictEqual(resShort.status, 400);

  const reqLong = new Request(`http://localhost/api/compare?q=${"x".repeat(101)}`);
  const resLong = await handler(reqLong);
  assert.strictEqual(resLong.status, 400);
});

test("compare handler rejects non-GET methods with 405", async () => {
  const req = new Request("http://localhost/api/compare?q=iphone", { method: "DELETE" });
  const res = await handler(req);
  assert.strictEqual(res.status, 405);
});
