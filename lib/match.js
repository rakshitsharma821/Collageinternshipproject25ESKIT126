// Product matching, title similarity, and price ranking logic for GadgetVerse Price Finder

export function normalizeTitle(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePrice(val) {
  if (typeof val === "number") {
    return isNaN(val) || val <= 0 ? null : Math.round(val);
  }
  if (!val || typeof val !== "string") return null;

  // Remove common currency symbols and prefixes
  let cleaned = val.replace(/^(rs\.?|inr|₹)\s*/i, "").trim();

  // If there are dots or commas, handle formatting
  // Match the integer and optional decimal part
  // e.g. "1,24,999.00" or "89,990" or "Rs. 1,24,999"
  cleaned = cleaned.replace(/,/g, "");
  // Extract number pattern
  const match = cleaned.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  return isNaN(num) || num <= 0 ? null : Math.round(num);
}

export function calculateSimilarity(query, target) {
  const qTokens = normalizeTitle(query).split(" ").filter(Boolean);
  const tTokens = normalizeTitle(target).split(" ").filter(Boolean);
  if (!qTokens.length || !tTokens.length) return 0;

  const tSet = new Set(tTokens);
  let matches = 0;
  for (const token of qTokens) {
    if (tSet.has(token)) {
      matches++;
    }
  }
  return Number((matches / qTokens.length).toFixed(2));
}

export function findCheapestOffer(results) {
  if (!Array.isArray(results) || !results.length) return null;
  const valid = results.filter((r) => r && typeof r.price === "number" && r.price > 0 && !r.error);
  if (!valid.length) return null;
  return valid.reduce((min, curr) => (curr.price < min.price ? curr : min), valid[0]);
}

export function rankResults(results) {
  if (!Array.isArray(results) || !results.length) return [];

  // Filter out any invalid items
  const valid = results.filter((r) => r && typeof r.price === "number" && r.price > 0 && !r.error);
  const errored = results.filter((r) => r && (r.error || typeof r.price !== "number" || r.price <= 0));

  // Sort valid by price ascending (cheapest first)
  valid.sort((a, b) => a.price - b.price);

  if (valid.length > 0) {
    valid[0].best = true;

    // Calculate real savings compared to the next lowest price or second store
    if (valid.length > 1 && valid[1].price > valid[0].price) {
      valid[0].youSave = valid[1].price - valid[0].price;
    } else {
      valid[0].youSave = 0;
    }

    for (let i = 1; i < valid.length; i++) {
      valid[i].best = false;
      valid[i].youSave = 0;
    }
  }

  return [...valid, ...errored];
}

export function formatPriceINR(num) {
  if (typeof num !== "number" || isNaN(num)) return "";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(num);
}

// Universal browser export
if (typeof window !== "undefined") {
  window.GadgetMatch = {
    normalizeTitle,
    parsePrice,
    calculateSimilarity,
    findCheapestOffer,
    rankResults,
    formatPriceINR
  };
}
