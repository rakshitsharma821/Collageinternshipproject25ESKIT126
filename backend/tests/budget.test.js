import test from "node:test";
import assert from "node:assert";
import { calculateBudgetSummary, evaluatePriceDropAlerts } from "../lib/budget.js";

test("calculateBudgetSummary calculates totals and potential savings", () => {
  const items = [
    { id: "1", name: "iPhone 16", target_price: 80000, current_price: 76999 },
    { id: "2", name: "AirPods Pro", target_price: 20000, current_price: 22000 },
    { id: "3", name: "Mystery Watch", target_price: 5000, current_price: null }
  ];

  const summary = calculateBudgetSummary(items);
  assert.strictEqual(summary.totalItems, 3);
  assert.strictEqual(summary.pricedItems, 2);
  assert.strictEqual(summary.unpricedItems, 1);
  assert.strictEqual(summary.totalTargetBudget, 105000);
  assert.strictEqual(summary.totalCurrentCost, 98999);
  assert.strictEqual(summary.totalPotentialSavings, 6001);
  assert.strictEqual(summary.missingPrices.length, 1);
});

test("evaluatePriceDropAlerts triggers and deduplicates target price hits", () => {
  const tracked = [
    { user_id: "u1", product_id: "phone-1", name: "Phone 1", target_price: 50000, alert_enabled: true }
  ];

  const obs = new Map([
    ["phone-1", { price: 48000, store: "amazon", url: "https://amazon.in/dp/..." }]
  ]);

  const alerts = evaluatePriceDropAlerts(tracked, obs, new Set());
  assert.strictEqual(alerts.length, 1);
  assert.strictEqual(alerts[0].observedPrice, 48000);
  assert.strictEqual(alerts[0].savings, 2000);

  // If alert key is already acknowledged, evaluatePriceDropAlerts should deduplicate
  const acknowledged = new Set([alerts[0].alertKey]);
  const deduplicated = evaluatePriceDropAlerts(tracked, obs, acknowledged);
  assert.strictEqual(deduplicated.length, 0);
});
