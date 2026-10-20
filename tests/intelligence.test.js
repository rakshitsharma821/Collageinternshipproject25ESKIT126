import test from "node:test";
import assert from "node:assert";
import {
  calculateFinalPayablePrice,
  calculateDealScore,
  getBuyNowOrWaitGuidance,
  checkOfferReality,
  normalizeSellerTrust,
  rankPersonalizedOffers
} from "../lib/intelligence.js";

test("calculateFinalPayablePrice applies verified shipping and coupons", () => {
  const offer = {
    price: 75000,
    shipping: { cost: 150, verified: true },
    coupon: { discount: 2000, verified: true }
  };
  const res = calculateFinalPayablePrice(offer);
  assert.strictEqual(res.finalPayablePrice, 73150);
  assert.strictEqual(res.hasAdjustments, true);
});

test("calculateDealScore returns Insufficient Data when no history or competitors exist", () => {
  const res = calculateDealScore(75000, {
    historicalPrices: [75000],
    competitorPrices: []
  });
  assert.strictEqual(res.score, null);
  assert.strictEqual(res.label, "Insufficient data");
});

test("calculateDealScore awards high score when price is near historical low", () => {
  const res = calculateDealScore(72000, {
    historicalPrices: [71000, 78000, 79000, 82000],
    competitorPrices: [78000, 79500],
    observedAt: new Date().toISOString()
  });
  assert.ok(res.score >= 80, `Expected score >= 80, got ${res.score}`);
  assert.strictEqual(res.label, "Great Deal");
  assert.ok(res.factors.some((f) => f.name.includes("Low")));
});

test("getBuyNowOrWaitGuidance provides trend advice based on recorded prices", () => {
  const history = [70000, 75000, 80000];

  const good = getBuyNowOrWaitGuidance(71000, history);
  assert.strictEqual(good.recommendation, "Good price relative to available history");

  const wait = getBuyNowOrWaitGuidance(79500, history);
  assert.strictEqual(wait.recommendation, "Price is above its historical range");

  const insufficient = getBuyNowOrWaitGuidance(75000, [75000]);
  assert.strictEqual(insufficient.recommendation, "Not enough data to advise");
});

test("checkOfferReality detects inflated MRP claims", () => {
  const history = [75000, 76000, 75500];
  // Retailer claims MRP is 1,20,000 to show huge discount, but selling at 76,000
  const inflated = checkOfferReality(76000, 120000, history);
  assert.strictEqual(inflated.assessment, "inflated_mrp");

  // Real discount matching historical low
  const genuine = checkOfferReality(75000, 79900, history);
  assert.strictEqual(genuine.assessment, "verified_deal");
});

test("normalizeSellerTrust handles unverified attributes safely", () => {
  const trust = normalizeSellerTrust({});
  assert.strictEqual(trust.sellerName, "Retailer Direct");
  assert.strictEqual(trust.trustStatus, "unverified");
  assert.strictEqual(trust.returnPolicy, "Not verified");
  assert.strictEqual(trust.warranty, "Not verified");
});

test("rankPersonalizedOffers calculates deterministic weighted scores", () => {
  const products = [
    { id: "p1", name: "Budget King", price: 20000, specs: { performanceScore: 60, batteryScore: 90 } },
    { id: "p2", name: "Pro Flagship", price: 60000, specs: { performanceScore: 95, batteryScore: 70 } }
  ];

  // User prioritizes price 70%, battery 30%
  const rankedByPrice = rankPersonalizedOffers(products, { price: 0.7, battery: 0.3, performance: 0 });
  assert.strictEqual(rankedByPrice[0].id, "p1");

  // User prioritizes performance 80%
  const rankedByPerf = rankPersonalizedOffers(products, { price: 0.1, performance: 0.8, battery: 0.1 });
  assert.strictEqual(rankedByPerf[0].id, "p2");
});
