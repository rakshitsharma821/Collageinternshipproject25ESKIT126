// Product matching, title similarity, variant checking, and price ranking logic for GadgetVerse

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

  cleaned = cleaned.replace(/,/g, "");
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

const KNOWN_BRANDS = ["apple", "samsung", "asus", "acer", "sony", "lg", "google", "oneplus", "xiaomi", "lenovo", "dell", "hp", "lorenz"];

const ACCESSORY_WORDS = [
  "case", "cover", "protector", "tempered glass", "screen guard",
  "cable", "charger", "adapter", "sleeve", "pouch", "skin", "holder",
  "stand", "back case", "back cover", "replacement strap", "watch strap",
  "strap for", "band for"
];
const GENERIC_TITLE_WORDS = new Set([
  "a", "an", "and", "for", "in", "of", "the", "with", "by", "new", "latest"
]);

const PRODUCT_TYPES = [
  ["smartwatch", /\b(?:smart\s*watch|smartwatch)\b/i],
  ["watch", /\bwatch(?:es)?\b/i],
  ["phone", /\b(?:phone|smartphone|iphone|galaxy)\b/i],
  ["laptop", /\b(?:laptop|notebook|macbook)\b/i],
  ["tablet", /\b(?:tablet|ipad)\b/i],
  ["earbuds", /\b(?:earbuds?|earphones?|headphones?)\b/i],
  ["television", /\b(?:television|tv)\b/i]
];

export function extractModelIdentifiers(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  const identifiers = new Set();
  const patterns = [
    /\b([a-z]{1,8})\s*-\s*(\d{2,}[a-z0-9]*)\b/gi,
    /\b([a-z]{2,})\s+(\d{1,4}[a-z0-9]*)\b/gi,
    /\b([a-z])(\d{2,}[a-z0-9]*)\b/gi,
    /\b([a-z]{2,}\d{2,}[a-z0-9]*)\b/gi
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const identifier = `${match[1]}${match[2] || ""}`.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (identifier && !/^(?:\d+)?(?:gb|tb|ram|memory)$/.test(identifier)) {
        identifiers.add(identifier);
      }
    }
  }
  return [...identifiers];
}

/**
 * Extracts key specifications, model tier, and variant info from product titles or queries.
 */
export function extractProductAttributes(text) {
  if (!text || typeof text !== "string") {
    return {
      raw: "",
      brand: null,
      tier: null,
      storage: null,
      ram: null,
      chip: null,
      isAccessory: false,
      modelIdentifiers: [],
      productType: null,
      distinguishingTerms: []
    };
  }

  const normalized = normalizeTitle(text);

  // 1. Detect Brand
  let brand = null;
  for (const b of KNOWN_BRANDS) {
    if (new RegExp(`\\b${b}\\b`, "i").test(normalized)) {
      brand = b;
      break;
    }

  }
  const modelIdentifiers = extractModelIdentifiers(text);
  const productType = PRODUCT_TYPES.find(([, pattern]) => pattern.test(text))?.[0] || null;
  const distinguishingTerms = normalized.split(" ").filter((token) =>
    token.length > 2 && !GENERIC_TITLE_WORDS.has(token) &&
    !/\d/.test(token) && !/^(?:gb|tb|ram)$/.test(token)
  );

  // 2. Detect Model Tier (longest match first)
  let tier = null;
  const tiers = [
    "pro max", "pro", "plus", "ultra", "mini", "air",
    "se", "fe", "lite", "max"
  ];
  for (const t of tiers) {
    if (new RegExp(`\\b${t}\\b`, "i").test(normalized)) {
      tier = t;
      break;
    }
  }

  // 3. Detect Storage (normalized to GB integer)
  let storage = null;
  const tbMatch = normalized.match(/\b([1-2])\s*(?:tb|t)\b/);
  if (tbMatch) {
    storage = parseInt(tbMatch[1], 10) * 1024;
  } else {
    const gbMatch = normalized.match(/\b(32|64|128|256|512|1024|2048)\s*(?:gb|g)\b/);
    if (gbMatch) {
      storage = parseInt(gbMatch[1], 10);
    }
  }

  // 4. Detect Processor / Chip
  let chip = null;
  const chipMatch = normalized.match(/\b(m[1-4]\s*(?:pro|max)?|i[3579]|ryzen\s*[3579]|snapdragon\s*\d+)\b/);
  if (chipMatch) {
    chip = chipMatch[1].replace(/\s+/g, " ").trim();
  }

  // 5. Detect RAM
  let ram = null;
  const ramMatch = normalized.match(/\b(8|16|18|24|32|36|48|64)\s*(?:gb|g)?\s*(?:ram|memory|unified)\b/);
  if (ramMatch) {
    ram = parseInt(ramMatch[1], 10);
  }

  // 6. Detect Accessory
  let isAccessory = false;
  for (const word of ACCESSORY_WORDS) {
    if (new RegExp(`\\b${word}\\b`, "i").test(normalized)) {
      isAccessory = true;
      break;
    }
  }

  return {
    raw: text,
    brand,
    tier,
    storage,
    ram,
    chip,
    isAccessory,
    modelIdentifiers,
    productType,
    distinguishingTerms
  };
}

/**
 * Validates if an offer is comparable to the user query.
 * Rejects accessories when searching for devices and catches model/tier/storage mismatches.
 */
export function checkOfferComparability(queryText, offerTitle) {
  const qAttrs = extractProductAttributes(queryText);
  const oAttrs = extractProductAttributes(offerTitle);

  // 1. Accessory protection
  if (oAttrs.isAccessory && !qAttrs.isAccessory) {
    return {
      comparable: false,
      reason: "Offer is an accessory or protector rather than the device itself",
      queryAttributes: qAttrs,
      offerAttributes: oAttrs
    };
  }

  if (qAttrs.brand && oAttrs.brand !== qAttrs.brand) {
    return {
      comparable: false,
      reason: `Brand mismatch: expected '${qAttrs.brand}', found '${oAttrs.brand || "not identified"}'`,
      queryAttributes: qAttrs,
      offerAttributes: oAttrs
    };
  }

  if (qAttrs.modelIdentifiers.length && !qAttrs.modelIdentifiers.some((model) => oAttrs.modelIdentifiers.includes(model))) {
    return {
      comparable: false,
      reason: `Model mismatch: expected ${qAttrs.modelIdentifiers.join(" or ")}, found ${oAttrs.modelIdentifiers.join(", ") || "no model identifier"}`,
      queryAttributes: qAttrs,
      offerAttributes: oAttrs
    };
  }

  const offerTerms = new Set(normalizeTitle(offerTitle).split(" ").filter(Boolean));
  const missingTerms = qAttrs.distinguishingTerms.filter((term) => !offerTerms.has(term));
  if (missingTerms.length) {
    return {
      comparable: false,
      reason: `Product title is missing distinguishing terms: ${missingTerms.join(", ")}`,
      queryAttributes: qAttrs,
      offerAttributes: oAttrs
    };
  }

  if (qAttrs.productType && oAttrs.productType !== qAttrs.productType) {
    return {
      comparable: false,
      reason: `Product type mismatch: expected '${qAttrs.productType}', found '${oAttrs.productType || "not identified"}'`,
      queryAttributes: qAttrs,
      offerAttributes: oAttrs
    };
  }

  // 2. Model Tier match
  if (qAttrs.tier && oAttrs.tier !== qAttrs.tier) {
    return {
      comparable: false,
      reason: `Model tier mismatch: expected '${qAttrs.tier}', found '${oAttrs.tier || "base"}'`,
      queryAttributes: qAttrs,
      offerAttributes: oAttrs
    };
  }

  // If query did not specify a higher tier (e.g. searched base "iPhone 16"), do not treat "Pro" or "Pro Max" as identical
  if (!qAttrs.tier && oAttrs.tier && ["pro", "pro max", "ultra"].includes(oAttrs.tier)) {
    return {
      comparable: false,
      reason: `Variant mismatch: offer is '${oAttrs.tier}', which does not match base query`,
      queryAttributes: qAttrs,
      offerAttributes: oAttrs
    };
  }

  // 3. Storage match
  if (qAttrs.storage && qAttrs.storage !== oAttrs.storage) {
    return {
      comparable: false,
      reason: `Storage mismatch: expected ${qAttrs.storage}GB, found ${oAttrs.storage}GB`,
      queryAttributes: qAttrs,
      offerAttributes: oAttrs
    };
  }

  // 4. Chip generation match
  if (qAttrs.chip && qAttrs.chip !== oAttrs.chip) {
    return {
      comparable: false,
      reason: `Processor mismatch: expected '${qAttrs.chip}', found '${oAttrs.chip}'`,
      queryAttributes: qAttrs,
      offerAttributes: oAttrs
    };
  }

  // 5. Brand match if query specified brand
  return {
    comparable: true,
    queryAttributes: qAttrs,
    offerAttributes: oAttrs
  };
}

/**
 * Finds the cheapest valid, comparable offer from a list of results.
 */
export function findCheapestOffer(results) {
  if (!Array.isArray(results) || !results.length) return null;
  const valid = results.filter(
    (r) => r && typeof r.price === "number" && r.price > 0 && !r.error && r.comparable !== false
  );
  if (!valid.length) return null;
  return valid.reduce((min, curr) => (curr.price < min.price ? curr : min), valid[0]);
}

/**
 * Ranks results and evaluates comparability against user search query.
 */
export function rankResults(results, query = "") {
  if (!Array.isArray(results) || !results.length) return [];

  // Evaluate comparability if query is provided
  const processed = results.map((item) => {
    if (!item) return item;
    if (query && item.title) {
      const compCheck = checkOfferComparability(query, item.title);
      return {
        ...item,
        comparable: compCheck.comparable,
        comparabilityReason: compCheck.reason || null
      };
    }
    return { ...item, comparable: item.comparable !== false };
  });

  // Separate valid comparable offers from non-comparable and errored offers
  const validComparable = processed.filter(
    (r) => r && typeof r.price === "number" && r.price > 0 && !r.error && r.comparable !== false
  );
  const others = processed.filter(
    (r) => !r || r.error || typeof r.price !== "number" || r.price <= 0 || r.comparable === false
  );

  // Sort valid by price ascending (cheapest first)
  validComparable.sort((a, b) => a.price - b.price);

  if (validComparable.length > 0) {
    validComparable[0].best = true;

    // Calculate real savings compared to the next lowest comparable price
    if (validComparable.length > 1 && validComparable[1].price > validComparable[0].price) {
      validComparable[0].youSave = validComparable[1].price - validComparable[0].price;
    } else {
      validComparable[0].youSave = 0;
    }

    for (let i = 1; i < validComparable.length; i++) {
      validComparable[i].best = false;
      validComparable[i].youSave = 0;
    }
  }

  for (const o of others) {
    if (o) {
      o.best = false;
      o.youSave = 0;
    }
  }

  return [...validComparable, ...others];
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
    extractProductAttributes,
    checkOfferComparability,
    findCheapestOffer,
    rankResults,
    formatPriceINR
  };
}
