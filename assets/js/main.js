function qs(sel, root = document) {
  return root.querySelector(sel);
}

function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

function setCurrentNavLink() {
  const path = (location.pathname || "").split("/").pop() || "index.html";
  qsa('a[data-nav]').forEach((a) => {
    const href = a.getAttribute("href");
    if (!href) return;
    const normalized = href.split("#")[0];
    if (normalized === path) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

function initMobileMenu() {
  const btn = qs('[data-menu-button]');
  const links = qs('[data-navlinks]');
  if (!btn || !links) return;

  const close = () => {
    links.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
  };
  const toggle = () => {
    const next = !links.classList.contains("open");
    links.classList.toggle("open", next);
    btn.setAttribute("aria-expanded", String(next));
  };

  btn.addEventListener("click", toggle);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  document.addEventListener("click", (e) => {
    if (!links.classList.contains("open")) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    const clickedInside = links.contains(t) || btn.contains(t);
    if (!clickedInside) close();
  });
  qsa("a", links).forEach((a) => a.addEventListener("click", close));
}

function initFaqAccordion() {
  const wrap = qs('[data-accordion]');
  if (!wrap) return;
  const items = qsa("details", wrap);
  items.forEach((d) => {
    d.addEventListener("toggle", () => {
      if (!d.open) return;
      items.forEach((other) => {
        if (other !== d) other.open = false;
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setCurrentNavLink();
  initMobileMenu();
  initFaqAccordion();
});

