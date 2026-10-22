import test from "node:test";
import assert from "node:assert/strict";
import { getRetailerById, RETAILER_REGISTRY } from "../lib/retailer-registry.js";

test("retailer registry covers electronics, marketplace, fashion, and home categories", () => {
  const categories = new Set(RETAILER_REGISTRY.flatMap((retailer) => retailer.categories));
  for (const category of ["electronics", "marketplace", "fashion", "home", "appliances"]) {
    assert.ok(categories.has(category), `Missing retailer category: ${category}`);
  }
});

test("only the Amazon connector is marked implemented, and it is not reported live", () => {
  const implemented = RETAILER_REGISTRY.filter((retailer) =>
    retailer.implemented
  );

  assert.deepStrictEqual(implemented.map((retailer) => retailer.id), ["amazon"]);
  assert.strictEqual(implemented[0].configured, false);
  assert.strictEqual(implemented[0].liveTested, false);
});

test("Flipkart is recorded as documented but not falsely marked implemented", () => {
  const flipkart = getRetailerById("flipkart");

  assert.ok(flipkart.documentationUrl);
  assert.strictEqual(flipkart.implemented, false);
  assert.strictEqual(flipkart.configured, false);
  assert.strictEqual(flipkart.liveTested, false);
  assert.strictEqual(flipkart.automatedAccess, "official_affiliate_api_access_requires_affiliate_account");
});

test("retailers without a verified authorized product feed remain unavailable", () => {
  const unverified = RETAILER_REGISTRY.filter((retailer) =>
    retailer.automatedAccess === "not_verified"
  );

  assert.ok(unverified.length >= 5);
  assert.ok(unverified.every((retailer) =>
    !retailer.implemented && retailer.documentationUrl === null
  ));
});

test("every retailer record states access, matching, limits, and verification state", () => {
  assert.ok(RETAILER_REGISTRY.every((retailer) =>
    retailer.name &&
    retailer.categories.length &&
    retailer.accessMethod &&
    typeof retailer.automatedAccess === "string" &&
    Array.isArray(retailer.credentialsRequired) &&
    typeof retailer.productMatching === "string" &&
    typeof retailer.rateLimits === "string" &&
    typeof retailer.implemented === "boolean" &&
    typeof retailer.configured === "boolean" &&
    typeof retailer.liveTested === "boolean" &&
    typeof retailer.limitations === "string"
  ));
});
