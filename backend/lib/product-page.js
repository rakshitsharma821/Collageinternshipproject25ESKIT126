import { validateProductUrl } from "./compare.js";

const STORE_HOSTS = {
  amazon: new Set(["amazon.in", "www.amazon.in"]),
  flipkart: new Set(["flipkart.com", "www.flipkart.com"]),
  croma: new Set(["croma.com", "www.croma.com"]),
  reliance: new Set(["reliancedigital.in", "www.reliancedigital.in"])
};

export const PRODUCT_PAGE_AUTHORIZATION_VARS = {
  amazon: "AMAZON_PRODUCT_PAGE_ACCESS_AUTHORIZED",
  flipkart: "FLIPKART_PRODUCT_PAGE_ACCESS_AUTHORIZED",
  croma: "CROMA_PRODUCT_PAGE_ACCESS_AUTHORIZED",
  reliance: "RELIANCE_DIGITAL_PRODUCT_PAGE_ACCESS_AUTHORIZED"
};

function typeIncludes(value, expected) {
  const types = Array.isArray(value) ? value : [value];
  return types.some((type) =>
    typeof type === "string" && type.split(/[\/#]/).at(-1)?.toLowerCase() === expected.toLowerCase()
  );
}

function collectProducts(value, products = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectProducts(item, products));
    return products;
  }
  if (!value || typeof value !== "object") return products;

  if (typeIncludes(value["@type"], "Product")) products.push(value);
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage"]) {
    if (value[key]) collectProducts(value[key], products);
  }
  return products;
}

function collectOffers(value) {
  if (Array.isArray(value)) return value.flatMap(collectOffers);
  if (!value || typeof value !== "object") return [];
  if (typeIncludes(value["@type"], "AggregateOffer")) return [];
  if (typeIncludes(value["@type"], "Offer")) return [value];
  return [];
}

function availabilityFromSchema(value) {
  if (typeof value !== "string") return "unknown";
  const state = value.split(/[\/#]/).at(-1)?.toLowerCase();
  if (state === "instock" || state === "limitedavailability") return "in_stock";
  if (state === "outofstock" || state === "soldout") return "out_of_stock";
  return "unknown";
}

function isNewCondition(value) {
  return typeof value === "string" &&
    value.split(/[\/#]/).at(-1)?.toLowerCase() === "newcondition";
}

function getAttribute(tag, name) {
  const attributes = tag.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g);
  for (const attribute of attributes) {
    if (attribute[1].toLowerCase() === name.toLowerCase()) {
      return attribute[2] ?? attribute[3] ?? attribute[4] ?? "";
    }
  }
  return null;
}

function canonicalUrl(html, pageUrl) {
  const links = html.matchAll(/<link\b[^>]*>/gi);
  for (const link of links) {
    const tag = link[0];
    const rel = getAttribute(tag, "rel");
    if (!rel?.toLowerCase().split(/\s+/).includes("canonical")) continue;
    const href = getAttribute(tag, "href");
    if (!href) return null;
    try {
      return new URL(href, pageUrl).href;
    } catch {
      return null;
    }
  }
  return pageUrl;
}

function parseJsonLd(html) {
  const values = [];
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      values.push(JSON.parse(match[1].trim()));
    } catch {
      continue;
    }
  }
  return values.flatMap((value) => collectProducts(value));
}

export function isRetailerPageAccessAuthorized(retailerId, env = process.env) {
  const variable = PRODUCT_PAGE_AUTHORIZATION_VARS[retailerId];
  return Boolean(variable && String(env[variable] || "").toLowerCase() === "true");
}

export function parseRetailerProductPage(
  html,
  pageUrl,
  retailerId,
  observedAt = new Date().toISOString(),
  ageSeconds = null
) {
  if (typeof html !== "string" || !html.trim() || !STORE_HOSTS[retailerId]) return null;
  if (ageSeconds !== null && (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > 86400)) return null;
  const products = parseJsonLd(html);
  const pageCanonical = canonicalUrl(html, pageUrl);
  const validatedUrl = validateProductUrl(pageCanonical);
  if (
    !validatedUrl.valid ||
    validatedUrl.isShortLink ||
    !STORE_HOSTS[retailerId].has(validatedUrl.hostname) ||
    new URL(validatedUrl.url).pathname === "/" ||
    /\/(?:s|search|searchb)(?:\/|$)/i.test(new URL(validatedUrl.url).pathname)
  ) return null;

  for (const product of products) {
    if (typeof product.name !== "string" || !product.name.trim()) continue;
    for (const offer of collectOffers(product.offers)) {
      const price = Number(offer.price ?? offer.priceSpecification?.price);
      const currency = offer.priceCurrency ?? offer.priceSpecification?.priceCurrency;
      const availability = availabilityFromSchema(offer.availability);
      if (
        currency !== "INR" ||
        !Number.isFinite(price) ||
        price <= 0 ||
        !isNewCondition(offer.itemCondition) ||
        availability !== "in_stock"
      ) continue;

      return {
        retailerId,
        title: product.name.trim(),
        price,
        currency,
        availability,
        productUrl: validatedUrl.url,
        source: "Authorized retailer product-page structured data",
        observedAt,
        priceQualification: "Listed item price; delivery and checkout charges may vary."
      };
    }
  }
  return null;
}
