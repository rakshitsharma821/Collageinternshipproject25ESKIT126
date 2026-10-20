// Store Adapter Registry & Comparison Coordinator

import { AmazonAdapter } from "./amazon.js";
import { FlipkartAdapter } from "./flipkart.js";
import { CromaAdapter } from "./croma.js";
import { rankResults, findCheapestOffer, extractProductAttributes, formatPriceINR } from "../match.js";
import { normalizeProduct } from "../identity.js";
import {
  calculateDealScore,
  getBuyNowOrWaitGuidance,
  checkOfferReality,
  calculateFinalPayablePrice,
  normalizeSellerTrust
} from "../intelligence.js";

export class StoreRegistry {
  constructor(adapters = []) {
    this.adapters = new Map();
    if (adapters.length > 0) {
      adapters.forEach((a) => this.register(a));
    } else {
      this.registerDefaultAdapters();
    }
  }

  registerDefaultAdapters() {
    this.register(new AmazonAdapter());
    this.register(new FlipkartAdapter());
    this.register(new CromaAdapter());
  }

  register(adapter) {
    if (!adapter || !adapter.id) {
      throw new Error("Invalid store adapter: missing id");
    }
    this.adapters.set(adapter.id, adapter);
  }

  unregister(storeId) {
    return this.adapters.delete(storeId);
  }

  get(storeId) {
    return this.adapters.get(storeId) || null;
  }

  getAll() {
    return Array.from(this.adapters.values());
  }

  /**
   * Executes multi-store price comparison for a search query.
   * Runs adapters concurrently, matches variants, and selects the cheapest valid offer.
   */
  async compare(query, options = {}) {
    if (!query || typeof query !== "string") {
      throw new Error("Search query must be a non-empty string");
    }

    const cleanQuery = query.trim();
    const queryAttrs = extractProductAttributes(cleanQuery);
    const normVariant = normalizeProduct(cleanQuery);
    const adaptersList = Array.from(this.adapters.values());

    // Concurrency limit & timeout handling per store
    const timeoutMs = options.timeoutMs || 4500;

    // Execute searches across all registered adapters concurrently using Promise.allSettled
    const settled = await Promise.allSettled(
      adaptersList.map((adapter) =>
        adapter.search(cleanQuery, { ...options, timeoutMs })
      )
    );

    const rawOffers = settled.map((res, index) => {
      if (res.status === "fulfilled") {
        const val = res.value;
        const trust = normalizeSellerTrust(val.seller || {});
        return {
          ...val,
          trust,
          finalPayable: calculateFinalPayablePrice(val)
        };
      }
      const adapter = adaptersList[index];
      return {
        store: adapter.id,
        name: adapter.name,
        mark: adapter.mark,
        color: adapter.color,
        status: "error",
        verificationStatus: "unverified",
        title: null,
        price: null,
        formattedPrice: null,
        currency: "INR",
        url: adapter.buildSearchUrl(cleanQuery),
        productUrl: null,
        searchUrl: adapter.buildSearchUrl(cleanQuery),
        availability: "unknown",
        observedAt: new Date().toISOString(),
        error: res.reason?.message || "Store search failed unexpectedly"
      };
    });

    // Rank results and evaluate comparability against query attributes
    const rankedOffers = rankResults(rawOffers, cleanQuery);
    const cheapestOffer = findCheapestOffer(rankedOffers);

    // Compute store errors
    const storeErrors = rawOffers
      .filter((o) => o.error || o.status !== "verified")
      .map((o) => ({
        store: o.store,
        name: o.name,
        status: o.status,
        reason: o.error || "Price not verified"
      }));

    // Compute mathematical savings across verified offers
    const validPrices = rankedOffers
      .filter((o) => typeof o.price === "number" && o.price > 0 && o.comparable !== false)
      .map((o) => ({ store: o.store, price: o.price, name: o.name }));

    let savings = null;
    if (validPrices.length >= 2 && cheapestOffer) {
      const otherStores = validPrices.filter((o) => o.store !== cheapestOffer.store);
      if (otherStores.length > 0) {
        const nextLowest = Math.min(...otherStores.map((o) => o.price));
        const baselineStore = otherStores.find((o) => o.price === nextLowest);
        const amount = nextLowest - cheapestOffer.price;
        if (amount > 0) {
          savings = {
            amount,
            formattedAmount: formatPriceINR(amount),
            percentage: Math.round((amount / nextLowest) * 100),
            comparedTo: baselineStore?.name || "next best retailer"
          };
        }
      }
    }

    // Shopping Intelligence: Deal Score, Buy Now or Wait, Reality Check
    let intelligence = null;
    if (cheapestOffer && typeof cheapestOffer.price === "number") {
      const compPrices = validPrices
        .filter((o) => o.store !== cheapestOffer.store)
        .map((o) => o.price);

      const dealScore = calculateDealScore(cheapestOffer.price, {
        competitorPrices: compPrices,
        observedAt: cheapestOffer.observedAt,
        isExactMatch: cheapestOffer.comparable !== false
      });

      const guidance = getBuyNowOrWaitGuidance(cheapestOffer.price, [cheapestOffer.price]);
      const realityCheck = checkOfferReality(cheapestOffer.price, null, [cheapestOffer.price]);

      intelligence = {
        dealScore,
        guidance,
        realityCheck
      };
    }

    return {
      success: true,
      query: cleanQuery,
      canonicalTitle: cheapestOffer?.title || cleanQuery,
      variant: normVariant,
      queryAttributes: queryAttrs,
      cheapest: cheapestOffer,
      savings,
      intelligence,
      offers: rankedOffers,
      storeErrors,
      fetchedAt: new Date().toISOString()
    };
  }
}

// Global default registry instance
export const defaultRegistry = new StoreRegistry();
