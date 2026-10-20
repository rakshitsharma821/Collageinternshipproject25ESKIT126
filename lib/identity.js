/**
 * GadgetVerse — Product Identity & Specification Normalization Engine (Phase 3)
 * Normalizes product attributes (brand, model, tier, RAM, storage, colour, condition, accessories)
 * and verifies strict variant equivalence to prevent invalid cross-variant price comparisons.
 */

export const KNOWN_BRANDS = [
  "Apple", "Samsung", "Google", "Sony", "OnePlus", "Xiaomi", "Nothing",
  "Dell", "Lenovo", "HP", "Asus", "Acer", "LG", "Realme", "Motorola",
  "Bose", "Sennheiser", "Boat", "Noise", "JBL", "TCL"
];

export const ACCESSORY_KEYWORDS = [
  "case", "cover", "screen protector", "tempered glass", "cable",
  "charger", "adapter", "strap", "band", "sleeve", "skin", "stand",
  "pouch", "dock", "stylus pen", "lens protector"
];

export const REFURBISHED_KEYWORDS = [
  "renewed", "refurbished", "pre-owned", "open-box", "unboxed", "used"
];

/**
 * Normalizes a product title and optional specs into structured attributes.
 */
export function normalizeProduct(rawTitle = "", extraSpecs = {}) {
  const title = String(rawTitle).trim();
  const lower = title.toLowerCase();

  // 1. Brand detection
  let brand = extraSpecs.brand || null;
  if (!brand) {
    for (const b of KNOWN_BRANDS) {
      const reg = new RegExp(`\\b${b}\\b`, "i");
      if (reg.test(title)) {
        brand = b;
        break;
      }
    }
  }

  // 2. Condition detection (new vs refurbished)
  let condition = "new";
  if (REFURBISHED_KEYWORDS.some((kw) => lower.includes(kw))) {
    condition = "refurbished";
  }

  // 3. Accessory detection
  const isAccessory = ACCESSORY_KEYWORDS.some((kw) => {
    const reg = new RegExp(`\\b${kw}\\b`, "i");
    return reg.test(lower);
  });

  // 4. Model tier detection (Pro, Pro Max, Plus, Ultra, Mini, FE, Air)
  let tier = "base";
  if (/\bpro\s*max\b/i.test(lower)) tier = "pro max";
  else if (/\bpro\b/i.test(lower)) tier = "pro";
  else if (/\bultra\b/i.test(lower)) tier = "ultra";
  else if (/\bplus\b/i.test(lower)) tier = "plus";
  else if (/\bmini\b/i.test(lower)) tier = "mini";
  else if (/\bfe\b/i.test(lower)) tier = "fe";
  else if (/\bair\b/i.test(lower)) tier = "air";

  // 5. Storage extraction (e.g. 64GB, 128GB, 256GB, 512GB, 1TB, 2TB)
  let storage = extraSpecs.storage || null;
  if (!storage) {
    const storageMatch = lower.match(/\b(32|64|128|256|512)\s*(?:gb|gigabytes)\b/i);
    if (storageMatch) {
      storage = `${storageMatch[1]}GB`;
    } else {
      const tbMatch = lower.match(/\b(1|2)\s*(?:tb|terabytes)\b/i);
      if (tbMatch) {
        storage = `${tbMatch[1]}TB`;
      }
    }
  }

  // 6. RAM extraction (e.g. 4GB, 8GB, 12GB, 16GB, 24GB, 32GB RAM)
  let ram = extraSpecs.ram || null;
  if (!ram) {
    const ramMatch = lower.match(/\b(4|6|8|12|16|18|24|32|36|64)\s*(?:gb)?\s*(?:ram|memory)\b/i);
    if (ramMatch) {
      ram = `${ramMatch[1]}GB`;
    }
  }

  // 7. Generation extraction (e.g. Gen 2, 5th Gen, M2, M3, M4)
  let generation = extraSpecs.generation || null;
  if (!generation) {
    const genMatch = lower.match(/\b([1-9]|1[0-2])(?:th|rd|st|nd)?\s*gen(?:eration)?\b/i);
    if (genMatch) {
      generation = `Gen ${genMatch[1]}`;
    } else {
      const chipMatch = lower.match(/\b(m[1-4](?:\s*(?:pro|max))?)\b/i);
      if (chipMatch) {
        generation = chipMatch[1].toUpperCase();
      }
    }
  }

  // 8. Colour extraction
  const COLOURS = [
    "black", "white", "silver", "space grey", "space gray", "starlight", "midnight",
    "blue", "ultramarine", "teal", "pink", "green", "natural titanium", "desert titanium",
    "black titanium", "white titanium", "red", "gold", "yellow", "purple"
  ];
  let colour = null;
  for (const c of COLOURS) {
    const reg = new RegExp(`\\b${c}\\b`, "i");
    if (reg.test(lower)) {
      colour = c.charAt(0).toUpperCase() + c.slice(1);
      break;
    }
  }

  return {
    rawTitle: title,
    brand,
    tier,
    storage,
    ram,
    generation,
    colour,
    condition,
    isAccessory
  };
}

/**
 * Checks whether two products or variants are strictly comparable.
 * Returns false if:
 * - One is an accessory and the other is a main product
 * - Condition differs (new vs refurbished)
 * - Tiers differ (e.g. base vs Pro)
 * - Storage differs (e.g. 128GB vs 256GB)
 * - Generation differs (e.g. M2 vs M3)
 */
export function areVariantsEquivalent(itemA, itemB) {
  const a = typeof itemA === "string" ? normalizeProduct(itemA) : itemA;
  const b = typeof itemB === "string" ? normalizeProduct(itemB) : itemB;

  // Accessories must never match standalone devices
  if (a.isAccessory !== b.isAccessory) return false;

  // Condition check: Never treat refurbished as new
  if (a.condition !== b.condition) return false;

  // Tier check: Pro != Base != Ultra
  if (a.tier && b.tier && a.tier !== b.tier) return false;

  // Storage check: 128GB != 256GB
  if (a.storage && b.storage && a.storage !== b.storage) return false;

  // RAM check (when both specify): 8GB != 16GB
  if (a.ram && b.ram && a.ram !== b.ram) return false;

  // Generation check (when both specify): Gen 1 != Gen 2
  if (a.generation && b.generation && a.generation !== b.generation) return false;

  return true;
}

/**
 * Classifies the relationship between a user search query and an offer title.
 * Returns { matchType: "exact" | "alternative" | "accessory" | "mismatch", confidence, reason }
 */
export function classifyMatch(query, offerTitle) {
  const normQuery = normalizeProduct(query);
  const normOffer = normalizeProduct(offerTitle);

  // 1. Accessory check
  if (!normQuery.isAccessory && normOffer.isAccessory) {
    return {
      matchType: "accessory",
      confidence: 0,
      reason: "Offer is an accessory (case, cable, protector) rather than the queried device."
    };
  }

  // 2. Condition mismatch
  if (normQuery.condition === "new" && normOffer.condition === "refurbished") {
    return {
      matchType: "alternative",
      confidence: 0.6,
      reason: "Offer is a refurbished/renewed model, not new."
    };
  }

  // 3. Tier mismatch
  if (normQuery.tier !== "base" && normOffer.tier !== normQuery.tier) {
    return {
      matchType: "mismatch",
      confidence: 0.3,
      reason: `Query requested ${normQuery.tier} tier, but offer is ${normOffer.tier}.`
    };
  }

  // 4. Storage mismatch
  if (normQuery.storage && normOffer.storage && normQuery.storage !== normOffer.storage) {
    return {
      matchType: "alternative",
      confidence: 0.7,
      reason: `Query specified ${normQuery.storage}, but offer is ${normOffer.storage}.`
    };
  }

  // 5. Equivalent match
  if (areVariantsEquivalent(normQuery, normOffer)) {
    return {
      matchType: "exact",
      confidence: 0.95,
      reason: "Product attributes and variant specifications match closely."
    };
  }

  return {
    matchType: "alternative",
    confidence: 0.5,
    reason: "Possible related model with differing or unspecified attributes."
  };
}
