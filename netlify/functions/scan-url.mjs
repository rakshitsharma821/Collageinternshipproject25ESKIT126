import { validateRetailerUrl, extractProductFromUrl } from "../../lib/scanner.js";
import { defaultRegistry } from "../../lib/adapters/registry.js";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store"
};

export default async function handler(req, context) {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Accept GET or POST
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: `Method ${req.method} not allowed` }),
      { status: 405, headers: { ...CORS_HEADERS, Allow: "GET, POST, OPTIONS" } }
    );
  }

  let rawUrl = "";
  if (req.method === "POST") {
    try {
      const body = await req.json();
      rawUrl = body.url || "";
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON body. Expected { url: '...' }" }),
        { status: 400, headers: CORS_HEADERS }
      );
    }
  } else {
    const urlObj = new URL(req.url, "http://localhost");
    rawUrl = urlObj.searchParams.get("url") || "";
  }

  // 1. Strict URL and SSRF validation
  const validation = validateRetailerUrl(rawUrl);
  if (!validation.valid) {
    return new Response(
      JSON.stringify({ success: false, error: validation.error }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // 2. Extract product title / ASIN from verified path
  const extraction = extractProductFromUrl(validation);
  if (!extraction.identifiedTitle) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Could not identify product name from this retailer URL structure. Please enter the product name directly in search.",
        sourceUrl: validation.url,
        store: extraction.store
      }),
      { status: 422, headers: CORS_HEADERS }
    );
  }

  // 3. Compare identified product across all supported stores
  try {
    const comparison = await defaultRegistry.compare(extraction.identifiedTitle, {
      allowScrapeFallback: true,
      timeoutMs: 4500
    });

    return new Response(
      JSON.stringify({
        success: true,
        scannedUrl: validation.url,
        originStore: extraction.store,
        identifiedProduct: extraction.identifiedTitle,
        confidence: extraction.confidence,
        ...comparison
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal error executing store comparison for scanned URL"
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
