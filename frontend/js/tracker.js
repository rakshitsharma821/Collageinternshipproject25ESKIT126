import { filterAvailableOffers, isApprovedProductUrl } from "./offer-visibility.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const themeKey = "gadgetverse-theme";
const motionKey = "gadgetverse-reduced-motion";
let currentProduct = null;
let compareSequence = 0;
function getApiUrl(path) {
  const meta = document.querySelector('meta[name="api-base"]')?.getAttribute('content')?.trim();
  const base = (typeof window !== "undefined" && (window.GADGETVERSE_API_URL || meta)) || "";
  return `${base.replace(/\/+$/, "")}${path}`;
}


function readPreference(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn("Could not read display preference:", error);
    return null;
  }
}

function savePreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn("Could not save display preference:", error);
  }
}

function motionReduced() {
  const saved = readPreference(motionKey);
  return saved === null ? matchMedia("(prefers-reduced-motion: reduce)").matches : saved === "true";
}

function setMotionPreference(reduced) {
  document.documentElement.classList.toggle("reduced-motion", reduced);
  document.body.classList.toggle("reduced-motion", reduced);
  $$("[data-motion-toggle]").forEach((button) => {
    button.setAttribute("aria-pressed", String(reduced));
    button.textContent = reduced ? "Motion reduced" : "Reduce motion";
  });
  savePreference(motionKey, String(reduced));
}

function formatPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "time unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function safeStoreUrl(value) {
  return isApprovedProductUrl(value) ? new URL(value).href : "#";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function isUrl(value) {
  return /^https?:\/\//i.test(value) || /^www\./i.test(value);
}

function showNotice(message) {
  const target = $("#siteNotice");
  if (target) target.textContent = message;
}

function renderLoading(name) {
  const section = $("#resultSection");
  if (!section) return;
  section.hidden = false;
  $("#resultName").textContent = name || "Checking product";
  $("#resultMessage").textContent = "Checking current store prices…";
  $("#confirmForm").hidden = true;
  $("#resultLayout").hidden = false;
  $("#storeRows").innerHTML = '<div class="skeleton" aria-label="Loading store prices"></div>';
  $("#historyChart").innerHTML = '<div class="skeleton" aria-label="Loading price history"></div>';
  $("#sourceSaving").textContent = "";
  $("#catalogReview").hidden = true;
  $("#verdictCopy").textContent = "";
  $("#trackMessage").textContent = "";
  document.body.classList.add("is-loading");
}

function showNameConfirmation(sourceUrl, message) {
  document.body.classList.remove("is-loading");
  $("#resultName").textContent = "Confirm the product name";
  $("#resultMessage").textContent = message;
  $("#resultLayout").hidden = true;
  $("#confirmForm").hidden = false;
  $("#confirmForm").dataset.sourceUrl = sourceUrl;
  $("#confirmedName").value = "";
  $("#confirmedName").focus();
}

async function requestComparison(query, sourceUrl = "") {
  const sequence = ++compareSequence;
  const value = query.trim();
  if (!value) return;
  currentProduct = { name: value, sourceUrl };
  renderLoading(value);
  showNotice("");

  const params = new URLSearchParams();
  if (sourceUrl) {
    params.set("url", sourceUrl);
  } else if (isUrl(value)) {
    params.set("url", value);
  } else {
    params.set("q", value.replace(/\s+/g, " ").trim());
  }

  try {
    const response = await fetch(getApiUrl(`/api/compare?${params.toString()}`), { headers: { Accept: "application/json" } });
    const result = await response.json();
    if (sequence !== compareSequence) return;
    document.body.classList.remove("is-loading");
    if (result.needsConfirmation) {
      showNameConfirmation(result.sourceUrl || sourceUrl || value, result.error);
      return;
    }
    if (!response.ok || !result.success) {
      $("#resultLayout").hidden = true;
      $("#resultMessage").textContent = result.error || "Comparison could not be completed.";
      showNotice(result.error || "Comparison could not be completed.");
      return;
    }
    currentProduct = {
      name: result.query,
      productId: result.productId,
      sourceUrl: sourceUrl || (isUrl(value) ? value : ""),
      previousPrice: result.previousPrice,
      priceDrop: result.priceDrop
    };
    renderResult(result);
  } catch (error) {
    if (sequence !== compareSequence) return;
    document.body.classList.remove("is-loading");
    $("#resultLayout").hidden = true;
    $("#resultMessage").textContent = "Could not reach GadgetVerse. Check your connection and try again.";
    console.error("Comparison request failed:", error);
  }
}

function renderResult(result) {
  $("#resultName").textContent = result.query;
  $("#resultMessage").textContent = result.dataMessage || "";
  $("#resultLayout").hidden = false;
  renderOffers(result.offers || [], result);
  renderReview(result.gadget);
  renderHistory(result.history || [], result.historyStats);
  renderVerdict(result.verdict);
  if (result.priceDrop) {
    const bell = $(".bell-icon");
    bell?.classList.remove("is-ringing");
    requestAnimationFrame(() => bell?.classList.add("is-ringing"));
  }
}

function renderOffers(offers, result) {
  const rows = $("#storeRows");
  const exactOffers = filterAvailableOffers(offers);
  if (!exactOffers.length) {
    rows.innerHTML = '<p class="chart-empty">No verified offers available right now.</p>';
    $("#sourceSaving").textContent = "";
    return;
  }
  const valid = exactOffers;
  const cheapest = valid[0];
  rows.innerHTML = exactOffers.map((offer, index) => {
    const hasPrice = Number.isFinite(offer.price) && offer.price > 0 && offer.currency === "INR";
    const isCheapest = hasPrice && offer.store === cheapest?.store;
    const priceDisplay = result.priceDrop && isCheapest && Number.isFinite(result.previousPrice) && !motionReduced()
      ? `<span class="price-roll" aria-label="${escapeHtml(formatPrice(offer.price))}"><span aria-hidden="true">${formatPrice(offer.price)}</span><span aria-hidden="true">${formatPrice(result.previousPrice)}</span></span>`
      : `<span class="store-price">${formatPrice(offer.price)}</span>`;
    const priceContent = hasPrice
      ? `${priceDisplay}<span class="store-price-qualification">${escapeHtml(offer.priceQualification || "Listed item price; checkout total may vary.")}</span><span class="store-availability">In stock</span><time class="store-as-of" datetime="${escapeHtml(offer.asOf || "")}">As of ${escapeHtml(formatTime(offer.asOf))}</time><span class="store-source">${escapeHtml(offer.source)}</span>${isCheapest ? '<span class="cheapest-label">Cheapest</span>' : ""}`
      : '<span class="store-price-unavailable">Price unavailable</span>';
    return `<article class="store-row${isCheapest ? " is-cheapest" : ""}" role="listitem" style="transition-delay:${motionReduced() ? 0 : index * 60}ms">
      <span><span class="store-name">${escapeHtml(offer.name)}</span><span class="store-product-title">${escapeHtml(offer.title)}</span></span>
      <span>${priceContent}</span>
      <a class="store-open" href="${escapeHtml(safeStoreUrl(offer.productUrl))}" target="_blank" rel="noopener noreferrer">Open product</a>
    </article>`;
  }).join("");
  $$(".store-row", rows).forEach((row, index) => {
    if (motionReduced()) row.classList.add("is-visible");
    else requestAnimationFrame(() => requestAnimationFrame(() => row.classList.add("is-visible")));
  });
  const saving = result.sourcePrice && cheapest && result.sourcePrice > cheapest.price
    ? `You save ${formatPrice(result.sourcePrice - cheapest.price)} vs the pasted product page`
    : "";
  $("#sourceSaving").textContent = saving;
}

function renderReview(gadget) {
  const slot = $("#catalogReview");
  if (!gadget || (!gadget.review && gadget.rating == null)) {
    slot.hidden = true;
    slot.textContent = "";
    return;
  }
  slot.hidden = false;
  const rating = Number.isFinite(Number(gadget.rating)) ? `<span class="review-rating">GadgetVerse rating ${escapeHtml(gadget.rating)}</span>` : "";
  slot.innerHTML = `<strong>${escapeHtml(gadget.brand)} review${rating}</strong>${gadget.review ? `<p>${escapeHtml(gadget.review)}</p>` : ""}`;
}

function renderHistory(history, stats = {}) {
  const points = history
    .filter((point) => Number.isFinite(Number(point.price)) && Number(point.price) > 0 && point.observedAt)
    .map((point) => ({ price: Number(point.price), date: new Date(point.observedAt) }))
    .filter((point) => !Number.isNaN(point.date.getTime()))
    .sort((a, b) => a.date - b.date);
  const chart = $("#historyChart");
  if (points.length < 2) {
    const count = points.length;
    const detail = count
      ? "One verified observation is recorded. History develops as subsequent checks succeed."
      : "History begins after the first verified observation and develops with subsequent successful checks.";
    chart.innerHTML = `<p class="chart-empty">${detail}</p><p class="history-summary">${count} verified observations · ${Number(stats.daysCovered) || 0} days covered</p>`;
    return;
  }

  const width = 600;
  const height = 180;
  const padX = 12;
  const padY = 18;
  const prices = points.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const coordinates = points.map((point, index) => ({
    ...point,
    x: padX + index * (width - padX * 2) / (points.length - 1),
    y: height - padY - (point.price - min) * (height - padY * 2) / range
  }));
  const path = coordinates.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const low = coordinates.reduce((best, point) => point.price < best.price ? point : best, coordinates[0]);
  const coverage = Number(stats.daysCovered) || Math.floor((points.at(-1).date - points[0].date) / 86400000);
  chart.innerHTML = `<p class="history-summary">${Number(stats.count) || points.length} verified daily observations · ${coverage} days covered</p><svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Recorded product price history, ${Number(stats.count) || points.length} verified daily observations over ${coverage} days">
    <path class="chart-grid-line" d="M0 18H600M0 90H600M0 162H600"/>
    <path class="chart-line" d="${path}"/>
    <circle class="chart-low-point" cx="${low.x}" cy="${low.y}" r="5"/>
    ${coordinates.map((point, index) => `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="4" tabindex="0" role="img" aria-label="${escapeHtml(formatPrice(point.price))}, ${escapeHtml(formatTime(point.date))}" data-index="${index}"/>`).join("")}
  </svg><div class="chart-axis-labels"><span>${escapeHtml(formatTime(points[0].date))}</span><span>${escapeHtml(formatTime(points.at(-1).date))}</span></div><div class="chart-tooltip" hidden></div>`;

  const svg = $(".chart-svg", chart);
  const line = $(".chart-line", svg);
  const length = line.getTotalLength();
  line.style.strokeDasharray = String(length);
  line.style.strokeDashoffset = String(length);
  const draw = () => {
    svg.classList.add("is-drawn");
    line.style.strokeDashoffset = "0";
  };
  if (motionReduced() || !("IntersectionObserver" in window)) draw();
  else {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        draw();
        observer.disconnect();
      }
    }, { threshold: 0.25 });
    observer.observe(svg);
  }

  const tooltip = $(".chart-tooltip", chart);
  $$(".chart-point", svg).forEach((point) => {
    const show = () => {
      const item = coordinates[Number(point.dataset.index)];
      tooltip.textContent = `${formatPrice(item.price)} · ${formatTime(item.date)}`;
      tooltip.hidden = false;
      tooltip.style.left = `${Math.min(70, item.x / width * 100)}%`;
      tooltip.style.top = `${Math.max(0, item.y / height * 100 - 30)}%`;
    };
    point.addEventListener("pointerenter", show, { passive: true });
    point.addEventListener("focus", show);
    point.addEventListener("pointerleave", () => { tooltip.hidden = true; }, { passive: true });
    point.addEventListener("blur", () => { tooltip.hidden = true; });
  });
}

function renderVerdict(verdict) {
  const text = $("#verdictCopy");
  const needle = $(".gauge-needle");
  const value = verdict?.verdict || "insufficient";
  const angle = value === "buy" ? "45deg" : value === "wait" ? "-45deg" : "0deg";
  needle.classList.remove("verdict-buy", "verdict-wait");
  if (motionReduced()) {
    needle.style.transform = `rotate(${angle})`;
  } else {
    needle.style.removeProperty("transform");
    if (value !== "insufficient") {
      requestAnimationFrame(() => needle.classList.add(`verdict-${value}`));
    }
  }
  text.dataset.verdict = value;
  const details = verdict?.reason
    ? `${verdict.reason} ${Number(verdict.observationCount) || 0} observations across ${Number(verdict.days) || 0} days.`
    : `Based on ${Number(verdict?.observationCount) || 0} observations across ${Number(verdict?.days) || 0} days.`;
  const range = Number.isFinite(verdict?.lowest) && Number.isFinite(verdict?.highest)
    ? ` Recorded range ${formatPrice(verdict.lowest)}–${formatPrice(verdict.highest)}; average ${formatPrice(verdict.average)}.`
    : "";
  text.textContent = `${verdict?.label || "Not enough data"} — ${details}${range}`;
  $(".radar-gauge")?.setAttribute("aria-label", `Price history verdict: ${text.textContent}`);
}

function renderCatalogCard(gadget, cheapest) {
  const hasPrice = cheapest && Number.isFinite(cheapest.price) && cheapest.price > 0;
  const price = hasPrice
    ? `<span class="deal-price">${formatPrice(cheapest.price)}</span><span>${escapeHtml(cheapest.name)} · As of ${escapeHtml(formatTime(cheapest.asOf))}</span>`
    : '<span class="deal-price deal-price-empty">Price unavailable</span>';
  return `<article class="deal-card">
    <span class="deal-brand">${escapeHtml(gadget.brand)}</span>
    <h3>${escapeHtml(gadget.name)}</h3>
    ${price}
    <button class="deal-card-button" type="button" data-product="${escapeHtml(gadget.name)}">Compare prices</button>
  </article>`;
}

async function loadCatalog() {
  const grid = $("#featuredDeals");
  const message = $("#catalogMessage");
  if (!grid || !message) return;
  grid.innerHTML = '<div class="skeleton" aria-label="Loading catalog"></div><div class="skeleton" aria-hidden="true"></div><div class="skeleton" aria-hidden="true"></div>';
  try {
    const response = await fetch(getApiUrl("/api/gadgets?limit=6"), { headers: { Accept: "application/json" } });
    const catalog = await response.json();
    if (!response.ok || !catalog.success) {
      grid.replaceChildren();
      message.textContent = catalog.message || catalog.error || "The GadgetVerse catalog is not available.";
      return;
    }
    if (!catalog.data?.length) {
      grid.replaceChildren();
      message.textContent = catalog.message || "No catalog products are available yet.";
      return;
    }
    message.textContent = "Checking current prices for catalog products…";
    grid.innerHTML = catalog.data.map((gadget) => renderCatalogCard(gadget, null)).join("");
    const compareResults = await Promise.all(catalog.data.map(async (gadget) => {
      try {
        const params = new URLSearchParams({ q: gadget.name });
        const priceResponse = await fetch(getApiUrl(`/api/compare?${params.toString()}`), { headers: { Accept: "application/json" } });
        const data = await priceResponse.json();
        return { gadget, cheapest: priceResponse.ok && data.success ? data.cheapest : null };
      } catch (error) {
        console.error(`Price check failed for catalog item ${gadget.id}:`, error);
        return { gadget, cheapest: null };
      }
    }));
    grid.innerHTML = compareResults.map(({ gadget, cheapest }) => renderCatalogCard(gadget, cheapest)).join("");
    revealOnScroll($$(".deal-card", grid), 60);
    message.textContent = "";
  } catch (error) {
    grid.replaceChildren();
    message.textContent = "Could not load live catalog data. Try again later.";
    console.error("Catalog request failed:", error);
  }
}

function bindForms() {
  $("#compareForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    requestComparison($("#productQuery").value);
  });
  $("#navSearchForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#navSearch");
    const mainSearch = $("#productQuery");
    if (mainSearch) {
      mainSearch.value = input.value;
      requestComparison(input.value);
      $("#compare")?.scrollIntoView({ behavior: motionReduced() ? "auto" : "smooth" });
    } else {
      location.href = `index.html?q=${encodeURIComponent(input.value)}`;
    }
  });
  $("#confirmForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    requestComparison($("#confirmedName").value);
  });
  $("#clearResult")?.addEventListener("click", () => {
    compareSequence += 1;
    $("#resultSection").hidden = true;
    $("#productQuery").value = "";
    $("#productQuery").focus();
  });
  $("#trackForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentProduct?.productId) {
      $("#trackMessage").textContent = "Compare a product first to set a price target.";
      return;
    }
    const submit = $('button[type="submit"]', event.currentTarget);
    const formData = new FormData(event.currentTarget);
    submit.disabled = true;
    $("#trackMessage").textContent = "Saving price alert…";
    try {
      const response = await fetch(getApiUrl("/api/track"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          productId: currentProduct.productId,
          productName: currentProduct.name,
          targetPrice: Number(formData.get("targetPrice")),
          email: String(formData.get("email"))
        })
      });
      const result = await response.json();
      $("#trackMessage").textContent = response.ok && result.success
        ? result.message
        : result.error || "Price alert could not be saved.";
    } catch (error) {
      $("#trackMessage").textContent = "Could not reach GadgetVerse. Try again later.";
      console.error("Price alert request failed:", error);
    } finally {
      submit.disabled = false;
    }
  });
  $("#featuredDeals")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-product]");
    if (!button) return;
    const input = $("#productQuery");
    if (!input) {
      location.href = `index.html?q=${encodeURIComponent(button.dataset.product)}`;
      return;
    }
    input.value = button.dataset.product;
    requestComparison(button.dataset.product);
    $("#compare")?.scrollIntoView({ behavior: motionReduced() ? "auto" : "smooth" });
  });
  $$(".feature-action").forEach((link) => {
    link.addEventListener("click", () => {
      const input = $("#productQuery");
      if (input) setTimeout(() => input.focus(), 150);
    });
  });
}

function bindPreferences() {
  const savedTheme = readPreference(themeKey);
  document.documentElement.dataset.theme = savedTheme === "dark" ? "dark" : "light";
  $$("[data-theme-toggle]").forEach((button) => {
    const update = () => {
      const dark = document.documentElement.dataset.theme === "dark";
      button.textContent = dark ? "Light mode" : "Dark mode";
      button.setAttribute("aria-pressed", String(dark));
    };
    update();
    button.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      savePreference(themeKey, next);
      update();
    });
  });
  setMotionPreference(motionReduced());
  $$("[data-motion-toggle]").forEach((button) => button.addEventListener("click", () => setMotionPreference(!motionReduced())));

  const dialog = $("#signInDialog");
  $$("[data-sign-in]").forEach((button) => button.addEventListener("click", () => {
    if (dialog?.showModal) dialog.showModal();
    else showNotice("Account sign-in is not configured. Price comparison is available without an account.");
  }));
  $(".dialog-close")?.addEventListener("click", () => dialog?.close());

  const menu = $(".menu-toggle");
  const header = $(".header-inner");
  menu?.addEventListener("click", () => {
    const open = header.classList.toggle("menu-open");
    menu.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });
}

function revealOnScroll(elements, stagger = 0) {
  const targets = elements.filter(Boolean);
  if (!targets.length) return;
  if (motionReduced() || !("IntersectionObserver" in window)) {
    targets.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  try {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const element = entry.target;
        element.classList.add("is-visible");
        observer.unobserve(element);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -24px 0px" });
    targets.forEach((element, index) => {
      element.style.transitionDelay = `${index * stagger}ms`;
      element.classList.add("reveal-pending");
      observer.observe(element);
    });
  } catch (error) {
    targets.forEach((element) => element.classList.add("is-visible"));
    console.error("Scroll reveal could not be initialized:", error);
  }
}

function bindHeroParallax() {
  const scene = $(".hero-art");
  if (!scene || !matchMedia("(pointer: fine)").matches) return;
  let frame = 0;
  let pointer = null;
  scene.addEventListener("pointermove", (event) => {
    if (motionReduced()) return;
    pointer = { x: event.clientX, y: event.clientY };
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const rect = scene.getBoundingClientRect();
      const x = (pointer.x - rect.left - rect.width / 2) / rect.width;
      const y = (pointer.y - rect.top - rect.height / 2) / rect.height;
      $(".tag-back", scene).style.translate = `${x * -5}px ${y * -5}px`;
      $(".tag-middle", scene).style.translate = `${x * 10}px ${y * 10}px`;
      $(".tag-front", scene).style.translate = `${x * 17}px ${y * 17}px`;
    });
  }, { passive: true });
  scene.addEventListener("pointerleave", () => {
    $(".tag-back", scene).style.translate = "";
    $(".tag-middle", scene).style.translate = "";
    $(".tag-front", scene).style.translate = "";
  }, { passive: true });
}

function init() {
  bindPreferences();
  bindForms();
  revealOnScroll($$(".feature-card"), 70);
  revealOnScroll($$(".step-card"), 100);
  bindHeroParallax();
  loadCatalog();
  const search = new URLSearchParams(location.search).get("q");
  if (search) {
    const input = $("#productQuery");
    if (input) input.value = search;
    requestComparison(search);
  }
}

init();
