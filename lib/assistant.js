/**
 * GadgetVerse — AI Shopping Assistant Engine (Phase 10)
 * Parses natural-language user shopping queries into structured criteria
 * (budget, category, preferred brands, priority features) and matches actual products
 * with transparent explanations and trade-off analysis.
 */

import { formatPriceINR } from "./match.js";

export const CATEGORY_SYNONYMS = {
  phone: ["phone", "smartphone", "mobile", "android", "iphone", "cellular"],
  laptop: ["laptop", "notebook", "macbook", "pc", "computer", "ultrabook"],
  watch: ["watch", "smartwatch", "fitness tracker", "band"],
  earbuds: ["earbuds", "earphones", "headphones", "tws", "airpods"],
  tv: ["tv", "television", "smart tv", "oled", "qled", "monitor"]
};

export const FEATURE_KEYWORDS = {
  battery: ["battery", "battery life", "backup", "endurance", "mah"],
  camera: ["camera", "photo", "video", "portrait", "zoom", "megapixels", "mp"],
  gaming: ["gaming", "fps", "graphics", "gpu", "rtx", "refresh rate", "120hz", "144hz"],
  performance: ["performance", "fast", "speed", "processor", "ram", "multitasking"],
  lightweight: ["lightweight", "light", "portable", "compact", "thin", "travel"],
  display: ["display", "screen", "amoled", "oled", "retina", "bright"],
  anc: ["anc", "noise cancelling", "noise cancellation", "sound quality", "bass"]
};

/**
 * Extracts structured criteria from natural-language shopping requests.
 */
export function parseShoppingIntent(inputQuery = "") {
  const text = String(inputQuery).toLowerCase();

  // 1. Budget extraction
  let budgetMax = null;
  // Matches "under 25000", "below 30k", "under ₹50,000", "less than 40000"
  const budgetMatch = text.match(/(?:under|below|less\s+than|budget(?:\s+of)?|max|up\s+to|around)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|thousand|lakh|lac)?\b/i);
  if (budgetMatch) {
    let rawNum = parseFloat(budgetMatch[1].replace(/,/g, ""));
    const unit = (budgetMatch[2] || "").toLowerCase();
    if (unit === "k" || unit === "thousand") {
      rawNum *= 1000;
    } else if (unit === "lakh" || unit === "lac") {
      rawNum *= 100000;
    }
    budgetMax = Math.round(rawNum);
  } else {
    // Check for "25k phone" or "30000 budget"
    const kMatch = text.match(/\b(\d+)\s*k\b/i);
    if (kMatch) {
      budgetMax = parseInt(kMatch[1], 10) * 1000;
    }
  }

  // 2. Category detection
  let category = null;
  for (const [cat, words] of Object.entries(CATEGORY_SYNONYMS)) {
    if (words.some((w) => new RegExp(`\\b${w}\\b`, "i").test(text))) {
      category = cat;
      break;
    }
  }

  // 3. Preferred brands
  const BRANDS = ["Apple", "Samsung", "Google", "Sony", "OnePlus", "Xiaomi", "Nothing", "Dell", "Lenovo", "HP", "Asus", "Boat"];
  const preferredBrands = [];
  for (const b of BRANDS) {
    if (new RegExp(`\\b${b}\\b`, "i").test(text)) {
      preferredBrands.push(b);
    }
  }

  // 4. Feature priorities
  const priorityFeatures = [];
  for (const [feat, terms] of Object.entries(FEATURE_KEYWORDS)) {
    if (terms.some((t) => text.includes(t))) {
      priorityFeatures.push(feat);
    }
  }

  return {
    rawPrompt: inputQuery,
    budgetMax,
    category,
    preferredBrands,
    priorityFeatures
  };
}

/**
 * Evaluates candidate products against the parsed shopping criteria.
 */
export function recommendProducts(candidates = [], criteria = {}) {
  const { budgetMax, category, preferredBrands = [], priorityFeatures = [] } = criteria;

  const scored = [];

  for (const item of candidates) {
    // Category filter: if category specified and item has category, must match
    if (category && item.category && item.category !== category) {
      continue;
    }

    let score = 50;
    const matchReasons = [];
    const drawbacks = [];

    // 1. Budget check
    const price = typeof item.price === "number" ? item.price : null;
    if (budgetMax && price) {
      if (price <= budgetMax) {
        score += 25;
        matchReasons.push(`Fits within budget (${formatPriceINR(price)} vs max ${formatPriceINR(budgetMax)})`);
      } else {
        const overPercent = Math.round(((price - budgetMax) / budgetMax) * 100);
        if (overPercent <= 15) {
          score -= 10;
          drawbacks.push(`Slightly over budget by ${overPercent}% (${formatPriceINR(price)})`);
        } else {
          // Severely over budget
          continue;
        }
      }
    }

    // 2. Brand preference
    if (preferredBrands.length > 0 && item.brand) {
      if (preferredBrands.some((b) => b.toLowerCase() === item.brand.toLowerCase())) {
        score += 20;
        matchReasons.push(`Preferred brand: ${item.brand}`);
      }
    }

    // 3. Feature priorities match
    const reviewText = (item.review || "").toLowerCase();
    const nameText = (item.name || "").toLowerCase();
    const fullText = `${nameText} ${reviewText}`;

    for (const feat of priorityFeatures) {
      const terms = FEATURE_KEYWORDS[feat] || [feat];
      const matched = terms.some((t) => fullText.includes(t));
      if (matched) {
        score += 15;
        matchReasons.push(`Strong for ${feat}`);
      } else {
        drawbacks.push(`No verified standout capability mentioned for ${feat}`);
      }
    }

    // 4. Rating bonus
    if (typeof item.rating === "number" && item.rating >= 4.0) {
      score += Math.round(item.rating * 5);
      matchReasons.push(`High lab rating of ${item.rating}/5.0`);
    }

    scored.push({
      id: item.id,
      name: item.name,
      brand: item.brand,
      category: item.category,
      price: item.price || null,
      formattedPrice: item.price ? formatPriceINR(item.price) : null,
      image_url: item.image_url || null,
      recommendationScore: Math.min(100, score),
      matchReasons: matchReasons.length ? matchReasons : ["Matches basic category requirements"],
      drawbacks: drawbacks.length ? drawbacks : ["No significant drawbacks identified in available data"],
      url: item.url || null
    });
  }

  // Sort by recommendation score descending
  return scored.sort((a, b) => b.recommendationScore - a.recommendationScore);
}
