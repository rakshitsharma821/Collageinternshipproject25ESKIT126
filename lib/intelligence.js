/**
 * GadgetVerse — Shopping Intelligence Engine
 * Implements:
 * - Phase 4: True Price Comparison (Final Payable Price)
 * - Phase 6: Deterministic AI Deal Score (0-100)
 * - Phase 7: Buy Now or Wait Guidance
 * - Phase 8: Offer Reality Checker
 * - Phase 9: Seller, Warranty, & Trust Normalization
 * - Phase 11: Personalized Comparison Weighted Ranking
 */

import { formatPriceINR } from "./match.js";

/**
 * Phase 4: Calculates the final payable price taking verified shipping and coupons into account.
 */
export function calculateFinalPayablePrice(offer = {}) {
  const basePrice = typeof offer.price === "number" ? offer.price : null;
  if (basePrice === null) return null;

  // Verified shipping cost (0 if free, or explicit amount)
  const shippingCost =
    offer.shipping && offer.shipping.verified && typeof offer.shipping.cost === "number"
      ? offer.shipping.cost
      : 0;

  // Verified coupon discount (e.g. flat discount in INR)
  const couponDiscount =
    offer.coupon && offer.coupon.verified && typeof offer.coupon.discount === "number"
      ? offer.coupon.discount
      : 0;

  const finalPayable = Math.max(0, basePrice + shippingCost - couponDiscount);

  return {
    basePrice,
    shippingCost,
    couponDiscount,
    finalPayablePrice: finalPayable,
    formattedFinalPayable: formatPriceINR(finalPayable),
    hasAdjustments: shippingCost > 0 || couponDiscount > 0
  };
}

/**
 * Phase 6: AI Deal Score (0-100)
 * Deterministic, transparent evaluation based on historical low, competitor spread, and data freshness.
 */
export function calculateDealScore(currentPrice, options = {}) {
  const {
    historicalPrices = [],
    competitorPrices = [],
    observedAt = null,
    isExactMatch = true
  } = options;

  if (typeof currentPrice !== "number" || currentPrice <= 0) {
    return {
      score: null,
      label: "Insufficient data",
      factors: [{ name: "Current Price", impact: "0", detail: "Valid price required for calculation." }]
    };
  }

  // Filter valid historical prices
  const validHistory = historicalPrices.filter((p) => typeof p === "number" && p > 0);
  const validCompetitors = competitorPrices.filter((p) => typeof p === "number" && p > 0);

  // If no history and no competitors, insufficient data
  if (validHistory.length < 2 && validCompetitors.length === 0) {
    return {
      score: null,
      label: "Insufficient data",
      verdict: "Insufficient historical observations or competitor offers to compute a verified Deal Score.",
      factors: [
        { name: "Historical Baseline", impact: "0", detail: "Fewer than 2 price observations recorded." },
        { name: "Market Spread", impact: "0", detail: "No competitor store offers available for cross-comparison." }
      ]
    };
  }

  let totalScore = 50; // Neutral baseline
  const factors = [];

  // 1. Historical Position (up to 40 pts)
  if (validHistory.length >= 2) {
    const minHist = Math.min(...validHistory);
    const maxHist = Math.max(...validHistory);

    if (maxHist > minHist) {
      const position = (currentPrice - minHist) / (maxHist - minHist);
      if (currentPrice <= minHist * 1.05 || position <= 0.1) {
        totalScore += 35;
        factors.push({
          name: "Historical Low",
          impact: "+35",
          detail: `Price (${formatPriceINR(currentPrice)}) is within 5% of its recorded historical low (${formatPriceINR(minHist)}).`
        });
      } else if (position <= 0.3) {
        totalScore += 20;
        factors.push({
          name: "Below Average",
          impact: "+20",
          detail: `Price is in the lower 30% of its recorded historical range.`
        });
      } else if (position >= 0.8) {
        totalScore -= 25;
        factors.push({
          name: "Near Historical Peak",
          impact: "-25",
          detail: `Price is near the top of its recorded historical range (${formatPriceINR(maxHist)}).`
        });
      } else {
        totalScore += 5;
        factors.push({
          name: "Historical Median",
          impact: "+5",
          detail: `Price is within the typical historical band.`
        });
      }
    } else {
      factors.push({
        name: "Stable History",
        impact: "0",
        detail: `Observed prices have remained steady at ${formatPriceINR(minHist)}.`
      });
    }
  }

  // 2. Competitor Store Comparison (up to 25 pts)
  if (validCompetitors.length > 0) {
    const minComp = Math.min(...validCompetitors);
    if (currentPrice < minComp) {
      const diffPercent = Math.round(((minComp - currentPrice) / minComp) * 100);
      const bonus = Math.min(25, 10 + diffPercent * 2);
      totalScore += bonus;
      factors.push({
        name: "Store Advantage",
        impact: `+${bonus}`,
        detail: `Cheaper than all other active retailers by ${diffPercent}% (saves ${formatPriceINR(minComp - currentPrice)}).`
      });
    } else if (currentPrice === minComp) {
      totalScore += 10;
      factors.push({
        name: "Competitive Match",
        impact: "+10",
        detail: `Tied for the lowest available market price across tracked retailers.`
      });
    } else {
      const diffPercent = Math.round(((currentPrice - minComp) / currentPrice) * 100);
      const penalty = Math.min(25, 5 + diffPercent * 2);
      totalScore -= penalty;
      factors.push({
        name: "Higher Than Competitors",
        impact: `-${penalty}`,
        detail: `Higher than the lowest available retailer by ${diffPercent}%.`
      });
    }
  }

  // 3. Data Freshness (up to 10 pts)
  if (observedAt) {
    const observedMs = new Date(observedAt).getTime();
    const ageHours = (Date.now() - observedMs) / (1000 * 60 * 60);
    if (ageHours <= 2) {
      totalScore += 10;
      factors.push({ name: "Fresh Verification", impact: "+10", detail: "Price was verified within the last 2 hours." });
    } else if (ageHours <= 24) {
      totalScore += 5;
      factors.push({ name: "Recent Verification", impact: "+5", detail: "Price was verified today." });
    } else if (ageHours > 72) {
      totalScore -= 10;
      factors.push({ name: "Aging Observation", impact: "-10", detail: "Price was recorded more than 3 days ago." });
    }
  }

  // 4. Variant Confidence Check
  if (!isExactMatch) {
    totalScore -= 10;
    factors.push({ name: "Variant Disparity", impact: "-10", detail: "Offer is an alternative variant or differing tier." });
  }

  // Clamp 0 to 100
  const finalScore = Math.max(0, Math.min(100, Math.round(totalScore)));

  let label = "Average";
  if (finalScore >= 80) label = "Great Deal";
  else if (finalScore >= 60) label = "Fair Price";
  else if (finalScore <= 35) label = "High Price";

  return {
    score: finalScore,
    label,
    factors
  };
}

/**
 * Phase 7: Buy Now or Wait Guidance
 * Returns objective advice based strictly on recorded price history.
 */
export function getBuyNowOrWaitGuidance(currentPrice, historicalPrices = []) {
  const valid = historicalPrices.filter((p) => typeof p === "number" && p > 0);

  if (valid.length < 2) {
    return {
      recommendation: "Not enough data to advise",
      confidence: "low",
      reason: "Requires at least 2 verified price observations over time to detect trend patterns.",
      disclaimer: "Pricing advice is strictly informational based on past observations and does not guarantee future discounts."
    };
  }

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const spread = max - min;

  // Price is within 3% of recorded lowest
  if (currentPrice <= min * 1.03) {
    return {
      recommendation: "Good price relative to available history",
      confidence: "high",
      reason: `Current price (${formatPriceINR(currentPrice)}) is within 3% of the lowest recorded price (${formatPriceINR(min)}).`,
      disclaimer: "Pricing advice is strictly informational based on past observations and does not guarantee future discounts."
    };
  }

  // Price is in the upper tier (within 10% of maximum recorded)
  if (spread > 0 && currentPrice >= max - spread * 0.15) {
    return {
      recommendation: "Price is above its historical range",
      confidence: "medium",
      reason: `Current price is near its recorded peak of ${formatPriceINR(max)}. Consider waiting or monitoring for price drops.`,
      disclaimer: "Pricing advice is strictly informational based on past observations and does not guarantee future discounts."
    };
  }

  return {
    recommendation: "Consider monitoring the price",
    confidence: "medium",
    reason: `Price is in the mid-range between ${formatPriceINR(min)} and ${formatPriceINR(max)}. Price drops have been observed in past intervals.`,
    disclaimer: "Pricing advice is strictly informational based on past observations and does not guarantee future discounts."
  };
}

/**
 * Phase 8: Offer Reality Checker
 * Compares claimed retailer discounts with recorded historical observations to detect inflated MRP claims.
 */
export function checkOfferReality(currentPrice, claimedListPrice, historicalPrices = []) {
  const valid = historicalPrices.filter((p) => typeof p === "number" && p > 0);
  const claimedDiscount =
    claimedListPrice && claimedListPrice > currentPrice
      ? Math.round(((claimedListPrice - currentPrice) / claimedListPrice) * 100)
      : null;

  if (valid.length < 2) {
    return {
      assessment: "insufficient_history",
      claimedDiscount,
      verifiedHistoricalLow: null,
      explanation: "Not enough historical observations to verify retailer MRP discount accuracy."
    };
  }

  const min = Math.min(...valid);
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;

  // Check if claimed list price (MRP) is wildly inflated above typical pricing
  if (claimedListPrice && claimedListPrice > avg * 1.4 && currentPrice >= avg * 0.95) {
    return {
      assessment: "inflated_mrp",
      claimedDiscount,
      verifiedHistoricalLow: min,
      explanation: `Retailer lists an MRP of ${formatPriceINR(claimedListPrice)} to show a ${claimedDiscount}% discount, but the product typically sells for ${formatPriceINR(Math.round(avg))}. The real savings are modest.`
    };
  }

  if (currentPrice <= min * 1.02) {
    return {
      assessment: "verified_deal",
      claimedDiscount,
      verifiedHistoricalLow: min,
      explanation: `Genuine discount: current price of ${formatPriceINR(currentPrice)} matches the verified historical low.`
    };
  }

  return {
    assessment: "standard_pricing",
    claimedDiscount,
    verifiedHistoricalLow: min,
    explanation: `Typical pricing: selling price is close to the average historical rate of ${formatPriceINR(Math.round(avg))}.`
  };
}

/**
 * Phase 9: Seller, Warranty, & Trust Normalization
 * Standardizes retailer merchant attributes without fabricating unverified terms.
 */
export function normalizeSellerTrust(rawInfo = {}) {
  const sellerName = rawInfo.sellerName ? String(rawInfo.sellerName).trim() : null;
  const sellerRating =
    typeof rawInfo.sellerRating === "number" && rawInfo.sellerRating >= 0 && rawInfo.sellerRating <= 5
      ? rawInfo.sellerRating
      : null;

  const returnPolicy = rawInfo.returnPolicy ? String(rawInfo.returnPolicy).trim() : "Not verified";
  const warranty = rawInfo.warranty ? String(rawInfo.warranty).trim() : "Not verified";
  const condition = rawInfo.condition === "refurbished" ? "refurbished" : "new";
  const isVerifiedSeller = Boolean(rawInfo.isVerifiedSeller);

  return {
    sellerName: sellerName || "Retailer Direct",
    sellerRating,
    sellerRatingFormatted: sellerRating ? `${sellerRating.toFixed(1)} / 5.0` : "Not verified",
    returnPolicy,
    warranty,
    condition,
    trustStatus: isVerifiedSeller ? "verified" : "unverified",
    note: isVerifiedSeller ? "Verified authorized seller" : "Seller credentials not independently verified"
  };
}

/**
 * Phase 11: Personalized Comparison with Weighted Rankings
 * Allows users to adjust priorities: price, performance, camera, battery, warranty.
 */
export function rankPersonalizedOffers(products = [], userWeights = {}) {
  const weights = {
    price: userWeights.price ?? 0.35,
    performance: userWeights.performance ?? 0.25,
    camera: userWeights.camera ?? 0.15,
    battery: userWeights.battery ?? 0.15,
    warranty: userWeights.warranty ?? 0.10
  };

  // Normalize weight sum to 1.0
  const sum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const normWeights = {
    price: weights.price / sum,
    performance: weights.performance / sum,
    camera: weights.camera / sum,
    battery: weights.battery / sum,
    warranty: weights.warranty / sum
  };

  const validPrices = products
    .map((p) => p.price)
    .filter((p) => typeof p === "number" && p > 0);
  const minPrice = validPrices.length ? Math.min(...validPrices) : 1;
  const maxPrice = validPrices.length ? Math.max(...validPrices) : 1;

  const ranked = products.map((prod) => {
    // 1. Price score (cheapest is 100, highest is 20)
    let priceScore = 50;
    if (typeof prod.price === "number" && maxPrice > minPrice) {
      priceScore = 20 + 80 * (1 - (prod.price - minPrice) / (maxPrice - minPrice));
    } else if (typeof prod.price === "number") {
      priceScore = 80;
    }

    // 2. Spec scores (from 0 to 100 based on specs or ratings)
    const perfScore =
      typeof prod.specs?.performanceScore === "number"
        ? prod.specs.performanceScore
        : typeof prod.rating === "number"
        ? prod.rating * 20
        : 60;
    const camScore = typeof prod.specs?.cameraScore === "number" ? prod.specs.cameraScore : 60;
    const battScore = typeof prod.specs?.batteryScore === "number" ? prod.specs.batteryScore : 65;
    const warrantyScore = prod.trust?.warranty && prod.trust.warranty !== "Not verified" ? 85 : 50;

    const totalWeightedScore = Math.round(
      normWeights.price * priceScore +
      normWeights.performance * perfScore +
      normWeights.camera * camScore +
      normWeights.battery * battScore +
      normWeights.warranty * warrantyScore
    );

    const explanation = [];
    if (normWeights.price >= 0.3 && priceScore >= 75) {
      explanation.push("High price value relative to competitors");
    }
    if (normWeights.performance >= 0.25 && perfScore >= 80) {
      explanation.push("High performance tier");
    }
    if (normWeights.battery >= 0.2 && battScore >= 80) {
      explanation.push("Strong battery endurance");
    }

    return {
      ...prod,
      personalizedScore: totalWeightedScore,
      explanation: explanation.length ? explanation.join(" · ") : "Balanced overall profile"
    };
  });

  return ranked.sort((a, b) => b.personalizedScore - a.personalizedScore);
}
