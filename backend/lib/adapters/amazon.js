import { BaseStoreAdapter } from "./base.js";
import { parsePrice, formatPriceINR, calculateSimilarity, checkOfferComparability } from "../match.js";
import { validateProductUrl } from "../compare.js";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
export const AMAZON_CREATORS_API_URL = "https://creatorsapi.amazon/catalog/v1/searchItems";
const AMAZON_TOKEN_ENDPOINT = "https://api.amazon.co.uk/auth/o2/token";
const AMAZON_MARKETPLACE = "www.amazon.in";
const AMAZON_CREDENTIAL_VERSION = "3.2";
const MAX_INR_PRICE = 99999999.99;

export function parseAmazonHTML(html, query) {
  if (!html || typeof html !== "string") return null;

  if (
    html.includes("Robot Check") ||
    html.includes("api-services-support@amazon.com") ||
    html.includes("Type the characters you see in this image")
  ) {
    return { error: "Amazon anti-bot verification challenge triggered", blocked: true };
  }

  const offscreenMatches = [...html.matchAll(/class="a-offscreen">([^<]+)<\/span>/g)].map((m) => m[1]);
  const wholeMatches = [...html.matchAll(/a-price-whole">([0-9,]+)/g)].map((m) => m[1]);

  let price = null;
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

  // Extract direct product URL if present
  let directProductUrl = null;
  const dpMatch = html.match(/href="([^"]*(?:\/dp\/[A-Z0-9]{10})[^"]*)"/i);
  if (dpMatch) {
    let cleanHref = dpMatch[1].split("?")[0];
    if (cleanHref.startsWith("/")) cleanHref = `https://www.amazon.in${cleanHref}`;
    directProductUrl = cleanHref;
  }

  return { price, title: bestTitle, directProductUrl };
}

function getAmazonItemTitle(item) {
  const title = item?.itemInfo?.title;
  if (typeof title?.displayValue === "string") return title.displayValue.trim();
  if (Array.isArray(title?.displayValues)) {
    return title.displayValues.find((value) => typeof value === "string")?.trim() || "";
  }
  return "";
}

export function parseAmazonCreatorsResponse(payload, query, observedAt = new Date().toISOString()) {
  const items = payload?.searchResult?.items || payload?.itemsResult?.items || [];
  const exactItems = items.filter((item) => {
    const title = getAmazonItemTitle(item);
    const match = title ? checkOfferComparability(query, title) : null;
    const product = validateProductUrl(item?.detailPageURL);
    return match?.comparable &&
      product.valid &&
      product.hostname === "www.amazon.in" &&
      /^\/dp\/[A-Z0-9]{10}\/?$/i.test(new URL(product.url).pathname);
  });
  const offers = [];

  for (const item of exactItems) {
    const title = getAmazonItemTitle(item);
    const productUrl = validateProductUrl(item.detailPageURL).url;
    const listings = Array.isArray(item.offersV2?.listings) ? item.offersV2.listings : [];
    for (const listing of listings) {
      const money = listing?.price?.money;
      const price = Number(money?.amount);
      const availabilityType = listing?.availability?.type;
      if (
        listing?.condition?.value?.toLowerCase() !== "new" ||
        money?.currency !== "INR" ||
        !Number.isFinite(price) ||
        price <= 0 ||
        price > MAX_INR_PRICE ||
        !["IN_STOCK", "OUT_OF_STOCK"].includes(availabilityType)
      ) continue;
      offers.push({
        title,
        price,
        formattedPrice: formatPriceINR(price),
        currency: "INR",
        availability: availabilityType === "IN_STOCK" ? "in_stock" : "out_of_stock",
        productUrl,
        seller: listing.merchantInfo?.name || null,
        observedAt
      });
    }
  }

  offers.sort((a, b) =>
    Number(b.availability === "in_stock") - Number(a.availability === "in_stock") ||
    a.price - b.price
  );
  if (offers.length) return { ...offers[0], status: "verified" };
  if (exactItems.length) {
    const item = exactItems[0];
    return {
      status: "unavailable",
      title: getAmazonItemTitle(item),
      productUrl: validateProductUrl(item.detailPageURL).url,
      price: null,
      currency: "INR",
      availability: "unknown",
      observedAt,
      error: "Amazon returned the exact product without a current new INR offer and known availability."
    };
  }
  return {
    status: "no_results",
    title: null,
    productUrl: null,
    price: null,
    currency: "INR",
    availability: "unknown",
    observedAt,
    error: "Amazon Creators API did not return an exact matching product."
  };
}

export class AmazonAdapter extends BaseStoreAdapter {
  constructor(config = {}) {
    super({
      id: "amazon",
      name: "Amazon",
      mark: "A",
      color: "#ff9900",
      domain: "amazon.in",
      requiredEnvVars: [
        "AMAZON_CREATORS_CLIENT_ID",
        "AMAZON_CREATORS_CLIENT_SECRET",
        "AMAZON_CREATORS_CREDENTIAL_VERSION",
        "AMAZON_PARTNER_TAG"
      ],
      ...config
    });
    this.customFetch = config.fetchImpl || null;
    this.cachedToken = null;
  }

  isConfigured() {
    return typeof process !== "undefined" &&
      Boolean(process.env?.AMAZON_CREATORS_CLIENT_ID) &&
      Boolean(process.env?.AMAZON_CREATORS_CLIENT_SECRET) &&
      process.env?.AMAZON_CREATORS_CREDENTIAL_VERSION === AMAZON_CREDENTIAL_VERSION &&
      Boolean(process.env?.AMAZON_PARTNER_TAG);
  }

  buildSearchUrl(query) {
    return `https://www.amazon.in/s?k=${encodeURIComponent(query)}`;
  }

  async search(query, options = {}) {
    const searchUrl = this.buildSearchUrl(query);
    const fetchImpl = options.fetchImpl || this.customFetch || fetch;
    const timeoutMs = options.timeoutMs || 4500;
    const credentials = {
      clientId: process.env?.AMAZON_CREATORS_CLIENT_ID,
      clientSecret: process.env?.AMAZON_CREATORS_CLIENT_SECRET,
      credentialVersion: process.env?.AMAZON_CREATORS_CREDENTIAL_VERSION,
      partnerTag: process.env?.AMAZON_PARTNER_TAG
    };

    if (!this.isConfigured()) {
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
        observedAt: new Date().toISOString(),
        error: "Amazon Creators API requires AMAZON_CREATORS_CLIENT_ID, AMAZON_CREATORS_CLIENT_SECRET, AMAZON_CREATORS_CREDENTIAL_VERSION=3.2, and an India Associates AMAZON_PARTNER_TAG."
      };
    }

    try {
      const requestJson = async (url, request) => {
        const response = await fetchImpl(url, {
          ...request,
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (!response.ok) {
          const error = new Error(`Amazon API returned HTTP ${response.status}`);
          error.status = response.status;
          throw error;
        }
        return response.json();
      };
      let token = this.cachedToken?.expiresAt > Date.now() + 60000
        ? this.cachedToken.value
        : null;
      if (!token) {
        const tokenResponse = await requestJson(AMAZON_TOKEN_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant_type: "client_credentials",
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            scope: "creatorsapi::default"
          })
        });
        if (
          typeof tokenResponse.access_token !== "string" ||
          !tokenResponse.access_token ||
          String(tokenResponse.token_type || "bearer").toLowerCase() !== "bearer"
        ) {
          throw new Error("Amazon returned an invalid Creators API access token response.");
        }
        token = tokenResponse.access_token;
        const expiresIn = Number(tokenResponse.expires_in);
        this.cachedToken = {
          value: token,
          expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 300) * 1000
        };
      }

      const apiResponse = await requestJson(AMAZON_CREATORS_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "x-marketplace": AMAZON_MARKETPLACE
        },
        body: JSON.stringify({
          keywords: query,
          marketplace: AMAZON_MARKETPLACE,
          partnerTag: credentials.partnerTag,
          itemCount: 10,
          resources: [
            "itemInfo.title",
            "offersV2.listings.price",
            "offersV2.listings.availability",
            "offersV2.listings.condition"
          ]
        })
      });
      const parsed = parseAmazonCreatorsResponse(apiResponse, query);
      const isVerified = parsed.status === "verified";
      return {
        store: this.id,
        name: this.name,
        mark: this.mark,
        color: this.color,
        status: parsed.status,
        verificationStatus: isVerified ? "verified" : "unverified",
        title: parsed.title,
        price: parsed.price,
        formattedPrice: parsed.formattedPrice || null,
        currency: parsed.currency,
        url: parsed.productUrl || searchUrl,
        productUrl: parsed.productUrl || null,
        searchUrl,
        source: isVerified ? "Amazon Creators API" : null,
        availability: parsed.availability,
        seller: parsed.seller ? { name: parsed.seller, verified: true } : null,
        observedAt: parsed.observedAt,
        error: parsed.error || null
      };
    } catch (err) {
      const isTimeout = err.name === "AbortError" || err.name === "TimeoutError";
      const authFailure = err.status === 401 || err.status === 403;
      return {
        store: this.id,
        name: this.name,
        mark: this.mark,
        color: this.color,
        status: isTimeout ? "timeout" : authFailure ? "auth_error" : "unavailable",
        verificationStatus: "unverified",
        title: null,
        price: null,
        formattedPrice: null,
        currency: "INR",
        url: searchUrl,
        productUrl: null,
        searchUrl,
        availability: "unknown",
        observedAt: new Date().toISOString(),
        error: isTimeout
          ? "Amazon Creators API request timed out."
          : authFailure
            ? "Amazon Creators API rejected access. Verify marketplace approval, credential version, and partner tag."
            : err.status
              ? `Amazon Creators API returned HTTP ${err.status}.`
              : "Amazon Creators API could not be reached or returned invalid JSON."
      };
    }
  }
}
