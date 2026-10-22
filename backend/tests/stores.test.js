import test from "node:test";
import assert from "node:assert";
import { STORES, getStoreById, getAllStores } from "../lib/stores.js";

test("STORES array contains the four supported retailers", () => {
  const storeIds = STORES.map((s) => s.id);
  assert.ok(storeIds.includes("amazon"));
  assert.ok(storeIds.includes("flipkart"));
  assert.ok(storeIds.includes("croma"));
  assert.ok(storeIds.includes("reliance"));
  assert.equal(storeIds.includes("tatacliq"), false);
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
