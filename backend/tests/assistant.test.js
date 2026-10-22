import test from "node:test";
import assert from "node:assert";
import { parseShoppingIntent, recommendProducts } from "../lib/assistant.js";

test("parseShoppingIntent extracts budget, category, brands, and feature priorities", () => {
  const query = "I need a Samsung phone under 25,000 for college with good battery life and camera";
  const parsed = parseShoppingIntent(query);

  assert.strictEqual(parsed.budgetMax, 25000);
  assert.strictEqual(parsed.category, "phone");
  assert.ok(parsed.preferredBrands.includes("Samsung"));
  assert.ok(parsed.priorityFeatures.includes("battery"));
  assert.ok(parsed.priorityFeatures.includes("camera"));
});

test("recommendProducts filters and scores candidates honestly", () => {
  const candidates = [
    {
      id: "c1",
      name: "Samsung Galaxy M35 5G",
      brand: "Samsung",
      category: "phone",
      price: 19999,
      review: "Huge 6000mAh battery life and great camera quality for daylight.",
      rating: 4.3
    },
    {
      id: "c2",
      name: "Dell Inspiron Laptop",
      brand: "Dell",
      category: "laptop",
      price: 55000,
      review: "High performance i7 laptop.",
      rating: 4.1
    }
  ];

  const criteria = parseShoppingIntent("phone under 25000 with long battery");
  const results = recommendProducts(candidates, criteria);

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].id, "c1");
  assert.ok(results[0].recommendationScore > 70);
  assert.ok(results[0].matchReasons.some((r) => r.includes("battery")));
});
