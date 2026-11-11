function qs(sel, root = document) {
  return root.querySelector(sel);
}

function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

const CONFIG = {
  WHATSAPP_NUMBER: "919999999999",
  SUPPORT_EMAIL: "support@abiselderlycare.com"
};

const FALLBACK_SERVICES = [
  { id: "hospital", title: "Hospital Accompaniment" },
  { id: "shopping", title: "Shopping & Essentials" },
  { id: "bank", title: "Bank / Post Office Visits" },
  { id: "home_support", title: "Home Support & Companionship" }
];

const FALLBACK_CITIES = [
  "Bengaluru",
  "Chennai",
  "Coimbatore",
  "Delhi",
  "Hyderabad",
  "Kochi",
  "Kolkata",
  "Mumbai",
  "Pune"
];

const DRAFT_KEY = "abiec_booking_draft_v1";

function safeTrim(v) {
  return String(v ?? "").trim();
}

function formatDateTime(date, time) {
  const d = safeTrim(date);
  const t = safeTrim(time);
  return d && t ? `${d} ${t}` : d || t || "";
}

function payloadFromForm(form) {
  const fd = new FormData(form);
  const get = (k) => safeTrim(fd.get(k));

  return {
    service: get("service"),
    city: get("city"),
    area: get("area"),
    date: get("date"),
    time: get("time"),
    duration: get("duration"),
    language: get("language"),
    pickup: get("pickup"),
    notes: get("notes"),
    customerName: get("customerName"),
    relation: get("relation"),
    phone: get("phone"),
    email: get("email"),
    elderName: get("elderName"),
    elderAge: get("elderAge"),
    mobility: get("mobility"),
    nonEmergencyAck: fd.get("nonEmergencyAck") === "on"
  };
}

function buildMessage(p) {
  const lines = [];
  lines.push("Abi’s Elderly Care — Booking Request");
  lines.push("");
  lines.push(`Service: ${p.service || "-"}`);
  lines.push(`Location: ${[p.area, p.city].filter(Boolean).join(", ") || "-"}`);
  lines.push(`Date/Time: ${formatDateTime(p.date, p.time) || "-"}`);
  lines.push(`Duration: ${p.duration || "-"}`);
  if (p.language) lines.push(`Preferred language: ${p.language}`);
  if (p.pickup) lines.push(`Pickup location: ${p.pickup}`);
  lines.push("");
  lines.push("Customer contact");
  lines.push(`Name: ${p.customerName || "-"}`);
  if (p.relation) lines.push(`Relation: ${p.relation}`);
  lines.push(`Phone (WhatsApp): ${p.phone || "-"}`);
  lines.push(`Email: ${p.email || "-"}`);
  lines.push("");
  lines.push("Elder (optional)");
  lines.push(`Name: ${p.elderName || "-"}`);
  if (p.elderAge) lines.push(`Age: ${p.elderAge}`);
  if (p.mobility) lines.push(`Mobility notes: ${p.mobility}`);
  lines.push("");
  lines.push("Notes");
  lines.push(p.notes || "-");
  lines.push("");
  lines.push("Non-emergency acknowledgement: Yes");
  lines.push("Reminder: This is not emergency/critical medical care. For emergencies in India, call 112.");
  return lines.join("\n");
}

function openWhatsApp(message) {
  const url = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function openEmail(subject, body) {
  const url = `mailto:${CONFIG.SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = url;
}

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "true");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return Promise.resolve();
}

function setInvalid(el, isInvalid) {
  if (!el) return;
  el.setAttribute("aria-invalid", isInvalid ? "true" : "false");
}

function validate(payload, form) {
  const problems = [];
  const byName = (n) => qs(`[name="${CSS.escape(n)}"]`, form) || qs(`#${CSS.escape(n)}`, form);

  const labels = {
    service: "Service type",
    city: "City",
    area: "Area / locality",
    date: "Date",
    time: "Time",
    duration: "Duration",
    customerName: "Your name",
    phone: "Phone (WhatsApp)",
    email: "Email"
  };

  const requiredText = [
    "service",
    "city",
    "area",
    "date",
    "time",
    "duration",
    "customerName",
    "phone",
    "email"
  ];

  requiredText.forEach((k) => {
    const ok = Boolean(payload[k]);
    setInvalid(byName(k), !ok);
    if (!ok) problems.push(`Please fill in: ${labels[k] || k}`);
  });

  const emailOk = !payload.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email);
  if (!emailOk) {
    setInvalid(byName("email"), true);
    problems.push("Please enter a valid email address.");
  }

  if (!payload.nonEmergencyAck) {
    const el = byName("nonEmergencyAck");
    setInvalid(el, true);
    if (el) el.focus?.();
    problems.push("Please confirm the non-emergency acknowledgement checkbox.");
  } else {
    setInvalid(byName("nonEmergencyAck"), false);
  }

  if (payload.elderAge && !/^\d{1,3}$/.test(payload.elderAge)) {
    setInvalid(byName("elderAge"), true);
    problems.push("Elder age should be a number (optional).");
  } else {
    setInvalid(byName("elderAge"), false);
  }

  return problems;
}

async function loadJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function populateServices(selectEl) {
  let items = FALLBACK_SERVICES;
  try {
    const data = await loadJson("assets/data/services.json");
    if (Array.isArray(data?.categories) && data.categories.length) {
      items = data.categories.map((c) => ({ id: c.id, title: c.title }));
    }
  } catch {
    // When opened as file:// some browsers block fetch; fallback is fine.
  }

  items.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.title;
    opt.textContent = s.title;
    selectEl.appendChild(opt);
  });
}

async function populateCities(selectEl) {
  let cities = FALLBACK_CITIES;
  try {
    const data = await loadJson("assets/data/cities.json");
    if (Array.isArray(data?.cities) && data.cities.length) cities = data.cities;
  } catch {
    // fallback
  }

  cities.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    selectEl.appendChild(opt);
  });
}

function saveDraft(form) {
  const payload = payloadFromForm(form);
  const draft = { ...payload, savedAt: new Date().toISOString() };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function loadDraft(form) {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return;
  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    return;
  }
  if (!d || typeof d !== "object") return;

  const set = (name, value) => {
    const el = qs(`[name="${CSS.escape(name)}"]`, form) || qs(`#${CSS.escape(name)}`, form);
    if (!el) return;
    if (el instanceof HTMLInputElement && el.type === "checkbox") {
      el.checked = Boolean(value);
    } else if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
      if (value) el.value = String(value);
    }
  };

  Object.keys(d).forEach((k) => set(k, d[k]));
}

function clearDraft(form) {
  localStorage.removeItem(DRAFT_KEY);
  form.reset();
}

function debounce(fn, waitMs) {
  let t = null;
  return (...args) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), waitMs);
  };
}

function submitBooking(payload) {
  const message = buildMessage(payload);
  openWhatsApp(message);
}

document.addEventListener("DOMContentLoaded", async () => {
  const form = qs("#bookingForm");
  if (!form) return;

  const serviceSel = qs("#service");
  const citySel = qs("#city");
  const summary = qs("#formErrorSummary");
  const successBox = qs("#successBox");
  const messagePreview = qs("#messagePreview");
  const openWhatsAppBtn = qs("#openWhatsAppBtn");
  const copyBtn = qs("#copyBtn");
  const emailBtn = qs("#emailBtn");
  const clearDraftBtn = qs("#clearDraftBtn");

  if (serviceSel) await populateServices(serviceSel);
  if (citySel) await populateCities(citySel);

  loadDraft(form);

  const latest = {
    payload: null,
    message: ""
  };

  openWhatsAppBtn?.addEventListener("click", () => {
    if (!latest.message) return;
    openWhatsApp(latest.message);
  });

  copyBtn?.addEventListener("click", async () => {
    if (!latest.message) return;
    await copyToClipboard(latest.message);
    copyBtn.textContent = "Copied";
    window.setTimeout(() => (copyBtn.textContent = "Copy message"), 1200);
  });

  emailBtn?.addEventListener("click", () => {
    if (!latest.message) return;
    openEmail("Abi’s Elderly Care — Booking Request", latest.message);
  });

  const debouncedSave = debounce(() => saveDraft(form), 250);
  qsa("input, select, textarea", form).forEach((el) => {
    el.addEventListener("input", debouncedSave);
    el.addEventListener("change", debouncedSave);
  });

  clearDraftBtn?.addEventListener("click", () => {
    clearDraft(form);
    successBox.style.display = "none";
    if (summary) summary.style.display = "none";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = payloadFromForm(form);
    const problems = validate(payload, form);

    if (problems.length) {
      if (summary) {
        summary.style.display = "block";
        summary.textContent =
          problems.length === 1 ? problems[0] : `${problems[0]} (and ${problems.length - 1} more)`;
      }
      successBox.style.display = "none";
      const firstInvalid = qs('[aria-invalid="true"]', form);
      firstInvalid?.focus?.();
      return;
    }

    if (summary) summary.style.display = "none";

    const message = buildMessage(payload);
    latest.payload = payload;
    latest.message = message;
    if (messagePreview) messagePreview.value = message;
    successBox.style.display = "block";
    successBox.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

