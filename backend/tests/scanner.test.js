import test from "node:test";
import assert from "node:assert";
import { validateRetailerUrl, extractProductFromUrl } from "../lib/scanner.js";

test("validateRetailerUrl allows valid HTTPS URLs from approved retailers", () => {
  const amazon = validateRetailerUrl("https://www.amazon.in/Apple-iPhone-16-128-GB/dp/B0DGJ99PVY");
  assert.strictEqual(amazon.valid, true);

  const flipkart = validateRetailerUrl("https://www.flipkart.com/apple-iphone-16-ultramarine-128-gb/p/itmd0653605c48b7");
  assert.strictEqual(flipkart.valid, true);

  const croma = validateRetailerUrl("https://www.croma.com/apple-iphone-16-128gb-ultramarine/p/309489");
  assert.strictEqual(croma.valid, true);

  const reliance = validateRetailerUrl("https://www.reliancedigital.in/apple-iphone-16-128-gb/p/494422891");
  assert.strictEqual(reliance.valid, true);

  assert.strictEqual(validateRetailerUrl("https://amzn.in/short").valid, true);
  assert.strictEqual(validateRetailerUrl("https://fkrt.it/short").valid, true);
  assert.strictEqual(validateRetailerUrl("https://www.tatacliq.com/product").valid, false);
});

test("validateRetailerUrl strictly blocks SSRF attacks and non-allowlisted domains", () => {
  assert.strictEqual(validateRetailerUrl("http://amazon.in/test").valid, false); // HTTP rejected
  assert.strictEqual(validateRetailerUrl("https://localhost:8080/steal").valid, false);
  assert.strictEqual(validateRetailerUrl("https://127.0.0.1/admin").valid, false);
  assert.strictEqual(validateRetailerUrl("https://169.254.169.254/latest/meta-data/").valid, false); // AWS metadata
  assert.strictEqual(validateRetailerUrl("https://192.168.1.1/router").valid, false);
  assert.strictEqual(validateRetailerUrl("https://malicious-site.com/product").valid, false);
  assert.strictEqual(validateRetailerUrl("https://admin:pass@amazon.in/product").valid, false); // credentials in URL
});

test("extractProductFromUrl does not guess product names from URL slugs", () => {
  const amz = validateRetailerUrl("https://www.amazon.in/Apple-iPhone-16-128-GB/dp/B0DGJ99PVY");
  const amzExt = extractProductFromUrl(amz);
  assert.strictEqual(amzExt.store, "amazon");
  assert.strictEqual(amzExt.identifiedTitle, null);

  const fk = validateRetailerUrl("https://www.flipkart.com/apple-iphone-16-ultramarine-128-gb/p/itmd0653605c48b7");
  const fkExt = extractProductFromUrl(fk);
  assert.strictEqual(fkExt.store, "flipkart");
  assert.strictEqual(fkExt.identifiedTitle, null);
});
