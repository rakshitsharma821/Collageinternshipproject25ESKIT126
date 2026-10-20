// GadgetVerse Live Catalog, Price Comparison, and Search Engine

const TILE_ICONS = {
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="6" y1="18" x2="18" y2="18"/><circle cx="12" cy="20" r=".6" fill="currentColor" stroke="none"/></svg>`,
  laptop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M1 20h22l-2-4H3l-2 4Z"/></svg>`,
  watch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="7" y="7" width="10" height="10" rx="2.5"/><path d="M9 7V4h6v3M9 17v3h6v-3"/></svg>`,
  earbuds: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 11v4a2.5 2.5 0 0 0 5 0V8a5 5 0 0 1 10 0v3"/><rect x="15" y="11" width="4" height="6" rx="1.5"/><rect x="5" y="11" width="4" height="7" rx="1.5"/></svg>`,
  tv: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="4" width="20" height="13" rx="2"/><line x1="9" y1="21" x2="15" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`
};

const CATEGORY_LABELS = {
  phone: "Smartphones",
  laptop: "Laptops",
  watch: "Smart Watches",
  earbuds: "Earbuds",
  tv: "TVs"
};

window.TILE_ICONS = TILE_ICONS;
window.CATEGORY_LABELS = CATEGORY_LABELS;

// Global catalog storage (populated dynamically)
window.GADGETS = [];

let __ringUid = 0;
function buildRing(score, size = 52) {
  const num = typeof score === "number" && !isNaN(score) ? score : 8.5;
  const pct = Math.max(0, Math.min(10, num)) / 10;
  const circumference = 175;
  const offset = circumference - pct * circumference;
  const gradId = `ringGrad${++__ringUid}`;
  return `
    <div class="ring-badge" style="width:${size}px;height:${size}px" data-score="${num}">
      <svg viewBox="0 0 64 64">
        <defs>
          <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0f766e"/>
            <stop offset="100%" stop-color="#15803d"/>
          </linearGradient>
        </defs>
        <circle class="ring-track" cx="32" cy="32" r="27.9"></circle>
        <circle class="ring-fill" cx="32" cy="32" r="27.9" style="stroke:url(#${gradId})" data-offset="${offset}"></circle>
      </svg>
      <div class="ring-label"><b>${num.toFixed(1)}</b><span>SCORE</span></div>
    </div>`;
}

function animateRings(scope = document) {
  scope.querySelectorAll(".ring-fill").forEach((circle) => {
    const offset = circle.getAttribute("data-offset");
    requestAnimationFrame(() => {
      circle.style.strokeDashoffset = offset;
    });
  });
}

function photoURL(seed, category, w = 700, h = 525) {
  const item = (window.GADGETS || []).find((g) => g.id === seed);
  if (item && item.image_url) return item.image_url;
  return `https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=${w}&auto=format&fit=crop&q=80`;
}
window.photoURL = photoURL;

// Concurrency limiter for background store price requests
class QueueLimiter {
  constructor(limit = 2) {
    this.limit = limit;
    this.active = 0;
    this.queue = [];
  }
  async add(fn) {
    if (this.active >= this.limit) {
      await new Promise((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next();
      }
    }
  }
}
const priceLimiter = new QueueLimiter(2);

// Fetch live catalog from Supabase or Netlify Function or local json
let catalogPromise = null;
async function fetchCatalog() {
  if (Array.isArray(window.GADGETS) && window.GADGETS.length > 0) {
    return window.GADGETS;
  }
  if (catalogPromise) return catalogPromise;

  catalogPromise = (async () => {
    // 1. Session storage cache (10 min TTL)
    if (window.GadgetCache) {
      const cached = window.GadgetCache.readStorageCache(sessionStorage, "gv:catalog");
      if (Array.isArray(cached) && cached.length > 0) {
        window.GADGETS = cached;
        return cached;
      }
    }

    // 2. Direct Supabase query if client available
    if (window.supabaseClient) {
      try {
        const { data, error } = await window.supabaseClient.from("gadgets").select("*");
        if (!error && Array.isArray(data) && data.length > 0) {
          window.GADGETS = data;
          if (window.GadgetCache) {
            window.GadgetCache.writeStorageCache(sessionStorage, "gv:catalog", data);
          }
          return data;
        }
      } catch (err) {
        console.warn("Direct Supabase query failed, falling back to API:", err);
      }
    }

    // 3. /api/gadgets endpoint
    try {
      const res = await fetch("/api/gadgets");
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          window.GADGETS = json.data;
          if (window.GadgetCache) {
            window.GadgetCache.writeStorageCache(sessionStorage, "gv:catalog", json.data);
          }
          return json.data;
        }
      }
    } catch (err) {
      console.warn("API /api/gadgets unreachable, trying static fallback:", err);
    }

    // 4. Static fallback to data/gadgets.json
    try {
      const res = await fetch("data/gadgets.json");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          window.GADGETS = data;
          if (window.GadgetCache) {
            window.GadgetCache.writeStorageCache(sessionStorage, "gv:catalog", data);
          }
          return data;
        }
      }
    } catch (err) {
      console.error("Failed to load catalog data:", err);
    }

    return window.GADGETS || [];
  })();

  return catalogPromise;
}

// Fetch price comparison for a given gadget
const priceMap = new Map();
async function fetchPricesForGadget(gadget) {
  if (priceMap.has(gadget.id)) return priceMap.get(gadget.id);

  const cacheKey = `gv:price:${gadget.id}`;
  if (window.GadgetCache) {
    const cached = window.GadgetCache.readStorageCache(sessionStorage, cacheKey);
    if (cached) {
      priceMap.set(gadget.id, cached);
      return cached;
    }
  }

  const promise = priceLimiter.add(async () => {
    try {
      const res = await fetch(`/api/compare?q=${encodeURIComponent(gadget.name)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          if (window.GadgetCache) {
            window.GadgetCache.writeStorageCache(sessionStorage, cacheKey, json);
          }
          priceMap.set(gadget.id, json);
          return json;
        }
      }
    } catch {
      // Fallback below
    }

    // Default store search links if API is offline
    const fallback = {
      query: gadget.name,
      cheapest: null,
      offers: [
        {
          store: "amazon",
          name: "Amazon",
          mark: "A",
          color: "#ff9900",
          url: `https://www.amazon.in/s?k=${encodeURIComponent(gadget.name)}`
        },
        {
          store: "flipkart",
          name: "Flipkart",
          mark: "F",
          color: "#2874f0",
          url: `https://www.flipkart.com/search?q=${encodeURIComponent(gadget.name)}`
        },
        {
          store: "croma",
          name: "Croma",
          mark: "C",
          color: "#00b5b5",
          url: `https://www.croma.com/searchB?q=${encodeURIComponent(gadget.name)}`
        }
      ]
    };
    priceMap.set(gadget.id, fallback);
    return fallback;
  });

  return promise;
}

function productCardHTML(g) {
  const isWished = typeof WishlistStore !== "undefined" && WishlistStore.has(g.id);
  const imgUrl = g.image_url || photoURL(g.id, g.category);

  return `
  <article class="product-card card-3d glass reveal" data-id="${g.id}" data-category="${g.category}">
    <div class="card-inner-3d">
      <div class="card-media grad-${g.category}">
        <img class="media-photo" src="${imgUrl}" alt="${g.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=700&auto=format&fit=crop&q=80'">
        <button class="wish-btn ${isWished ? "active" : ""}" data-wish="${g.id}" aria-label="Toggle wishlist">
          <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.35-9.5-8.5C0.7 8 2 4.5 5.5 4.5c2 0 3.5 1.2 4.5 2.7C11 5.7 12.5 4.5 14.5 4.5 18 4.5 19.3 8 19.5 11.5 17 15.65 12 20 12 20Z"/></svg>
        </button>
        ${buildRing(g.rating || 8.5, 52)}
      </div>
      <div class="card-body">
        <div class="card-header-meta">
          <span class="card-brand">${g.brand}</span>
          <span class="card-category-tag">${CATEGORY_LABELS[g.category] || g.category}</span>
        </div>
        <h3 class="card-title">${g.name}</h3>
        <p class="card-review">${g.review || ""}</p>
        
        <div class="card-price-slot" data-price-slot="${g.id}">
          <div class="price-skeleton">Checking store prices...</div>
        </div>

        <div class="card-actions">
          <button class="btn btn-ghost btn-sm btn-block" data-details="${g.id}">Compare Prices</button>
          <button class="btn btn-primary btn-sm btn-block" data-wish="${g.id}">${isWished ? "Wishlisted" : "Add to Wishlist"}</button>
        </div>
      </div>
    </div>
  </article>`;
}

function updateCardPriceUI(cardEl, priceData) {
  const slot = cardEl.querySelector(".card-price-slot");
  if (!slot) return;

  if (priceData && priceData.cheapest && priceData.cheapest.price) {
    const formatted = window.GadgetMatch ? window.GadgetMatch.formatPriceINR(priceData.cheapest.price) : `₹${priceData.cheapest.price.toLocaleString("en-IN")}`;
    slot.innerHTML = `
      <div class="price-row">
        <span class="price-val mono">${formatted}</span>
        <span class="cheapest-badge" style="background:${priceData.cheapest.color || "#15803d"}">Cheapest on ${priceData.cheapest.name}</span>
      </div>
      <div class="store-links-mini">
        ${(priceData.offers || []).map((o) => `
          <a href="${o.url}" target="_blank" rel="noopener noreferrer" class="store-chip-mini" title="${o.name}: ${o.price ? (window.GadgetMatch ? window.GadgetMatch.formatPriceINR(o.price) : '₹' + o.price) : (o.error || 'Check price')}">
            <span class="store-mark" style="background:${o.color || '#5a5d66'}">${o.mark || o.name[0]}</span>
            <span class="store-price-text">${o.price ? (window.GadgetMatch ? window.GadgetMatch.formatPriceINR(o.price) : '₹' + o.price) : 'Compare'}</span>
          </a>
        `).join("")}
      </div>
    `;
  } else {
    // Show store search buttons
    slot.innerHTML = `
      <div class="price-row">
        <span class="price-fallback-label">Compare live prices:</span>
      </div>
      <div class="store-links-mini">
        ${(priceData.offers || []).map((o) => `
          <a href="${o.url}" target="_blank" rel="noopener noreferrer" class="store-chip-mini" title="Search on ${o.name}">
            <span class="store-mark" style="background:${o.color || '#5a5d66'}">${o.mark || o.name[0]}</span>
            <span class="store-name-text">${o.name}</span>
          </a>
        `).join("")}
      </div>
    `;
  }
}

function populateCardPrices(container) {
  container.querySelectorAll("[data-price-slot]").forEach((slot) => {
    const id = slot.getAttribute("data-price-slot");
    const gadget = (window.GADGETS || []).find((g) => g.id === id);
    if (!gadget) return;

    fetchPricesForGadget(gadget).then((data) => {
      const card = slot.closest(".product-card");
      if (card) updateCardPriceUI(card, data);
    });
  });
}

function wireWishlistButtons(scope = document) {
  scope.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-wish]");
    if (!btn) return;
    const id = btn.getAttribute("data-wish");
    if (typeof WishlistStore !== "undefined") {
      WishlistStore.toggle(id);
      if (typeof refreshWishlistBadges === "function") refreshWishlistBadges();
      document.querySelectorAll(`[data-wish="${id}"]`).forEach((b) => {
        const active = WishlistStore.has(id);
        b.classList.toggle("active", active);
        if (b.classList.contains("btn")) b.textContent = active ? "Wishlisted" : "Add to Wishlist";
      });
      showToast(WishlistStore.has(id) ? "Added to wishlist" : "Removed from wishlist");
    }
  });
}

function showToast(msg) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg><span></span>`;
    document.body.appendChild(toast);
  }
  toast.querySelector("span").textContent = msg;
  toast.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function wireDetailsModal(scope = document) {
  const modal = document.getElementById("detailsModal");
  if (!modal) return;

  scope.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-details]");
    if (!btn) return;
    const id = btn.getAttribute("data-details");
    const g = (window.GADGETS || []).find((x) => x.id === id);
    if (!g) return;

    if (typeof RecentStore !== "undefined") RecentStore.add(g.id);

    const iconEl = modal.querySelector(".modal-icon");
    if (iconEl) {
      iconEl.innerHTML = `<img class="media-photo" src="${g.image_url || photoURL(g.id, g.category, 800, 500)}" alt="${g.name}">`;
      iconEl.className = `modal-icon grad-${g.category}`;
    }

    const nameEl = modal.querySelector(".modal-name");
    if (nameEl) nameEl.textContent = g.name;

    const brandEl = modal.querySelector(".modal-brand");
    if (brandEl) brandEl.textContent = `${g.brand} · ${CATEGORY_LABELS[g.category] || g.category}`;

    const reviewEl = modal.querySelector(".modal-review");
    if (reviewEl) reviewEl.textContent = g.review || "";

    const ringEl = modal.querySelector(".modal-ring");
    if (ringEl) ringEl.innerHTML = buildRing(g.rating || 8.5, 74);

    const wishBtn = modal.querySelector("[data-wish]");
    if (wishBtn) {
      wishBtn.setAttribute("data-wish", g.id);
      wishBtn.textContent = typeof WishlistStore !== "undefined" && WishlistStore.has(g.id) ? "Wishlisted" : "Add to Wishlist";
    }

    const priceContainer = modal.querySelector(".modal-price");
    if (priceContainer) {
      priceContainer.innerHTML = `<div class="loading-offers">Fetching store prices...</div>`;
    }

    modal.classList.add("open");
    animateRings(modal);

    // Fetch live prices and populate comparison table
    const priceData = await fetchPricesForGadget(g);
    if (priceContainer && modal.classList.contains("open")) {
      let offersHTML = "";
      if (priceData && priceData.offers && priceData.offers.length > 0) {
        offersHTML = `
          <div class="comparison-table-wrap">
            <h4 class="comparison-heading">Live Store Price Comparison</h4>
            <div class="comparison-offers-list">
              ${priceData.offers.map((offer) => {
                const isBest = offer.best;
                const formattedPrice = offer.price ? (window.GadgetMatch ? window.GadgetMatch.formatPriceINR(offer.price) : `₹${offer.price.toLocaleString("en-IN")}`) : (offer.error || "Check live price");
                return `
                  <div class="comparison-row ${isBest ? 'best-offer' : ''}">
                    <div class="offer-store">
                      <span class="offer-badge" style="background:${offer.color || '#5a5d66'}">${offer.mark || offer.name[0]}</span>
                      <strong>${offer.name}</strong>
                    </div>
                    <div class="offer-price-col">
                      <span class="offer-price mono">${formattedPrice}</span>
                      ${offer.youSave > 0 ? `<span class="offer-savings">Save ${window.GadgetMatch ? window.GadgetMatch.formatPriceINR(offer.youSave) : '₹' + offer.youSave}</span>` : ''}
                      ${isBest ? `<span class="cheapest-pill">Lowest Price</span>` : ''}
                    </div>
                    <div class="offer-action">
                      <a href="${offer.url}" target="_blank" rel="noopener noreferrer" class="btn btn-sm ${isBest ? 'btn-primary' : 'btn-ghost'}">
                        Visit ${offer.name}
                      </a>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
            ${priceData.fetchedAt ? `<div class="observed-timestamp">Observed: ${new Date(priceData.fetchedAt).toLocaleTimeString()}</div>` : ''}
          </div>
        `;
      } else {
        offersHTML = `<div class="no-offers">Store price data currently unavailable.</div>`;
      }
      priceContainer.innerHTML = offersHTML;
    }
  });

  modal.querySelector(".lightbox-close")?.addEventListener("click", () => modal.classList.remove("open"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("open");
  });
}

async function initProductsPage() {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  grid.innerHTML = `<div class="loading-state" style="grid-column:1/-1;text-align:center;padding:48px 0">Loading products...</div>`;

  await fetchCatalog();

  const searchInput = document.getElementById("productSearch");
  const chips = document.querySelectorAll(".filter-chip");
  const resultsMeta = document.getElementById("resultsMeta");
  let activeCategory = "all";

  const params = new URLSearchParams(location.search);
  const urlCat = params.get("cat");
  const urlSearch = params.get("search");
  if (urlSearch && searchInput) searchInput.value = urlSearch;
  if (urlCat && (CATEGORY_LABELS[urlCat] || urlCat === "all")) {
    activeCategory = urlCat;
    chips.forEach((c) => c.classList.toggle("active", c.getAttribute("data-cat") === urlCat));
  }

  function render() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const filtered = (window.GADGETS || []).filter((g) => {
      const matchesCat = activeCategory === "all" || g.category === activeCategory;
      const matchesTerm =
        !term ||
        g.name.toLowerCase().includes(term) ||
        g.brand.toLowerCase().includes(term) ||
        (CATEGORY_LABELS[g.category] || "").toLowerCase().includes(term);
      return matchesCat && matchesTerm;
    });

    if (resultsMeta) {
      resultsMeta.textContent = `${filtered.length} gadget${filtered.length !== 1 ? "s" : ""} found`;
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
          <p>No gadgets match "<strong>${term || CATEGORY_LABELS[activeCategory] || ""}</strong>". Try a different search or filter.</p>
        </div>`;
      return;
    }

    grid.innerHTML = filtered.map(productCardHTML).join("");
    animateRings(grid);
    if (typeof revealNow === "function") revealNow(grid);
    populateCardPrices(grid);
    if (typeof initTiltEffects === "function") initTiltEffects(grid);
  }

  searchInput?.addEventListener("input", render);
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      activeCategory = chip.getAttribute("data-cat");
      render();
    });
  });

  wireWishlistButtons(grid);
  wireDetailsModal(document);
  render();
}

async function initHomeFeatured() {
  const featuredEl = document.getElementById("featuredGrid");
  if (!featuredEl) return;

  featuredEl.innerHTML = `<div class="loading-state" style="grid-column:1/-1;text-align:center;padding:32px 0">Loading featured gadgets...</div>`;

  await fetchCatalog();

  const featured = [...(window.GADGETS || [])].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 4);
  featuredEl.innerHTML = featured.map(productCardHTML).join("");
  animateRings(featuredEl);
  if (typeof revealNow === "function") revealNow(featuredEl);
  populateCardPrices(featuredEl);
  wireWishlistButtons(featuredEl);
  wireDetailsModal(document);
  if (typeof initTiltEffects === "function") initTiltEffects(featuredEl);
}

async function initLiveStats() {
  await fetchCatalog();
  const countEl = document.getElementById("statGadgetCount");
  if (countEl) countEl.textContent = (window.GADGETS || []).length;

  const avgEl = document.getElementById("statAvgScore");
  if (avgEl && window.GADGETS.length > 0) {
    const avg = window.GADGETS.reduce((sum, g) => sum + (g.rating || 8.5), 0) / window.GADGETS.length;
    avgEl.textContent = avg.toFixed(1);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initProductsPage();
  initHomeFeatured();
  initLiveStats();
});
