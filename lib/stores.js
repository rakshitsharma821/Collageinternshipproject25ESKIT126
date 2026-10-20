// Store definitions and configuration for GadgetVerse Price Finder

export const STORES = [
  {
    id: "amazon",
    name: "Amazon",
    mark: "A",
    color: "#ff9900",
    urlPattern: "https://www.amazon.in/s?k=",
    buildSearchUrl: (query) => `https://www.amazon.in/s?k=${encodeURIComponent(query)}`
  },
  {
    id: "flipkart",
    name: "Flipkart",
    mark: "F",
    color: "#2874f0",
    urlPattern: "https://www.flipkart.com/search?q=",
    buildSearchUrl: (query) => `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`
  },
  {
    id: "croma",
    name: "Croma",
    mark: "C",
    color: "#00b5b5",
    urlPattern: "https://www.croma.com/searchB?q=",
    buildSearchUrl: (query) => `https://www.croma.com/searchB?q=${encodeURIComponent(query)}`
  }
];

export function getStoreById(storeId) {
  return STORES.find((s) => s.id === storeId) || null;
}

export function getAllStores() {
  return [...STORES];
}

// Universal browser export
if (typeof window !== "undefined") {
  window.GadgetStores = { STORES, getStoreById, getAllStores };
}
