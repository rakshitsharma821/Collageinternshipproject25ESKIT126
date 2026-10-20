// GadgetVerse Core Interactions, Navigation, 3D & Theme Controls

(function stickyNav() {
  const nav = document.querySelector(".navbar");
  if (!nav) return;
  function onScroll() {
    nav.classList.toggle("scrolled", window.scrollY > 30);
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
})();

(function mobileMenu() {
  const btn = document.querySelector(".hamburger");
  const links = document.querySelector(".nav-links");
  if (!btn || !links) return;
  btn.addEventListener("click", () => {
    btn.classList.toggle("open");
    links.classList.toggle("open");
  });
  links.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      btn.classList.remove("open");
      links.classList.remove("open");
    })
  );
})();

(function activeNav() {
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href === path || (path === "" && href === "index.html")) {
      a.classList.add("active");
    }
  });
})();

/* ---------- Theme switcher (Default Light, persisted via storage.js) ---------- */
(function themeSwitcher() {
  const root = document.documentElement;
  const saved = typeof ThemeStore !== "undefined" ? ThemeStore.get() : "light";
  root.setAttribute("data-theme", saved);

  document.querySelectorAll(".theme-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      if (typeof ThemeStore !== "undefined") ThemeStore.set(next);
    });
  });
})();

/* ---------- Reduced motion switcher ---------- */
(function motionSwitcher() {
  const isReduced = typeof MotionStore !== "undefined" ? MotionStore.get() : false;
  if (isReduced) {
    document.body.classList.add("reduced-motion");
  }

  document.querySelectorAll(".motion-toggle-btn, [data-motion-toggle]").forEach((btn) => {
    btn.classList.toggle("active", isReduced);
    btn.addEventListener("click", () => {
      const active = document.body.classList.toggle("reduced-motion");
      btn.classList.toggle("active", active);
      if (typeof MotionStore !== "undefined") MotionStore.set(active);
    });
  });
})();

/* ---------- 3D Card Interactive Tilt & Highlight ---------- */
function initTiltEffects(scope = document) {
  if (document.body.classList.contains("reduced-motion")) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const cards = scope.querySelectorAll(".card-3d");
  cards.forEach((card) => {
    const inner = card.querySelector(".card-inner-3d") || card;

    card.addEventListener("pointermove", (e) => {
      if (document.body.classList.contains("reduced-motion")) return;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Restrict max tilt to <= 6 degrees
      const rotateX = Number((((y - centerY) / centerY) * -5).toFixed(2));
      const rotateY = Number((((x - centerX) / centerX) * 5).toFixed(2));

      inner.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
      inner.style.setProperty("--pointer-x", `${(x / rect.width) * 100}%`);
      inner.style.setProperty("--pointer-y", `${(y / rect.height) * 100}%`);
      inner.style.setProperty("--highlight-opacity", "0.5");
    });

    card.addEventListener("pointerleave", () => {
      inner.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)";
      inner.style.setProperty("--highlight-opacity", "0");
    });
  });
}
window.initTiltEffects = initTiltEffects;

/* ---------- Hero 3D Perspective Parallax ---------- */
function initHeroParallax() {
  const scene = document.querySelector(".hero-scene-3d");
  const root3d = document.querySelector(".hero-3d-root");
  if (!scene || !root3d) return;

  scene.addEventListener("pointermove", (e) => {
    if (document.body.classList.contains("reduced-motion")) return;
    const rect = scene.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;

    const rotX = Number(((y / (rect.height / 2)) * -8).toFixed(2));
    const rotY = Number(((x / (rect.width / 2)) * 8).toFixed(2));

    root3d.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
  });

  scene.addEventListener("pointerleave", () => {
    root3d.style.transform = "rotateX(0deg) rotateY(0deg)";
  });
}

document.addEventListener("error", (e) => {
  if (e.target && e.target.classList && e.target.classList.contains("media-photo")) {
    e.target.style.display = "none";
  }
}, true);

/* Click Ripple */
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn, .icon-btn, .filter-chip");
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const circle = document.createElement("span");
  const size = Math.max(rect.width, rect.height);
  circle.className = "ripple";
  circle.style.width = circle.style.height = size + "px";
  circle.style.left = e.clientX - rect.left - size / 2 + "px";
  circle.style.top = e.clientY - rect.top - size / 2 + "px";
  btn.style.position = btn.style.position || "relative";
  btn.appendChild(circle);
  setTimeout(() => circle.remove(), 600);
});

/* ---------- IntersectionObserver Scroll Reveal ---------- */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("in-view");
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

function revealAll(scope = document) {
  scope.querySelectorAll(".reveal, .reveal-stagger").forEach((el) => {
    revealObserver.observe(el);
    setTimeout(() => {
      el.classList.add("in-view");
      revealObserver.unobserve(el);
    }, 1000);
  });
}

function revealNow(scope = document) {
  scope.querySelectorAll(".reveal, .reveal-stagger").forEach((el) => {
    revealObserver.unobserve(el);
    el.classList.add("in-view");
  });
}
window.revealNow = revealNow;

(function backToTop() {
  const btn = document.querySelector(".back-to-top");
  if (!btn) return;
  window.addEventListener("scroll", () => {
    btn.classList.toggle("show", window.scrollY > 400);
  }, { passive: true });
  btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
})();

document.addEventListener("DOMContentLoaded", () => {
  revealAll(document);
  initTiltEffects(document);
  initHeroParallax();
});
