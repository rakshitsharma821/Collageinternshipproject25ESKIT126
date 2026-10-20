import { STORES, getStoreById } from "../../lib/stores.js";
import {
  normalizeTitle,
  parsePrice,
  calculateSimilarity,
  findCheapestOffer,
  rankResults,
  formatPriceINR
} from "../../lib/match.js";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;
export const DEFAULT_TIMEOUT_MS = 4500;

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=180, s-maxage=300"
};

/**
 * Pure parser for Amazon India search results HTML.
 */
export function parseAmazon(html, query) {
  if (!html || typeof html !== "string") return null;

  // Detect anti-bot challenge
  if (
    html.includes("Robot Check") ||
    html.includes("api-services-support@amazon.com") ||
    html.includes("Type the characters you see in this image")
  ) {
    return { error: "Amazon anti-bot verification challenge triggered" };
  }

  // 1. Extract prices
  const offscreenMatches = [...html.matchAll(/class="a-offscreen">([^<]+)<\/span>/g)].map((m) => m[1]);
  const wholeMatches = [...html.matchAll(/a-price-whole">([0-9,]+)/g)].map((m) => m[1]);

  let price = null;
  // Match first valid price
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

  // 2. Extract best matching title
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

  return { price, title: bestTitle };
}

/**
 * Pure parser for Flipkart search results HTML.
 */
export function parseFlipkart(html, query) {
  if (!html || typeof html !== "string") return null;

  // Detect potential block or empty page
  if (html.includes("503 Service Temporarily Unavailable")) {
    return { error: "Flipkart service temporarily unavailable" };
  }

  // 1. Extract price
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
    // Look for prices in product result listings (skip filter dropdown values like min/max)
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

  // 2. Extract product title
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

/**
 * Pure parser for Croma search results HTML.
 */
export function parseCroma(html, query) {
  if (!html || typeof html !== "string") return null;

  // Croma renders search results on the client side via Angular/React SPA
  const priceRegex = /(?:amount|new-price|pdp-price)[^>]*>₹?([0-9,]+)<\/span>/i;
  const match = html.match(priceRegex);

  if (match) {
    const price = parsePrice(match[1]);
    if (price && price >= 100) {
      return { price, title: query };
    }
  }

  // Accurately surface SPA limitations instead of fabricating data
  return { error: "Croma search results require client-side JavaScript rendering" };
}

/**
 * Scrapes a single store with timeout and structured offer response.
 * Accepts an injectable fetch function for hermetic unit testing.
 */
export async function scrapeStore(store, query, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const searchUrl = store.buildSearchUrl(query);
  const now = new Date().toISOString();

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
        "Accept-Language": "en-IN,en-US;q=0.9,en;q=0.8"
      }
    });

    if (!res.ok) {
      return {
        store: store.id,
        name: store.name,
        color: store.color,
        mark: store.mark,
        url: searchUrl,
        error: `Store returned status ${res.status}`,
        observedAt: now
      };
    }

    const html = await res.text();
    let parsed = null;

    if (store.id === "amazon") {
      parsed = parseAmazon(html, query);
    } else if (store.id === "flipkart") {
      parsed = parseFlipkart(html, query);
    } else if (store.id === "croma") {
      parsed = parseCroma(html, query);
    }

    if (parsed && typeof parsed.price === "number" && parsed.price > 0) {
      return {
        store: store.id,
        name: store.name,
        color: store.color,
        mark: store.mark,
        url: searchUrl,
        title: parsed.title || query,
        price: parsed.price,
        formattedPrice: formatPriceINR(parsed.price),
        observedAt: now
      };
    }

    return {
      store: store.id,
      name: store.name,
      color: store.color,
      mark: store.mark,
      url: searchUrl,
      error: parsed?.error || "Product not found or store anti-bot triggered",
      observedAt: now
    };
  } catch (err) {
    const isTimeout = err.name === "AbortError" || err.name === "TimeoutError";
    return {
      store: store.id,
      name: store.name,
      color: store.color,
      mark: store.mark,
      url: searchUrl,
      error: isTimeout ? "Request timed out" : "Unable to reach store",
      observedAt: now
    };
  }
}

/**
 * Netlify Function handler for GET /api/compare
 */
export default async function handler(req, context) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ success: false, error: `Method ${req.method} not allowed` }),
      { status: 405, headers: { ...CORS_HEADERS, Allow: "GET, OPTIONS" } }
    );
  }

  const url = new URL(req.url, "http://localhost");
  const query = (url.searchParams.get("q") || url.searchParams.get("name") || "").trim();

  if (!query) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing required search query parameter ?q=" }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (query.length < MIN_QUERY_LENGTH) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Search query must be at least ${MIN_QUERY_LENGTH} characters long.`
      }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Search query exceeds maximum length of ${MAX_QUERY_LENGTH} characters.`
      }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Query stores concurrently
  const storeResults = await Promise.all(
    STORES.map((store) => scrapeStore(store, query, fetch, DEFAULT_TIMEOUT_MS))
  );

  const ranked = rankResults(storeResults);
  const cheapest = findCheapestOffer(ranked);

  return new Response(
    JSON.stringify({
      success: true,
      query,
      cheapest,
      offers: ranked,
      fetchedAt: new Date().toISOString()
    }),
    { status: 200, headers: CORS_HEADERS }
  );
}
