import { BaseStoreAdapter } from "./base.js";
import { parsePrice, formatPriceINR } from "../match.js";
import { USER_AGENT } from "./amazon.js";

export function parseCromaHTML(html, query) {
  if (!html || typeof html !== "string") return null;

  const priceRegex = /(?:amount|new-price|pdp-price)[^>]*>₹?([0-9,]+)<\/span>/i;
  const match = html.match(priceRegex);

  if (match) {
    const price = parsePrice(match[1]);
    if (price && price >= 100) {
      return { price, title: query };
    }
  }

  // Croma renders on client side in production
  return { error: "Croma search results require client-side JavaScript rendering" };
}

export class CromaAdapter extends BaseStoreAdapter {
  constructor(config = {}) {
    super({
      id: "croma",
      name: "Croma",
      mark: "C",
      color: "#00b5b5",
      domain: "croma.com",
      requiredEnvVars: ["CROMA_API_KEY"],
      ...config
    });
    this.customFetch = config.fetchImpl || null;
  }

  buildSearchUrl(query) {
    return `https://www.croma.com/searchB?q=${encodeURIComponent(query)}`;
  }

  async search(query, options = {}) {
    const searchUrl = this.buildSearchUrl(query);
    const now = new Date().toISOString();
    const fetchImpl = options.fetchImpl || this.customFetch || fetch;
    const timeoutMs = options.timeoutMs || 4500;

    if (!this.isConfigured() && !options.allowScrapeFallback && !this.customFetch) {
      return {
        store: this.id,
        name: this.name,
        mark: this.mark,
        color: this.color,
        status: "not_configured",
        title: null,
        price: null,
        formattedPrice: null,
        currency: "INR",
        url: searchUrl,
        availability: "unknown",
        observedAt: now,
        error: "Croma enterprise partner API is not configured (CROMA_API_KEY). Storefront operates as a client-side SPA."
      };
    }

    try {
      let signal;
      if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
        signal = AbortSignal.timeout(timeoutMs);
      }

      const res = await fetchImpl(searchUrl, {
        signal,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-IN,en;q=0.9"
        }
      });

      if (!res.ok) {
        return {
          store: this.id,
          name: this.name,
          mark: this.mark,
          color: this.color,
          status: "unavailable",
          title: null,
          price: null,
          formattedPrice: null,
          currency: "INR",
          url: searchUrl,
          availability: "unknown",
          observedAt: now,
          error: `Croma returned HTTP status ${res.status}`
        };
      }

      const html = await res.text();
      const parsed = parseCromaHTML(html, query);

      if (parsed && typeof parsed.price === "number") {
        return {
          store: this.id,
          name: this.name,
          mark: this.mark,
          color: this.color,
          status: "verified",
          title: parsed.title || query,
          price: parsed.price,
          formattedPrice: formatPriceINR(parsed.price),
          currency: "INR",
          url: searchUrl,
          availability: "in_stock",
          observedAt: now
        };
      }

      return {
        store: this.id,
        name: this.name,
        mark: this.mark,
        color: this.color,
        status: "unavailable",
        title: null,
        price: null,
        formattedPrice: null,
        currency: "INR",
        url: searchUrl,
        availability: "unknown",
        observedAt: now,
        error: parsed?.error || "Croma search results require client-side JavaScript rendering"
      };
    } catch (err) {
      const isTimeout = err.name === "AbortError" || err.name === "TimeoutError";
      return {
        store: this.id,
        name: this.name,
        mark: this.mark,
        color: this.color,
        status: "error",
        title: null,
        price: null,
        formattedPrice: null,
        currency: "INR",
        url: searchUrl,
        availability: "unknown",
        observedAt: now,
        error: isTimeout ? "Request timed out" : "Unable to reach Croma"
      };
    }
  }
}
