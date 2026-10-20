const test = require("node:test");
const assert = require("node:assert");
const { STORES, getStoreById, getAllStores } = require("../lib/stores.js");

test("STORES array contains Amazon, Flipkart, and Croma", () => {
  const storeIds = STORES.map((s) => s.id);
  assert.ok(storeIds.includes("amazon"));
  assert.ok(storeIds.includes("flipkart"));
  assert.ok(storeIds.includes("croma"));
});

test("getStoreById finds store correctly or returns null", () => {
  const amazon = getStoreById("amazon");
  assert.strictEqual(amazon.name, "Amazon");
  assert.strictEqual(amazon.mark, "A");
  assert.strictEqual(getStoreById("unknown"), null);
});

test("buildSearchUrl properly encodes queries", () => {
  const croma = getStoreById("croma");
  const url = croma.buildSearchUrl("macbook pro 16");
  assert.strictEqual(url, "https://www.croma.com/searchB?q=macbook%20pro%2016");
});
