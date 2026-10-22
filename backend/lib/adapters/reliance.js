import { BaseStoreAdapter } from "./base.js";
import { formatPriceINR } from "../match.js";

export class RelianceDigitalAdapter extends BaseStoreAdapter {
  constructor(config = {}) {
    super({
      id: "reliance",
      name: "Reliance Digital",
      mark: "R",
      color: "#e42529",
      domain: "reliancedigital.in",
      requiredEnvVars: ["RELIANCE_DIGITAL_API_KEY"],
      ...config
    });
    this.customFetch = config.fetchImpl || null;
  }

  buildSearchUrl(query) {
    return `https://www.reliancedigital.in/search?q=${encodeURIComponent(query)}`;
  }

  async search(query, options = {}) {
    const searchUrl = this.buildSearchUrl(query);
    const now = new Date().toISOString();

    if (!this.customFetch && !options.fetchImpl) {
      return {
        store: this.id,
        name: this.name,
        mark: this.mark,
        color: this.color,
        status: "not_configured",
        integrationStatus: "missing_credentials",
        title: null,
        price: null,
        formattedPrice: null,
        currency: "INR",
        url: searchUrl,
        productUrl: null,
        searchUrl,
        availability: "unknown",
        observedAt: now,
        error: this.isConfigured()
          ? "Reliance Digital partner credentials are present, but the authorized API connector is not implemented. No storefront request was made."
          : "Reliance Digital official partner API is not configured (RELIANCE_DIGITAL_API_KEY). Direct search URL provided."
      };
    }

    try {
      const fetchImpl = options.fetchImpl || this.customFetch || fetch;
      const res = await fetchImpl(searchUrl);
      if (!res.ok) {
        return {
          store: this.id,
          name: this.name,
          mark: this.mark,
          color: this.color,
          status: "unavailable",
          integrationStatus: "temporarily_unavailable",
          title: null,
          price: null,
          formattedPrice: null,
          currency: "INR",
          url: searchUrl,
          productUrl: null,
          searchUrl,
          availability: "unknown",
          observedAt: now,
          error: `Reliance Digital returned HTTP status ${res.status}`
        };
      }
      return {
        store: this.id,
        name: this.name,
        mark: this.mark,
        color: this.color,
        status: "no_results",
        integrationStatus: "pending_approval",
        title: null,
        price: null,
        formattedPrice: null,
        currency: "INR",
        url: searchUrl,
        productUrl: null,
        searchUrl,
        availability: "unknown",
        observedAt: now,
        error: "Reliance Digital requires verified enterprise API token for catalog queries."
      };
    } catch (err) {
      return {
        store: this.id,
        name: this.name,
        mark: this.mark,
        color: this.color,
        status: "error",
        integrationStatus: "temporarily_unavailable",
        title: null,
        price: null,
        formattedPrice: null,
        currency: "INR",
        url: searchUrl,
        productUrl: null,
        searchUrl,
        availability: "unknown",
        observedAt: now,
        error: err.message || "Failed to query Reliance Digital"
      };
    }
  }
}
