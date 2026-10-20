import test from "node:test";
import assert from "node:assert";
import {
  normalizeProduct,
  areVariantsEquivalent,
  classifyMatch
} from "../lib/identity.js";

test("normalizeProduct extracts brand, tier, storage, condition, and accessory status", () => {
  const norm1 = normalizeProduct("Apple iPhone 16 Pro Max (256 GB) - Desert Titanium");
  assert.strictEqual(norm1.brand, "Apple");
  assert.strictEqual(norm1.tier, "pro max");
  assert.strictEqual(norm1.storage, "256GB");
  assert.strictEqual(norm1.condition, "new");
  assert.strictEqual(norm1.isAccessory, false);

  const norm2 = normalizeProduct("(Renewed) Apple iPhone 15 (128GB) - Black");
  assert.strictEqual(norm2.brand, "Apple");
  assert.strictEqual(norm2.storage, "128GB");
  assert.strictEqual(norm2.condition, "refurbished");
  assert.strictEqual(norm2.isAccessory, false);

  const norm3 = normalizeProduct("Spigen Tempered Glass Screen Protector for iPhone 16");
  assert.strictEqual(norm3.isAccessory, true);
});

test("areVariantsEquivalent rejects different storage capacities", () => {
  const a = normalizeProduct("Apple iPhone 16 128GB");
  const b = normalizeProduct("Apple iPhone 16 256GB");
  assert.strictEqual(areVariantsEquivalent(a, b), false);
});

test("areVariantsEquivalent rejects new vs refurbished models", () => {
  const a = normalizeProduct("Apple iPhone 16 128GB");
  const b = normalizeProduct("(Renewed) Apple iPhone 16 128GB");
  assert.strictEqual(areVariantsEquivalent(a, b), false);
});

test("areVariantsEquivalent rejects base vs Pro models", () => {
  const a = normalizeProduct("iPhone 16");
  const b = normalizeProduct("iPhone 16 Pro");
  assert.strictEqual(areVariantsEquivalent(a, b), false);
});

test("classifyMatch detects accessory and labels alternative appropriately", () => {
  const accessory = classifyMatch("iPhone 16", "Silicon Case for iPhone 16");
  assert.strictEqual(accessory.matchType, "accessory");

  const altStorage = classifyMatch("iPhone 16 128GB", "iPhone 16 256GB");
  assert.strictEqual(altStorage.matchType, "alternative");

  const exact = classifyMatch("iPhone 16 128GB", "Apple iPhone 16 (128 GB) - Ultramarine");
  assert.strictEqual(exact.matchType, "exact");
});
