import { RETAILER_HOSTS } from "./compare.js";

export const ALLOWED_DOMAINS = RETAILER_HOSTS;

export const FORBIDDEN_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i
];

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

  if (parsed.protocol !== "https:") {
    return { valid: false, error: "Only secure HTTPS URLs are permitted." };
  }
  if (parsed.username || parsed.password) {
    return { valid: false, error: "URLs containing authentication credentials are prohibited." };
  }
  if (parsed.port && parsed.port !== "443") {
    return { valid: false, error: "Non-standard network ports are not permitted." };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (FORBIDDEN_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return { valid: false, error: "Access to private or local network hosts is strictly prohibited." };
  }
  if (!ALLOWED_DOMAINS.has(hostname)) {
    return {
      valid: false,
      error: `Unsupported store domain '${hostname}'. Use Amazon India, Flipkart, Croma, or Reliance Digital.`
    };
  }

  return { valid: true, url: parsed.href, hostname, pathname: parsed.pathname };
}

export function extractProductFromUrl(validatedUrlObj) {
  const hostname = validatedUrlObj?.hostname || "";
  const store = hostname.includes("amazon")
    ? "amazon"
    : hostname.includes("flipkart") || hostname === "fkrt.it"
      ? "flipkart"
      : hostname.includes("croma")
        ? "croma"
        : "reliance";

  return {
    store,
    identifiedTitle: null,
    confidence: 0,
    note: "Product names are read from page metadata, not guessed from the URL."
  };
}
