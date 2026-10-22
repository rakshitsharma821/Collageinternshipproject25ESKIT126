const storeHosts = new Set([
  "amazon.in", "www.amazon.in", "flipkart.com", "www.flipkart.com",
  "croma.com", "www.croma.com", "reliancedigital.in", "www.reliancedigital.in"
]);

export function isApprovedProductUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      storeHosts.has(url.hostname.toLowerCase()) &&
      url.pathname !== "/" &&
      !/\/(?:s|search|searchb)(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function filterAvailableOffers(offers, now = Date.now()) {
  return (Array.isArray(offers) ? offers : []).filter((offer) => {
    const observedAt = Date.parse(offer?.asOf);
    return offer?.status === "verified" &&
      offer.currency === "INR" &&
      Number.isFinite(offer.price) &&
      offer.price > 0 &&
      offer.availability === "in_stock" &&
      offer.matchEvidence?.exactIdentity === true &&
      typeof offer.title === "string" &&
      offer.title.trim().length > 0 &&
      typeof offer.source === "string" &&
      offer.source.trim().length > 0 &&
      offer.productUrl === offer.url &&
      isApprovedProductUrl(offer.productUrl) &&
      Number.isFinite(observedAt) &&
      observedAt <= now &&
      now - observedAt <= 24 * 60 * 60 * 1000;
  });
}
