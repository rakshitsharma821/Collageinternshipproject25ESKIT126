/* =========================================================
   GadgetVerse — slider.js
   Auto-play carousel: manual arrows, dot navigation,
   infinite loop, pauses on hover/focus.
========================================================= */

const SLIDES = [
  { tag: "Editor's Pick", cat: "phone",   productId: "p1", title: "iPhone 16 Pro Max sets the camera bar",       copy: "Three generations of computational photography land in one system. Read why it topped our 2026 shootout." },
  { tag: "Best Value",    cat: "laptop",  productId: "l2", title: "MacBook Air M3 proves thin doesn't mean weak", copy: "Fanless, silent, and fast enough for almost anyone — all in a chassis you forget is in your bag." },
  { tag: "Fan Favorite",  cat: "watch",   productId: "w1", title: "Apple Watch Series 10 nails everyday health",  copy: "A thinner case and brighter always-on display, with the deepest health tracking suite on wrist hardware." },
  { tag: "Staff Choice",  cat: "tv",      productId: "t3", title: "LG OLED C4 still owns the picture quality crown", copy: "Perfect blacks and near-instant response time for movies and gaming alike." },
  { tag: "New Arrival",   cat: "earbuds", productId: "e1", title: "AirPods Pro 3 sets a new ANC benchmark",        copy: "Noise cancellation that finally rivals over-ear rivals, in a fit that stays comfortable for hours." }
];

function initSlider(){
  const root = document.querySelector("[data-slider]");
  if(!root) return;

  const track = root.querySelector(".slider-track");
  const dotsWrap = root.querySelector(".slider-dots");
  let index = 0;
  let timer = null;
  const AUTOPLAY_MS = 5000;

  track.innerHTML = SLIDES.map((s, i) => `
    <div class="slide">
      <div class="slide-visual grad-${s.cat}">
        <img class="media-photo" src="${photoURL(s.productId || ('slide-' + i), s.cat, 700, 500)}" alt="${s.title}" loading="lazy">
      </div>
      <div class="slide-copy">
        <span class="eyebrow">${s.tag}</span>
        <h3>${s.title}</h3>
        <p>${s.copy}</p>
        <a href="products.html" class="btn btn-ghost btn-sm" style="margin-top:16px;display:inline-flex">Explore gadgets</a>
      </div>
    </div>`).join("");

  dotsWrap.innerHTML = SLIDES.map((_, i) => `<button class="slider-dot ${i === 0 ? "active" : ""}" data-dot="${i}" aria-label="Go to slide ${i+1}"></button>`).join("");

  function goTo(i){
    index = (i + SLIDES.length) % SLIDES.length;
    track.style.transform = `translateX(-${index * 100}%)`;
    dotsWrap.querySelectorAll(".slider-dot").forEach((d, di) => d.classList.toggle("active", di === index));
  }

  function next(){ goTo(index + 1); }
  function prev(){ goTo(index - 1); }

  function startAutoplay(){ stopAutoplay(); timer = setInterval(next, AUTOPLAY_MS); }
  function stopAutoplay(){ if(timer) clearInterval(timer); }

  root.querySelector(".slider-next")?.addEventListener("click", () => { next(); startAutoplay(); });
  root.querySelector(".slider-prev")?.addEventListener("click", () => { prev(); startAutoplay(); });
  dotsWrap.addEventListener("click", (e) => {
    const dot = e.target.closest("[data-dot]");
    if(!dot) return;
    goTo(parseInt(dot.getAttribute("data-dot"), 10));
    startAutoplay();
  });

  root.addEventListener("mouseenter", stopAutoplay);
  root.addEventListener("mouseleave", startAutoplay);
  root.addEventListener("focusin", stopAutoplay);
  root.addEventListener("focusout", startAutoplay);

  // basic touch swipe support
  let touchStartX = 0;
  track.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; stopAutoplay(); }, { passive: true });
  track.addEventListener("touchend", (e) => {
    const delta = e.changedTouches[0].clientX - touchStartX;
    if(delta > 50) prev();
    else if(delta < -50) next();
    startAutoplay();
  }, { passive: true });

  goTo(0);
  startAutoplay();
}

document.addEventListener("DOMContentLoaded", initSlider);
