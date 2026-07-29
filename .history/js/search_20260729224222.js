/* =========================================================
   GadgetVerse — search.js
   Gadget catalog data + live search + category filtering +
   product card rendering (used on products.html & index.html)
========================================================= */

/* ---------- Category tile icons (line-icon SVGs, no external images needed) ---------- */
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

/* ---------- Catalog ---------- */
const GADGETS = [
  { id:"p1", name:"iPhone 16 Pro Max", brand:"Apple", category:"phone", price:1199, rating:9.5, review:"The most refined iPhone camera system yet, paired with the smoothest display Apple has shipped. Battery finally matches the ambition." },
  { id:"p2", name:"iPhone 16", brand:"Apple", category:"phone", price:799, rating:8.9, review:"Almost all the Pro's smarts in a lighter body — the sensible pick unless you shoot a lot of zoom." },
  { id:"p3", name:"iPhone 15", brand:"Apple", category:"phone", price:699, rating:8.4, review:"Still a superbly built phone a year later, though the Dynamic Island is starting to feel like the base tier's only flex." },
  { id:"l1", name:"MacBook Pro 16\" M4", brand:"Apple", category:"laptop", price:2499, rating:9.5, review:"Silent under sustained loads that make other laptops throttle, with a battery that shrugs off a full workday." },
  { id:"l2", name:"MacBook Air 15\" M3", brand:"Apple", category:"laptop", price:1299, rating:9.2, review:"Fanless, featherlight, and fast enough for almost everyone — still the laptop we recommend most." },
  { id:"l3", name:"Asus ROG Zephyrus G14", brand:"Asus", category:"laptop", price:1799, rating:9.0, review:"Genuine gaming power in a 14-inch chassis that doesn't scream 'gaming laptop.' Fan noise ramps up fast under load." },
  { id:"l4", name:"Asus Zenbook 14 OLED", brand:"Asus", category:"laptop", price:1099, rating:8.6, review:"A gorgeous OLED panel and all-day battery life for well under flagship pricing. Speakers are the weak point." },
  { id:"l5", name:"Acer Predator Helios 16", brand:"Acer", category:"laptop", price:1699, rating:8.8, review:"Serious frame rates at a price that undercuts the competition, if you can live with the bulk and the fan whine." },
  { id:"l6", name:"Acer Swift Go 14", brand:"Acer", category:"laptop", price:899, rating:8.2, review:"The budget productivity laptop we keep recommending to students — solid keyboard, middling webcam." },
  { id:"w1", name:"Apple Watch Series 10", brand:"Apple", category:"watch", price:429, rating:9.1, review:"Thinner case, brighter always-on display, and the health tracking suite that still leads the category." },
  { id:"w2", name:"Apple Watch Ultra 2", brand:"Apple", category:"watch", price:799, rating:9.3, review:"Built for multi-day expeditions, priced like it — titanium case, huge battery, dive-rated toughness." },
  { id:"w3", name:"Samsung Galaxy Watch 7", brand:"Samsung", category:"watch", price:329, rating:8.6, review:"The strongest Wear OS option for Android owners, with sleep coaching that's genuinely useful." },
  { id:"e1", name:"AirPods Pro 3", brand:"Apple", category:"earbuds", price:249, rating:9.3, review:"Noise cancellation that finally rivals over-ear rivals, plus a fit that stays comfortable for hours." },
  { id:"e2", name:"AirPods Max", brand:"Apple", category:"earbuds", price:549, rating:8.8, review:"Reference-quality sound and build in a headphone that's heavier — and pricier — than it needs to be." },
  { id:"e3", name:"AirPods 4", brand:"Apple", category:"earbuds", price:129, rating:8.3, review:"The everyday earbud for iPhone owners who don't need ANC. Case is smaller, fit is better than ever." },
  { id:"t1", name:"Apple TV 4K (3rd Gen)", brand:"Apple", category:"tv", price:149, rating:8.9, review:"The slickest streaming box interface around, though the price still stings next to a $30 dongle." },
  { id:"t2", name:"Samsung Neo QLED QN90D", brand:"Samsung", category:"tv", price:1799, rating:9.0, review:"Mini-LED brightness that makes HDR genuinely pop, with the best anti-glare coating we've tested." },
  { id:"t3", name:"LG OLED C4", brand:"LG", category:"tv", price:1499, rating:9.3, review:"Perfect blacks, near-instant response time, and the gaming features enthusiasts actually want. Risk of burn-in remains." },
  { id:"t4", name:"Sony Bravia XR A80L", brand:"Sony", category:"tv", price:1399, rating:8.8, review:"Sony's color science and motion processing are still unmatched — the remote and smart-TV software are not." },
];

// Expose globally for other pages/scripts (index.html featured section, storage etc.)
window.GADGETS = GADGETS;
window.TILE_ICONS = TILE_ICONS;
window.CATEGORY_LABELS = CATEGORY_LABELS;

/* ---------- Ring badge markup builder (the site's signature score visual) ---------- */
let __ringUid = 0;
function buildRing(score /* 0-10 */, size = 52){
  const pct = Math.max(0, Math.min(10, score)) / 10;
  const circumference = 175; 
  const offset = circumference - pct * circumference;
  const gradId = `ringGrad${++__ringUid}`;
  return `
    <div class="ring-badge" style="width:${size}px;height:${size}px" data-score="${score}">
      <svg viewBox="0 0 64 64">
        <defs>
          <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#6c5ce7"/>
            <stop offset="100%" stop-color="#00d9ff"/>
          </linearGradient>
        </defs>
        <circle class="ring-track" cx="32" cy="32" r="27.9"></circle>
        <circle class="ring-fill" cx="32" cy="32" r="27.9" style="stroke:url(#${gradId})" data-offset="${offset}"></circle>
      </svg>
      <div class="ring-label"><b>${score.toFixed(1)}</b><span>SCORE</span></div>
    </div>`;
}


function animateRings(scope = document){
  scope.querySelectorAll(".ring-fill").forEach(circle => {
    const offset = circle.getAttribute("data-offset");
    requestAnimationFrame(() => { circle.style.strokeDashoffset = offset; });
  });
}


const CATEGORY_KEYWORDS = {
  phone: "iphone,smartphone",
  laptop: "laptop,macbook",
  watch: "smartwatch,applewatch",
  earbuds: "earbuds,airpods",
  tv: "television,tv"
};


function hashSeed(str){
  let hash = 0;
  for(let i = 0; i < str.length; i++){
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}


const REAL_PHOTOS = {
  p1: "https://m.media-amazon.com/images/I/51Vs7ZwpSpL._AC_SX679_.jpg",
  p2: "https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/iphone-16-model-unselect-gallery-2-202409_GEO_IN?wid=5120&hei=2880&fmt=webp&qlt=90&.v=ZnlzVUZzRWd3dlg0RllqbHhQSUpKTGdzSmpObkZCM3MrNmJ5SkhESlNDaElTd0FWL0RrZVVSWUpsbHBzZEZDTjhLcXQxZ1h0QThIT2dnUm5qbGk5OUJkSERIUjY1Wk1Od3FtNjF6NFZLVXRUKzcvYzFXSU9zYjhqZ2pRRHlaK1BVd0cxVytZV0ZVQnV6YjdNc0g2T2t3&traceId=1",
  p3: "https://m.media-amazon.com/images/I/51PtFHUPjBL._AC_SY300_SX300_QL70_FMwebp_.jpg",
  l1: "https://cdsassets.apple.com/live/7WUAS350/images/tech-specs/mbp16-2024.png",
  l2: "https://rukminim2.flixcart.com/image/1528/1528/xif0q/computer/g/t/w/-enriched-transparent-original-imagypv6zpfu8kzh.png?q=90",
  l3: "https://in.store.asus.com/media/catalog/product/1/_/1._ga403wr-qs123ws__main.jpg?quality=80&bg-color=255,255,255&fit=bounds&height=596&width=596&canvas=596:596",
  l4: "https://dlcdnwebimgs.asus.com/files/media/202510/e456c335-0898-468a-8271-2482e62add0b/v1/features/images/large/2x/kv/kv.webp",
  l5: "https://m.media-amazon.com/images/I/61ziSzsGEbL._SL1000_.jpg",
  l6: "https://m.media-amazon.com/images/I/71vFMKafmKL._AC_SX466_.jpg",
  w1: "https://www.apple.com/newsroom/images/2024/09/introducing-apple-watch-series-10/article/Apple-Watch-Series-10-hero-240909_big.jpg.large_2x.jpg",
  w2: "https://m.media-amazon.com/images/I/81V3wgQBeuL._SX679_.jpg",
  w3: "https://m.media-amazon.com/images/I/713LEDx+H0L._SY450_.jpg",
  e1: "https://rukminim2.flixcart.com/image/1528/1528/xif0q/headphone/3/b/c/-original-imahftffyzcx5ksy.jpeg?q=90",
  e2: "https://rukminim2.flixcart.com/image/1528/1528/xif0q/headphone/7/p/n/-original-imah4jvfftfwhs5q.jpeg?q=90",
  e3: "https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/airpods-4-hero-select-202409?wid=976&hei=916&fmt=jpeg&qlt=90&.v=NFNYUnZEZG9WdmVKZzdXRW9IVzNoQVV5N29UUE5sYkU5bzFjbnV4MlZFL2kyVU55U21PWTMyajVGNTlWWnhwak14MXJScFRZN3Y5OWZsRXVrN1k4cFZyQ2FPOWYvcVVkNFcyRXFtUGhFUW8",
  t1: "https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/apple-tv-4k-hero-select-202210?wid=1076&hei=1070&fmt=jpeg&qlt=90&.v=a3VoZW85YUhreXN3ZFlSUDc3a0tqdU1qeWRTYWRhVU5NM3d6SkhmNzkxTVA2eHYwV0FuTVcxeXpzZU1sNHk2WmJGcXNRQnFCV0w3WVRjTExvdm1ic2FNaUdBMSt0VkxKZ2NWelk1alBpUVVXZEdHNUFPR0hYUU12cjI0VlFzM1A",
  t2: "https://rukminim2.flixcart.com/image/1528/1528/xif0q/television/m/v/5/-original-imahknwwnvwb7gtb.jpeg?q=90",
  t3: "https://m.media-amazon.com/images/I/81QAq0+lmxL._AC_SY300_SX300_QL70_FMwebp_.jpg",
  t4: "https://d1ncau8tqf99kp.cloudfront.net/converted/111878_original_local_1200x1050_v3_converted.webp"
};

function photoURL(seed, category, w = 700, h = 525){
  if(REAL_PHOTOS[seed]) return REAL_PHOTOS[seed];
  const keywords = CATEGORY_KEYWORDS[category] || category || "technology";
  return `https://loremflickr.com/${w}/${h}/${keywords}?lock=${hashSeed(String(seed))}`;
}
window.photoURL = photoURL;

/* ---------- Product card template ---------- */
function productCardHTML(g){
  const isWished = typeof WishlistStore !== "undefined" && WishlistStore.has(g.id);
  return `
  <article class="product-card glass reveal" data-id="${g.id}" data-category="${g.category}">
    <div class="card-media grad-${g.category}">
      <img class="media-photo" src="${photoURL(g.id, g.category)}" alt="${g.name}" loading="lazy">
      <button class="wish-btn ${isWished ? "active" : ""}" data-wish="${g.id}" aria-label="Toggle wishlist">
        <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.35-9.5-8.5C0.7 8 2 4.5 5.5 4.5c2 0 3.5 1.2 4.5 2.7C11 5.7 12.5 4.5 14.5 4.5 18 4.5 19.3 8 19.5 11.5 17 15.65 12 20 12 20Z"/></svg>
      </button>
      ${buildRing(g.rating, 52)}
    </div>
    <div class="card-body">
      <span class="card-brand">${g.brand}</span>
      <h3>${g.name}</h3>
      <p class="card-review">${g.review}</p>
      <div class="card-foot">
        <div class="card-price mono">$${g.price}<br><small>${CATEGORY_LABELS[g.category]}</small></div>
      </div>
      <div class="card-actions">
        <button class="btn btn-ghost btn-sm btn-block" data-details="${g.id}">View Details</button>
        <button class="btn btn-primary btn-sm btn-block" data-wish="${g.id}">${isWished ? "Wishlisted" : "Add to Wishlist"}</button>
      </div>
    </div>
  </article>`;
}

function wireWishlistButtons(scope = document){
  scope.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-wish]");
    if(!btn) return;
    const id = btn.getAttribute("data-wish");
    WishlistStore.toggle(id);
    refreshWishlistBadges();
    // sync every button referencing this product (icon + label variant)
    document.querySelectorAll(`[data-wish="${id}"]`).forEach(b => {
      const active = WishlistStore.has(id);
      b.classList.toggle("active", active);
      if(b.classList.contains("btn")) b.textContent = active ? "Wishlisted" : "Add to Wishlist";
    });
    showToast(WishlistStore.has(id) ? "Added to wishlist" : "Removed from wishlist");
  });
}

function showToast(msg){
  let toast = document.querySelector(".toast");
  if(!toast){
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

function wireDetailsModal(scope = document){
  const modal = document.getElementById("detailsModal");
  if(!modal) return;
  scope.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-details]");
    if(!btn) return;
    const g = GADGETS.find(x => x.id === btn.getAttribute("data-details"));
    if(!g) return;
    RecentStore.add(g.id);
    modal.querySelector(".modal-icon").innerHTML = `<img class="media-photo" src="${photoURL(g.id, g.category, 800, 500)}" alt="${g.name}">`;
    modal.querySelector(".modal-icon").className = `modal-icon grad-${g.category}`;
    modal.querySelector(".modal-name").textContent = g.name;
    modal.querySelector(".modal-brand").textContent = `${g.brand} · ${CATEGORY_LABELS[g.category]}`;
    modal.querySelector(".modal-review").textContent = g.review;
    modal.querySelector(".modal-price").textContent = `$${g.price}`;
    modal.querySelector(".modal-ring").innerHTML = buildRing(g.rating, 74);
    modal.querySelector("[data-wish]").setAttribute("data-wish", g.id);
    modal.querySelector("[data-wish]").textContent = WishlistStore.has(g.id) ? "Wishlisted" : "Add to Wishlist";
    modal.classList.add("open");
    animateRings(modal);
  });
  modal.querySelector(".lightbox-close")?.addEventListener("click", () => modal.classList.remove("open"));
  modal.addEventListener("click", (e) => { if(e.target === modal) modal.classList.remove("open"); });
}

function initProductsPage(){
  const grid = document.getElementById("productGrid");
  if(!grid) return;

  const searchInput = document.getElementById("productSearch");
  const chips = document.querySelectorAll(".filter-chip");
  const resultsMeta = document.getElementById("resultsMeta");
  let activeCategory = "all";

  // ----- Read ?cat= and ?search= from the URL (set by category cards / navbar search) -----
  const params = new URLSearchParams(location.search);
  const urlCat = params.get("cat");
  const urlSearch = params.get("search");
  if(urlSearch && searchInput) searchInput.value = urlSearch;
  if(urlCat && CATEGORY_LABELS[urlCat]){
    activeCategory = urlCat;
    chips.forEach(c => c.classList.toggle("active", c.getAttribute("data-cat") === urlCat));
  }

  function render(){
    const term = (searchInput?.value || "").trim().toLowerCase();
    const filtered = GADGETS.filter(g => {
      const matchesCat = activeCategory === "all" || g.category === activeCategory;
      const matchesTerm = !term ||
        g.name.toLowerCase().includes(term) ||
        g.brand.toLowerCase().includes(term) ||
        CATEGORY_LABELS[g.category].toLowerCase().includes(term);
      return matchesCat && matchesTerm;
    });

    resultsMeta.textContent = `${filtered.length} gadget${filtered.length !== 1 ? "s" : ""} found`;

    if(filtered.length === 0){
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
          <p>No gadgets match "<strong>${term || CATEGORY_LABELS[activeCategory] || ""}</strong>". Try a different search or filter.</p>
        </div>`;
      return;
    }

    grid.innerHTML = filtered.map(productCardHTML).join("");
    animateRings(grid);
    revealNow(grid);
  }

  searchInput?.addEventListener("input", render);
  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      chips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      activeCategory = chip.getAttribute("data-cat");
      render();
    });
  });

  wireWishlistButtons(grid);
  wireDetailsModal(document);
  render();
}

function initHomeFeatured(){
  const featuredEl = document.getElementById("featuredGrid");
  const trendingEl = document.getElementById("trendingGrid");
  if(featuredEl){
    const featured = [...GADGETS].sort((a,b) => b.rating - a.rating).slice(0, 4);
    featuredEl.innerHTML = featured.map(productCardHTML).join("");
    animateRings(featuredEl);
    revealNow(featuredEl);
    wireWishlistButtons(featuredEl);
    wireDetailsModal(document);
  }
  if(trendingEl){
    const trending = [...GADGETS].sort(() => 0.5 - Math.random()).slice(0, 6);
    const chips = trending.map(g => `
      <div class="ticker-chip">${g.name} <span style="color:var(--grad-2)">·</span> $${g.price}</div>
    `).join("");

    trendingEl.innerHTML = chips + chips;
  }
}

function initLiveStats(){
  const countEl = document.getElementById("statGadgetCount");
  if(countEl) countEl.textContent = GADGETS.length;

  const avgEl = document.getElementById("statAvgScore");
  if(avgEl){
    const avg = GADGETS.reduce((sum, g) => sum + g.rating, 0) / GADGETS.length;
    avgEl.textContent = avg.toFixed(1);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initProductsPage();
  initHomeFeatured();
  initLiveStats();
});
