// Store Adapter Registry & Comparison Coordinator

import { AmazonAdapter } from "./amazon.js";
import { FlipkartAdapter } from "./flipkart.js";
import { CromaAdapter } from "./croma.js";
import { rankResults, findCheapestOffer, extractProductAttributes } from "../match.js";

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
    const adaptersList = Array.from(this.adapters.values());

    // Execute searches across all registered adapters concurrently
    const settled = await Promise.allSettled(
      adaptersList.map((adapter) => adapter.search(cleanQuery, options))
    );

    const rawOffers = settled.map((res, index) => {
      if (res.status === "fulfilled") {
        return res.value;
      }
      const adapter = adaptersList[index];
      return {
        store: adapter.id,
        name: adapter.name,
        mark: adapter.mark,
        color: adapter.color,
        status: "error",
        title: null,
        price: null,
        formattedPrice: null,
        currency: "INR",
        url: adapter.buildSearchUrl(cleanQuery),
        availability: "unknown",
        observedAt: new Date().toISOString(),
        error: res.reason?.message || "Store search failed unexpectedly"
      };
    });

    // Rank results and evaluate comparability against query attributes
    const rankedOffers = rankResults(rawOffers, cleanQuery);
    const cheapestOffer = findCheapestOffer(rankedOffers);

    return {
      success: true,
      query: cleanQuery,
      queryAttributes: queryAttrs,
      cheapest: cheapestOffer,
      offers: rankedOffers,
      fetchedAt: new Date().toISOString()
    };
  }
}

// Global default registry instance
export const defaultRegistry = new StoreRegistry();
