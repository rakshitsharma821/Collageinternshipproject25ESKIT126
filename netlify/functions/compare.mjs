import { STORES, getStoreById } from "../../lib/stores.js";
import { normalizeTitle, parsePrice, calculateSimilarity, findCheapestOffer, rankResults } from "../../lib/match.js";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchWithTimeout(url, options = {}, timeoutMs = 4500) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en-US;q=0.9,en;q=0.8",
        ...(options.headers || {})
      }
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

function parseAmazon(html, query) {
  try {
    // Look for search result items
    // Amazon uses s-result-item, a-price-whole
    const priceRegex = /<span class="a-price-whole">([0-9,]+)<\/span>/i;
    const match = html.match(priceRegex);
    if (!match) return null;

    const price = parsePrice(match[1]);
    if (!price) return null;

    // Try extracting title
    const titleRegex = /<span class="a-size-(?:medium|base-plus)[^"]*">([^<]+)<\/span>/i;
    const titleMatch = html.match(titleRegex);
    const title = titleMatch ? titleMatch[1].trim() : query;

    return { price, title };
  } catch {
    return null;
  }
}

function parseFlipkart(html, query) {
  try {
    // Flipkart uses classes like Nx9bqj or _30jeq3 for price
    const priceRegex = /(?:Nx9bqj|_30jeq3)[^>]*>₹?([0-9,]+)<\/div>/i;
    const match = html.match(priceRegex);
    if (!match) return null;

    const price = parsePrice(match[1]);
    if (!price) return null;

    // Try extracting title
    const titleRegex = /(?:KzDlHZ|s1Q9rs|IRpwTa)[^>]*>([^<]+)<\/div>/i;
    const titleMatch = html.match(titleRegex);
    const title = titleMatch ? titleMatch[1].trim() : query;

    return { price, title };
  } catch {
    return null;
  }
}

function parseCroma(html, query) {
  try {
    // Croma uses span.amount or class="new-price"
    const priceRegex = /(?:amount|new-price|pdp-price)[^>]*>₹?([0-9,]+)<\/span>/i;
    const match = html.match(priceRegex);
    if (!match) return null;

    const price = parsePrice(match[1]);
    if (!price) return null;

    return { price, title: query };
  } catch {
    return null;
  }
}

async function scrapeStore(store, query) {
  const searchUrl = store.buildSearchUrl(query);
  const now = new Date().toISOString();

  try {
    const res = await fetchWithTimeout(searchUrl, {}, 4000);
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

    if (parsed && parsed.price) {
      return {
        store: store.id,
        name: store.name,
        color: store.color,
        mark: store.mark,
        url: searchUrl,
        title: parsed.title,
        price: parsed.price,
        observedAt: now
      };
    }

    return {
      store: store.id,
      name: store.name,
      color: store.color,
      mark: store.mark,
      url: searchUrl,
      error: "Product not found or store anti-bot triggered",
      observedAt: now
    };
  } catch (err) {
    return {
      store: store.id,
      name: store.name,
      color: store.color,
      mark: store.mark,
      url: searchUrl,
      error: err.name === "AbortError" ? "Request timed out" : "Unable to reach store",
      observedAt: now
    };
  }
}

export default async function handler(req) {
  const url = new URL(req.url);
  const query = (url.searchParams.get("q") || url.searchParams.get("name") || "").trim();

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=180"
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (!query) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing required search query parameter ?q=" }),
      { status: 400, headers }
    );
  }

  const results = await Promise.all(STORES.map((store) => scrapeStore(store, query)));
  const ranked = rankResults(results);
  const cheapest = findCheapestOffer(ranked);

  return new Response(
    JSON.stringify({
      success: true,
      query,
      cheapest,
      offers: ranked,
      fetchedAt: new Date().toISOString()
    }),
    { status: 200, headers }
  );
}
