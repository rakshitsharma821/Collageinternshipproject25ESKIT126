import { validateProductUrl } from "../lib/compare.js";
import { validateRetailerUrl } from "../lib/scanner.js";

const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};

export default async function handler(request) {
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: `Method ${request.method} not allowed` }), {
      status: 405,
      headers: { ...HEADERS, Allow: "GET, POST, OPTIONS" }
    });
  }

  let rawUrl = "";
  if (request.method === "POST") {
    try {
      rawUrl = (await request.json()).url || "";
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Send a valid JSON request containing a product URL." }), {
        status: 400,
        headers: HEADERS
      });
    }
  } else {
    rawUrl = new URL(request.url).searchParams.get("url") || "";
  }

  const validation = validateProductUrl(rawUrl);
  if (!validation.valid) {
    const ssrfValidation = validateRetailerUrl(rawUrl);
    return new Response(JSON.stringify({
      success: false,
      error: ssrfValidation.valid ? validation.error : ssrfValidation.error
    }), { status: 400, headers: HEADERS });
  }

  return new Response(JSON.stringify({
    success: false,
    error: "This URL endpoint has moved. Use GET /api/compare?url= with the product link."
  }), { status: 410, headers: HEADERS });
}
