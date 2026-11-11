(function () {
  const SUPABASE_URL = "https://vzmhcqhcvflylmobpvap.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6bWhjcWhjdmZseWxtb2JwdmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjQ1MDMsImV4cCI6MjEwODc0MDUwM30.hGkhLLJ9pmtVbfLaGv5PXnkuZIwXZe9pMbVUGBiKOKw";

  function qs(sel) {
    return document.querySelector(sel);
  }

  function getParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      token: String(params.get("token") || "").trim(),
      action: String(params.get("action") || "").trim().toLowerCase(),
    };
  }

  function setMessage(el, text, type) {
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.className =
      "book-form-message book-form-message--" + type + " is-visible";
  }

  function setStatus(title, detail) {
    const titleEl = qs("#respond-title");
    const detailEl = qs("#respond-detail");
    if (titleEl) titleEl.textContent = title;
    if (detailEl) detailEl.textContent = detail;
  }

  document.addEventListener("DOMContentLoaded", function () {
    const params = getParams();
    const confirmBtn = qs("#respond-confirm-btn");
    const messageEl = qs("#respond-message");
    const actionsEl = qs("#respond-actions");

    if (!params.token || (params.action !== "accept" && params.action !== "decline")) {
      setStatus("Invalid link", "This offer link is missing required details.");
      if (confirmBtn) confirmBtn.hidden = true;
      setMessage(messageEl, "Please open the Accept or Decline link from your email.", "error");
      return;
    }

    const isAccept = params.action === "accept";
    setStatus(
      isAccept ? "Confirm acceptance" : "Confirm decline",
      isAccept
        ? "Click below to accept this appointment. Email scanners cannot confirm for you."
        : "Click below to decline this appointment. Email scanners cannot confirm for you."
    );

    if (confirmBtn) {
      confirmBtn.textContent = isAccept ? "Confirm Accept" : "Confirm Decline";
      confirmBtn.addEventListener("click", async function () {
        confirmBtn.disabled = true;
        confirmBtn.setAttribute("aria-busy", "true");
        setMessage(messageEl, "Submitting your response…", "success");

        try {
          const response = await fetch(
            SUPABASE_URL + "/functions/v1/offer-respond",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_ANON_KEY,
                Authorization: "Bearer " + SUPABASE_ANON_KEY,
              },
              body: JSON.stringify({
                token: params.token,
                action: params.action,
              }),
            }
          );

          const payload = await response.json().catch(function () {
            return {};
          });

          const message =
            (payload && payload.message) ||
            (response.ok
              ? isAccept
                ? "This appointment is yours!"
                : "Thanks, noted."
              : "Something went wrong. Please try again.");

          const ok = Boolean(payload && payload.ok);
          setMessage(messageEl, message, ok ? "success" : "error");
          setStatus(ok ? "Response recorded" : "Unable to complete", message);
          if (actionsEl) actionsEl.hidden = true;
        } catch (_err) {
          setMessage(
            messageEl,
            "Network error. Please try again in a moment.",
            "error"
          );
          confirmBtn.disabled = false;
          confirmBtn.removeAttribute("aria-busy");
        }
      });
    }
  });
})();
