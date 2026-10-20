import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  sanitizeGadgetItem,
  loadAndSanitizeSeedData,
  removeSeededCatalog,
  SEEDED_GADGET_IDS
} from "../supabase/seed.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("SEEDED_GADGET_IDS lists exactly the 19 legacy seed items", () => {
  assert.strictEqual(SEEDED_GADGET_IDS.length, 19);
  assert.ok(SEEDED_GADGET_IDS.includes("p1"));
  assert.ok(SEEDED_GADGET_IDS.includes("l1"));
  assert.ok(SEEDED_GADGET_IDS.includes("w1"));
  assert.ok(SEEDED_GADGET_IDS.includes("e1"));
  assert.ok(SEEDED_GADGET_IDS.includes("t1"));
});

test("removeSeededCatalog explicitly deletes by target IDs without dropping tables", async () => {
  let targetTable = null;
  let targetIds = null;

  const mockClient = {
    from: (table) => {
      targetTable = table;
      return {
        delete: () => ({
          in: (col, ids) => {
            targetIds = ids;
            return {
              select: () => Promise.resolve({
                data: ids.map((id) => ({ id, name: `Item ${id}` })),
                error: null
              })
            };
          }
        })
      };
    }
  };

  const res = await removeSeededCatalog(mockClient);
  assert.strictEqual(targetTable, "gadgets");
  assert.deepStrictEqual(targetIds, SEEDED_GADGET_IDS);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.deletedCount, 19);
});

test("data/gadgets.json contains valid catalog without any price fields", () => {
  const dataPath = path.resolve(__dirname, "../data/gadgets.json");
  const raw = fs.readFileSync(dataPath, "utf-8");
  const gadgets = JSON.parse(raw);

  assert.ok(Array.isArray(gadgets));
  assert.strictEqual(gadgets.length, 19);

  for (const item of gadgets) {
    assert.ok(item.id, "Every item must have an id");
    assert.ok(item.name, "Every item must have a name");
    assert.ok(item.brand, "Every item must have a brand");
    assert.ok(item.category, "Every item must have a category");
    assert.ok(typeof item.rating === "number", "Every item must have a numeric rating");

    // Strictly ensure no pricing field is present
    assert.strictEqual(item.price, undefined, `Item ${item.id} should not have a price property`);
    assert.strictEqual(item.current_price, undefined, `Item ${item.id} should not have a current_price property`);
    assert.strictEqual(item.target_price, undefined, `Item ${item.id} should not have a target_price property`);
  }
});

test("sanitizeGadgetItem strips unexpected price properties and validates columns", () => {
  const dirtyItem = {
    id: "p99",
    name: "Pixel 9 Pro",
    brand: "Google",
    category: "phone",
    rating: 9.2,
    review: "Stellar cameras",
    image_url: "https://example.com/img.jpg",
    price: 99999, // Should be stripped
    current_price: 95000 // Should be stripped
  };

  const sanitized = sanitizeGadgetItem(dirtyItem);
  assert.strictEqual(sanitized.id, "p99");
  assert.strictEqual(sanitized.name, "Pixel 9 Pro");
  assert.strictEqual(sanitized.price, undefined);
  assert.strictEqual(sanitized.current_price, undefined);
  assert.strictEqual(Object.keys(sanitized).includes("price"), false);
});

test("sanitizeGadgetItem rejects items missing required schema fields", () => {
  assert.throws(() => sanitizeGadgetItem(null), /Invalid gadget item/);
  assert.throws(() => sanitizeGadgetItem({ name: "Incomplete" }), /missing required string 'id'/);
  assert.throws(() => sanitizeGadgetItem({ id: "1" }), /missing required string 'name'/);
  assert.throws(() => sanitizeGadgetItem({ id: "1", name: "Gadget", brand: "Brand", category: "spaceships" }), /unsupported category/);
});

test("loadAndSanitizeSeedData successfully sanitizes full seed set", () => {
  const sanitized = loadAndSanitizeSeedData();
  assert.strictEqual(sanitized.length, 19);
  for (const item of sanitized) {
    assert.strictEqual(item.price, undefined);
  }
});
