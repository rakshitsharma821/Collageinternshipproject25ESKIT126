/**
 * GadgetVerse — Any-Link Product Scanner & SSRF Guard (Phase 14)
 * Validates external retailer URLs against strict allowlists, protects against SSRF attacks,
 * extracts product titles from verified retailer URLs, and triggers comparison across stores.
 */

export const ALLOWED_DOMAINS = new Set([
  "amazon.in",
  "www.amazon.in",
  "flipkart.com",
  "www.flipkart.com",
  "dl.flipkart.com",
  "croma.com",
  "www.croma.com"
]);

export const FORBIDDEN_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./, // AWS / Cloud metadata service
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i
];

/**
 * Validates a user-supplied URL for SSRF vulnerabilities and domain legitimacy.
 */
export function validateRetailerUrl(rawUrl = "") {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, error: "Missing or invalid URL parameter." };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, error: "Malformed URL syntax." };
  }

  // 1. Protocol must be HTTPS
  if (parsed.protocol !== "https:") {
    return { valid: false, error: "Only secure HTTPS URLs are permitted." };
  }

  // 2. Reject credentials in URL (user:pass@host)
  if (parsed.username || parsed.password) {
    return { valid: false, error: "URLs containing authentication credentials are prohibited." };
  }

  // 3. Reject non-standard ports
  if (parsed.port && parsed.port !== "443") {
    return { valid: false, error: "Non-standard network ports are not permitted." };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 4. SSRF Guard: Reject private IPs and localhost
  for (const pattern of FORBIDDEN_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      return { valid: false, error: "Access to private or local network hosts is strictly prohibited." };
    }
  }

  // 5. Hostname must be in allowed retailer list
  if (!ALLOWED_DOMAINS.has(hostname)) {
    return {
      valid: false,
      error: `Unsupported store domain '${hostname}'. Supported retailers: Amazon India (amazon.in), Flipkart (flipkart.com), and Croma (croma.com).`
    };
  }

  return {
    valid: true,
    url: parsed.href,
    hostname,
    pathname: parsed.pathname
  };
}

/**
 * Extracts candidate product query from authorized retailer URL slugs.
 */
export function extractProductFromUrl(validatedUrlObj) {
  const { hostname, pathname } = validatedUrlObj;

  // 1. Amazon: /slug-name/dp/ASIN or /dp/ASIN
  if (hostname.includes("amazon.in")) {
    const slugMatch = pathname.match(/^\/([^\/]+)\/dp\/[A-Z0-9]{10}/i);
    if (slugMatch && slugMatch[1] && slugMatch[1].toLowerCase() !== "dp") {
      const cleanTitle = slugMatch[1].replace(/[-_]+/g, " ").trim();
      if (cleanTitle.length >= 3) {
        return { store: "amazon", identifiedTitle: cleanTitle, confidence: 0.9 };
      }
    }
    const asinMatch = pathname.match(/\/dp\/([A-Z0-9]{10})/i);
    if (asinMatch) {
      return {
        store: "amazon",
        asin: asinMatch[1],
        identifiedTitle: null,
        confidence: 0.5,
        note: "ASIN detected without product title slug."
      };
    }
  }

  // 2. Flipkart: /product-title-slug/p/itm...
  if (hostname.includes("flipkart.com")) {
    const fkMatch = pathname.match(/^\/([^\/]+)\/p\/itm/i);
    if (fkMatch && fkMatch[1]) {
      const cleanTitle = fkMatch[1].replace(/[-_]+/g, " ").trim();
      if (cleanTitle.length >= 3) {
        return { store: "flipkart", identifiedTitle: cleanTitle, confidence: 0.9 };
      }
    }
  }

  // 3. Croma: /product-title-slug/p/123456
  if (hostname.includes("croma.com")) {
    const cromaMatch = pathname.match(/^\/([^\/]+)\/p\/\d+/i);
    if (cromaMatch && cromaMatch[1]) {
      const cleanTitle = cromaMatch[1].replace(/[-_]+/g, " ").trim();
      if (cleanTitle.length >= 3) {
        return { store: "croma", identifiedTitle: cleanTitle, confidence: 0.85 };
      }
    }
  }

  return {
    store: hostname.includes("amazon") ? "amazon" : hostname.includes("flipkart") ? "flipkart" : "croma",
    identifiedTitle: null,
    confidence: 0,
    note: "Could not safely extract product identity from URL path."
  };
}
