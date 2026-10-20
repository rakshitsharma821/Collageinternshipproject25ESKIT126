import { BaseStoreAdapter } from "./base.js";
import { parsePrice, formatPriceINR, calculateSimilarity } from "../match.js";
import { USER_AGENT } from "./amazon.js";

export function parseFlipkartHTML(html, query) {
  if (!html || typeof html !== "string") return null;

  if (html.includes("503 Service Temporarily Unavailable")) {
    return { error: "Flipkart service temporarily unavailable" };
  }

  // Look for structured product cards
  const classMatches = [
    ...html.matchAll(/(?:hZ3P6w|Nx9bqj|_30jeq3|DeU9vF)[^>]*>₹?([0-9,]+)<\/div>/g)
  ].map((m) => m[1]);

  let price = null;
  for (const m of classMatches) {
    const p = parsePrice(m);
    if (p && p >= 100) {
      price = p;
      break;
    }
  }

  if (!price) {
    const genericMatches = [...html.matchAll(/>₹\s*([0-9,]+)</g)].map((m) => m[1]);
    for (const m of genericMatches) {
      const p = parsePrice(m);
      if (p && p >= 500) {
        price = p;
        break;
      }
    }
  }

  if (!price) return null;

  const titleMatches = [
    ...html.matchAll(/class="(?:KzDlHZ|wjcEIp|WKTcLC|_4rR01T|s1Q9rs)"[^>]*>([^<]+)</g),
    ...html.matchAll(/<div[^>]*>([A-Za-z0-9\s(),.-]{15,90})<\/div>/g)
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

  return { price, title: bestTitle };
}

export class FlipkartAdapter extends BaseStoreAdapter {
  constructor(config = {}) {
    super({
      id: "flipkart",
      name: "Flipkart",
      mark: "F",
      color: "#2874f0",
      domain: "flipkart.com",
      requiredEnvVars: ["FLIPKART_AFFILIATE_ID", "FLIPKART_AFFILIATE_TOKEN"],
      ...config
    });
    this.customFetch = config.fetchImpl || null;
  }

  buildSearchUrl(query) {
    return `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`;
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
        error: "Flipkart Affiliate API is not configured. Set FLIPKART_AFFILIATE_ID and FLIPKART_AFFILIATE_TOKEN."
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
          error: `Flipkart returned HTTP status ${res.status}`
        };
      }

      const html = await res.text();
      const parsed = parseFlipkartHTML(html, query);

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
        error: parsed?.error || "Product not found or store anti-bot challenge served"
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
        error: isTimeout ? "Request timed out" : "Unable to reach Flipkart"
      };
    }
  }
}
