import { extractProductAttributes } from "./match.js";

export const MIN_VERDICT_POINTS = 3;
export const MIN_VERDICT_DAYS = 7;
export const MAX_CURRENT_PRICE_AGE_MS = 24 * 60 * 60 * 1000;

export function calculateVerdict(history, currentPrice, options = {}) {
  const points = historyForChart(history);
  const first = points[0];
  const last = points[points.length - 1];
  const days = first && last
    ? Math.max(0, Math.floor((Date.parse(last.observedAt) - Date.parse(first.observedAt)) / 86400000))
    : 0;
  const currentTimestamp = Date.parse(options.currentObservedAt);
  const currentAge = Number.isFinite(currentTimestamp) ? Date.now() - currentTimestamp : Infinity;
  let reason = null;

  if (!Number.isFinite(currentPrice) || currentPrice <= 0 || !Number.isFinite(currentTimestamp)) {
    reason = "A current verified retailer price is required.";
  } else if (currentAge < 0 || currentAge > MAX_CURRENT_PRICE_AGE_MS) {
    reason = "The latest verified retailer price is stale.";
  } else if (points.length < MIN_VERDICT_POINTS) {
    reason = `Need at least ${MIN_VERDICT_POINTS} distinct daily observations; found ${points.length}.`;
  } else if (days < MIN_VERDICT_DAYS) {
    reason = `Observations must cover at least ${MIN_VERDICT_DAYS} days; current coverage is ${days} days.`;
  }

  if (reason) {
    return {
      verdict: "insufficient",
      label: "Not enough data",
      reason,
      days,
      observationCount: points.length,
      currentFresh: currentAge >= 0 && currentAge <= MAX_CURRENT_PRICE_AGE_MS
    };
  }

  const lowest = Math.min(...points.map((point) => Number(point.price)));
  const highest = Math.max(...points.map((point) => Number(point.price)));
  const average = points.reduce((sum, point) => sum + Number(point.price), 0) / points.length;
  const change = last.price - first.price;
  const trend = Math.abs(change) <= first.price * 0.01 ? "stable" : change < 0 ? "falling" : "rising";
  const verdict = currentPrice <= lowest * 1.03 || currentPrice <= average * 0.97 ? "buy" : "wait";
  return {
    verdict,
    label: verdict === "buy" ? "Buy" : "Wait",
    reason: verdict === "buy"
      ? `The current verified price is near the recorded low or below the historical average. The recent trend is ${trend}.`
      : `The current verified price is above both the recorded-low threshold and historical average. The recent trend is ${trend}.`,
    days,
    observationCount: points.length,
    lowest,
    highest,
    average: Math.round(average),
    trend
  };
}

export function historyForChart(history) {
  const points = (Array.isArray(history) ? history : [])
    .filter((point) =>
      Number.isFinite(Number(point.price)) &&
      Number(point.price) > 0 &&
      point.observedAt &&
      Number.isFinite(Date.parse(point.observedAt)) &&
      Date.parse(point.observedAt) <= Date.now()
    )
    .map((point) => ({ price: Number(point.price), observedAt: point.observedAt }))
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const dailyLow = new Map();
  for (const point of points) {
    const day = new Date(point.observedAt).toISOString().slice(0, 10);
    const existing = dailyLow.get(day);
    if (!existing || point.price < existing.price) dailyLow.set(day, point);
  }
  return [...dailyLow.values()];
}

export function productHistoryKey(name) {
  const text = String(name).trim();
  const attributes = extractProductAttributes(text);
  if (attributes.modelIdentifiers.length) {
    return [
      attributes.modelIdentifiers.slice().sort().join("-"),
      attributes.productType,
      attributes.tier,
      attributes.storage && `${attributes.storage}gb`,
      attributes.ram && `${attributes.ram}gb-ram`,
      attributes.chip
    ].filter(Boolean).join("-").slice(0, 100);
  }
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
}
