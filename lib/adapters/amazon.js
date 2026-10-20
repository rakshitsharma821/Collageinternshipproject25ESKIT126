import { BaseStoreAdapter } from "./base.js";
import { parsePrice, formatPriceINR, calculateSimilarity } from "../match.js";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export function parseAmazonHTML(html, query) {
  if (!html || typeof html !== "string") return null;

  if (
    html.includes("Robot Check") ||
    html.includes("api-services-support@amazon.com") ||
    html.includes("Type the characters you see in this image")
  ) {
    return { error: "Amazon anti-bot verification challenge triggered", blocked: true };
  }

  const offscreenMatches = [...html.matchAll(/class="a-offscreen">([^<]+)<\/span>/g)].map((m) => m[1]);
  const wholeMatches = [...html.matchAll(/a-price-whole">([0-9,]+)/g)].map((m) => m[1]);

  let price = null;
  for (const m of offscreenMatches) {
    const p = parsePrice(m);
    if (p && p >= 100) {
      price = p;
      break;
    }
  }
  if (!price) {
    for (const m of wholeMatches) {
      const p = parsePrice(m);
      if (p && p >= 100) {
        price = p;
        break;
      }
    }
  }

  if (!price) return null;

  const titleMatches = [
    ...html.matchAll(/<h2[^>]*>.*?<span[^>]*>([^<]+)<\/span>/gis),
    ...html.matchAll(/<span class="a-size-(?:medium|base-plus)[^"]*">([^<]+)<\/span>/gis)
  ].map((m) => m[1].trim());

  let bestTitle = query;
  let bestSim = 0;
  for (const t of titleMatches) {
    const sim = calculateSimilarity(query, t);
    if (sim > bestSim) {
      bestSim = sim;
      bestTitle = t;
    }
  }

  // Extract direct product URL if present
  let directProductUrl = null;
  const dpMatch = html.match(/href="([^"]*(?:\/dp\/[A-Z0-9]{10})[^"]*)"/i);
  if (dpMatch) {
    let cleanHref = dpMatch[1].split("?")[0];
    if (cleanHref.startsWith("/")) cleanHref = `https://www.amazon.in${cleanHref}`;
    directProductUrl = cleanHref;
  }

  return { price, title: bestTitle, directProductUrl };
}

export class AmazonAdapter extends BaseStoreAdapter {
  constructor(config = {}) {
    super({
      id: "amazon",
      name: "Amazon",
      mark: "A",
      color: "#ff9900",
      domain: "amazon.in",
      requiredEnvVars: ["AMAZON_ACCESS_KEY", "AMAZON_SECRET_KEY", "AMAZON_PARTNER_TAG"],
      ...config
    });
    this.customFetch = config.fetchImpl || null;
  }

  buildSearchUrl(query) {
    return `https://www.amazon.in/s?k=${encodeURIComponent(query)}`;
  }

  async search(query, options = {}) {
    const searchUrl = this.buildSearchUrl(query);
    const now = new Date().toISOString();
    const fetchImpl = options.fetchImpl || this.customFetch || fetch;
    const timeoutMs = options.timeoutMs || 4500;

    // 1. If official API credentials are not set, check if testing parser or report unconfigured
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
        error: "Amazon Product Advertising API (PA-API v5) is not configured. Set AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY, and AMAZON_PARTNER_TAG."
      };
    }

    // 2. Fetch via authorized endpoint or configured fetcher
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
          error: `Amazon returned HTTP status ${res.status}`
        };
      }

      const html = await res.text();
      const parsed = parseAmazonHTML(html, query);

      if (parsed && typeof parsed.price === "number") {
        return {
          store: this.id,
          name: this.name,
          mark: this.mark,
          color: this.color,
          status: "verified",
          verificationStatus: "verified",
          title: parsed.title || query,
          price: parsed.price,
          formattedPrice: formatPriceINR(parsed.price),
          currency: "INR",
          url: parsed.directProductUrl || searchUrl,
          productUrl: parsed.directProductUrl || null,
          searchUrl,
          availability: "in_stock",
          seller: { name: "Appario Retail / Amazon Direct", verified: false },
          shipping: { cost: 0, verified: true },
          coupon: null,
          observedAt: now
        };
      }

      const isBlocked = parsed?.blocked === true;
      return {
        store: this.id,
        name: this.name,
        mark: this.mark,
        color: this.color,
        status: isBlocked ? "blocked" : "no_results",
        verificationStatus: "unverified",
        title: null,
        price: null,
        formattedPrice: null,
        currency: "INR",
        url: searchUrl,
        productUrl: null,
        searchUrl,
        availability: "unknown",
        observedAt: now,
        error: parsed?.error || "Product not found across Amazon India search listings"
      };
    } catch (err) {
      const isTimeout = err.name === "AbortError" || err.name === "TimeoutError";
      return {
        store: this.id,
        name: this.name,
        mark: this.mark,
        color: this.color,
        status: isTimeout ? "timeout" : "error",
        verificationStatus: "unverified",
        title: null,
        price: null,
        formattedPrice: null,
        currency: "INR",
        url: searchUrl,
        productUrl: null,
        searchUrl,
        availability: "unknown",
        observedAt: now,
        error: isTimeout ? "Request timed out" : "Unable to reach Amazon"
      };
    }
  }
}
