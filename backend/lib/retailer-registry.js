export const RETAILER_REGISTRY = [
  {
    id: "amazon",
    name: "Amazon India",
    categories: ["electronics", "marketplace", "fashion", "home", "appliances"],
    accessMethod: "Amazon Creators API",
    documentationUrl: "https://affiliate-program.amazon.com/creatorsapi/docs/en-us/onboarding/register-for-creators-api",
    automatedAccess: "permitted_official_api",
    credentialsRequired: [
      "Approved India Creators API account",
      "AMAZON_CREATORS_CLIENT_ID",
      "AMAZON_CREATORS_CLIENT_SECRET",
      "AMAZON_CREATORS_CREDENTIAL_VERSION",
      "AMAZON_PARTNER_TAG"
    ],
    implemented: true,
    configured: false,
    liveTested: false,
    productMatching: "Exact model-aware comparison and product-detail URL validation implemented",
    rateLimits: "Account-specific; confirm current limits in Amazon Creators API documentation/account.",
    limitations: "Offers depend on account approval, marketplace eligibility, API availability, and exact item/variant matching."
  },
  {
    id: "flipkart",
    name: "Flipkart",
    categories: ["electronics", "marketplace", "fashion", "home", "appliances"],
    accessMethod: "Flipkart Affiliate API",
    documentationUrl: "https://affiliate.flipkart.com/api-docs/index.html",
    automatedAccess: "official_affiliate_api_access_requires_affiliate_account",
    credentialsRequired: ["Active Flipkart Affiliate account and current API credentials from its portal"],
    implemented: false,
    configured: false,
    liveTested: false,
    productMatching: "Not implemented; API result shape and exact variant matching remain to be verified.",
    rateLimits: "Not verified; confirm current quota in the affiliate portal.",
    limitations: "Portal eligibility, API quotas, and current access conditions must be confirmed with Flipkart before implementation."
  },
  ...[
    {
      id: "croma",
      name: "Croma",
      categories: ["electronics", "appliances"],
      domain: "croma.com"
    },
    {
      id: "reliance",
      name: "Reliance Digital",
      categories: ["electronics", "appliances"],
      domain: "reliancedigital.in"
    },
    {
      id: "myntra",
      name: "Myntra",
      categories: ["fashion", "lifestyle"],
      domain: "myntra.com"
    },
    {
      id: "ajio",
      name: "AJIO",
      categories: ["fashion", "lifestyle"],
      domain: "ajio.com"
    },
    {
      id: "nykaa",
      name: "Nykaa",
      categories: ["beauty", "lifestyle"],
      domain: "nykaa.com"
    },
    {
      id: "meesho",
      name: "Meesho",
      categories: ["marketplace", "fashion", "home"],
      domain: "meesho.com"
    },
    {
      id: "tatacliq",
      name: "Tata CLiQ",
      categories: ["marketplace", "fashion", "electronics", "home"],
      domain: "tatacliq.com"
    },
    {
      id: "pepperfry",
      name: "Pepperfry",
      categories: ["home", "furniture"],
      domain: "pepperfry.com"
    }
  ].map((retailer) => ({
    ...retailer,
    accessMethod: "No first-party public product API/feed verified",
    documentationUrl: null,
    automatedAccess: "not_verified",
    credentialsRequired: ["Retailer-approved API or product feed access"],
    implemented: false,
    configured: false,
    liveTested: false,
    productMatching: "Not implemented.",
    rateLimits: "Not available; no authorized API/feed verified.",
    limitations: `No authorized automated product-data source has been verified for ${retailer.name}; do not scrape unless expressly authorized.`
  }))
];

export function getRetailerById(id) {
  return RETAILER_REGISTRY.find((retailer) => retailer.id === id) || null;
}
