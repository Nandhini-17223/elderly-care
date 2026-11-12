(function () {
  function qs(sel) {
    return document.querySelector(sel);
  }

  function setMessage(text, type) {
    const el = qs("#login-message");
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.className =
      "book-form-message book-form-message--" + type + " is-visible";
  }

  function safeNext() {
    const params = new URLSearchParams(window.location.search);
    const next = String(params.get("next") || "").trim();
    if (!next) return "index.html";
    if (next.indexOf("://") !== -1 || next.indexOf("..") !== -1) return "index.html";
    if (next.charAt(0) === "/") return "index.html";
    return next;
  }

  document.addEventListener("DOMContentLoaded", async function () {
    try {
      const existing = await AdminAuth.getSessionProfile();
      if (existing.session && AdminAuth.isStaffProfile(existing.profile)) {
        window.location.replace(safeNext());
        return;
      }
    } catch (_err) {
      /* continue to login form */
    }

    const form = qs("#login-form");
    if (!form) return;

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      const email = String(qs("#login-email").value || "").trim();
      const password = String(qs("#login-password").value || "");
      const btn = qs("#login-submit");
      if (!email || !password) {
        setMessage("Enter your email and password.", "error");
        return;
      }

      btn.disabled = true;
      const throttle = AdminAuth.loginThrottleMs();
      setMessage(
        throttle > 0
          ? "Too many attempts. Waiting before retry…"
          : "Signing in…",
        "success"
      );

      try {
        const result = await AdminAuth.signIn(email, password);
        if (!result.ok) {
          setMessage(
            (result.error && result.error.message) ||
              "Sign-in failed. Check your email and password.",
            "error"
          );
          btn.disabled = false;
          return;
        }
        window.location.replace(safeNext());
      } catch (err) {
        setMessage(err.message || "Unable to sign in.", "error");
        btn.disabled = false;
      }
    });
  });
})();
