/**
 * GadgetVerse — Smart Wishlist, Budget Optimizer & Price Drop Alerts (Phases 12 & 13)
 * Provides deterministic budget calculations, savings analysis, and alert evaluation.
 */

import { formatPriceINR } from "./match.js";

/**
 * Phase 12: Optimizes budget across wishlisted products with verified prices.
 */
export function calculateBudgetSummary(items = []) {
  let totalTargetBudget = 0;
  let totalCurrentBestPrice = 0;
  let pricedItemCount = 0;
  const missingPrices = [];
  const optimizedItems = [];

  for (const item of items) {
    const targetPrice =
      typeof item.target_price === "number" && item.target_price > 0
        ? item.target_price
        : null;

    const currentPrice =
      typeof item.current_price === "number" && item.current_price > 0
        ? item.current_price
        : typeof item.price === "number" && item.price > 0
        ? item.price
        : null;

    if (targetPrice) {
      totalTargetBudget += targetPrice;
    }

    if (currentPrice) {
      totalCurrentBestPrice += currentPrice;
      pricedItemCount++;
    } else {
      missingPrices.push({
        id: item.id || item.product_id,
        name: item.name || "Unknown Product",
        reason: "No current price observation verified across stores."
      });
    }

    const itemSavings =
      targetPrice && currentPrice && currentPrice < targetPrice
        ? targetPrice - currentPrice
        : 0;

    optimizedItems.push({
      id: item.id || item.product_id,
      name: item.name,
      targetPrice,
      currentPrice,
      formattedCurrentPrice: currentPrice ? formatPriceINR(currentPrice) : "Price unavailable",
      formattedTargetPrice: targetPrice ? formatPriceINR(targetPrice) : "No target set",
      potentialSavings: itemSavings,
      formattedSavings: itemSavings > 0 ? formatPriceINR(itemSavings) : null,
      status: currentPrice ? (targetPrice && currentPrice <= targetPrice ? "target_met" : "tracked") : "unverified"
    });
  }

  const netSavings =
    totalTargetBudget > totalCurrentBestPrice && pricedItemCount > 0
      ? totalTargetBudget - totalCurrentBestPrice
      : 0;

  return {
    totalItems: items.length,
    pricedItems: pricedItemCount,
    unpricedItems: missingPrices.length,
    totalTargetBudget,
    formattedTargetBudget: totalTargetBudget > 0 ? formatPriceINR(totalTargetBudget) : "₹0",
    totalCurrentCost: totalCurrentBestPrice,
    formattedCurrentCost: totalCurrentBestPrice > 0 ? formatPriceINR(totalCurrentBestPrice) : "₹0",
    totalPotentialSavings: netSavings,
    formattedPotentialSavings: netSavings > 0 ? formatPriceINR(netSavings) : "₹0",
    missingPrices,
    items: optimizedItems
  };
}

/**
 * Phase 13: Evaluates target prices and generates deduplicated price drop alerts.
 */
export function evaluatePriceDropAlerts(trackedProducts = [], latestObservations = new Map(), acknowledgedAlerts = new Set()) {
  const triggered = [];

  for (const item of trackedProducts) {
    if (!item.alert_enabled) continue;

    const prodId = item.product_id || item.id;
    const target = typeof item.target_price === "number" ? item.target_price : null;
    if (!target) continue;

    // Look up latest verified observation
    const obs = latestObservations.get(prodId) || (typeof item.current_price === "number" ? { price: item.current_price, store: "tracked" } : null);
    if (!obs || typeof obs.price !== "number" || obs.price <= 0) continue;

    if (obs.price <= target) {
      const alertKey = `${item.id || item.user_id || "guest"}:${prodId}:${obs.observedAt || obs.price}`;

      // Deduplicate if already triggered / acknowledged for this exact price point
      if (acknowledgedAlerts.has(alertKey)) continue;

      const diff = target - obs.price;
      triggered.push({
        alertKey,
        alertId: item.id || null,
        productId: prodId,
        productName: item.name || prodId,
        targetPrice: target,
        observedPrice: obs.price,
        formattedTarget: formatPriceINR(target),
        formattedObserved: formatPriceINR(obs.price),
        savings: diff,
        formattedSavings: formatPriceINR(diff),
        store: obs.store || "Verified Store",
        url: obs.url || null,
        observedAt: obs.observedAt || new Date().toISOString(),
        message: `${item.name || prodId} dropped to ${formatPriceINR(obs.price)} (Target: ${formatPriceINR(target)}). Save ${formatPriceINR(diff)}!`
      });
    }
  }

  return triggered;
}
