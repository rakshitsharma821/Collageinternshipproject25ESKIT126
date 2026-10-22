export const RETAILER_HOSTS = new Set([
  "amazon.in",
  "www.amazon.in",
  "amzn.in",
  "amzn.to",
  "flipkart.com",
  "www.flipkart.com",
  "dl.flipkart.com",
  "fkrt.it",
  "croma.com",
  "www.croma.com",
  "reliancedigital.in",
  "www.reliancedigital.in"
]);

const SHORT_LINK_HOSTS = new Set(["amzn.in", "amzn.to", "dl.flipkart.com", "fkrt.it"]);
const RETAILER_BY_HOST = new Map([
  ["amazon.in", "amazon"], ["www.amazon.in", "amazon"], ["amzn.in", "amazon"], ["amzn.to", "amazon"],
  ["flipkart.com", "flipkart"], ["www.flipkart.com", "flipkart"], ["dl.flipkart.com", "flipkart"], ["fkrt.it", "flipkart"],
  ["croma.com", "croma"], ["www.croma.com", "croma"],
  ["reliancedigital.in", "reliance"], ["www.reliancedigital.in", "reliance"]
]);

export function getRetailerForHostname(hostname) {
  return RETAILER_BY_HOST.get(String(hostname || "").toLowerCase()) || null;
}

export function validateProductUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return { valid: false, error: "Paste a product link to continue." };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, error: "Enter a valid product link beginning with https://." };
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) {
    return { valid: false, error: "Only secure product links from supported stores are allowed." };
  }
  if (!RETAILER_HOSTS.has(parsed.hostname.toLowerCase())) {
    return {
      valid: false,
      error: "Use a link from Amazon India, Flipkart, Croma, or Reliance Digital."
    };
  }

  return {
    valid: true,
    url: parsed.href,
    hostname: parsed.hostname.toLowerCase(),
    isShortLink: SHORT_LINK_HOSTS.has(parsed.hostname.toLowerCase())
  };
}

export async function resolveProductUrl(rawUrl, fetchImpl = fetch, maxRedirects = 5) {
  let validation = validateProductUrl(rawUrl);
  if (!validation.valid) return validation;

  const sourceRetailer = getRetailerForHostname(validation.hostname);
  let currentUrl = validation.url;
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const response = await fetchImpl(currentUrl, {
      method: "GET",
      redirect: "manual",
      headers: { Accept: "text/html,application/xhtml+xml" }
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { valid: false, error: "The store returned an incomplete redirect." };
      const nextUrl = new URL(location, currentUrl).href;
      validation = validateProductUrl(nextUrl);
      if (!validation.valid) {
        return { valid: false, error: "This link redirects outside the supported stores." };
      }
      if (getRetailerForHostname(validation.hostname) !== sourceRetailer) {
        return { valid: false, error: "This link redirects to a different retailer." };
      }
      currentUrl = validation.url;
      continue;
    }
    if (!response.ok) {
      return { valid: false, error: "The product page could not be opened. Try the product name instead." };
    }
    const rawAge = response.headers.get("age");
    const ageSeconds = rawAge === null ? null : Number(rawAge);
    if (rawAge !== null && (!Number.isSafeInteger(ageSeconds) || ageSeconds < 0)) {
      return { valid: false, error: "The product page returned invalid freshness information." };
    }
    return {
      valid: true,
      url: currentUrl,
      html: await response.text(),
      ageSeconds
    };
  }

  return { valid: false, error: "This store link redirects too many times." };
}

function productNameFromJson(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const name = productNameFromJson(item);
      if (name) return name;
    }
  } else if (value && typeof value === "object") {
    const type = value["@type"];
    const productType = (candidate) =>
      typeof candidate === "string" &&
      candidate.split(/[\/#]/).at(-1)?.toLowerCase() === "product";
    if ((productType(type) || (Array.isArray(type) && type.some(productType))) &&
        typeof value.name === "string" && value.name.trim()) {
      return value.name.trim();
    }
    for (const key of ["@graph", "mainEntity", "mainEntityOfPage"]) {
      const name = productNameFromJson(value[key]);
      if (name) return name;
    }
  }
  return null;
}

export function extractProductName(html) {
  if (typeof html !== "string") return null;
  const scripts = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    try {
      const name = productNameFromJson(JSON.parse(match[1].trim()));
      if (name) return name;
    } catch {
      continue;
    }
  }

  const meta = html.match(/<meta\b[^>]*(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
    html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:title["'][^>]*>/i);
  if (meta?.[1]) return decodeHtml(meta[1]);

  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return title?.[1] ? decodeHtml(title[1].replace(/<[^>]+>/g, "").trim()) : null;
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export function sortOffersByPrice(offers) {
  return [...offers].sort((a, b) => {
    const priceA = Number.isFinite(a.price) && a.price > 0 ? a.price : Infinity;
    const priceB = Number.isFinite(b.price) && b.price > 0 ? b.price : Infinity;
    return priceA - priceB || a.name.localeCompare(b.name);
  }).map((offer, index) => ({ ...offer, cheapest: index === 0 && Number.isFinite(offer.price) }));
}
