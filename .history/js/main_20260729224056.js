/* =========================================================
   GadgetVerse — main.js
   Sitewide behavior shared across every page.
========================================================= */

/* ---------- Sticky Navbar ---------- */
(function stickyNav(){
  const nav = document.querySelector(".navbar");
  if(!nav) return;
  function onScroll(){
    nav.classList.toggle("scrolled", window.scrollY > 30);
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
})();

/* ---------- Mobile hamburger menu ---------- */
(function mobileMenu(){
  const btn = document.querySelector(".hamburger");
  const links = document.querySelector(".nav-links");
  if(!btn || !links) return;
  btn.addEventListener("click", () => {
    btn.classList.toggle("open");
    links.classList.toggle("open");
  });
  links.querySelectorAll("a").forEach(a => a.addEventListener("click", () => {
    btn.classList.remove("open");
    links.classList.remove("open");
  }));
})();

/* ---------- Active nav link (based on current file) ---------- */
(function activeNav(){
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach(a => {
    const href = a.getAttribute("href");
    if(href === path || (path === "" && href === "index.html")){
      a.classList.add("active");
    }
  });
})();

/* ---------- Theme switcher (persisted via storage.js) ---------- */
(function themeSwitcher(){
  const root = document.documentElement;
  const saved = typeof ThemeStore !== "undefined" ? ThemeStore.get() : "dark";
  root.setAttribute("data-theme", saved);

  document.querySelectorAll(".theme-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      if(typeof ThemeStore !== "undefined") ThemeStore.set(next);
    });
  });
})();


document.addEventListener("error", (e) => {
  if(e.target && e.target.classList && e.target.classList.contains("media-photo")){
    e.target.style.display = "none";
  }
}, true);

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn, .icon-btn, .filter-chip, .slider-arrow");
  if(!btn) return;
  const rect = btn.getBoundingClientRect();
  const circle = document.createElement("span");
  const size = Math.max(rect.width, rect.height);
  circle.className = "ripple";
  circle.style.width = circle.style.height = size + "px";
  circle.style.left = (e.clientX - rect.left - size/2) + "px";
  circle.style.top = (e.clientY - rect.top - size/2) + "px";
  btn.style.position = btn.style.position || "relative";
  btn.appendChild(circle);
  setTimeout(() => circle.remove(), 650);
});


const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if(entry.isIntersecting){
      entry.target.classList.add("in-view");
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15, rootMargin: "0px 0px -60px 0px" });

function revealAll(scope = document){
  scope.querySelectorAll(".reveal, .reveal-stagger").forEach(el => {
    revealObserver.observe(el);
   
    setTimeout(() => {
      el.classList.add("in-view");
      revealObserver.unobserve(el);
    }, 1200);
  });
}


function revealNow(scope = document){
  scope.querySelectorAll(".reveal, .reveal-stagger").forEach(el => {
    revealObserver.unobserve(el);
    el.classList.add("in-view");
  });
}
window.revealNow = revealNow;
document.addEventListener("DOMContentLoaded", () => revealAll(document));

/* ---------- Counter animation (About page stats) ---------- */
function animateCounter(el){
  const target = parseFloat(el.getAttribute("data-count"));
  const suffix = el.getAttribute("data-suffix") || "";
  const duration = 1400;
  const start = performance.now();
  function tick(now){
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = target * eased;
    el.textContent = (target % 1 === 0 ? Math.floor(value) : value.toFixed(1)) + suffix;
    if(progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if(entry.isIntersecting){
      animateCounter(entry.target);
      counterObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-count]").forEach(el => counterObserver.observe(el));
});

(function backToTop(){
  const btn = document.querySelector(".back-to-top");
  if(!btn) return;
  window.addEventListener("scroll", () => {
    btn.classList.toggle("show", window.scrollY > 500);
  }, { passive: true });
  btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
})();

/* ---------- Newsletter forms (footer + homepage section) ---------- */
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-newsletter-form]").forEach(form => {
    const note = form.querySelector(".form-note");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = form.querySelector("input[type='email']");
      const email = input.value.trim();
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if(!valid){
        if(note){ note.textContent = "Please enter a valid email address."; note.className = "form-note err"; }
        return;
      }
      if(typeof NewsletterStore !== "undefined") NewsletterStore.set(email);
      if(note){ note.textContent = "Subscribed! Check your inbox for a confirmation."; note.className = "form-note ok"; }
      form.reset();
    });

    if(typeof NewsletterStore !== "undefined" && NewsletterStore.get()){
      const note = form.querySelector(".form-note");
      if(note){ note.textContent = `Subscribed as ${NewsletterStore.get()}`; note.className = "form-note ok"; }
    }
  });
});

(function navQuickSearch(){
  const input = document.getElementById("navQuickSearch");
  if(!input) return;
  input.addEventListener("keydown", (e) => {
    if(e.key === "Enter" && input.value.trim()){
      window.location.href = `products.html?search=${encodeURIComponent(input.value.trim())}`;
    }
  });
})();

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-cat-icon]").forEach(el => {
    const key = el.getAttribute("data-cat-icon");
    if(window.TILE_ICONS && window.TILE_ICONS[key]) el.innerHTML = window.TILE_ICONS[key];
  });
});
