

const STORE_KEYS = {
  THEME: "gv_theme",
  WISHLIST: "gv_wishlist",
  RECENT: "gv_recent_viewed",
  DRAFT: "gv_contact_draft",
  NEWSLETTER: "gv_newsletter_email"
};

function gvRead(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch(e){
    console.warn("GadgetVerse storage read failed:", key, e);
    return fallback;
  }
}
function gvWrite(key, value){
  try{
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  }catch(e){
    console.warn("GadgetVerse storage write failed:", key, e);
    return false;
  }
}


const ThemeStore = {
  get(){ return gvRead(STORE_KEYS.THEME, "dark"); },
  set(theme){ gvWrite(STORE_KEYS.THEME, theme); }
};


const WishlistStore = {
  all(){ return gvRead(STORE_KEYS.WISHLIST, []); },
  has(id){ return this.all().includes(id); },
  toggle(id){
    const list = this.all();
    const idx = list.indexOf(id);
    if(idx > -1){ list.splice(idx, 1); } else { list.push(id); }
    gvWrite(STORE_KEYS.WISHLIST, list);
    return list;
  },
  count(){ return this.all().length; }
};


const RecentStore = {
  MAX: 6,
  all(){ return gvRead(STORE_KEYS.RECENT, []); },
  add(id){
    let list = this.all().filter(x => x !== id);
    list.unshift(id);
    if(list.length > this.MAX) list = list.slice(0, this.MAX);
    gvWrite(STORE_KEYS.RECENT, list);
    return list;
  }
};


const DraftStore = {
  save(data){ gvWrite(STORE_KEYS.DRAFT, data); },
  load(){ return gvRead(STORE_KEYS.DRAFT, null); },
  clear(){ try{ localStorage.removeItem(STORE_KEYS.DRAFT); }catch(e){} }
};

/* ---------- Newsletter ---------- */
const NewsletterStore = {
  get(){ return gvRead(STORE_KEYS.NEWSLETTER, null); },
  set(email){ gvWrite(STORE_KEYS.NEWSLETTER, email); }
};

/* Update every wishlist-count badge present on the page (navbar icon etc.) */
function refreshWishlistBadges(){
  const n = WishlistStore.count();
  document.querySelectorAll(".wishlist-count").forEach(el => {
    el.textContent = n;
    el.style.display = n > 0 ? "flex" : "none";
  });
}

document.addEventListener("DOMContentLoaded", refreshWishlistBadges);
