// Product matching, title similarity, and price ranking logic for GadgetVerse Price Finder

function normalizeTitle(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function calculateSimilarity(query, target) {
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

function rankResults(results) {
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

function formatPriceINR(num) {
  if (typeof num !== "number" || isNaN(num)) return "";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(num);
}

// Universal export
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    normalizeTitle,
    calculateSimilarity,
    rankResults,
    formatPriceINR
  };
} else if (typeof window !== "undefined") {
  window.GadgetMatch = {
    normalizeTitle,
    calculateSimilarity,
    rankResults,
    formatPriceINR
  };
}
