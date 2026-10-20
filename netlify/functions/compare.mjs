// Serverless Netlify Function: GET /api/compare
// Search-first real-time multi-store price comparison across registered store adapters.

import { defaultRegistry } from "../../lib/adapters/registry.js";
import { parseAmazonHTML } from "../../lib/adapters/amazon.js";
import { parseFlipkartHTML } from "../../lib/adapters/flipkart.js";
import { parseCromaHTML } from "../../lib/adapters/croma.js";

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

// Re-export pure parsers for testing & external module consumers
export const parseAmazon = parseAmazonHTML;
export const parseFlipkart = parseFlipkartHTML;
export const parseCroma = parseCromaHTML;

/**
 * Scrapes a single store (retained for backward compatibility with direct tests).
 */
export async function scrapeStore(store, query, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const adapter = defaultRegistry.get(store.id);
  if (!adapter) {
    throw new Error(`No adapter registered for store id '${store.id}'`);
  }
  return adapter.search(query, { fetchImpl, timeoutMs, allowScrapeFallback: true });
}

/**
 * Handler for GET /api/compare?q=...
 */
export default async function handler(req, context) {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Reject non-GET requests
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ success: false, error: `Method ${req.method} not allowed` }),
      { status: 405, headers: { ...CORS_HEADERS, Allow: "GET, OPTIONS" } }
    );
  }

  const url = new URL(req.url, "http://localhost");
  const query = (url.searchParams.get("q") || url.searchParams.get("name") || "").trim();

  // Validate query parameter
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

  try {
    // Execute search-first comparison across all registered adapters
    const result = await defaultRegistry.compare(query, {
      allowScrapeFallback: true,
      timeoutMs: DEFAULT_TIMEOUT_MS
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: CORS_HEADERS
    });
  } catch (err) {
    console.error("[api/compare] Unexpected comparison error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal error executing store price comparison"
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
