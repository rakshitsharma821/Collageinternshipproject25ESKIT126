

const CONTACT_RULES = {
  name:    { required: true, min: 2, max: 60 },
  email:   { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  phone:   { required: true, pattern: /^[0-9+()\-\s]{7,16}$/ },
  subject: { required: true, min: 4, max: 80 },
  message: { required: true, min: 20, max: 500 }
};

function validateField(name, value){
  const rule = CONTACT_RULES[name];
  const v = (value || "").trim();
  if(rule.required && v.length === 0) return "This field is required.";
  if(rule.pattern && !rule.pattern.test(v)){
    if(name === "email") return "Enter a valid email address (e.g. name@example.com).";
    if(name === "phone") return "Enter a valid phone number (7–16 digits).";
    return "Invalid format.";
  }
  if(rule.min && v.length < rule.min) return `Please enter at least ${rule.min} characters.`;
  if(rule.max && v.length > rule.max) return `Please keep it under ${rule.max} characters.`;
  return "";
}

function initContactForm(){
  const form = document.getElementById("contactForm");
  if(!form) return;

  const successBox = document.getElementById("formSuccess");
  const fields = Object.keys(CONTACT_RULES);


  const draft = typeof DraftStore !== "undefined" ? DraftStore.load() : null;
  if(draft){
    fields.forEach(f => {
      const el = form.elements[f];
      if(el && draft[f]) el.value = draft[f];
    });
    const note = document.getElementById("draftNote");
    if(note) note.textContent = "Draft restored from your last visit.";
  }


  const messageEl = form.elements["message"];
  const countEl = document.getElementById("messageCount");
  function updateCount(){
    if(countEl) countEl.textContent = `${messageEl.value.length} / ${CONTACT_RULES.message.max}`;
  }
  messageEl?.addEventListener("input", updateCount);
  updateCount();

  // ----- Autosave draft (debounced) -----
  let saveTimer = null;
  form.addEventListener("input", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const data = {};
      fields.forEach(f => data[f] = form.elements[f]?.value || "");
      if(typeof DraftStore !== "undefined") DraftStore.save(data);
      const note = document.getElementById("draftNote");
      if(note) note.textContent = "Draft saved automatically.";
    }, 500);
  });

  // ----- Live per-field validation -----
  fields.forEach(f => {
    const el = form.elements[f];
    if(!el) return;
    el.addEventListener("blur", () => showFieldError(f));
  });

  function showFieldError(name){
    const el = form.elements[name];
    const wrap = el.closest(".field");
    const errorEl = wrap.querySelector(".field-error");
    const message = validateField(name, el.value);
    wrap.classList.toggle("error", Boolean(message));
    if(errorEl) errorEl.textContent = message;
    return message === "";
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let allValid = true;
    fields.forEach(f => { if(!showFieldError(f)) allValid = false; });

    if(!allValid){
      form.querySelector(".field.error input, .field.error textarea")?.focus();
      successBox?.classList.remove("show");
      return;
    }

    // "Send" — no backend in this project, so simulate success
    successBox?.classList.add("show");
    form.reset();
    updateCount();
    if(typeof DraftStore !== "undefined") DraftStore.clear();
    const note = document.getElementById("draftNote");
    if(note) note.textContent = "";
    fields.forEach(f => form.elements[f].closest(".field").classList.remove("error"));
    successBox?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

document.addEventListener("DOMContentLoaded", initContactForm);
