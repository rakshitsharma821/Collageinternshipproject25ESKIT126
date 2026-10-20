// Base Store Adapter Interface for GadgetVerse
// All store integrations implement this interface to ensure uniform comparison,
// availability verification, and transparent credential reporting.

export class BaseStoreAdapter {
  constructor(config = {}) {
    this.id = config.id || "unknown";
    this.name = config.name || "Unknown Store";
    this.mark = config.mark || this.name[0] || "?";
    this.color = config.color || "#5a5d66";
    this.domain = config.domain || "";
    this.requiredEnvVars = config.requiredEnvVars || [];
  }

  /**
   * Verifies whether all server-side credentials required for authorized API access are present.
   */
  isConfigured() {
    if (!this.requiredEnvVars.length) return true;
    return this.requiredEnvVars.every(
      (varName) => typeof process !== "undefined" && Boolean(process.env?.[varName])
    );
  }

  /**
   * Generates a direct search URL on the store for end-user navigation.
   */
  buildSearchUrl(query) {
    throw new Error(`buildSearchUrl must be implemented by adapter for ${this.name}`);
  }

  /**
   * Executes search for products matching the query.
   * Must return a normalized offer structure:
   * {
   *   store: string,
   *   name: string,
   *   mark: string,
   *   color: string,
   *   status: "verified" | "unverified" | "not_configured" | "unavailable" | "error",
   *   title: string | null,
   *   price: number | null,
   *   formattedPrice: string | null,
   *   currency: "INR",
   *   url: string,
   *   availability: "in_stock" | "out_of_stock" | "unknown",
   *   observedAt: string,
   *   error?: string
   * }
   */
  async search(query, options = {}) {
    throw new Error(`search must be implemented by adapter for ${this.name}`);
  }
}
