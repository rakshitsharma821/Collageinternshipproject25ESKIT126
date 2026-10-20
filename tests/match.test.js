import test from "node:test";
import assert from "node:assert";
import {
  normalizeTitle,
  parsePrice,
  calculateSimilarity,
  extractProductAttributes,
  checkOfferComparability,
  findCheapestOffer,
  rankResults,
  formatPriceINR
} from "../lib/match.js";

test("normalizeTitle converts to lowercase and cleans punctuation", () => {
  assert.strictEqual(normalizeTitle("Apple iPhone 16 Pro Max (256 GB)!"), "apple iphone 16 pro max 256 gb");
  assert.strictEqual(normalizeTitle(""), "");
});

test("parsePrice normalizes raw prices and formatted currency strings", () => {
  assert.strictEqual(parsePrice(124999), 124999);
  assert.strictEqual(parsePrice("Rs. 1,24,999.00"), 124999);
  assert.strictEqual(parsePrice("₹ 89,990"), 89990);
  assert.strictEqual(parsePrice(0), null);
  assert.strictEqual(parsePrice(-500), null);
  assert.strictEqual(parsePrice("invalid"), null);
});

test("calculateSimilarity scores token overlaps accurately", () => {
  const query = "iphone 16 pro";
  const title1 = "Apple iPhone 16 Pro 128GB Black";
  const title2 = "Samsung Galaxy S24 Ultra";
  assert.strictEqual(calculateSimilarity(query, title1), 1);
  assert.strictEqual(calculateSimilarity(query, title2), 0);
});

test("extractProductAttributes correctly parses model tier, storage, and accessories", () => {
  const phone = extractProductAttributes("Apple iPhone 16 Pro Max (256 GB) - Desert Titanium");
  assert.strictEqual(phone.brand, "apple");
  assert.strictEqual(phone.tier, "pro max");
  assert.strictEqual(phone.storage, 256);
  assert.strictEqual(phone.isAccessory, false);

  const accessory = extractProductAttributes("Spigen Ultra Hybrid Back Case Cover for iPhone 16 Pro Max");
  assert.strictEqual(accessory.isAccessory, true);
  assert.strictEqual(accessory.tier, "pro max");

  const laptop = extractProductAttributes("Apple MacBook Pro 16 M4 Pro (48 GB RAM, 1 TB SSD)");
  assert.strictEqual(laptop.storage, 1024);
  assert.strictEqual(laptop.ram, 48);
  assert.strictEqual(laptop.chip, "m4 pro");
});

test("checkOfferComparability prevents comparing accessories or mismatched tiers", () => {
  const queryPhone = "iPhone 16 128GB";
  const offerAcc = "Silicon Case Cover for iPhone 16 128GB";
  const checkAcc = checkOfferComparability(queryPhone, offerAcc);
  assert.strictEqual(checkAcc.comparable, false);
  assert.ok(checkAcc.reason.includes("accessory"));

  const queryBase = "iPhone 16";
  const offerPro = "Apple iPhone 16 Pro 128GB";
  const checkTier = checkOfferComparability(queryBase, offerPro);
  assert.strictEqual(checkTier.comparable, false);
  assert.ok(checkTier.reason.includes("Variant mismatch"));

  const queryStorage = "iPhone 16 128GB";
  const offerStorage = "Apple iPhone 16 256GB";
  const checkStorage = checkOfferComparability(queryStorage, offerStorage);
  assert.strictEqual(checkStorage.comparable, false);
  assert.ok(checkStorage.reason.includes("Storage mismatch"));

  const queryMatch = "iPhone 16 128GB";
  const offerMatch = "Apple iPhone 16 (128 GB) - Ultramarine";
  const checkMatch = checkOfferComparability(queryMatch, offerMatch);
  assert.strictEqual(checkMatch.comparable, true);
});

test("findCheapestOffer identifies lowest valid offer correctly", () => {
  const offers = [
    { store: "flipkart", price: 124999 },
    { store: "amazon", price: 119999 },
    { store: "croma", price: 129999 }
  ];
  const cheapest = findCheapestOffer(offers);
  assert.strictEqual(cheapest.store, "amazon");
  assert.strictEqual(cheapest.price, 119999);
});

test("rankResults sorts by price ascending and identifies cheapest with youSave", () => {
  const raw = [
    { store: "flipkart", price: 124999, title: "iPhone 16 Pro Max" },
    { store: "amazon", price: 119999, title: "iPhone 16 Pro Max" },
    { store: "croma", price: 129999, title: "iPhone 16 Pro Max" }
  ];

  const ranked = rankResults(raw);
  assert.strictEqual(ranked.length, 3);
  assert.strictEqual(ranked[0].store, "amazon");
  assert.strictEqual(ranked[0].best, true);
  assert.strictEqual(ranked[0].youSave, 5000); // 124999 - 119999
  assert.strictEqual(ranked[1].best, false);
  assert.strictEqual(ranked[2].best, false);
});

test("rankResults with query rejects non-comparable accessory from being crowned cheapest", () => {
  const raw = [
    { store: "flipkart", price: 79999, title: "Apple iPhone 16 (128 GB)" },
    { store: "amazon", price: 76999, title: "Apple iPhone 16 (128 GB)" },
    { store: "croma", price: 999, title: "Clear Case Cover for iPhone 16" } // Cheap accessory!
  ];

  const ranked = rankResults(raw, "iPhone 16");
  assert.strictEqual(ranked[0].store, "amazon");
  assert.strictEqual(ranked[0].price, 76999);
  assert.strictEqual(ranked[0].best, true);
  assert.strictEqual(ranked[0].youSave, 3000); // 79999 - 76999

  // The 999 case should NOT be marked best
  const caseOffer = ranked.find((o) => o.price === 999);
  assert.strictEqual(caseOffer.comparable, false);
  assert.strictEqual(caseOffer.best, false);
});

test("rankResults places errored stores at the bottom", () => {
  const raw = [
    { store: "amazon", price: 119999, title: "iPhone 16 Pro Max" },
    { store: "flipkart", error: "Store blocked the request", price: 0 }
  ];

  const ranked = rankResults(raw);
  assert.strictEqual(ranked[0].store, "amazon");
  assert.strictEqual(ranked[1].store, "flipkart");
  assert.strictEqual(ranked[1].error, "Store blocked the request");
});

test("formatPriceINR produces valid INR currency string", () => {
  const formatted = formatPriceINR(119999);
  assert.ok(formatted.includes("1,19,999") || formatted.includes("119,999"));
});
