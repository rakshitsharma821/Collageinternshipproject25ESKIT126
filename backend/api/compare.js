import { createHash } from "node:crypto";
import { createSupabaseClient, getSupabaseConfig } from "../lib/supabase.js";
import { defaultRegistry } from "../lib/adapters/registry.js";
import { parseAmazonHTML } from "../lib/adapters/amazon.js";
import { parseFlipkartHTML } from "../lib/adapters/flipkart.js";
import { parseCromaHTML } from "../lib/adapters/croma.js";
import { checkOfferComparability, extractProductAttributes } from "../lib/match.js";
import { extractProductName, getRetailerForHostname, resolveProductUrl, sortOffersByPrice, validateProductUrl } from "../lib/compare.js";
import { calculateVerdict, historyForChart, productHistoryKey } from "../lib/history.js";
import {
  isRetailerPageAccessAuthorized,
  parseRetailerProductPage,
  PRODUCT_PAGE_AUTHORIZATION_VARS
} from "../lib/product-page.js";

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;
export const DEFAULT_TIMEOUT_MS = 4500;
export const MAX_PRICE_AGE_MS = 24 * 60 * 60 * 1000;
const HISTORY_WINDOW_DAYS = 90;

const SUPPORTED_STORES = ["amazon", "flipkart", "croma", "reliance"];
const STORE_HOSTS = {
  amazon: new Set(["amazon.in", "www.amazon.in"]),
  flipkart: new Set(["flipkart.com", "www.flipkart.com"]),
  croma: new Set(["croma.com", "www.croma.com"]),
  reliance: new Set(["reliancedigital.in", "www.reliancedigital.in"])
};
const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

export const parseAmazon = parseAmazonHTML;
export const parseFlipkart = parseFlipkartHTML;
export const parseCroma = parseCromaHTML;

async function getCatalogMatch(client, name) {
  const { data, error } = await client
    .from("gadgets")
    .select("id, name, brand, review, rating")
    .ilike("name", name)
    .limit(10);
  if (error) throw error;
  const normalizedName = name.trim().toLocaleLowerCase();
  return (data || []).find((gadget) => gadget.name.trim().toLocaleLowerCase() === normalizedName) || null;
}

async function getHistory(client, productId) {
  const since = new Date(Date.now() - HISTORY_WINDOW_DAYS * 86400000).toISOString();
  const { data, error } = await client
    .from("price_observations")
    .select("store_id, price, product_url, availability, observed_at, metadata")
    .eq("product_id", productId)
    .eq("source_status", "verified")
    .eq("currency", "INR")
    .gte("observed_at", since)
    .order("observed_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  return (data || []).filter((row) =>
    row.metadata?.comparable === true &&
    row.metadata?.matchEvidence?.exactIdentity === true &&
    typeof row.metadata?.source === "string" &&
    row.metadata.source.trim().length > 0 &&
    ["in_stock", "out_of_stock"].includes(row.availability) &&
    validateProductUrl(row.product_url).valid &&
    Number.isFinite(Number(row.price)) &&
    Number(row.price) > 0 &&
    Number.isFinite(Date.parse(row.observed_at)) &&
    Date.parse(row.observed_at) <= Date.now()
  ).map((row) => ({
    store: row.store_id,
    price: Number(row.price),
    observedAt: row.observed_at
  }));
}

export function buildObservationId(productId, storeId, price, observedAt) {
  const day = new Date(observedAt).toISOString().slice(0, 10);
  const bytes = createHash("sha256").update(`${productId}\0${storeId}\0${price}\0${day}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function saveObservations(client, productId, offers) {
  const rows = offers
    .filter((offer) =>
      offer.status === "verified" &&
      Number.isFinite(offer.price) &&
      offer.price > 0 &&
      offer.currency === "INR" &&
      ["in_stock", "out_of_stock"].includes(offer.availability) &&
      offer.productUrl &&
      validateProductUrl(offer.productUrl).valid &&
      offer.source &&
      offer.matchEvidence?.exactIdentity === true &&
      Number.isFinite(Date.parse(offer.asOf)) &&
      Date.parse(offer.asOf) <= Date.now() &&
      Date.now() - Date.parse(offer.asOf) <= MAX_PRICE_AGE_MS
    )
    .map((offer) => ({
      id: buildObservationId(productId, offer.store, offer.price, offer.asOf),
      product_id: productId,
      store_id: offer.store,
      price: offer.price,
      currency: "INR",
      product_url: offer.productUrl,
      source_status: "verified",
      observed_at: offer.asOf,
      availability: offer.availability,
      metadata: { comparable: true, title: offer.title, source: offer.source, matchEvidence: offer.matchEvidence }
    }));
  if (!rows.length) return;

  for (const row of rows) {
    const { error } = await client
      .from("price_observations")
      .upsert(row, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
  }
}

export async function scrapeStore(store, query, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const adapter = defaultRegistry.get(store.id);
  if (!adapter) throw new Error(`No adapter registered for store id '${store.id}'`);
  return adapter.search(query, { fetchImpl, timeoutMs });
}

function jsonResponse(body, status = 200, headers = CORS_HEADERS) {
  return new Response(JSON.stringify(body), { status, headers });
}

export default async function handler(req, context = {}) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "GET") {
    return jsonResponse(
      { success: false, error: `Method ${req.method} not allowed` },
      405,
      { ...CORS_HEADERS, Allow: "GET, OPTIONS" }
    );
  }

  const url = new URL(req.url, "http://localhost");
  let query = (url.searchParams.get("q") || url.searchParams.get("name") || "").trim();
  const sourceUrl = (url.searchParams.get("url") || "").trim();
  let sourcePrice = null;
  let sourcePageData = null;

  if (!query && !sourceUrl) {
    return jsonResponse({ success: false, error: "Enter a product name or paste a supported store link." }, 400);
  }

  if (sourceUrl) {
    const sourceValidation = validateProductUrl(sourceUrl);
    if (!sourceValidation.valid) return jsonResponse({ success: false, error: sourceValidation.error }, 400);
    const retailerId = getRetailerForHostname(sourceValidation.hostname);
    if (!isRetailerPageAccessAuthorized(retailerId)) {
      return jsonResponse({
        success: false,
        error: `Direct retailer-page checks are disabled until you confirm permission for this retailer by setting ${PRODUCT_PAGE_AUTHORIZATION_VARS[retailerId]}=true on the backend. Use name search for configured official APIs.`
      }, 403);
    }
    try {
      const resolved = await resolveProductUrl(sourceUrl, (target, options) =>
        fetch(target, { ...options, signal: AbortSignal.timeout(6000) })
      );
      if (!resolved.valid) return jsonResponse({ success: false, error: resolved.error }, 400);
      query = query || extractProductName(resolved.html) || "";
      if (query.length > MAX_QUERY_LENGTH) {
        return jsonResponse({
          success: false,
          error: "The product title is longer than the supported search limit. Confirm a shorter name without removing its model number."
        }, 400);
      }
      if (!query) {
        return jsonResponse({
          success: false,
          needsConfirmation: true,
          sourceUrl: resolved.url,
          error: "We could not read the product name. Confirm its name before comparing prices."
        }, 422);
      }
      sourcePageData = parseRetailerProductPage(
        resolved.html,
        resolved.url,
        retailerId,
        new Date().toISOString(),
        resolved.ageSeconds
      );
      sourcePrice = sourcePageData?.price ?? null;
    } catch (error) {
      console.error("[api/compare] Product link request failed:", error.name);
      return jsonResponse({
        success: false,
        error: "The product page could not be opened. Try the product name instead."
      }, 502);
    }
  }

  if (query.length < MIN_QUERY_LENGTH) {
    return jsonResponse({ success: false, error: `Search query must be at least ${MIN_QUERY_LENGTH} characters long.` }, 400);
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return jsonResponse({ success: false, error: `Search query exceeds maximum length of ${MAX_QUERY_LENGTH} characters.` }, 400);
  }

  let supabaseConfig;
  try {
    supabaseConfig = getSupabaseConfig();
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error.message
    }, 503);
  }

  try {
    const adapters = SUPPORTED_STORES.map((id) => defaultRegistry.get(id)).filter(Boolean);
    const checks = await Promise.all(adapters.map(async (adapter) => {
      try {
        const result = await adapter.search(query, { timeoutMs: DEFAULT_TIMEOUT_MS });
        const match = typeof result.title === "string"
          ? checkOfferComparability(query, result.title)
          : { comparable: false, reason: "The retailer did not provide a product title to verify." };
        const productUrlValidation = typeof result.productUrl === "string"
          ? validateProductUrl(result.productUrl)
          : { valid: false };
        const isProductUrl = productUrlValidation.valid &&
          !productUrlValidation.isShortLink &&
          STORE_HOSTS[adapter.id]?.has(productUrlValidation.hostname) &&
          new URL(productUrlValidation.url).pathname !== "/" &&
          !/\/(?:s|search|searchb)(?:\/|$)/i.test(new URL(productUrlValidation.url).pathname);
        const timestamp = Date.parse(result.observedAt);
        const freshPrice = Number.isFinite(timestamp) &&
          timestamp <= Date.now() &&
          Date.now() - timestamp <= MAX_PRICE_AGE_MS;
        const hasVerifiedPrice = result.status === "verified" &&
          result.currency === "INR" &&
          Number.isFinite(result.price) &&
          result.price > 0 &&
          freshPrice &&
          result.availability === "in_stock" &&
          typeof result.source === "string" && result.source.trim().length > 0 &&
          isProductUrl &&
          match.comparable &&
          (!extractProductAttributes(query).modelIdentifiers.length ||
            match.offerAttributes.modelIdentifiers.length > 0);
        const exactProductFound = match.comparable && isProductUrl;
        const offer = hasVerifiedPrice ? {
          store: adapter.id,
          name: adapter.name,
          price: result.price,
          currency: "INR",
          priceQualification: result.priceQualification || "Listed item price; checkout total may vary.",
          url: productUrlValidation.url,
          productUrl: productUrlValidation.url,
          asOf: result.observedAt,
          title: result.title,
          availability: result.availability,
          source: result.source,
          matchEvidence: {
            exactIdentity: true,
            exactModel: match.queryAttributes.modelIdentifiers.length > 0,
            identifiers: match.queryAttributes.modelIdentifiers,
            matchedIdentifiers: match.offerAttributes.modelIdentifiers,
            brand: match.queryAttributes.brand,
            productType: match.queryAttributes.productType
          },
          status: "verified"
        } : null;
        return {
          offer,
          check: {
            store: adapter.id,
            name: adapter.name,
            status: offer ? "verified" : exactProductFound ? "exact_match_price_unverified" : result.status === "verified" ? "unverified_match" : (result.status || "unavailable"),
            reason: offer ? null : exactProductFound
              ? "The exact product matched, but current price and availability could not be verified."
              : result.error || match.reason || "No exact product with a current verified price was found.",
            productTitle: exactProductFound ? result.title : null,
            productUrl: exactProductFound ? productUrlValidation.url : null,
            exactProductFound,
            priceUnavailable: exactProductFound,
            searchUrl: adapter.buildSearchUrl(query)
          }
        };
      } catch (error) {
        console.error(`[api/compare] ${adapter.name} price lookup failed:`, error.name, error.message);
        return {
          offer: null,
          check: {
            store: adapter.id,
            name: adapter.name,
            status: "unavailable",
            reason: "The retailer could not be checked.",
            searchUrl: adapter.buildSearchUrl(query)
          }
        };
      }
    }));

    if (sourcePageData) {
      const match = checkOfferComparability(query, sourcePageData.title);
      const queryAttributes = extractProductAttributes(query);
      const modelEvidencePresent = !queryAttributes.modelIdentifiers.length ||
        match.offerAttributes.modelIdentifiers.length > 0;
      if (match.comparable && modelEvidencePresent) {
        const pageOffer = {
          store: sourcePageData.retailerId,
          name: defaultRegistry.get(sourcePageData.retailerId)?.name || sourcePageData.retailerId,
          price: sourcePageData.price,
          currency: sourcePageData.currency,
          priceQualification: sourcePageData.priceQualification,
          url: sourcePageData.productUrl,
          productUrl: sourcePageData.productUrl,
          asOf: sourcePageData.observedAt,
          title: sourcePageData.title,
          availability: sourcePageData.availability,
          source: sourcePageData.source,
          matchEvidence: {
            exactIdentity: true,
            exactModel: queryAttributes.modelIdentifiers.length > 0,
            identifiers: queryAttributes.modelIdentifiers,
            matchedIdentifiers: match.offerAttributes.modelIdentifiers,
            brand: queryAttributes.brand,
            productType: queryAttributes.productType
          },
          status: "verified"
        };
        checks.push({
          offer: pageOffer,
          check: {
            store: pageOffer.store,
            name: pageOffer.name,
            status: "verified",
            reason: null,
            productTitle: pageOffer.title,
            productUrl: pageOffer.productUrl,
            exactProductFound: true,
            priceUnavailable: false,
            searchUrl: defaultRegistry.get(pageOffer.store)?.buildSearchUrl(query) || pageOffer.productUrl
          },
          sourcePageOffer: true
        });
      } else {
        sourcePrice = null;
      }
    }

    const offers = sortOffersByPrice(checks.flatMap(({ offer, sourcePageOffer }) => {
      if (!offer || (sourcePageData?.retailerId === offer.store && !sourcePageOffer)) {
        return [];
      }
      return [offer];
    }));
    const client = context.supabaseClient || (supabaseConfig
      ? createSupabaseClient(supabaseConfig)
      : null);
    let gadget = null;
    let productId = productHistoryKey(query);
    let history = [];
    let dataMessage = client
      ? null
      : "Catalog and price history are unavailable until Supabase is configured.";

    if (client) {
      gadget = await getCatalogMatch(client, query);
      if (gadget) productId = gadget.id;
      history = await getHistory(client, productId);
    }

    const priorPrices = history
      .map((point) => point.price)
      .filter((price) => Number.isFinite(price) && price > 0);
    const previousPrice = priorPrices.length ? Math.min(...priorPrices) : null;
    if (client) {
      await saveObservations(client, productId, offers);
      history = await getHistory(client, productId);
    }
    const combinedHistory = historyForChart(history);
    const cheapest = offers.find((offer) =>
      offer.status === "verified" &&
      offer.price !== null &&
      offer.availability === "in_stock"
    ) || null;
    const historyStats = {
      count: combinedHistory.length,
      daysCovered: combinedHistory.length > 1
        ? Math.floor((Date.parse(combinedHistory.at(-1).observedAt) - Date.parse(combinedHistory[0].observedAt)) / 86400000)
        : 0
    };

    if (!cheapest) {
      dataMessage = [dataMessage, "No verified offers available right now."]
        .filter(Boolean)
        .join(" ");
    }

    return jsonResponse({
      success: true,
      query,
      sourcePrice,
      productId,
      cheapest,
      previousPrice,
      priceDrop: cheapest !== null && previousPrice !== null && cheapest.price < previousPrice,
      offers,
      retailerChecks: checks.map(({ check }) => check),
      history: combinedHistory,
      historyStats,
      verdict: calculateVerdict(combinedHistory, cheapest?.price, { currentObservedAt: cheapest?.asOf }),
      gadget,
      fetchedAt: new Date().toISOString(),
      dataMessage
    });
  } catch (error) {
    console.error("[api/compare] Comparison integration failed:", error.code || error.name, error.message);
    return jsonResponse({
      success: false,
      error: "Comparison data could not be loaded or saved. Check retailer configuration and Supabase schema."
    }, 502);
  }
}
