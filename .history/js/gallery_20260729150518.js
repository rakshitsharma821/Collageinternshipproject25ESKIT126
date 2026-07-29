/* =========================================================
   GadgetVerse — gallery.js
   Category-filterable image gallery + lightbox popup.
========================================================= */

const GALLERY_ITEMS = [
  { id:"g1",  productId:"p1", title:"iPhone 16 Pro Max — Studio Shot",     cat:"phone",   size:"tall",  copy:"Titanium frame under studio lighting." },
  { id:"g2",  productId:"l1", title:"MacBook Pro 16\" M4 — Open Lid",      cat:"laptop",  size:"wide",  copy:"Full keyboard deck and Liquid Retina XDR display." },
  { id:"g3",  productId:"w1", title:"Apple Watch Series 10 — Wrist Angle", cat:"watch",   size:"normal",copy:"Sapphire crystal catching side light." },
  { id:"g4",  productId:"e1", title:"AirPods Pro 3 — Case Open",           cat:"earbuds", size:"normal",copy:"Charging case with wireless coil visible." },
  { id:"g5",  productId:"t3", title:"LG OLED C4 — Panel Glow",             cat:"tv",      size:"tall",  copy:"Per-pixel lighting on a dark test pattern." },
  { id:"g6",  productId:"p2", title:"iPhone 16 — Back Panel",               cat:"phone",   size:"normal",copy:"Aerospace-grade aluminum finish, camera island detail." },
  { id:"g7",  productId:"l3", title:"Asus ROG Zephyrus G14 — Hinge",       cat:"laptop",  size:"normal",copy:"170° hinge mechanism close-up." },
  { id:"g8",  productId:"w2", title:"Apple Watch Ultra 2 — Strap Swap",    cat:"watch",   size:"wide",  copy:"Quick-release strap system in action." },
  { id:"g9",  productId:"e2", title:"AirPods Max — In Motion",             cat:"earbuds", size:"normal",copy:"Over-ear fit test during a commute." },
  { id:"g10", productId:"t2", title:"Samsung Neo QLED QN90D — Wall Mount", cat:"tv",      size:"normal",copy:"Mini-LED brightness under bright room lighting." },
  { id:"g11", productId:"l5", title:"Acer Predator Helios 16 — Keyboard",  cat:"laptop",  size:"normal",copy:"Per-key RGB close-up during a benchmark run." },
  { id:"g12", productId:"t4", title:"Sony Bravia XR A80L — Panel Glow",    cat:"tv",      size:"normal",copy:"Color science test pattern on a dark test screen." },
];

function galleryTileHTML(item){
  return `
    <figure class="gallery-item glass ${item.size !== "normal" ? item.size : ""} reveal" data-cat="${item.cat}" data-id="${item.id}" tabindex="0">
      <div class="gallery-tile grad-${item.cat}">
        <img class="media-photo" src="${photoURL(item.productId || item.id, item.cat, 500, 500)}" alt="${item.title}" loading="lazy">
      </div>
      <figcaption class="gallery-overlay">
        <h4>${item.title}</h4>
        <span>${window.CATEGORY_LABELS ? window.CATEGORY_LABELS[item.cat] : item.cat}</span>
      </figcaption>
    </figure>`;
}

function initGallery(){
  const grid = document.getElementById("galleryGrid");
  if(!grid) return;

  const chips = document.querySelectorAll(".gallery-filter");
  let visibleList = GALLERY_ITEMS;

  function render(list){
    grid.innerHTML = list.map(galleryTileHTML).join("");
    if(typeof revealNow === "function") revealNow(grid);
  }

  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      chips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      const cat = chip.getAttribute("data-cat");
      visibleList = cat === "all" ? GALLERY_ITEMS : GALLERY_ITEMS.filter(i => i.cat === cat);
      render(visibleList);
    });
  });

  render(visibleList);
  initLightbox(grid, () => visibleList);
}

/* ---------- Lightbox ---------- */
function initLightbox(grid, getVisibleList){
  const lightbox = document.getElementById("lightbox");
  if(!lightbox) return;
  const visual = lightbox.querySelector(".lightbox-visual");
  const titleEl = lightbox.querySelector(".lightbox-title");
  const copyEl = lightbox.querySelector(".lightbox-copy");
  let currentIndex = 0;

  function open(id){
    const list = getVisibleList();
    currentIndex = list.findIndex(i => i.id === id);
    if(currentIndex === -1) currentIndex = 0;
    show(list);
  }

  function show(list){
    const item = list[currentIndex];
    if(!item) return;
    visual.className = `lightbox-visual grad-${item.cat}`;
    visual.innerHTML = `<img class="media-photo" src="${photoURL(item.productId || item.id, item.cat, 900, 560)}" alt="${item.title}">`;
    titleEl.textContent = item.title;
    copyEl.textContent = item.copy;
    lightbox.classList.add("open");
  }

  grid.addEventListener("click", (e) => {
    const tile = e.target.closest(".gallery-item");
    if(!tile) return;
    open(tile.getAttribute("data-id"));
  });
  grid.addEventListener("keydown", (e) => {
    if(e.key === "Enter"){
      const tile = e.target.closest(".gallery-item");
      if(tile) open(tile.getAttribute("data-id"));
    }
  });

  lightbox.querySelector(".lightbox-close")?.addEventListener("click", () => lightbox.classList.remove("open"));
  lightbox.addEventListener("click", (e) => { if(e.target === lightbox) lightbox.classList.remove("open"); });

  lightbox.querySelector(".lightbox-next")?.addEventListener("click", () => {
    const list = getVisibleList();
    currentIndex = (currentIndex + 1) % list.length;
    show(list);
  });
  lightbox.querySelector(".lightbox-prev")?.addEventListener("click", () => {
    const list = getVisibleList();
    currentIndex = (currentIndex - 1 + list.length) % list.length;
    show(list);
  });

  document.addEventListener("keydown", (e) => {
    if(!lightbox.classList.contains("open")) return;
    if(e.key === "Escape") lightbox.classList.remove("open");
    if(e.key === "ArrowRight") lightbox.querySelector(".lightbox-next")?.click();
    if(e.key === "ArrowLeft") lightbox.querySelector(".lightbox-prev")?.click();
  });
}

document.addEventListener("DOMContentLoaded", initGallery);
