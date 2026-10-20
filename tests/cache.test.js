import test from "node:test";
import assert from "node:assert";
import { isCacheValid, createCacheEntry, readStorageCache, writeStorageCache } from "../lib/cache.js";

test("isCacheValid respects cache TTL", () => {
  const now = 1000000;
  const ttlMs = 60000; // 1 min

  assert.strictEqual(isCacheValid(now - 30000, ttlMs, now), true);
  assert.strictEqual(isCacheValid(now - 60000, ttlMs, now), false);
  assert.strictEqual(isCacheValid(now - 90000, ttlMs, now), false);
  assert.strictEqual(isCacheValid(null, ttlMs, now), false);
});

test("createCacheEntry returns object with timestamp and data", () => {
  const now = 123456789;
  const entry = createCacheEntry({ test: "val" }, now);
  assert.strictEqual(entry.timestamp, now);
  assert.deepStrictEqual(entry.data, { test: "val" });
});

test("readStorageCache and writeStorageCache work with mock storage", () => {
  const store = {};
  const mockStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => {
      store[key] = String(val);
    },
    removeItem: (key) => {
      delete store[key];
    }
  };

  const t0 = 1000000;
  writeStorageCache(mockStorage, "gv:test", { name: "MacBook" }, t0);

  // Read within TTL
  const valid = readStorageCache(mockStorage, "gv:test", 60000, t0 + 20000);
  assert.deepStrictEqual(valid, { name: "MacBook" });

  // Read past TTL
  const expired = readStorageCache(mockStorage, "gv:test", 60000, t0 + 70000);
  assert.strictEqual(expired, null);
  assert.strictEqual(mockStorage.getItem("gv:test"), null); // Evicted
});
